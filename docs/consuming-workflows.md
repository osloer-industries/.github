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

## Available reusables

| Workflow file | Check name(s) | Caller triggers |
| --- | --- | --- |
| `semantic-pull-request.yml` | Semantic pull request | `pull_request_target` (types: opened, reopened, edited, synchronize) |
| `codeql-javascript-typescript.yml` | Analyze JavaScript and TypeScript | `pull_request`, `push` to default branch, optional weekly `schedule` |
| `dependency-review.yml` | Review dependency changes | `pull_request` |
| `release-please.yml` | Prepare or publish release | `push` to default branch, `workflow_dispatch` |
| `sonarqube-cloud-node.yml` | Analyze | `pull_request`, `push` to default branch |
| `sonarcloud-zero-issues.yml` | SonarCloud zero open issues | `pull_request` (all base branches — no `branches:` filter) |
| `node-npm-quality.yml` | Quality (override with `job-name`) | `pull_request`, `push` to default branch |
| `mutation-changed.yml` | Mutation (override with `job-name`) | `pull_request`, `push` to default branch |
| `node-setup-smoke.yml` | Setup smoke (matrix) | `pull_request`, `push` to default branch |
| `workflow-security.yml` | Workflow security (actionlint + zizmor) | `pull_request`, `push` to default branch |

### Reusable workflow inputs (workflow security)

| Input | Default | Purpose |
| --- | --- | --- |
| `min-severity` | `""` (empty) | zizmor minimum severity to **report**. Empty omits `--min-severity` so all severities are reported (strictest org default). Set `medium` or `high` to hide lower-severity findings and relax the gate. |
| `min-confidence` | `""` (empty) | zizmor minimum confidence to **report**. Empty omits `--min-confidence` so all confidence levels are reported (strictest org default). Set `medium` or `high` to hide lower-confidence findings and relax the gate. |

Allowed values match the pinned `zizmor-action` (`informational`, `low`, `medium`, `high` for severity; `low`, `medium`, `high` for confidence; `unknown` is accepted but deprecated by zizmor — use empty instead). Invalid values fail the job before zizmor runs.

### Reusable workflow inputs (Node)

| Workflow | Input | Default | Purpose |
| --- | --- | --- | --- |
| `node-npm-quality.yml` | `check-npm-script` | `check` | npm script passed to `npm run` for the quality gate |
| `node-npm-quality.yml` | `npm-prefixes-json` | `"[]"` | JSON array of extra `--prefix` paths for `npm ci` and `npm audit` (monorepo helpers, e.g. `["packages/eslint-sonarjs"]`) |
| `node-npm-quality.yml` | `fetch-depth` | `1` | Checkout depth; use `0` when PR jobs run git-based helpers (guardrail notice, changed-path gates) |
| `node-npm-quality.yml` | `pr-pre-check-script` | *(empty)* | Caller script run with `node` on `pull_request` only; sets `GUARDRAIL_BASE_REF` to the PR base SHA |
| `mutation-changed.yml` | `full-npm-script` | `test:mutation` | npm script for full `src/` mutation on default-branch `push` |
| `sonarqube-cloud-node.yml` | `coverage-npm-script` | `test:coverage` | npm script that generates coverage before Sonar upload |
| `sonarcloud-zero-issues.yml` | `project-key` | *(empty → `osloer-industries_<repo>`)* | SonarCloud project key |
| `sonarcloud-zero-issues.yml` | `organization` | `osloer-industries` | Organization segment of the default project key |
| `sonarcloud-zero-issues.yml` | `timeout-minutes` | `20` | Max wait for PR analysis at head SHA |
| `sonarcloud-zero-issues.yml` | `poll-interval-seconds` | `10` | Delay between SonarCloud API polls |
| `node-setup-smoke.yml` | `setup-npm-script` | `setup` | npm script for the setup CLI |
| `node-setup-smoke.yml` | `smoke-name-prefix` | `@smoke/` | Prefix for `--name`; matrix scenario and `-template` are appended |
| `codeql-javascript-typescript.yml` | `code-scanning-upload` | `true` | When `false`, skips Code Scanning upload (no GHAS required); SARIF artifact + security gate |
| `codeql-javascript-typescript.yml` | `fail-on-sarif-level` | `error` | With `code-scanning-upload: false`, fail on security-tagged SARIF at this level or above |
| `codeql-javascript-typescript.yml` | `source-root` | *(empty)* | Optional directory passed to CodeQL init as `source-root`; empty analyzes from the repository root |

Callers that previously passed full shell commands should switch to npm script names only (for example `check-npm-script: check` instead of `check-command: npm run check`).

## Caller examples

### Semantic pull request title

```yaml
name: Pull request title

on:
  pull_request_target:
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

The security gate is **inlined in the reusable workflow** (a `run:` step that writes an embedded TypeScript heredoc to a temp file and runs it with Node 24), so it always executes from the same commit the caller pins—no checkout of this repository and no caller-local action path. The editable source of truth is `.github/scripts/codeql-sarif-security-gate.ts`; CI fails if that file and the inline copy diverge (`node .github/scripts/codeql-gate-inline.ts --check`). After editing the script, run `node .github/scripts/codeql-gate-inline.ts --write` before committing.

The gate resolves CodeQL rules from the SARIF driver and query-pack extensions, honors `result.rule` index references, and falls back to each rule’s `defaultConfiguration.level` when a result omits `level`. Missing SARIF files or unparseable SARIF fails the job.

This repository’s `codeql-gate-ci.yml` workflow exercises the gate against SARIF fixtures, runs live CodeQL on an isolated vulnerable fixture (expecting the gate to fail), and mirrors the reusable artifact-mode steps on `test-fixtures/codeql-smoke` using the shipped inline gate (`run-shipped-codeql-gate.ts`). A cross-repository `workflow_call` smoke test is not run in this repo’s CI; verify that separately on a consumer such as `lunch-money` after bumping the reusables SHA.

### Dependency review

```yaml
name: Dependency review

on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: dependency-review-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  review:
    uses: osloer-industries/.github/.github/workflows/dependency-review.yml@REUSABLES_SHA # v0.x.y
```

**Do not** replace [lunch-money-de-invest-sync](https://github.com/osloer-industries/lunch-money-de-invest-sync)’s GHAS-free `dependency-diff-audit.mjs` gate with this reusable. **Private** repos (e.g. coast-fire-visualizer): confirm the official dependency review action is available without paid GHAS before adding this caller; otherwise keep a local GHAS-free gate.

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

**Required check:** after adoption, add org ruleset / branch protection requirement for job name **`SonarCloud zero open issues`** (exact match). `SONAR_TOKEN` must be present as a repository or organization Actions secret; an empty secret fails the job.

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
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

Repositories that rely only on SonarCloud automatic analysis (no CI scan) can omit `needs: analyze` and call `sonarcloud-zero-issues.yml` alone; the gate polls until the head commit appears on `api/project_pull_requests/list`.

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
