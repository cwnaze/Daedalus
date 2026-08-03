# Stack → MCP server map

Maintained by hand. Add an entry every time an agent writes stale code for a
library — that is the signal a server (or at minimum a CLAUDE.md warning) is needed.

Each entry: what triggers it, which server, and *why* the model gets it wrong.
The `why` is the important field — it tells a future reader whether the entry is
still needed after the ecosystem settles.

## Frontend frameworks

- **match:** svelte, sveltekit
  **server:** sveltekit-mcp
  **why:** Svelte 5 runes (`$state`, `$derived`, `$effect`) replaced the store/reactive-label
  API. Models default to Svelte 4 patterns and mix the two, which typechecks and then
  misbehaves at runtime. Highest-value entry in this file.

- **match:** next, next.js
  **server:** nextjs-mcp
  **why:** App Router vs. Pages Router; server actions and caching semantics have
  changed across minor versions.

- **match:** react 19
  **server:** (none — CLAUDE.md warning)
  **why:** `use()`, form actions, and the removal of `forwardRef` ceremony are recent.

## Styling

- **match:** tailwind, tailwindcss
  **server:** tailwind-mcp
  **why:** v4 moved configuration into CSS (`@theme`) and dropped `tailwind.config.js`
  as the primary surface. Models emit v3 config files by default.

## Data

- **match:** drizzle, drizzle-orm
  **server:** drizzle-mcp
  **why:** Dialect-specific config (`dialect: 'turso'`), and `drizzle-kit` command
  names have churned across versions.

- **match:** prisma
  **server:** (none — CLAUDE.md warning)
  **why:** Generally stable; note the client generation step.

## Platform / infra

- **match:** cloudflare, workers, r2, d1
  **server:** cloudflare-mcp
  **why:** Wrangler config format and binding syntax change frequently; R2's
  S3-compatible surface has non-obvious gaps.

- **match:** vercel
  **server:** vercel-mcp
  **why:** Adapter runtime pinning and project settings surface change often.

- **match:** turso, libsql
  **server:** turso-mcp
  **why:** CLI surface and auth token flow shift; embedded replicas are recent.

- **match:** supabase
  **server:** supabase-mcp
  **why:** RLS policy syntax and the auth client API have both moved.

## Always include

- **playwright-mcp** — every project. The demo/regression layer depends on it and
  the trace/screenshot API is worth having documented in-context.
- **github-mcp** — only if the local session needs repo operations beyond `gh`.
