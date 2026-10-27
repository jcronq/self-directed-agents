export const meta = {
  name: 'acceptance-gate',
  description: 'Live use test loop: parallel testers use the real product, triage reproduces, reviewed fixes are integrated, repeat until the gate passes',
  phases: [{ title: 'Test' }, { title: 'Triage' }, { title: 'Fix' }, { title: 'Integrate' }],
}
// args: {
//   repo, profile, prompts, branch,            // branch = what's under test; fixes stack on top of it
//   areas: [{ key, focus, interface }],        // one tester per area, run in parallel
//   rubric, gate,                              // severity rubric and gate rule (text)
//   start_cmd?,                                // how testers start the system for the branch (default: the profile's "Run live")
//   max_rounds?: 4, ports?: '9200-9999', scratch?,
//   worker_model?: 'sonnet', reviewer_model?: 'opus', tester_model?: same as reviewer, project?
// }
// The workflow never pushes or files issues. It returns issues_to_file and the final branch for the lead.
const A = args
const MAX = A.max_rounds || 4
const WORKER = A.worker_model || 'sonnet', REVIEWER = A.reviewer_model || 'opus', TESTER = A.tester_model || REVIEWER

const COUNTS = { type: 'object', properties: { passed: { type: 'integer' }, failed: { type: 'integer' }, errors: { type: 'integer' }, skipped: { type: 'integer' } }, required: ['passed', 'failed', 'errors', 'skipped'] }
const FINDING = { type: 'object', properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'out_of_scope'] }, area: { type: 'string' }, repro: { type: 'string' }, expected: { type: 'string' }, actual: { type: 'string' }, evidence: { type: 'string' } }, required: ['title', 'severity', 'area', 'repro', 'expected', 'actual'] }
const USE = { type: 'object', properties: { area: { type: 'string' }, actions: { type: 'integer' }, works: { type: 'array', items: { type: 'string' } }, findings: { type: 'array', items: FINDING }, verdict: { type: 'string' } }, required: ['area', 'actions', 'works', 'findings', 'verdict'] }
const TRIAGE = { type: 'object', properties: {
  confirmed: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, severity: { type: 'string' }, reproduced: { type: 'boolean' }, root_cause: { type: 'string' }, repro: { type: 'string' }, expected: { type: 'string' }, actual: { type: 'string' } }, required: ['id', 'title', 'severity', 'reproduced', 'root_cause', 'repro'] } },
  rejected: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, reason: { type: 'string' } }, required: ['title', 'reason'] } },
  fix_packages: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, finding_ids: { type: 'array', items: { type: 'string' } }, owned_files: { type: 'array', items: { type: 'string' } }, plan: { type: 'string' } }, required: ['id', 'finding_ids', 'owned_files', 'plan'] } },
  issues_to_file: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } },
  gate_passed: { type: 'boolean' } },
  required: ['confirmed', 'rejected', 'fix_packages', 'issues_to_file', 'gate_passed'] }
const WORK = { type: 'object', properties: { branch: { type: 'string' }, commit_sha: { type: 'string' }, changes: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' } }, required: ['file', 'what'] } }, tests_added: { type: 'array', items: { type: 'string' } }, amendments_addressed: { type: 'array', items: { type: 'string' } }, full_suite_after: COUNTS, live_verified: { type: 'string' }, unresolved: { type: 'array', items: { type: 'string' } } }, required: ['branch', 'commit_sha', 'changes', 'tests_added', 'amendments_addressed', 'full_suite_after', 'live_verified', 'unresolved'] }
const REVIEW = { type: 'object', properties: { approved: { type: 'boolean' }, problems: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, issue: { type: 'string' } }, required: ['file', 'issue'] } }, nits: { type: 'array', items: { type: 'string' } }, verified: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }, required: ['approved', 'problems', 'verified', 'summary'] }
const INTEG = { type: 'object', properties: { branch: { type: 'string' }, head_sha: { type: 'string' }, merged: { type: 'array', items: { type: 'string' } }, conflicts_resolved: { type: 'array', items: { type: 'string' } }, full_suite: COUNTS, summary: { type: 'string' } }, required: ['branch', 'head_sha', 'merged', 'full_suite', 'summary'] }

