# <Project Name>

<one-line description>

## Development
```bash
cp .env.example .env    # fill in values
docker compose up -d    # only if this project has a compose file
```
Then run the `install` and `serve.dev` commands from `pipeline.json`;
`node .github/scripts/read-manifest.mjs --print` prints them. That file is how the
pipeline stays stack-agnostic — CI reads the same commands you do.

## Tests and demos
```bash
npx playwright test
```
Specs generate the demo docs in `docs/demos/` — those are build artifacts, not
hand-written. Read them to see what the app does, story by story.

## Build pipeline
This repo builds itself one story at a time. The pipeline is built for web applications
and HTTP services; CLIs and libraries work too, with command-output demos in place of
browser flows. It cannot build mobile, native desktop, games, firmware, or ML training
projects, because it cannot generate an automatic per-story proof for them.
 `stories.json` is the plan and the state;
`docs/pipeline-log.md` is the history. See `CLAUDE.md` for the rules the agents follow.
