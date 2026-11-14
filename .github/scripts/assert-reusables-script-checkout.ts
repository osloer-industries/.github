/**
 * Reusable workflows that sparse-checkout org scripts must resolve the pin via
 * JOB_WORKFLOW_SHA (runner env for job.workflow_sha), forwarded through a step output
 * for checkout — not github.workflow_sha (caller workflow).
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
  if (yaml.includes("job.workflow_sha")) {
    violations.push(
      "must not reference job.workflow_sha in YAML expressions (use shell JOB_WORKFLOW_SHA plus steps.*.outputs.sha)",
    );
  }
  if (!yaml.includes("JOB_WORKFLOW_SHA")) {
    violations.push("must read JOB_WORKFLOW_SHA in a run step");
  }
  if (!yaml.includes("steps.reusables-pin.outputs.sha")) {
    violations.push("must checkout vendored scripts via steps.reusables-pin.outputs.sha");
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
  console.log(`${workflowPath} forwards JOB_WORKFLOW_SHA for vendored script checkout.`);
}