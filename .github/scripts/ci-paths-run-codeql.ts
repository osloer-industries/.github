#!/usr/bin/env node
/**
 * Compute ci-paths-scope run-codeql output from changed paths and event context.
 * Keep path rules aligned with the bash step in ci-paths-scope.yml.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZERO_BEFORE = "0000000000000000000000000000000000000000";
const GIT_EXECUTABLE = "/usr/bin/git";
const SAFE_PATH = "/usr/bin:/bin";
const CODEQL_EXTENSION = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;

export function pathTriggersCodeql(path: string): boolean {
  if (path.startsWith("src/")) {
    return true;
  }
  if (path.startsWith("lib/")) {
    return true;
  }
  if (path.startsWith("app/")) {
    return true;
  }
  if (path.startsWith("api/") || path.startsWith("_api/")) {
    return true;
  }
  if (path.startsWith("scripts/")) {
    return true;
  }
  if (path.startsWith(".github/workflows/")) {
    return true;
  }
  return CODEQL_EXTENSION.test(path);
}

export function resolveRunCodeql(
  changedPaths: readonly string[],
  eventName: string,
  runFullCi: boolean,
): boolean {
  if (!runFullCi) {
    return false;
  }
  const event = eventName.trim();
  if (event !== "pull_request") {
    return true;
  }
  for (const path of changedPaths) {
    if (pathTriggersCodeql(path)) {
      return true;
    }
  }
  return false;
}

function listChangedPaths(baseSha: string): string[] {
  const out = execFileSync(
    GIT_EXECUTABLE,
    ["diff", "--name-only", `${baseSha}...HEAD`],
    {
      encoding: "utf8",
      env: { PATH: SAFE_PATH },
    },
  );
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function main(): void {
  const runFullCi = (process.env.RUN_FULL_CI ?? "").trim() === "true";
  const eventName = (process.env.GITHUB_EVENT_NAME ?? "").trim();
  let base = (process.env.PULL_REQUEST_BASE_SHA ?? "").trim();
  if (base.length === 0) {
    base = (process.env.GITHUB_EVENT_BEFORE ?? "").trim();
  }
  if (eventName !== "pull_request" || base.length === 0 || base === ZERO_BEFORE) {
    const value = resolveRunCodeql([], eventName, runFullCi);
    process.stdout.write(`run-codeql=${value ? "true" : "false"}\n`);
    return;
  }
  const changed = listChangedPaths(base);
  const value = resolveRunCodeql(changed, eventName, runFullCi);
  process.stdout.write(`run-codeql=${value ? "true" : "false"}\n`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}