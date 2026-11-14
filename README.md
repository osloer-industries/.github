# Osloer Industries GitHub standards

Shared **reusable GitHub Actions workflows** for TypeScript repositories. Consumer repos keep thin caller workflows; behavior is maintained here.

Reference contract: [typescript-node-template](https://github.com/osloer-industries/typescript-node-template).

## Reusable workflows

| File | Purpose |
| --- | --- |
| [semantic-pull-request.yml](.github/workflows/semantic-pull-request.yml) | Conventional Commit pull request titles |
| [codeql-javascript-typescript.yml](.github/workflows/codeql-javascript-typescript.yml) | CodeQL for JS/TS (optional SARIF artifact mode without Code Scanning upload) |
| [dependency-review.yml](.github/workflows/dependency-review.yml) | Pull request dependency review (high severity) |
| [release-please.yml](.github/workflows/release-please.yml) | Release Please |
| [sonarqube-cloud-node.yml](.github/workflows/sonarqube-cloud-node.yml) | SonarQube Cloud with npm coverage prep |
| [sonarcloud-zero-issues.yml](.github/workflows/sonarcloud-zero-issues.yml) | Fail when SonarCloud still has OPEN/CONFIRMED PR issues (beyond the Sonar way gate) |
| [node-npm-quality.yml](.github/workflows/node-npm-quality.yml) | `npm ci`, audit, `npm run` via `check-npm-script` (default `check`) |
| [mutation-changed.yml](.github/workflows/mutation-changed.yml) | Stryker on changed `src/` for PRs; full mutation script on default-branch push |
| [node-setup-smoke.yml](.github/workflows/node-setup-smoke.yml) | Matrix setup smoke via `setup-npm-script` (default `setup`) |
| [workflow-security.yml](.github/workflows/workflow-security.yml) | actionlint + zizmor (fail-closed, no Python) |

### CodeQL SARIF security gate (artifact mode)

When `code-scanning-upload` is `false`, the reusable CodeQL workflow uploads SARIF as a workflow artifact and runs an inlined TypeScript gate (Node 24, no npm install in callers). Source of truth: [`.github/scripts/codeql-sarif-security-gate.ts`](.github/scripts/codeql-sarif-security-gate.ts). Keep the inline copy in the workflow synchronized with `node .github/scripts/codeql-gate-inline.ts --write` / `--check`. Fixture and live tests run from [`.github/workflows/codeql-gate-ci.yml`](.github/workflows/codeql-gate-ci.yml). This repository’s [`ci.yml`](.github/workflows/ci.yml) also runs `codeql-gate-inline.ts --check` on every PR/push so drift is caught outside the CodeQL gate workflow.

Optional `workflow-security.yml` inputs: `min-severity` and `min-confidence` (default empty — report all findings). Invalid values fail closed. See [docs/consuming-workflows.md](docs/consuming-workflows.md).

### SonarCloud zero open issues

SonarCloud’s built-in **Sonar way** quality gate ignores raw open-issue counts (ratings only). Reusable [`sonarcloud-zero-issues.yml`](.github/workflows/sonarcloud-zero-issues.yml) polls until the pull request head commit is analysed, then fails when `issueStatuses=OPEN,CONFIRMED` is non-zero. Script: [`.github/scripts/sonarcloud-zero-issues.ts`](.github/scripts/sonarcloud-zero-issues.ts). The reusable workflow checks out the gate script at **`job.workflow_sha`** (the commit in the caller’s `uses:` pin). Register the job **`SonarCloud zero open issues`** as a required status check in the org ruleset after adopters add the caller workflow.

### Mutation (changed src)

Reusable [`mutation-changed.yml`](.github/workflows/mutation-changed.yml) runs Stryker against changed non-test `src/**/*.ts` on pull requests (via [`.github/scripts/run-mutation-changed.ts`](.github/scripts/run-mutation-changed.ts)) and `npm run test:mutation` (configurable) on pushes to the default branch. Callers must define Stryker and the full mutation npm script locally; pin `uses:` to a full commit SHA; the helper is fetched at **`job.workflow_sha`**.

See [docs/consuming-workflows.md](docs/consuming-workflows.md) for caller YAML and SHA pinning.

## Adoption

1. Replace inlined workflows in a consumer repo with callers from the doc.
2. Pin `uses:` to a full commit SHA from this repository.
3. Let Dependabot bump Action and reusable-workflow SHAs via `ci(deps)` pull requests.
