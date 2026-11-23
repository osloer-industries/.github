# Agent notes — osloer-industries/.github

Shared reusable GitHub Actions workflows and TypeScript CI gates for the org.

<!-- org-agent-workflow:start v0.1.4 -->

## Agent workflow (org-wide, keep identical across osloer-industries repos)

These rules apply to every agent (Cursor, Grok Bot, any other) working in this repo.

### Quality

- Never cut corners on quality or architecture. Fix root causes. No `continue-on-error`, `|| true`, skipped or
  deleted tests, lowered thresholds, ignore or suppress comments, `NOSONAR`, exclusions, new lint/Sonar rule
  exceptions or overrides, audit ignores, `--legacy-peer-deps`, or `--force`.
- SonarCloud issues are resolved only by fixing code, never by marking them false positive or won't-fix.
- Scripts are TypeScript, never Python; use the repo's runtime and package manager (`engines` / `packageManager`).
- `AGENTS.md` is the only agent instruction file; never add `CLAUDE.md` or tool-specific rule files.

### CI and workflows

- Pin GitHub Actions by full commit SHA with an accurate version comment. Org reusables from
  `osloer-industries/.github` are pinned `@<full sha> # v0.x.y` (a release tag, never `# main`).
- Every CI job feeds the single `ci-passed` aggregate job, including Workflow security, CodeQL and the SonarCloud
  zero-issues job. `ci-passed` is the only required status check.
- Only Dependabot patch/minor bumps and patch/minor release PRs auto-merge. Majors (or pre-1.0 breaking changes)
  never auto-merge; they wait for a human.
- Run the repo's linters, tests and pre-commit checks locally before pushing. The pre-commit hook is never skipped
  (`--no-verify` is not allowed).
- Never poll CI from the shell. If your environment delivers CI notifications for the PR head, wait for them and fix
  failures; otherwise push and stop.

### Pull requests

- Keep PRs focused and reviewable, link the issues they close, and prefer simplification (less code, fewer
  dependencies, removed duplication).
- Resolve conflicts by merging the base branch in. Never rebase a pushed branch, never force-push, never bypass
  branch protection.
- A PR is ready for review only when all of these hold: it has no conflicts and is up to date with `main`; every check
  on the current head is green (pending is not ready); and it has no unresolved review threads, requested changes or
  open SonarCloud issues. Fix anything short of that yourself. Ask a human only when a real decision or ambiguity
  needs one.
- Never touch secrets, permissions, repo settings or rulesets without explicit human approval.

<!-- org-agent-workflow:end -->

## Reusable workflow maintenance (this repository)

- Like `workflow-security.yml`, `agents-md-lint.yml` also lists `pull_request` / `push` to `main` so this repository exercises
  the reusable without a same-repo `uses: ./…` caller in `ci.yml`.
- Cross-repo reusable workflows **inline** large TypeScript gates only where checkout is unsafe
  (`.github/scripts/zizmor-thresholds-inline.ts` in `workflow-security.yml`).
- Workflows that sparse-checkout org scripts (`sonarcloud-zero-issues.yml`, `mutation-changed.yml`, `ci-passed.yml`,
  `auto-merge.yml`, `agents-md-lint.yml`, `codeql-javascript-typescript.yml`) must checkout at
  **`${{ job.workflow_sha }}`** (the commit in the caller’s `uses:` pin; not `github.workflow_sha`, which is the caller
  workflow).
- CI enforces via `.github/scripts/assert-reusables-script-checkout.ts`; optional manual smoke via
  `.github/workflows/reusables-job-context-smoke.yml`.
- Canonical org Agent workflow block for fleet drift checks: `.github/agents-org-workflow-block.md` (markers + body; gate
  compares whitespace-normalised content and marker version).
- Consumer repositories under **osloer-industries** should embed the block from `.github/agents-org-workflow-block.md`
  at their reusables pin (marker version must match the pin’s block file).
- TypeScript under `.github/scripts/**` is type-checked and linted via `.github/package.json` (`npm run check` in CI).
- Unit tests use **`node --test`** on Node 24; use **`--experimental-strip-types`** only where already used in this
  repository.
- Do not edit org rulesets, repository settings, or consumer repos from this repository unless explicitly asked.

## SonarCloud zero open issues

- Workflow: `.github/workflows/sonarcloud-zero-issues.yml` (`workflow_call`).
- Canonical script: `.github/scripts/sonarcloud-zero-issues.ts`.
- Stable job check name: **`SonarCloud zero open issues`**. Callers must list this job in **`ci-passed` `needs:`**; org
  rulesets require only **`ci-passed`**, not this job separately.
- After editing the script, unit tests run in `.github/workflows/ci.yml` (`SonarCloud zero issues unit tests`).

## ci-passed aggregate gate

