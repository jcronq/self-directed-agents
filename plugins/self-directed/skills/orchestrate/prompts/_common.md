<!-- Prepended to every role prompt. -->
Project: {{project}}. Repo: {{repo}}.
Read first: the project profile at {{profile}} (commands, invariants, environment, off-limits).
Read it fully. Your port range is {{ports}}. Your scratch dir is {{scratch}}.

Rules for every agent:
- Work in your own worktree or branch. Never modify the owner's working tree.
- Before you call something unavailable (a DB, a service, a tool), try to start or find it using the profile.
- Never touch anything the profile lists as production or off-limits.
- Never weaken, skip or delete tests, or loosen assertions.
- Every claim in your report needs evidence: counts from this run, file:line, a SHA, a transcript or a screenshot path.
  Keep verified, inferred and not-checked apart.
- No pushes, PRs or other external writes unless your brief says so. Likewise, unless your brief says so, don't
  update the owner's status channels (issue trackers, status documents, chat); report to the lead, who updates them.
- Return exactly the report schema you are given. If something is unfinished, put it in `unresolved`.
