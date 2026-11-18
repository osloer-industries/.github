#!/usr/bin/env node
/**
 * Wait for SonarCloud pull request analysis on the head commit, then fail when
 * OPEN or CONFIRMED issues remain (Sonar "Sonar way" quality gate ignores counts).
 */

import { fileURLToPath } from "node:url";

export const DEFAULT_SONAR_HOST = "https://sonarcloud.io";

export type FetchLike = typeof fetch;

export interface SonarConfig {
  token: string;
  host: string;
  projectKey: string;
  pullRequestNumber: number;
  headSha: string;
  pollIntervalMs: number;
  deadlineMs: number;
  startedAtMs: number;
  organization: string;
  issuesMinPollsBeforeSettle: number;
  issuesSettlePolls: number;
  postAnalysisGraceMs: number;
}

export interface PullRequestAnalysis {
  key: string;
  analysisDate?: string;
  commit?: { sha?: string };
  status?: { qualityGateStatus?: string };
  branch?: string;
  base?: string;
}

export interface SonarIssue {
  key?: string;
  rule: string;
  severity: string;
  component: string;
  line?: number;
  message: string;
}

interface IssuesSearchPage {
  total: number;
  issues: SonarIssue[];
}

interface CeActivityTask {
  status: string;
  type?: string;
  branch?: string;
  pullRequest?: string;
  componentKey?: string;
  errorMessage?: string;
}

function basicAuthHeader(token: string): string {
  return `Basic ${Buffer.from(`${token}:`, "utf8").toString("base64")}`;
}

export function resolveProjectKey(
  explicit: string | undefined,
  organization: string,
  repositoryName: string,
): string {
  const trimmed = explicit?.trim() ?? "";
  if (trimmed.length > 0) {
    return trimmed;
  }
  return `${organization}_${repositoryName}`;
}

export function parseConfigFromEnv(
  env: NodeJS.ProcessEnv,
  nowMs: number = Date.now(),
): SonarConfig {
  const token = (env.SONAR_TOKEN ?? "").trim();
  if (token.length === 0) {
    console.error(
      "::error::SONAR_TOKEN is required. Add an org or repository Actions secret with a SonarCloud token that can read issues for this project.",
    );
    process.exit(1);
  }

  const eventName = (env.GITHUB_EVENT_NAME ?? "").trim();
  if (eventName !== "pull_request") {
    console.error(
      `::error::SonarCloud zero open issues runs only on pull_request events (got ${JSON.stringify(eventName)}).`,
    );
    process.exit(1);
  }

  const pullRequestNumber = Number(env.PULL_REQUEST_NUMBER ?? "");
  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    console.error(
      "::error::PULL_REQUEST_NUMBER must be a positive integer (set from github.event.pull_request.number).",
    );
    process.exit(1);
  }

  const headSha = (env.HEAD_SHA ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    console.error(
      "::error::HEAD_SHA must be the 40-character pull request head commit (github.event.pull_request.head.sha).",
    );
    process.exit(1);
  }

  const organization = (env.SONAR_ORGANIZATION ?? "osloer-industries").trim();
  const repositoryName = (env.GITHUB_REPOSITORY_NAME ?? "").trim();
  if (repositoryName.length === 0) {
    console.error(
      "::error::GITHUB_REPOSITORY_NAME is required (github.event.repository.name from the caller).",
    );
    process.exit(1);
  }

  const timeoutMinutes = Number(env.SONAR_WAIT_TIMEOUT_MINUTES ?? "20");
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
    console.error("::error::SONAR_WAIT_TIMEOUT_MINUTES must be a positive number.");
    process.exit(1);
  }

  const pollIntervalSeconds = Number(env.SONAR_POLL_INTERVAL_SECONDS ?? "10");
  if (!Number.isFinite(pollIntervalSeconds) || pollIntervalSeconds <= 0) {
    console.error("::error::SONAR_POLL_INTERVAL_SECONDS must be a positive number.");
    process.exit(1);
  }

  const issuesSettlePolls = parseIssueSettlePolls(env);
  const issuesMinPollsBeforeSettle = parseIssueMinPollsBeforeSettle(env);
  const postAnalysisGraceMs = parsePostAnalysisGraceSeconds(env);
  if (issuesMinPollsBeforeSettle < issuesSettlePolls) {
    console.error(
      "::error::SONAR_ISSUES_MIN_POLLS must be at least SONAR_ISSUES_SETTLE_POLLS so the gate cannot pass on the first stable empty snapshot.",
    );
    process.exit(1);
  }

  return {
    token,
    host: (env.SONAR_HOST ?? DEFAULT_SONAR_HOST).replace(/\/$/, ""),
    projectKey: resolveProjectKey(
      env.SONAR_PROJECT_KEY,
      organization,
      repositoryName,
    ),
    pullRequestNumber,
    headSha,
    pollIntervalMs: Math.round(pollIntervalSeconds * 1000),
    startedAtMs: nowMs,
    deadlineMs: nowMs + Math.round(timeoutMinutes * 60 * 1000),
    organization,
    issuesSettlePolls,
    issuesMinPollsBeforeSettle,
    postAnalysisGraceMs,
  };
}

