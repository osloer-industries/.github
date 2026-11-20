import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
  new URL("./assert-pr-title-workflow.ts", import.meta.url),
);
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("assert-pr-title-workflow contract passes on repository workflows", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});