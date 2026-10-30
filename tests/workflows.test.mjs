// Control-flow tests for the Workflow scripts with a mocked agent(). Run: node tests/workflows.test.mjs
import fs from 'fs'
const load = (f) => new Function('args', 'agent', 'phase', `return (async () => {${fs.readFileSync(f, 'utf8').replace(/^export const meta/m, 'const meta')}\n})()`)
const W = process.argv[2] || new URL("../plugins/self-directed/skills/orchestrate/workflows", import.meta.url).pathname
const base = { repo: '/r', profile: '/r/P.md', prompts: '/k/prompts', rubric: 'r', gate: 'g' }
const work = (b) => ({ branch: b, commit_sha: 'abc', changes: [], tests_added: [], amendments_addressed: [], baseline: { passed: 5, failed: 0, errors: 0, skipped: 0 }, full_suite_after: { passed: 5, failed: 0, errors: 0, skipped: 0 }, live_verified: 'x', unresolved: [], lessons: [] })
const branchOf = (p) => (p.match(/\{\{branch\}\} = (\S+)/) || [])[1]
const review = (ok) => ({ approved: ok, problems: ok ? [] : [{ file: 'a.py:1', issue: 'bad' }], nits: ['n'], verified: ['ran'], summary: 's' })
async function scenario(name, file, args, script, check) {
  const calls = []
  const models = {}
  const agent = async (prompt, o) => { calls.push(o.label); models[o.label] = o.model; return script(o.label, prompt, calls, models) }
  const out = await load(file)({ ...base, ...args }, agent, () => {})
  const ok = check(out, calls, models)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) process.exitCode = 1; if (!ok) console.log(JSON.stringify(out, null, 1), calls)
}
const RB = `${W}/reviewed-build.js`, AG = `${W}/acceptance-gate.js`
await scenario('build: arch rejects then approves; revision chains', RB, { id: 'x', base: 'main', brief: 'b' },
  (l, p) => l.startsWith('work:') ? work(branchOf(p)) : review(!(l === 'arch:x#1')),
  (o, c) => o.approved && o.review_rounds === 2 && o.branch === 'sd/x-r2' && c.includes('work:x#2'))
await scenario('build: nits are not passed as problems', RB, { id: 'y', base: 'main', brief: 'b' },
  (l, p) => { if (l === 'work:y#2') { globalThis.rp = p } return l.startsWith('work:') ? work(branchOf(p)) : review(l !== 'general:y#1') },
  (o) => /\{\{problems\}\} = - a\.py:1: \[general\] bad/.test(globalThis.rp) && /\{\{nits\}\} = - n/.test(globalThis.rp) && !/\{\{problems\}\}[^\n]*\bn\b\n/.test(globalThis.rp))
await scenario('build: dead worker -> unapproved, no review', RB, { id: 'z', base: 'main', brief: 'b' },
  () => null, (o, c) => !o.approved && o.review_rounds === 0 && c.length === 1)
await scenario('build: one reviewer dies once -> only it is retried', RB, { id: 'q', base: 'main', brief: 'b' },
  (l, p, c) => l.startsWith('work:') ? work(branchOf(p)) : (l === 'arch:q#1' && c.filter(x => x === l).length === 1 ? null : review(true)),
  (o, c) => o.approved && c.filter(x => x === 'general:q#1').length === 1 && c.filter(x => x === 'arch:q#1').length === 2)
const okRev = (l, p) => l.startsWith('work:') ? work(branchOf(p)) : review(true)
await scenario('build: lenses approve -> final gate runs on opus, lenses on sonnet', RB, { id: 'f', base: 'main', brief: 'b' },
  okRev,
  (o, c, m) => o.approved && o.review_rounds === 1 && c.includes('final:f#1') && c.indexOf('final:f#1') > c.indexOf('arch:f#1')
    && m['final:f#1'] === 'opus' && m['general:f#1'] === 'sonnet' && m['arch:f#1'] === 'sonnet' && m['work:f'] === 'sonnet')
let fp
await scenario('build: final gate blocks -> revise -> lenses and final run again', RB, { id: 'g', base: 'main', brief: 'b' },
  (l, p) => { if (l === 'work:g#2') fp = p; return l.startsWith('work:') ? work(branchOf(p)) : review(l !== 'final:g#1') },
  (o, c) => o.approved && o.review_rounds === 2 && o.branch === 'sd/g-r2'
    && /\{\{problems\}\} = - a\.py:1: \[final\] bad/.test(fp)
    && c.join() === 'work:g,general:g#1,arch:g#1,final:g#1,work:g#2,general:g#2,arch:g#2,final:g#2')
await scenario('build: final agent dies once -> retried, approves', RB, { id: 'k', base: 'main', brief: 'b' },
  (l, p) => l.startsWith('work:') ? work(branchOf(p)) : (l === 'final:k#1' ? null : review(true)),
  (o, c) => o.approved && c.includes('final:k#1-retry') && c.filter(x => x === 'general:k#1').length === 1)
await scenario('build: final agent dies twice -> unapproved, note, last_review has lens results', RB, { id: 'l', base: 'main', brief: 'b' },
  (l, p) => l.startsWith('work:') ? work(branchOf(p)) : (l.startsWith('final:') ? null : review(true)),
  (o, c) => !o.approved && o.notes.includes('round 1: final reviewer failed twice') && o.last_review && /general: s/.test(o.last_review.summary)
    && c.filter(x => x.startsWith('final:')).length === 2 && !c.includes('work:l#2'))
