---
name: stack-and-mcp-selection
description: Choose the technology stack for a new project and determine which MCP servers the build agents will need, especially for libraries whose current API postdates model training data. Use after project-intake, or whenever the user asks which stack to use, which MCP servers a project needs, or types /stack-and-mcp-selection.
---

# Stack and MCP Selection

Phase 1, step 2 of 5. Reads the intake document, proposes a stack, and produces the `.mcp.json` the repos will carry.

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

For anything matching, request the MCP server. For anything you suspect but that is not in the map, **web search the library's current major version before deciding** — do not rely on memory for what is current, since that is the exact failure the MCP servers exist to prevent.

### 4. Confirm and record

Show the user the stack, the MCP list with a one-line reason each, and anything you flagged as version-risky but for which no server exists (those become CLAUDE.md warnings instead).

Append any new mapping you discovered to `references/mcp-map.md`. This file is the part of the pipeline that gets smarter over time; leaving it unmaintained is the main way this skill decays.

## Outputs

**`~/Notes/<project-slug>-stack.md`** — frontmatter `tags: [project/<slug>, type/stack, status/active]`. Stack table with reasoning, MCP server list, version-risk warnings.

**`.mcp.json`** staged at `/tmp/<project-slug>/mcp.json` for `repo-bootstrap` to commit:

```json
{
  "mcpServers": {
    "<name>": { "command": "...", "args": ["..."] }
  }
}
```

Next step: `/project-docs`.
