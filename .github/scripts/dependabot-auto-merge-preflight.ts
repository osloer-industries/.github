#!/usr/bin/env node
/**
 * Avoid dependabot/fetch-metadata failures on ineligible Dependabot pull requests
 * (mixed commit authors, tampered branches). Exits 0 with GitHub Actions outputs when
 * metadata should not be fetched; exits 1 on genuine API failures.
 */
import { appendFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEPENDABOT_LOGIN } from "./auto-merge-eligibility.ts";

const GH_BIN_CANDIDATES = ["/usr/bin/gh", "/bin/gh"] as const;

export interface PullRequestCommitLike {
  commit?: { message?: string };
  author?: { login?: string | null };
}

function resolveGhBinary(): string {
  for (const candidate of GH_BIN_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  console.error(
    "::error::gh CLI not found at /usr/bin/gh or /bin/gh; install GitHub CLI on the runner.",
  );
  process.exit(1);
}

function ghApi(
  path: string,
  token: string,
  repository: string,
): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(
    resolveGhBinary(),
    ["api", path, "--paginate"],
    {
      encoding: "utf8",
      env: { ...process.env, GH_TOKEN: token, GITHUB_REPOSITORY: repository },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function dependabotCommitsTrustworthy(
  commits: PullRequestCommitLike[],
): { proceed: true } | { proceed: false; reason: string } {
  if (commits.length === 0) {
    return { proceed: false, reason: "Dependabot pull request has no commits." };
  }
  for (const commit of commits) {
    const login = (commit.author?.login ?? "").trim();
    if (login.length === 0) {
      return {
        proceed: false,
        reason: "Dependabot pull request includes a commit with no GitHub author login.",
      };
    }
    if (login.toLowerCase() !== DEPENDABOT_LOGIN.toLowerCase()) {
      return {
        proceed: false,
        reason: `Dependabot pull request includes commits from ${JSON.stringify(login)}; skipping auto-merge metadata fetch.`,
      };
    }
  }
  return { proceed: true };
}

const UPDATE_TYPE_PREFIX = "version-update:semver-";
const DEPENDENCY_GROUP_PREFIX = "dependency-group:";

export type DependabotSemverLevel = "patch" | "minor" | "major";

export function semverLevelsInMessage(message: string): Set<DependabotSemverLevel> {
  const levels = new Set<DependabotSemverLevel>();
  for (const line of message.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(UPDATE_TYPE_PREFIX)) {
      continue;
    }
    const level = trimmed.slice(UPDATE_TYPE_PREFIX.length).trim().toLowerCase();
    if (level === "patch" || level === "minor" || level === "major") {
      levels.add(level);
    }
  }
  return levels;
}

export function semverLevelsInPullRequest(
  commits: PullRequestCommitLike[],
): Set<DependabotSemverLevel> {
  const levels = new Set<DependabotSemverLevel>();
  for (const commit of commits) {
    const message = commit.commit?.message ?? "";
    for (const level of semverLevelsInMessage(message)) {
      levels.add(level);
    }
  }
  return levels;
}

function dominantUpdateType(levels: Set<DependabotSemverLevel>): string {
  if (levels.has("major")) {
    return "version-update:semver-major";
  }
  if (levels.has("minor")) {
    return "version-update:semver-minor";
  }
  if (levels.has("patch")) {
    return "version-update:semver-patch";
  }
  return "";
}

function dependabotMetadataFromLine(line: string): {
  updateType: string;
  dependencyGroup: string;
} {
  const trimmed = line.trim();
  if (trimmed.startsWith(UPDATE_TYPE_PREFIX)) {
    const level = trimmed.slice(UPDATE_TYPE_PREFIX.length).trim().toLowerCase();
    if (level === "patch" || level === "minor" || level === "major") {
      return { updateType: trimmed, dependencyGroup: "" };
    }
  }
  if (trimmed.startsWith(DEPENDENCY_GROUP_PREFIX)) {
    const group = trimmed.slice(DEPENDENCY_GROUP_PREFIX.length).trim();
    if (group.length > 0) {
      return { updateType: "", dependencyGroup: group };
    }
  }
  return { updateType: "", dependencyGroup: "" };
}

export function parseDependabotCommitMetadata(message: string): {
  updateType: string;
  dependencyGroup: string;
} {
  let updateType = "";
  let dependencyGroup = "";
  for (const line of message.split("\n")) {
    const parsed = dependabotMetadataFromLine(line);
    if (parsed.updateType.length > 0) {
      updateType = parsed.updateType;
    }
    if (parsed.dependencyGroup.length > 0) {
      dependencyGroup = parsed.dependencyGroup;
    }
  }
  return { updateType, dependencyGroup };
}

export function assessDependabotPullRequest(
  commits: PullRequestCommitLike[],
): {
  proceed: boolean;
  reason: string;
  updateType: string;
  dependencyGroup: string;
} {
  const trust = dependabotCommitsTrustworthy(commits);
  if (!trust.proceed) {
    return {
      proceed: false,
      reason: trust.reason,
      updateType: "",
      dependencyGroup: "",
    };
  }
  const levels = semverLevelsInPullRequest(commits);
  if (levels.has("major")) {
    return {
      proceed: true,
      reason: "",
      updateType: "version-update:semver-major",
      dependencyGroup: parseDependabotCommitMetadata(
        commits.at(-1)?.commit?.message ?? "",
      ).dependencyGroup,
    };
  }

  const newest = commits.at(-1)?.commit?.message ?? "";
  const metadata = parseDependabotCommitMetadata(newest);
  const updateType =
    metadata.updateType.length > 0 ? metadata.updateType : dominantUpdateType(levels);
  return {
    proceed: true,
    reason: "",
    updateType,
    dependencyGroup: metadata.dependencyGroup,
  };
}

function writeOutput(name: string, value: string): void {
  const outputPath = (process.env.GITHUB_OUTPUT ?? "").trim();
  if (outputPath.length === 0) {
    return;
  }
  const escaped = value.replaceAll("\n", "%0A");
  appendFileSync(outputPath, `${name}=${escaped}\n`, "utf8");
}

function main(): void {
  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  const repository = (process.env.GITHUB_REPOSITORY ?? "").trim();
  const prNumber = Number(process.env.PULL_REQUEST_NUMBER ?? "");
  if (token.length === 0) {
    console.error("::error::GITHUB_TOKEN is required.");
    process.exit(1);
  }
  if (!repository.includes("/") || !Number.isInteger(prNumber) || prNumber <= 0) {
    console.error("::error::GITHUB_REPOSITORY and PULL_REQUEST_NUMBER are required.");
    process.exit(1);
  }

  const result = ghApi(
    `repos/${repository}/pulls/${prNumber}/commits`,
    token,
    repository,
  );
  if (!result.ok) {
    console.error(`::error::Failed to list pull request commits: ${result.stderr.trim()}`);
    process.exit(1);
  }

  let commits: PullRequestCommitLike[];
  try {
    commits = JSON.parse(result.stdout) as PullRequestCommitLike[];
    if (!Array.isArray(commits)) {
      throw new TypeError("expected array");
    }
  } catch {
    console.error("::error::Failed to parse pull request commits JSON from gh api.");
    process.exit(1);
  }

  const decision = assessDependabotPullRequest(commits);
  writeOutput("proceed", decision.proceed ? "true" : "false");
  writeOutput("skip-reason", decision.reason);
  writeOutput("update-type", decision.updateType);
  writeOutput("dependency-group", decision.dependencyGroup);

  if (!decision.proceed) {
    console.log(`Skipping Dependabot metadata fetch: ${decision.reason}`);
    return;
  }
  if (decision.updateType.length === 0) {
    console.log(
      "Dependabot commit metadata did not include a semver update type; eligibility check will decide.",
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}