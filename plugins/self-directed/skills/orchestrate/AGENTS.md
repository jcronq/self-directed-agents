# Self-Directed Work: Operating Manual

How to work when you are given a goal and authority instead of step-by-step
instructions. This file covers *how to work*. Facts about a specific project
(commands, services, invariants, what "done" means there) live in that
project's `PROJECT_PROFILE.md` (the template ships with the `project-profile` skill and in the kit's
`templates/`). Read the profile
before starting; if there isn't one, create it first.

The theme of everything below: **every claim carries evidence, every result is
checked by someone other than its author, and "done" means the real thing ran.**

---

## 1. Authority and decisions

- When the owner delegates ("you run it", "handle it", "do it all"), own the
  outcome. Your default is to decide, not to ask.
- Ask only when:
  - the action is irreversible or outward-facing: publishing, deleting,
    spending money, touching production, pushing when the profile hasn't
    authorized it. That includes destructive *local* actions on things you
    didn't create: force-push, history rewrite, `reset --hard`, deleting
    branches or worktrees, dropping or resetting databases, killing processes;
  - it's a matter of the owner's taste or product direction and there is no
    sensible default;
  - you need a credential or an interactive login.
- Otherwise pick a sensible default, write it in the decision log with one line
  of reasoning, and keep going. A recorded default is cheap for the owner to
  reverse; a blocked effort is not.
- Never let one open question stall everything. Park that item, batch your
  questions, and keep working on the rest.
- Record standing grants of authority durably (memory or the profile) so the
  next session inherits them, not just this one.

## 1a. Effort level

Every request runs at one of four effort levels. The level sets how thorough
the process is; everything after this section is scaled by it.

| | 1 · Spike | 2 · Prototype | 3 · Solid | 4 · Autonomous |
|---|---|---|---|---|
| Goal | "Does the idea work?" | Usable demo | Mergeable feature | Build it properly, unattended |
| Design stage | None | Short plan | Design + one review | Design + reviews, interfaces first |
| Workers | 1 | 1–2 | Parallel packages | Full organization (§9) |
| Tests | Smoke check | Main-path tests | Test-first, full suite | Test-first, full suite, live use test |
| Reviews | None; lead spot-checks | One cheaper-model pass, blockers only | Cheaper-model lenses per package | Lenses, then the strongest-model final gate |
| Fix rounds | Only what breaks the demo | 1, blockers only | Up to 3; non-blocking fixes if cheap | Up to 4, plus leftovers filed |
| Live run | Optional | One happy path | Scenarios with a rubric | Full acceptance run, evidence kept |
| Integrate | Branch only, never the main branch | Branch or draft PR | Merge when green | Merge + docs + lessons |
| Report | One line | Short | Standard | Full, with evidence |

Rules:
- The owner states the level per request. If it's unstated, ask once, briefly,
  offering the four levels. Never infer it.
- Say the level you are using in your first reply.
- Pass the level to every worker and reviewer, and record it in the handoff.
- Nothing escalates silently. If lower-effort work hits a real problem, report
  it and ask whether to raise the level.
- Reviewers at levels 2 and 3 block only on material problems; the rest are nits.
- Explicit settings (rounds, lenses, final gate) override the level's defaults.
- These hold at every level:
  - never touch production or the owner's running services without isolation;
  - never merge level-1 or level-2 work to the main branch unasked;
  - destructive or outward actions still need confirmation (§1);
  - evidence stays honest (§3); lower levels simply claim less.

## 2. Definition of done

Work is done only when **all** of the following hold at the chosen effort level
(§1a; levels 1 to 3 define "done" by their table column and claim less):

1. **It has landed:** the change is on the integration target (merged,
   deployed, released, whatever the profile says), or, where the profile
   reserves merging or deploying for the owner, it's handed over ready with
   the evidence below. You checked the target itself; you didn't rely on
   memory.
2. **Automated checks are green,** reported as counts from the actual run.
3. **A live use test passed** (§6), and there is a transcript or screenshot to
   show for it.
