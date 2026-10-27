export const meta = {
  name: 'reviewed-build',
  description: 'Build one package test-first; independent reviewers (correctness, architecture, optional UX) gate it in bounded revise rounds',
  phases: [{ title: 'Build' }],
}
// args: {
//   repo, profile, prompts,            // absolute paths; prompts = this skill's prompts/ dir
//   id, base, brief,                   // package id, base branch/sha, brief text
//   owned_files?: [], others?: [],     // files this package owns / files owned by parallel packages
//   lenses?: ['general','arch','ux'],  // default ['general','arch']
//   max_rounds?: 3,
//   ports?: '9200-9999',               // give each concurrent run its own range
//   scratch?: '/tmp/sd',               // each agent gets <scratch>/<id>/<label>
//   worker_model?: 'sonnet', reviewer_model?: 'opus', project?: ''
// }
const A = args
const ROLE = { general: 'reviewer.md', arch: 'architecture-reviewer.md', ux: 'ux-reviewer.md' }
const LENSES = A.lenses || ['general', 'arch']
for (const k of ['repo', 'profile', 'prompts', 'id', 'base', 'brief']) if (!A[k]) throw new Error(`missing arg: ${k}`)
for (const l of LENSES) if (!ROLE[l]) throw new Error(`unknown lens: ${l} (use ${Object.keys(ROLE).join(', ')})`)
const MAX = A.max_rounds || 3
const WORKER = A.worker_model || 'sonnet', REVIEWER = A.reviewer_model || 'opus'

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

// Ports: hand out consecutive 10-port blocks so parallel agents never collide.
const [P0, P1] = (A.ports || '9200-9999').split('-').map(Number)
let slot = 0
const nextPorts = () => { const n = Math.max(1, Math.floor((P1 - P0 + 1) / 10)); const p = P0 + (slot++ % n) * 10; return `${p}-${p + 9}` }
const scratchFor = (label) => `${A.scratch || '/tmp/sd'}/${A.id}/${label.replace(/[^\w.-]/g, '_')}`

// Each agent reads its role file itself, so the prompts live in one place.
const vars = (extra) => Object.entries({
  project: A.project || A.repo, repo: A.repo, profile: A.profile, id: A.id, base: A.base, brief: A.brief,
  owned_files: (A.owned_files || []).join(', ') || '(not restricted)',
  others: (A.others || []).join(', ') || '(none)', ...extra,
}).map(([k, v]) => `{{${k}}} = ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
const run = (role, label, extra, opts) => agent(
  `Read ${A.prompts}/_common.md, then ${A.prompts}/${role}, and the schemas in ${A.prompts}/../schemas.md. ` +
  `Follow them with these values substituted:\n${vars({ ports: nextPorts(), scratch: scratchFor(label), ...extra })}`,
  { label, phase: 'Build', ...opts })

const problemsText = (rv) => rv.problems.map(p => `- ${p.file}: ${p.issue}`).join('\n') + `\nReviewer summary: ${rv.summary}`
const nitsText = (rv) => (rv.nits || []).map(n => `- ${n}`).join('\n') || '(none)'

async function review(work, round) {
  const one = (l) => run(ROLE[l], `${l}:${A.id}#${round}`, { branch: work.branch, report: work }, { schema: REVIEW, model: REVIEWER })
  let rs = await Promise.all(LENSES.map(one))
  rs = await Promise.all(rs.map((r, i) => r || one(LENSES[i]))) // retry only the reviewers that died
  if (rs.some(r => !r)) return null
  return {
    approved: rs.every(r => r.approved),
    problems: rs.flatMap((r, i) => r.problems.map(p => ({ ...p, issue: `[${LENSES[i]}] ${p.issue}` }))),
    nits: rs.flatMap(r => r.nits || []),
    summary: rs.map((r, i) => `${LENSES[i]}: ${r.summary}`).join('\n'),
  }
}

phase('Build')
const notes = []
let work = await run('worker.md', `work:${A.id}`, { branch: `sd/${A.id}` }, { schema: WORK, model: WORKER, isolation: 'worktree' })
if (!work) notes.push('worker failed; nothing to review')
const history = []
let approved = false
for (let round = 1; work && round <= MAX; round++) {
  const rv = await review(work, round)
  if (!rv) { notes.push(`round ${round}: reviewers failed twice`); break }
  history.push(rv)
  if (rv.approved) { approved = true; break }
  if (round === MAX) break
  const revArgs = { round: round + 1, branch: `sd/${A.id}-r${round + 1}`, previous_branch: work.branch, previous_report: work, problems: problemsText(rv), nits: nitsText(rv) }
  const label = `work:${A.id}#${round + 1}`
  const next = (await run('revise.md', label, revArgs, { schema: WORK, model: WORKER, isolation: 'worktree' }))
    || (await run('revise.md', `${label}-retry`, revArgs, { schema: WORK, model: WORKER, isolation: 'worktree' }))
  if (!next) { notes.push(`round ${round + 1}: revision failed twice; stopping unapproved`); break }
  work = next
}
return { id: A.id, approved, review_rounds: history.length, branch: work?.branch, report: work, last_review: history[history.length - 1] || null, notes }
