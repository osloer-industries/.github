# Osloer Industries GitHub standards

Shared **reusable GitHub Actions workflows** for TypeScript repositories. Consumer repos keep thin caller workflows; behavior is maintained here.

Reference contract: [typescript-node-template](https://github.com/osloer-industries/typescript-node-template).

## Reusable workflows

| File | Purpose |
| --- | --- |
| [semantic-pull-request.yml](.github/workflows/semantic-pull-request.yml) | Conventional Commit pull request titles |
| [codeql-javascript-typescript.yml](.github/workflows/codeql-javascript-typescript.yml) | CodeQL for JS/TS |
| [dependency-review.yml](.github/workflows/dependency-review.yml) | Pull request dependency review (high severity) |
| [release-please.yml](.github/workflows/release-please.yml) | Release Please |
| [sonarqube-cloud-node.yml](.github/workflows/sonarqube-cloud-node.yml) | SonarQube Cloud with npm coverage prep |
| [node-npm-quality.yml](.github/workflows/node-npm-quality.yml) | `npm ci`, audit, `npm run` via `check-npm-script` (default `check`) |
| [node-setup-smoke.yml](.github/workflows/node-setup-smoke.yml) | Matrix setup smoke via `setup-npm-script` (default `setup`) |

See [docs/consuming-workflows.md](docs/consuming-workflows.md) for caller YAML and SHA pinning.

## Adoption

1. Replace inlined workflows in a consumer repo with callers from the doc.
2. Pin `uses:` to a full commit SHA from this repository.
3. Let Dependabot bump Action and reusable-workflow SHAs via `ci(deps)` pull requests.
