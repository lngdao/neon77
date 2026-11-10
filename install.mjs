#!/usr/bin/env node
// neon77 installer for the theme and the status line (the mod itself installs with
// `claude plugin install neon77 --marketplace lngdao/neon77`).
// Plain Node (>= 18), no dependencies: the same command on Windows, Linux and macOS.
//
//   node install.mjs                  theme + status line
//   node install.mjs --no-theme       status line only
//   node install.mjs --no-statusline  theme only
//   node install.mjs --uninstall      take both back out
//   node install.mjs --dry-run        say what would change, change nothing

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FLAGS = ['--no-theme', '--no-statusline', '--uninstall', '--dry-run', '--help', '-h']
const args = process.argv.slice(2)
const unknown = args.filter((a) => !FLAGS.includes(a))
if (unknown.length || args.includes('--help') || args.includes('-h')) {
  const usage = 'usage: node install.mjs [--no-theme] [--no-statusline] [--uninstall] [--dry-run]'
  if (unknown.length) console.error(`unknown option: ${unknown.join(' ')}\n${usage}`)
  else console.log(usage)
  process.exit(unknown.length ? 2 : 0)
}

const has = (flag) => args.includes(flag)
const dryRun = has('--dry-run')
const uninstall = has('--uninstall')
const doTheme = !has('--no-theme')
const doStatus = !has('--no-statusline')

const THEME_ID = 'custom:neon77'
const repo = path.dirname(fileURLToPath(import.meta.url))
const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
const settingsFile = path.join(configDir, 'settings.json')
const themeDest = path.join(configDir, 'themes', 'neon77.json')
const statusDest = path.join(configDir, 'neon77', 'statusline.mjs')
// forward slashes: one spelling that Git Bash, PowerShell, sh and zsh all accept
const statusCommand = `node "${statusDest.replace(/\\/g, '/')}"`

const say = (text) => console.log(`${dryRun ? '[dry-run] ' : ''}${text}`)
const samePath = (a, b) => {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b)
  } catch {
    return false
  }
}
const isOurs = (statusLine) => typeof statusLine?.command === 'string' && /neon77[\\/]statusline\.mjs/.test(statusLine.command)

function copy(from, to) {
  if (samePath(from, to)) return say(`already in place: ${to}`)
  say(`copy ${path.relative(repo, from)} -> ${to}`)
  if (dryRun) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

function remove(file) {
  if (!fs.existsSync(file)) return
  // a clone that lives at <config>/neon77 holds the script itself: leave the repository alone
  if (samePath(file, path.join(repo, path.basename(file)))) return say(`kept (part of this clone): ${file}`)
  say(`remove ${file}`)
  if (!dryRun) fs.rmSync(file)
}

let settings = {}
let hadSettings = false
if (fs.existsSync(settingsFile)) {
  hadSettings = true
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  } catch (error) {
    console.error(`${settingsFile} is not valid JSON (${error.message}); nothing was changed.`)
    process.exit(1)
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    console.error(`${settingsFile} does not hold a JSON object; nothing was changed.`)
    process.exit(1)
  }
}
const before = JSON.stringify(settings)

if (uninstall) {
  if (doTheme) {
    remove(themeDest)
    if (settings.theme === THEME_ID) {
      settings.theme = 'dark' // neon77's base theme
      say('settings: theme -> "dark"')
    }
  }
  if (doStatus) {
    remove(statusDest)
    if (isOurs(settings.statusLine)) {
      delete settings.statusLine
      say('settings: statusLine removed')
    }
  }
} else {
  if (doTheme) {
    copy(path.join(repo, 'themes', 'neon77.json'), themeDest)
    if (settings.theme !== THEME_ID) {
      say(`settings: theme ${JSON.stringify(settings.theme ?? null)} -> "${THEME_ID}"`)
      settings.theme = THEME_ID
    }
  }
  if (doStatus) {
    copy(path.join(repo, 'statusline.mjs'), statusDest)
    if (settings.statusLine && !isOurs(settings.statusLine)) say('settings: replacing the existing statusLine (it stays in the backup)')
    const next = { type: 'command', command: statusCommand, padding: 0 }
    if (JSON.stringify(settings.statusLine) !== JSON.stringify(next)) {
      say(`settings: statusLine -> ${statusCommand}`)
      settings.statusLine = next
    }
  }
}

if (JSON.stringify(settings) === before) {
  say('settings.json already up to date')
} else if (!dryRun) {
  fs.mkdirSync(configDir, { recursive: true })
  if (hadSettings) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = `${settingsFile}.neon77-backup-${stamp}`
    fs.copyFileSync(settingsFile, backup)
    say(`backup: ${backup}`)
  }
  fs.writeFileSync(settingsFile, `${JSON.stringify(settings, null, 2)}\n`)
  say(`wrote ${settingsFile}`)
}

say(uninstall ? 'done. Restart Claude Code.' : 'done. Restart Claude Code to pick up the theme folder and the status line.')