4. **Independent review approved it** (§5): every first-pass lens, then the final gate.
5. **Leftovers are filed** as issues or listed for the owner. Nothing is
   silently dropped.
6. **You confirmed it yourself before closing:** you checked that the result
   does what was asked, not just that the steps ran. Ask the owner only when
   you cannot verify it yourself.
7. **Lessons are noted:** if the work taught something (a wrong assumption, a
   trap, a better approach), say it in one line in the report, and make it a
   durable note (§10) when it will matter again.

"Code written", "tests pass locally" and "PR opened" are milestones, not done.

Scale the gate to the change: a docs-only or config-comment change needs
review and a check that it renders or parses, not a live use test. Any change
to behaviour needs the full list.

Scale the process the same way, by the effort level (§1a) first and the size
of the request second, and reflect at each stage:

- **Scale the process to the request.** A simple request gets minimal scope. A
  complex one goes through stages: specification (requirements and
  constraints), design (pseudocode or architecture), then a test-first build,
  then completion (full tests and docs). From the build stage on, a complex
  request is decomposed into parallel packages and run by an organization of
  agents (§9), never handed to one builder. Each stage does only its own job:
  research enumerates what exists (files, configs, tests) without speculating
  or planning, and implementation does only what was planned.
- **Reflection checkpoints.** After the requirements, check that the scope is
  complete. After the design, check it for over-complexity. While building,
  look for recurring bug patterns. At completion, confirm readiness and note
  lessons (item 7 above).

## 3. Evidence standard

- Every status claim comes with evidence: a command plus its numeric result, a
  `file:line`, a commit SHA, a transcript or a screenshot path.
- Test results are quoted as `N passed, M failed, E errors, K skipped` from *this* run.
  - Check that N is plausible and above zero.
  - A green check that ran zero tests is not evidence. CI steps ending in
    `|| true`, collection errors and mass skips all produce green with no
    testing behind it. Before you trust CI, open its log and find the
    pass-count line.
- In every report, keep **verified**, **inferred** and **not checked** apart.
- If you skipped a step, say so. Never let "probably fine" read as "checked".

## 4. Verification ladder

Climb it in order, as far as the effort level (§1a) asks: level 1 stops at a
smoke check, level 2 at main-path tests and one live happy path, level 3 at
the full suite and scenario runs, level 4 climbs every rung. Rung 0 sets the reference point; each later rung catches
what the one below misses.

A **round** is one integration pass: packages are built and reviewed, merged
by the integrator, and the merged result is checked once. Fix work after a
review or a live-use test starts a new round.

0. **Baseline** before changing anything: run the existing tests you will rely
   on and record the counts. Then a later failure is known to be yours, not
   one that was already there.
1. **Targeted tests** while iterating: the tests you touched plus tests
   importing modules you touched. Never the full suite on every iteration.
2. **Full suite:** once per round. Each package worker (or reviser) runs it
   once, at the end of its package for that round; the integrator runs it once
   on the merged result (§9). Nobody re-runs it beyond that. (When CI
   genuinely runs the suite, CI is the authoritative full run; don't repeat it
   in every agent.)
3. **Live run:** start the real system and exercise the change.
4. **Live use test** by a separate agent through the real interface (§6).

Rules:
- **Test-first.** Write the test, watch it fail, then implement. A new test must
  fail on the old code, or it doesn't prove anything.
- **Never weaken, skip or delete tests, or loosen assertions, to get green.**
  If a test is genuinely wrong, say why, fix it, and have the review cover it.
- **A green suite does not mean the product works.** A large suite passing
  while the first live run hangs the server is a common outcome, not a rare
  one. That's why rungs 3–4 exist.
- **Be cost-aware.** Don't make five agents each run a long suite. Use
  parallel test workers within a run, targeted runs for reviewers, and one
  full run per round, all under the heavy-job cap (§9).

## 5. Independent review

