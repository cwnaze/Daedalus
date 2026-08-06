# Graph Report - .  (2026-08-05)

## Corpus Check
- Corpus is ~11,261 words - fits in a single context window. You may not need a graph.

## Summary
- 98 nodes · 125 edges · 13 communities (10 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.95)
- Token cost: 85,777 input · 0 output

## Community Hubs (Navigation)
- Pipeline Skills & Governance
- Story Dispatch Logic
- Pipeline Watchdog Logic
- CI & Review Workflows
- Demo Harness (Browser)
- Stories Validation Logic
- Demo Harness (Command)
- Manifest Reader Logic
- Env Materialization Logic
- Demo Doc Conventions
- Story Completion Logic
- Playwright Config
- Secrets Sync Script

## God Nodes (most connected - your core abstractions)
1. `PR Review Skill` - 11 edges
2. `Implement Story Skill` - 10 edges
3. `CLAUDE.md Project Conventions` - 10 edges
4. `PR Fix Skill` - 7 edges
5. `Production Prep Skill` - 6 edges
6. `setup-project Composite Action` - 6 edges
7. `CI Workflow` - 6 edges
8. `Pipeline Audit Log` - 5 edges
9. `stories.json (pipeline state file)` - 5 edges
10. `pipeline.json (stack-agnostic manifest)` - 5 edges

## Surprising Connections (you probably didn't know these)
- `production-prep Workflow` --references--> `Production Prep Skill`  [EXTRACTED]
  .github/workflows/production-prep.yml → .claude/skills/production-prep/SKILL.md
- `Definition of Done` --conceptually_related_to--> `CI Workflow`  [INFERRED]
  CLAUDE.md → .github/workflows/ci.yml
- `Pipeline Watchdog Workflow` --references--> `Implement Story Skill`  [EXTRACTED]
  .github/workflows/pipeline-watchdog.yml → .claude/skills/implement-story/SKILL.md
- `PR Review Skill` --references--> `Generated-Only Demo Doc Convention`  [EXTRACTED]
  .claude/skills/pr-review/SKILL.md → docs/demos/README.md
- `CI as Independent Gate Rationale` --rationale_for--> `PR Review Skill`  [EXTRACTED]
  .github/workflows/ci.yml → .claude/skills/pr-review/SKILL.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Shared story-pipeline Concurrency Group** — github_workflows_pr_fix_prfix, github_workflows_pr_review_prreview, github_workflows_production_prep_productionprep, github_workflows_story_complete_storycomplete, github_workflows_story_start_storystart [EXTRACTED 1.00]
- **Story Pipeline Automation Loop (start to completion)** — github_workflows_story_start_storystart, claude_skills_implement_story_skill_implementstory, github_workflows_pr_review_prreview, claude_skills_pr_review_skill_prreview, github_workflows_story_complete_storycomplete [INFERRED 0.85]
- **Skills Bound by the Author Trust Rule** — claude_skills_implement_story_skill_implementstory, claude_skills_pr_fix_skill_prfix, claude_skills_pr_review_skill_prreview, claude_authortrustrule [EXTRACTED 1.00]

## Communities (13 total, 3 thin omitted)

### Community 0 - "Pipeline Skills & Governance"
Cohesion: 0.19
Nodes (20): Author Trust Rule (OWNER/MEMBER/COLLABORATOR only), CLAUDE.md Project Conventions, Pipeline Agent Loop (story-start to story-complete), Implement Story Skill, PR Fix Skill, agent-fix Label Mechanism, PR Review Skill, Single-pass Review Rationale (+12 more)

### Community 1 - "Story Dispatch Logic"
Cohesion: 0.19
Nodes (11): active, db, dispatch(), done, eligible, existing, isPaused(), openPrep (+3 more)

### Community 2 - "Pipeline Watchdog Logic"
Cohesion: 0.20
Nodes (10): active, db, idleMinutes, lastTouch, quotaBlocked(), rateLimitedUntil(), runs, sh() (+2 more)

### Community 3 - "CI & Review Workflows"
Cohesion: 0.27
Nodes (9): Auto-merge Arming Rationale, review-verdict.json Handoff, pipeline.json Examples README, pipeline.json (stack-agnostic manifest), setup-project Composite Action, CI Workflow, CI as Independent Gate Rationale, pr-review Workflow (+1 more)

### Community 4 - "Demo Harness (Browser)"
Cohesion: 0.29
Nodes (3): Demo, Step, test

### Community 5 - "Stories Validation Logic"
Cohesion: 0.29
Nodes (6): active, errors, ids, NON_TERMINAL, STATUSES, warnings

### Community 6 - "Demo Harness (Command)"
Cohesion: 0.33
Nodes (4): body, results, steps, [storyId, title, ...rest]

### Community 7 - "Manifest Reader Logic"
Cohesion: 0.40
Nodes (3): DEFAULT_MARKER, out, RUNTIMES

### Community 8 - "Env Materialization Logic"
Cohesion: 0.40
Nodes (4): keys, lines, missing, secrets

### Community 9 - "Demo Doc Conventions"
Cohesion: 0.50
Nodes (4): Definition of Done, Demo Harness (e2e/demo.ts + demo-command.mjs), Demos README, Generated-Only Demo Doc Convention

## Knowledge Gaps
- **40 isolated node(s):** `db`, `story`, `db`, `active`, `stuck` (+35 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Implement Story Skill` connect `Pipeline Skills & Governance` to `Demo Doc Conventions`, `CI & Review Workflows`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `PR Review Skill` connect `Pipeline Skills & Governance` to `Demo Doc Conventions`, `CI & Review Workflows`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `CLAUDE.md Project Conventions` connect `Pipeline Skills & Governance` to `Demo Doc Conventions`, `CI & Review Workflows`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `db`, `story`, `db` to the rest of the system?**
  _40 weakly-connected nodes found - possible documentation gaps or missing edges._