async function sonarGetJson<T>(
  host: string,
  token: string,
  path: string,
  fetchImpl: FetchLike,
): Promise<T> {
  const url = `${host}${path}`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      Authorization: basicAuthHeader(token),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `SonarCloud API ${path} returned HTTP ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`SonarCloud API ${path} returned invalid JSON`);
  }
}

export async function listProjectPullRequests(
  config: Pick<SonarConfig, "host" | "token" | "projectKey">,
  fetchImpl: FetchLike,
): Promise<PullRequestAnalysis[]> {
  const path = `/api/project_pull_requests/list?project=${encodeURIComponent(config.projectKey)}`;
  const data = await sonarGetJson<{ pullRequests?: PullRequestAnalysis[] }>(
    config.host,
    config.token,
    path,
    fetchImpl,
  );
  return Array.isArray(data.pullRequests) ? data.pullRequests : [];
}

export async function fetchCeActivity(
  config: Pick<SonarConfig, "host" | "token" | "projectKey">,
  fetchImpl: FetchLike,
): Promise<CeActivityTask[]> {
  const path =
    `/api/ce/activity?component=${encodeURIComponent(config.projectKey)}` +
    "&type=REPORT&ps=20";
  const data = await sonarGetJson<{ tasks?: CeActivityTask[] }>(
    config.host,
    config.token,
    path,
    fetchImpl,
  );
  return Array.isArray(data.tasks) ? data.tasks : [];
}

export function findPullRequestForKey(
  pullRequests: PullRequestAnalysis[],
  pullRequestNumber: number,
): PullRequestAnalysis | undefined {
  const key = String(pullRequestNumber);
  return pullRequests.find((entry) => entry.key === key);
}

export function analysisMatchesHead(
  pullRequest: PullRequestAnalysis,
  headSha: string,
): boolean {
  const sha = pullRequest.commit?.sha?.trim().toLowerCase() ?? "";
  return sha.length > 0 && sha === headSha.toLowerCase();
}

export function latestFailedCeForPullRequest(
  tasks: CeActivityTask[],
  pullRequestNumber: number,
): CeActivityTask | undefined {
  const key = String(pullRequestNumber);
  for (const task of tasks) {
    if (task.pullRequest !== key) {
      continue;
    }
    const status = (task.status ?? "").toUpperCase();
    if (status === "FAILED" || status === "CANCELED") {
      return task;
    }
  }
  return undefined;
}

export function hasInProgressCeForPullRequest(
  tasks: CeActivityTask[],
  pullRequestNumber: number,
): boolean {
  const key = String(pullRequestNumber);
  for (const task of tasks) {
    if (task.pullRequest !== key) {
      continue;
    }
    const status = (task.status ?? "").toUpperCase();
    if (status === "PENDING" || status === "IN_PROGRESS") {
      return true;
    }
  }
  return false;
}

export function issueSetFingerprint(issues: readonly SonarIssue[]): string {
  return issues
    .map((issue) => issue.key ?? `${issue.rule}:${issue.component}:${issue.line ?? 0}`)
    .toSorted((a, b) => a.localeCompare(b))
    .join("\n");
}

export interface WaitOptions {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export async function waitForPullRequestAnalysis(
  config: SonarConfig,
  fetchImpl: FetchLike,
  options: WaitOptions = {},
): Promise<PullRequestAnalysis> {
  const sleepFn =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const nowFn = options.now ?? (() => Date.now());

  while (nowFn() < config.deadlineMs) {
    const pullRequests = await listProjectPullRequests(config, fetchImpl);
    const entry = findPullRequestForKey(
      pullRequests,
      config.pullRequestNumber,
    );

    const ceTasks = await fetchCeActivity(config, fetchImpl);
    const failed = latestFailedCeForPullRequest(
      ceTasks,
      config.pullRequestNumber,
    );
    if (failed) {
      const detail = failed.errorMessage?.trim() || "no error message";
      throw new Error(
        `SonarCloud compute engine task for pull request ${config.pullRequestNumber} ended with status ${failed.status}: ${detail}`,
      );
    }

    if (entry && analysisMatchesHead(entry, config.headSha)) {
      if (hasInProgressCeForPullRequest(ceTasks, config.pullRequestNumber)) {
        console.log(
          `SonarCloud PR #${config.pullRequestNumber} head commit is registered but compute engine is still running; waiting for issue indexing.`,
        );
      } else {
        console.log(
          `SonarCloud PR #${config.pullRequestNumber} analysis is ready for commit ${config.headSha} (analysisDate=${entry.analysisDate ?? "unknown"}).`,
        );
        return entry;
      }
    }

    if (entry) {
      const seenSha = entry.commit?.sha ?? "(none)";
      console.log(
        `Waiting for SonarCloud to finish analysing head ${config.headSha}; latest PR analysis commit is ${seenSha}.`,
      );
    } else {
      console.log(
        `Waiting for SonarCloud to register pull request ${config.pullRequestNumber} on project ${config.projectKey}.`,
      );
    }

    await sleepFn(config.pollIntervalMs);
  }

  const waitedMinutes = Math.max(
    1,
    Math.round((config.deadlineMs - config.startedAtMs) / 60000),
  );
  throw new Error(
    `Timed out after ${waitedMinutes} minute(s) waiting for SonarCloud analysis of PR #${config.pullRequestNumber} at commit ${config.headSha}. Ensure SonarCloud analyses pull requests for this repository (CI scanner and/or automatic analysis).`,
  );
}