const hash = (t) => { let h = 7; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 100003; return h }
const [P0, P1] = (A.ports || '9200-9999').split('-').map(Number)
const portsFor = (label) => { const n = Math.max(1, Math.floor((P1 - P0 + 1) / 10)); const p = P0 + (hash(label) % n) * 10; return `${p}-${p + 9}` }
const vars = (extra) => Object.entries({ project: A.project || A.repo, repo: A.repo, profile: A.profile, scratch: A.scratch || '/tmp/sd-gate', rubric: A.rubric, gate: A.gate, ...extra })
  .map(([k, v]) => `{{${k}}} = ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
const prompt = (role, extra) => `Read ${A.prompts}/_common.md, then ${A.prompts}/${role}, and the schemas in ${A.prompts}/../schemas.md. Follow them with these values substituted:\n${vars(extra)}`
const target = (branch) => `branch ${branch} (check it out in a detached worktree of your own and start it: ${A.start_cmd || "the profile's 'Run live' command"})`
const fmt = (rv) => rv.problems.map(p => `- ${p.file}: ${p.issue}`).join('\n') + `\nSummary: ${rv.summary}`

async function reviewed(id, phaseName, base, brief, doWork, reviseRole, schema, lenses = ['general', 'arch'], extra = {}) {
  let work = await doWork(), last = null
  for (let round = 1; work && round <= 3; round++) {
    const rs = await Promise.all(lenses.map(l => agent(prompt(l === 'arch' ? 'architecture-reviewer.md' : 'reviewer.md',
      { id, base, brief, branch: work.branch, report: work, ports: portsFor(`${l}:${id}#${round}`) }),
      { label: `${l}:${id}#${round}`, phase: phaseName, schema: REVIEW, model: REVIEWER })))
    if (rs.some(r => !r)) return { id, approved: false, work, last }
    last = { approved: rs.every(r => r.approved), problems: rs.flatMap(r => r.problems), summary: rs.map(r => r.summary).join('\n') }
    if (last.approved) return { id, approved: true, work, last }
    if (round === 3) break
    work = (await agent(prompt(reviseRole, { id, brief, round: round + 1, branch: `${work.branch}-r${round + 1}`, previous_branch: work.branch, previous_report: work, problems: fmt(last), base, ...extra, ports: portsFor(`w:${id}#${round + 1}`) }),
      { label: `work:${id}#${round + 1}`, phase: phaseName, schema, model: WORKER, isolation: 'worktree' })) || work
  }
  return { id, approved: false, work, last }
}

let branch = A.branch
const fixed = [], issues = [], log = []
let passed = false
for (let round = 1; round <= MAX && !passed; round++) {
  phase('Test')
  const reports = (await Promise.all(A.areas.map(a => agent(prompt('use-tester.md', {
    area: a.key, focus: a.focus, interface: a.interface, target: target(branch), ports: portsFor(`test:${a.key}#${round}`),
  }), { label: `test:${a.key}#${round}`, phase: 'Test', schema: USE, model: TESTER })))).filter(Boolean)

  phase('Triage')
  const tri = await agent(prompt('triage.md', { round, reports, previously_fixed: fixed, target: target(branch), ports: portsFor(`triage#${round}`) }),
    { label: `triage#${round}`, phase: 'Triage', schema: TRIAGE, model: REVIEWER })
  if (!tri) { log.push({ round, error: 'triage failed' }); break }
  issues.push(...tri.issues_to_file)
  log.push({ round, confirmed: tri.confirmed.length, rejected: tri.rejected.length, packages: tri.fix_packages.length, gate_passed: tri.gate_passed })
  if (tri.gate_passed) { passed = true; break }
  if (round === MAX) break

  phase('Fix')
  const others = (p) => tri.fix_packages.filter(q => q.id !== p.id).map(q => q.id)
  const results = await Promise.all(tri.fix_packages.map(p => {
    const id = `r${round}-${p.id}`
    const findings = tri.confirmed.filter(f => p.finding_ids.includes(f.id))
    const brief = `Fix these reproduced findings (add a regression test for each):\n${JSON.stringify(findings)}\nPlan: ${p.plan}`
    return reviewed(id, 'Fix', branch, brief,
      () => agent(prompt('worker.md', { id, base: branch, brief, branch: `sd/${id}`, owned_files: p.owned_files.join(', '), others: others(p).join(', '), ports: portsFor(`work:${id}`) }),
        { label: `work:${id}`, phase: 'Fix', schema: WORK, model: WORKER, isolation: 'worktree' }),
      'revise.md', WORK).then(r => ({ ...r, finding_ids: p.finding_ids }))
  }))
  const ok = results.filter(r => r.approved)
  log[log.length - 1].fixes = results.map(r => ({ id: r.id, approved: r.approved, branch: r.work?.branch, last_review: r.approved ? undefined : r.last }))
  if (!ok.length) break

  phase('Integrate')
  const id = `int-r${round}`
  const branches = ok.map(r => r.work.branch).join('\n')
  const brief = `Integration of round ${round} fixes on top of ${branch}.`
  const integ = await reviewed(id, 'Integrate', branch, brief,
    () => agent(prompt('integrator.md', { id, base: branch, branch: `sd/${id}`, branches, ports: portsFor(`int:${id}`) }),
      { label: `integrate:${id}`, phase: 'Integrate', schema: INTEG, model: WORKER, isolation: 'worktree' }),
    'integrator.md', INTEG, ['general'], { branches })
  if (!integ.approved) { log[log.length - 1].integration = 'not approved'; break }
  branch = integ.work.branch // the next round tests (and builds on) the integrated branch
  ok.forEach(r => fixed.push(...tri.confirmed.filter(f => r.finding_ids.includes(f.id)).map(f => ({ id: f.id, title: f.title, repro: f.repro }))))
}
return { gate_passed: passed, final_branch: branch, rounds: log, fixed, issues_to_file: issues }
