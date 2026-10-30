export const meta = {
  name: 'reviewed-build',
  description: 'Build one package test-first; independent reviewers (correctness, architecture, optional UX) gate it, then a final reviewer on the strongest model, in bounded revise rounds',
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
//   worker_model?: 'sonnet',           // builds and revises
//   review_model?: 'sonnet',           // first pass: every lens
//   final_review_model?: 'opus',       // final gate: one whole-change review, only after every lens approves
//   reviewer_model?,                   // back-compat alias for final_review_model
//   project?: ''
// }
// Review is two-tier. Lenses run on review_model; a block goes back to the author. Only when every lens approves
// does one final reviewer (final_review_model) review the whole change. A final block also goes back to the
// author, then lenses and the final gate run again. max_rounds bounds the whole loop.
const A = args
const ROLE = { general: 'reviewer.md', arch: 'architecture-reviewer.md', ux: 'ux-reviewer.md' }
const LENSES = A.lenses || ['general', 'arch']
for (const k of ['repo', 'profile', 'prompts', 'id', 'base', 'brief']) if (!A[k]) throw new Error(`missing arg: ${k}`)
for (const l of LENSES) if (!ROLE[l]) throw new Error(`unknown lens: ${l} (use ${Object.keys(ROLE).join(', ')})`)
const MAX = A.max_rounds || 3
const WORKER = A.worker_model || 'sonnet', REVIEW = A.review_model || 'sonnet', FINAL = A.final_review_model || A.reviewer_model || 'opus'

const COUNTS = { type: 'object', properties: { passed: { type: 'integer' }, failed: { type: 'integer' }, errors: { type: 'integer' }, skipped: { type: 'integer' } }, required: ['passed', 'failed', 'errors', 'skipped'] }
const WORK = { type: 'object', properties: {
  branch: { type: 'string' }, commit_sha: { type: 'string' },
  changes: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, what: { type: 'string' } }, required: ['file', 'what'] } },
  tests_added: { type: 'array', items: { type: 'string' } },
  amendments_addressed: { type: 'array', items: { type: 'string' } },
  baseline: COUNTS, full_suite_after: COUNTS, live_verified: { type: 'string' },
  unresolved: { type: 'array', items: { type: 'string' } }, lessons: { type: 'array', items: { type: 'string' } } },
  required: ['branch', 'commit_sha', 'changes', 'tests_added', 'amendments_addressed', 'baseline', 'full_suite_after', 'live_verified', 'unresolved', 'lessons'] }
const REVIEW_SCHEMA = { type: 'object', properties: {
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
  const one = (l) => run(ROLE[l], `${l}:${A.id}#${round}`, { branch: work.branch, report: work }, { schema: REVIEW_SCHEMA, model: REVIEW })
  let rs = await Promise.all(LENSES.map(one))
  rs = await Promise.all(rs.map((r, i) => r || one(LENSES[i]))) // retry only the reviewers that died
  if (rs.some(r => !r)) return null
  const lenses = {
    approved: rs.every(r => r.approved),
    problems: rs.flatMap((r, i) => r.problems.map(p => ({ ...p, issue: `[${LENSES[i]}] ${p.issue}` }))),
    nits: rs.flatMap(r => r.nits || []),
    summary: rs.map((r, i) => `${LENSES[i]}: ${r.summary}`).join('\n'),
  }
  if (!lenses.approved) return lenses
  // Final gate: runs only once every lens has approved.
  const fin = (await run('final-reviewer.md', `final:${A.id}#${round}`, { branch: work.branch, report: work, lens_summary: lenses.summary }, { schema: REVIEW_SCHEMA, model: FINAL }))
    || (await run('final-reviewer.md', `final:${A.id}#${round}-retry`, { branch: work.branch, report: work, lens_summary: lenses.summary }, { schema: REVIEW_SCHEMA, model: FINAL }))
  if (!fin) return { ...lenses, approved: false, final_failed: true } // keep the lens results as last_review
  return {
    approved: fin.approved,
    problems: fin.problems.map(p => ({ ...p, issue: `[final] ${p.issue}` })),
    nits: [...lenses.nits, ...(fin.nits || [])],
    summary: `${lenses.summary}\nfinal: ${fin.summary}`,
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
  if (rv.final_failed) { notes.push(`round ${round}: final reviewer failed twice`); break }
  if (rv.approved) { approved = true; break }
  if (round === MAX) break
  const revArgs = { round: round + 1, branch: `sd/${A.id}-r${round + 1}`, previous_branch: work.branch, previous_report: work, problems: problemsText(rv), nits: nitsText(rv) }
  const label = `work:${A.id}#${round + 1}`
  const next = (await run('revise.md', label, revArgs, { schema: WORK, model: WORKER, isolation: 'worktree' }))
    || (await run('revise.md', `${label}-retry`, { ...revArgs, branch: `${revArgs.branch}-a2` }, { schema: WORK, model: WORKER, isolation: 'worktree' }))
  if (!next) { notes.push(`round ${round + 1}: revision failed twice; stopping unapproved`); break }
  work = next
}
return { id: A.id, approved, review_rounds: history.length, branch: work?.branch, report: work, last_review: history[history.length - 1] || null, notes }
