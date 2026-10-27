# Project Profile: <project name>

Facts an agent needs to work self-directed in this repo. It pairs with the
generic operating manual (AGENTS.md from self-directed-agents). Keep it
factual and current, and leave *status* out of it; point to a status
document instead.

## Status lives in
<path or URL of the roadmap / issue tracker / status doc>

## Authority
- What agents may do without asking: <e.g. branch, commit, push draft PRs, open issues, merge on green CI>
- What always needs the owner: <e.g. production deploys, releases, deleting data, spending money>

## Architecture invariants (checked by the architecture reviewer)
Write rules a reviewer can enforce with a `file:line`, not general advice.
Give a short right/wrong example where it helps.
1. <invariant>
2. <invariant>
Authoritative source, if longer: <path>

## Verification recipe
| Step | Command | Typical time |
|---|---|---|
| Setup / deps | `<cmd>` | |
| Targeted tests | `<cmd> <paths>` (or a helper such as `scripts/test_changed.sh`) | |
| Full suite (once per round) | `<cmd>` (parallel flags) | |
| Other checks (lint/types/build) | `<cmd>` | |
| Run live | `<cmd>` (ports, env flags) | |
| CI pass-count evidence | where to read the "N passed" line | |

## Live use test
- Product type(s) and the interface for each layer: <e.g. web UI → Playwright; API → HTTP; rules → text protocol>
- How a tester reaches a given state directly: <fixtures / seed script / debug commands / scenarios>
- Severity rubric for this project (blocker / major / minor / out of scope): <specifics>
- Gate: <e.g. no reproduced blocker, no regression of a previously fixed finding>

## Environment
- Services and how to START them when they're down (never conclude they're unavailable): <db, queues, ...>
- Ports agents may use: <range>
- Resource limits: <nice level, max parallel workers, memory>
- Paths: <venv, scratch dir, tool locations>

## Off-limits
- Production / owner services on this machine: <list>
- Files that are never committed: <secrets, state files, build output>
- Never: <e.g. modify the owner's working tree, change network routes>

## Integration
- Target branch and merge procedure: <steps>
- Commit/PR conventions: <attribution lines, title format>

## Decision log
<path, e.g. docs/DECISIONS.md: one line per default chosen without asking>
