/**
 * Contract checks for org reusables that nest third-party reusable workflows.
 * GitHub validates nested job permissions at caller workflow startup (even when
 * `if:` skips those jobs), so each nesting job must grant every permission the
 * nested reusable requests.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS_DIR = ".github/workflows";

/** Permissions required by google/osv-scanner-reusable-pr @32d3cd482bdadfb38b186c0ad1b031902d55d932 (v2.7.1) job osv-scan. */
const OSV_NESTED_REUSABLE_PR_PERMISSIONS = [
  "actions: read",
  "contents: read",
  "security-events: write",
] as const;

/** Caller job permissions for dependency-review.yml (org follow-up + artifact download). */
export const DEPENDENCY_REVIEW_CALLER_JOB_PERMISSIONS = [
  "actions: read",
  "contents: read",
  "pull-requests: read",
  "security-events: write",
] as const;

function lineNestsExternalReusable(line: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("uses:")) {
    return false;
  }
  const value = trimmed.slice("uses:".length).trim();
  if (value.startsWith("actions/")) {
    return false;
  }
  if (value.startsWith("osloer-industries/")) {
    return false;
  }
  return value.includes("/.github/workflows/") && value.includes("@");
}

function isWorkflowJobIdChar(character: string, atStart: boolean): boolean {
  if (character === "_" || character === "-") {
    return !atStart;
  }
  const codePoint = character.codePointAt(0) ?? -1;
  const isDigit = codePoint >= 48 && codePoint <= 57;
  const isUpper = codePoint >= 65 && codePoint <= 90;
  const isLower = codePoint >= 97 && codePoint <= 122;
  if (atStart) {
    return character === "_" || isLower || isUpper;
  }
  return isDigit || isLower || isUpper;
}

function isWorkflowJobId(jobId: string): boolean {
  if (jobId.length === 0) {
    return false;
  }
  for (let index = 0; index < jobId.length; index++) {
    const character = jobId[index] ?? "";
    if (!isWorkflowJobIdChar(character, index === 0)) {
      return false;
    }
  }
  return true;
}

function parseTopLevelJobId(line: string): string | undefined {
  if (!line.startsWith("  ") || line.startsWith("    ")) {
    return undefined;
  }
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith(":")) {
    return undefined;
  }
  const jobId = trimmed.slice(2, -1).trim();
  if (jobId.includes(" ")) {
    return undefined;
  }
  return isWorkflowJobId(jobId) ? jobId : undefined;
}

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

function parsePermissionBlock(lines: string[], startIndex: number): { perms: Set<string>; next: number } {
  const perms = new Set<string>();
  let i = startIndex + 1;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.startsWith("    ")) {
      break;
    }
    if (!line.startsWith("      ")) {
      break;
    }
    const trimmed = line.trim();
    if (!trimmed.includes(":")) {
      continue;
    }
    const [key, value] = trimmed.split(":").map((part) => part.trim());
    if (key && value) {
      perms.add(`${key}: ${value}`);
    }
  }
  return { perms, next: i };
}

function jobPermissions(yaml: string, jobId: string): Set<string> | null {
  const lines = yaml.split("\n");
  const jobMarker = `  ${jobId}:`;
  let jobStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === jobMarker) {
      jobStart = i;
      break;
    }
  }
  if (jobStart < 0) {
    return null;
  }
  for (let i = jobStart + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.length > 0 && !line.startsWith("    ")) {
      break;
    }
    if (line.trim() === "permissions:") {
      return parsePermissionBlock(lines, i).perms;
    }
  }
  return new Set();
}

function requiredNestedPermissionsMet(granted: Set<string>, required: readonly string[]): string[] {
  const missing: string[] = [];
  for (const perm of required) {
    if (!granted.has(perm)) {
      missing.push(perm);
    }
  }
  return missing;
}

function jobNestsExternalReusable(yaml: string, jobId: string): boolean {
  const lines = yaml.split("\n");
  const jobMarker = `  ${jobId}:`;
  let inJob = false;
  for (const line of lines) {
    if (line === jobMarker) {
      inJob = true;
      continue;
    }
    if (inJob && line.length > 0 && !line.startsWith("    ")) {
      break;
    }
    if (inJob && lineNestsExternalReusable(line)) {
      return true;
    }
  }
  return false;
}

let failed = false;

function fail(message: string): void {
  console.error(`::error::${message}`);
  failed = true;
}

const dependencyReviewPath = ".github/workflows/dependency-review.yml";
const dependencyReviewYaml = load(dependencyReviewPath);

if (!dependencyReviewYaml.includes("osv-scanner-reusable-pr.yml@32d3cd482bdadfb38b186c0ad1b031902d55d932")) {
  fail(
    `${dependencyReviewPath}: unexpected Google OSV reusable pin — update OSV_NESTED_REUSABLE_PR_PERMISSIONS if the pin changed`,
  );
}

const osvJobPerms = jobPermissions(dependencyReviewYaml, "osv-dependency-review");
if (osvJobPerms === null) {
  fail(`${dependencyReviewPath}: missing job osv-dependency-review`);
} else {
  const missing = requiredNestedPermissionsMet(osvJobPerms, OSV_NESTED_REUSABLE_PR_PERMISSIONS);
  if (missing.length > 0) {
    fail(
      `${dependencyReviewPath} job osv-dependency-review must grant nested OSV reusable permissions: ${missing.join(", ")}`,
    );
  }
}

const docMarkers = [
  "contents: read",
  "actions: read",
  "pull-requests: read",
  "security-events: write",
];
for (const marker of docMarkers) {
  if (!dependencyReviewYaml.includes(marker)) {
    fail(`${dependencyReviewPath}: reusable header must document caller permission ${marker}`);
  }
}

const workflowFiles = readdirSync(WORKFLOWS_DIR).filter((name) => name.endsWith(".yml"));
for (const file of workflowFiles) {
  const path = join(WORKFLOWS_DIR, file);
  const yaml = load(path);
  const lines = yaml.split("\n");
  let currentJob: string | undefined;
  for (const line of lines) {
    const jobId = parseTopLevelJobId(line);
    if (jobId !== undefined && line !== "  ci-passed:") {
      currentJob = jobId;
      continue;
    }
    if (currentJob !== undefined && lineNestsExternalReusable(line)) {
      const granted = jobPermissions(yaml, currentJob);
      if (granted === null) {
        fail(`${path} job ${currentJob}: nests external reusable but job not found`);
      } else {
        const missing = requiredNestedPermissionsMet(granted, OSV_NESTED_REUSABLE_PR_PERMISSIONS);
        if (missing.length > 0) {
          fail(
            `${path} job ${currentJob}: nests external reusable but missing permissions ${missing.join(", ")}`,
          );
        }
      }
    }
  }
}

for (const jobId of ["osv-dependency-review"]) {
  if (!jobNestsExternalReusable(dependencyReviewYaml, jobId)) {
    fail(`${dependencyReviewPath}: expected job ${jobId} to nest Google OSV reusable`);
  }
}

if (failed) {
  process.exit(1);
}

console.log("Nested reusable workflow permission contracts OK.");