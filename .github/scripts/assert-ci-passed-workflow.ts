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

if (
  !reusable.includes("job.workflow_sha") &&
  !reusable.includes("osloer-industries/.github/.github/actions/ci-passed-gate@${{ job.workflow_sha }}")
) {
  fail(
    REUSABLE,
    "must checkout gate script at job.workflow_sha or use ci-passed-gate composite at job.workflow_sha",
  );
}

if (!reusable.includes("needs-json")) {
  fail(REUSABLE, "must accept needs-json input");
}

if (!script.includes("ALLOWED_NEEDS_RESULTS")) {
  fail(GATE_SCRIPT, "must fail closed with an explicit success-only allowlist");
}

if (!reusable.includes("GITHUB_EVENT_NAME")) {
  fail(REUSABLE, "must pass GITHUB_EVENT_NAME into the gate step");
}

if (!reusable.includes("sonar-zero-issues-job")) {
  fail(REUSABLE, "must accept sonar-zero-issues-job input for Sonar zero-issues caller job id");
}

if (!reusable.includes("ci-paths-scope-job")) {
  fail(REUSABLE, "must accept ci-paths-scope-job input for docs-only CI scope");
}

if (!reusable.includes("codeql-job")) {
  fail(REUSABLE, "must accept codeql-job input for off-PR CodeQL skip tolerance");
}

if (!reusable.includes("workflow-security-job")) {
  fail(REUSABLE, "must accept workflow-security-job input for conditional skip tolerance");
}

if (!reusable.includes("SONAR_ZERO_ISSUES_JOB")) {
  fail(REUSABLE, "must pass sonar-zero-issues-job into SONAR_ZERO_ISSUES_JOB");
}

if (!script.includes("parseSonarZeroIssuesJobId")) {
  fail(GATE_SCRIPT, "must parse a single Sonar zero-issues job id for push skip tolerance");
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
const hasCompositeCiPassed = ci.includes(
  "uses: osloer-industries/.github/.github/actions/ci-passed-gate@",
);
const hasInlineCiPassed = ci.includes("node .github/scripts/ci-passed-gate.ts");
if (!hasReusableCiPassed && !hasInlineCiPassed && !hasCompositeCiPassed) {
  fail(
    CI_WORKFLOW,
    "ci-passed must call the reusable workflow, the ci-passed-gate composite action, or run .github/scripts/ci-passed-gate.ts",
  );
}

if (!ci.includes("NEEDS_JSON: ${{ toJSON(needs) }}")) {
  fail(CI_WORKFLOW, "ci-passed must pass toJSON(needs) into NEEDS_JSON");
}

if (hasInlineCiPassed && !ci.includes("GITHUB_EVENT_NAME: ${{ github.event_name }}")) {
  fail(CI_WORKFLOW, "inlined ci-passed must pass GITHUB_EVENT_NAME into the gate step");
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