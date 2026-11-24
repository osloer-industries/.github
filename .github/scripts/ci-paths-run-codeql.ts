#!/usr/bin/env node
/**
 * Compute ci-paths-scope run-codeql output from changed paths and event context.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZERO_BEFORE = "0000000000000000000000000000000000000000";

export function pathTriggersCodeql(path: string): boolean {
  if (/^src\//u.test(path)) {
    return true;
  }
  if (/^lib\//u.test(path)) {
    return true;
  }
  if (/^app\//u.test(path)) {
    return true;
  }
  if (/^api\//u.test(path) || /^_api\//u.test(path)) {
    return true;
  }
  if (/^scripts\//u.test(path)) {
    return true;
  }
  if (/^\.github\/workflows\//u.test(path)) {
    return true;
  }
  return /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u.test(path);
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
  const out = execFileSync("git", ["diff", "--name-only", `${baseSha}...HEAD`], {
    encoding: "utf8",
  });
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