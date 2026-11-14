/**
 * Reusable workflows that sparse-checkout org scripts must resolve the pin via
 * job.workflow_sha (reusable workflow file commit), not github.workflow_sha.
 */
import { readFileSync } from "node:fs";

const WORKFLOWS = [
  ".github/workflows/sonarcloud-zero-issues.yml",
  ".github/workflows/mutation-changed.yml",
  ".github/workflows/auto-merge.yml",
  ".github/workflows/ci-passed.yml",
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
  if (!yaml.includes("job.workflow_sha")) {
    violations.push("must checkout vendored scripts with job.workflow_sha");
  }
  if (!yaml.includes("repository: osloer-industries/.github")) {
    violations.push("must sparse-checkout from osloer-industries/.github");
  }

  if (violations.length > 0) {
    for (const msg of violations) {
      console.error(`::error::${workflowPath} ${msg}`);
    }
    process.exit(1);
  }
  console.log(`${workflowPath} uses job.workflow_sha for vendored script checkout.`);
}