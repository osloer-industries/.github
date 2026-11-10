/**
 * Fail closed if workflow-security.yml locates org support files via caller github context
 * (github.workflow_ref / github.workflow_sha / cross-repo sparse checkout). Cross-repo
 * workflow_call runs with github.* pointing at the caller; only inlined scripts are safe.
 */
import { readFileSync } from "node:fs";

const WORKFLOW = ".github/workflows/workflow-security.yml";

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

const yaml = load(WORKFLOW);
const violations: string[] = [];

const forbiddenGithubExprs = [
  "github.workflow_ref",
  "github.workflow_sha",
] as const;

for (const expr of forbiddenGithubExprs) {
  if (yaml.includes(expr)) {
    violations.push(`must not reference $\{{ ${expr} }} (caller workflow in reusable jobs)`);
  }
}

if (yaml.includes(".workflow-security-support")) {
  violations.push(
    "must not use .workflow-security-support checkout (use inlined validator instead)",
  );
}

if (/sparse-checkout:[\s\S]*validate-zizmor-thresholds/.test(yaml)) {
  violations.push(
    "must not sparse-checkout validate-zizmor-thresholds.ts (use inlined validator instead)",
  );
}

if (
  /repository:\s*\$\{\{\s*github\.(repository|event\.repository)/.test(yaml)
) {
  violations.push(
    "must not checkout support files using github.repository (caller repo in reusables)",
  );
}

if (/WF_REF|Resolve reusable workflow source/.test(yaml)) {
  violations.push(
    "must not resolve reusable workflow source from github.workflow_ref",
  );
}

if (!yaml.includes("ZIZMOR_THRESHOLDS_INLINE")) {
  violations.push(
    "must inline zizmor threshold validator (ZIZMOR_THRESHOLDS_INLINE heredoc)",
  );
}

if (violations.length > 0) {
  for (const msg of violations) {
    console.error(`::error::${WORKFLOW} ${msg}`);
  }
  process.exit(1);
}

console.log(`${WORKFLOW} does not rely on caller github context for support files.`);
