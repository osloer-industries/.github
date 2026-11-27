import assert from "node:assert/strict";
import { test } from "node:test";
import { pathTriggersCodeql, resolveRunCodeql } from "./ci-paths-run-codeql.ts";

test("pathTriggersCodeql matches analyzable code and workflow paths", () => {
  assert.equal(pathTriggersCodeql("src/index.ts"), true);
  assert.equal(pathTriggersCodeql("lib/foo.ts"), true);
  assert.equal(pathTriggersCodeql("app/page.tsx"), true);
  assert.equal(pathTriggersCodeql("api/route.ts"), true);
  assert.equal(pathTriggersCodeql("_api/handler.ts"), true);
  assert.equal(pathTriggersCodeql("scripts/ci/foo.ts"), true);
  assert.equal(pathTriggersCodeql(".github/workflows/ci.yml"), true);
  assert.equal(pathTriggersCodeql("package.json"), false);
  assert.equal(pathTriggersCodeql("docs/foo.md"), false);
  assert.equal(pathTriggersCodeql("README.md"), false);
});

test("resolveRunCodeql on push and schedule when full CI runs", () => {
  assert.equal(resolveRunCodeql([], "push", true), true);
  assert.equal(resolveRunCodeql([], "schedule", true), true);
  assert.equal(resolveRunCodeql([], "merge_group", true), true);
  assert.equal(resolveRunCodeql([], "push", false), false);
});

test("resolveRunCodeql on pull_request only when code paths change", () => {
  assert.equal(resolveRunCodeql(["docs/foo.md"], "pull_request", true), false);
  assert.equal(resolveRunCodeql([".github/dependabot.yml"], "pull_request", true), false);
  assert.equal(resolveRunCodeql([".github/workflows/ci.yml"], "pull_request", true), true);
  assert.equal(resolveRunCodeql(["src/a.ts", "docs/x.md"], "pull_request", true), true);
});