# self-directed-agents

An operating manual and toolkit that make coding agents work **self-directed, to verified completion**:
deciding instead of asking, proving claims with evidence, getting independent review, and accepting work by
actually using the product.

It is distilled from a long autonomous run. What made that run effective was not the model or the project.
It came down to five habits:

1. **A written grant of authority.** Decide, record the default, keep going. Ask only about irreversible
   actions, taste, or credentials.
2. **Reports that force evidence.** "Done" requires test counts from this run, a live check and SHAs. A green
   CI that ran zero tests counts as nothing.
3. **Review by someone other than the author,** split by lens (correctness, architecture invariants, UX), with
   a cheap first pass then a strongest-model final gate, bounded revise rounds, and no integration of unapproved work.
4. **A live use test as the acceptance gate.** Agents use the running product through its real interface:
   a browser for UIs, real requests for APIs, the shell for CLIs. Findings need repros, and the gate has an
   explicit rule for when to stop.
5. **Corrections become rules,** written as rule / Why / How to apply, and pushed into the prompts agents
   actually receive.

## What's in it

| Path | What | Works with |
|---|---|---|
| `AGENTS.md` | The operating manual: how to work. Short, generic, no project facts | Any agent |
| `templates/PROJECT_PROFILE.md` | Per-repo facts: verification recipe, use-test interface, invariants, environment, off-limits | Any agent |
| `templates/HANDOFF.md`, `templates/memory-note.md` | Resume a long effort on a fresh session or host; record a correction | Any agent |
| `prompts/` + `schemas.md` | Role prompts (worker, lens reviewers, final reviewer, use tester, triage, integrator) and the report schemas | Any orchestrator, or by hand |
| `plugins/self-directed/` | Claude Code plugin: `orchestrate` and `project-profile` skills, plus two Workflow scripts (`reviewed-build`, `acceptance-gate`) | Claude Code |
| `tests/workflows.test.mjs` | Control-flow tests for the Workflow scripts with a mocked `agent()` (`node tests/workflows.test.mjs`) | Node |
| `extras/stop-evidence-hook/` | Optional Stop hook that bounces "done" claims made without evidence | Claude Code |

`AGENTS.md`, `prompts/`, `schemas.md` and the files in `templates/` are symlinks into the plugin, so
there's one copy of each. On Windows, clone with `core.symlinks=true`.

`reviewer_model` now sets only the final gate; set `review_model` to put the lens reviewers on a stronger model.

## Install

```bash
git clone <this repo> ~/dev/self-directed-agents
cd ~/dev/self-directed-agents
./install.sh claude              # import the manual into ~/.claude/CLAUDE.md
./install.sh codex               # reference it from ~/.codex/AGENTS.md
./install.sh project ~/dev/myrepo   # seed PROJECT_PROFILE.md in a repo
./install.sh plugin              # prints the /plugin commands for the skills and workflows
./install.sh uninstall           # removes the global blocks again
```

None of it depends on a claude.ai account. The manual is plain markdown, and the plugin installs from any git
URL or local path. For other agents (Cursor, Copilot, Aider, etc.), point their rules file at `AGENTS.md`, or
paste it in.

Then, in a repo: create the profile (the `project-profile` skill, or fill in the template), and hand the agent
a goal with authority. For example: "Ship X. You run it; ask only about irreversible things."

## Distribution

- **Source of truth:** this git repo. Version it and tag releases, because agents' behavior changes when it does.
- **Personal machines:** clone it and run `./install.sh claude codex plugin`. `git pull` updates everything,
  because the global instructions import the file rather than copying it.
- **Work machines without your accounts:** mirror the repo to the work git host, or vendor it (it's
  dependency-free). The plugin can be added from a local path.
- **Teams:** add the repo as a Claude Code plugin marketplace in a shared project `.claude/settings.json`,
  commit each repo's `PROJECT_PROFILE.md`, and keep `AGENTS.md` org-wide.
- **Keep project facts out of AGENTS.md.** Anything specific to one repo goes in that repo's profile. The manual
  stays generic so it can be shared as-is.

## Improving it

When an agent fails in a new way, or the owner corrects one, add the lesson to the manual if it's generic,
or to the profile if it's specific to the repo. Then update the prompt or schema that should have prevented
it. A rule that no prompt carries doesn't change behavior.
