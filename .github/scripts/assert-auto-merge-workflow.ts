/**
 * Contract checks for auto-merge reusable workflow wiring that workflow-security
 * (actionlint + zizmor) does not enforce: sparse-checkout scripts, preflights,
 * gh --auto/--disable-auto only via auto-merge.ts, and org merge gates.
 */
import { readFileSync } from "node:fs";

const REUSABLE = ".github/workflows/auto-merge.yml";

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

function scriptCallsGhPrMergeAuto(script: string): boolean {
  return (
    script.includes('"pr"') &&
    script.includes('"merge"') &&
    script.includes('"--auto"') &&
    script.includes("gh(")
  );
}

function scriptCallsGhPrMergeDisableAuto(script: string): boolean {
  return script.includes('"--disable-auto"') && script.includes("gh(");
}

function reusableChecksOutCallerPrCode(yaml: string): boolean {
  const lines = yaml.split("\n");
  let inCheckoutStep = false;
  let checkoutPinsOrgReusables = false;
  let refsPullRequest = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- uses: actions/checkout@")) {
      inCheckoutStep = true;
      checkoutPinsOrgReusables = false;
      refsPullRequest = false;
      continue;
    }
    if (inCheckoutStep && trimmed.startsWith("- ")) {
      inCheckoutStep = false;
    }
    if (!inCheckoutStep) {
      continue;
    }
    if (trimmed.includes("repository: osloer-industries/.github")) {
      checkoutPinsOrgReusables = true;
    }
    if (trimmed.includes("github.event.pull_request")) {
      refsPullRequest = true;
    }
  }
  return !checkoutPinsOrgReusables && refsPullRequest;
}

let failed = false;

function fail(path: string, message: string): void {
  console.error(`::error::${path}: ${message}`);
  failed = true;
}

const reusable = load(REUSABLE);

if (!reusable.includes("types: [opened, synchronize, reopened, ready_for_review]")) {
  fail(
    REUSABLE,
    "must use pull_request types opened, synchronize, reopened, ready_for_review",
  );
}

if (
  !reusable.includes("github.event.pull_request.user.login == 'dependabot[bot]'")
) {
  fail(
    REUSABLE,
    "Dependabot steps must gate on github.event.pull_request.user.login (not github.actor alone)",
  );
}

if (!reusable.includes("dependabot-auto-merge-preflight.ts")) {
  fail(REUSABLE, "must sparse-checkout dependabot-auto-merge-preflight.ts");
}

if (!reusable.includes("auto-merge-repository-preflight.ts")) {
  fail(REUSABLE, "must sparse-checkout auto-merge-repository-preflight.ts");
}

if (!reusable.includes("id: repository-preflight")) {
  fail(REUSABLE, "must run repository ci-passed safety preflight before eligibility");
}

if (!reusable.includes("steps.repository-preflight.outputs.proceed == 'true'")) {
  fail(REUSABLE, "downstream steps must gate on repository safety preflight proceed");
}

if (!reusable.includes("id: dependabot-preflight")) {
  fail(REUSABLE, "must run Dependabot pull request preflight before fetch-metadata");
}

if (!reusable.includes("steps.dependabot-preflight.outputs.proceed == 'true'")) {
  fail(REUSABLE, "dependabot/fetch-metadata must run only when preflight proceed is true");
}

const requiredPins: { needle: string; label: string }[] = [
  {
    needle: "dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98",
    label: "dependabot/fetch-metadata",
  },
  {
    needle: "actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510",
    label: "actions/create-github-app-token",
  },
];

for (const pin of requiredPins) {
  if (!reusable.includes(pin.needle)) {
    fail(REUSABLE, `missing pinned ${pin.label}`);
  }
}

if (!reusable.includes("gh pr merge") && !reusable.includes("auto-merge.ts")) {
  fail(REUSABLE, "must enable merge through auto-merge.ts (gh pr merge --auto)");
}

const script = load(".github/scripts/auto-merge.ts");
if (!scriptCallsGhPrMergeAuto(script)) {
  fail(".github/scripts/auto-merge.ts", 'must call gh(["pr", "merge", ..., "--auto", ...]) only');
}

if (!scriptCallsGhPrMergeDisableAuto(script)) {
  fail(".github/scripts/auto-merge.ts", 'must call gh pr merge --disable-auto when eligibility fails');
}

if (!reusable.includes("Sync auto-merge state")) {
  fail(REUSABLE, "final step must sync auto-merge (enable or disable)");
}

if (reusableChecksOutCallerPrCode(reusable)) {
  fail(REUSABLE, "must not checkout pull request code from the caller repository");
}

if (!reusable.includes("permission-pull-requests: write")) {
  fail(REUSABLE, "create-github-app-token must request permission-pull-requests: write");
}

if (!reusable.includes("permission-issues: write")) {
  fail(REUSABLE, "create-github-app-token must request permission-issues: write (release:major-hold label)");
}

if (!reusable.includes("PR_BODY: ${{ github.event.pull_request.body }}")) {
  fail(REUSABLE, "must pass PR body for Release Please breaking-change detection");
}

if (!reusable.includes("release-please-version-gate.ts")) {
  fail(REUSABLE, "must sparse-checkout release-please-version-gate.ts");
}

const gateScript = load(".github/scripts/release-please-version-gate.ts");
if (!gateScript.includes("RELEASE_MAJOR_HOLD_LABEL")) {
  fail(".github/scripts/release-please-version-gate.ts", "must define release:major-hold label");
}

if (!reusable.includes("job.workflow_sha || github.sha")) {
  fail(REUSABLE, "script checkout must use job.workflow_sha with github.sha fallback");
}

if (reusable.includes("inputs.merge-method || 'merge'")) {
  fail(
    REUSABLE,
    "MERGE_METHOD fallback must be squash to match merge-method input default",
  );
}

if (!reusable.includes("inputs.merge-method || 'squash'")) {
  fail(REUSABLE, "MERGE_METHOD must fall back to squash when merge-method input is empty");
}

if (failed) {
  process.exit(1);
}

console.log("auto-merge workflow contracts OK.");