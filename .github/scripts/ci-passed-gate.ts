#!/usr/bin/env node
/**
 * Fail closed unless every entry in the GitHub Actions `needs` context is result success.
 */

import { fileURLToPath } from "node:url";

export const ALLOWED_NEEDS_RESULTS = new Set(["success"]);

export interface NeedsJobEntry {
  result: string;
  outputs?: Record<string, string>;
}

export type NeedsMap = Record<string, NeedsJobEntry>;

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
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("NEEDS_JSON must be a JSON object");
  }
  return parsed as NeedsMap;
}

export function findNeedsFailures(needs: NeedsMap): string[] {
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

export function runCiPassedGate(needsJson: string): number {
  let needs: NeedsMap;
  try {
    needs = parseNeedsJson(needsJson);
  } catch (error: unknown) {
    console.error(`::error::${formatCaughtError(error)}`);
    return 1;
  }

  const failures = findNeedsFailures(needs);
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
  process.exit(runCiPassedGate(needsJson));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}