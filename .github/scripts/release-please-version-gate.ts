/**
 * Release Please release-PR version and breaking-change gate for auto-merge.
 */

import type { PullRequestFileLike } from "./auto-merge-eligibility.ts";

export const RELEASE_MAJOR_HOLD_LABEL = "release:major-hold";
export const MANIFEST_FILENAME = ".release-please-manifest.json";

export interface SemVerParts {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemVer(version: string): SemVerParts | null {
  const trimmed = version.trim();
  const plusIdx = trimmed.indexOf("+");
  const dashIdx = trimmed.indexOf("-");
  let end = trimmed.length;
  if (plusIdx >= 0) {
    end = Math.min(end, plusIdx);
  }
  if (dashIdx >= 0) {
    end = Math.min(end, dashIdx);
  }
  const core = trimmed.slice(0, end);
  const parts = core.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }
  return { major, minor, patch };
}

export type VersionBumpKind = "patch" | "minor" | "major" | "none" | "invalid";

export function classifyVersionBump(from: string, to: string): VersionBumpKind {
  const a = parseSemVer(from);
  const b = parseSemVer(to);
  if (a === null || b === null) {
    return "invalid";
  }
  if (b.major > a.major) {
    return "major";
  }
  if (b.major < a.major) {
    return "invalid";
  }
  if (b.minor > a.minor) {
    return "minor";
  }
  if (b.minor < a.minor) {
    return "invalid";
  }
  if (b.patch > a.patch) {
    return "patch";
  }
  if (b.patch === a.patch && b.minor === a.minor && b.major === a.major) {
    return "none";
  }
  return "invalid";
}

export interface ComponentVersionChange {
  component: string;
  from: string;
  to: string;
  bump: VersionBumpKind;
}

interface ManifestLineParsed {
  sign: string;
  component: string;
  version: string;
}

function parseManifestDiffLine(line: string): ManifestLineParsed | null {
  if (line.startsWith("+++") || line.startsWith("---")) {
    return null;
  }
  if (!line.startsWith("+") && !line.startsWith("-")) {
    return null;
  }
  const sign = line[0] ?? "";
  const trimmed = line.slice(1).trim();
  const colonPos = trimmed.indexOf(":");
  if (colonPos < 0) {
    return null;
  }
  const keyRaw = trimmed.slice(0, colonPos).trim();
  if (keyRaw.length < 2 || !keyRaw.startsWith('"') || !keyRaw.endsWith('"')) {
    return null;
  }
  const component = keyRaw.slice(1, -1);
  const afterColon = trimmed.slice(colonPos + 1).trim();
  if (!afterColon.startsWith('"')) {
    return null;
  }
  const closeQuote = afterColon.indexOf('"', 1);
  if (closeQuote < 0) {
    return null;
  }
  const version = afterColon.slice(1, closeQuote);
  if (component.length === 0 || version.length === 0) {
    return null;
  }
  return { sign, component, version };
}

function buildComponentChanges(
  before: Map<string, string>,
  after: Map<string, string>,
): ComponentVersionChange[] | null {
  const keys = new Set([...before.keys(), ...after.keys()]);
  if (keys.size === 0) {
    return null;
  }
  const changes: ComponentVersionChange[] = [];
  for (const component of keys) {
    const from = before.get(component);
    const to = after.get(component);
    if (from === undefined || to === undefined) {
      return null;
    }
    const bump = classifyVersionBump(from, to);
    if (bump === "invalid" || bump === "none") {
      return null;
    }
    changes.push({ component, from, to, bump });
  }
  return changes;
}

/**
 * Parse unified diff lines for .release-please-manifest.json version keys.
 */
export function parseManifestVersionChangesFromPatch(
  patch: string | undefined,
): ComponentVersionChange[] | null {
  if (patch === undefined || patch.trim().length === 0) {
    return null;
  }
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  for (const line of patch.split("\n")) {
    const parsed = parseManifestDiffLine(line);
    if (parsed === null) {
      continue;
    }
    if (parsed.sign === "-") {
      before.set(parsed.component, parsed.version);
    } else {
      after.set(parsed.component, parsed.version);
    }
  }
  return buildComponentChanges(before, after);
}

export function textContainsBreakingMarker(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("breaking change")) {
    return true;
  }
  const warningIdx = text.indexOf("⚠");
  if (warningIdx >= 0) {
    const after = text.slice(warningIdx).toLowerCase();
    if (after.includes("breaking changes")) {
      return true;
    }
  }
  return false;
}

export function changelogPatchesContainBreaking(files: PullRequestFileLike[]): boolean {
  for (const file of files) {
    const name = file.filename;
    if (name !== "CHANGELOG.md" && !name.endsWith("/CHANGELOG.md")) {
      continue;
    }
    const patch = file.patch ?? "";
    for (const line of patch.split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) {
        continue;
      }
      if (textContainsBreakingMarker(line)) {
        return true;
      }
    }
  }
  return false;
}

export type ReleaseVersionGateResult =
  | { autoMerge: true; changes: ComponentVersionChange[] }
  | { autoMerge: false; majorHold: true; reason: string; changes: ComponentVersionChange[] }
  | { autoMerge: false; majorHold: false; reason: string; parseError: boolean };

function parseErrorResult(reason: string): ReleaseVersionGateResult {
  return { autoMerge: false, majorHold: false, reason, parseError: true };
}

function majorHoldResult(
  reason: string,
  changes: ComponentVersionChange[],
): ReleaseVersionGateResult {
  return { autoMerge: false, majorHold: true, reason, changes };
}

function findMajorBump(
  changes: ComponentVersionChange[],
): ComponentVersionChange | undefined {
  for (const change of changes) {
    if (change.bump === "major") {
      return change;
    }
  }
  return undefined;
}

function allBumpsPatchOrMinor(changes: ComponentVersionChange[]): boolean {
  for (const change of changes) {
    if (change.bump !== "patch" && change.bump !== "minor") {
      return false;
    }
  }
  return true;
}

export function evaluateReleaseVersionGate(
  files: PullRequestFileLike[],
  prBody: string,
): ReleaseVersionGateResult {
  const manifestFile = files.find((f) => f.filename === MANIFEST_FILENAME);
  if (manifestFile === undefined) {
    return parseErrorResult("release PR is missing .release-please-manifest.json");
  }

  const changes = parseManifestVersionChangesFromPatch(manifestFile.patch);
  if (changes === null || changes.length === 0) {
    return parseErrorResult("could not parse .release-please-manifest.json version diff");
  }

  const majorBump = findMajorBump(changes);
  if (majorBump !== undefined) {
    return majorHoldResult(
      `component ${JSON.stringify(majorBump.component)} bumps major (${majorBump.from} → ${majorBump.to})`,
      changes,
    );
  }

  const breaking =
    textContainsBreakingMarker(prBody) || changelogPatchesContainBreaking(files);
  if (breaking) {
    return majorHoldResult(
      "release PR body or CHANGELOG contains a breaking-change marker",
      changes,
    );
  }

  if (!allBumpsPatchOrMinor(changes)) {
    const bad = changes.find((c) => c.bump !== "patch" && c.bump !== "minor");
    const label = bad?.bump ?? "unknown";
    const component = bad?.component ?? "";
    return parseErrorResult(
      `component ${JSON.stringify(component)} has unsupported bump ${label}`,
    );
  }

  return { autoMerge: true, changes };
}