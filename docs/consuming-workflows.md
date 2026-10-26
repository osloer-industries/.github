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
| `node-npm-quality.yml` | Quality (override with `job-name`) | `pull_request`, `push` to default branch |
| `node-setup-smoke.yml` | Setup smoke (matrix) | `pull_request`, `push` to default branch |

### Reusable workflow inputs (Node)

| Workflow | Input | Default | Purpose |
| --- | --- | --- | --- |
| `node-npm-quality.yml` | `check-npm-script` | `check` | npm script passed to `npm run` for the quality gate |
| `sonarqube-cloud-node.yml` | `coverage-npm-script` | `test:coverage` | npm script that generates coverage before Sonar upload |
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

The security gate is **inlined in the reusable workflow** (a `run:` step with an embedded Python heredoc), so it always executes from the same commit the caller pins—no checkout of this repository and no caller-local action path. The editable source of truth is `.github/scripts/codeql-sarif-security-gate.py`; CI fails if that file and the inline copy diverge (`python3 .github/scripts/codeql_gate_inline.py --check`). After editing the script, run `python3 .github/scripts/codeql_gate_inline.py --write` before committing.

The gate resolves CodeQL rules from the SARIF driver and query-pack extensions, honors `result.rule` index references, and falls back to each rule’s `defaultConfiguration.level` when a result omits `level`. Missing SARIF files or unparseable SARIF fails the job.

This repository’s `codeql-gate-ci.yml` workflow exercises the gate against SARIF fixtures, runs live CodeQL on an isolated vulnerable fixture (expecting the gate to fail), and mirrors the reusable artifact-mode steps on `test-fixtures/codeql-smoke` using the shipped inline gate (`run_shipped_codeql_gate.py`). A cross-repository `workflow_call` smoke test is not run in this repo’s CI; verify that separately on a consumer such as `lunch-money` after bumping the reusables SHA.

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

## What stays in each repository

- Release Please config and manifest paths
- `sonar-project.properties`
- Domain-specific CI jobs (architecture checks, privacy, skills validation)
- Bun-based quality (future `bun-quality.yml` reusable)