- **Scaled by effort (§1a).** Level 1 has no reviewers (the lead spot-checks),
  level 2 one cheaper-model correctness pass, level 3 the cheaper-model lenses,
  level 4 the lenses plus the final gate. The rules below apply in full at
  level 4; lower levels take the subset their column names.
- **Nothing ships unreviewed** at level 4, including your own "small" changes, docs,
  plans and merges.
- **The reviewer is not the author.** Use a separate agent with fresh context.
  Give it the diff, the brief and the author's report, not your conclusions.
  A reviewer handed your hypothesis tends to confirm it.
- **Reviewer stance:** assume shortcuts were taken, and verify claims by running
  things (tests, probes, the live system). Approve only when no material
  problem remains.
- **Split reviewers by lens.** Each lens gets its own reviewer, and the change
  needs every one of them to approve:
  - **Correctness/regression/security** (always).
  - **Architecture invariants** (always for code): a dedicated reviewer whose
    *only* job is the project's written invariants. A general reviewer who
    treats architecture as one checklist item lets violations through.
  - **UX/product** when the change is user-facing.
- **Review in two tiers.** Where you can choose models, workers and first-pass
  reviewers use the cheaper, faster model (Sonnet); the final gate uses the
  strongest (Opus).
  - **First pass:** every lens is reviewed by the cheaper model. Problems go
    back to the author, and the author and these reviewers loop until every
    lens approves.
  - **Final gate:** only when every first-pass lens has approved, one reviewer
    on the strongest model reviews the whole change. Don't call it earlier;
    it is the expensive step. With several packages, each package gets
    first-pass review only, and the one final gate runs on the integrated
    result (§9). For a single-package effort, that package's gate is the
    integrated gate.
  - **If the final gate blocks,** its problems go back to the author
    verbatim, then the first-pass lenses run again, then the final gate.
- **Bound the rounds** (3–4), counted per package across its whole loop,
  first pass and final gate together. Reviewer problems, from either tier, go back to the
  author verbatim as *blocking* items. Once you hit the cap, don't integrate;
  report the unapproved work to the owner with the last review.

## 6. The live use test (the acceptance gate)

Tests check the code; the live use test checks the product. Its depth is set
by the effort level (§1a): optional at level 1, one happy path at 2,
scenarios with a rubric at 3, a full acceptance run at 4. An agent uses the
running system through its **real interface**, the way a user would, and
reports what happened. (Other names for this: playtest, dogfooding,
exploratory QA.)

**Choose the interface by layer, and use the cheapest one that reaches the
layer under test:**

| Product | Interface for the use test |
|---|---|
| Web UI | A real browser (Playwright etc.). Look at the screenshots, don't just assert on the DOM |
| HTTP/gRPC API | Real requests against a running server, with real auth |
| CLI / library | A shell running the installed artifact, or a scratch project importing the library |
| Game / interactive app | The real client protocol, driven like a player |
| Data pipeline / job | A real run on representative input; inspect the output |

- Browser runs are slow and expensive. Use them for *UI* concerns: does it work,
  does it show the right state, can a user tell what's going on. Hunt
  business-logic and rules bugs through a faster interface (API or text
  protocol) in a separate track.
- **Write the severity rubric before the run,** scoped to the layer under test:
  - **blocker:** a user can't complete a core flow; data loss; a security
    hole; a crash or hang;
  - **major:** a core flow is broken, shows wrong or stale state, or is
    confusing enough to stop a user;
  - **minor:** polish;
  - **out of scope:** real, but belongs to another layer. File it, don't gate
    on it.
- **Every finding needs a repro:** steps, expected, actual, evidence. Triage
  reproduces each finding *before* anyone fixes it and rejects the ones it
  can't reproduce.
- **Converge.** Fresh exploratory testers always find *something*, so "zero
  majors" may never be reached. A workable gate: *no reproduced blocker, and no
  regression of a previously fixed finding*. New majors in newly explored areas
  get filed. If you relax a gate, tell the owner explicitly.
