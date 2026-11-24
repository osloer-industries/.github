#!/usr/bin/env node
/**
 * Fail closed unless every entry in the GitHub Actions `needs` context is result success.
 * Selective `skipped` results are allowed for event-scoped jobs, workflow-only gates, docs-only CI, and CodeQL off PRs.
 */

import { fileURLToPath } from "node:url";

export const ALLOWED_NEEDS_RESULTS = new Set(["success"]);

/** Default caller `needs` job id for SonarCloud zero-open-issues (override via SONAR_ZERO_ISSUES_JOB). */
export const DEFAULT_SONAR_ZERO_ISSUES_JOB_ID = "sonar-zero-open-issues";
export const DEFAULT_SONAR_ANALYZE_JOB_ID = "sonar-analyze";
export const DEFAULT_CODEQL_JOB_ID = "codeql";
export const DEFAULT_WORKFLOW_SECURITY_JOB_ID = "workflow-security";
export const DEFAULT_CI_PATHS_SCOPE_JOB_ID = "ci-paths-scope";
export const DEFAULT_CI_PASSED_JOB_ID = "ci-passed";

export interface NeedsJobEntry {
  result: string;
  outputs?: Record<string, string>;
}

export type NeedsMap = Record<string, NeedsJobEntry>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseNeedsEntry(value: unknown): NeedsJobEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const result = value["result"];
  if (typeof result !== "string") {
    return null;
  }
  const outputs = value["outputs"];
  if (outputs === undefined) {
    return { result };
  }
  if (!isRecord(outputs)) {
    return null;
  }
  const mapped: Record<string, string> = {};
  for (const [key, outputValue] of Object.entries(outputs)) {
    if (typeof outputValue !== "string") {
      return null;
    }
    mapped[key] = outputValue;
  }
  return { result, outputs: mapped };
}

export function parseSingleJobIdEnv(
  raw: string | undefined,
  defaultId: string,
  envName: string,
): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length === 0) {
    return defaultId;
  }
  if (trimmed.includes(",")) {
    throw new Error(`${envName} must be a single job id (commas are not allowed)`);
  }
  return trimmed;
}

/** @deprecated alias for Sonar job parsing */
export function parseSonarZeroIssuesJobId(raw: string | undefined): string {
  return parseSingleJobIdEnv(raw, DEFAULT_SONAR_ZERO_ISSUES_JOB_ID, "SONAR_ZERO_ISSUES_JOB");
}

export function parseNeedsJson(raw: string): NeedsMap {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("NEEDS_JSON is empty");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("NEEDS_JSON is not valid JSON");
  }
  if (!isRecord(parsed)) {
    throw new Error("NEEDS_JSON must be a JSON object");
  }
  const needs: NeedsMap = {};
  for (const [jobId, entryValue] of Object.entries(parsed)) {
    const entry = parseNeedsEntry(entryValue);
    if (entry === null) {
      throw new Error(`NEEDS_JSON entry for ${jobId} is invalid`);
    }
    needs[jobId] = entry;
  }
  return needs;
}

export function isDocsOnlyCiScope(needs: NeedsMap, ciPathsScopeJobId: string): boolean {
  const entry = needs[ciPathsScopeJobId];
  if (entry?.result !== "success") {
    return false;
  }
  return entry.outputs?.["run-full-ci"] === "false";
}

export function isWorkflowOnlyCiScope(needs: NeedsMap, ciPathsScopeJobId: string): boolean {
  const entry = needs[ciPathsScopeJobId];
  if (entry?.result !== "success") {
    return false;
  }
  return (
    entry.outputs?.["workflows-changed"] === "true" &&
    entry.outputs?.["product-code-changed"] === "false"
  );
}

function skippedAllowedForSonarJob(
  jobId: string,
  eventName: string | undefined,
  sonarZeroIssuesJobId: string,
): boolean {
  if (jobId !== sonarZeroIssuesJobId) {
    return false;
  }
  if (eventName === "pull_request") {
    return false;
  }
  return eventName !== undefined && eventName.length > 0;
}

