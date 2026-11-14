#!/usr/bin/env node
/**
 * Approve and enable auto-merge for low-risk pull requests (Dependabot patch/minor
 * and Release Please release PRs). Ineligible PRs exit 0 with a log line (fail closed).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  RELEASE_BOT_LOGIN,
  dependabotUpdateEligible,
  isDependabotAuthor,
  isReleaseBotAuthor,
  releaseHeadRefEligible,
  releasePrFilesEligible,
  type PullRequestFileLike,
} from "./auto-merge-eligibility.ts";
import {
  RELEASE_MAJOR_HOLD_LABEL,
  evaluateReleaseVersionGate,
} from "./release-please-version-gate.ts";

export interface AutoMergeEnv {
  allowDependabot: boolean;
  allowReleasePrs: boolean;
  authorLogin: string;
  headRef: string;
  mergeMethod: string;
  prNumber: number;
  repository: string;
  dependabotUpdateType: string;
  dependabotDependencyGroup: string;
  prBody: string;
  token: string;
}

const MERGE_METHODS = new Set(["squash", "merge", "rebase"]);

function parseBool(value: string | undefined, name: string): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "true") {
    return true;
  }
  if (v === "false") {
    return false;
  }
  console.error(`::error::${name} must be true or false (got ${JSON.stringify(value)})`);
  process.exit(1);
}

export function parseEnv(env: NodeJS.ProcessEnv): AutoMergeEnv {
  const token = (env.GITHUB_APP_TOKEN ?? "").trim();
  if (token.length === 0) {
    console.error("::error::GITHUB_APP_TOKEN is required.");
    process.exit(1);
  }

  const prNumber = Number(env.PULL_REQUEST_NUMBER ?? "");
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    console.error("::error::PULL_REQUEST_NUMBER must be a positive integer.");
    process.exit(1);
  }

  const repository = (env.GITHUB_REPOSITORY ?? "").trim();
  if (!repository.includes("/")) {
    console.error("::error::GITHUB_REPOSITORY must be owner/name.");
    process.exit(1);
  }

  const mergeMethod = (env.MERGE_METHOD ?? "squash").trim().toLowerCase();
  if (!MERGE_METHODS.has(mergeMethod)) {
    console.error(
      `::error::MERGE_METHOD must be squash, merge, or rebase (got ${JSON.stringify(mergeMethod)}).`,
    );
    process.exit(1);
  }

  return {
    allowDependabot: parseBool(env.ALLOW_DEPENDABOT, "ALLOW_DEPENDABOT"),
    allowReleasePrs: parseBool(env.ALLOW_RELEASE_PRS, "ALLOW_RELEASE_PRS"),
    authorLogin: (env.PR_AUTHOR_LOGIN ?? "").trim(),
    headRef: (env.PR_HEAD_REF ?? "").trim(),
    mergeMethod,
    prNumber,
    repository,
    dependabotUpdateType: (env.DEPENDABOT_UPDATE_TYPE ?? "").trim(),
    dependabotDependencyGroup: (env.DEPENDABOT_DEPENDENCY_GROUP ?? "").trim(),
    prBody: env.PR_BODY ?? "",
    token,
  };
}

export type EligibilityReason =
  | { eligible: true; kind: "dependabot" | "release" }
  | { eligible: false; reason: string };

export function evaluateEligibility(cfg: AutoMergeEnv): EligibilityReason {
  if (cfg.allowDependabot && isDependabotAuthor(cfg.authorLogin)) {
    if (!dependabotUpdateEligible(cfg.dependabotUpdateType, cfg.dependabotDependencyGroup)) {
      return {
        eligible: false,
        reason: `Dependabot PR update type ${JSON.stringify(cfg.dependabotUpdateType)} is not patch/minor auto-merge eligible.`,
      };
    }
    return { eligible: true, kind: "dependabot" };
  }

  if (cfg.allowReleasePrs && isReleaseBotAuthor(cfg.authorLogin)) {
    if (!releaseHeadRefEligible(cfg.headRef)) {
      return {
        eligible: false,
        reason: `Release bot PR head ref ${JSON.stringify(cfg.headRef)} does not start with release-please--.`,
      };
    }
    return { eligible: true, kind: "release" };
  }

  return {
    eligible: false,
    reason: `Pull request author ${JSON.stringify(cfg.authorLogin)} is not an auto-merge candidate.`,
  };
}

export function gh(
  args: string[],
  token: string,
  repository: string,
): { ok: boolean; stdout: string; stderr: string; status: number } {
  const env = {
    ...process.env,
    GH_TOKEN: token,
    GITHUB_REPOSITORY: repository,
  };
  const result = spawnSync("gh", args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    status: result.status ?? 1,
  };
}

export function fetchPullRequestFiles(cfg: AutoMergeEnv): PullRequestFileLike[] {
  const result = gh(
    ["api", `repos/${cfg.repository}/pulls/${cfg.prNumber}/files`, "--paginate"],
    cfg.token,
    cfg.repository,
  );
  if (!result.ok) {
    console.error(`::error::Failed to list pull request files: ${result.stderr.trim()}`);
    process.exit(1);
  }
  try {
    const parsed = JSON.parse(result.stdout) as PullRequestFileLike[];
    if (!Array.isArray(parsed)) {
      throw new Error("expected array");
    }
    return parsed;
  } catch {
    console.error("::error::Failed to parse pull request files JSON from gh api.");
    process.exit(1);
  }
}

interface PullRequestReviewLike {
  state?: string;
  user?: { login?: string };
}

export function reviewerAlreadyApproved(
  cfg: AutoMergeEnv,
  botLogin: string = RELEASE_BOT_LOGIN,
): boolean {
  const result = gh(
    ["api", `repos/${cfg.repository}/pulls/${cfg.prNumber}/reviews`, "--paginate"],
    cfg.token,
    cfg.repository,
  );
  if (!result.ok) {
    console.error(`::error::Failed to list pull request reviews: ${result.stderr.trim()}`);
    process.exit(1);
  }
  let reviews: PullRequestReviewLike[];
  try {
    reviews = JSON.parse(result.stdout) as PullRequestReviewLike[];
  } catch {
    console.error("::error::Failed to parse pull request reviews JSON from gh api.");
    process.exit(1);
  }
  return reviews.some(
    (review) =>
      review.state === "APPROVED" &&
      (review.user?.login ?? "").toLowerCase() === botLogin.toLowerCase(),
  );
}

function approvePullRequest(cfg: AutoMergeEnv): void {
  const result = gh(
    ["pr", "review", String(cfg.prNumber), "--approve", "--body", "Auto-approved for low-risk merge."],
    cfg.token,
    cfg.repository,
  );
  if (!result.ok) {
    console.error(`::error::Failed to approve pull request: ${result.stderr.trim()}`);
    process.exit(1);
  }
  console.log(`Approved pull request #${cfg.prNumber}.`);
}

function pullRequestHasLabel(cfg: AutoMergeEnv, label: string): boolean {
  const result = gh(
    [
      "api",
      `repos/${cfg.repository}/issues/${cfg.prNumber}/labels`,
      "--paginate",
      "-q",
      ".[].name",
    ],
    cfg.token,
    cfg.repository,
  );
  if (!result.ok) {
    console.error(`::error::Failed to list pull request labels: ${result.stderr.trim()}`);
    process.exit(1);
  }
  const names = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return names.includes(label);
}

function ensureMajorHoldLabel(cfg: AutoMergeEnv, reason: string): void {
  if (pullRequestHasLabel(cfg, RELEASE_MAJOR_HOLD_LABEL)) {
    console.log(`Pull request already has label ${RELEASE_MAJOR_HOLD_LABEL}.`);
    return;
  }
  const result = gh(
    [
      "api",
      "--method",
      "POST",
      `repos/${cfg.repository}/issues/${cfg.prNumber}/labels`,
      "-f",
      `labels[]=${RELEASE_MAJOR_HOLD_LABEL}`,
    ],
    cfg.token,
    cfg.repository,
  );
  if (!result.ok) {
    const comment = gh(
      [
        "pr",
        "comment",
        String(cfg.prNumber),
        "--body",
        `Auto-merge withheld (${RELEASE_MAJOR_HOLD_LABEL}): ${reason}`,
      ],
      cfg.token,
      cfg.repository,
    );
    if (!comment.ok) {
      console.error(`::error::Failed to apply ${RELEASE_MAJOR_HOLD_LABEL} or comment: ${result.stderr.trim()}`);
      process.exit(1);
    }
    console.log(`Posted major-hold comment on pull request #${cfg.prNumber}.`);
    return;
  }
  console.log(`Applied label ${RELEASE_MAJOR_HOLD_LABEL} to pull request #${cfg.prNumber}.`);
}

function enableAutoMerge(cfg: AutoMergeEnv): void {
  const args = ["pr", "merge", String(cfg.prNumber), "--auto", `--${cfg.mergeMethod}`];
  const result = gh(args, cfg.token, cfg.repository);
  if (!result.ok) {
    console.error(`::error::Failed to enable auto-merge: ${result.stderr.trim()}`);
    process.exit(1);
  }
  console.log(`Enabled auto-merge for pull request #${cfg.prNumber} (${cfg.mergeMethod}).`);
}

export function runAutoMerge(cfg: AutoMergeEnv): void {
  const decision = evaluateEligibility(cfg);
  if (!decision.eligible) {
    console.log(`Skipping auto-merge: ${decision.reason}`);
    return;
  }

  if (decision.kind === "release") {
    const files = fetchPullRequestFiles(cfg);
    if (!releasePrFilesEligible(files)) {
      console.log("Skipping auto-merge: release PR changed files are outside the allowlist or version-only contract.");
      return;
    }
    const versionGate = evaluateReleaseVersionGate(files, cfg.prBody);
    if (!versionGate.autoMerge) {
      const logReason = `Skipping auto-merge: ${versionGate.reason}.`;
      console.log(logReason);
      if ("majorHold" in versionGate && versionGate.majorHold) {
        ensureMajorHoldLabel(cfg, versionGate.reason);
      }
      return;
    }
  }

  if (!reviewerAlreadyApproved(cfg)) {
    approvePullRequest(cfg);
  } else {
    console.log("Pull request already approved by the release app; skipping review.");
  }

  enableAutoMerge(cfg);
}

function main(): void {
  const cfg = parseEnv(process.env);
  runAutoMerge(cfg);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}