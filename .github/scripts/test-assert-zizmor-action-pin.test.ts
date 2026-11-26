import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isValidZizmorVersion } from "./assert-zizmor-action-pin.ts";

const SCRIPT = fileURLToPath(
  new URL("./assert-zizmor-action-pin.ts", import.meta.url),
);
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Previous action.sh-style semver pin pattern (regression oracle for parser replacement). */
const LEGACY_VERSION_PATTERN =
  /^v?\d+\.\d+\.\d+((a|b|rc)\d+)?(\.dev\d+)?$/;

const ACCEPT_SAMPLES = [
  "1.31.1",
  "v1.31.1",
  "0.0.0",
  "12.34.56rc1",
  "1.0.0a2",
  "1.0.0b9",
  "2.3.4.dev0",
  "1.2.3rc1.dev5",
] as const;

const REJECT_SAMPLES = [
  "",
  "latest",
  "prerelease",
  "1.2",
  "1.2.3.4",
  "1.2.3-rc1",
  "1.2.3foo",
] as const;

test("isValidZizmorVersion matches legacy semver pin accept list", () => {
  for (const sample of ACCEPT_SAMPLES) {
    assert.equal(
      LEGACY_VERSION_PATTERN.test(sample),
      true,
      `oracle should accept ${sample}`,
    );
    assert.equal(
      isValidZizmorVersion(sample),
      true,
      `parser should accept ${sample}`,
    );
  }
});

test("isValidZizmorVersion rejects same inputs as legacy pattern", () => {
  for (const sample of REJECT_SAMPLES) {
    assert.equal(
      LEGACY_VERSION_PATTERN.test(sample),
      false,
      `oracle should reject ${sample}`,
    );
    assert.equal(
      isValidZizmorVersion(sample),
      false,
      `parser should reject ${sample}`,
    );
  }
});

test("assert-zizmor-action-pin contract passes on repository workflows", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", SCRIPT],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});