function skippedAllowedForCodeqlJob(
  jobId: string,
  eventName: string | undefined,
  codeqlJobId: string,
  needs: NeedsMap,
  ciPathsScopeJobId: string,
): boolean {
  if (jobId !== codeqlJobId) {
    return false;
  }
  if (eventName === "pull_request") {
    const entry = needs[ciPathsScopeJobId];
    if (entry?.result === "success" && entry.outputs?.["run-codeql"] === "false") {
      return true;
    }
    return false;
  }
  if (isDocsOnlyCiScope(needs, ciPathsScopeJobId)) {
    return true;
  }
  return false;
}

function skippedAllowedForWorkflowSecurityJob(
  jobId: string,
  workflowSecurityJobId: string,
): boolean {
  return jobId === workflowSecurityJobId;
}

function skippedAllowedForWorkflowOnlySonarJobs(
  jobId: string,
  eventName: string | undefined,
  needs: NeedsMap,
  ciPathsScopeJobId: string,
  sonarZeroIssuesJobId: string,
): boolean {
  if (eventName !== "pull_request") {
    return false;
  }
  if (!isWorkflowOnlyCiScope(needs, ciPathsScopeJobId)) {
    return false;
  }
  return jobId === sonarZeroIssuesJobId || jobId === DEFAULT_SONAR_ANALYZE_JOB_ID;
}

function skippedAllowedForDocsOnlyExemptions(
  jobId: string,
  needs: NeedsMap,
  ciPathsScopeJobId: string,
  ciPassedJobId: string,
): boolean {
  if (!isDocsOnlyCiScope(needs, ciPathsScopeJobId)) {
    return false;
  }
  if (jobId === ciPathsScopeJobId || jobId === ciPassedJobId) {
    return false;
  }
  return true;
}

interface SkippedResultContext {
  jobId: string;
  needs: NeedsMap;
  eventName: string | undefined;
  jobIds: CiPassedGateJobIds;
}

function skippedResultAllowed(context: SkippedResultContext): boolean {
  const { jobId, needs, eventName, jobIds } = context;
  return (
    skippedAllowedForSonarJob(jobId, eventName, jobIds.sonarZeroIssuesJobId) ||
    skippedAllowedForCodeqlJob(jobId, eventName, jobIds.codeqlJobId, needs, jobIds.ciPathsScopeJobId) ||
    skippedAllowedForWorkflowSecurityJob(jobId, jobIds.workflowSecurityJobId) ||
    skippedAllowedForWorkflowOnlySonarJobs(
      jobId,
      eventName,
      needs,
      jobIds.ciPathsScopeJobId,
      jobIds.sonarZeroIssuesJobId,
    ) ||
    skippedAllowedForDocsOnlyExemptions(
      jobId,
      needs,
      jobIds.ciPathsScopeJobId,
      jobIds.ciPassedJobId,
    )
  );
}

export interface CiPassedGateJobIds {
  sonarZeroIssuesJobId: string;
  codeqlJobId: string;
  workflowSecurityJobId: string;
  ciPathsScopeJobId: string;
  ciPassedJobId: string;
}

export function parseCiPassedGateJobIds(env: {
  sonarZeroIssuesJob?: string;
  codeqlJob?: string;
  workflowSecurityJob?: string;
  ciPathsScopeJob?: string;
  ciPassedJob?: string;
}): CiPassedGateJobIds {
  return {
    sonarZeroIssuesJobId: parseSingleJobIdEnv(
      env.sonarZeroIssuesJob,
      DEFAULT_SONAR_ZERO_ISSUES_JOB_ID,
      "SONAR_ZERO_ISSUES_JOB",
    ),
    codeqlJobId: parseSingleJobIdEnv(env.codeqlJob, DEFAULT_CODEQL_JOB_ID, "CODEQL_JOB"),
    workflowSecurityJobId: parseSingleJobIdEnv(
      env.workflowSecurityJob,
      DEFAULT_WORKFLOW_SECURITY_JOB_ID,
      "WORKFLOW_SECURITY_JOB",
    ),
    ciPathsScopeJobId: parseSingleJobIdEnv(
      env.ciPathsScopeJob,
      DEFAULT_CI_PATHS_SCOPE_JOB_ID,
      "CI_PATHS_SCOPE_JOB",
    ),
    ciPassedJobId: parseSingleJobIdEnv(
      env.ciPassedJob,
      DEFAULT_CI_PASSED_JOB_ID,
      "CI_PASSED_JOB",
    ),
  };
}

