import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function sandbox(t, settings) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon77-install-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')
  if (settings !== undefined) fs.writeFileSync(file, typeof settings === 'string' ? settings : JSON.stringify(settings))
  const run = (...flags) => spawnSync(process.execPath, [path.join(repo, 'install.mjs'), ...flags], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, encoding: 'utf8' })
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8'))
  const backups = () => fs.readdirSync(dir).filter((name) => name.startsWith('settings.json.neon77-backup-'))
  return { dir, file, run, read, backups }
}

test('installs the theme and status line, keeps other keys, backs up, and is idempotent', (t) => {
  const box = sandbox(t, { theme: 'dark', env: { KEEP: 'me' }, statusLine: { type: 'command', command: 'old.sh' } })
  const ran = box.run()
  assert.equal(ran.status, 0, ran.stderr)

  const settings = box.read()
  assert.equal(settings.theme, 'custom:neon77')
  assert.deepEqual(settings.env, { KEEP: 'me' })
  assert.equal(settings.statusLine.type, 'command')
  assert.equal(settings.statusLine.padding, 0)
  assert.match(settings.statusLine.command, /^node ".*\/neon77\/statusline\.mjs"$/)
  assert.ok(!settings.statusLine.command.includes('\\'), 'forward slashes only')
  assert.ok(fs.existsSync(path.join(box.dir, 'themes', 'neon77.json')))
  assert.equal(box.backups().length, 1)
  assert.equal(JSON.parse(fs.readFileSync(path.join(box.dir, box.backups()[0]), 'utf8')).statusLine.command, 'old.sh')

  // the installed copy runs on its own
  const script = settings.statusLine.command.match(/"(.*)"/)[1]
  const line = spawnSync(process.execPath, [script], { input: '{}', encoding: 'utf8' })
  assert.equal(line.status, 0)
  assert.match(line.stdout, /NIGHT CITY/)

  const again = box.run()
  assert.equal(again.status, 0)
  assert.match(again.stdout, /already up to date/)
  assert.equal(box.backups().length, 1)
})

test('works with no settings.json yet, and honours --no-theme', (t) => {
  const box = sandbox(t)
  assert.equal(box.run('--no-theme').status, 0)
  const settings = box.read()
  assert.equal(settings.theme, undefined)
  assert.ok(settings.statusLine)
  assert.ok(!fs.existsSync(path.join(box.dir, 'themes', 'neon77.json')))
  assert.equal(box.backups().length, 0)
})

test('--dry-run changes nothing', (t) => {
  const box = sandbox(t, { theme: 'dark' })
  const ran = box.run('--dry-run')
  assert.equal(ran.status, 0)
  assert.match(ran.stdout, /\[dry-run\]/)
  assert.deepEqual(box.read(), { theme: 'dark' })
  assert.deepEqual(fs.readdirSync(box.dir), ['settings.json'])
})

test('--uninstall takes both back out and leaves a foreign status line alone', (t) => {
  const box = sandbox(t, { theme: 'dark', model: 'x' })
  box.run()
  assert.equal(box.run('--uninstall').status, 0)
  assert.deepEqual(box.read(), { theme: 'dark', model: 'x' })
  assert.ok(!fs.existsSync(path.join(box.dir, 'themes', 'neon77.json')))
  assert.ok(!fs.existsSync(path.join(box.dir, 'neon77', 'statusline.mjs')))

  const other = sandbox(t, { statusLine: { type: 'command', command: 'mine.sh' } })
  assert.equal(other.run('--uninstall').status, 0)
  assert.equal(other.read().statusLine.command, 'mine.sh')
})

test('refuses a settings.json that is not valid JSON, and unknown options', (t) => {
  const box = sandbox(t, '{ broken')
  const ran = box.run()
  assert.equal(ran.status, 1)
  assert.match(ran.stderr, /not valid JSON/)
  assert.equal(fs.readFileSync(box.file, 'utf8'), '{ broken')
  assert.equal(box.run('--nope').status, 2)
})