await scenario('build: no final review while a lens is blocking', RB, { id: 'h', base: 'main', brief: 'b', max_rounds: 1 },
  (l, p) => l.startsWith('work:') ? work(branchOf(p)) : review(l !== 'arch:h#1'),
  (o, c) => !o.approved && !c.some(x => x.startsWith('final:')))
await scenario('build: reviewer_model is a back-compat alias for the final model', RB, { id: 'i', base: 'main', brief: 'b', reviewer_model: 'big' },
  okRev, (o, c, m) => o.approved && m['final:i#1'] === 'big' && m['general:i#1'] === 'sonnet')
await scenario('build: review_model and final_review_model override', RB, { id: 'j', base: 'main', brief: 'b', review_model: 'haiku', final_review_model: 'fin', reviewer_model: 'ignored' },
  okRev, (o, c, m) => m['general:j#1'] === 'haiku' && m['final:j#1'] === 'fin')
await scenario('build: unknown lens rejected', RB, { id: 'u', base: 'main', brief: 'b', lenses: ['nope'] }, () => null, () => false).catch(e => console.log(/unknown lens/.test(e.message) ? 'PASS build: unknown lens throws' : (process.exitCode = 1, 'FAIL ' + e.message)))
const areas = [{ key: 'a', focus: 'f', interface: 'browser' }, { key: 'b', focus: 'f', interface: 'api' }]
await scenario('gate: dead tester blocks a "passed" triage', AG, { branch: 'feat', areas },
  (l) => l.startsWith('test:b') ? null : l.startsWith('test:') ? { area: 'a', actions: 3, works: [], findings: [], verdict: 'ok' }
    : l.startsWith('triage') ? { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true } : null,
  (o) => !o.gate_passed && o.rounds[0].missing_areas[0] === 'b')
await scenario('gate: fix -> integrate -> retest on integrated branch -> pass', AG, { branch: 'feat', areas },
  (l, p) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 3, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [{ title: 'm', body: 'b' }], gate_passed: false }
    if (l === 'triage#2') { globalThis.t2 = p; return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true } }
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 5, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    return review(true)
  },
  (o, c) => o.gate_passed && o.final_branch === 'sd/int-r1' && o.fixed[0].id === 'F1' && o.issues_to_file.length === 1
    && /branch sd\/int-r1/.test(globalThis.t2) && c.includes('arch:int-r1#1'))
await scenario('gate: a retried worker gets a fresh branch name', AG, { branch: 'feat', areas: [areas[0]] },
  (l, p, c) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
    if (l === 'work:r1-p1') return null // first attempt dies
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    return review(true)
  },
  (o, c) => o.gate_passed && c.includes('work:r1-p1-retry') && o.rounds[0].fixes[0].branch === 'sd/r1-p1-a2')
await scenario('gate: fix reviews are two-tier (sonnet lenses, then opus final); tester and triage stay opus', AG, { branch: 'feat', areas: [areas[0]] },
  (l, p) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    return review(true)
  },
  (o, c, m) => o.gate_passed && m['general:r1-p1#1'] === 'sonnet' && m['final:r1-p1#1'] === 'opus' && m['final:int-r1#1'] === 'opus'
    && c.indexOf('final:r1-p1#1') > c.indexOf('arch:r1-p1#1') && m['test:a#1'] === 'opus' && m['triage#1'] === 'opus')
await scenario('gate: a final-gate block (review_rounds 1) leaves the fix package unapproved', AG, { branch: 'feat', areas: [areas[0]], review_rounds: 1 },
  (l, p) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('work:')) return work(branchOf(p))
    return review(!l.startsWith('final:'))
  },
  (o, c) => !o.gate_passed && o.rounds[0].stopped === 'no fix package was approved' && c.includes('final:r1-p1#1'))
await scenario('gate: lens blocks (review_rounds 1) -> no final review runs', AG, { branch: 'feat', areas: [areas[0]], review_rounds: 1 },
  (l, p) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    return review(l !== 'arch:r1-p1#1')
  },
  (o, c) => !o.gate_passed && o.rounds[0].stopped === 'no fix package was approved' && !c.some(x => x.startsWith('final:')))
let gp
await scenario('gate: final block -> revise -> lenses and final run again', AG, { branch: 'feat', areas: [areas[0]], review_rounds: 2 },
  (l, p) => {
    if (l === 'work:r1-p1#2') gp = p
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    return review(l !== 'final:r1-p1#1')
  },
  (o, c) => o.gate_passed && /\{\{problems\}\} = - a\.py:1: \[final\] bad/.test(gp)
    && c.filter(x => /r1-p1#/.test(x)).join() === 'general:r1-p1#1,arch:r1-p1#1,final:r1-p1#1,work:r1-p1#2,general:r1-p1#2,arch:r1-p1#2,final:r1-p1#2')
await scenario('gate: final agent dies once -> retried, approves', AG, { branch: 'feat', areas: [areas[0]] },
  (l, p, c) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    if (l === 'final:r1-p1#1') return null
    return review(true)
  },
  (o, c) => o.gate_passed && c.includes('final:r1-p1#1-retry'))
await scenario('gate: final agent dies twice -> package unapproved with note', AG, { branch: 'feat', areas: [areas[0]] },
  (l, p) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    if (l.startsWith('final:r1-p1')) return null
    return review(true)
  },
  (o, c) => !o.gate_passed && o.rounds[0].stopped === 'no fix package was approved' && o.rounds[0].fixes[0].note === 'round 1: final reviewer failed twice' && o.rounds[0].fixes[0].last_review?.approved === false && /general: s/.test(o.rounds[0].fixes[0].last_review.summary)
    && c.filter(x => x.startsWith('final:r1-p1')).length === 2)
