import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("./assert-reusable-workflow-triggers.ts", import.meta.url),
);

function runInRepo(workflows: Record<string, string>): { status: number; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "reusable-trigger-contract-"));
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(workflows)) {
    writeFileSync(join(dir, name), body);
  }
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT],
    { cwd: root, encoding: "utf8" },
  );
  return { status: result.status ?? 1, stderr: result.stderr };
}

const GOOD = `
on:
  workflow_call:
    inputs:
      timeout-minutes:
        type: number
        default: 10
  push:
    branches: [main]
jobs:
  release:
    timeout-minutes: \${{ inputs.timeout-minutes || 10 }}
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`;

const BAD_EVENT = `
on:
  workflow_call: {}
  push:
    branches: [main]
jobs:
  release:
    if: github.event_name == 'workflow_call'
    runs-on: ubuntu-latest
    steps:
      - run: echo bad
`;

const BAD_INPUTS = `
on:
  workflow_call:
    inputs:
      timeout-minutes:
        type: number
        default: 10
  push:
    branches: [main]
jobs:
  release:
    timeout-minutes: \${{ inputs.timeout-minutes }}
    runs-on: ubuntu-latest
    steps:
      - run: echo bad
`;

assert.equal(runInRepo({ "good.yml": GOOD }).status, 0);
assert.notEqual(runInRepo({ "bad-event.yml": BAD_EVENT }).status, 0);
assert.notEqual(runInRepo({ "bad-inputs.yml": BAD_INPUTS }).status, 0);
console.log("assert-reusable-workflow-triggers contract self-test OK");