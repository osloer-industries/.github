/** CI tests for codeql-sarif-security-gate.ts (via the shipped inline copy). */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SHIPPED_GATE = join(REPO_ROOT, ".github/scripts/run-shipped-codeql-gate.ts");
const FIXTURES = join(REPO_ROOT, ".github/test-fixtures/codeql-sarif");

function runGate(sarifDir: string, failOn: string = "error") {
  const env = { ...process.env, SARIF_DIR: sarifDir, FAIL_ON_SARIF_LEVEL: failOn };
  delete env.GITHUB_STEP_SUMMARY;
  return spawnSync(process.execPath, [SHIPPED_GATE], {
    env,
    encoding: "utf-8",
  });
}

test("security extension error fails", () => {
  const tmp = mkdtempSync(join(tmpdir(), "codeql-gate-fixture-"));
  copyFileSync(
    join(FIXTURES, "security-extension-error.sarif"),
    join(tmp, "codeql.sarif"),
  );
  const result = runGate(tmp);
  assert.equal(
    result.status,
    1,
    `${result.stdout}\n${result.stderr}`,
  );
});

test("non security note passes", () => {
  const tmp = mkdtempSync(join(tmpdir(), "codeql-gate-fixture-"));
  copyFileSync(
    join(FIXTURES, "non-security-note.sarif"),
    join(tmp, "codeql.sarif"),
  );
  const result = runGate(tmp);
  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`,
  );
});

test("missing level uses rule default error", () => {
  const tmp = mkdtempSync(join(tmpdir(), "codeql-gate-fixture-"));
  copyFileSync(
    join(FIXTURES, "missing-level-rule-default-error.sarif"),
    join(tmp, "codeql.sarif"),
  );
  const result = runGate(tmp);
  assert.equal(
    result.status,
    1,
    `${result.stdout}\n${result.stderr}`,
  );
});

test("no sarif files fails closed", () => {
  const tmp = mkdtempSync(join(tmpdir(), "codeql-gate-fixture-"));
  const result = runGate(tmp);
  assert.equal(
    result.status,
    2,
    `${result.stdout}\n${result.stderr}`,
  );
});

test("invalid sarif fails closed", () => {
  const tmp = mkdtempSync(join(tmpdir(), "codeql-gate-fixture-"));
  copyFileSync(join(FIXTURES, "invalid.sarif"), join(tmp, "broken.sarif"));
  const result = runGate(tmp);
  assert.equal(
    result.status,
    2,
    `${result.stdout}\n${result.stderr}`,
  );
});
