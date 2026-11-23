import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findNeedsFailures,
  isDocsOnlyCiScope,
  parseNeedsJson,
  parseSonarZeroIssuesJobId,
  runCiPassedGate,
} from "./ci-passed-gate.ts";

test("findNeedsFailures accepts success only by default", () => {
  assert.deepEqual(findNeedsFailures({ lint: { result: "success" } }), []);
  assert.deepEqual(findNeedsFailures({ lint: { result: "failure" } }), ["lint: failure"]);
  assert.deepEqual(findNeedsFailures({ lint: { result: "skipped" } }), ["lint: skipped"]);
  assert.deepEqual(findNeedsFailures({ lint: { result: "cancelled" } }), ["lint: cancelled"]);
  assert.deepEqual(findNeedsFailures({}), [
    "needs context has no jobs (misconfigured ci-passed gate)",
  ]);
});

test("allows sonar-zero-open-issues skipped on push", () => {
  const needs = {
    "sonar-zero-open-issues": { result: "skipped" },
    quality: { result: "success" },
  };
  assert.deepEqual(findNeedsFailures(needs, "push"), []);
  assert.deepEqual(findNeedsFailures(needs, "schedule"), []);
});

test("allows codeql skipped on pull_request", () => {
  const needs = {
    codeql: { result: "skipped" },
    quality: { result: "success" },
  };
  assert.deepEqual(findNeedsFailures(needs, "pull_request"), []);
  assert.deepEqual(findNeedsFailures(needs, "push"), ["codeql: skipped"]);
});

test("allows workflow-security skipped when workflows unchanged", () => {
  const needs = {
    "workflow-security": { result: "skipped" },
    quality: { result: "success" },
  };
  assert.deepEqual(findNeedsFailures(needs, "pull_request"), []);
  assert.deepEqual(findNeedsFailures(needs, "push"), []);
});

test("allows upstream jobs skipped on docs-only scope", () => {
  const needs = {
    "ci-paths-scope": {
      result: "success",
      outputs: { "run-full-ci": "false" },
    },
    quality: { result: "skipped" },
    codeql: { result: "skipped" },
    "workflow-security": { result: "skipped" },
  };
  assert.deepEqual(findNeedsFailures(needs, "pull_request"), []);
  assert.equal(isDocsOnlyCiScope(needs, "ci-paths-scope"), true);
});

test("docs-only scope still requires ci-paths-scope success", () => {
  const needs = {
    "ci-paths-scope": { result: "failure" },
    quality: { result: "skipped" },
  };
  assert.deepEqual(findNeedsFailures(needs, "pull_request"), [
    "ci-paths-scope: failure",
    "quality: skipped",
  ]);
});

test("rejects sonar-zero-open-issues skipped, cancelled, or missing on pull_request", () => {
  const skipped = { "sonar-zero-open-issues": { result: "skipped" } };
  const cancelled = { "sonar-zero-open-issues": { result: "cancelled" } };
  const missing = { "sonar-zero-open-issues": { result: "" } };
  assert.deepEqual(findNeedsFailures(skipped, "pull_request"), ["sonar-zero-open-issues: skipped"]);
  assert.deepEqual(findNeedsFailures(cancelled, "pull_request"), [
    "sonar-zero-open-issues: cancelled",
  ]);
  assert.deepEqual(findNeedsFailures(missing, "pull_request"), [
    "sonar-zero-open-issues: missing result",
  ]);
  assert.deepEqual(
    findNeedsFailures({ "sonar-zero-open-issues": { result: "success" } }, "pull_request"),
    [],
  );
});

test("rejects sonar-zero-open-issues failure on any event", () => {
  const needs = { "sonar-zero-open-issues": { result: "failure" } };
  assert.deepEqual(findNeedsFailures(needs, "push"), ["sonar-zero-open-issues: failure"]);
  assert.deepEqual(findNeedsFailures(needs, "pull_request"), ["sonar-zero-open-issues: failure"]);
});

test("does not allow arbitrary jobs skipped on push", () => {
  assert.deepEqual(findNeedsFailures({ quality: { result: "skipped" } }, "push"), [
    "quality: skipped",
  ]);
  assert.deepEqual(findNeedsFailures({ "harness-approval": { result: "skipped" } }, "push"), [
    "harness-approval: skipped",
  ]);
});

test("parseSonarZeroIssuesJobId rejects multiple job ids", () => {
  assert.throws(
    () => parseSonarZeroIssuesJobId("sonar-zero-open-issues,harness-approval"),
    /comma/i,
  );
  assert.throws(() => parseSonarZeroIssuesJobId("a,b"), /single job id/);
  assert.equal(parseSonarZeroIssuesJobId("custom-sonar-gate"), "custom-sonar-gate");
  assert.equal(parseSonarZeroIssuesJobId(undefined), "sonar-zero-open-issues");
});

test("renamed sonar job id may skip on push only for that id", () => {
  const needs = { "custom-sonar-gate": { result: "skipped" }, quality: { result: "success" } };
  assert.deepEqual(findNeedsFailures(needs, "push", "custom-sonar-gate"), []);
  assert.deepEqual(findNeedsFailures(needs, "push", "sonar-zero-open-issues"), [
    "custom-sonar-gate: skipped",
  ]);
});

test("runCiPassedGate rejects comma-separated SONAR_ZERO_ISSUES_JOB", () => {
  assert.equal(
    runCiPassedGate(
      JSON.stringify({ a: { result: "success" } }),
      "push",
      "sonar-zero-open-issues,other",
    ),
    1,
  );
});

test("requires GITHUB_EVENT_NAME to allow Sonar skip off pull_request", () => {
  assert.deepEqual(findNeedsFailures({ "sonar-zero-open-issues": { result: "skipped" } }), [
    "sonar-zero-open-issues: skipped",
  ]);
});

test("parseNeedsJson fails closed on invalid input", () => {
  assert.throws(() => parseNeedsJson(""), /empty/);
  assert.throws(() => parseNeedsJson("[]"), /object/);
  assert.throws(() => parseNeedsJson(JSON.stringify({ job: { result: 1 } })), /invalid/);
});

test("runCiPassedGate exit codes", () => {
  assert.equal(
    runCiPassedGate(
      JSON.stringify({ a: { result: "success" }, b: { result: "success" } }),
      "push",
    ),
    0,
  );
  assert.equal(runCiPassedGate(JSON.stringify({ a: { result: "failure" } }), "pull_request"), 1);
  assert.equal(runCiPassedGate(""), 1);
  assert.equal(
    runCiPassedGate(
      JSON.stringify({
        "sonar-zero-open-issues": { result: "skipped" },
        quality: { result: "success" },
      }),
      "push",
    ),
    0,
  );
});