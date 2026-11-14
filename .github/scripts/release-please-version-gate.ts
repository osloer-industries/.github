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

const BREAKING_BODY_RE = /BREAKING CHANGE|⚠\s*BREAKING CHANGES/i;

export function parseSemVer(version: string): SemVerParts | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
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

const MANIFEST_LINE =
  /^([+-])\s*(?:"((?:\\.|[^"\\])*)"|([^:]+?))\s*:\s*"((?:\\.|[^"\\])*)"\s*,?\s*$/;

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
    if (!line.startsWith("+") && !line.startsWith("-")) {
      continue;
    }
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    const parsed = MANIFEST_LINE.exec(line);
    if (!parsed) {
      continue;
    }
    const sign = parsed[1];
    const component = (parsed[2] ?? parsed[3] ?? "").trim();
    const version = parsed[4] ?? "";
    if (component.length === 0 || version.length === 0) {
      return null;
    }
    if (sign === "-") {
      before.set(component, version);
    } else {
      after.set(component, version);
    }
  }
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

export function textContainsBreakingMarker(text: string): boolean {
  return BREAKING_BODY_RE.test(text);
}

export function changelogPatchesContainBreaking(files: PullRequestFileLike[]): boolean {
  for (const file of files) {
    const name = file.filename;
    if (name !== "CHANGELOG.md" && !name.endsWith("/CHANGELOG.md")) {
      continue;
    }
    const patch = file.patch ?? "";
    for (const line of patch.split("\n")) {
      if (!line.startsWith("+")) {
        continue;
      }
      if (line.startsWith("+++")) {
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

export function evaluateReleaseVersionGate(
  files: PullRequestFileLike[],
  prBody: string,
): ReleaseVersionGateResult {
  const manifestFile = files.find((f) => f.filename === MANIFEST_FILENAME);
  if (manifestFile === undefined) {
    return {
      autoMerge: false,
      majorHold: false,
      reason: "release PR is missing .release-please-manifest.json",
      parseError: true,
    };
  }

  const changes = parseManifestVersionChangesFromPatch(manifestFile.patch);
  if (changes === null || changes.length === 0) {
    return {
      autoMerge: false,
      majorHold: false,
      reason: "could not parse .release-please-manifest.json version diff",
      parseError: true,
    };
  }

  const breaking =
    textContainsBreakingMarker(prBody) || changelogPatchesContainBreaking(files);

  for (const change of changes) {
    if (change.bump === "major") {
      return {
        autoMerge: false,
        majorHold: true,
        reason: `component ${JSON.stringify(change.component)} bumps major (${change.from} → ${change.to})`,
        changes,
      };
    }
  }

  if (breaking) {
    return {
      autoMerge: false,
      majorHold: true,
      reason: "release PR body or CHANGELOG contains a breaking-change marker",
      changes,
    };
  }

  for (const change of changes) {
    if (change.bump !== "patch" && change.bump !== "minor") {
      return {
        autoMerge: false,
        majorHold: false,
        reason: `component ${JSON.stringify(change.component)} has unsupported bump ${change.bump}`,
        parseError: true,
      };
    }
  }

  return { autoMerge: true, changes };
}