#!/usr/bin/env node
// neon77 status line for Claude Code. Reads the session JSON on stdin, prints two lines.
// Plain Node (>= 18) with no dependencies, so the same file runs on Windows, Linux and macOS.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// palette (truecolor), matching themes/neon77.json
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`
const PINK = rgb(255, 42, 109)
const CYAN = rgb(5, 217, 232)
const YEL = rgb(249, 240, 2)
const PURP = rgb(211, 0, 197)
const GRN = rgb(0, 255, 159)
const DIM = rgb(107, 122, 153)
const RED = rgb(255, 56, 100)
const TXT = rgb(230, 230, 240)
const R = '\x1b[0m'
const B = '\x1b[1m'
const SEP = `${PURP}▓${R}`

const GIT_CACHE_MS = 5000
const CELLS = 12

const num = (value, fallback = 0) => {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}
const pad2 = (n) => String(n).padStart(2, '0')

// `git status --porcelain --branch` output -> { branch, staged, modified }
export function parseGitStatus(out) {
  const lines = out.split(/\r?\n/).filter(Boolean)
  let branch = ''
  if (lines[0]?.startsWith('## ')) {
    const head = lines.shift().slice(3)
    if (head.startsWith('HEAD (no branch)')) branch = 'HEAD'
    else branch = head.replace(/^(No commits yet on|Initial commit on) /, '').split('...')[0].trim()
  }
  let staged = 0
  let modified = 0
  for (const line of lines) {
    if (/^[MADRC]/.test(line)) staged++
    if (/^.[MD]/.test(line)) modified++
  }
  return { branch, staged, modified }
}

// Branch and change counts for `dir`, or null outside a repository. The answer is
// cached for 5 s per directory in the temp folder so a big repository cannot stall the line.
export function gitInfo(dir, now = Date.now()) {
  if (!dir) return null
  try {
    if (!fs.statSync(dir).isDirectory()) return null
  } catch {
    return null
  }
  const key = createHash('md5').update(dir).digest('hex')
  const cacheFile = path.join(os.tmpdir(), `neon77-git-${key}.json`)
  try {
    if (now - fs.statSync(cacheFile).mtimeMs < GIT_CACHE_MS) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  } catch {
    // no cache yet, or an unreadable one: ask git
  }
  let info = null
  try {
    const out = execFileSync('git', ['-C', dir, 'status', '--porcelain', '--branch', '--untracked-files=no'], {
      encoding: 'utf8',
      timeout: 2000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    info = parseGitStatus(out)
  } catch {
    info = null // not a repository, or no git on PATH
  }
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(info))
  } catch {
    // an unwritable temp folder only costs the cache
  }
  return info
}

// The two status lines for one session JSON. `now` and `git` are injectable for tests.
export function render(data, { now = new Date(), git = gitInfo } = {}) {
  const d = data && typeof data === 'object' ? data : {}
  const model = d.model?.display_name || d.model?.id || '?'
  const pct = Math.max(0, Math.trunc(num(d.context_window?.used_percentage)))
  const cost = num(d.cost?.total_cost_usd).toFixed(2)
  const secs = Math.max(0, Math.trunc(num(d.cost?.total_duration_ms) / 1000))
  const uptime = `${pad2(Math.trunc(secs / 3600))}:${pad2(Math.trunc((secs % 3600) / 60))}:${pad2(secs % 60)}`

  const filled = Math.min(CELLS, Math.trunc((pct * CELLS) / 100))
  const bar = '█'.repeat(filled) + '░'.repeat(CELLS - filled)
  const barColor = pct >= 85 ? RED : pct >= 80 ? PINK : pct >= 50 ? YEL : CYAN
  const warn = pct >= 85 ? ` ${B}${RED}COMPACT!${R}` : ''

  const hit = d.prompt_cache?.hit_ratio
  let cache
  if (hit === undefined || hit === null || hit === '') cache = `${DIM}--${R}`
  else if (d.prompt_cache?.warm === true) cache = `${GRN}${Math.round(num(hit) * 100)}%${R}`
  else cache = `${DIM}cold${R}`

  const dir = d.workspace?.current_dir || d.cwd || ''
  let gitText = ` ${DIM}--${R}`
  if (dir) {
    const info = git(dir)
    if (info) {
      gitText = `${CYAN} ${info.branch}${R}`
      if (info.staged > 0) gitText += ` ${GRN}+${info.staged}${R}`
      if (info.modified > 0) gitText += ` ${YEL}~${info.modified}${R}`
    } else {
      gitText = ` ${DIM}no repo${R}`
    }
  }

  const effort = d.effort?.level ? `${PINK}${d.effort.level}${R}` : `${DIM}--${R}`
  const fast = d.fast_mode === true ? `${YEL}on${R}` : `${DIM}off${R}`
  const clock = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`

  const line1 = `${SEP} ${B}${PINK}${model}${R} ${SEP} CTX ${barColor}${bar}${R} ${pct}%${warn} ${SEP} ${GRN}$${cost}${R} ${SEP} ${TXT}${uptime}${R} ${SEP} CACHE ${cache} ${SEP}`
  const line2 = `${SEP}${gitText} ${SEP} EFFORT ${effort} ${SEP} FAST ${fast} ${SEP} ${CYAN}${clock} NIGHT CITY${R} ${SEP}`
  return `${line1}\n${line2}\n`
}

function isMain() {
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (isMain()) {
  let data = {}
  try {
    // some shells (Windows PowerShell) put a byte-order mark in front of piped text
    data = JSON.parse(fs.readFileSync(0, 'utf8').replace(/^﻿/, ''))
  } catch {
    // no stdin, or not JSON: draw the line with placeholders rather than nothing
  }
  process.stdout.write(render(data))
}
