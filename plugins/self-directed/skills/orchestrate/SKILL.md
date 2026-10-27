---
name: orchestrate
description: Run self-directed, multi-agent delivery of a goal to verified completion. Packages are built test-first by worker agents, gated by independent reviewers (correctness, architecture, UX), integrated, and accepted by a live use test of the real product (browser for web UIs, real requests for APIs, the shell for CLIs). Use when the owner delegates a goal ("you run it", "do it all", "handle this end to end"), asks for work to be parallelized across agents, or asks for something to be tested to completion.
---

# Orchestrate: deliver a goal to verified completion

Follow the operating manual, `AGENTS.md` next to this file, throughout. Read it now if it is not already in your instructions. This skill is its procedure.
The other files referenced below sit next to this SKILL.md too: `prompts/`, `schemas.md`, `workflows/`.

## 0. Ground yourself
- Find the project profile (`PROJECT_PROFILE.md` at the repo root, or wherever the project's CLAUDE.md/AGENTS.md points).
  If there isn't one, run the `project-profile` skill first. Don't orchestrate without a verification recipe.
- Read the status document the profile names, the open issues, and `HANDOFF.md` if it exists.
- Bring up the environment the profile describes (start services; don't conclude they're unavailable).

## 1. Plan
- Turn the goal into packages, each with: an id, a brief, acceptance criteria, owned_files (no overlap between
  packages in the same wave) and dependencies.
- Have an independent reviewer agent review the plan before building. A plan is work product too.
- Record any defaults you chose in the decision log. Ask the owner only what the manual's §1 allows.

## 2. Build each package (in parallel waves)
**With the Workflow tool** (when it exists and the owner opted in; invoking this skill counts as opting in to
its workflows): run `workflows/reviewed-build.js` once per package, independent packages in parallel, with args
`{repo, profile, prompts: "<this skill dir>/prompts", id, base, brief, owned_files, others, lenses, ports}`.
Add `"ux"` to lenses for anything user-facing. Give each concurrent package a distinct port range.

**Without it:** run the same loop by hand with subagents:
worker (`prompts/_common.md` + `prompts/worker.md`) → reviewers in parallel, one per lens, each in a fresh agent →
if any review blocks, `prompts/revise.md` with the problems verbatim → repeat, at most 3 rounds.
Approval requires every lens. Require the schemas in `schemas.md` from every agent and reject reports without counts.

Never integrate unapproved work. List it for the owner with its last review.

## 3. Integrate
`prompts/integrator.md` merges the approved branches into one integration branch, followed by a general review.
Push it right away as a draft PR if the profile allows pushing. The push doesn't wait for the gate; the merge does.

## 4. Live use test (the acceptance gate)
- Write down the areas (one tester each), the interface for each area's layer, the severity rubric and the
  gate rule (all from the profile).
- **With the Workflow tool:** `workflows/acceptance-gate.js` with `{repo, profile, prompts, branch, areas, rubric, gate, ports}`.
- **Without it:** testers in parallel (`use-tester.md`) → `triage.md` (reproduce every finding) → fix packages
  through step 2, each based on the *current* integration branch → integrate → re-test. Stop when the gate
  passes, or after the round cap, and report.
- File `issues_to_file` yourself (or list them, if you're not authorized to file).

## 5. Land and audit
- Merge per the profile's procedure, on real green CI only, after confirming CI's pass-count line.
- Audit: list this effort's branches that aren't merged into the target, and check that their changes are actually
  on the target, line by line. Only then say "merged".
- Restart or redeploy what the profile says should run on the target.

## 6. Close out
- Update `HANDOFF.md` and the status document. Turn every owner correction from this effort into a durable
  note (rule / Why / How to apply) **and** fold it into the prompts you used.
- Report per manual §11: what needs the owner, what was done with its evidence, what was filed, what's next.

## Watch-outs
- Background runs die when a session is backgrounded or a machine sleeps. Check that a run is alive before
  reporting it as running, and re-launch dead ones.
- On a shared machine, use `nice`, cap concurrent workflows, and keep the full suite to one run per round.
- If the gate doesn't converge after ~3 rounds because new areas keep producing new majors, apply the
  convergence rule (manual §6) and tell the owner you did.
