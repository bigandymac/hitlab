# HitLab Actions private pilot

Status: implemented and tested locally, not deployed or connected to the live GPT.

`npm start` now starts `start-actions.js`, not the legacy `server.js`. The old `/project`, `/brand/rollout` and public `/static` API are not exposed by this entry point. Existing stored projects are not migrated. This is a deliberate prototype API change; do not replace an existing live deployment without checking its consumers.

## What works

- `GET /health`: service status.
- `POST /projects`: creates an immutable snapshot and waits for persistence.
- `GET /projects/{projectId}`: returns real saved content, or 404.
- `POST /reports/export`: formats GPT-supplied report text as a PDF.
- Project and export requests require a Bearer key. PDF downloads require a random 15-minute capability token; anyone holding that link can read the PDF until expiry.
- The server does not call OpenAI or Suno. GPT instructions do the editorial drafting; these Actions provide storage and export.

## Local setup

Use Node 22 or later and `npm ci`. The local verification used existing dependency files from the original repository ZIP, not a fresh install or dependency audit.

Configure these values through your host's secret/environment settings, not a committed file:

| Variable | Required value |
| --- | --- |
| HITLAB_ACTIONS_KEY | Owner-generated random secret of at least 32 characters |
| BASE_URL | Public HTTPS origin for deployment; local origin for local tests |
| PORT | Host-assigned port, default 8080 |
| NODE_ENV | production when hosted |
| DATABASE_FILE | Absolute persistent path, such as a mounted volume's projects.db |
| REPORT_DIR | Absolute report directory on that volume |

No real credential was created or installed in this change. `DATABASE_URL` does not enable PostgreSQL. Use `DATABASE_FILE`. Host on a single Node process with a persistent volume and HTTPS; this file database is not designed for multiple replicas or ephemeral serverless storage. Keep proxy trust and rate limiting consistent with the chosen host before publishing. Avoid proxy/access logs that record download tokens.

## Connect the private GPT

1. Deploy the backend to the chosen HTTPS host; verify `/health` and authenticated create/read/export behavior.
2. Set `BASE_URL` to that HTTPS origin and run `npm run actions:schema`. The checked-in `.invalid` origin is a reserved non-working placeholder.
3. In the GPT editor's Actions section, paste `hitlab-actions.openapi.json`.
4. Select API Key authentication with Bearer authorization. Enter the same backend secret through the editor's secure credential field; do not paste it into chat or instructions.
5. Install the HitLab-1.1 instructions from the supplied activation pack, then use the Test control for all four operations.
6. Save a synthetic project, open its returned ID, export a PDF, and test from iPhone Safari before adding customer material.

Keep this GPT private to its owner. One shared API key is NOT per-user authentication; a public/customer GPT needs OAuth plus ownership enforcement before storing private lyrics. Project IDs are not an authorization boundary. The pilot intentionally has no list/delete endpoint or customer billing. Export links stop working after a restart; export again. Restarted processes do not clean orphan report files, so an operator must set retention cleanup on the report directory. The PDF uses PDFKit's standard fonts: English/Latin pilot content only until suitable Unicode fonts are bundled and verified. Preserve non-Latin lyrics in project text rather than relying on this PDF export.

## Validation

Run `npm test`. The suite checks authentication, persistence, immutable versions, reopening across an application restart, missing records, bad input, separate PDF exports, download protection and expiry. These checks validate backend behavior, not lyric quality, browser usability, or GPT tool selection. OpenAPI JSON is generated from the same field definitions used by validation; GPT editor import remains an external acceptance check.

Before charging for HitLab: run the twelve editorial cases in the activation pack, compare revisions blind against a generic ChatGPT baseline, and check that pilot writers adopt the edits. No live GPT or iPhone acceptance test has been completed.

Official setup sources: https://developers.openai.com/api/docs/actions/getting-started and https://developers.openai.com/api/docs/actions/authentication
