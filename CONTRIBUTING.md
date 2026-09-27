# Contributing

Thanks for your interest! Open an issue with a clear description (and, for bugs, steps to reproduce) before large changes. Then fork the repository and open a pull request to `main`. Issues and pull requests do not grant write access.

## How changes are merged

- Every change goes through a pull request. Direct pushes, force pushes and deleting `main` are blocked.
- CI must pass and all review conversations must be resolved.
- The repository owner reviews every change through CODEOWNERS (including changes to workflows and to this file).
- The sole owner may bypass the approval requirement only when merging a pull request; this does not bypass CI or allow direct pushes. (GitHub does not let authors approve their own pull requests.)

## Before you open a pull request

```bash
npm ci
npm run build        # typecheck + production build
npm test             # game-logic tests
npm run audit:public # checks the files you are about to publish
```

Behaviour changes need tests. Keep the art original: no characters, names, sprites or sounds from existing games or other brands. Do not include credentials, logs or personal data.

## CI and Actions

CI runs on GitHub-hosted runners with read-only permissions and no secrets. Workflows from outside contributors need maintainer approval before they run: review workflow changes and code before approving. Never add `pull_request_target` workflows that run contributor code, self-hosted runners for public pull requests, or secrets in pull-request jobs. Actions are pinned to full commit hashes. Dependency updates (Dependabot) are reviewed, never auto-merged.
