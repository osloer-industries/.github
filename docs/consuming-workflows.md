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
| `workflow-security.yml` | Workflow security (actionlint + zizmor) | `pull_request`, `push` to default branch |

### Reusable workflow inputs (Node)

| Workflow | Input | Default | Purpose |
| --- | --- | --- | --- |
| `node-npm-quality.yml` | `check-npm-script` | `check` | npm script passed to `npm run` for the quality gate |
| `sonarqube-cloud-node.yml` | `coverage-npm-script` | `test:coverage` | npm script that generates coverage before Sonar upload |
| `node-setup-smoke.yml` | `setup-npm-script` | `setup` | npm script for the setup CLI |
| `node-setup-smoke.yml` | `smoke-name-prefix` | `@smoke/` | Prefix for `--name`; matrix scenario and `-template` are appended |

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

### Workflow security (actionlint + zizmor)

Scans caller `.github/workflows` with [actionlint](https://github.com/rhysd/actionlint) (release binary, checksum-verified) and [zizmor](https://docs.zizmor.sh/) via `zizmor-action` with `advanced-security: false` so findings fail the job (no SARIF upload). Requires `contents: read` and `actions: read` on the job (private repos and online audits).

This repository also lists `pull_request` / `push` on `workflow-security.yml` so the gate runs on every change here without a same-repo `workflow_call` (actionlint **v1.7.12** does not yet accept GitHub’s `$/` self-repository `uses:` form, while zizmor flags `./` for local reusables).

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
  workflow-security:
    uses: osloer-industries/.github/.github/workflows/workflow-security.yml@REUSABLES_SHA
    permissions:
      contents: read
      actions: read
```

## What stays in each repository

- Release Please config and manifest paths
- `sonar-project.properties`
- Domain-specific CI jobs (architecture checks, privacy, skills validation)
- Bun-based quality (future `bun-quality.yml` reusable)
