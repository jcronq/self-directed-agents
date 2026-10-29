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

## 2. Definition of done

Work is done only when **all** of the following hold:

1. **It has landed:** the change is on the integration target (merged,
   deployed, released, whatever the profile says), or, where the profile
   reserves merging or deploying for the owner, it's handed over ready with
   the evidence below. You checked the target itself; you didn't rely on
   memory.
2. **Automated checks are green,** reported as counts from the actual run.
3. **A live use test passed** (§6), and there is a transcript or screenshot to
   show for it.
4. **An independent reviewer approved it** (§5).
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

Scale the process the same way, and reflect at each stage:

- **Scale the process to the request.** A simple request gets minimal scope. A
  complex one goes through stages: specification (requirements and
  constraints), design (pseudocode or architecture), then a test-first build,
  then completion (full tests and docs). Each stage does only its own job:
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

Climb it in order. Rung 0 sets the reference point; each later rung catches
what the one below misses.

0. **Baseline** before changing anything: run the existing tests you will rely
   on and record the counts. Then a later failure is known to be yours, not
   one that was already there.
1. **Targeted tests** while iterating: the tests you touched plus tests
   importing modules you touched.
2. **Full suite:** once per unit of work, by the author. (When CI genuinely runs
   the suite, CI is the authoritative full run; don't repeat it in every agent.)
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
- **Be cost-aware.** Don't make five agents each run a long suite. Run
  tests in parallel, use targeted runs for reviewers, and do one full run per
  round.

## 5. Independent review

- **Nothing ships unreviewed,** including your own "small" changes, docs,
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
- **Pick models by role.** Where you can choose, give workers a cheaper or
  faster model and reviewers the strongest one.
- **Bound the rounds** (3–4). Reviewer problems go back to the author verbatim
  as *blocking* items. Once you hit the cap, don't integrate; report the
  unapproved work to the owner with the last review.

## 6. The live use test (the acceptance gate)

Tests check the code; the live use test checks the product. An agent uses the
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
  for the owner.

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

## 9. Orchestrating parallel agents

- **Decompose into packages** that each own an explicit set of files.
  Parallelize only packages that are independent of each other.
- **Give each worker a self-contained brief:** goal, context to read, owned
  files, acceptance criteria, rules, and the **required report schema**
  (see the `orchestrate` skill or `prompts/`). Structured reports force the
  evidence (§3) to exist.
- **As the lead,** you own cohesion between stages, integration, and talking to
  the owner. Don't redo the workers' work; review and tie it together.
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
