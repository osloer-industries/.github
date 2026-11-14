/**
 * Release Please mints a GitHub App installation token; it must request write access for
 * contents, pull requests, and workflows so ref updates succeed when main changes
 * .github/workflows (otherwise GitHub returns 403 on POST /git/refs).
 */
import { readFileSync } from "node:fs";

const WORKFLOW = ".github/workflows/release-please.yml";

const TOKEN_STEP_IDS = ["release-app-token-push", "release-app-token"] as const;

const REQUIRED_WITH_LINES = [
  "permission-contents: write",
  "permission-pull-requests: write",
  "permission-workflows: write",
] as const;

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

function stepBlock(yaml: string, stepId: string): string | null {
  const marker = `id: ${stepId}`;
  const start = yaml.indexOf(marker);
  if (start === -1) {
    return null;
  }
  const rest = yaml.slice(start);
  const nextStep = rest.search(/\n      - name: /);
  if (nextStep === -1) {
    return rest;
  }
  return rest.slice(0, nextStep);
}

const yaml = load(WORKFLOW);
let failed = false;

for (const stepId of TOKEN_STEP_IDS) {
  const block = stepBlock(yaml, stepId);
  if (block === null) {
    console.error(`::error::${WORKFLOW} missing create-github-app-token step id: ${stepId}`);
    failed = true;
    continue;
  }
  for (const line of REQUIRED_WITH_LINES) {
    if (!block.includes(line)) {
      console.error(
        `::error::${WORKFLOW} step ${stepId} must set ${line} in actions/create-github-app-token`,
      );
      failed = true;
    }
  }
}

if (!yaml.includes("workflows, and pull-request write")) {
  console.error(
    `::error::${WORKFLOW} RELEASE_TOKEN secret description must mention workflows write`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(`${WORKFLOW} release app token permissions OK.`);