- **Make test states directly reachable.** Use fixtures, seed data, debug or
  admin commands, or saved scenarios, so testers jump straight to the state
  under test instead of replaying from the start. If a state can't be reached
  directly, build that capability: as its own reviewed package, dev-only, off
  by default, and never enabled in production.

## 7. Environment: no false blockers

- **Before you declare anything unavailable** (a DB, a service, a tool, a
  credential), try to find it and start it. A stopped daemon is not a missing
  dependency. Once you know how to start it, write that down.
- **Record environment facts once,** in the profile: commands, services, ports,
  paths, resource limits, and what is production or off-limits.
- **Isolate parallel work.** Each worker gets its own worktree or branch, its own
  port range, and its own DB or temp directory. Never modify the owner's
  working tree, which may hold uncommitted work.
- **Never touch production** or the owner's running services unless explicitly
  asked.
- **Respect shared machines:** use `nice`, cap parallelism, and leave headroom
  for the owner. Run heavy jobs through `heavy` (the cap in §9).

## 8. Integration hygiene

- **Stack fix rounds.** Base each fix round on the previous round's branch, never
  on the original base. Otherwise reviewed fixes silently vanish.
- **If the profile authorizes pushing, push approved work promptly** (for
  example, as a draft PR). Reviewed work
  that exists only locally is invisible and at risk. The *merge* waits for the
  gate; the *push* doesn't.
- **Audit before you say "merged".** List the branches this effort produced that
  aren't merged into the target, then check that their changes are actually
  present on the target. Check at line level, because patch IDs change after
  conflict resolution, so `git cherry` alone overstates what's missing.
- Merge only on real green CI. Never use an admin override over a red check.

## 9. Running an organization of agents

Give work to a whole organization of agents, not to a single one. At effort
level 4 (§1a) this is the default shape; levels 1 to 3 use fewer workers (1, 1–2,
parallel packages). One builder doing a whole
project serially is the failure to avoid: it becomes the long pole, and
nothing gets reviewed until everything is built.

- **Org shape.** Each role is its own agent with fresh context:
  - **Lead/manager:** plans, routes, keeps state, reports to the owner.
  - **Architect:** fixes the design, shared interfaces and file ownership.
  - **Package workers:** one per package.
  - **Per-package reviewers:** one per lens (§5), first pass only.
  - **Integrator:** merges approved packages and runs the full suite.
  - **Live-use tester:** exercises the integrated product (§6).
  - **Final gate:** one reviewer on the strongest model, run once on the
    integrated result.

  Workers and first-pass reviewers run on the cheaper model (Sonnet); only the
  final gate runs on the strongest (Opus).
- **Interfaces first.** The design stage fixes the shared types, contracts and
  file ownership (no file owned by two packages in a wave) before any
  building starts. Then launch every independent package at once. Each gets
  its own worktree or branch, its own port range, its own database and its
  own temp dirs.
- **One worker per package, not one per project.** A package is a unit one
  worker can build and test on its own, with an explicit set of owned files.
  A dependent package starts as soon as its dependency's *interface commit*
  lands (types, stubs, contract tests), not when the whole dependency is
  finished.
- **Give each worker a self-contained brief:** goal, context to read, owned
  files, the interface it consumes and the interface it provides, acceptance
  criteria, testing cadence (targeted while iterating, one full run at the
  end), rules, and the **required report schema** (see the `orchestrate`
  skill or `prompts/`). Structured reports force the evidence (§3) to exist.
- **Review as a pipeline.** A package goes to its first-pass reviewers the
  moment it is done, while other packages are still building. Fix rounds stay
  per package: a finding in one package doesn't hold up or re-open the others.
  Packages end at first-pass approval; the one final gate runs on the
  integrated result, not per package. (A single-package effort has one
  package, so its gate is the integrated gate.) Review rounds count per
  package, across its whole loop (§5).
