/**
 * Contract checks for ci-passed reusable workflow and repository CI wiring.
 */
import { readFileSync } from "node:fs";

const REUSABLE = ".github/workflows/ci-passed.yml";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const GATE_SCRIPT = ".github/scripts/ci-passed-gate.ts";
const JOB_ID_LINE = /^ {2}([\w][\w-]*):\s*$/;

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

let failed = false;

function fail(path: string, message: string): void {
  console.error(`::error::${path}: ${message}`);
  failed = true;
}

const reusable = load(REUSABLE);
const ci = load(CI_WORKFLOW);
const script = load(GATE_SCRIPT);

if (!reusable.includes("job.workflow_sha")) {
  fail(REUSABLE, "must checkout gate script at job.workflow_sha");
}

if (!reusable.includes("needs-json")) {
  fail(REUSABLE, "must accept needs-json input");
}

if (!script.includes("ALLOWED_NEEDS_RESULTS")) {
  fail(GATE_SCRIPT, "must fail closed with an explicit success-only allowlist");
}

if (reusable.includes("continue-on-error: true")) {
  fail(REUSABLE, "must not use continue-on-error");
}

function ciPassedJobUsesAlways(ciYaml: string): boolean {
  const marker = "\n  ci-passed:";
  const start = ciYaml.indexOf(marker);
  if (start < 0) {
    return false;
  }
  const block = ciYaml.slice(start, start + 800);
  return block.includes("if: always()");
}

if (!ciPassedJobUsesAlways(ci)) {
  fail(CI_WORKFLOW, "ci-passed job must use if: always()");
}

const hasReusableCiPassed =
  ci.includes("uses: osloer-industries/.github/.github/workflows/ci-passed.yml@") ||
  ci.includes("uses: ./.github/workflows/ci-passed.yml");
const hasInlineCiPassed = ci.includes("node .github/scripts/ci-passed-gate.ts");
if (!hasReusableCiPassed && !hasInlineCiPassed) {
  fail(
    CI_WORKFLOW,
    "ci-passed must call the reusable workflow or run .github/scripts/ci-passed-gate.ts",
  );
}

if (!ci.includes("NEEDS_JSON: ${{ toJSON(needs) }}")) {
  fail(CI_WORKFLOW, "ci-passed must pass toJSON(needs) into NEEDS_JSON");
}

function extractJobIdFromLine(line: string): string | null {
  const match = JOB_ID_LINE.exec(line);
  if (match === null) {
    return null;
  }
  return match[1] ?? null;
}

function listCiJobIds(ciYaml: string): string[] {
  const lines = ciYaml.split("\n");
  let inJobs = false;
  const jobIds: string[] = [];
  for (const line of lines) {
    if (line === "jobs:") {
      inJobs = true;
      continue;
    }
    if (!inJobs) {
      continue;
    }
    if (line.length > 0 && !line.startsWith(" ")) {
      break;
    }
    const jobId = extractJobIdFromLine(line);
    if (jobId !== null) {
      jobIds.push(jobId);
    }
  }
  return jobIds;
}

function isCiPassedJobStart(line: string): boolean {
  return line === "  ci-passed:";
}

function isSiblingJobBoundary(line: string): boolean {
  return line.startsWith("  ") && !line.startsWith("    ") && line !== "  ci-passed:";
}

function parseNeedsEntry(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) {
    return null;
  }
  return trimmed.slice(2).trim();
}

function shouldStopNeedsList(line: string, inNeeds: boolean): boolean {
  if (!inNeeds) {
    return false;
  }
  const trimmed = line.trim();
  if (trimmed.startsWith("- ")) {
    return false;
  }
  return trimmed.length > 0 && !line.startsWith("      ");
}

function scanCiPassedNeeds(lines: string[]): { foundJob: boolean; needs: string[] } {
  let inCiPassed = false;
  let inNeeds = false;
  const needed: string[] = [];
  for (const line of lines) {
    if (isCiPassedJobStart(line)) {
      inCiPassed = true;
      continue;
    }
    if (!inCiPassed) {
      continue;
    }
    if (isSiblingJobBoundary(line)) {
      break;
    }
    if (line.trim() === "needs:") {
      inNeeds = true;
      continue;
    }
    if (!inNeeds) {
      continue;
    }
    if (shouldStopNeedsList(line, inNeeds)) {
      break;
    }
    const entry = parseNeedsEntry(line);
    if (entry !== null) {
      needed.push(entry);
    }
  }
  return { foundJob: inCiPassed, needs: needed };
}

function listCiPassedNeeds(ciYaml: string): string[] | null {
  const { foundJob, needs } = scanCiPassedNeeds(ciYaml.split("\n"));
  if (!foundJob || needs.length === 0) {
    return null;
  }
  return needs;
}

function validateCiPassedNeedsCoverage(jobIds: string[], needed: string[]): void {
  const required = jobIds.filter((id) => id !== "ci-passed");
  for (const jobId of required) {
    if (!needed.includes(jobId)) {
      fail(CI_WORKFLOW, `ci-passed needs must include every other job (missing ${jobId})`);
    }
  }
  for (const jobId of needed) {
    if (!required.includes(jobId)) {
      fail(CI_WORKFLOW, `ci-passed needs lists unknown or duplicate job ${jobId}`);
    }
  }
}

const jobIds = listCiJobIds(ci);
const needed = listCiPassedNeeds(ci);

if (needed === null) {
  fail(CI_WORKFLOW, "missing ci-passed job or needs list");
} else {
  validateCiPassedNeedsCoverage(jobIds, needed);
}

if (failed) {
  process.exit(1);
}

console.log("ci-passed workflow contracts OK.");