export function stripComponentPath(
  projectKey: string,
  component: string,
): string {
  const prefix = `${projectKey}:`;
  if (component.startsWith(prefix)) {
    return component.slice(prefix.length);
  }
  return component;
}

export function sonarIssuesPageUrl(
  host: string,
  projectKey: string,
  pullRequestNumber: number,
): string {
  return (
    `${host}/project/issues?id=${encodeURIComponent(projectKey)}` +
    `&pullRequest=${encodeURIComponent(String(pullRequestNumber))}`
  );
}

export function issuesSearchPath(
  config: Pick<
    SonarConfig,
    "host" | "projectKey" | "pullRequestNumber" | "organization"
  >,
  page: number,
  pageSize: number,
): string {
  return (
    `/api/issues/search?organization=${encodeURIComponent(config.organization)}` +
    `&componentKeys=${encodeURIComponent(config.projectKey)}` +
    `&pullRequest=${encodeURIComponent(String(config.pullRequestNumber))}` +
    "&issueStatuses=OPEN,CONFIRMED" +
    "&resolved=false" +
    `&ps=${pageSize}&p=${page}`
  );
}

export function parseAnalysisDateMs(analysisDate?: string): number | null {
  const trimmed = analysisDate?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  const millis = Date.parse(trimmed);
  if (!Number.isFinite(millis)) {
    return null;
  }
  return millis;
}

