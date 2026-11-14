import assert from "node:assert/strict";
import {
  findNeedsFailures,
  parseNeedsJson,
  runCiPassedGate,
} from "./ci-passed-gate.ts";

assert.deepEqual(findNeedsFailures({ lint: { result: "success" } }), []);
assert.deepEqual(findNeedsFailures({ lint: { result: "failure" } }), ["lint: failure"]);
assert.deepEqual(findNeedsFailures({ lint: { result: "skipped" } }), ["lint: skipped"]);
assert.deepEqual(findNeedsFailures({ lint: { result: "cancelled" } }), ["lint: cancelled"]);
assert.deepEqual(findNeedsFailures({}), ["needs context has no jobs (misconfigured ci-passed gate)"]);

assert.throws(() => parseNeedsJson(""), /empty/);
assert.throws(() => parseNeedsJson("[]"), /object/);

assert.equal(
  runCiPassedGate(JSON.stringify({ a: { result: "success" }, b: { result: "success" } })),
  0,
);
assert.equal(runCiPassedGate(JSON.stringify({ a: { result: "failure" } })), 1);
assert.equal(runCiPassedGate(""), 1);

console.log("ci-passed gate unit tests OK");