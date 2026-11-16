# CodeQL live vulnerable fixture

`code-injection.vulnerable` holds JavaScript that must fail the org CodeQL security gate in CI. It is not committed as `.js` so SonarCloud jssecurity (S2076) does not flag the repository.

The `codeql-live-vulnerable-gate` job copies it to `code-injection.js` before `github/codeql-action/init` runs. The generated `.js` file is gitignored.