export function resolveEarliestIssueSettleMs(
  analysisDate: string | undefined,
  graceMs: number,
  startedAtMs: number,
): number {
  const parsed = parseAnalysisDateMs(analysisDate);
  const baseMs = parsed ?? startedAtMs;
  return baseMs + graceMs;
}

export async function fetchOpenIssues(
  config: Pick<
    SonarConfig,
    "host" | "token" | "projectKey" | "pullRequestNumber" | "organization"
  >,
  fetchImpl: FetchLike,
): Promise<SonarIssue[]> {
  const pageSize = 500;
  const collected: SonarIssue[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (collected.length < total) {
    const path = issuesSearchPath(config, page, pageSize);
    const data = await sonarGetJson<IssuesSearchPage & { paging?: { total?: number } }>(
      config.host,
      config.token,
      path,
      fetchImpl,
    );
    total = Number(data.total ?? data.paging?.total ?? 0);
    const issues = Array.isArray(data.issues) ? data.issues : [];
    collected.push(...issues);
    if (issues.length === 0 || collected.length >= total) {
      break;
    }
    page += 1;
  }

  return collected;
}

const DEFAULT_ISSUE_SETTLE_POLLS = 3;
const DEFAULT_ISSUE_MIN_POLLS = 3;
const DEFAULT_POST_ANALYSIS_GRACE_SECONDS = 45;

function parseIssueSettlePolls(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.SONAR_ISSUES_SETTLE_POLLS ?? String(DEFAULT_ISSUE_SETTLE_POLLS));
  if (!Number.isInteger(raw) || raw < 1) {
    console.error(
      `::error::SONAR_ISSUES_SETTLE_POLLS must be a positive integer (got ${JSON.stringify(env.SONAR_ISSUES_SETTLE_POLLS)}).`,
    );
    process.exit(1);
  }
  return raw;
}

function parsePostAnalysisGraceSeconds(env: NodeJS.ProcessEnv): number {
  const raw = Number(
    env.SONAR_POST_ANALYSIS_GRACE_SECONDS ?? String(DEFAULT_POST_ANALYSIS_GRACE_SECONDS),
  );
  if (!Number.isFinite(raw) || raw < 0) {
    console.error(
      `::error::SONAR_POST_ANALYSIS_GRACE_SECONDS must be a non-negative number (got ${JSON.stringify(env.SONAR_POST_ANALYSIS_GRACE_SECONDS)}).`,
    );
    process.exit(1);
  }
  return Math.round(raw * 1000);
}

function parseIssueMinPollsBeforeSettle(env: NodeJS.ProcessEnv): number {
  const raw = Number(env.SONAR_ISSUES_MIN_POLLS ?? String(DEFAULT_ISSUE_MIN_POLLS));
  if (!Number.isInteger(raw) || raw < 1) {
    console.error(
      `::error::SONAR_ISSUES_MIN_POLLS must be a positive integer (got ${JSON.stringify(env.SONAR_ISSUES_MIN_POLLS)}).`,
    );
    process.exit(1);
  }
  return raw;
}

interface IssueSettleState {
  stableReads: number;
  lastFingerprint: string;
  pollsCompleted: number;
}

