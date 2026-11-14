/**
 * Contract checks for ci-passed reusable workflow and repository CI wiring.
 */
import { readFileSync } from "node:fs";

const REUSABLE = ".github/workflows/ci-passed.yml";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const GATE_SCRIPT = ".github/scripts/ci-passed-gate.ts";

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

function listCiJobIds(ciYaml: string): string[] {
  const lines = ciYaml.split("\n");
  let inJobs = false;
  const jobIds: string[] = [];
  const jobIdLine = /^ {2}([\w][\w-]*):\s*$/;
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
    const match = jobIdLine.exec(line);
    if (match !== null) {
      jobIds.push(match[1] ?? "");
    }
  }
  return jobIds;
}

function listCiPassedNeeds(ciYaml: string): string[] | null {
  const lines = ciYaml.split("\n");
  let inCiPassed = false;
  let inNeeds = false;
  const needed: string[] = [];
  for (const line of lines) {
    if (line === "  ci-passed:") {
      inCiPassed = true;
      continue;
    }
    if (!inCiPassed) {
      continue;
    }
    if (line.startsWith("  ") && !line.startsWith("    ") && line !== "  ci-passed:") {
      break;
    }
    if (line.trim() === "needs:") {
      inNeeds = true;
      continue;
    }
    if (!inNeeds) {
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) {
      if (line.trim().length > 0 && !line.startsWith("      ")) {
        break;
      }
      continue;
    }
    needed.push(trimmed.slice(2).trim());
  }
  return inCiPassed && inNeeds ? needed : null;
}

const jobIds = listCiJobIds(ci);
const needed = listCiPassedNeeds(ci);

if (needed === null) {
  fail(CI_WORKFLOW, "missing ci-passed job or needs list");
} else {
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

if (failed) {
  process.exit(1);
}

console.log("ci-passed workflow contracts OK.");