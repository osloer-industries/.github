import assert from "node:assert/strict";
import {
  classifyVersionBump,
  evaluateReleaseVersionGate,
  parseManifestVersionChangesFromPatch,
} from "./release-please-version-gate.ts";

const patchManifest = `@@
-  ".": "0.1.1"
+  ".": "0.1.2"
`;

const minorManifest = `@@
-  ".": "0.1.1"
+  ".": "0.2.0"
`;

const majorToOneOh = `@@
-  ".": "0.1.9"
+  ".": "1.0.0"
`;

const majorPostOne = `@@
-  ".": "1.0.0"
+  ".": "2.0.0"
`;

const multiManifest = `@@
-  ".": "0.1.0",
-  "packages/a": "1.0.0"
+  ".": "0.1.1",
+  "packages/a": "1.1.0"
`;

const multiMajorComponent = `@@
-  ".": "0.1.0",
-  "packages/a": "1.0.0"
+  ".": "0.1.1",
+  "packages/a": "2.0.0"
`;

const breakingChangelog = {
  filename: "CHANGELOG.md",
  patch: `@@\n+## [0.2.0]\n+\n+### ⚠ BREAKING CHANGES\n+\n+* new api`,
};

assert.equal(classifyVersionBump("0.1.1", "0.1.2"), "patch");
assert.equal(classifyVersionBump("0.1.1", "0.2.0"), "minor");
assert.equal(classifyVersionBump("0.1.9", "1.0.0"), "major");
assert.equal(classifyVersionBump("1.0.0", "2.0.0"), "major");

const patchChanges = parseManifestVersionChangesFromPatch(patchManifest);
assert.ok(patchChanges);
assert.equal(patchChanges.length, 1);
assert.equal(patchChanges[0]?.bump, "patch");

const gatePatch = evaluateReleaseVersionGate(
  [{ filename: ".release-please-manifest.json", patch: patchManifest }, { filename: "CHANGELOG.md" }],
  "chore: release 0.1.2",
);
assert.equal(gatePatch.autoMerge, true);

const gateMinor = evaluateReleaseVersionGate(
  [{ filename: ".release-please-manifest.json", patch: minorManifest }, { filename: "CHANGELOG.md" }],
  "feat: widgets",
);
assert.equal(gateMinor.autoMerge, true);

const gateMajor = evaluateReleaseVersionGate(
  [{ filename: ".release-please-manifest.json", patch: majorToOneOh }],
  "chore: release",
);
assert.equal(gateMajor.autoMerge, false);
if (!gateMajor.autoMerge && "majorHold" in gateMajor) {
  assert.equal(gateMajor.majorHold, true);
}

const gateMajorTwo = evaluateReleaseVersionGate(
  [{ filename: ".release-please-manifest.json", patch: majorPostOne }],
  "",
);
assert.equal(gateMajorTwo.autoMerge, false);

const gateBreakingMinor = evaluateReleaseVersionGate(
  [
    { filename: ".release-please-manifest.json", patch: minorManifest },
    breakingChangelog,
  ],
  "",
);
assert.equal(gateBreakingMinor.autoMerge, false);
if (!gateBreakingMinor.autoMerge && "majorHold" in gateBreakingMinor) {
  assert.equal(gateBreakingMinor.majorHold, true);
}

const gateBreakingBody = evaluateReleaseVersionGate(
  [{ filename: ".release-please-manifest.json", patch: minorManifest }],
  "feat!: drop old api\n\nBREAKING CHANGE: removed",
);
assert.equal(gateBreakingBody.autoMerge, false);

const gateMulti = evaluateReleaseVersionGate(
  [
    { filename: ".release-please-manifest.json", patch: multiManifest },
    { filename: "CHANGELOG.md" },
  ],
  "",
);
assert.equal(gateMulti.autoMerge, true);

const gateMultiMajor = evaluateReleaseVersionGate(
  [{ filename: ".release-please-manifest.json", patch: multiMajorComponent }],
  "",
);
assert.equal(gateMultiMajor.autoMerge, false);

const gateMalformed = evaluateReleaseVersionGate(
  [{ filename: ".release-please-manifest.json", patch: "@@\n+not json\n" }],
  "",
);
assert.equal(gateMalformed.autoMerge, false);
if (!gateMalformed.autoMerge && "parseError" in gateMalformed) {
  assert.equal(gateMalformed.parseError, true);
}

assert.equal(parseManifestVersionChangesFromPatch(undefined), null);

console.log("release-please version gate unit tests OK");