export async function fetchOpenIssuesWhenSettled(
  config: SonarConfig,
  fetchImpl: FetchLike,
  options: WaitOptions & {
    settlePolls?: number;
    minPollsBeforeSettle?: number;
    earliestSettleMs?: number;
  } = {},
): Promise<SonarIssue[]> {
  const sleepFn =
    options.sleep ??
    ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const nowFn = options.now ?? (() => Date.now());
  const settlePolls = options.settlePolls ?? config.issuesSettlePolls;
  const minPollsBeforeSettle =
    options.minPollsBeforeSettle ?? config.issuesMinPollsBeforeSettle;
  const earliestSettleMs = options.earliestSettleMs ?? config.startedAtMs;

  while (nowFn() < earliestSettleMs) {
    if (nowFn() >= config.deadlineMs) {
      throw new Error(
        `Timed out waiting for SonarCloud post-analysis grace on PR #${config.pullRequestNumber}.`,
      );
    }
    await sleepFn(config.pollIntervalMs);
  }

  const pollOnce = async (
    state: IssueSettleState,
  ): Promise<SonarIssue[]> => {
    if (nowFn() >= config.deadlineMs) {
      throw new Error(
        `Timed out waiting for SonarCloud open-issue index to stabilise on PR #${config.pullRequestNumber}.`,
      );
    }

    const issues = await fetchOpenIssues(config, fetchImpl);
    const pollsCompleted = state.pollsCompleted + 1;
    const fingerprint = issueSetFingerprint(issues);

    if (fingerprint === state.lastFingerprint) {
      const stableReads = state.stableReads + 1;
      if (stableReads >= settlePolls && pollsCompleted >= minPollsBeforeSettle) {
        console.log(
          `SonarCloud open-issue list stable across ${settlePolls} poll(s) after ${pollsCompleted} poll(s) (${issues.length} issue(s)).`,
        );
        return issues;
      }
      await sleepFn(config.pollIntervalMs);
      return pollOnce({
        stableReads,
        lastFingerprint: state.lastFingerprint,
        pollsCompleted,
      });
    }

    console.log(
      `SonarCloud open-issue count changed (${issues.length}); waiting for issue index to settle.`,
    );
    await sleepFn(config.pollIntervalMs);
    return pollOnce({
      stableReads: 1,
      lastFingerprint: fingerprint,
      pollsCompleted,
    });
  };

  return pollOnce({
    stableReads: 0,
    lastFingerprint: "",
    pollsCompleted: 0,
  });
}

export function printIssues(
  config: SonarConfig,
  issues: SonarIssue[],
): void {
  const pageUrl = sonarIssuesPageUrl(
    config.host,
    config.projectKey,
    config.pullRequestNumber,
  );
  console.error(`::error::SonarCloud reports ${issues.length} open issue(s) on this pull request.`);
  console.error(`Issues in SonarCloud: ${pageUrl}`);
  for (const issue of issues) {
    const file = stripComponentPath(config.projectKey, issue.component ?? "");
    const line = issue.line ?? "?";
    const rule = issue.rule ?? "unknown-rule";
    const severity = issue.severity ?? "UNKNOWN";
    const message = (issue.message ?? "").replace(/\s+/g, " ").trim();
    console.error(`  [${severity}] ${rule} — ${file}:${line} — ${message}`);
  }
}

export interface RunSonarZeroIssuesGateOptions extends WaitOptions {
  settlePolls?: number;
  minPollsBeforeSettle?: number;
}

export async function runSonarZeroIssuesGate(
  config: SonarConfig,
  fetchImpl: FetchLike = fetch,
  waitOptions: RunSonarZeroIssuesGateOptions = {},
): Promise<number> {
  const analysis = await waitForPullRequestAnalysis(config, fetchImpl, waitOptions);
  const earliestSettleMs = resolveEarliestIssueSettleMs(
    analysis.analysisDate,
    config.postAnalysisGraceMs,
    config.startedAtMs,
  );
  const issues = await fetchOpenIssuesWhenSettled(config, fetchImpl, {
    ...waitOptions,
    earliestSettleMs,
  });
  if (issues.length === 0) {
    console.log(
      `SonarCloud zero open issues: no OPEN or CONFIRMED issues on PR #${config.pullRequestNumber}.`,
    );
    return 0;
  }
  printIssues(config, issues);
  return 1;
}

async function main(): Promise<number> {
  const config = parseConfigFromEnv(process.env);
  return runSonarZeroIssuesGate(config);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`::error::${message}`);
      process.exit(1);
    });
}
