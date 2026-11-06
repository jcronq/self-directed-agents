// Control-flow tests for the Workflow scripts with a mocked agent(). Run: node tests/workflows.test.mjs
import fs from 'fs'
const load = (f) => new Function('args', 'agent', 'phase', `return (async () => {${fs.readFileSync(f, 'utf8').replace(/^export const meta/m, 'const meta')}\n})()`)
const W = process.argv[2] || new URL("../plugins/self-directed/skills/orchestrate/workflows", import.meta.url).pathname
// effort is required by both scripts; 4 keeps the pre-effort defaults (both lenses, package final gate) for the older scenarios.
const base = { repo: '/r', profile: '/r/P.md', prompts: '/k/prompts', rubric: 'r', gate: 'g', effort: 4 }
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
await scenario('build: consumes/provides/owned files reach the worker prompt', RB, { id: 'v', base: 'main', brief: 'b', owned_files: ['a.py'], consumes: 'Foo API', provides: 'Bar API' },
  (l, p) => { if (l === 'work:v') globalThis.wp = p; return l.startsWith('work:') ? work(branchOf(p)) : review(true) },
  () => /\{\{consumes\}\} = Foo API/.test(globalThis.wp) && /\{\{provides\}\} = Bar API/.test(globalThis.wp) && /\{\{owned_files\}\} = a\.py/.test(globalThis.wp))
{
  // Two packages run concurrently. Package "slow" stays building until "fast" has been fully reviewed:
  // that only terminates if review of a finished package starts while another is still building.
  const events = []
  let releaseSlow
  const slowGate = new Promise(r => { releaseSlow = r })
  const agent = async (prompt, o) => {
    events.push(o.label)
    if (o.label === 'work:slow') { await slowGate; return work(branchOf(prompt)) }
    if (o.label.startsWith('work:')) return work(branchOf(prompt))
    if (o.label === 'final:fast#1') releaseSlow()
    return review(true)
  }
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('deadlock: fast review waited for slow build')), 2000))
  const run = (id) => load(RB)({ ...base, id, base: 'main', brief: 'b' }, agent, () => {})
  const out = await Promise.race([Promise.all([run('slow'), run('fast')]), timeout]).catch(e => e)
  const ok = Array.isArray(out) && out.every(o => o.approved) && events.indexOf('final:fast#1') < events.indexOf('general:slow#1')
  console.log(`${ok ? 'PASS' : 'FAIL'} regression: a finished package is reviewed while another is still building`); if (!ok) { process.exitCode = 1; console.log(out, events) }
}
await scenario("build: final_gate 'none' ends at first-pass approval, no final review", RB, { id: 'n', base: 'main', brief: 'b', final_gate: 'none' },
  okRev, (o, c) => o.approved && o.final_gate === 'none' && o.review_rounds === 1 && c.join() === 'work:n,general:n#1,arch:n#1')
await scenario("build: final_gate 'none' still revises on a lens block", RB, { id: 'm', base: 'main', brief: 'b', final_gate: 'none' },
  (l, p) => l.startsWith('work:') ? work(branchOf(p)) : review(l !== 'arch:m#1'),
  (o, c) => o.approved && o.review_rounds === 2 && !c.some(x => x.startsWith('final:')))
await scenario("build: final_gate defaults to 'package' (final review runs)", RB, { id: 'd', base: 'main', brief: 'b' },
  okRev, (o, c) => o.approved && o.final_gate === 'package' && c.includes('final:d#1'))
await scenario('build: unknown final_gate rejected', RB, { id: 'w', base: 'main', brief: 'b', final_gate: 'x' }, () => null, () => false).catch(e => console.log(/unknown final_gate/.test(e.message) ? 'PASS build: unknown final_gate throws' : (process.exitCode = 1, 'FAIL ' + e.message)))
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
await scenario("gate: final_gate 'none' -> fix package skips its Opus gate, the integrated branch still gets one", AG, { branch: 'feat', areas: [areas[0]], final_gate: 'none' },
  (l, p) => {
    if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
    if (l === 'triage#1') return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false }
    if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
    if (l.startsWith('work:')) return work(branchOf(p))
    if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
    return review(true)
  },
  (o, c) => o.gate_passed && !c.includes('final:r1-p1#1') && c.includes('final:int-r1#1') && c.includes('arch:r1-p1#1'))

// Effort scale (manual §1a)
const rejects = (name, file, args, re) => scenario(name, file, args, () => null, () => false)
  .catch(e => console.log(re.test(e.message) ? `PASS ${name}` : `FAIL ${name}: ${e.message}`)).then(() => {})
const blockAll = (l, p) => l.startsWith('work:') ? work(branchOf(p)) : review(false)
const stages = (c) => c.map(x => x.split(':')[0])
await scenario('effort 1 (build): no reviewers, 0 rounds, flagged unreviewed', RB, { id: 'e1', base: 'main', brief: 'b', effort: 1 },
  okRev, (o, c) => c.join() === 'work:e1' && o.review_rounds === 0 && o.unreviewed === true && o.effort === 1 && o.final_gate === 'none' && o.branch === 'sd/e1')
await scenario('effort 2 (build): one correctness lens, 1 round, no final gate', RB, { id: 'e2', base: 'main', brief: 'b', effort: 2 },
  blockAll, (o, c) => c.join() === 'work:e2,general:e2#1' && o.review_rounds === 1 && !o.approved && o.final_gate === 'none')
