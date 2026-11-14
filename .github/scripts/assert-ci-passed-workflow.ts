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

if (!/\bci-passed:\s*\n[\s\S]*?\bif:\s*always\(\)/m.test(ci)) {
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
  const jobsIndex = ciYaml.search(/^jobs:\s*$/m);
  if (jobsIndex < 0) {
    return [];
  }
  const jobsSection = ciYaml.slice(jobsIndex);
  const jobIdPattern = /^ {2}([\w][\w-]*):\s*$/gm;
  const jobIds: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = jobIdPattern.exec(jobsSection)) !== null) {
    jobIds.push(match[1] ?? "");
  }
  return jobIds;
}

const jobIds = listCiJobIds(ci);

const ciPassedBlock = ci.match(/\n {2}ci-passed:\s*\n[\s\S]*?(?=\n {2}\w|\n*$)/);
if (!ciPassedBlock) {
  fail(CI_WORKFLOW, "missing ci-passed job");
} else {
  const needsBlock = ciPassedBlock[0].match(/\n {4}needs:\s*\n((?: {6}- [\w-]+\n)+)/);
  if (!needsBlock) {
    fail(CI_WORKFLOW, "ci-passed must declare needs:");
  } else {
    const needed = [...needsBlock[1].matchAll(/ {6}- ([\w-]+)/g)].map((m) => m[1] ?? "");
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
}

if (failed) {
  process.exit(1);
}

console.log("ci-passed workflow contracts OK.");