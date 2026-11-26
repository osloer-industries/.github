/**
 * Contract checks for the standalone reusable-workflow-triggers-unit workflow.
 */
import { readFileSync } from "node:fs";

const WORKFLOW = ".github/workflows/reusable-workflow-triggers-unit.yml";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const CHECK_NAME = "Reusable workflow trigger unit tests";

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

const workflow = load(WORKFLOW);
const ci = load(CI_WORKFLOW);

if (!workflow.includes("pull_request:")) {
  fail(WORKFLOW, "must trigger on pull_request");
}

if (!workflow.includes("types: [opened, synchronize, reopened, ready_for_review]")) {
  fail(WORKFLOW, "must list standard pull_request types");
}

if (!workflow.includes(`name: ${CHECK_NAME}`)) {
  fail(WORKFLOW, `job display name must be ${JSON.stringify(CHECK_NAME)}`);
}

if (!workflow.includes("test-assert-reusable-workflow-triggers.test.ts")) {
  fail(WORKFLOW, "must run reusable workflow trigger contract unit tests");
}

if (!workflow.includes("test-assert-release-please-app-token-permissions.test.ts")) {
  fail(WORKFLOW, "must run Release Please app token permission contract unit tests");
}

if (ci.includes("reusable-workflow-triggers-unit:")) {
  fail(CI_WORKFLOW, "must not duplicate reusable-workflow-triggers-unit job (standalone workflow owns the check)");
}

if (ci.includes(CHECK_NAME)) {
  fail(CI_WORKFLOW, "must not duplicate Reusable workflow trigger unit tests check name in CI");
}

if (failed) {
  process.exit(1);
}

console.log("reusable-workflow-triggers-unit workflow contracts OK.");