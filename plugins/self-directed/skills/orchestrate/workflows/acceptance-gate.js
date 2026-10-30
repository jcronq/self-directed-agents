export const meta = {
  name: 'acceptance-gate',
  description: 'Live use test loop: parallel testers use the real product, triage reproduces, reviewed fixes are integrated, repeat until the gate passes',
  phases: [{ title: 'Test' }, { title: 'Triage' }, { title: 'Fix' }, { title: 'Integrate' }],
}
// args: {
//   repo, profile, prompts, branch,            // branch = what's under test; fixes stack on top of it
//   areas: [{ key, focus, interface }],        // one tester per area, run in parallel
//   rubric, gate,                              // severity rubric and gate rule (text)
//   start_cmd?,                                // how testers start the system (default: the profile's "Run live")
//   max_rounds?: 4, review_rounds?: 3,
//   fix_lenses?: ['general','arch'],           // add 'ux' when fixes are user-facing
//   ports?: '9200-9999', scratch?: '/tmp/sd-gate',
//   worker_model?: 'sonnet',                   // builds, fixes and integrates
//   review_model?: 'sonnet',                   // first-pass reviews of fix packages and integrations: every lens
//   final_review_model?: 'opus',               // one whole-change review, only after every lens approves
//   reviewer_model?,                           // back-compat alias for final_review_model
//   tester_model?: (final_review_model),       // live use testers: not reviews, so they stay on the strongest model
//   project?
// Triage also runs on final_review_model (it reproduces findings and decides the gate).
// }
// The workflow never pushes or files issues. It returns issues_to_file and the final branch for the lead.
const A = args
const ROLE = { general: 'reviewer.md', arch: 'architecture-reviewer.md', ux: 'ux-reviewer.md' }
for (const k of ['repo', 'profile', 'prompts', 'branch', 'rubric', 'gate']) if (!A[k]) throw new Error(`missing arg: ${k}`)
if (!Array.isArray(A.areas) || !A.areas.length) throw new Error('areas must be a non-empty array of {key, focus, interface}')
const FIX_LENSES = A.fix_lenses || ['general', 'arch']
for (const l of FIX_LENSES) if (!ROLE[l]) throw new Error(`unknown lens: ${l}`)
const MAX = A.max_rounds || 4, REVIEW_ROUNDS = A.review_rounds || 3
const WORKER = A.worker_model || 'sonnet', REVIEW_M = A.review_model || 'sonnet', FINAL = A.final_review_model || A.reviewer_model || 'opus', TESTER = A.tester_model || FINAL
const SEV = ['blocker', 'major', 'minor', 'out_of_scope']

const COUNTS = { type: 'object', properties: { passed: { type: 'integer' }, failed: { type: 'integer' }, errors: { type: 'integer' }, skipped: { type: 'integer' } }, required: ['passed', 'failed', 'errors', 'skipped'] }
const FINDING = { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: SEV }, area: { type: 'string' }, repro: { type: 'string' }, expected: { type: 'string' }, actual: { type: 'string' }, evidence: { type: 'string' } }, required: ['title', 'severity', 'area', 'repro', 'expected', 'actual'] }
const USE = { type: 'object', properties: { area: { type: 'string' }, actions: { type: 'integer' }, works: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: FINDING }, verdict: { type: 'string' } }, required: ['area', 'actions', 'works', 'findings', 'verdict'] }
const TRIAGE = { type: 'object', properties: {
  confirmed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string', enum: SEV }, reproduced: { type: 'boolean' }, root_cause: { type: 'string' }, repro: { type: 'string' }, expected: { type: 'string' }, actual: { type: 'string' } }, required: ['id', 'title', 'severity', 'reproduced', 'root_cause', 'repro'] } },
  rejected: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, reason: { type: 'string' } }, required: ['title', 'reason'] } },
  fix_packages: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, finding_ids: { type: 'array', items: { type: 'string' } }, owned_files: { type: 'array', items: { type: 'string' } }, plan: { type: 'string' } }, required: ['id', 'finding_ids', 'owned_files', 'plan'] } },
  issues_to_file: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } },
  gate_passed: { type: 'boolean' } },
  required: ['confirmed', 'rejected', 'fix_packages', 'issues_to_file', 'gate_passed'] }
