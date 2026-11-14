/**
 * Reusable workflows that sparse-checkout org scripts must resolve the pin via
 * job.workflow_sha / job.workflow_repository (not github.workflow_sha, which is the caller's workflow).
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
    violations.push("must not define or reference reusables-ref (use job.workflow_sha)");
  }
  if (yaml.includes("github.workflow_sha")) {
    violations.push("must not use github.workflow_sha for script checkout");
  }
  if (!yaml.includes("job.workflow_sha")) {
    violations.push("must checkout vendored scripts with job.workflow_sha");
  }
  if (!yaml.includes("job.workflow_repository")) {
    violations.push("must checkout vendored scripts with job.workflow_repository");
  }
  if (/Resolve reusables commit/.test(yaml)) {
    violations.push("must not resolve reusables ref via a separate shell step (use job context in checkout)");
  }

  if (violations.length > 0) {
    for (const msg of violations) {
      console.error(`::error::${workflowPath} ${msg}`);
    }
    process.exit(1);
  }
  console.log(`${workflowPath} uses job.workflow_* for vendored script checkout.`);
}