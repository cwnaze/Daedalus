---
name: stack-and-mcp-selection
description: Choose the technology stack for a new project and determine which MCP servers the build agents will need, especially for libraries whose current API postdates model training data. Use after project-intake, or whenever the user asks which stack to use, which MCP servers a project needs, or types /stack-and-mcp-selection.
---

# Stack and MCP Selection

Planning, step 2 of 5. Reads the intake document, proposes a stack, and produces the `.mcp.json` the repos will carry.

## Procedure

### 1. Read the intake

`~/Notes/<project-slug>-intake.md`. If it does not exist, run `/project-intake` first — do not guess at requirements.

### 2. Propose a stack with reasoning

Cover: language/runtime, framework, database, ORM/query layer, auth, object storage if needed, hosting, styling, test runner.

For each, give one line of reasoning tied to a constraint from the intake. "Turso because single-user, edge-deployed, and the budget rules out managed Postgres" is a reason. "Turso is popular" is not.

Where a real tradeoff exists, present both options and your pick. The user overrides freely — take the override without relitigating.

### 3. Map stack to MCP servers

Read `references/mcp-map.md` and match every stack element. The governing question is not "is this library popular" but **"would an agent writing this from training data alone produce out-of-date code?"** That is true when:

- The current major version postdates typical training cutoffs
- The API changed shape rather than just growing (Svelte 5 runes vs. Svelte 4 stores; Tailwind v4 config-in-CSS vs. v3 JS config)
- The service's dashboard/CLI surface changes frequently

For anything matching, request the MCP server — **unless an official CLI already covers it.** Check first: for platform/infra services (Cloudflare, Supabase, Turso, Vercel, GitHub), an official CLI (`wrangler`, `supabase`, `turso`, `vercel`, `gh`) is usually the vendor's best-maintained integration path. It already runs through Bash, doesn't require embedding an access token in a committed `.mcp.json`, and is typically more reliable than a third-party or wrapper MCP server for the same actions. Prefer the CLI in that case and mark the map entry `(none — use <cli> CLI)`. Reach for the MCP server only when the CLI genuinely can't do something the agent needs (live interactive introspection, browser automation) — not just "it also exists."

This preference does **not** apply to pure documentation/API-shape servers (Svelte, Tailwind, TipTap, Next.js) — there's no CLI that fixes stale training-data knowledge of a library's current API surface, so the staleness problem stands regardless of CLI availability.

For anything you suspect but that is not in the map, **web search the library's current major version before deciding** — do not rely on memory for what is current, since that is the exact failure the MCP servers exist to prevent.

### 4. Confirm and record

Show the user the stack, the MCP list with a one-line reason each, the CLI tools preferred over an MCP server with their auth method, and anything you flagged as version-risky but for which no server exists (those become CLAUDE.md warnings instead).

For every CLI or MCP server that needs authentication, list what credential is required and how it's obtained (interactive `login` command vs. a token/key the user must supply) — then prompt the user for exactly those credentials before moving on. Don't guess at scopes or ask for more than the stack in front of you needs.

Append any new mapping you discovered to `references/mcp-map.md`. This file is the part of the pipeline that gets smarter over time; leaving it unmaintained is the main way this skill decays.

## Outputs

**`~/Notes/<project-slug>-stack.md`** — frontmatter `tags: [project/<slug>, type/stack, status/active]`. Stack table with reasoning, MCP server list, version-risk warnings.

**`pipeline.json`** staged at `/tmp/<project-slug>/pipeline.json`. This is what makes the
pipeline stack-agnostic: every workflow reads it instead of assuming a language. Fill in
the runtime and version you just chose, the install command, the typecheck/lint/build/test
commands, and how the app is served in CI versus dev.

Start from the closest file in `pipeline/docs/pipeline-examples/` rather than writing
one from memory — they cover Python, Go, Rust, Ruby, Java, static sites, and CLIs with no
web surface at all. Leave a command empty rather than inventing one; empty means "skip",
and a wrong command fails every CI run until someone notices.

If the project has no web surface, omit `serve` entirely and tell `story-breakdown` that
every story is `demoKind: "command"`.

**Set `services` whenever the stack needs a local dependency running for dev/CI** — a
database, cache, queue, or anything else the app can't run without. This is easy to miss
because nothing fails loudly when it's wrong: `services: null` silently skips
`setup-project`'s "Start local services" step, and every later workflow
(`ci`/`story-start`/`pr-review`/`pr-fix`/`production-prep`) just runs against whatever
happens to not be there. A story can still pass its own verification if it starts the
service itself inline, which papers over the gap until a later story (or `pr-review`,
which does not know to start anything the story itself didn't) hits it cold. Found live:
a project using Supabase (`npx supabase start` for local Postgres) shipped with
`services: null`; `pr-review` never started it, and the story's own review silently
produced no verdict rather than a clear error. If there's a `docker-compose.yml`/
`compose.yml`, that's already the fallback and `services` can stay `null` — see the
`python-django.json`/`ruby-rails.json` examples for the compose case, and set `services`
to the literal startup command (e.g. `"npx supabase start"`) when there is no compose
file to fall back to.

**`.mcp.json`** staged at `/tmp/<project-slug>/mcp.json` for `repo-bootstrap` to commit — only the servers that survived the CLI-preference check in step 3:

```json
{
  "mcpServers": {
    "<name>": { "command": "...", "args": ["..."] }
  }
}
```

CLI tools preferred over an MCP server (per `references/mcp-map.md`) don't go in
`.mcp.json` — they're plain CLIs invoked over Bash. List them and their auth method in
the stack doc instead, so `repo-bootstrap` knows what login steps a human needs to run
and what secrets CI needs.

Next step: `/project-docs`.
