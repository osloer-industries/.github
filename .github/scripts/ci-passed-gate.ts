#!/usr/bin/env node
/**
 * Fail closed unless every entry in the GitHub Actions `needs` context is result success.
 * Jobs that run only on pull_request may be `skipped` on other workflow events (push, schedule).
 */

import { fileURLToPath } from "node:url";

export const ALLOWED_NEEDS_RESULTS = new Set(["success"]);

/**
 * Default caller `needs` job ids for SonarCloud zero-open-issues (override via PULL_REQUEST_ONLY_NEED_JOBS).
 * Skipped is acceptable on non-pull_request events; never on pull_request.
 */
export const DEFAULT_PULL_REQUEST_ONLY_NEED_JOBS = ["sonar-zero-open-issues"] as const;

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

export function parsePullRequestOnlyJobIds(raw: string | undefined): Set<string> {
  const trimmed = raw?.trim() ?? "";
  if (trimmed.length === 0) {
    return new Set(DEFAULT_PULL_REQUEST_ONLY_NEED_JOBS);
  }
  const ids = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return new Set(ids);
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

function skippedAllowedForJob(
  jobId: string,
  eventName: string | undefined,
  pullRequestOnlyJobs: Set<string>,
): boolean {
  if (!pullRequestOnlyJobs.has(jobId)) {
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
  pullRequestOnlyJobs: Set<string> = parsePullRequestOnlyJobIds(undefined),
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
    if (result === "skipped" && skippedAllowedForJob(jobId, eventName, pullRequestOnlyJobs)) {
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
  pullRequestOnlyJobsRaw?: string,
): number {
  const pullRequestOnlyJobs = parsePullRequestOnlyJobIds(pullRequestOnlyJobsRaw);
  let needs: NeedsMap;
  try {
    needs = parseNeedsJson(needsJson);
  } catch (error: unknown) {
    console.error(`::error::${formatCaughtError(error)}`);
    return 1;
  }

  const failures = findNeedsFailures(needs, eventName, pullRequestOnlyJobs);
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
  const pullRequestOnlyJobsRaw = process.env.PULL_REQUEST_ONLY_NEED_JOBS;
  process.exit(runCiPassedGate(needsJson, eventName, pullRequestOnlyJobsRaw));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}