await scenario('effort 2 (build): approving lens ends the loop without a final gate', RB, { id: 'e2b', base: 'main', brief: 'b', effort: 2 },
  okRev, (o, c) => o.approved && c.join() === 'work:e2b,general:e2b#1')
await scenario('effort 3 (build): configured lenses, up to 3 rounds, no final gate', RB, { id: 'e3', base: 'main', brief: 'b', effort: 3, lenses: ['general', 'arch', 'ux'] },
  blockAll, (o, c) => o.review_rounds === 3 && !o.approved && o.final_gate === 'none' && c.filter(x => x.startsWith('ux:')).length === 3 && !c.some(x => x.startsWith('final:')) && !c.includes('work:e3#4'))
await scenario('effort 4 (build): configured lenses, up to 4 rounds, package final gate', RB, { id: 'e4', base: 'main', brief: 'b', effort: 4 },
  blockAll, (o, c) => o.review_rounds === 4 && !o.approved && o.final_gate === 'package' && c.filter(x => x.startsWith('arch:')).length === 4)
await scenario('effort 4 (build): final gate runs after the lenses approve', RB, { id: 'e4b', base: 'main', brief: 'b', effort: 4 },
  okRev, (o, c) => o.approved && c.join() === 'work:e4b,general:e4b#1,arch:e4b#1,final:e4b#1')
await scenario('effort (build): explicit args override the level', RB, { id: 'eo', base: 'main', brief: 'b', effort: 1, lenses: ['arch'], max_rounds: 2, final_gate: 'package' },
  blockAll, (o, c) => o.review_rounds === 2 && o.final_gate === 'package' && c.includes('arch:eo#1') && !c.includes('general:eo#1'))
await scenario('effort (build): the level reaches the worker and reviewer prompts', RB, { id: 'ep', base: 'main', brief: 'b', effort: 3 },
  (l, p) => { globalThis.ep = { ...globalThis.ep, [l]: p }; return l.startsWith('work:') ? work(branchOf(p)) : review(true) },
  () => /\{\{effort\}\} = 3/.test(globalThis.ep['work:ep']) && /\{\{effort\}\} = 3/.test(globalThis.ep['general:ep#1']) && /\{\{block_on\}\} = material/.test(globalThis.ep['general:ep#1']))
await rejects('build: missing effort rejected', RB, { id: 'em', base: 'main', brief: 'b', effort: undefined }, /effort/)
await rejects('build: invalid effort rejected', RB, { id: 'ei', base: 'main', brief: 'b', effort: 5 }, /effort/)
await rejects('build: string effort rejected', RB, { id: 'es', base: 'main', brief: 'b', effort: 'high' }, /effort/)
await rejects('gate: missing effort rejected', AG, { branch: 'feat', areas, effort: undefined }, /effort/)
await rejects('gate: invalid effort rejected', AG, { branch: 'feat', areas, effort: 0 }, /effort/)
const fixScript = (l, p) => {
  if (l.startsWith('test:')) return { area: 'a', actions: 1, works: [], findings: [], verdict: 'ok' }
  if (l === 'triage#1') { globalThis.tp = p; return { confirmed: [{ id: 'F1', title: 't', severity: 'major', reproduced: true, root_cause: 'x', repro: 'r' }], rejected: [], fix_packages: [{ id: 'p1', finding_ids: ['F1'], owned_files: ['a.py'], plan: 'p' }], issues_to_file: [], gate_passed: false } }
  if (l.startsWith('triage')) return { confirmed: [], rejected: [], fix_packages: [], issues_to_file: [], gate_passed: true }
  if (l.startsWith('work:')) return work(branchOf(p))
  if (l.startsWith('integrate:')) return { branch: branchOf(p), head_sha: 'h', merged: [], full_suite: { passed: 1, failed: 0, errors: 0, skipped: 0 }, summary: 's' }
  return review(true)
}
await scenario('effort 1 (gate): one live run, no fixes, no reviewers', AG, { branch: 'feat', areas: [areas[0]], effort: 1 },
  fixScript, (o, c) => !o.gate_passed && o.rounds.length === 1 && !c.some(x => /^(work|general|arch|final|integrate)/.test(x)))
await scenario('effort 2 (gate): fix reviewed by one lens only, no final gate on the fix or the integration', AG, { branch: 'feat', areas: [areas[0]], effort: 2 },
  fixScript, (o, c) => o.gate_passed && c.includes('general:r1-p1#1') && !c.includes('arch:r1-p1#1') && !c.some(x => x.startsWith('final:')) && /\{\{effort\}\} = 2/.test(globalThis.tp))
await scenario('effort 3 (gate): configured lenses, no final gate on the fix', AG, { branch: 'feat', areas: [areas[0]], effort: 3 },
  fixScript, (o, c) => o.gate_passed && c.includes('arch:r1-p1#1') && !c.includes('final:r1-p1#1'))
await scenario('effort 4 (gate): fix packages get the final gate', AG, { branch: 'feat', areas: [areas[0]], effort: 4 },
  fixScript, (o, c) => o.gate_passed && c.includes('final:r1-p1#1') && c.includes('final:int-r1#1'))
await scenario('effort 4 (gate): 4 review rounds per fix', AG, { branch: 'feat', areas: [areas[0]], effort: 4 },
  (l, p) => l.startsWith('test:') || l.startsWith('triage') || l.startsWith('work:') ? fixScript(l, p) : review(false),
  (o, c) => c.filter(x => /^arch:r1-p1#/.test(x)).length === 4)
