# Agent notes — osloer-industries/.github

Shared reusable GitHub Actions workflows and TypeScript CI gates for the org.

## Agent workflow (org-wide, keep identical across osloer-industries repos)

These rules apply to every agent (Cursor, Grok Bot, any other) working in this repo.

### Quality
- Never cut corners on quality or architecture. Fix root causes. No `continue-on-error`, `|| true`, skipped or deleted tests, lowered thresholds, ignore or suppress comments, `NOSONAR`, exclusions, new lint/Sonar rule exceptions or overrides, audit ignores, `--legacy-peer-deps`, or `--force`.
- SonarCloud issues are resolved only by fixing code, never by marking them false positive or won't-fix.
- Scripts are TypeScript on Node 24, never Python.
- `AGENTS.md` is the only agent instruction file; never add `CLAUDE.md` or tool-specific rule files.

### CI and workflows
- Pin GitHub Actions by full commit SHA with an accurate version comment. Org reusables from `osloer-industries/.github` are pinned `@<full sha> # v0.x.y` (a release tag, never `# main`).
- Every CI job feeds the single `ci-passed` aggregate job, including Workflow security, CodeQL and the SonarCloud zero-issues job. `ci-passed` is the only required status check.
- Only Dependabot patch/minor bumps and patch/minor release PRs auto-merge. Majors (or pre-1.0 breaking changes) never auto-merge; they wait for a human.
- Run the repo's linters, tests and pre-commit checks locally before pushing. The pre-commit hook is never skipped (`--no-verify` is not allowed).
- Push, then stop: do not wait on, watch or poll CI. Failures are handed back to you.

### Pull requests
- Keep PRs focused and reviewable, link the issues they close, and prefer simplification (less code, fewer dependencies, removed duplication).
- Resolve conflicts by merging the base branch in. Never rebase a pushed branch, never force-push, never bypass branch protection.
- A PR is ready for review only when all of these hold: it has no conflicts and is up to date with `main`; every check on the current head is green (pending is not ready); and it has no unresolved review threads, requested changes or open SonarCloud issues. Fix anything short of that yourself. Ask a human only when a real decision or ambiguity needs one.
- Never touch secrets, permissions, repo settings or rulesets without explicit human approval.

## Reusable workflow maintenance (this repository)

- Cross-repo reusable workflows **inline** large TypeScript gates where checkout is unsafe (`codeql-gate-inline.ts`, `zizmor-thresholds-inline.ts`). Workflows that sparse-checkout org scripts (`sonarcloud-zero-issues.yml`, `mutation-changed.yml`, `ci-passed.yml`, `auto-merge.yml`) must checkout at **`${{ job.workflow_sha }}`** (the commit in the caller’s `uses:` pin; not `github.workflow_sha`, which is the caller workflow). CI enforces via `assert-reusables-script-checkout.ts`; optional manual smoke via `reusables-job-context-smoke.yml`.
- Unit tests use **`node --test`** on Node 24; use **`--experimental-strip-types`** only where already used in this repository.
- Do not edit org rulesets, repository settings, or consumer repos from this repository unless explicitly asked.

## SonarCloud zero open issues

- Workflow: `.github/workflows/sonarcloud-zero-issues.yml` (`workflow_call`).
- Canonical script: `.github/scripts/sonarcloud-zero-issues.ts`.
- Stable job check name: **`SonarCloud zero open issues`**. Callers must list this job in **`ci-passed` `needs:`**; org rulesets require only **`ci-passed`**, not this job separately.
- After editing the script, unit tests run in `ci.yml` (`SonarCloud zero issues unit tests`).

## ci-passed aggregate gate

- Workflow: `.github/workflows/ci-passed.yml` (`workflow_call`).
- Canonical script: `.github/scripts/ci-passed-gate.ts` (sparse checkout at `job.workflow_sha`).
- Stable required check name: **`ci-passed`** (override with `job-name` input).
- Caller job must use `if: always()` and pass `needs-json: ${{ toJSON(needs) }}` listing **every** upstream CI job (including Workflow security, CodeQL, and SonarCloud zero open issues).
- Contract: `.github/scripts/assert-ci-passed-workflow.ts`; tests in `ci.yml` (`Auto-merge unit tests` / workflow-security contract job).

## Auto-merge (low-risk PRs)

- Workflow: `.github/workflows/auto-merge.yml` (`workflow_call`).
- Canonical script: `.github/scripts/auto-merge.ts` (sparse checkout at `job.workflow_sha`).
- Stable default check name: job **`Auto-merge`**.
- After editing the script, unit tests run in `ci.yml` (`Auto-merge unit tests`).
- Uses `gh pr merge --auto` only (never direct merge). Caller must use `pull_request`, not `pull_request_target`. Dependabot PRs need `RELEASE_APP_PRIVATE_KEY` as a Dependabot secret when the workflow runs on Dependabot branches.
- Release Please: gate in `.github/scripts/release-please-version-gate.ts` (manifest patch/minor only; no breaking markers; major bumps → label `release:major-hold` for manual merge — majors never auto-merge).
- Org rulesets should require only **`ci-passed`**; auto-merge completes once that check (and any other required checks) is green.

## Mutation (changed src)

- Workflow: `.github/workflows/mutation-changed.yml` (`workflow_call`).
- Canonical script: `.github/scripts/run-mutation-changed.ts` (sparse checkout at `job.workflow_sha`).
- Stable default check name: job **`Mutation`** (override with `job-name`).
- After editing the script, unit tests run in `ci.yml` (`Mutation changed unit tests`).

## Docs

- README: workflow index.
- `docs/consuming-workflows.md`: caller YAML and adoption steps for consumer repositories.