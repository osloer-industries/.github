/**
 * Reusable workflows that sparse-checkout org scripts must resolve the pin via
 * JOB_WORKFLOW_SHA (runner env for job.workflow_sha), not github.workflow_sha.
 */
import { readFileSync } from "node:fs";

const WORKFLOWS = [
  ".github/workflows/sonarcloud-zero-issues.yml",
  ".github/workflows/mutation-changed.yml",
] as const;

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

for (const workflowPath of WORKFLOWS) {
  const yaml = load(workflowPath);
  const violations: string[] = [];

  if (yaml.includes("reusables-ref")) {
    violations.push("must not define or reference reusables-ref");
  }
  if (yaml.includes("github.workflow_sha")) {
    violations.push("must not use github.workflow_sha for script checkout");
  }
  if (yaml.includes("job.workflow_sha") || yaml.includes("job.workflow_repository")) {
    violations.push(
      "must use env.JOB_WORKFLOW_SHA in YAML (actionlint 1.7.12 does not model job.workflow_*; runner injects the same values as JOB_* env vars)",
    );
  }
  if (!yaml.includes("env.JOB_WORKFLOW_SHA")) {
    violations.push("must checkout vendored scripts with env.JOB_WORKFLOW_SHA");
  }
  if (!yaml.includes("repository: osloer-industries/.github")) {
    violations.push("must sparse-checkout from osloer-industries/.github");
  }
  if (/Resolve reusables commit/.test(yaml)) {
    violations.push("must not resolve reusables ref via a separate shell step");
  }

  if (violations.length > 0) {
    for (const msg of violations) {
      console.error(`::error::${workflowPath} ${msg}`);
    }
    process.exit(1);
  }
  console.log(`${workflowPath} uses JOB_WORKFLOW_SHA for vendored script checkout.`);
}