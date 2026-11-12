# Agent notes — osloer-industries/.github

Shared reusable GitHub Actions workflows and TypeScript CI gates for the org.

## Conventions

- Pin every `uses:` action by **full commit SHA** with a `# vX.Y.Z` comment.
- TypeScript automation runs on **Node 24** (`node --test` for unit tests; `--experimental-strip-types` only where already used).
- No `continue-on-error`, no `|| true`, no skipped tests, no NOSONAR, no lowered thresholds.
- Cross-repo reusable workflows **inline** large TypeScript gates (see `codeql-gate-inline.ts`, `sonarcloud-zero-issues-inline.ts`) so callers do not checkout this repository at runtime.
- Do not edit org rulesets, repository settings, or consumer repos from this repository unless explicitly asked.

## SonarCloud zero open issues

- Workflow: `.github/workflows/sonarcloud-zero-issues.yml` (`workflow_call`).
- Canonical script: `.github/scripts/sonarcloud-zero-issues.ts`.
- Stable required check name: job **`SonarCloud zero open issues`**.
- After editing the script, run `node .github/scripts/sonarcloud-zero-issues-inline.ts --write` and commit both files.

## Docs

- README: workflow index.
- `docs/consuming-workflows.md`: caller YAML and adoption steps for consumer repositories.
