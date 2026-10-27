# Report schemas

Every agent returns one of these. They're required, not optional. Each field
exists to make a claim checkable, so a reviewer can verify it, not trust it.
They're shown as compact JSON shapes; the workflow scripts use the same
shapes as JSON Schema.

## Worker report
```
{
  branch, commit_sha,
  changes: [{file, what}],
  tests_added: [path::name],          // each must fail on the old code
  amendments_addressed: [string],     // every review problem or brief item, by name
  full_suite_after: {passed, failed, errors, skipped},   // from THIS run
  live_verified: string,              // what was exercised live, how, and the evidence path
  unresolved: [string]                // anything not done, out of scope, or needing the owner
}
```

## Review
```
{
  approved: bool,                     // true only if no material problem remains
  problems: [{file, issue}],          // blocking; file:line plus a concrete fix
  nits: [string],                     // non-blocking
  verified: [string],                 // what the reviewer actually ran or checked
  summary: string
}
```

## Integration report
```
{ branch, head_sha, merged: [branch], conflicts_resolved: [string],
  full_suite: {passed, failed, errors, skipped}, summary }
```

## Live-use-test report
```
{
  area, actions: int,                 // how much was actually exercised
  works: [string],
  findings: [{title, severity: blocker|major|minor|out_of_scope, area,
              repro, expected, actual, evidence}],
  verdict
}
```

## Triage
```
{
  confirmed: [{id, title, severity, reproduced: bool, root_cause, repro, expected, actual}],
  rejected:  [{title, reason}],       // couldn't reproduce, not a bug, or a duplicate
  fix_packages: [{id, finding_ids, owned_files, plan}],   // owned_files must not overlap
  issues_to_file: [{title, body}],    // out of scope, or minors below the gate
  gate_passed: bool                   // per the profile's gate rule
}
```
