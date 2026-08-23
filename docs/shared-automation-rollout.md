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

## Uniform project contract

HomeExchange and Lunch Money should share the same engineering contract. Runtime-specific commands implement that contract differently, but they should produce equivalent outcomes.

The common contract is:

- Strict TypeScript with the same safety flags
- ECMAScript modules unless a documented compatibility constraint requires otherwise
- Exact dependency versions and a committed lockfile
- A pinned runtime and package-manager version
- Standard `lint`, `typecheck`, `test`, `test:coverage`, `build`, and `check` scripts
- Oxlint for source linting
- At least 80 percent coverage for every metric reported by the selected runtime
- A frozen, lifecycle-script-safe dependency installation in CI
- A production dependency audit in CI
- Conventional pull request titles and squash commits
- CodeQL with `security-extended` queries
- High-severity pull request dependency review
- SonarQube Cloud analysis with repository-specific project identifiers
- Release Please using the organization `RELEASE_TOKEN`
- Dependabot for package and GitHub Actions dependencies
- Immutable GitHub Action references with Dependabot-managed updates
- Minimal workflow permissions, concurrency cancellation, and timeouts
- Provider-neutral `AGENTS.md`, security guidance, contribution guidance, issue forms, and pull request guidance
- Secret-safe ignore rules and environment examples

Projects may add domain-specific checks after the shared contract. For example, Lunch Money keeps dependency-cruiser architecture validation and financial-data safeguards. HomeExchange keeps trusted-origin validation and session-data safeguards.

## Runtime adapters

Only the runtime implementation is intentionally different:

| Concern | HomeExchange and Node template | Lunch Money |
| --- | --- | --- |
| Runtime | Node.js 22 | Bun |
| Package manager | npm | Bun |
| Version marker | `.nvmrc` and `.node-version` | Bun version marker supported by the setup Action |
| Lockfile | `package-lock.json` | `bun.lock` |
| Frozen install | `npm ci` | `bun install --frozen-lockfile --ignore-scripts` |
| Production audit | `npm audit --omit=dev --audit-level=high` | `bun audit --production` |
| Test implementation | Vitest with V8 coverage | Bun test with coverage |

Both adapters finish by running the same project-level `check` contract. Shared governance workflows do not need to know which runtime a project uses.

Vitest reports branches, functions, lines, and statements. Bun's native coverage thresholds currently report functions, lines, and statements but do not expose an equivalent branch threshold. This is a runtime capability difference, not a policy exception: both projects enforce 80 percent for every metric their selected runner reports.

## Uniform repository rules

The organization ruleset should remain the single baseline for every default branch:

- Pull requests required
- At least one approval
- Squash merging only
- Linear history
- Force pushes blocked
- Branch deletion blocked

After both projects expose stable shared check names, a second organization ruleset can target the two TypeScript repositories and require:

- `Quality`
- `Semantic pull request`
- `Review dependency changes`
- Successful CodeQL scanning at medium severity or higher
- SonarQube Cloud analysis where configured

Repository-level rulesets should contain only genuine exceptions or additional domain requirements. Classic branch protection should not duplicate these rulesets.

Lunch Money currently requires signed commits while HomeExchange does not. This is not part of the initial common baseline. GitHub does not allow a user to squash-merge a signed-commit-protected pull request unless that user authored the pull request, which can conflict with Release Please pull requests authored by a GitHub App or separate maintainer identity. Signed commits should be evaluated in a dedicated phase against the chosen `RELEASE_TOKEN` identity before applying one policy to both repositories.

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
