# Shared automation rollout

## Goal

Reduce duplicated GitHub automation while keeping each project responsible for its runtime, commands, security boundaries, and release decisions.

The TypeScript Node template remains the starting point for new Node.js and npm repositories. This repository provides the shared delivery layer that existing repositories can adopt independently.

## Why a separate repository

Repositories created from a GitHub template do not remain linked to the template. Later template changes do not propagate to existing repositories.

A public organization `.github` repository can provide reusable workflows to both public and private organization repositories. It can also expose workflow templates and default community guidance without copying those files into every project.

## Boundaries

Shared automation may own:

- Conventional pull request title validation
- CodeQL setup for JavaScript and TypeScript
- Pull request dependency review
- Runtime-specific quality workflow building blocks
- Release Please orchestration
- Organization workflow templates

Each consuming repository continues to own:

- Application source code and tests
- `package.json`, lockfiles, and TypeScript configuration
- The choice between Node.js with npm and Bun
- Project-specific quality commands and coverage policy
- SonarQube Cloud organization and project identifiers
- Deployment environments and credentials
- Release approval and merge decisions
- Project-specific `AGENTS.md`, security, and contribution guidance

The rollout will not synchronize complete files from the TypeScript Node template into existing repositories. That would overwrite intentional differences, particularly Lunch Money's use of Bun and HomeExchange's use of npm.

## Versioning and trust

Consumer workflows will reference shared workflows by immutable commit SHA. A same-line version comment will identify the corresponding release tag. Dependabot will propose reference updates for review.

Reusable workflows receive only the permissions granted by their caller. Callers must declare minimal permissions explicitly. Secrets are passed by name and only when a workflow requires them.

Changes to shared workflows follow Conventional Commits and Release Please. Breaking workflow input or behavior changes require a major release.

## Rollout phases

### Phase 1: foundation

Create this repository and agree on the architecture, boundaries, and rollout sequence. No consumer workflow changes occur in this phase.

Acceptance criteria:

- The repository is public so public and private organization repositories can call it.
- The scope and security model are documented.
- No shared workflow is enabled yet.

### Phase 2: read-only pilot

Add one reusable Conventional Commit pull request title workflow. Pilot it in `typescript-node-template`, where failure affects no production application or release process.

Acceptance criteria:

- Valid and invalid test pull request titles produce the expected result.
- The caller grants read-only pull request access.
- The reusable workflow is pinned by immutable SHA.
- Existing template checks remain unchanged.

### Phase 3: HomeExchange governance

Adopt only the proven read-only governance workflows in `homeexchange-mcp`. Preserve its existing required check names until organization rules are deliberately updated.

Acceptance criteria:

- HomeExchange-specific CI, SonarQube Cloud, and privacy behavior remain local.
- Required organization and repository checks continue to pass.
- Release Please remains maintainer-controlled.

### Phase 4: Lunch Money and Bun

After Lunch Money's current feature pull request is merged, add a Bun-specific quality workflow that uses its existing `bun run check` contract. Do not introduce npm or Node.js setup into the project.

Acceptance criteria:

- Frozen Bun installation and production audit run successfully.
- Existing tests and plugin validation remain authoritative.
- No financial data, credentials, or generated reports leave the repository.

### Phase 5: write-capable automation

Evaluate centralizing Release Please only after the read-only workflows are stable in both consumers. Evaluate SonarQube Cloud separately because project identifiers and secret behavior differ.

Acceptance criteria:

- The organization `RELEASE_TOKEN` is restricted to selected repositories.
- Release pull requests trigger all required checks.
- Shared automation cannot bypass review or branch rules.
- Rollback consists of reverting a small caller workflow change.

## Change process

Each phase uses a separate pull request. A phase is merged and observed before work starts on the next phase. Consumer migrations are separate pull requests so one repository can roll back without affecting another.

No branch protection, organization ruleset, repository secret, or consumer workflow is changed implicitly by work in this repository.