const WORK = { type: 'object', properties: { branch: { type: 'string' }, commit_sha: { type: 'string' }, changes: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' } }, required: ['file', 'what'] } }, tests_added: { type: 'array', items: { type: 'string' } }, amendments_addressed: { type: 'array', items: { type: 'string' } }, baseline: COUNTS, full_suite_after: COUNTS, live_verified: { type: 'string' }, unresolved: { type: 'array', items: { type: 'string' } }, lessons: { type: 'array', items: { type: 'string' } } }, required: ['branch', 'commit_sha', 'changes', 'tests_added', 'amendments_addressed', 'baseline', 'full_suite_after', 'live_verified', 'unresolved', 'lessons'] }
const REVIEW_SCHEMA = { type: 'object', properties: { approved: { type: 'boolean' }, problems: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, issue: { type: 'string' } }, required: ['file', 'issue'] } }, nits: { type: 'array', items: { type: 'string' } }, verified: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['approved', 'problems', 'verified', 'summary'] }
const INTEG = { type: 'object', properties: { branch: { type: 'string' }, head_sha: { type: 'string' }, merged: { type: 'array', items: { type: 'string' } }, conflicts_resolved: { type: 'array', items: { type: 'string' } }, full_suite: COUNTS, summary: { type: 'string' } }, required: ['branch', 'head_sha', 'merged', 'full_suite', 'summary'] }

const [P0, P1] = (A.ports || '9200-9999').split('-').map(Number)
let slot = 0
const nextPorts = () => { const n = Math.max(1, Math.floor((P1 - P0 + 1) / 10)); const p = P0 + (slot++ % n) * 10; return `${p}-${p + 9}` }
const vars = (extra) => Object.entries({ project: A.project || A.repo, repo: A.repo, profile: A.profile, rubric: A.rubric, gate: A.gate, ...extra })
  .map(([k, v]) => `{{${k}}} = ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
const run = (role, label, phaseName, extra, opts) => agent(
  `Read ${A.prompts}/_common.md, then ${A.prompts}/${role}, and the schemas in ${A.prompts}/../schemas.md. Follow them with these values substituted:\n` +
  vars({ ports: nextPorts(), scratch: `${A.scratch || '/tmp/sd-gate'}/${label.replace(/[^\w.-]/g, '_')}`, ...extra }),
  { label, phase: phaseName, ...opts })
// The attempt number lets a retry use a fresh branch name if the failed attempt left one behind.
const retry = async (f) => (await f(1)) || (await f(2))
const att = (b, n) => (n > 1 ? `${b}-a${n}` : b)
const target = (branch) => `branch ${branch} (check it out in a detached worktree of your own and start it: ${A.start_cmd || "the profile's 'Run live' command"})`
const problemsText = (rv) => rv.problems.map(p => `- ${p.file}: ${p.issue}`).join('\n') + `\nReviewer summary: ${rv.summary}`
const nitsText = (rv) => (rv.nits || []).map(n => `- ${n}`).join('\n') || '(none)'

// work -> Sonnet lenses (all must approve) -> Opus final gate -> revise on any block, bounded. Revisions always build on the previous branch.
async function reviewed(id, phaseName, base, brief, doWork, reviseRole, schema, lenses, extra = {}) {
  let work = await retry(doWork), last = null
  if (!work) return { id, approved: false, work: null, last, note: 'worker failed twice' }
  for (let round = 1; round <= REVIEW_ROUNDS; round++) {
    const one = (l) => run(ROLE[l], `${l}:${id}#${round}`, phaseName, { id, base, brief, branch: work.branch, report: work }, { schema: REVIEW_SCHEMA, model: REVIEW_M })
    let rs = await Promise.all(lenses.map(one))
    rs = await Promise.all(rs.map((r, i) => r || one(lenses[i])))
    if (rs.some(r => !r)) return { id, approved: false, work, last, note: `round ${round}: reviewers failed twice` }
    last = { approved: rs.every(r => r.approved), problems: rs.flatMap((r, i) => r.problems.map(p => ({ ...p, issue: `[${lenses[i]}] ${p.issue}` }))), nits: rs.flatMap(r => r.nits || []), summary: rs.map((r, i) => `${lenses[i]}: ${r.summary}`).join('\n') }
    if (last.approved) { // final gate: only after every lens approves
      const finalArgs = { id, base, brief, branch: work.branch, report: work, lens_summary: last.summary }
      const fin = await retry((n) => run('final-reviewer.md', `final:${id}#${round}${n > 1 ? '-retry' : ''}`, phaseName, finalArgs, { schema: REVIEW_SCHEMA, model: FINAL }))
      if (!fin) return { id, approved: false, work, last: { ...last, approved: false }, note: `round ${round}: final reviewer failed twice` }
      last = { approved: fin.approved, problems: fin.problems.map(p => ({ ...p, issue: `[final] ${p.issue}` })), nits: [...last.nits, ...(fin.nits || [])], summary: `${last.summary}\nfinal: ${fin.summary}` }
    }
    if (last.approved) return { id, approved: true, work, last }
    if (round === REVIEW_ROUNDS) break
    const next = await retry((n) => run(reviseRole, `work:${id}#${round + 1}${n > 1 ? '-retry' : ''}`, phaseName,
      { id, base, brief, round: round + 1, branch: att(`${work.branch.replace(/(-r\d+)?(-a\d+)?$/, '')}-r${round + 1}`, n), previous_branch: work.branch, previous_report: work, problems: problemsText(last), nits: nitsText(last), ...extra },
      { schema, model: WORKER, isolation: 'worktree' }))
    if (!next) return { id, approved: false, work, last, note: `round ${round + 1}: revision failed twice` }
    work = next
  }
  return { id, approved: false, work, last }
}

