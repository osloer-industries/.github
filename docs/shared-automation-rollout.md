# Shared automation rollout

## Goal

Reduce duplicated GitHub automation while keeping each project responsible for its runtime, commands, security boundaries, and release decisions.

The [TypeScript Node template](https://github.com/osloer-industries/typescript-node-template) is the reference implementation for new Node.js and npm repositories. This repository provides the shared delivery layer that existing repositories adopt through explicit, reviewable pull requests.

## Reference baseline (template on `main`)

The contract below reflects what the template enforces today. Treat it as the source of truth until a merged change updates the template.

| Area | Current template behavior |
| --- | --- |
| Runtime | Node.js **24** (`.nvmrc`, `.node-version`, `engines.node`) |
| Package manager | npm with exact versions and committed `package-lock.json` |
| Local/CI gate | `npm run check` → Oxlint, TypeScript, Vitest coverage, production build |
| Coverage | Vitest V8: 80% branches, functions, lines, statements |
| CI quality job | `Quality`: `npm ci`, production audit (`high`), `npm run check` |
| CI setup smoke | Matrix over setup scenarios (`plugin`, `mcp`, `npm-package`, `cli`) with `npm ci --ignore-scripts` |
| CodeQL | JavaScript/TypeScript, query pack **`security-and-quality`**, weekly schedule |
| Dependency review | Fail on **high** severity on pull requests |
| PR titles | Conventional Commits via `pull_request_target` workflow |
| Release | Release Please on `main` with org `RELEASE_TOKEN` |
| SonarQube Cloud | Separate workflow; skips cleanly when `SONAR_TOKEN` is unset |
| Dependabot | Weekly npm and GitHub Actions groups (`chore(deps)`, `ci(deps)`) |
| Actions | Third-party actions pinned to full commit SHAs |
| Agent docs | Provider-neutral `AGENTS.md`; no duplicate vendor instruction files |

**In flight on the template:** [PR #27](https://github.com/osloer-industries/typescript-node-template/pull/27) adds an agent-first verification ladder (ordered lint → markdown → typecheck → tests → build → `check`), markdown quality gates, setup hardening (`run-npm.mjs`, lifecycle-script-safe installs), and expanded docs. After it merges, update consumer migrations to include those gates where applicable. [PR #21](https://github.com/osloer-industries/typescript-node-template/pull/21) (merged) tightened setup verification and CI setup-smoke coverage.

**Alignment status elsewhere (snapshot):**

| Repository | Notes |
| --- | --- |
| `typescript-node-template` | Gold standard; six workflows under `.github/workflows/` |
| `homeexchange-mcp` | Same workflow *types*, but Node **22** pin, Sonar embedded in CI, job names differ from template |
| `lunch-money` | Bun adapter (see runtime table); not yet on the full template workflow set |
| `lunch-money-de-invest-sync`, `vakt` | Bun-based; domain-specific CI; use as Bun adapter pilots, not npm copies |
| Other org repos | Adopt through phased caller PRs; do not bulk-sync files from the template |

## Why a separate repository

Repositories created from a GitHub template do not remain linked to the template. Later template changes do not propagate to existing repositories.

This public organization `.github` repository can expose **reusable workflows** to both public and private organization repositories. It can also host **workflow templates** and optional default community files without copying them into every project.

## Boundaries

Shared automation may own:

- Conventional pull request title validation
- CodeQL setup for JavaScript and TypeScript
- Pull request dependency review
- Runtime-specific quality workflow building blocks (Node/npm and Bun)
- Release Please orchestration (after read-only pilots succeed)
- Organization workflow templates and documented rollout sequence

Each consuming repository continues to own:

- Application source code and tests
- `package.json`, lockfiles, and TypeScript configuration
- The choice between Node.js with npm and Bun
- Project-specific quality commands, coverage policy, and domain checks
- SonarQube Cloud project keys in `sonar-project.properties`
- Deployment environments and credentials
- Release approval and merge decisions
- Project-specific `AGENTS.md`, security, and contribution guidance (aligned in *policy*, not necessarily identical text)
- Template-only jobs such as **setup smoke** (meaningful only where `npm run setup` exists)

The rollout will not synchronize complete files from the TypeScript Node template into existing repositories. That would overwrite intentional differences, particularly Lunch Money's use of Bun, HomeExchange's combined Sonar job, and vakt's skill/CLI validation steps.

## Uniform project contract

HomeExchange, Lunch Money, and other TypeScript services should share the same **engineering contract**. Runtime-specific commands implement that contract differently, but they should produce equivalent outcomes.

The common contract is:

- Strict TypeScript with the same safety flags
- ECMAScript modules unless a documented compatibility constraint requires otherwise
- Exact dependency versions and a committed lockfile
- A pinned runtime and package-manager version (template currently pins Node 24; consumers may lag one LTS cycle during migration)
- Standard `lint`, `typecheck`, `test`, `test:coverage`, `build`, and `check` scripts (plus markdown gates after template PR #27 merges)
- Oxlint for source linting
- At least 80 percent coverage for every metric reported by the selected test runner
- A frozen, lifecycle-script-safe dependency installation in CI where setup or supply-chain risk warrants it
- A production dependency audit in CI
- Conventional pull request titles and squash commits
- CodeQL with the same query pack the template uses (`security-and-quality`)
- High-severity pull request dependency review
- SonarQube Cloud analysis with repository-specific project identifiers
- Release Please using the organization `RELEASE_TOKEN`
- Dependabot for package and GitHub Actions dependencies
- Immutable GitHub Action references with Dependabot-managed updates
- Minimal workflow permissions, concurrency cancellation, and timeouts
- Provider-neutral `AGENTS.md`, security guidance, contribution guidance, issue forms, and pull request guidance
- Secret-safe ignore rules and environment examples

Projects may add domain-specific checks after the shared contract. For example, Lunch Money keeps dependency-cruiser architecture validation and financial-data safeguards. HomeExchange keeps trusted-origin validation and session-data safeguards. vakt keeps skill and shell validation.

## What to centralize here vs copy per repo

Use this repository when the workflow is **identical** across consumers or differs only through **small, typed inputs**. Keep workflows local when they embed project keys, job naming required by existing rulesets, or domain steps.

| Candidate | Recommendation | Rationale |
| --- | --- | --- |
| Semantic PR title (`pr-title.yml`) | **Centralize first** (Phase 2 pilot) | Same action, types, and permissions everywhere; template already matches intended behavior |
| CodeQL (`codeql.yml`) | **Centralize** | Language and query pack are uniform; no repo-specific secrets |
| Dependency review | **Centralize** | Single severity threshold policy |
| Node quality block | **Reusable workflow** with inputs | `node-version-file`, optional `--ignore-scripts` install, audit command, `check` script name |
| Bun quality block | **Reusable workflow** with inputs | Frozen install and `bun run check`; no Node setup |
| Release Please | **Reusable later** (Phase 5) | Needs `RELEASE_TOKEN`, manifest paths; write permissions; signed-commit policy affects identity |
| SonarQube Cloud scan | **Mostly local caller** | `sonar-project.properties` and coverage prep differ; reusable wrapper possible after keys stabilize |
| Full `ci.yml` | **Stay in each repo** | Combines quality, optional smoke, and domain jobs; rulesets may require specific **check names** |
| Setup smoke matrix | **Template / select repos only** | Not part of the universal contract |
| `dependabot.yml` | **Copy from template** unless org Dependabot rules ship | Ecosystem-specific; low drift if template stays canonical |
| Issue/PR templates, `CONTRIBUTING.md`, `SECURITY.md` | **Optional org defaults** in `.github` | GitHub serves org-level defaults to repos that do not define their own; only if text stays provider-neutral |
| `AGENTS.md` verification ladder | **Policy in template**; link from org README | Content is repo-specific (paths, scenarios); org doc should point to template PR #27 pattern |

Consumer repositories should call reusable workflows with **`uses: osloer-industries/.github/.github/workflows/<name>.yml@<sha>`** (note the nested `.github` path GitHub requires for org reusable workflows).

## Runtime adapters

Only the runtime implementation is intentionally different:

| Concern | Node template, HomeExchange (target) | Lunch Money, vakt (Bun) |
| --- | --- | --- |
| Runtime | Node.js 24 (template); HomeExchange migrating from 22 | Bun |
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

After consumers expose **stable, agreed check names**, a second organization ruleset can target TypeScript repositories and require:

- `Quality` (or a deliberately renamed equivalent documented per repo during transition)
- `Semantic pull request`
- `Review dependency changes`
- Successful CodeQL analysis (`Analyze JavaScript and TypeScript` or mapped equivalent)
- SonarQube Cloud analysis where configured

**Owner decision:** HomeExchange today uses `Typecheck, lint & SonarCloud` instead of template job names. Either rename jobs during migration or map both names in rulesets until cutover completes.

Repository-level rulesets should contain only genuine exceptions or additional domain requirements. Classic branch protection should not duplicate these rulesets.

Lunch Money currently requires signed commits while HomeExchange does not. This is not part of the initial common baseline. GitHub does not allow a user to squash-merge a signed-commit-protected pull request unless that user authored the pull request, which can conflict with Release Please pull requests authored by a GitHub App or separate maintainer identity. Signed commits should be evaluated in a dedicated phase against the chosen `RELEASE_TOKEN` identity before applying one policy to both repositories.

## Versioning and trust

Consumer workflows will reference shared workflows by immutable commit SHA. A same-line version comment will identify the corresponding release tag. Dependabot will propose reference updates for review.

Reusable workflows receive only the permissions granted by their caller. Callers must declare minimal permissions explicitly. Secrets are passed by name and only when a workflow requires them.

Changes to shared workflows follow Conventional Commits and Release Please. Breaking workflow input or behavior changes require a major release.

## Rollout phases

### Phase 1: foundation (this pull request)

Create this repository and agree on the architecture, boundaries, centralization table, and rollout sequence. No consumer workflow changes occur in this phase.

Acceptance criteria:

- The repository is public so public and private organization repositories can call it.
- The scope and security model are documented and match the template baseline table.
- No shared workflow is enabled yet.

### Phase 2: read-only pilot

Add reusable workflows for **semantic PR title**, **CodeQL**, and **dependency review**. Pilot first in `typescript-node-template` by replacing like-for-like caller stubs while preserving existing required check names.

Acceptance criteria:

- Valid and invalid test pull request titles produce the expected result.
- Callers grant only the permissions each reusable workflow needs.
- Reusable workflows are pinned by immutable SHA in callers.
- Template checks remain green; setup smoke and Sonar behavior unchanged.

### Phase 3: HomeExchange governance

Adopt the proven read-only reusable workflows in `homeexchange-mcp`. Align Node pin and job naming with the template where organization rules allow. Preserve HomeExchange-specific Sonar and privacy behavior locally until Sonar centralization is explicitly scoped.

Acceptance criteria:

- HomeExchange-specific CI, SonarQube Cloud, and privacy behavior remain local where required.
- Required organization and repository checks continue to pass.
- Release Please remains maintainer-controlled.

### Phase 4: Lunch Money and Bun

After Lunch Money's in-flight feature work lands, add or adopt the Bun quality reusable workflow using the existing `bun run check` contract. Do not introduce npm or Node.js setup into Bun-first projects.

Acceptance criteria:

- Frozen Bun installation and production audit run successfully.
- Existing tests and plugin validation remain authoritative.
- No financial data, credentials, or generated reports leave the repository.

### Phase 5: write-capable automation

Evaluate centralizing Release Please only after read-only workflows are stable in npm and Bun consumers. Evaluate SonarQube Cloud separately because project identifiers and secret behavior differ.

Acceptance criteria:

- The organization `RELEASE_TOKEN` is restricted to selected repositories.
- Release pull requests trigger all required checks.
- Shared automation cannot bypass review or branch rules.
- Rollback consists of reverting a small caller workflow change.

## Change process

Each phase uses a separate pull request. A phase is merged and observed before work starts on the next phase. Consumer migrations are separate pull requests so one repository can roll back without affecting another.

No branch protection, organization ruleset, repository secret, or consumer workflow is changed implicitly by work in this repository.
