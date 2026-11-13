# Consuming org reusable workflows

Reusable workflows live in this repository under `.github/workflows/`. Call them from any org repository with an immutable commit SHA (update via Dependabot `ci(deps)` pull requests).

Replace `REUSABLES_SHA` with the commit SHA you adopt (see [releases](https://github.com/osloer-industries/.github/releases) once Release Please is enabled, or the merge commit on `main`).

```text
uses: osloer-industries/.github/.github/workflows/<file>.yml@REUSABLES_SHA
```

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
| `sonarqube-cloud-node.yml` | `coverage-npm-script` | `test:coverage` | npm script that generates coverage before Sonar upload |
| `sonarcloud-zero-issues.yml` | `project-key` | *(empty → `osloer-industries_<repo>`)* | SonarCloud project key |
| `sonarcloud-zero-issues.yml` | `organization` | `osloer-industries` | Organization segment of the default project key |
| `sonarcloud-zero-issues.yml` | `timeout-minutes` | `20` | Max wait for PR analysis at head SHA |
| `sonarcloud-zero-issues.yml` | `poll-interval-seconds` | `10` | Delay between SonarCloud API polls |
| `sonarcloud-zero-issues.yml` | `reusables-ref` | *(empty → `github.workflow_sha`)* | `.github` repo commit supplying the gate script |
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
    uses: osloer-industries/.github/.github/workflows/semantic-pull-request.yml@REUSABLES_SHA
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
    uses: osloer-industries/.github/.github/workflows/codeql-javascript-typescript.yml@REUSABLES_SHA
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

concurrency:
  group: codeql-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  analyze:
    uses: osloer-industries/.github/.github/workflows/codeql-javascript-typescript.yml@REUSABLES_SHA
    with:
      code-scanning-upload: false
      fail-on-sarif-level: error
```

Download the `codeql-sarif-*` workflow artifact for the full SARIF when triaging findings.

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
    uses: osloer-industries/.github/.github/workflows/dependency-review.yml@REUSABLES_SHA
```

### Release Please

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  issues: write
  pull-requests: write

concurrency:
  group: release-please
  cancel-in-progress: false

jobs:
  release-please:
    uses: osloer-industries/.github/.github/workflows/release-please.yml@REUSABLES_SHA
    secrets:
      RELEASE_TOKEN: ${{ secrets.RELEASE_TOKEN }}
```

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
    uses: osloer-industries/.github/.github/workflows/sonarqube-cloud-node.yml@REUSABLES_SHA
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

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
    uses: osloer-industries/.github/.github/workflows/sonarqube-cloud-node.yml@REUSABLES_SHA
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  zero-open-issues:
    needs: analyze
    uses: osloer-industries/.github/.github/workflows/sonarcloud-zero-issues.yml@REUSABLES_SHA
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

Repositories that rely only on SonarCloud automatic analysis (no CI scan) can omit `needs: analyze` and call `sonarcloud-zero-issues.yml` alone; the gate polls until the head commit appears on `api/project_pull_requests/list`.

Pin `uses:` to a **full commit SHA** on `osloer-industries/.github` (Dependabot `ci(deps)` bumps). The reusable job checks out that same SHA via `github.workflow_sha` and runs `.github/scripts/sonarcloud-zero-issues.ts` with Node 24. Override only with `reusables-ref` when debugging (must match the script version you intend).

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
    uses: osloer-industries/.github/.github/workflows/node-npm-quality.yml@REUSABLES_SHA
    with:
      check-npm-script: check
      npm-prefixes-json: '["packages/eslint-sonarjs"]'
```

### Setup smoke (template)

```yaml
jobs:
  setup-smoke:
    uses: osloer-industries/.github/.github/workflows/node-setup-smoke.yml@REUSABLES_SHA
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
    uses: osloer-industries/.github/.github/workflows/workflow-security.yml@REUSABLES_SHA
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