let branch = A.branch
const fixed = [], issues = [], log = []
let passed = false
for (let round = 1; round <= MAX && !passed; round++) {
  phase('Test')
  const test = (a) => run('use-tester.md', `test:${a.key}#${round}`, 'Test', { area: a.key, focus: a.focus, interface: a.interface, target: target(branch) }, { schema: USE, model: TESTER })
  let reports = await Promise.all(A.areas.map(test))
  reports = await Promise.all(reports.map((r, i) => r || test(A.areas[i]))) // retry testers that died
  const missing = A.areas.filter((_, i) => !reports[i]).map(a => a.key)
  reports = reports.filter(Boolean)
  const entry = { round, branch, missing_areas: missing }
  log.push(entry)

  phase('Triage')
  const tri = await retry((n) => run('triage.md', `triage#${round}${n > 1 ? '-retry' : ''}`, 'Triage',
    { round, reports, previously_fixed: fixed, target: target(branch), missing_areas: missing.length ? `${missing.join(', ')}: their testers FAILED; that coverage is missing` : '(none)' },
    { schema: TRIAGE, model: FINAL }))
  if (!tri) { entry.error = 'triage failed twice'; break }
  issues.push(...tri.issues_to_file)
  Object.assign(entry, { confirmed: tri.confirmed.length, rejected: tri.rejected.length, packages: tri.fix_packages.length, triage_gate: tri.gate_passed })
  // Never pass the gate on missing coverage.
  if (tri.gate_passed && !missing.length) { passed = true; break }
  if (round === MAX) break
  if (!tri.fix_packages.length) { entry.stopped = missing.length ? 'no fixes; missing coverage remains' : 'gate not passed but triage proposed no fixes'; break }

  phase('Fix')
  const results = await Promise.all(tri.fix_packages.map(p => {
    const id = `r${round}-${p.id}`
    const findings = tri.confirmed.filter(f => p.finding_ids.includes(f.id))
    const brief = `Fix these reproduced findings (add a regression test for each):\n${JSON.stringify(findings)}\nPlan: ${p.plan}`
    const others = tri.fix_packages.filter(q => q.id !== p.id).flatMap(q => q.owned_files)
    return reviewed(id, 'Fix', branch, brief,
      (n) => run('worker.md', `work:${id}${n > 1 ? '-retry' : ''}`, 'Fix', { id, base: branch, brief, branch: att(`sd/${id}`, n), owned_files: p.owned_files.join(', '), others: others.join(', ') || '(none)' },
        { schema: WORK, model: WORKER, isolation: 'worktree' }),
      'revise.md', WORK, FIX_LENSES).then(r => ({ ...r, finding_ids: p.finding_ids }))
  }))
  entry.fixes = results.map(r => ({ id: r.id, approved: r.approved, branch: r.work?.branch, note: r.note, last_review: r.approved ? undefined : r.last }))
  const ok = results.filter(r => r.approved)
  if (!ok.length) { entry.stopped = 'no fix package was approved'; break }

  phase('Integrate')
  const id = `int-r${round}`
  const branches = ok.map(r => `- ${r.work.branch}`).join('\n')
  const integ = await reviewed(id, 'Integrate', branch, `Integration of round ${round} fixes on top of ${branch}.`,
    (n) => run('integrator.md', `integrate:${id}${n > 1 ? '-retry' : ''}`, 'Integrate', { id, base: branch, branch: att(`sd/${id}`, n), branches, problems: '', previous_branch: '' },
      { schema: INTEG, model: WORKER, isolation: 'worktree' }),
    'integrator.md', INTEG, ['general', 'arch'], { branches })
  if (!integ.approved) { entry.integration = integ.note || 'not approved'; break }
  branch = integ.work.branch // the next round tests (and builds on) the integrated branch
  ok.forEach(r => fixed.push(...tri.confirmed.filter(f => r.finding_ids.includes(f.id)).map(f => ({ id: f.id, title: f.title, repro: f.repro }))))
}
return { gate_passed: passed, final_branch: branch, rounds: log, fixed, issues_to_file: issues }
