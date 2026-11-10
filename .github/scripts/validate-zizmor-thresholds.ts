/**
 * Fail-closed validation for zizmor-action min-severity / min-confidence.
 * Allowed values match zizmor-action@53290badfa369cb0bf7ad16342cb62c2fa47ac7b action.yml.
 * Empty string means omit the flag (report all findings — strictest fail-closed default).
 */

/** @see https://github.com/zizmorcore/zizmor-action action.yml inputs.min-severity */
export const MIN_SEVERITY_ALLOWED = [
  "",
  "unknown",
  "informational",
  "low",
  "medium",
  "high",
] as const;

/** @see https://github.com/zizmorcore/zizmor-action action.yml inputs.min-confidence */
export const MIN_CONFIDENCE_ALLOWED = [
  "",
  "unknown",
  "low",
  "medium",
  "high",
] as const;

function usageList(values: readonly string[]): string {
  const shown = values.filter((v) => v.length > 0);
  return `omit or empty (strictest), ${shown.join(", ")}`;
}

export function validateZizmorThresholds(
  minSeverity: string,
  minConfidence: string,
): void {
  if (!MIN_SEVERITY_ALLOWED.includes(minSeverity as (typeof MIN_SEVERITY_ALLOWED)[number])) {
    console.error(
      `::error::Invalid min-severity ${JSON.stringify(minSeverity)}. Allowed: ${usageList(MIN_SEVERITY_ALLOWED)}`,
    );
    process.exit(1);
  }
  if (
    !MIN_CONFIDENCE_ALLOWED.includes(
      minConfidence as (typeof MIN_CONFIDENCE_ALLOWED)[number],
    )
  ) {
    console.error(
      `::error::Invalid min-confidence ${JSON.stringify(minConfidence)}. Allowed: ${usageList(MIN_CONFIDENCE_ALLOWED)}`,
    );
    process.exit(1);
  }
  if (minSeverity === "unknown" || minConfidence === "unknown") {
    console.warn(
      "::warning::min-severity/min-confidence 'unknown' is deprecated in zizmor; prefer empty default for full reporting.",
    );
  }
}

const minSeverity = process.env.ZIZMOR_MIN_SEVERITY ?? "";
const minConfidence = process.env.ZIZMOR_MIN_CONFIDENCE ?? "";

validateZizmorThresholds(minSeverity, minConfidence);
console.log("zizmor threshold inputs OK");
