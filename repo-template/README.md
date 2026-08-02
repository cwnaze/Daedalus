# <Project Name>

<one-line description>

## Development
```bash
cp .env.example .env    # fill in values
docker compose up -d
npm install
npm run dev
```

## Tests and demos
```bash
npx playwright test
```
Specs generate the demo docs in `docs/demos/` — those are build artifacts, not
hand-written. Read them to see what the app does, story by story.

## Build pipeline
This repo builds itself one story at a time. `stories.json` is the plan and the state;
`docs/pipeline-log.md` is the history. See `CLAUDE.md` for the rules the agents follow.
