/**
 * Eligibility rules for the org auto-merge reusable workflow (exported for unit tests).
 */

export const DEPENDABOT_LOGIN = "dependabot[bot]";
export const RELEASE_BOT_LOGIN = "osloer-reviewer[bot]";
export const RELEASE_HEAD_PREFIX = "release-please--";
export const OSLOER_REUSABLES_GROUP = "osloer-reusables";

const ELIGIBLE_DEPENDABOT_UPDATE_TYPES = new Set([
  "version-update:semver-patch",
  "version-update:semver-minor",
]);

export const RELEASE_PR_ALLOWLIST_EXACT = new Set([
  "CHANGELOG.md",
  ".release-please-manifest.json",
  "package.json",
  "package-lock.json",
  "version.txt",
]);

export function isDependabotAuthor(authorLogin: string): boolean {
  return authorLogin === DEPENDABOT_LOGIN;
}

export function isReleaseBotAuthor(authorLogin: string): boolean {
  return authorLogin === RELEASE_BOT_LOGIN;
}

export function dependabotUpdateEligible(
  updateType: string,
  _dependencyGroup: string,
): boolean {
  const normalizedType = updateType.trim();
  if (normalizedType === "version-update:semver-major") {
    return false;
  }
  if (ELIGIBLE_DEPENDABOT_UPDATE_TYPES.has(normalizedType)) {
    return true;
  }
  return false;
}

export function releaseHeadRefEligible(headRef: string): boolean {
  return headRef.startsWith(RELEASE_HEAD_PREFIX);
}

export function changelogPathAllowed(filename: string): boolean {
  if (filename === "CHANGELOG.md") {
    return true;
  }
  if (!filename.endsWith("/CHANGELOG.md")) {
    return false;
  }
  return filename.includes("/");
}

export function releasePrFilenameAllowed(filename: string): boolean {
  if (RELEASE_PR_ALLOWLIST_EXACT.has(filename)) {
    return true;
  }
  return changelogPathAllowed(filename);
}

function isVersionOnlyDiffLine(line: string): boolean {
  if (!line.startsWith("+") && !line.startsWith("-")) {
    return false;
  }
  const trimmed = line.slice(1).trim();
  if (!trimmed.startsWith('"version"')) {
    return false;
  }
  const colonPos = trimmed.indexOf(":");
  if (colonPos < 0) {
    return false;
  }
  const valuePart = trimmed.slice(colonPos + 1).trim();
  return valuePart.startsWith('"') && valuePart.indexOf('"', 1) > 0;
}

/**
 * True when a unified diff patch (if present) only adds/removes version field lines.
 */
export function patchTouchesOnlyVersionField(patch: string | undefined): boolean {
  if (patch === undefined || patch.trim().length === 0) {
    return true;
  }
  const lines = patch.split("\n");
  for (const line of lines) {
    if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) {
      continue;
    }
    if (line.startsWith(" ") || line.length === 0) {
      continue;
    }
    if (line.startsWith("+") || line.startsWith("-")) {
      if (!isVersionOnlyDiffLine(line)) {
        return false;
      }
    }
  }
  return true;
}

export interface PullRequestFileLike {
  filename: string;
  patch?: string;
}

export function releasePrFilesEligible(files: PullRequestFileLike[]): boolean {
  if (files.length === 0) {
    return false;
  }
  for (const file of files) {
    const name = file.filename.trim();
    if (!releasePrFilenameAllowed(name)) {
      return false;
    }
    if (name === "package.json" || name === "package-lock.json") {
      if (!patchTouchesOnlyVersionField(file.patch)) {
        return false;
      }
    }
  }
  return true;
}