export function findNeedsFailures(
  needs: NeedsMap,
  eventName?: string,
  sonarZeroIssuesJobId: string = DEFAULT_SONAR_ZERO_ISSUES_JOB_ID,
  jobIds: Partial<CiPassedGateJobIds> = {},
): string[] {
  const resolved: CiPassedGateJobIds = {
    sonarZeroIssuesJobId,
    codeqlJobId: jobIds.codeqlJobId ?? DEFAULT_CODEQL_JOB_ID,
    workflowSecurityJobId: jobIds.workflowSecurityJobId ?? DEFAULT_WORKFLOW_SECURITY_JOB_ID,
    ciPathsScopeJobId: jobIds.ciPathsScopeJobId ?? DEFAULT_CI_PATHS_SCOPE_JOB_ID,
    ciPassedJobId: jobIds.ciPassedJobId ?? DEFAULT_CI_PASSED_JOB_ID,
  };

  const failures: string[] = [];
  const entries = Object.entries(needs);
  if (entries.length === 0) {
    failures.push("needs context has no jobs (misconfigured ci-passed gate)");
    return failures;
  }
  for (const [jobId, entry] of entries) {
    const result = (entry?.result ?? "").trim();
    if (result.length === 0) {
      failures.push(`${jobId}: missing result`);
      continue;
    }
    if (
      result === "skipped" &&
      skippedResultAllowed({ jobId, needs, eventName, jobIds: resolved })
    ) {
      continue;
    }
    if (!ALLOWED_NEEDS_RESULTS.has(result)) {
      failures.push(`${jobId}: ${result}`);
    }
  }
  return failures;
}

function formatCaughtError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error);
}

export function runCiPassedGate(
  needsJson: string,
  eventName?: string,
  sonarZeroIssuesJobRaw?: string,
  extraJobIds: Partial<CiPassedGateJobIds> = {},
): number {
  let jobIds: CiPassedGateJobIds;
  try {
    jobIds = parseCiPassedGateJobIds({
      sonarZeroIssuesJob: sonarZeroIssuesJobRaw,
      codeqlJob: extraJobIds.codeqlJobId,
      workflowSecurityJob: extraJobIds.workflowSecurityJobId,
      ciPathsScopeJob: extraJobIds.ciPathsScopeJobId,
      ciPassedJob: extraJobIds.ciPassedJobId,
    });
  } catch (error: unknown) {
    console.error(`::error::${formatCaughtError(error)}`);
    return 1;
  }

  let needs: NeedsMap;
  try {
    needs = parseNeedsJson(needsJson);
  } catch (error: unknown) {
    console.error(`::error::${formatCaughtError(error)}`);
    return 1;
  }

  const failures = findNeedsFailures(needs, eventName, jobIds.sonarZeroIssuesJobId, jobIds);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`::error::Required job did not succeed: ${failure}`);
    }
    console.error(
      "::error::ci-passed gate failed: skipped, cancelled, and failed upstream jobs block merge.",
    );
    return 1;
  }

  console.log("ci-passed: all required jobs succeeded.");
  return 0;
}

function main(): void {
  const needsJson = process.env.NEEDS_JSON ?? "";
  const eventName = process.env.GITHUB_EVENT_NAME;
  const sonarZeroIssuesJobRaw = process.env.SONAR_ZERO_ISSUES_JOB;
  const codeqlJob = process.env.CODEQL_JOB;
  const workflowSecurityJob = process.env.WORKFLOW_SECURITY_JOB;
  const ciPathsScopeJob = process.env.CI_PATHS_SCOPE_JOB;
  const ciPassedJob = process.env.CI_PASSED_JOB;
  process.exit(
    runCiPassedGate(needsJson, eventName, sonarZeroIssuesJobRaw, {
      codeqlJobId: codeqlJob,
      workflowSecurityJobId: workflowSecurityJob,
      ciPathsScopeJobId: ciPathsScopeJob,
      ciPassedJobId: ciPassedJob,
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}