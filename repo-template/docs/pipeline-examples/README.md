# pipeline.json examples

`pipeline.json` is how this pipeline stays stack-agnostic. Every workflow reads it
instead of assuming a language, so supporting a new stack means writing one of these
files — not editing seven workflows.

Copy the closest example to `pipeline.json` at the repo root and adjust.

| File | Stack |
|---|---|
| `python-fastapi.json` | Python + FastAPI/uvicorn |
| `python-django.json` | Python + Django, with Postgres via compose |
| `go.json` | Go HTTP service |
| `rust-axum.json` | Rust, release binary served in CI |
| `ruby-rails.json` | Rails, with compose services |
| `java-spring.json` | Spring Boot via Maven wrapper |
| `static-site.json` | No build step; static files |
| `cli-tool-no-browser.json` | A CLI — no `serve` block at all |

## Fields

| Field | Meaning |
|---|---|
| `runtime` | `node`, `python`, `go`, `ruby`, `java`, `dotnet`, `rust`, or `none`. Selects which setup action runs. |
| `version` | Passed to that setup action verbatim. |
| `install` | Dependency install command. Empty means none. |
| `commands.typecheck` / `.lint` / `.build` / `.test` | Run by `ci`. **Empty means skip**, not fail — a language with no separate typecheck step leaves it `""`. |
| `serve.ci` / `.dev` | How to start the app. CI serves the built artifact; dev serves with reload. |
| `serve.url` | Where it answers. Becomes Playwright's `baseURL`. |
| `serve` omitted entirely | No web surface. Every story must use `demoKind: "command"`. |
| `services` | Command to start dependencies. `null` falls back to `docker compose up -d --wait` if a compose file exists. |
| `existsWhen` | The file whose presence means "this project has been scaffolded". Before it exists, install and checks are skipped so the first story can run in an empty repo. Defaults per runtime. |

## The two runtimes

The **project runtime** is whatever your app is written in. The **pipeline runtime** is
always Node, because the pipeline's own scripts and the Playwright demo harness are
written in it.

These do not have to match, and usually don't. Playwright drives the app over HTTP — it
neither knows nor cares whether a Go binary, a Rails server, or Vite is answering. A Go
project gets Go demos of its behaviour without ever adding Node to its own dependencies:
the harness lives in `e2e/package.json`, installed separately, and never appears in your
`go.mod`.

## Non-web projects

A CLI, a library, or a data pipeline has no `serve` block. Those stories use
`demoKind: "command"` and `e2e/demo-command.mjs`, which captures the proving commands'
output into the demo doc instead of screenshots. The regression mechanism is unchanged — `pr-review` re-runs every done
story's verification on every PR, whether that verification is a browser flow or a
command whose output must still match.
