# Consuming org reusable workflows

Reusable workflows live in this repository under `.github/workflows/`. Call them from any org repository with an immutable commit SHA (update via Dependabot `ci(deps)` pull requests).

## Pinning contract

`osloer-industries/.github` publishes semver Git tags (`v0.1.0`, `v0.2.0`, … until `v1.0.0`) on each release. Consumer repos must pin the **commit SHA** behind a tag, not a branch, and document the release in an end-of-line comment.

```yaml
uses: osloer-industries/.github/.github/workflows/workflow-security.yml@a1b2c3d4e5f6789012345678901234567890abcd # v0.1.0
```

| Do | Do not |
| --- | --- |
| Full 40-character commit SHA from a [release](https://github.com/osloer-industries/.github/releases) | `@main`, `@master`, or any moving branch |
| Trailing `# v0.x.y` matching the release tag | `# main` or other branch names in the comment |
| Bump all org reusables together (see Dependabot below) | Mixed pins on different SHAs across workflows |

Replace `REUSABLES_SHA` and the comment in the examples below with the release you adopt.

```text
uses: osloer-industries/.github/.github/workflows/<file>.yml@REUSABLES_SHA # v0.x.y
```

### Dependabot (consumer repos)

Dependabot `github-actions` version updates bump both marketplace actions and **reusable workflow** `uses:` references, including SHA pins. A `# v0.x.y` comment (as in the example above) lets Dependabot map the pin to a release and open a pull request when a newer tag exists ([changelog](https://github.blog/changelog/2023-03-13-dependabot-updates-support-reusable-workflows-for-github-actions/), [docs](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-version-updates)).

Add or merge this into `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    commit-message:
      prefix: "ci(deps)"
    groups:
      osloer-reusables:
        patterns:
          - "osloer-industries/.github*"
```

The `osloer-reusables` group keeps every `osloer-industries/.github` reusable on the same SHA in a single weekly pull request.

## Cloud Agents and CI

Org **AGENTS.md** (in this repository and copied into consumer repos) requires Cloud Agents to **subscribe to GitHub CI on the PR head branch** after each push, then end the turn and react to failure notifications—**not** poll Actions in the shell. Propagate the **Agent workflow** section from [`AGENTS.md`](../AGENTS.md) when adopting reusables in a new repository.

## Available reusables

| Workflow file | Check name(s) | Caller triggers |
| --- | --- | --- |
| `semantic-pull-request.yml` | Semantic pull request | `pull_request` (types: opened, reopened, edited, synchronize) |
| `codeql-javascript-typescript.yml` | Analyze JavaScript and TypeScript | `pull_request`, `push` to default branch, optional weekly `schedule` |
| `dependency-review.yml` | Review dependency changes | `pull_request` |
| `release-please.yml` | Prepare or publish release | `push` to default branch, `workflow_dispatch` |
| `sonarqube-cloud-node.yml` | Analyze | `pull_request`, `push` to default branch |
| `sonarcloud-zero-issues.yml` | SonarCloud zero open issues | `pull_request` (all base branches — no `branches:` filter) |
| `node-npm-quality.yml` | Quality (override with `job-name`) | `pull_request`, `push` to default branch |
| `mutation-changed.yml` | Mutation (override with `job-name`) | `pull_request`, `push` to default branch |
| `node-setup-smoke.yml` | Setup smoke (matrix) | `pull_request`, `push` to default branch |
| `workflow-security.yml` | Workflow security (actionlint + zizmor) | `pull_request`, `push` to default branch |
| `auto-merge.yml` | Auto-merge (optional; osloer-reviewer) | `pull_request` (types: opened, synchronize, reopened, ready_for_review) |
| `ci-passed.yml` | Aggregate required check | Called as the final job in the main CI workflow |
| `agents-md-lint.yml` | AGENTS.md lint (override with `job-name`) | `pull_request`, `push` to default branch |

### Reusable workflow inputs (workflow security)

| Input | Default | Purpose |
| --- | --- | --- |
| `min-severity` | `""` (empty) | zizmor minimum severity to **report**. Empty omits `--min-severity` so all severities are reported (strictest org default). Set `medium` or `high` to hide lower-severity findings and relax the gate. |
| `min-confidence` | `""` (empty) | zizmor minimum confidence to **report**. Empty omits `--min-confidence` so all confidence levels are reported (strictest org default). Set `medium` or `high` to hide lower-confidence findings and relax the gate. |

Allowed values match the pinned `zizmor-action` (`informational`, `low`, `medium`, `high` for severity; `low`, `medium`, `high` for confidence; `unknown` is accepted but deprecated by zizmor — use empty instead). Invalid values fail the job before zizmor runs.

### Reusable workflow inputs (Node)

| Workflow | Input | Default | Purpose |
| --- | --- | --- | --- |
| `node-npm-quality.yml` | `package-manager` | `npm` | `npm` (default) or `bun`; any other value fails the job |
| `node-npm-quality.yml` | `bun-version-file` | `""` | Optional Bun version file when `package-manager: bun` (passed to `setup-bun`) |
| `node-npm-quality.yml` | `check-npm-script` | `check` | npm script passed to `npm run` for the quality gate |
| `node-npm-quality.yml` | `project-root` | `""` | Optional subdirectory for install, audit, and run (empty = repo root) |
| `node-npm-quality.yml` | `npm-prefixes-json` | `"[]"` | JSON array of extra `--prefix` paths for `npm ci` and `npm audit` (monorepo helpers, e.g. `["packages/eslint-sonarjs"]`) |
| `node-npm-quality.yml` | `fetch-depth` | `1` | Checkout depth; use `0` when PR jobs run git-based helpers (guardrail notice, changed-path gates) |
| `node-npm-quality.yml` | `pr-pre-check-script` | *(empty)* | Caller script run with `node` on `pull_request` only; sets `GUARDRAIL_BASE_REF` to the PR base SHA |
| `mutation-changed.yml` | `package-manager` | `npm` | `npm` or `bun` for install and full mutation script |
| `mutation-changed.yml` | `bun-version-file` | `""` | Optional Bun version file when `package-manager: bun` |
| `mutation-changed.yml` | `full-npm-script` | `test:mutation` | npm script for full `src/` mutation on default-branch `push` |
| `sonarqube-cloud-node.yml` | `package-manager` | `npm` | `npm` or `bun` for install and coverage script |
| `sonarqube-cloud-node.yml` | `bun-version-file` | `""` | Optional Bun version file when `package-manager: bun` |
| `sonarqube-cloud-node.yml` | `coverage-npm-script` | `test:coverage` | npm script that generates coverage before Sonar upload |
| `sonarcloud-zero-issues.yml` | `project-key` | *(empty → `osloer-industries_<repo>`)* | SonarCloud project key |
| `sonarcloud-zero-issues.yml` | `organization` | `osloer-industries` | Organization segment of the default project key |
| `sonarcloud-zero-issues.yml` | `timeout-minutes` | `20` | Max wait for PR analysis at head SHA |
| `sonarcloud-zero-issues.yml` | `poll-interval-seconds` | `10` | Delay between SonarCloud API polls |
| `sonarcloud-zero-issues.yml` | `issues-settle-polls` | `3` | Consecutive matching open-issue API pages before enforcing zero issues |
| `sonarcloud-zero-issues.yml` | `issues-min-polls` | `3` | Minimum issue API polls before a stable empty snapshot can pass |
| `sonarcloud-zero-issues.yml` | `ce-task-id` | *(empty)* | Sonar `ceTaskId` from `report-task.txt` (`sonarqube-cloud-node.yml` job output `ce-task-id`); polls `api/ce/task` until SUCCESS |
| `node-setup-smoke.yml` | `package-manager` | `npm` | `npm` or `bun` for install and setup script |
| `node-setup-smoke.yml` | `bun-version-file` | `""` | Optional Bun version file when `package-manager: bun` |
| `node-setup-smoke.yml` | `project-root` | `""` | Optional subdirectory for install and run (empty = repo root) |
| `node-setup-smoke.yml` | `setup-npm-script` | `setup` | npm script for the setup CLI |
| `node-setup-smoke.yml` | `smoke-name-prefix` | `@smoke/` | Prefix for `--name`; matrix scenario and `-template` are appended |
| `codeql-javascript-typescript.yml` | `code-scanning-upload` | `true` | When `false`, skips Code Scanning upload (no GHAS required); SARIF artifact + security gate |
| `codeql-javascript-typescript.yml` | `fail-on-sarif-level` | `error` | With `code-scanning-upload: false`, fail on security-tagged SARIF at this level or above |
| `codeql-javascript-typescript.yml` | `source-root` | *(empty)* | Optional directory passed to CodeQL init as `source-root`; empty analyzes from the repository root |

Callers that previously passed full shell commands should switch to npm script names only (for example `check-npm-script: check` instead of `check-command: npm run check`).

### Package manager (`npm` vs `bun`)

Reusables that install dependencies and run `package.json` scripts accept `package-manager` (`npm` | `bun`, default `npm`). Invalid values fail before install. Shared install/audit/run logic lives in `.github/actions/package-manager/package-manager.ts`, sparse-checked out from `osloer-industries/.github` at **`job.workflow_sha`** (same pin as the reusable `uses:` — no `./` self-repo path; actionlint does not allow `${{ job.workflow_sha }}` in `uses:` for org composite actions). The composite `action.yml` in that directory mirrors the same commands for tooling audits.

| `package-manager` | Setup | Install | Run | Audit |
| --- | --- | --- | --- | --- |
| `npm` (default) | `actions/setup-node` with `cache: npm` | `npm ci` (`--ignore-scripts` when enabled) | `npm run` | `npm audit --omit=dev` |
| `bun` | `oven-sh/setup-bun` (optional `bun-version-file`) | `bun install --frozen-lockfile` (`--ignore-scripts` when enabled) | `bun run` | `bun audit --production` |

**Bun caller example (quality):**

```yaml
jobs:
  quality:
    uses: osloer-industries/.github/.github/workflows/node-npm-quality.yml@REUSABLES_SHA # v0.x.y
    with:
      package-manager: bun
      bun-version-file: .bun-version
      check-npm-script: check
```

**Documented limitations when using `bun`:**

- **`sonarqube-cloud-node.yml`:** Only install and the coverage script use Bun; Sonar still reads `sonar-project.properties` in the caller (lcov/XML paths must match whatever `bun run <coverage-npm-script>` emits).
- **`mutation-changed.yml`:** Pull-request mutation still shells out to `node_modules/.bin/stryker`; callers need Stryker and config compatible with Bun-installed `node_modules`.
- **`node-setup-smoke.yml`:** Default `scenarios-json` includes `npm-package`; Bun repos should pass a trimmed list (for example `'["plugin","mcp","cli"]'`).

Omit `package-manager` (or set `npm`) to keep existing npm behavior unchanged.

This repository's [`ci.yml`](.github/workflows/ci.yml) exercise **npm and bun** via mirrored steps aligned with `node-npm-quality.yml` and `node-setup-smoke.yml` on `test-fixtures/package-manager-smoke/{npm,bun}` (`github.sha` substitutes for `job.workflow_sha` when testing the current commit). Same-repo `workflow_call` with `uses: ./…` fails zizmor `self-repository`; `${{ github.sha }}` in `uses:` fails actionlint — so **Sonar zero open issues** is an **inlined** job in `ci.yml`, and **auto-merge** lists `pull_request` on the reusable workflow (no thin caller).

## Caller examples

### Semantic pull request title

This repository runs the same thin caller as consumers via [`.github/workflows/pr-title.yml`](../.github/workflows/pr-title.yml) (org pin at the latest release tag; bump the SHA when cutting a new reusables release).

```yaml
name: Pull request title

on:
  pull_request:
    types: [opened, reopened, edited, synchronize]

permissions:
  contents: read

jobs:
  semantic-title:
    uses: osloer-industries/.github/.github/workflows/semantic-pull-request.yml@REUSABLES_SHA # v0.x.y
```

### CodeQL

```yaml
name: CodeQL

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 3 * * 1"

permissions:
  contents: read
  security-events: write

concurrency:
  group: codeql-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    uses: osloer-industries/.github/.github/workflows/codeql-javascript-typescript.yml@REUSABLES_SHA # v0.x.y
```

Private repositories without GitHub Advanced Security cannot upload to Code Scanning. Use artifact mode so CodeQL still gates merges on security findings:

```yaml
name: CodeQL

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  actions: read

concurrency:
  group: codeql-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    uses: osloer-industries/.github/.github/workflows/codeql-javascript-typescript.yml@REUSABLES_SHA # v0.x.y
    permissions:
      contents: read
      actions: read
    with:
      code-scanning-upload: false
      fail-on-sarif-level: error
```

Cross-repo `workflow_call` on private repositories needs job-level `permissions` (`contents: read`, `actions: read`) on the job that invokes the reusable; without `actions: read`, `github/codeql-action` fails with *Resource not accessible by integration*.

Download the `codeql-sarif-*` workflow artifact for the full SARIF when triaging findings.

Default `queries` is `security-and-quality`. Callers that previously inlined `security-extended` should pass `queries: security-extended` only when that broader query suite is documented for the repo (e.g. coast-fire-visualizer migration).

The security gate runs `.github/scripts/codeql-sarif-security-gate.ts` after a sparse checkout of `osloer-industries/.github` at **`job.workflow_sha`** (the commit in the caller’s `uses:` pin), so consumers execute the same script this repository tests—no caller-local copy.

The gate resolves CodeQL rules from the SARIF driver and query-pack extensions, honors `result.rule` index references, and falls back to each rule’s `defaultConfiguration.level` when a result omits `level`. Missing SARIF files or unparseable SARIF fails the job.

This repository’s `codeql-gate-ci.yml` workflow exercises the gate against SARIF fixtures (`run-shipped-codeql-gate.ts`), runs live CodeQL on an isolated vulnerable fixture (expecting the gate to fail), and mirrors the reusable artifact-mode steps on `test-fixtures/codeql-smoke` via the same sparse-checkout path. A cross-repository `workflow_call` smoke test is not run in this repo’s CI; verify that separately on a consumer such as `lunch-money` after bumping the reusables SHA.

### Dependency review

Input **`mode`** (default **`auto`**) picks the backend. The nested Google reusable stays on a dedicated job (GitHub requires job-level `uses:`). All enforcement runs in a single gate job named **`Review dependency changes`**.

| `mode` | Behavior |
| --- | --- |
| `auto` | GitHub [dependency-review-action](https://github.com/actions/dependency-review-action) on **public** repos; [Google OSV-Scanner PR reusable](https://google.github.io/osv-scanner/github-action/) on **private** repos (`upload-sarif: false`, `fail-on-vuln: true` — no GHAS SARIF upload). |
| `github` | Always dependency-review-action (`fail-on-severity` input, default `high`). |
| `osv` | Always OSV-Scanner PR reusable (same GHAS-free settings). |

**PR check names:**

| Job name | When it appears |
| --- | --- |
| **Review dependency changes** | Always on valid modes — the required gate (GitHub Dependency Review, OSV reporter, or invalid-mode rejection). |
| **OSV PR scan (private repos only)** | **Skipped** on public repos and on `mode: github`; **runs** on private / `mode: osv` before the gate job. |

Invalid `mode` values fail closed inside **Review dependency changes** (no separate skipped job).

**Private OSV SARIF (no Code Scanning upload):** The nested Google reusable runs with `upload-sarif: false` and `fail-on-vuln: false` so scan artifacts are always produced. The gate job:

1. Re-uploads SARIF as **`osv-sarif-${{ github.run_id }}`** (`actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` — same pin as CodeQL artifact mode).
2. Runs **`osv-reporter-action`** with `fail-on-vuln: true` (the required check outcome).

The nested job also uploads **`OSV Scanner SARIF file`** (default `results.sarif`, **5-day** retention). Prefer **`osv-sarif-*`** on the workflow run for fleet-consistent triage (mirrors **`codeql-sarif-*`**).

OSV uses its default recursive `scan-args` (`-r` + repo root), which scans lockfiles present in the caller tree — including npm **`package-lock.json`** and Bun **`bun.lock`**. No extra secrets.

**Public** repos (template, homeexchange-mcp, vakt, de-invest-sync): default caller below.

**Private** repos (coast-fire-visualizer, lunch-money-de-invest-sync): same caller; `auto` selects OSV automatically. Drop vendored `dependency-diff-audit.mjs` when migrating.

**Caller job permissions (required):** Grant these on the job that `uses:` the reusable (not workflow-wide unless that job is the only job). GitHub validates nested reusables at workflow startup; `mode: auto` on a **public** repo still requires `security-events: write` because the nested Google OSV job is declared.

| Permission | Why |
| --- | --- |
| `contents: read` | Checkout and dependency diff |
| `actions: read` | Download nested workflow artifacts |
| `pull-requests: read` | OSV follow-up job metadata |
| `security-events: write` | Nested Google `osv-scan` (even when `upload-sarif: false`) |

```yaml
name: Dependency review

on:
  pull_request:

concurrency:
  group: dependency-review-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  review:
    permissions:
      contents: read
      actions: read
      pull-requests: read
      security-events: write
    uses: osloer-industries/.github/.github/workflows/dependency-review.yml@REUSABLES_SHA # v0.x.y
```

Explicit OSV (optional — same as `auto` on a private repo):

```yaml
jobs:
  review:
    permissions:
      contents: read
      actions: read
      pull-requests: read
      security-events: write
    uses: osloer-industries/.github/.github/workflows/dependency-review.yml@REUSABLES_SHA # v0.x.y
    with:
      mode: osv
```

### Release Please

**osloer-industries/.github (this repo):** use the osloer-reviewer GitHub App so release PRs run CI (PRs created with `GITHUB_TOKEN` do not, and that path needs the “Allow GitHub Actions to create and approve pull requests” setting). Maintain `vars.OSLOER_RELEASE_APP_ID` and repository secret `RELEASE_APP_PRIVATE_KEY` (PEM for the app). Install the app on the org with **Contents**, **Workflows**, and **Pull requests** read and write. A maintainer merges the Release Please PR when checks are green; the merge tags the release.

This repository does not use a `release.yml` caller with `uses: ./…` (that form passes actionlint but fails zizmor `self-repository`; the `$/…` form fails actionlint and is not valid on GitHub today). Like [`workflow-security.yml`](.github/workflows/workflow-security.yml), [`release-please.yml`](.github/workflows/release-please.yml) also lists `push` to `main` and runs the release job in-repo.

**Consumer repos** that live in the same repository as their reusable copy may call with `uses: ./.github/workflows/release-please.yml` (actionlint-valid).

**Other consumer repos** can call the reusable with a PAT or org token in `secrets.RELEASE_TOKEN` (workflow-level `contents: read` is enough when minting an app token inside the reusable; otherwise match token permissions). GitHub App path on a consumer (optional inputs mirror the example above):

```yaml
jobs:
  release-please:
    uses: osloer-industries/.github/.github/workflows/release-please.yml@REUSABLES_SHA # v0.x.y
    secrets:
      RELEASE_APP_PRIVATE_KEY: ${{ secrets.MY_RELEASE_APP_PRIVATE_KEY }}
    with:
      release-app-id: ${{ vars.MY_RELEASE_APP_ID }}
      release-app-owner: osloer-industries
      release-app-repositories: my-repo
```

Fallback without a GitHub App (release PRs may not trigger CI):

```yaml
permissions:
  contents: write
  workflows: write
  pull-requests: write

jobs:
  release-please:
    uses: osloer-industries/.github/.github/workflows/release-please.yml@REUSABLES_SHA # v0.x.y
    secrets:
      RELEASE_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

The reusable job uses `permissions: contents: read` when minting an app token with `actions/create-github-app-token` (`permission-contents`, `permission-pull-requests`, and `permission-workflows` set to `write` on the installation token so Release Please can update refs when `main` touches `.github/workflows`); Release Please uses the installation token or `RELEASE_TOKEN` you supply.

### SonarQube Cloud (Node)

```yaml
name: SonarQube Cloud

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: read

concurrency:
  group: sonar-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    uses: osloer-industries/.github/.github/workflows/sonarqube-cloud-node.yml@REUSABLES_SHA # v0.x.y
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

The reusable job uses `contents: read` and `pull-requests: read`. When `SONAR_TOKEN` is empty, analysis steps are skipped (covers fork PRs and Dependabot without the secret). Inlined workflows that used `if:` to skip forks can rely on this instead when the token is not passed to untrusted PRs. Repositories with **no** Sonar token (local-only policy) must not adopt this reusable or `sonarcloud-zero-issues.yml`.

### SonarCloud zero open issues

Use this **in addition to** `sonarqube-cloud-node.yml` and/or SonarCloud automatic analysis. It closes the gap where the Sonar way quality gate stays green while MAJOR (or other) issues remain open.

**Stacked pull requests:** trigger on `pull_request` with **no** `branches:` filter so every base branch (including another PR branch) is gated. In SonarCloud, enable pull request analysis for all branches your workflows target (CI scanner: `sonar.pullrequest.*` properties from the scan action; automatic analysis: org integration settings).

**ci-passed wiring:** run this job in the main CI workflow and list it in **`ci-passed` `needs:`** (with Workflow security, CodeQL, quality, and any other gates). Org rulesets should require only **`ci-passed`**, not **`SonarCloud zero open issues`** as a separate required check. `SONAR_TOKEN` must be present as a repository or organization Actions secret; an empty secret fails the job.

**Pull requests only:** on workflows that also run on `push`, set caller job-level `if: github.event_name == 'pull_request'` on the job that calls this reusable (typical job id `sonar-zero-open-issues`). Push runs still upload analysis via `sonarqube-cloud-node.yml`; the zero-issues poll is PR-only. The org `ci-passed` gate allows that job to be **skipped** on non–`pull_request` events only; on `pull_request`, skipped/cancelled/missing results still fail **`ci-passed`**.

```yaml
name: SonarCloud

on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: sonarcloud-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    uses: osloer-industries/.github/.github/workflows/sonarqube-cloud-node.yml@REUSABLES_SHA # v0.x.y
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  zero-open-issues:
    needs: analyze
    uses: osloer-industries/.github/.github/workflows/sonarcloud-zero-issues.yml@REUSABLES_SHA # v0.x.y
    with:
      ce-task-id: ${{ needs.analyze.outputs.ce-task-id }}
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

Repositories that rely only on SonarCloud automatic analysis (no CI scan) can omit `needs: analyze` and call `sonarcloud-zero-issues.yml` alone; the gate waits until the head commit appears on `api/project_pull_requests/list` **and** a pull-request REPORT compute-engine task reaches **SUCCESS** (via `api/ce/activity` / `api/ce/task`).

Pin `uses:` to a **full commit SHA** on `osloer-industries/.github` (Dependabot `ci(deps)` bumps). The reusable job sparse-checkouts the gate script at **`job.workflow_sha`** (the commit in the `uses:` pin), not `github.workflow_sha` (the caller workflow on the caller repo). No extra inputs such as `reusables-ref` are required.

Callers need `permissions: contents: read` so the job can check out the org `.github` repository.

### Node/npm quality

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    uses: osloer-industries/.github/.github/workflows/node-npm-quality.yml@REUSABLES_SHA # v0.x.y
    with:
      check-npm-script: check
      fetch-depth: 0
      pr-pre-check-script: scripts/check-guardrail-changes.ts
      npm-prefixes-json: '["packages/eslint-sonarjs"]'
```

Bun monorepo (for example lunch-money, vakt): add `package-manager: bun` and, when present, `bun-version-file: .bun-version`. Keep `check-npm-script` and other script inputs as the `package.json` script name (executed with `bun run`).

`npm-ci-ignore-scripts` defaults to `true` (org standard). Adopt `--ignore-scripts` on fleet migration unless a documented install script must run. Prefer a caller `.nvmrc` over a new `node-version` input; homeexchange-mcp should add `.nvmrc` in its migration PR rather than requiring a parallel version pin input.

### Mutation (Stryker, changed src)

Requires caller `package.json` scripts (`test:mutation` or override), Stryker config, and devDependencies. Check name defaults to **`Mutation`**.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  mutation:
    uses: osloer-industries/.github/.github/workflows/mutation-changed.yml@REUSABLES_SHA # v0.x.y
```

Pin `uses:` to a **full commit SHA**. The PR path checks out `run-mutation-changed.ts` at **`job.workflow_sha`**. On pull requests the helper mutates only changed non-test `src/**/*.ts` (skips when none). On `push` to the default branch, runs `npm run` with `full-npm-script` (default `test:mutation`; 80% break threshold lives in caller Stryker config).

### Setup smoke (template)

```yaml
jobs:
  setup-smoke:
    uses: osloer-industries/.github/.github/workflows/node-setup-smoke.yml@REUSABLES_SHA # v0.x.y
```

### AGENTS.md lint (opt-in fleet desloppify)

Deterministic checks on `AGENTS.md`: shared markdownlint config (no inline disables; target linted from `$RUNNER_TEMP`), line/word budget, filler warnings and emoji errors, cited package scripts, backtick repo paths, versioned org **Agent workflow** block (markers + whitespace-normalised body), and tracked forbidden instruction files (`git ls-files` denylist). No LLM calls.

**Caller setup:** embed the marked region from `.github/agents-org-workflow-block.md` at the reusables pin into the repository root `AGENTS.md`, including `org-agent-workflow` start/end markers and matching version. Adopt the reusable only together with per-repo fixes so the first run is green (no fleet repo passes at current pins without reconciling block, paths, and scripts).

| Input | Default | Purpose |
| --- | --- | --- |
| `agents-path` | `AGENTS.md` | Path to agent instructions |
| `job-name` | `AGENTS.md lint` | Check name |
| `require-org-workflow-block` | `true` | Enforce embedded org block |
| `max-lines` | `220` | Line budget |
| `max-words` | `3500` | Word budget |

```yaml
jobs:
  agents-md-lint:
    uses: osloer-industries/.github/.github/workflows/agents-md-lint.yml@REUSABLES_SHA # v0.x.y

  ci-passed:
    needs:
      # …other jobs…
      - agents-md-lint
    # …
```

When a reusables pin bumps the block version, update the marked region (and marker version) in `AGENTS.md`; the gate prints a unified diff on drift. Pair Dependabot org-reusables bumps with that sync in the same PR.

### Auto-merge (Dependabot and Release Please)

Approves and enables **auto-merge** (`gh pr merge --auto` only — merges complete after required checks are green) for low-risk pull requests via the **osloer-reviewer** GitHub App. The reusable workflow does **not** check out pull request code and does **not** use `pull_request_target`.

**Repository safety preflight (required):** before any approval or `gh pr merge --auto`, the workflow verifies that the repository default branch **requires the `ci-passed` status check** (ruleset or branch protection, read with `GITHUB_TOKEN`). If `ci-passed` is not required, the job logs a clear notice and **exits successfully without enabling auto-merge**, because GitHub could merge immediately once auto-merge is turned on.

**Re-evaluate on every synchronize:** eligibility runs on `opened`, `synchronize`, `reopened`, and `ready_for_review`. When a pull request stops being eligible (for example a human push onto a Dependabot branch), the workflow calls `gh pr merge --disable-auto` so a previously enabled auto-merge is cleared.

**Eligibility (skipped cleanly when not met):**

- **Dependabot** (`github.event.pull_request.user.login == 'dependabot[bot]'`): only `version-update:semver-patch` or `version-update:semver-minor` — **majors never auto-merge**. **Grouped updates** scan every commit message on the branch; if **any** dependency in the group is a major semver bump, auto-merge is refused. **Mixed-author branches** (non-Dependabot commits on the Dependabot branch) skip metadata fetch and auto-merge. **Cooldown** is enforced in each repo’s `dependabot.yml` (`minimum release age`); the org typescript-node-template defaults are major **30** days, minor **7** days, patch **3** days (and default group **7** days). The reusable workflow does not duplicate that policy because release age is not available reliably from the GitHub API without extra secrets.
- **Release Please** (`osloer-reviewer[bot]`, head ref `release-please--*`, file allowlist): only `CHANGELOG.md`, `**/CHANGELOG.md`, `.release-please-manifest.json`, `package.json`, `package-lock.json`, and `version.txt`; `package.json` / `package-lock.json` diffs must touch the `version` field only (verified via the pull request files API).
- **Release Please semver gate:** patch and minor bumps on **1.0.0 and later** auto-merge when there are no breaking markers. **Pre-1.0 minors always need a human** (only pre-1.0 **patch** releases auto-merge). Skips auto-merge when the major version increases, when the PR body or CHANGELOG diff contains `BREAKING CHANGE` or `⚠ BREAKING CHANGES`, or when the manifest cannot be parsed (fail closed). Major or breaking releases get label **`release:major-hold`** once (or a comment if labeling fails).

**Repository settings (fleet standard):**

1. **Settings → General → Pull Requests:** enable **Allow auto-merge** and **Allow squash merging**; disable merge commits and rebase merging unless the repo has a documented exception (consumers should use **`merge-method: squash`**).
2. **Rulesets / branch protection:** require the **`ci-passed`** check on the default branch (only that aggregate check).
3. **Variables / secrets:** `vars.OSLOER_RELEASE_APP_ID` and secret `RELEASE_APP_PRIVATE_KEY` (PEM). Add the same secret as a **Dependabot secret** so workflows on `dependabot/*` can mint the installation token.

Configure `vars` with the app ID (for example `OSLOER_RELEASE_APP_ID`) and repository secret `RELEASE_APP_PRIVATE_KEY` (PEM). For Dependabot branches, add the same secret as a **Dependabot secret** so workflows on `dependabot/*` can mint the installation token.

```yaml
name: Auto-merge

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: read

concurrency:
  group: auto-merge-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  auto-merge:
    if: github.event.pull_request.draft == false
    uses: osloer-industries/.github/.github/workflows/auto-merge.yml@REUSABLES_SHA # v0.x.y
    with:
      release-app-id: ${{ vars.OSLOER_RELEASE_APP_ID }}
      merge-method: squash
      allow-release-prs: true
      allow-dependabot: true
    secrets:
      RELEASE_APP_PRIVATE_KEY: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
```

`merge-method` is `squash` (default), `merge`, or `rebase`. This repository’s [`.github/workflows/auto-merge.yml`](.github/workflows/auto-merge.yml) direct `pull_request` trigger inherits the same `squash` default via the `MERGE_METHOD` expression fallback when callers omit `merge-method`.

Rely on org rulesets / branch protection **required status checks** so auto-merge does not complete until every gate is green. In practice register only **`ci-passed`** as required (see below); auto-merge then waits for that single aggregate check.

### ci-passed (single required check)

Run quality/tests, workflow-security, CodeQL, SonarCloud zero-open-issues, and any repo-specific jobs in **one** CI workflow, then end with a job named **`ci-passed`** that `needs:` every upstream job, uses `if: always()`, and fails unless each needed job’s `result` is `success`. Skipped, cancelled, and failed upstream jobs fail closed **except** for the Sonar zero-issues caller job (reusable input **`sonar-zero-issues-job`**, default **`sonar-zero-open-issues`**): on `push` and other non–`pull_request` events, a **skipped** result for **only that job** is allowed when the caller uses `if: github.event_name == 'pull_request'` on it. On `pull_request`, skipped/cancelled/missing/failure for that job still fails **`ci-passed`**. Any other job skipped on `push` still fails **`ci-passed`**.

**Org rulesets:** require only the check **`ci-passed`**. Do not list individual scanner jobs as required—`ci-passed` already aggregates them. Auto-merge (`auto-merge.yml`) relies on required checks; with only `ci-passed` required, Dependabot and Release Please PRs merge once the full pipeline is green.

**Reusable inputs:** `needs-json` (required), `sonar-zero-issues-job` (single caller `needs` job id for Sonar zero-issues; default `sonar-zero-open-issues`; use only to rename that job, not to register other PR-only jobs).

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  actions: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    uses: osloer-industries/.github/.github/workflows/node-npm-quality.yml@REUSABLES_SHA # v0.x.y

  workflow-security:
    uses: osloer-industries/.github/.github/workflows/workflow-security.yml@REUSABLES_SHA # v0.x.y

  codeql:
    uses: osloer-industries/.github/.github/workflows/codeql-javascript-typescript.yml@REUSABLES_SHA # v0.x.y

  sonar-analyze:
    uses: osloer-industries/.github/.github/workflows/sonarqube-cloud-node.yml@REUSABLES_SHA # v0.x.y
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  sonar-zero-open-issues:
    if: github.event_name == 'pull_request'
    needs: sonar-analyze
    uses: osloer-industries/.github/.github/workflows/sonarcloud-zero-issues.yml@REUSABLES_SHA # v0.x.y
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  ci-passed:
    name: ci-passed
    needs:
      - quality
      - workflow-security
      - codeql
      - sonar-analyze
      - sonar-zero-open-issues
    if: always()
    uses: osloer-industries/.github/.github/workflows/ci-passed.yml@REUSABLES_SHA # v0.x.y
    with:
      needs-json: ${{ toJSON(needs) }}
```

This repository’s [`ci.yml`](.github/workflows/ci.yml) ends with an **inlined** `ci-passed` job (same `ci-passed-gate.ts` logic as the reusable). [`workflow-security.yml`](.github/workflows/workflow-security.yml) still runs on the same events via its own `pull_request` / `push` trigger until actionlint accepts GitHub’s `$/` same-repository `uses:` form and callers can drop `./` without zizmor `self-repository` findings. **Consumer repositories** should run workflow-security inside the main CI workflow and list it under `ci-passed` `needs:` as in the example above; org rulesets should require only **`ci-passed`** there.

### Workflow security (actionlint + zizmor)

Runs [actionlint](https://github.com/rhysd/actionlint) on `.github/workflows` and [zizmor](https://docs.zizmor.sh/) on the **repository root** (default `inputs: .`), so Dependabot config (`.github/dependabot.yml`), composite `action.yml` files, and workflows are audited. Uses SHA-pinned `zizmor-action` with an explicit `version:` input (hash-verified CLI wheel — not `latest`) and `advanced-security: false` so findings fail the job (no SARIF upload). Org defaults leave `min-severity` and `min-confidence` empty so zizmor omits filter flags and reports every finding; invalid threshold inputs fail before zizmor runs. Threshold validation is **inlined in the reusable workflow** (embedded TypeScript heredoc + Node 24), so cross-repo callers always run the script from the pinned reusables commit—no runtime checkout of `osloer-industries/.github`. The editable source is `.github/scripts/validate-zizmor-thresholds.ts`; CI keeps it byte-identical to the inline copy (`node .github/scripts/zizmor-thresholds-inline.ts --check`).

Requires `contents: read` and `actions: read` on the called job (private repos and online audits). For a **standalone caller workflow** (not nested under another reusable), also set workflow-level `actions: read`; without it GitHub can fail the run at startup with zero jobs executed.

**Bumping actionlint** (not managed by Dependabot): in `workflow-security.yml`, update both `ACTIONLINT_VERSION` and `ACTIONLINT_SHA256` on the install step together. Download the matching `actionlint_<version>_linux_amd64.tar.gz` line from the release [`actionlint_<version>_checksums.txt`](https://github.com/rhysd/actionlint/releases) (GitHub release asset digest or the file contents) and paste the `linux_amd64` SHA-256 into `ACTIONLINT_SHA256`.

**Bumping zizmor CLI** (not managed by Dependabot): Dependabot’s `github-actions` updates can bump the `zizmorcore/zizmor-action@…` SHA only. After any action SHA bump, set the `version:` input on the Run zizmor step to an **exact** release that exists under `support/locks/zizmor-<version>.txt` in that action ref ([releases](https://github.com/zizmorcore/zizmor/releases)). Do not use `latest` or leave `version` unset — CI fails closed via `.github/scripts/assert-zizmor-action-pin.ts`.

This repository also lists `pull_request` / `push` on `workflow-security.yml` so the gate runs on every change here without a same-repo `workflow_call` (actionlint **v1.7.12** does not yet accept GitHub’s `$/` self-repository `uses:` form, while zizmor flags `./` for local reusables).

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  actions: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  workflow-security:
    uses: osloer-industries/.github/.github/workflows/workflow-security.yml@REUSABLES_SHA # v0.x.y
    permissions:
      contents: read
      actions: read
```

Optional relax (fewer reported findings; only when you accept a weaker gate):

```yaml
    with:
      min-severity: medium
      min-confidence: medium
```

## What stays in each repository

- Release Please config and manifest paths
- `sonar-project.properties`
- Domain-specific CI jobs (architecture checks, privacy, skills validation)
- Bun-based quality (future `bun-quality.yml` reusable)