- Canonical script: `.github/scripts/ci-passed-gate.ts`.
- Preferred caller: composite action `.github/actions/ci-passed-gate` (one job, no nested `workflow_call`).
- Legacy caller: `.github/workflows/ci-passed.yml` (`workflow_call`; composite inside by default).
- Stable required check name: **`ci-passed`** (override with `job-name` input on the reusable workflow).
- Caller job must use `if: always()` and pass `needs-json: ${{ toJSON(needs) }}` listing **every** upstream CI job.
- **Docs-only PRs:** start CI with `.github/workflows/ci-paths-scope.yml`; gate other jobs with
  `if: needs.ci-paths-scope.outputs.run-full-ci == 'true'`. When `run-full-ci` is `false`, skipped heavy jobs still
  pass **`ci-passed`**.
- **CodeQL on PRs:** default `if` to `push` / `schedule` / `merge_group` only; gate tolerates `codeql` **skipped** on
  `pull_request`.
- **Workflow security:** run only when `workflows-changed` is `true` (or on `push` when desired); gate tolerates
  **skipped** `workflow-security`.
- **Sonar zero-open:** list the PR-only caller in `ci-passed` `needs:` with `if: github.event_name == 'pull_request'`.
  That job may be **skipped** only on non–`pull_request` events.
- Contract: `.github/scripts/assert-ci-passed-workflow.ts`; unit tests in `.github/scripts/test-ci-passed-gate.test.ts`.

## Auto-merge (low-risk PRs)

- Workflow: `.github/workflows/auto-merge.yml` (`workflow_call`).
- Canonical script: `.github/scripts/auto-merge.ts` (sparse checkout at `job.workflow_sha`).
- Stable default check name: job **`Auto-merge`**.
- After editing the script, unit tests run in `.github/workflows/ci.yml` (`Auto-merge unit tests`).
- Uses `gh pr merge --auto` only (never direct merge). Caller must use `pull_request`, not `pull_request_target`.
- Dependabot PRs need `RELEASE_APP_PRIVATE_KEY` as a Dependabot secret when the workflow runs on Dependabot branches.
- Release Please: gate in `.github/scripts/release-please-version-gate.ts` (manifest patch/minor only; no breaking
  markers; major bumps → label `release:major-hold` for manual merge — majors never auto-merge).
- Org rulesets should require only **`ci-passed`**; auto-merge completes once that check (and any other required checks)
  is green.

## Dependency review (GHAS-free OSV on private)

- Workflow: `.github/workflows/dependency-review.yml` (`workflow_call`).
- Private / `mode: osv` delegates to Google **osv-scanner-reusable-pr** (pin + `# v2.x.y` in
  `.github/workflows/dependency-review.yml`; nested `upload-sarif: false`, `fail-on-vuln: false`; gate job enforces
  with **osv-reporter-action** and uploads **`osv-sarif-${{ github.run_id }}`**).
- Required check name: **`Review dependency changes`** only. Nested job display name **`OSV PR scan (private repos only)`**
  (skipped on public repos). Nested job also uploads **`OSV Scanner SARIF file`** (5-day retention).
- Caller job must grant **`contents: read`**, **`actions: read`**, **`pull-requests: read`**, and **`security-events: write`**
  (nested OSV `osv-scan` requires `security-events: write`; GitHub validates that at workflow startup even when `mode: auto`
  skips OSV on a public repo). See the reusable workflow header comment and `docs/consuming-workflows.md`.

## CodeQL (JavaScript and TypeScript)

- Workflow: `.github/workflows/codeql-javascript-typescript.yml` (`workflow_call`).
- Canonical script: `.github/scripts/codeql-sarif-security-gate.ts` (sparse checkout at `job.workflow_sha` when
  `code-scanning-upload` is false).
- Stable default check name: job **`Analyze JavaScript and TypeScript`**.
- After editing the script, unit tests run in `.github/workflows/codeql-gate-ci.yml` (fixture unit tests and live
  vulnerable-fixture gate).

## Mutation (changed src)

- Workflow: `.github/workflows/mutation-changed.yml` (`workflow_call`).
- Canonical script: `.github/scripts/run-mutation-changed.ts` (sparse checkout at `job.workflow_sha`).
- Stable default check name: job **`Mutation`** (override with `job-name`).
- After editing the script, unit tests run in `.github/workflows/ci.yml` (`Mutation changed unit tests`).

## AGENTS.md lint (fleet desloppify)

- Workflow: `.github/workflows/agents-md-lint.yml` (`workflow_call` plus `pull_request` / `push` to `main` on this
  repository).
- Canonical script: `.github/scripts/agents-md-lint.ts`; shared markdownlint config `.github/.markdownlint-cli2.jsonc` +
  `.github/.markdownlint.json` (lockfile under `.github/package-lock.json`).
- Stable default check name: job **`AGENTS.md lint`** (override with `job-name`).
- After editing the script, unit tests run in `.github/workflows/ci.yml` (`AGENTS.md lint unit tests`).
- Checks: markdownlint (no inline config bypass), size budget, filler warnings and emoji errors, package script
  citations, backtick repo paths, versioned org Agent workflow block, tracked forbidden instruction files (`git ls-files`
  denylist aligned with template `check:no-claude-md` scope).

## Docs

- README: workflow index.
- `docs/consuming-workflows.md`: caller YAML and adoption steps for consumer repositories.
