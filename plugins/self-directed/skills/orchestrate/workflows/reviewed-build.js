export const meta = {
  name: 'reviewed-build',
  description: 'Build one package test-first; independent reviewers (correctness, architecture, optional UX) gate it in bounded revise rounds',
  phases: [{ title: 'Build' }],
}
// args: {
//   repo, profile, prompts,            // absolute paths; prompts = this skill's prompts/ dir
//   id, base, brief,                   // package id, base branch/sha, brief text
//   owned_files?: [], others?: [],     // file ownership for parallel packages
//   lenses?: ['general','arch','ux'],  // default ['general','arch']
//   max_rounds?: 3, ports?: '9200-9299', scratch?: '/tmp/<x>',
//   worker_model?: 'sonnet', reviewer_model?: 'opus', project?: ''
// }
const A = args
const LENSES = A.lenses || ['general', 'arch']
const MAX = A.max_rounds || 3
const WORKER = A.worker_model || 'sonnet', REVIEWER = A.reviewer_model || 'opus'
const ROLE = { general: 'reviewer.md', arch: 'architecture-reviewer.md', ux: 'ux-reviewer.md' }

const COUNTS = { type: 'object', properties: { passed: { type: 'integer' }, failed: { type: 'integer' }, errors: { type: 'integer' }, skipped: { type: 'integer' } }, required: ['passed', 'failed', 'errors', 'skipped'] }
const WORK = { type: 'object', properties: {
  branch: { type: 'string' }, commit_sha: { type: 'string' },
  changes: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' } }, required: ['file', 'what'] } },
  tests_added: { type: 'array', items: { type: 'string' } },
  amendments_addressed: { type: 'array', items: { type: 'string' } },
  full_suite_after: COUNTS, live_verified: { type: 'string' },
  unresolved: { type: 'array', items: { type: 'string' } } },
  required: ['branch', 'commit_sha', 'changes', 'tests_added', 'amendments_addressed', 'full_suite_after', 'live_verified', 'unresolved'] }
const REVIEW = { type: 'object', properties: {
  approved: { type: 'boolean' },
  problems: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, issue: { type: 'string' } }, required: ['file', 'issue'] } },
  nits: { type: 'array', items: { type: 'string' } },
  verified: { type: 'array', items: { type: 'string' } },
  summary: { type: 'string' } },
  required: ['approved', 'problems', 'verified', 'summary'] }

const hash = (t) => { let h = 7; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 100003; return h }
const [P0, P1] = (A.ports || '9200-9999').split('-').map(Number)
const portsFor = (label) => { const n = Math.max(1, Math.floor((P1 - P0 + 1) / 10)); const p = P0 + (hash(label) % n) * 10; return `${p}-${p + 9}` }

// Each agent reads its role file itself, so the prompts live in one place.
const vars = (extra) => Object.entries({
  project: A.project || A.repo, repo: A.repo, profile: A.profile,
  scratch: A.scratch || `/tmp/sd-${A.id}`, id: A.id, base: A.base, brief: A.brief,
  owned_files: (A.owned_files || []).join(', ') || '(not restricted)',
  others: (A.others || []).join(', ') || '(none)', ...extra,
}).map(([k, v]) => `{{${k}}} = ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
const prompt = (role, extra) =>
  `Read ${A.prompts}/_common.md, then ${A.prompts}/${role}, and the schemas in ${A.prompts}/../schemas.md. ` +
  `Follow them with these values substituted:\n${vars(extra)}`

const fmt = (rv) => rv.problems.map(p => `- ${p.file}: ${p.issue}`).join('\n') +
  `\nNits: ${(rv.nits || []).join(' | ')}\nSummary: ${rv.summary}`

async function review(work, round) {
  const label = `${A.id}#${round}`
  const rs = await Promise.all(LENSES.map(l => agent(
    prompt(ROLE[l], { branch: work.branch, report: work, ports: portsFor(`${l}:${label}`) }),
    { label: `${l}:${label}`, phase: 'Build', schema: REVIEW, model: REVIEWER })))
  if (rs.some(r => !r)) return null
  return {
    approved: rs.every(r => r.approved),
    problems: rs.flatMap((r, i) => r.problems.map(p => ({ ...p, issue: `[${LENSES[i]}] ${p.issue}` }))),
    nits: rs.flatMap(r => r.nits || []),
    summary: rs.map((r, i) => `${LENSES[i]}: ${r.summary}`).join('\n'),
  }
}

phase('Build')
let work = await agent(prompt('worker.md', { branch: `sd/${A.id}`, ports: portsFor(`work:${A.id}`) }),
  { label: `work:${A.id}`, phase: 'Build', schema: WORK, model: WORKER, isolation: 'worktree' })
const history = []
let approved = false, round = 1
for (; work && round <= MAX; round++) {
  let rv = await review(work, round)
  if (!rv) rv = await review(work, round) // one retry if a reviewer died
  if (!rv) break
  history.push(rv)
  if (rv.approved) { approved = true; break }
  if (round === MAX) break
  work = (await agent(prompt('revise.md', {
    round: round + 1, branch: `sd/${A.id}-r${round + 1}`, previous_branch: work.branch,
    previous_report: work, problems: fmt(rv), ports: portsFor(`work:${A.id}#${round + 1}`),
  }), { label: `work:${A.id}#${round + 1}`, phase: 'Build', schema: WORK, model: WORKER, isolation: 'worktree' })) || work
}
return { id: A.id, approved, rounds: Math.min(round, MAX), branch: work?.branch, report: work, last_review: history[history.length - 1] || null }
