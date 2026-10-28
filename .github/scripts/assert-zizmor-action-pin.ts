/**
 * Single source of truth: zizmor-action SHA in workflow-security.yml.
 * Emits GITHUB_OUTPUT zizmor-action-ref and fail-closed checks for CI self-test drift.
 */
import { appendFileSync, readFileSync } from "node:fs";

const WORKFLOW_SECURITY = ".github/workflows/workflow-security.yml";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const ZIZMOR_USES =
  /zizmorcore\/zizmor-action@([0-9a-f]{40})\s*(?:#\s*v[\d.]+)?/g;
const CI_CHECKOUT_REF =
  /repository:\s*zizmorcore\/zizmor-action[\s\S]*?\n\s*ref:\s*([0-9a-f]{40})\s*(?:#\s*v[\d.]+)?/;

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
assertCiCheckoutMatches(ciYaml, pin);

const outputFile = process.env.GITHUB_OUTPUT;
if (outputFile) {
  appendFileSync(outputFile, `zizmor-action-ref=${pin}\n`);
}

console.log(`zizmor-action pin OK (${pin})`);
