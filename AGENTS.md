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

## ci-passed aggregate gate

- Workflow: `.github/workflows/ci-passed.yml` (`workflow_call`).
- Canonical script: `.github/scripts/ci-passed-gate.ts` (sparse checkout at `job.workflow_sha`).
- Stable required check name: **`ci-passed`** (override with `job-name` input).
- Caller job must use `if: always()` and pass `needs-json: ${{ toJSON(needs) }}` listing every upstream job.
- Contract: `.github/scripts/assert-ci-passed-workflow.ts`; tests in `ci.yml` (`Auto-merge unit tests` / workflow-security contract job).

## Auto-merge (low-risk PRs)

- Workflow: `.github/workflows/auto-merge.yml` (`workflow_call`).
- Canonical script: `.github/scripts/auto-merge.ts` (sparse checkout at `job.workflow_sha`).
- Stable default check name: job **`Auto-merge`**.
- After editing the script, unit tests run in `ci.yml` (`Auto-merge unit tests`).
- Uses `gh pr merge --auto` only (never direct merge). Caller must use `pull_request`, not `pull_request_target`. Dependabot PRs need `RELEASE_APP_PRIVATE_KEY` as a Dependabot secret when the workflow runs on Dependabot branches.
- Release Please: gate in `.github/scripts/release-please-version-gate.ts` (manifest patch/minor only; no breaking markers; major bumps → label `release:major-hold`).
- Org rulesets should require only **`ci-passed`**; auto-merge completes once that check (and any other required checks) is green.

## Mutation (changed src)

- Workflow: `.github/workflows/mutation-changed.yml` (`workflow_call`).
- Canonical script: `.github/scripts/run-mutation-changed.ts` (sparse checkout at `job.workflow_sha`).
- Stable default check name: job **`Mutation`** (override with `job-name`).
- After editing the script, unit tests run in `ci.yml` (`Mutation changed unit tests`).

## Docs

- README: workflow index.
- `docs/consuming-workflows.md`: caller YAML and adoption steps for consumer repositories.
