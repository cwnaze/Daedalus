# stories.json schema

The single source of truth for the running pipeline. Lives at the repo root of the **spine repo**
(the only repo that carries it, even in split frontend/backend projects).

## Top level

```json
{
  "project": "custom-email-inbox",
  "spineRepo": "owner/custom-email-inbox",
  "repos": {
    "app": { "ssh": "git@github.com:owner/custom-email-inbox.git", "root": "." }
  },
  "definitionOfDone": [
    "typecheck passes",
    "lint passes",
    "build succeeds",
    "story demo spec passes and regenerates its demo doc",
    "all previously passing demo specs still pass"
  ],
  "stories": [ ... ]
}
```

`definitionOfDone` is duplicated into `CLAUDE.md` at bootstrap. It lives here too so
`pr-review` can assert against it without parsing prose.

## Story record

```json
{
  "id": "US-A00",
  "repo": "app",
  "title": "Scaffold SvelteKit project with Tailwind and Vercel adapter",
  "userStory": "As a developer, I need a working SvelteKit project so every later story has an app to build inside.",
  "acceptanceCriteria": [
    "SvelteKit project created with TypeScript and Svelte 5 runes enabled",
    "Tailwind installed and imported in the root layout",
    "adapter-vercel installed and configured",
    "dev server renders a placeholder page"
  ],
  "dependsOn": [],
  "status": "pending",
  "demoKind": "browser",
  "verification": {
    "commands": ["npm run check", "npm run lint", "npm run build"],
    "specs": ["e2e/us-a00.spec.ts"]
  },
  "demo": "docs/demos/US-A00.md",
  "branch": null,
  "prNumber": null,
  "issueNumber": null,
  "reviewRounds": 0,
  "notes": ""
}
```

## Field notes

**`status`** — one of `pending`, `in_progress`, `in_review`, `fixing`, `blocked`,
`needs_human`, `done`. Replaces a boolean `passes`, which collapses six meaningfully
different states and makes crash recovery guesswork.

**`dependsOn`** — array of story IDs. Replaces integer priority. A story is eligible
when every dependency is `done`. Ties break by array order.

**`repo`** — key into `repos`. Only meaningful for split projects, but present always
so the schema does not fork.

**`demoKind`** — `browser` (Playwright walks a user flow and screenshots it) or
`command` (terminal output captured for foundation stories with no UI).

**`verification.specs`** — mandatory and non-empty when `demoKind` is `browser`.
`pr-review` runs the story's own specs plus every spec belonging to a `done` story;
that second set is the regression check.

**`reviewRounds`** — incremented by `pr-review`. At 3, the pipeline stops and labels
the PR `needs-human`. This is the loop's only non-success exit.

**`notes`** — written by the implementing agent. Deviations, surprises, things a later
story needs to know. Keep it factual; it is read by agents, not filed as prose.

## Invariants

- Exactly one story may be non-terminal (`in_progress`, `in_review`, `fixing`) at a time.
  Enforced by the `story-pipeline` concurrency group; assert it anyway before dispatch.
- `stories.json` is mutated only on `main`, only by workflows, one commit per transition,
  paired with an append to `docs/pipeline-log.md` in the same commit so the two cannot drift.
