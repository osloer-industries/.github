# Agent notes — osloer-industries/.github

Shared reusable GitHub Actions workflows and TypeScript CI gates for the org.

## Conventions

- Pin every `uses:` action by **full commit SHA** with a `# vX.Y.Z` comment.
- TypeScript automation runs on **Node 24** (`node --test` for unit tests; `--experimental-strip-types` only where already used).
- No `continue-on-error`, no `|| true`, no skipped tests, no NOSONAR, no lowered thresholds.
- Cross-repo reusable workflows **inline** large TypeScript gates where checkout is unsafe (`codeql-gate-inline.ts`, `zizmor-thresholds-inline.ts`). Workflows that sparse-checkout org scripts (`sonarcloud-zero-issues.yml`, `mutation-changed.yml`) must checkout at **`${{ job.workflow_sha }}`** (the commit in the caller’s `uses:` pin; not `github.workflow_sha`, which is the caller workflow). CI enforces via `assert-reusables-script-checkout.ts`; optional manual smoke via `reusables-job-context-smoke.yml`.
- Do not edit org rulesets, repository settings, or consumer repos from this repository unless explicitly asked.

## SonarCloud zero open issues

- Workflow: `.github/workflows/sonarcloud-zero-issues.yml` (`workflow_call`).
- Canonical script: `.github/scripts/sonarcloud-zero-issues.ts`.
- Stable required check name: job **`SonarCloud zero open issues`**.
- After editing the script, unit tests run in `ci.yml` (`SonarCloud zero issues unit tests`).

## Mutation (changed src)

- Workflow: `.github/workflows/mutation-changed.yml` (`workflow_call`).
- Canonical script: `.github/scripts/run-mutation-changed.ts` (sparse checkout at `job.workflow_sha`).
- Stable default check name: job **`Mutation`** (override with `job-name`).
- After editing the script, unit tests run in `ci.yml` (`Mutation changed unit tests`).

## Docs

- README: workflow index.
- `docs/consuming-workflows.md`: caller YAML and adoption steps for consumer repositories.
