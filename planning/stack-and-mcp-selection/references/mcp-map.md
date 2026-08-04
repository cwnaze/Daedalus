# Stack → MCP server map

Maintained by hand. Add an entry every time an agent writes stale code for a
library — that is the signal a server (or at minimum a CLAUDE.md warning) is needed.

Each entry: what triggers it, which server, and *why* the model gets it wrong.
The `why` is the important field — it tells a future reader whether the entry is
still needed after the ecosystem settles. An **auth** field says what credential the
tool needs and how it's obtained — an interactive `login` command (no secret handed to
the agent) or a token/key that must be supplied and stored.

## CLI vs. MCP

For platform/infra services, prefer the vendor's official CLI over an MCP server when
one exists and is mature: `wrangler` (Cloudflare), `supabase` (Supabase), `turso`
(Turso), `vercel` (Vercel), `gh` (GitHub), `drizzle-kit` (Drizzle). Reasons:

- It already runs through Bash — no new tool-call surface to wire up.
- Most support an interactive `login` that caches a session locally, instead of a
  static access token that has to be generated, handed to the agent, and stored in a
  committed `.mcp.json`.
- It's usually the vendor's most-maintained integration path; third-party MCP wrappers
  for the same service lag behind CLI releases.

Reach for the MCP server anyway only when the CLI can't do something the agent
specifically needs — live interactive introspection, browser automation (Playwright),
or the CLI doesn't exist. This preference does **not** extend to documentation/API-shape
servers (Svelte, Tailwind, TipTap, Next.js): there's no CLI that fixes stale
training-data knowledge of a library's current API surface, so those stay MCP
regardless.

## Frontend frameworks

- **match:** svelte, sveltekit
  **server:** sveltekit-mcp
  **why:** Svelte 5 runes (`$state`, `$derived`, `$effect`) replaced the store/reactive-label
  API. Models default to Svelte 4 patterns and mix the two, which typechecks and then
  misbehaves at runtime. Highest-value entry in this file.
  **auth:** none — local docs/knowledge server.

- **match:** next, next.js
  **server:** nextjs-mcp
  **why:** App Router vs. Pages Router; server actions and caching semantics have
  changed across minor versions.
  **auth:** none — local docs/knowledge server.

- **match:** react 19
  **server:** (none — CLAUDE.md warning)
  **why:** `use()`, form actions, and the removal of `forwardRef` ceremony are recent.
  **auth:** n/a.

## Editors

- **match:** tiptap, @tiptap
  **server:** (none — CLAUDE.md warning)
  **why:** v3 (current as of 2026) renamed/removed packages and changed the
  `BubbleMenu`/`FloatingMenu` prop API (`tippyOptions` removed in favor of an options
  object). Models default to v2 patterns, which typecheck against the wrong import
  paths and fail at runtime rather than build time.
  **auth:** n/a.

## Styling

- **match:** tailwind, tailwindcss
  **server:** tailwind-mcp
  **why:** v4 moved configuration into CSS (`@theme`) and dropped `tailwind.config.js`
  as the primary surface. Models emit v3 config files by default. No CLI fixes this —
  it's a knowledge-staleness problem, not an action, so the CLI-preference rule doesn't
  apply here.
  **auth:** none — local docs server, no service account involved.

## Data

- **match:** drizzle, drizzle-orm
  **server:** (none — use `drizzle-kit` CLI)
  **why:** Dialect-specific config (`dialect: 'turso'`) and `drizzle-kit` command
  names have churned across versions, but `drizzle-kit` ships with the ORM itself and
  is the vendor's own tool — running it directly (`drizzle-kit generate`, `push`,
  `studio`) is more current than a third-party community MCP wrapper
  (`defrex/drizzle-mcp` is the only one available and isn't officially maintained).
  Web-search current dialect config when unsure rather than trusting training data.
  **auth:** none for the CLI itself; the database connection string it operates against
  is a separate secret (e.g. `DATABASE_URL`).

- **match:** prisma
  **server:** (none — CLAUDE.md warning)
  **why:** Generally stable; note the client generation step.
  **auth:** none for local generation; Prisma Data Platform features (if used) need a
  separate API key.

## Platform / infra

- **match:** cloudflare, workers, r2, d1
  **server:** (none — use `wrangler` CLI)
  **why:** Wrangler config format and binding syntax change frequently, but `wrangler`
  *is* the vendor's own tool and `wrangler init`/`--help` reflect the current syntax
  directly — that's more current than an MCP wrapper around the same surface. Fall back
  to the `cloudflare` remote MCP server only if live interactive binding introspection
  is genuinely needed mid-session.
  **auth:** `wrangler login` — interactive OAuth, caches a session locally, no token
  handled by the agent. CI (non-interactive) needs `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` as secrets.

- **match:** vercel
  **server:** (none — use `vercel` CLI)
  **why:** Adapter runtime pinning and project settings surface change often, but the
  CLI is the vendor's own current interface.
  **auth:** `vercel login` — interactive, local session. CI needs `VERCEL_TOKEN`.

- **match:** turso, libsql
  **server:** (none — use `turso` CLI)
  **why:** CLI surface and auth token flow shift; embedded replicas are recent — but
  again, the CLI is the vendor's current surface, not a lagging wrapper.
  **auth:** `turso auth login` — interactive, local session. CI needs a database or
  platform token (`TURSO_API_TOKEN` / per-db auth token) depending on what's automated.

- **match:** supabase
  **server:** (none — use `supabase` CLI)
  **why:** RLS policy syntax and the auth client API have both moved, but the CLI
  (`supabase login`, `link`, `db push`, `functions deploy`) tracks the platform
  directly rather than through a wrapper needing a manually-generated token.
  **auth:** `supabase login` — interactive OAuth, local session, for `supabase link`
  and migrations. CI needs `SUPABASE_ACCESS_TOKEN` (personal access token) for
  non-interactive linking. Separately, the *app itself* (not the agent's tooling) needs
  runtime secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` —
  those come from the Supabase project dashboard, not from `supabase login`.

## Always include

- **playwright-mcp** — every project. The demo/regression layer depends on it, and
  unlike `npx playwright test`, it gives the agent live interactive browser control
  (navigate, click, screenshot) mid-session — a CLI test runner doesn't provide that,
  so the CLI-preference rule doesn't displace it.
  **auth:** none — drives a local/headless browser, no service account.
- **github-mcp** — only if the local session needs repo operations beyond `gh` (which
  is already authenticated via `gh auth login` and is the default for repo operations
  in this pipeline).
  **auth:** if added, needs a `GITHUB_TOKEN`/PAT with the relevant repo scopes.
