# Coverage checklist

Every item gets an answer during pass 2: covering story, new story, or explicit N/A.

**This checklist is written for web applications and HTTP services**, which is what the
pipeline is built for. On a CLI, library, or data pipeline a good number of these are
legitimately N/A — CORS and session lifecycle on a CLI, for instance. Mark them N/A with
the reason and move on; that is a correct answer, not a skipped one.

What does *not* become N/A on a non-web project: secrets handling, input validation,
error handling, migrations, backups, and documentation. Those are where a "this is just a
CLI" reflex does real damage.

## Foundation
- [ ] Project scaffolded with the chosen framework, TypeScript, and lint/format
- [ ] Database provisioned, connection verified from the app
- [ ] Object/file storage provisioned, if the project stores files
- [ ] Third-party service accounts provisioned and keys obtained
- [ ] Baseline schema applied

## CI/CD
- [ ] CI runs typecheck, lint, build on every PR
- [ ] Test suite runs in CI with the services it needs available
- [ ] Deploy pipeline exists and has succeeded at least once
- [ ] Preview/staging environment for verification
- [ ] Rollback path documented and tested

## Auth and authorization
- [ ] Authentication mechanism implemented end to end
- [ ] Session lifecycle: creation, expiry, revocation
- [ ] Authorization enforced **server-side** on every mutating endpoint
- [ ] Unauthenticated and unauthorized responses are correct and non-leaky

## Secrets and configuration
- [ ] All secrets in env vars, none in source
- [ ] `.env.example` documents every variable and its purpose
- [ ] Secrets present in the deploy target and in CI
- [ ] Secret scanning covers full git history

## Input and data safety
- [ ] Every external input validated at the boundary — request bodies, query params, webhooks, uploads
- [ ] Uploads constrained by type and size
- [ ] Webhook payloads signature-verified
- [ ] Parameterized queries throughout; no string-built SQL
- [ ] Output encoding / XSS handled where user content renders

## Error handling and observability
- [ ] Errors surface to the user meaningfully rather than as a blank screen
- [ ] Server errors logged with enough context to debug
- [ ] Structured logging with a request or correlation ID
- [ ] Health check endpoint
- [ ] Failures of external services degrade gracefully

## Data lifecycle
- [ ] Migrations are versioned and repeatable
- [ ] Migration rollback path exists
- [ ] Seed/fixture data for local development and tests
- [ ] Backup and restore story for anything not reconstructible

## Resilience
- [ ] Rate limiting on public and expensive endpoints
- [ ] Timeouts and retry policy on outbound calls
- [ ] Idempotency where a retry could double-write

## Frontend quality
- [ ] Loading and empty states for every async surface
- [ ] Error states for every failable action
- [ ] Keyboard navigation and focus management
- [ ] Semantic markup and labels for interactive elements
- [ ] Responsive behaviour at the viewports that matter for this project

## Documentation
- [ ] README covers setup, run, test, deploy
- [ ] Environment variables documented
- [ ] Architecture decisions captured in the vault
