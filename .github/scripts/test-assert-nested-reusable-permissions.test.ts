import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const ASSERT_SCRIPT = ".github/scripts/assert-nested-reusable-permissions.ts";

test("nested reusable permission contract passes on repository workflows", () => {
  const output = execFileSync("node", ["--experimental-strip-types", ASSERT_SCRIPT], {
    cwd: process.cwd(),
    stdio: "pipe",
    encoding: "utf8",
  });
  assert.match(output, /Nested reusable workflow permission contracts OK/);
});

test("exported dependency review caller permission list is complete", async () => {
  const { DEPENDENCY_REVIEW_CALLER_JOB_PERMISSIONS } = await import(
    "./assert-nested-reusable-permissions.ts"
  );
  assert.deepEqual([...DEPENDENCY_REVIEW_CALLER_JOB_PERMISSIONS].toSorted(), [
    "actions: read",
    "contents: read",
    "pull-requests: read",
    "security-events: write",
  ]);
});