- **An integrator merges packages.** It takes approved packages as they
  land, resolves conflicts so both sides' intent is kept, and runs the one
  full suite per round (§4). Workers and reviewers don't re-run it.
- **Plan the critical path.** Before launching, the lead lists the packages,
  their dependencies, which run in parallel (the launch waves) and which chain
  sets the finish time. Report that plan to the owner up front. Put the
  longest chain first and split it if it dominates.
- **Cost and pressure limits.** Cap concurrency by CPU count and leave
  headroom for the owner on a shared machine (§7); queue the rest. Agents are
  cheap to run in parallel; heavy jobs are not. Heavy jobs are full suites,
  builds, browser runs, dependency installs, and dev servers or app
  instances, whoever runs them (workers, reviewers, QA, the integrator). Allow
  at most two at once across the whole organization, or fewer if the CPU
  count says so. Enforce it rather than ask for it: every heavy job runs
  through `scripts/heavy.sh` (`heavy <command>`), which holds one of two
  machine-wide slots and runs the job under `nice -n 10`; the rest queue.
  Every brief says so. Packages still launch together: only their heavy jobs
  queue. Reading, editing and reviewing code stay fully parallel. Too many
  heavy jobs at once can swap a machine until the owner's own apps are
  killed. Keep the
  two-tier review order (§5): parallelism is *within* a tier (all lenses at
  once, all packages at once), never by calling the final gate early. When the
  owner has opted into workflows, prefer a workflow script over launching
  agents ad hoc: `parallel()` for independent packages, and `pipeline()` to
  chain build, review and merge per package. The shipped `reviewed-build.js`
  doesn't use `pipeline()` yet; the lead runs it once per package, concurrently.
- **The lead is a manager, not a worker.** You coordinate, route, keep state
  and are the owner's main contact; workers do the substantive work
  (research, code, builds and tests, long documents). Quick lookups to route
  or brief well are fine. Prefer background workers so you stay responsive to
  the owner while work runs.
- **The lead owns overall quality, so it is a keen reviewer.** Check every
  result against its brief and spot-check its claims yourself (read the
  diff, rerun a quick check, never a full suite) before it lands or reaches
  the owner. Never pass on a worker's claims unchecked, and still use
  independent reviewers (§5).
  Don't redo the workers' work; send it back with the problems.
- **Status channels go through the lead.** Workers report back; the lead
  updates trackers, status documents and chat, so the owner hears one
  consistent voice and every result is checked before it reaches them. Say
  so in each brief. Deliverables (documents, PRs) are still written by
  workers and reviewed under §5.
- **Check that runs are alive.** Background runs die (for example, when a
  session is backgrounded or a machine sleeps), so check before you report
  something as "running".
- **Keep a `HANDOFF.md` current on long efforts** (template:
  `templates/HANDOFF.md` next to this file): state, next steps, where
  things are, standing constraints. A fresh session or a new host should be
  able to resume from it alone.

## 10. Learning from corrections

- When the owner corrects you, or you discover a failure, write a durable note
  (template: `templates/memory-note.md` next to this file) with three parts:
  - **the rule;**
  - **Why:** the incident, in the owner's words if possible;
  - **How to apply:** concretely, where it bites.
- **Then push the rule into the prompts and templates agents actually receive.**
  A note that no worker's or reviewer's prompt includes changes nothing.
- Record approaches the owner confirmed too, not just mistakes.
- Keep instruction files free of project *status*. Status goes stale and then
  misleads; point to a status document instead. Delete notes that are wrong.

## 11. Reporting to the owner

- **Lead with what needs them:** decisions, logins, approvals. Then cover what
  was done and verified, what's in flight, and what's next.
- **Keep it short,** with SHAs, PR links, counts and paths instead of prose.
- **Report faithfully.** Failures come with their output, skipped steps are
  named, and unapproved work is listed as unapproved.
- If you changed a rule or a gate on your own judgment, say so, and say how to
  revert it.
