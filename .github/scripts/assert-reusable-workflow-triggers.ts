/**
 * Reusable workflows that also run on caller events (push, pull_request, …) must not
 * branch on github.event_name == 'workflow_call' (that is the caller's event).
 * Job-level expressions need fallbacks for empty inputs on direct triggers.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WORKFLOWS_DIR = ".github/workflows";

const DIRECT_TRIGGERS = [
  "push:",
  "pull_request:",
  "pull_request_target:",
  "workflow_dispatch:",
  "schedule:",
] as const;

const JOB_SCALAR_KEYS = new Set([
  "if",
  "timeout-minutes",
  "runs-on",
  "environment",
  "name",
  "container",
  "services",
  "outputs",
  "defaults",
  "strategy",
  "continue-on-error",
  "concurrency",
]);

const JOB_HEADER_LINE = /^ {2}(\w[\w-]*):\s*$/;
const SIBLING_JOB_LINE = /^ {2}\S/;

function parseJobScalarLine(line: string): { key: string; value: string } | null {
  if (!line.startsWith("    ")) {
    return null;
  }
  const colon = line.indexOf(":", 4);
  if (colon < 0) {
    return null;
  }
  const key = line.slice(4, colon).trim();
  if (!/^\w[\w-]*$/.test(key)) {
    return null;
  }
  return { key, value: line.slice(colon + 1).trimEnd() };
}

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

function hasWorkflowCallAndDirectTrigger(yaml: string): boolean {
  if (!/^on:\s*$/m.test(yaml) && !yaml.includes("\non:")) {
    return false;
  }
  if (!yaml.includes("workflow_call:")) {
    return false;
  }
  return DIRECT_TRIGGERS.some((trigger) => yaml.includes(`\n  ${trigger}`) || yaml.includes(`\n${trigger}`));
}

function inputsNeedFallback(key: string, value: string): boolean {
  return (
    JOB_SCALAR_KEYS.has(key) &&
    value.includes("${{") &&
    value.includes("inputs.") &&
    !value.includes("||")
  );
}

function jobLevelScalarsWithoutSteps(yaml: string): { jobId: string; line: string; text: string }[] {
  const lines = yaml.split("\n");
  const findings: { jobId: string; line: string; text: string }[] = [];
  let inJobs = false;
  let currentJob = "";
  let inSteps = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("jobs:")) {
      inJobs = true;
      continue;
    }
    if (!inJobs) {
      continue;
    }
    const jobMatch = JOB_HEADER_LINE.exec(line);
    if (jobMatch) {
      currentJob = jobMatch[1] ?? "";
      inSteps = false;
      continue;
    }
    if (currentJob === "" || line.length === 0) {
      continue;
    }
    if (line.startsWith("    steps:")) {
      inSteps = true;
      continue;
    }
    if (inSteps) {
      continue;
    }
    if (!line.startsWith("    ")) {
      if (SIBLING_JOB_LINE.exec(line)) {
        currentJob = "";
        inSteps = false;
      }
      continue;
    }
    const scalar = parseJobScalarLine(line);
    if (scalar === null) {
      continue;
    }
    const { key, value } = scalar;
    if (inputsNeedFallback(key, value)) {
      findings.push({
        jobId: currentJob,
        line: String(i + 1),
        text: line.trim(),
      });
    }
  }

  return findings;
}

function listWorkflowFiles(): string[] {
  try {
    return readdirSync(WORKFLOWS_DIR)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .map((name) => join(WORKFLOWS_DIR, name));
  } catch {
    console.error(`::error::Could not read ${WORKFLOWS_DIR}`);
    process.exit(1);
  }
}

let failed = false;

for (const workflowPath of listWorkflowFiles()) {
  const yaml = load(workflowPath);
  if (!hasWorkflowCallAndDirectTrigger(yaml)) {
    continue;
  }

  if (
    yaml.includes("github.event_name == 'workflow_call'") ||
    yaml.includes('github.event_name == "workflow_call"')
  ) {
    console.error(
      `::error::${workflowPath} must not compare github.event_name to workflow_call inside a reusable workflow (caller event is visible, not the call boundary)`,
    );
    failed = true;
  }

  for (const finding of jobLevelScalarsWithoutSteps(yaml)) {
    console.error(
      `::error::${workflowPath}:${finding.line} job ${finding.jobId} job-level inputs.* needs a fallback on direct triggers: ${finding.text}`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Reusable workflow direct-trigger contracts OK.");