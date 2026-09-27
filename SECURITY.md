# Security

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/JintaoHe/Bun-Barrage/security/advisories/new). Do not put exploitable details, credentials or personal data in public issues or pull requests. Only the current `main` branch is maintained; this is a hobby project without a security response SLA.

## What the app does and does not do

Bun Barrage is a static web app that runs inside the Even Realities app's WebView and talks to the G2 glasses only through the official Even Hub SDK bridge. It has no backend, no accounts, no analytics and no network requests of its own. `app.json` requests no permissions. The only data it stores is a win/loss counter, kept in the Even host storage (or browser storage in preview mode).

A change that adds network access, new permissions, remote code, third-party scripts or collection of any user data needs a clear explanation in its pull request and owner review.

## Publishing rules

Never commit `.env` files, tokens or keys, signing material, logs, personal screenshots, dependency directories (`node_modules`) or build output (`dist/`, `*.ehpk`, zips). Release packages (`.ehpk`) are attached to GitHub Releases, not committed.

Before pushing, stage only reviewed paths, check `git diff --cached --stat` and run `npm run audit:public`. The audit rejects unexpected file types and paths, oversized files, personal home-directory paths and common credential patterns. It is a guardrail, not a proof that nothing sensitive is present.

If a credential is ever published, revoke or rotate it immediately. Deleting it in a later commit does not remove it from Git history or from forks.

The Windows helper scripts in `windows/` download Node.js only from nodejs.org and verify its SHA-256 checksum before installing. Changes to them get the same review as code.
