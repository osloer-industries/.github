import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CI_PASSED_CONTEXT,
  ciPassedRequiredInContexts,
  contextsFromBranchProtection,
  contextsFromRulesetRules,
  evaluateCiPassedPreflight,
  isCiPassedContext,
} from "./auto-merge-repository-preflight.ts";

test("isCiPassedContext accepts ci-passed variants", () => {
  assert.equal(isCiPassedContext(CI_PASSED_CONTEXT), true);
  assert.equal(isCiPassedContext("CI / ci-passed"), true);
  assert.equal(isCiPassedContext("quality"), false);
});

test("contextsFromRulesetRules", () => {
  const contexts = contextsFromRulesetRules([
    {
      type: "required_status_checks",
      parameters: {
        required_status_checks: [{ context: "ci-passed" }],
      },
    },
  ]);
  assert.deepEqual(contexts, ["ci-passed"]);
});

test("contextsFromBranchProtection legacy and modern", () => {
  const legacy = contextsFromBranchProtection({
    required_status_checks: { contexts: ["ci-passed"] },
  });
  assert.deepEqual(legacy, ["ci-passed"]);
  const modern = contextsFromBranchProtection({
    required_status_checks: { checks: [{ context: "CI / ci-passed" }] },
  });
  assert.deepEqual(modern, ["CI / ci-passed"]);
});

test("evaluateCiPassedPreflight", () => {
  assert.deepEqual(evaluateCiPassedPreflight(["lint"]), {
    proceed: false,
    reason:
      "default branch does not require the ci-passed status check; skipping auto-merge to avoid immediate merges.",
  });
  assert.deepEqual(ciPassedRequiredInContexts(["CI / ci-passed"]), true);
  assert.deepEqual(evaluateCiPassedPreflight(["CI / ci-passed"]), { proceed: true });
});