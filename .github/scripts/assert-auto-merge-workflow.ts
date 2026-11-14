/**
 * Contract checks for auto-merge reusable workflow and caller (pinned actions, no
 * pull_request_target, no PR checkout, auto-merge only via gh --auto).
 */
import { readFileSync } from "node:fs";

const REUSABLE = ".github/workflows/auto-merge.yml";
const CALLER = ".github/workflows/auto-merge-caller.yml";

const FULL_SHA_RE = /@[0-9a-f]{40}\s+#\s+v[\d.]+\s*$/;

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

function linesWithUses(yaml: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.includes("uses:")) {
      out.push({ line: i + 1, text: line.trim() });
    }
  }
  return out;
}

function usesLineHasFullShaPin(text: string): boolean {
  return FULL_SHA_RE.exec(text) !== null;
}

function usesLineHas40CharSha(text: string): boolean {
  const at = text.indexOf("@");
  if (at < 0) {
    return false;
  }
  const sha = text.slice(at + 1, at + 41);
  if (sha.length !== 40) {
    return false;
  }
  const HEX_DIGITS = "0123456789abcdef";
  for (const ch of sha) {
    if (!HEX_DIGITS.includes(ch)) {
      return false;
    }
  }
  return true;
}

function scriptCallsGhPrMergeAuto(script: string): boolean {
  return (
    script.includes('"pr"') &&
    script.includes('"merge"') &&
    script.includes('"--auto"') &&
    script.includes("gh(")
  );
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

function hasReadOnlyJobPermissions(yaml: string): boolean {
  return yaml.includes("contents: read") && yaml.includes("pull-requests: read");
}

let failed = false;

function fail(path: string, message: string): void {
  console.error(`::error::${path}: ${message}`);
  failed = true;
}

const reusable = load(REUSABLE);
const caller = load(CALLER);

if (reusable.includes("pull_request_target:")) {
  fail(REUSABLE, "must not use pull_request_target");
}

if (caller.includes("pull_request_target:")) {
  fail(CALLER, "must not use pull_request_target");
}

if (!caller.includes("types: [opened, synchronize, reopened, ready_for_review]")) {
  fail(CALLER, "caller must use pull_request types opened, synchronize, reopened, ready_for_review");
}

if (
  !reusable.includes("github.event.pull_request.user.login == 'dependabot[bot]'")
) {
  fail(
    REUSABLE,
    "Dependabot steps must gate on github.event.pull_request.user.login (not github.actor alone)",
  );
}

for (const { line, text } of linesWithUses(reusable)) {
  if (text.includes("uses: ./")) {
    continue;
  }
  if (!usesLineHas40CharSha(text)) {
    fail(REUSABLE, `line ${line} uses: must pin a full commit SHA: ${text}`);
  }
  if (!usesLineHasFullShaPin(text) && text.includes("@")) {
    fail(REUSABLE, `line ${line} uses: must include # vX.Y.Z comment: ${text}`);
  }
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

if (reusable.includes("persist-credentials: true")) {
  fail(REUSABLE, "checkout must not set persist-credentials: true");
}

if (reusableChecksOutCallerPrCode(reusable)) {
  fail(REUSABLE, "must not checkout pull request code from the caller repository");
}

if (!hasReadOnlyJobPermissions(reusable)) {
  fail(REUSABLE, "job permissions must be contents: read and pull-requests: read only");
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

if (!reusable.includes("job.workflow_sha")) {
  fail(REUSABLE, "script checkout must use job.workflow_sha");
}

if (failed) {
  process.exit(1);
}

console.log("auto-merge workflow contracts OK.");