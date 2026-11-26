/**
 * Single source of truth: zizmor-action SHA and pinned zizmor CLI version in workflow-security.yml.
 * Emits GITHUB_OUTPUT (zizmor-action-ref, zizmor-cli-version) and fail-closed checks for CI drift.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const WORKFLOW_SECURITY = ".github/workflows/workflow-security.yml";
const CI_WORKFLOW = ".github/workflows/ci.yml";
const ZIZMOR_USES = /zizmorcore\/zizmor-action@([0-9a-f]{40})/g;

function isAllDigits(text: string): boolean {
  if (text.length === 0) {
    return false;
  }
  for (const ch of text) {
    if (ch < "0" || ch > "9") {
      return false;
    }
  }
  return true;
}

function leadingDigits(text: string): { digits: string; rest: string } | null {
  let end = 0;
  while (end < text.length) {
    const ch = text[end] ?? "";
    if (ch < "0" || ch > "9") {
      break;
    }
    end++;
  }
  if (end === 0) {
    return null;
  }
  return { digits: text.slice(0, end), rest: text.slice(end) };
}

/** Matches zizmor-action action.sh `version` input validation (parsed, no backtracking regex). */
export function isValidZizmorVersion(version: string): boolean {
  const core = version.startsWith("v") ? version.slice(1) : version;
  const parts = core.split(".");
  if (parts.length < 3) {
    return false;
  }
  const major = parts[0] ?? "";
  const minor = parts[1] ?? "";
  const patchAndSuffix = parts.slice(2).join(".");
  if (!isAllDigits(major) || !isAllDigits(minor)) {
    return false;
  }
  const patch = leadingDigits(patchAndSuffix);
  if (patch === null) {
    return false;
  }
  return isValidZizmorVersionSuffix(patch.rest);
}

function isValidZizmorVersionSuffix(suffix: string): boolean {
  if (suffix === "") {
    return true;
  }
  let rest = suffix;
  if (rest.startsWith("rc")) {
    const tail = leadingDigits(rest.slice(2));
    if (tail === null) {
      return false;
    }
    rest = tail.rest;
  } else if (rest.startsWith("a") || rest.startsWith("b")) {
    const tail = leadingDigits(rest.slice(1));
    if (tail === null) {
      return false;
    }
    rest = tail.rest;
  }
  if (rest === "") {
    return true;
  }
  if (rest.startsWith(".dev")) {
    return isAllDigits(rest.slice(4));
  }
  return false;
}

function versionFromZizmorStepBlock(block: string): string | null {
  for (const line of block.split("\n")) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("version:")) {
      continue;
    }
    return trimmed.slice("version:".length).trim();
  }
  return null;
}

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

function extractZizmorPin(workflowSecurityYaml: string): string {
  const pins: string[] = [];
  let match: RegExpExecArray | null;
  ZIZMOR_USES.lastIndex = 0;
  while ((match = ZIZMOR_USES.exec(workflowSecurityYaml)) !== null) {
    pins.push(match[1]);
  }
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

function runZizmorStepBlock(workflowSecurityYaml: string): string {
  const marker = "- name: Run zizmor";
  const start = workflowSecurityYaml.indexOf(marker);
  if (start < 0) {
    console.error(
      `::error::No "Run zizmor" step found in ${WORKFLOW_SECURITY}`,
    );
    process.exit(1);
  }
  const rest = workflowSecurityYaml.slice(start);
  const nextStep = rest.search(/\n {6}- /);
  if (nextStep < 0) {
    return rest;
  }
  return rest.slice(0, nextStep);
}

function extractPinnedZizmorVersion(workflowSecurityYaml: string): string {
  const block = runZizmorStepBlock(workflowSecurityYaml);
  const rawVersion = versionFromZizmorStepBlock(block);
  if (rawVersion === null) {
    console.error(
      `::error::Run zizmor step in ${WORKFLOW_SECURITY} must set an explicit pinned "version:" input (not omitted — default is latest)`,
    );
    process.exit(1);
  }
  const version = parseYamlScalar(rawVersion);
  if (version === "" || version === "latest" || version === "prerelease") {
    console.error(
      `::error::zizmor "version" in ${WORKFLOW_SECURITY} must be an exact X.Y.Z release, not empty, latest, or prerelease (got ${JSON.stringify(version)})`,
    );
    process.exit(1);
  }
  if (!isValidZizmorVersion(version)) {
    console.error(
      `::error::zizmor "version" in ${WORKFLOW_SECURITY} must match semver (optionally v-prefixed); got ${JSON.stringify(version)}`,
    );
    process.exit(1);
  }
  return version.startsWith("v") ? version.slice(1) : version;
}

function ciCheckoutRef(ciYaml: string): string | null {
  const repoNeedle = "repository: zizmorcore/zizmor-action";
  const repoIndex = ciYaml.indexOf(repoNeedle);
  if (repoIndex < 0) {
    return null;
  }
  const window = ciYaml.slice(repoIndex, repoIndex + 400);
  const refMatch = /ref:\s*([0-9a-f]{40})/.exec(window);
  return refMatch?.[1] ?? null;
}

function assertCiCheckoutMatches(
  ciYaml: string,
  expectedSha: string,
): void {
  const ciRef = ciCheckoutRef(ciYaml);
  if (ciRef === null) {
    return;
  }
  if (ciRef !== expectedSha) {
    console.error(
      `::error::CI self-test zizmor-action checkout ref ${ciRef} does not match ${WORKFLOW_SECURITY} pin ${expectedSha}`,
    );
    process.exit(1);
  }
}

function runAssertZizmorActionPin(): void {
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
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAssertZizmorActionPin();
}