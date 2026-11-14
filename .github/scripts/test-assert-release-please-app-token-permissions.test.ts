import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("./assert-release-please-app-token-permissions.ts", import.meta.url),
);

function run(workflowYaml: string): number {
  const root = mkdtempSync(join(tmpdir(), "release-please-token-perms-"));
  const dir = join(root, ".github", "workflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "release-please.yml"), workflowYaml);
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT],
    { cwd: root, encoding: "utf8" },
  );
  return result.status ?? 1;
}

const GOOD = `
on:
  workflow_call:
    secrets:
      RELEASE_TOKEN:
        description: Token with contents, workflows, and pull-request write for release PRs
jobs:
  release:
    steps:
      - id: release-app-token-push
        uses: actions/create-github-app-token@0000000000000000000000000000000000000000
        with:
          permission-contents: write
          permission-pull-requests: write
          permission-workflows: write
      - id: release-app-token
        uses: actions/create-github-app-token@0000000000000000000000000000000000000000
        with:
          permission-contents: write
          permission-pull-requests: write
          permission-workflows: write
`;

const BAD = `
on:
  workflow_call:
    secrets:
      RELEASE_TOKEN:
        description: Token with contents and pull-request write for release PRs
jobs:
  release:
    steps:
      - id: release-app-token-push
        with:
          permission-contents: write
          permission-pull-requests: write
      - id: release-app-token
        with:
          permission-contents: write
`;

assert.equal(run(GOOD), 0);
assert.notEqual(run(BAD), 0);
console.log("assert-release-please-app-token-permissions contract self-test OK");