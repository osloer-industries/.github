/**
 * AGENTS.md must embed .github/agents-org-workflow-block.md verbatim (org-wide drift guard).
 */
import { readFileSync } from "node:fs";

const AGENTS = "AGENTS.md";
const BLOCK = ".github/agents-org-workflow-block.md";

function load(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    console.error(`::error::Could not read ${path}`);
    process.exit(1);
  }
}

const agents = load(AGENTS).replaceAll("\r\n", "\n");
const block = load(BLOCK).replaceAll("\r\n", "\n").trim();

if (!agents.includes(block)) {
  console.error(
    `::error::${AGENTS} must contain ${BLOCK} verbatim. Update one or the other so the org Agent workflow block stays canonical.`,
  );
  process.exit(1);
}

console.log(`${AGENTS} embeds the canonical org Agent workflow block from ${BLOCK}.`);