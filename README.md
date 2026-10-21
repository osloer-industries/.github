# Osloer Industries GitHub standards

This public repository holds shared GitHub workflow building blocks and organization workflow templates for the org.

The [TypeScript Node template](https://github.com/osloer-industries/typescript-node-template) is the reference implementation for the uniform engineering contract (Node/npm, Oxlint, Vitest coverage gates, pinned Actions, CodeQL, dependency review, semantic PR titles, Dependabot, Release Please, SonarQube Cloud, and provider-neutral `AGENTS.md`). Existing repositories adopt shared automation here through explicit pull requests; nothing is enabled implicitly.

The rollout is intentionally incremental. No repository consumes shared workflows until maintainers review and approve a dedicated adoption pull request.

See [the rollout plan](docs/shared-automation-rollout.md) for the current template baseline, centralization recommendations, boundaries, sequence, and acceptance criteria.
