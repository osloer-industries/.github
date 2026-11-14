import assert from "node:assert/strict";
import {
  DEPENDABOT_LOGIN,
  RELEASE_BOT_LOGIN,
  dependabotUpdateEligible,
  patchTouchesOnlyVersionField,
  releasePrFilesEligible,
  releasePrFilenameAllowed,
} from "./auto-merge-eligibility.ts";
import { evaluateEligibility, type AutoMergeEnv } from "./auto-merge.ts";

function baseCfg(overrides: Partial<AutoMergeEnv> = {}): AutoMergeEnv {
  return {
    allowDependabot: true,
    allowReleasePrs: true,
    authorLogin: DEPENDABOT_LOGIN,
    headRef: "dependabot/npm_and_yarn-foo-1.2.3",
    mergeMethod: "squash",
    prNumber: 1,
    repository: "osloer-industries/example",
    dependabotUpdateType: "version-update:semver-patch",
    dependabotDependencyGroup: "",
    token: "token",
    ...overrides,
  };
}

assert.equal(dependabotUpdateEligible("version-update:semver-patch", ""), true);
assert.equal(dependabotUpdateEligible("version-update:semver-minor", ""), true);
assert.equal(dependabotUpdateEligible("version-update:semver-major", ""), false);
assert.equal(dependabotUpdateEligible("version-update:semver-major", "osloer-reusables"), false);

assert.equal(releasePrFilenameAllowed("CHANGELOG.md"), true);
assert.equal(releasePrFilenameAllowed("packages/foo/CHANGELOG.md"), true);
assert.equal(releasePrFilenameAllowed("README.md"), false);

assert.equal(
  patchTouchesOnlyVersionField(`@@\n-"version": "1.0.0"\n+"version": "1.0.1"`),
  true,
);
assert.equal(
  patchTouchesOnlyVersionField(`@@\n+"description": "x"`),
  false,
);

assert.equal(
  releasePrFilesEligible([
    { filename: "CHANGELOG.md" },
    { filename: "package.json", patch: '+  "version": "1.0.1",' },
  ]),
  true,
);
assert.equal(
  releasePrFilesEligible([{ filename: "src/index.ts" }]),
  false,
);

assert.equal(evaluateEligibility(baseCfg()).eligible, true);
assert.equal(
  evaluateEligibility(
    baseCfg({ dependabotUpdateType: "version-update:semver-major" }),
  ).eligible,
  false,
);

assert.equal(
  evaluateEligibility(
    baseCfg({
      authorLogin: RELEASE_BOT_LOGIN,
      headRef: "release-please--branches--main",
      dependabotUpdateType: "",
    }),
  ).eligible,
  true,
);

assert.equal(
  evaluateEligibility(
    baseCfg({
      authorLogin: RELEASE_BOT_LOGIN,
      headRef: "feature/foo",
    }),
  ).eligible,
  false,
);

console.log("auto-merge eligibility unit tests OK");