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
  const agent = async (prompt, o) => { calls.push(o.label); return script(o.label, prompt, calls) }
  const out = await load(file)({ ...base, ...args }, agent, () => {})
  const ok = check(out, calls)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) console.log(JSON.stringify(out, null, 1), calls)
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
await scenario('build: unknown lens rejected', RB, { id: 'u', base: 'main', brief: 'b', lenses: ['nope'] }, () => null, () => true).catch(e => console.log(/unknown lens/.test(e.message) ? 'PASS build: unknown lens throws' : 'FAIL ' + e.message))
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
