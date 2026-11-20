/**
 * Contract checks for this repository's thin semantic PR title caller workflow.
 */
import { readFileSync } from "node:fs";

const CALLER = ".github/workflows/pr-title.yml";
const REUSABLE =
  "osloer-industries/.github/.github/workflows/semantic-pull-request.yml@";
const FULL_SHA_RE = /@[0-9a-f]{40}\s+#\s+v[\d.]+\s*$/m;

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

let failed = false;

function fail(path: string, message: string): void {
  console.error(`::error::${path}: ${message}`);
  failed = true;
}

const caller = load(CALLER);

if (caller.includes("pull_request_target:")) {
  fail(CALLER, "must not use pull_request_target");
}

if (!caller.includes("types: [opened, reopened, edited, synchronize]")) {
  fail(
    CALLER,
    "must use pull_request types opened, reopened, edited, synchronize",
  );
}

if (!caller.includes("permissions:\n  contents: read")) {
  fail(CALLER, "workflow permissions must be contents: read only");
}

if (!caller.includes("pull-requests: read")) {
  fail(CALLER, "semantic-title job must grant pull-requests: read");
}

if (caller.includes("uses: ./")) {
  fail(CALLER, "must not use same-repository uses: ./ (zizmor self-repository)");
}

if (!caller.includes(REUSABLE)) {
  fail(CALLER, "must call org semantic-pull-request reusable workflow");
}

const usesLine = caller
  .split("\n")
  .map((line) => line.trim())
  .find((line) => line.includes("uses:") && line.includes(REUSABLE));
if (usesLine === undefined) {
  fail(CALLER, "missing uses: line for semantic-pull-request reusable");
} else if (!FULL_SHA_RE.test(usesLine)) {
  fail(CALLER, "semantic reusable pin must use full SHA with # vX.Y.Z comment");
}

if (failed) {
  process.exit(1);
}

console.log("pr-title workflow contracts OK.");