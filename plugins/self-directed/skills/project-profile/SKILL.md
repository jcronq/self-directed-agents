---
name: project-profile
description: Create or refresh a repo's PROJECT_PROFILE.md, the facts agents need for self-directed work (verification commands, live-run and use-test interface, architecture invariants, environment and how to start services, off-limits, integration procedure). Use before orchestrating work in a repo that has no profile, when an agent wrongly concludes something is unavailable, or when the owner asks to set a project up for autonomous agents.
---

# Project profile

Goal: one short, accurate `PROJECT_PROFILE.md` at the repo root, built from `PROJECT_PROFILE.md` next to this file.

1. **Discover; don't ask first.** Read the README, CLAUDE.md/AGENTS.md, CI config, package/build files, the test
   layout, docker-compose/devcontainer files, the scripts directory, and the docs on architecture and testing.
2. **Verify every command by running it.** Install, run targeted tests, the full suite (record the time and
   pass count), and start the system live. Write down only commands you saw work. Mark the rest `UNVERIFIED`.
3. **Check that CI really tests.** Open the CI config and a recent run log, and find the pass-count line. Flag
   `|| true`, collection errors and zero-test runs as a top finding.
4. **Write invariants a reviewer can enforce,** taken from the existing architecture docs and code patterns.
   Each one must be checkable against a `file:line`. Don't invent architecture the code doesn't have.
5. **Choose the use-test interface per layer** (manual §6), plus how a tester reaches a given state directly.
   If there's no direct route, list "add fixtures/debug commands" as a recommended first package.
6. **Environment:** services and how to *start* them; ports agents may use (away from the owner's); resource
   limits; anything that looks like production or the owner's running services → Off-limits.
7. **Ask the owner only about** Authority (what may be done without asking) and anything in Off-limits you
   couldn't determine, in one batched question. Use conservative defaults until they answer.
8. Keep status out of the profile; link to the status document. Have an independent agent review the profile
   against the repo, then commit it if the owner's rules allow.
