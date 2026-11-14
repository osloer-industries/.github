# Changelog

## [0.1.1](https://github.com/osloer-industries/.github/compare/v0.1.0...v0.1.1) (2026-11-14)


### Bug Fixes

* **release-please:** request workflows write on release app tokens ([baa194a](https://github.com/osloer-industries/.github/commit/baa194a49de2e72e9fb485a0bd260fcfdd39a2f7))
* **release-please:** request workflows write on release app tokens ([1361abd](https://github.com/osloer-industries/.github/commit/1361abd4d5ceb6b9f108459e6021b49a28b08385))

## 0.1.0 (2026-11-14)


### Features

* add SonarCloud zero open issues reusable workflow ([#11](https://github.com/osloer-industries/.github/issues/11)) ([b62b079](https://github.com/osloer-industries/.github/commit/b62b0798a56e1fe7d5fd5535d59567f3d2974644))
* **codeql:** add SARIF artifact mode for repos without Code Scanning ([71790d5](https://github.com/osloer-industries/.github/commit/71790d5d6dfef5bf7caccc63678c09d3bae9097d))
* mutation-changed reusable and fleet migration gaps ([7fc4e6c](https://github.com/osloer-industries/.github/commit/7fc4e6c38f0a7822bebd1c498bdc0df24c6d892d)), closes [#12](https://github.com/osloer-industries/.github/issues/12) [#13](https://github.com/osloer-industries/.github/issues/13)
* org reusable workflow-security (actionlint + zizmor, no Python) ([#6](https://github.com/osloer-industries/.github/issues/6)) ([43cd5bb](https://github.com/osloer-industries/.github/commit/43cd5bb5596d8f80c73537bd3dab29b4d8a95ade))
* org reusable workflows for TypeScript CI and governance ([#2](https://github.com/osloer-industries/.github/issues/2)) ([3c84a70](https://github.com/osloer-industries/.github/commit/3c84a702b48ef8e88b0c696e1621d4e040d3a7bb))
* **release:** semver tags from v0.1.0 with Release Please ([1567c69](https://github.com/osloer-industries/.github/commit/1567c69b13037b3370e6b583e6d6f220182495db))


### Bug Fixes

* **codeql:** correct SARIF gate resolution and add CI coverage ([fa4c246](https://github.com/osloer-industries/.github/commit/fa4c2460f92ddd78184950546c0742abeb93d149))
* **codeql:** inline SARIF gate for external reusable callers ([e3961f1](https://github.com/osloer-industries/.github/commit/e3961f13d7c2d28ad5306f200c21374274c6dd36))
* **codeql:** set persist-credentials false on standards checkout ([0a8ce50](https://github.com/osloer-industries/.github/commit/0a8ce500c7da88afd0f1b8678e5555b8206f1efc))
* **codeql:** use source-root instead of invalid init paths input ([a13ca88](https://github.com/osloer-industries/.github/commit/a13ca8823048050f77a149ee48ba335efac809af))
* forward JOB_WORKFLOW_SHA via step output for checkout ([3cf442f](https://github.com/osloer-industries/.github/commit/3cf442fa4c53594b1e71627a1c3104ef8ddbfe49))
* inline zizmor threshold validator for cross-repo reusables ([d4865a4](https://github.com/osloer-industries/.github/commit/d4865a4b2c70c8433188f5200beac104b1c7fe86))
* **release:** branch reusable release job without caller event_name ([154575e](https://github.com/osloer-industries/.github/commit/154575ef82d94c6b86e30a9b2f02a0048c21bade))
* **release:** mint osloer-reviewer app token for Release Please ([577c384](https://github.com/osloer-industries/.github/commit/577c3842a2855769aa82ec36f9698876374e0758))
* **release:** pass actionlint and zizmor for org release automation ([c8d6d10](https://github.com/osloer-industries/.github/commit/c8d6d107d57271a11dabaa0761022f5d0c09296b))
* resolve vendored script pin via job.workflow_sha ([87d0a87](https://github.com/osloer-industries/.github/commit/87d0a87256339e4bc7da71ce86913442f00f11b1))
* **reusables:** checkout scripts at job.workflow_sha ([1faeb05](https://github.com/osloer-industries/.github/commit/1faeb059834494bd9d4d22ff9b7240e95ad77172))
* same-repo relative path for reusables smoke caller ([7b102de](https://github.com/osloer-industries/.github/commit/7b102de125379bfae2771052569ea8a88f271c87))
* **smoke:** avoid zizmor template injection in error message ([65dc7ba](https://github.com/osloer-industries/.github/commit/65dc7ba5e001dc552cada5a8d2aa88be7f425638))
* use fully qualified reusable smoke caller ref ([0a551a1](https://github.com/osloer-industries/.github/commit/0a551a11747dece5fa785f2f681ffe8b93ff9c80))
* use JOB_WORKFLOW_SHA for script sparse-checkout ([e74ba09](https://github.com/osloer-industries/.github/commit/e74ba09ee8a9f6e99e1e538c06b21b2bd96136ab))
