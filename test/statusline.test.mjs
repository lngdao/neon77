import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, parseGitStatus, gitInfo } from '../statusline.mjs'

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const plain = (text) => text.replace(/\x1b\[[0-9;]*m/g, '')
const NOW = new Date(2077, 0, 1, 23, 41)
const SAMPLE = {
  model: { display_name: 'glm-5.1' },
  context_window: { used_percentage: 67.4 },
  cost: { total_cost_usd: 0.4211, total_duration_ms: 2_537_000 },
  prompt_cache: { hit_ratio: 0.91, warm: true },
  effort: { level: 'max' },
  fast_mode: false,
  workspace: { current_dir: '/work' },
}
const draw = (data, git = () => ({ branch: 'main', staged: 3, modified: 2 })) => plain(render(data, { now: NOW, git })).split('\n')

test('draws the two lines of the design', () => {
  const [line1, line2, rest] = draw(SAMPLE)
  assert.equal(line1, '▓ glm-5.1 ▓ CTX ████████░░░░ 67% ▓ $0.42 ▓ 00:42:17 ▓ CACHE 91% ▓')
  assert.equal(line2, '▓ main +3 ~2 ▓ EFFORT max ▓ FAST off ▓ 23:41 NIGHT CITY ▓')
  assert.equal(rest, '')
})

test('context bar thresholds', () => {
  const at = (pct) => draw({ ...SAMPLE, context_window: { used_percentage: pct } })[0]
  assert.match(at(0), /CTX ░{12} 0% ▓/)
  assert.match(at(84), /CTX █{10}░░ 84% ▓/)
  assert.match(at(85), /85% COMPACT! ▓/)
  assert.match(at(140), /CTX █{12} 140% COMPACT!/)
})

test('cache: percent when warm, cold when not, -- when absent', () => {
  const cache = (prompt_cache) => draw({ ...SAMPLE, prompt_cache })[0].match(/CACHE (\S+)/)[1]
  assert.equal(cache({ hit_ratio: 0.5, warm: true }), '50%')
  assert.equal(cache({ hit_ratio: 0.5, warm: false }), 'cold')
  assert.equal(cache(undefined), '--')
})

test('empty or malformed input still draws both lines', () => {
  for (const data of [{}, null, 'nope', { model: 7, cost: { total_cost_usd: 'x' } }]) {
    const [line1, line2] = draw(data)
    assert.equal(line1, '▓ ? ▓ CTX ░░░░░░░░░░░░ 0% ▓ $0.00 ▓ 00:00:00 ▓ CACHE -- ▓')
    assert.equal(line2, '▓ -- ▓ EFFORT -- ▓ FAST off ▓ 23:41 NIGHT CITY ▓')
  }
})

test('outside a repository and with fast mode on', () => {
  const [, line2] = draw({ ...SAMPLE, fast_mode: true, effort: undefined }, () => null)
  assert.equal(line2, '▓ no repo ▓ EFFORT -- ▓ FAST on ▓ 23:41 NIGHT CITY ▓')
})

test('parseGitStatus reads the branch line and counts changes', () => {
  assert.deepEqual(parseGitStatus('## main...origin/main [ahead 1]\nM  a\n M b\nMM c\nA  d\n D e\n'), { branch: 'main', staged: 3, modified: 3 })
  assert.deepEqual(parseGitStatus('## feature/x\r\n'), { branch: 'feature/x', staged: 0, modified: 0 })
  assert.deepEqual(parseGitStatus('## No commits yet on main\n'), { branch: 'main', staged: 0, modified: 0 })
  assert.deepEqual(parseGitStatus('## HEAD (no branch)\n'), { branch: 'HEAD', staged: 0, modified: 0 })
})

test('gitInfo reads a real repository and answers null outside one', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neon77-test-'))
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
  assert.equal(gitInfo(path.join(tmp, 'missing')), null)

  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
  } catch {
    return t.skip('git is not on PATH')
  }
  const work = path.join(tmp, 'work')
  fs.mkdirSync(work)
  const git = (...argv) => execFileSync('git', ['-C', work, ...argv], { stdio: 'ignore' })
  git('init', '-q', '-b', 'neon')
  fs.writeFileSync(path.join(work, 'a.txt'), 'a\n')
  git('add', 'a.txt')
  assert.deepEqual(gitInfo(work), { branch: 'neon', staged: 1, modified: 0 })
  // answered from the 5 s cache: a second staged file is not seen yet
  fs.writeFileSync(path.join(work, 'b.txt'), 'b\n')
  git('add', 'b.txt')
  assert.deepEqual(gitInfo(work), { branch: 'neon', staged: 1, modified: 0 })
  assert.deepEqual(gitInfo(work, Date.now() + 6000), { branch: 'neon', staged: 2, modified: 0 })
})

test('the script reads stdin and prints two lines', () => {
  const ran = spawnSync(process.execPath, [path.join(repo, 'statusline.mjs')], { input: JSON.stringify({ model: { id: 'm' } }), encoding: 'utf8' })
  assert.equal(ran.status, 0)
  const lines = plain(ran.stdout).trimEnd().split('\n')
  assert.equal(lines.length, 2)
  assert.match(lines[0], /^▓ m ▓ CTX /)

  const empty = spawnSync(process.execPath, [path.join(repo, 'statusline.mjs')], { input: '', encoding: 'utf8' })
  assert.equal(empty.status, 0)
  assert.match(plain(empty.stdout), /^▓ \? ▓/)
})
