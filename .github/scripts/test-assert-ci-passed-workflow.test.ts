import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./assert-ci-passed-workflow.ts", import.meta.url));

const result = spawnSync(process.execPath, ["--experimental-strip-types", SCRIPT], {
  cwd: fileURLToPath(new URL("../..", import.meta.url)),
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr);
console.log("assert-ci-passed-workflow contract self-test OK");