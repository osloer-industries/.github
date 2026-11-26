import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessDependabotPullRequest,
  dependabotCommitsTrustworthy,
  parseDependabotCommitMetadata,
} from "./dependabot-auto-merge-preflight.ts";

test("dependabotCommitsTrustworthy rejects mixed authors", () => {
  const mixed = dependabotCommitsTrustworthy([
    { author: { login: "dependabot[bot]" } },
    { author: { login: "tn819" } },
  ]);
  assert.equal(mixed.proceed, false);
  if (mixed.proceed) {
    assert.fail("expected mixed-author refusal");
  }
  assert.match(mixed.reason, /tn819/);
});

test("dependabotCommitsTrustworthy accepts dependabot-only commits", () => {
  assert.deepEqual(
    dependabotCommitsTrustworthy([{ author: { login: "dependabot[bot]" } }]),
    { proceed: true },
  );
});

test("parseDependabotCommitMetadata reads update type and group", () => {
  const message = `Bump lodash

version-update:semver-minor
dependency-group: dev-dependencies`;
  assert.deepEqual(parseDependabotCommitMetadata(message), {
    updateType: "version-update:semver-minor",
    dependencyGroup: "dev-dependencies",
  });
});

test("assessDependabotPullRequest skips untrusted commits", () => {
  const result = assessDependabotPullRequest([
    {
      author: { login: "dependabot[bot]" },
      commit: { message: "version-update:semver-patch" },
    },
    { author: { login: "osloer-reviewer[bot]" } },
  ]);
  assert.equal(result.proceed, false);
  assert.equal(result.updateType, "");
});