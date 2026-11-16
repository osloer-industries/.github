#!/usr/bin/env node
/**
 * Fail closed unless every entry in the GitHub Actions `needs` context is result success.
 * Only the Sonar zero-issues caller job may be `skipped` on non-pull_request events.
 */

import { fileURLToPath } from "node:url";

export const ALLOWED_NEEDS_RESULTS = new Set(["success"]);

/** Default caller `needs` job id for SonarCloud zero-open-issues (override via SONAR_ZERO_ISSUES_JOB). */
export const DEFAULT_SONAR_ZERO_ISSUES_JOB_ID = "sonar-zero-open-issues";

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

export function parseSonarZeroIssuesJobId(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length === 0) {
    return DEFAULT_SONAR_ZERO_ISSUES_JOB_ID;
  }
  if (trimmed.includes(",")) {
    throw new Error(
      "SONAR_ZERO_ISSUES_JOB must be a single job id (commas are not allowed); only the Sonar zero-issues caller job may be skipped off pull_request",
    );
  }
  return trimmed;
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

export function findNeedsFailures(
  needs: NeedsMap,
  eventName?: string,
  sonarZeroIssuesJobId: string = DEFAULT_SONAR_ZERO_ISSUES_JOB_ID,
): string[] {
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
    if (result === "skipped" && skippedAllowedForSonarJob(jobId, eventName, sonarZeroIssuesJobId)) {
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
): number {
  let sonarZeroIssuesJobId: string;
  try {
    sonarZeroIssuesJobId = parseSonarZeroIssuesJobId(sonarZeroIssuesJobRaw);
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

  const failures = findNeedsFailures(needs, eventName, sonarZeroIssuesJobId);
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
  process.exit(runCiPassedGate(needsJson, eventName, sonarZeroIssuesJobRaw));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}