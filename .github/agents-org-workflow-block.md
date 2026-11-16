## Agent workflow (org-wide, keep identical across osloer-industries repos)

These rules apply to every agent (Cursor, Grok Bot, any other) working in this repo.

### Quality
- Never cut corners on quality or architecture. Fix root causes. No `continue-on-error`, `|| true`, skipped or deleted tests, lowered thresholds, ignore or suppress comments, `NOSONAR`, exclusions, new lint/Sonar rule exceptions or overrides, audit ignores, `--legacy-peer-deps`, or `--force`.
- SonarCloud issues are resolved only by fixing code, never by marking them false positive or won't-fix.
- Scripts are TypeScript on Node 24, never Python.
- `AGENTS.md` is the only agent instruction file; never add `CLAUDE.md` or tool-specific rule files.

### CI and workflows
- Pin GitHub Actions by full commit SHA with an accurate version comment. Org reusables from `osloer-industries/.github` are pinned `@<full sha> # v0.x.y` (a release tag, never `# main`).
- Every CI job feeds the single `ci-passed` aggregate job, including Workflow security, CodeQL and the SonarCloud zero-issues job. `ci-passed` is the only required status check.
- Only Dependabot patch/minor bumps and patch/minor release PRs auto-merge. Majors (or pre-1.0 breaking changes) never auto-merge; they wait for a human.
- Run the repo's linters, tests and pre-commit checks locally before pushing. The pre-commit hook is never skipped (`--no-verify` is not allowed).
- **After a push to a PR head branch** (Cloud Agents with subscription tools): subscribe to GitHub CI on that **head branch** (`owner/repo` + branch name), not `main`. State what you are waiting for and end the turn. When a failure notification arrives, investigate the failed checks, fix, commit, push, and **subscribe again** on the new head. Do **not** poll CI in the shell (`gh run watch`, `sleep` loops, repeated `gh pr checks`).
- **After a push with no open PR** (e.g. direct work on `main`): do not use branch CI subscription as a standing fleet watcher on the default branch; run local checks before push, then stop unless a human or automation opens a follow-up.
- **Fork PRs** and check runs GitHub does not attribute to the head branch may not deliver subscription events; if CI fails and nothing arrives, investigate when the human pins the failure.
- Consumer repositories under **osloer-industries** should carry the same **Agent workflow** section (copy from this file after release); keep it identical org-wide.

### Pull requests
- Keep PRs focused and reviewable, link the issues they close, and prefer simplification (less code, fewer dependencies, removed duplication).
- Resolve conflicts by merging the base branch in. Never rebase a pushed branch, never force-push, never bypass branch protection.
- A PR is ready for review only when all of these hold: it has no conflicts and is up to date with `main`; every check on the current head is green (pending is not ready); and it has no unresolved review threads, requested changes or open SonarCloud issues. Fix anything short of that yourself (including CI fixes surfaced via subscription). Ask a human only when a real decision or ambiguity needs one.
- Never touch secrets, permissions, repo settings or rulesets without explicit human approval.