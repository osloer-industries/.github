/**
 * Single source of truth: zizmor-action SHA and pinned zizmor CLI version in workflow-security.yml.
 * Emits GITHUB_OUTPUT (zizmor-action-ref, zizmor-cli-version) and fail-closed checks for CI drift.
 */
import { appendFileSync, readFileSync } from "node:fs";

const WORKFLOW_SECURITY = ".github/workflows/workflow-security.yml";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const ZIZMOR_USES =
  /zizmorcore\/zizmor-action@([0-9a-f]{40})\s*(?:#\s*v[\d.]+)?/g;
const CI_CHECKOUT_REF =
  /repository:\s*zizmorcore\/zizmor-action[\s\S]*?\n\s*ref:\s*([0-9a-f]{40})\s*(?:#\s*v[\d.]+)?/;
const RUN_ZIZMOR_STEP =
  /- name: Run zizmor\r?\n([\s\S]*?)(?=\r?\n      - |\r?\n    [a-z]|\r?\njobs:|\r?\n[^\s]|$)/;
/** Matches zizmor-action action.sh `version` input validation */
const ZIZMOR_VERSION_REGEX =
  /^v?[0-9]+\.[0-9]+\.[0-9]+((a|b|rc)[0-9]+)?(\.dev[0-9]+)?$/;

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

function extractZizmorPin(workflowSecurityYaml: string): string {
  const pins = [...workflowSecurityYaml.matchAll(ZIZMOR_USES)].map((m) => m[1]);
  if (pins.length === 0) {
    console.error(
      `::error::No zizmorcore/zizmor-action@<40-char-sha> pin found in ${WORKFLOW_SECURITY}`,
    );
    process.exit(1);
  }
  const unique = [...new Set(pins)];
  if (unique.length > 1) {
    console.error(
      `::error::Multiple different zizmor-action SHAs in ${WORKFLOW_SECURITY}: ${unique.join(", ")}`,
    );
    process.exit(1);
  }
  return unique[0];
}

function parseYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("${{")) {
    return trimmed;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractPinnedZizmorVersion(workflowSecurityYaml: string): string {
  const stepMatch = workflowSecurityYaml.match(RUN_ZIZMOR_STEP);
  if (!stepMatch) {
    console.error(
      `::error::No "Run zizmor" step found in ${WORKFLOW_SECURITY}`,
    );
    process.exit(1);
  }
  const block = stepMatch[1];
  const versionMatch = block.match(/^\s+version:\s*(.+)\s*$/m);
  if (!versionMatch) {
    console.error(
      `::error::Run zizmor step in ${WORKFLOW_SECURITY} must set an explicit pinned "version:" input (not omitted — default is latest)`,
    );
    process.exit(1);
  }
  const version = parseYamlScalar(versionMatch[1]);
  if (version === "" || version === "latest" || version === "prerelease") {
    console.error(
      `::error::zizmor "version" in ${WORKFLOW_SECURITY} must be an exact X.Y.Z release, not empty, latest, or prerelease (got ${JSON.stringify(version)})`,
    );
    process.exit(1);
  }
  if (!ZIZMOR_VERSION_REGEX.test(version)) {
    console.error(
      `::error::zizmor "version" in ${WORKFLOW_SECURITY} must match semver (optionally v-prefixed); got ${JSON.stringify(version)}`,
    );
    process.exit(1);
  }
  return version.startsWith("v") ? version.slice(1) : version;
}

function assertCiCheckoutMatches(
  ciYaml: string,
  expectedSha: string,
): void {
  const match = ciYaml.match(CI_CHECKOUT_REF);
  if (!match) {
    return;
  }
  const ciRef = match[1];
  if (ciRef !== expectedSha) {
    console.error(
      `::error::CI self-test zizmor-action checkout ref ${ciRef} does not match ${WORKFLOW_SECURITY} pin ${expectedSha}`,
    );
    process.exit(1);
  }
}

const workflowSecurity = load(WORKFLOW_SECURITY);
const ciYaml = load(CI_WORKFLOW);
const pin = extractZizmorPin(workflowSecurity);
const cliVersion = extractPinnedZizmorVersion(workflowSecurity);
assertCiCheckoutMatches(ciYaml, pin);

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  appendFileSync(outputFile, `zizmor-action-ref=${pin}\n`);
  appendFileSync(outputFile, `zizmor-cli-version=${cliVersion}\n`);
}

console.log(`zizmor-action pin OK (${pin}), zizmor CLI version ${cliVersion}`);
