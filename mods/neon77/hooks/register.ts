// neon77: a cyberpunk ASCII cat above the prompt, driven by real session state.
//
// session.start   boot sequence, load settings, start the animation scheduler
// turn.start      THINKING; sample a spinner verb for the turn
// tool.call       TOOL while the tool runs; ERROR flash when it fails
// turn.complete   SUCCESS dance, then IDLE; read the context window
// prompt.submit   wake from sleep
// ui.render       AbovePrompt band (cat + readout), Spinner and TurnDuration rewrites
// command.run     /neon77 on|off|calm|normal|hyper|pet
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

import type { Register, EngineInterface, Timer } from 'claude-code'

type State = 'BOOT' | 'IDLE' | 'SLEEP' | 'DEEP_SLEEP' | 'THINKING' | 'TOOL' | 'SUCCESS' | 'ERROR'
type Intensity = 'calm' | 'normal' | 'hyper'

// ---------- art ----------

const EARS = '|\\__/,|'
const TAIL: ReadonlyArray<readonly [string, string]> = [
  ['(`\\', ') )'],
  ['/`)', '( ('],
]
const KEYS = ['▓▒░', '▒░▓', '░▓▒']
const RAIN_GLYPHS = 'ｱｶｻﾀﾅﾊﾏﾔﾗﾜﾝｷｼﾁﾆﾋﾐﾘｳｸｽﾂﾇﾌﾑﾕﾙ0123456789abcdef'
const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const GLITCH = '▓▒░#%@&$'

type Cat = { eyes: string; mouth: string; tail: number; keys?: number; shift?: number; alert?: string; glitch?: boolean; sleepZ?: string }

function catRows(c: Cat, rand: () => number): string[] {
  const [t0, t1] = (TAIL[c.tail % TAIL.length] ?? TAIL[0]) as readonly [string, string]
  const pad = ' '.repeat(Math.max(0, c.shift ?? 0))
  const head = c.alert ? c.alert.padStart(4).slice(-4) : '    '
  const r0 = `${head}${EARS}   ${t0}${c.sleepZ ? '  ' + c.sleepZ : ''}`
  const r1 = `  _.|${c.eyes}${c.mouth}|_   ${t1}`
  const r2 = c.keys === undefined ? '-(((---(((--------' : `-(((${KEYS[c.keys % KEYS.length] ?? '▓▒░'}(((--------`
  let rows = [pad + r0, pad + r1, pad + r2]
  if (c.glitch) {
    rows = rows.map((row, i) => {
      let out = row.split('')
      for (let k = 0; k < 2; k++) {
        const at = Math.floor(rand() * out.length)
        if (out[at] !== ' ') out[at] = GLITCH[Math.floor(rand() * GLITCH.length)] ?? '▓'
      }
      const s = i === 1 ? '' : rand() < 0.5 ? ' ' : ''
      return s + out.join('')
    })
  }
  return rows
}

// ---------- words ----------

const VERBS = ['Jacking in', 'Breaching ICE', 'Decrypting', 'Compiling daemons', 'Overclocking', 'Scanning the grid', 'Rerouting power', 'Patching the matrix', 'Negotiating with the mainframe', 'Hotwiring', 'Spoofing', 'Bypassing firewall', 'Syncing neural link', 'Defragging reality', 'Rendering Night City', 'Hacking the gibson', 'Reading the chrome', 'Charging capacitors', 'Tuning the deck', 'Ghosting']
const PAST = ['Jacked in', 'ICE breached', 'Decrypted', 'Daemons compiled', 'Overclocked', 'Grid scanned', 'Power rerouted', 'Matrix patched', 'Mainframe negotiated', 'Hotwired', 'Spoofed', 'Firewall bypassed', 'Neural link synced', 'Reality defragged', 'Night City rendered', 'Gibson hacked', 'Chrome read', 'Capacitors charged', 'Deck tuned', 'Ghosted']

const IDLE_LINES = ['the net is quiet tonight', 'rain again. always rain.', 'ice cold out there, choom', 'bạn ổn chứ?', 'scanning... nothing hostile', 'neon never sleeps', "coffee's synthetic. still good.", 'I dream in hex', '2077 and still no flying cats', 'your cursor is blinking at me', 'night city hums', "type something, I'm bored", 'chrome shines, hearts rust', "wake me when it's interesting", 'the grid remembers everything', 'hôm nay code gì đấy?']
const SUCCESS_LINES = ['clean run. no ICE tripped.', 'daemon compiled, ship it', 'zero casualties, choom', 'link closed. nice work.', "that's a wrap, netrunner", 'xong rồi, đẹp đấy', 'ICE melted like butter', 'data secured']
const ERROR_LINES = ['ICE bit back', 'signal lost... reconnecting', 'ouch. that one hurt.', 'daemon crashed, respawning', 'glitch in the matrix', 'lỗi rồi, thử lại đi']
const BOOT_LINES = ['BOOTING NEURAL INTERFACE...', 'LOADING PERSONALITY MATRIX... OK', 'LINK ESTABLISHED', '> hello, choom.']

type IdleAction = { name: string; frames: Cat[]; line?: string; ms?: number }
const IDLE_ACTIONS: IdleAction[] = [
  { name: 'blink', frames: [{ eyes: '- -', mouth: '  ', tail: 0 }, { eyes: 'o o', mouth: '  ', tail: 0 }], ms: 150 },
  { name: 'look-left', frames: [{ eyes: '< <', mouth: '  ', tail: 0 }] },
  { name: 'look-right', frames: [{ eyes: '> >', mouth: '  ', tail: 1 }] },
  { name: 'tail', frames: [{ eyes: 'o o', mouth: '  ', tail: 1 }, { eyes: 'o o', mouth: '  ', tail: 0 }], ms: 300 },
  { name: 'groom', frames: [{ eyes: '- -', mouth: ' ω', tail: 0 }], line: 'grooming the chrome' },
  { name: 'coffee', frames: [{ eyes: 'o o', mouth: 'c[', tail: 0 }], line: 'sipping synth-coffee' },
  { name: 'rain', frames: [{ eyes: '> >', mouth: '  ', tail: 0 }], line: 'watching the rain' },
  { name: 'doomscroll', frames: [{ eyes: '[=]', mouth: '  ', tail: 0 }], line: 'scrolling the net' },
  { name: 'yawn', frames: [{ eyes: 'O O', mouth: '  ', tail: 0 }, { eyes: '- -', mouth: '  ', tail: 0 }], ms: 400 },
  { name: 'stretch', frames: [{ eyes: 'o o', mouth: '  ', tail: 1, shift: 1 }, { eyes: 'o o', mouth: '  ', tail: 0 }], ms: 300 },
  { name: 'purr', frames: [{ eyes: '^ ^', mouth: '  ', tail: 0 }], line: 'prrrr' },
]

function toolLabel(tool: string): string {
  switch (tool) {
    case 'Bash': return 'jacking into shell'
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return 'rewriting reality'
    case 'Read': case 'Grep': case 'Glob': return 'scanning sectors'
    case 'Agent': return 'deploying netrunner'
    case 'WebFetch': case 'WebSearch': return 'surfing the net'
    default: return `running daemon ${tool}`
  }
}

// ---------- state ----------

let state: State = 'BOOT'
let danger = false
let petOn = true
let intensity: Intensity = 'normal'
let pending: Timer | null = null
let frame = 0
let frameCat: Cat = { eyes: 'o o', mouth: '  ', tail: 0 }
let line = ''
let bootStep = 0
let lastInputAt = 0
let turnStartedAt = 0
let toolsThisTurn = 0
let currentTool = ''
let netrunners = 0
let verb: string = VERBS[0] as string
let rain = ''
let ctxPercent = 0
let lastTokens = 0
let lastTurn: { tokens: number; tools: number; seconds: number } | null = null
let revertTo: State = 'IDLE'
let actionIdx = 0
let actionFrame = 0
let drone = -1

const rand = () => Math.random()
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T
const mult = () => (intensity === 'calm' ? 2 : intensity === 'hyper' ? 0.5 : 1)

function setState(next: State) {
  state = next
  frame = 0
  actionFrame = 0
  if (next === 'IDLE') { frameCat = { eyes: 'o o', mouth: '  ', tail: 0 }; if (!line) line = pick(IDLE_LINES) }
  if (next === 'SUCCESS') { line = pick(SUCCESS_LINES); frameCat = { eyes: '^ ^', mouth: '  ', tail: 0 } }
  if (next === 'ERROR') { line = pick(ERROR_LINES); frameCat = { eyes: 'x x', mouth: '  ', tail: 0, glitch: true, alert: ' !!' } }
  if (next === 'THINKING') { line = pick(['decrypting', 'crunching', 'tracing routes', 'reading the chrome']); frameCat = { eyes: '@ @', mouth: '  ', tail: 0, keys: 0 } }
  if (next === 'TOOL') { line = toolLabel(currentTool); frameCat = { eyes: 'o o', mouth: '  ', tail: 1, keys: 1 } }
}

function shiftRain() {
  const g = RAIN_GLYPHS[Math.floor(rand() * RAIN_GLYPHS.length)] ?? 'ｱ'
  rain = (g + rain).slice(0, 8)
}

// One tick: advance the frame for the current state, then schedule the next.
function tick($: EngineInterface) {
  pending = null
  frame++
  shiftRain()
  let delay = 3000
  switch (state) {
    case 'BOOT': {
      frameCat = { eyes: bootStep < 2 ? '- -' : 'o o', mouth: '  ', tail: 0 }
      line = BOOT_LINES[Math.min(bootStep, BOOT_LINES.length - 1)] ?? ''
      bootStep++
      delay = 500
      if (bootStep > BOOT_LINES.length) { line = pick(IDLE_LINES); setState('IDLE'); delay = 1500 }
      break
    }
    case 'IDLE': {
      const now = Date.now()
      if (lastInputAt && now - lastInputAt > 600_000) { setState('DEEP_SLEEP'); delay = 100; break }
      if (lastInputAt && now - lastInputAt > 120_000) { setState('SLEEP'); delay = 100; break }
      if (drone >= 0) {
        drone--
        frameCat = { eyes: 'O O', mouth: '  ', tail: 0, alert: drone === 2 ? '-=o' : '' }
        line = drone >= 0 ? `drone passing ${'·'.repeat(drone)}` : line
        delay = 150
        break
      }
      if (actionFrame === 0) {
        const r = rand()
        if (r < 0.01) { drone = 5; delay = 150; break }
        if (r < 0.02) { frameCat = { eyes: 'o o', mouth: '  ', tail: 0, alert: 'WANT' }; line = 'WANTED: netrunner, 2 lives'; delay = 400; break }
        if (r < 0.03) { frameCat = { eyes: 'x x', mouth: '  ', tail: 0, glitch: true }; line = 'NO SIGNAL'; delay = 300; break }
        actionIdx = Math.floor(rand() * IDLE_ACTIONS.length)
      }
      const a = (IDLE_ACTIONS[actionIdx] ?? IDLE_ACTIONS[0]) as IdleAction
      frameCat = (a.frames[Math.min(actionFrame, a.frames.length - 1)] ?? a.frames[0]) as Cat
      if (actionFrame === 0 && a.line) line = a.line
      else if (actionFrame === 0 && rand() < 0.25) line = pick(IDLE_LINES)
      actionFrame++
      if (actionFrame < a.frames.length) delay = a.ms ?? 200
      else { actionFrame = 0; delay = 3000 + rand() * 2000 }
      break
    }
    case 'SLEEP':
    case 'DEEP_SLEEP': {
      const z = ['z', 'Z', 'zZ'][frame % 3] as string
      frameCat = { eyes: '- -', mouth: '  ', tail: 0, sleepZ: z }
      line = state === 'SLEEP' ? 'sleeping... (type to wake)' : 'deep sleep · the grid dreams'
      delay = 2000
      break
    }
    case 'THINKING':
    case 'TOOL': {
      frameCat = { eyes: frame % 2 ? '@ @' : 'o o', mouth: '  ', tail: frame % 4 < 2 ? 0 : 1, keys: frame }
      if (state === 'TOOL' && currentTool === 'Agent') frameCat = { ...frameCat, alert: ['-=o', '=o=', 'o=-', '   '][frame % 4] as string }
      delay = 250
      break
    }
    case 'SUCCESS': {
      frameCat = { eyes: '^ ^', mouth: '  ', tail: frame % 2, shift: frame % 2 }
      delay = 250
      if (frame >= 8) { setState('IDLE'); delay = 500 }
      break
    }
    case 'ERROR': {
      frameCat = { eyes: 'x x', mouth: '  ', tail: frame % 2, glitch: true, alert: ' !!' }
      delay = 250
      if (frame >= 6) { setState(revertTo); delay = 250 }
      break
    }
  }
  if (danger && (state === 'IDLE' || state === 'SLEEP' || state === 'DEEP_SLEEP')) frameCat = { ...frameCat, eyes: 'O O', mouth: ' ;' }
  $.ui.invalidate('ui.render')
  schedule($, delay * mult())
}

function schedule($: EngineInterface, ms: number) {
  if (pending) pending.cancel()
  if (!petOn) return
  pending = $.clock.after(Math.max(60, Math.round(ms)), () => tick($))
}

function bump($: EngineInterface) {
  // state changed: redraw now and restart the scheduler on the new state's cadence
  $.ui.invalidate('ui.render')
  schedule($, 1)
}

async function readContext($: EngineInterface) {
  try {
    const { context } = await $.session.usage()
    if (!context || !context.window) return
    const tokens = context.tokens ?? 0
    ctxPercent = Math.round(context.percent ?? (tokens / context.window) * 100)
    if (lastTurn && lastTokens) lastTurn.tokens = tokens - lastTokens
    lastTokens = tokens
    if (ctxPercent >= 85) danger = true
    else if (ctxPercent < 80) danger = false
  } catch {
    // keep the last reading
  }
}

async function loadSettings($: EngineInterface) {
  try {
    const on = await $.store.get('petOn')
    if (typeof on === 'boolean') petOn = on
    const i = await $.store.get('intensity')
    if (i === 'calm' || i === 'normal' || i === 'hyper') intensity = i
  } catch {
    // defaults
  }
}

function short(n: number) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (x: number) => String(x).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

let sessionStartedAt = 0

// ---------- hooks ----------

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    try {
      sessionStartedAt = Date.now()
      lastInputAt = Date.now()
      await loadSettings($)
      await $.command.register({ name: 'neon77', description: 'neon77 companion: on | off | calm | normal | hyper | pet', argumentHint: 'on|off|calm|normal|hyper|pet' })
      await readContext($)
      bootStep = 0
      setState('BOOT')
      bump($)
    } catch {
      // the band simply stays empty
    }
    return result
  })

  on('command.run', { command: 'neon77' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      petOn = arg === 'on'
      await $.store.set('petOn', petOn)
      if (petOn) { setState('IDLE'); bump($) } else { if (pending) pending.cancel(); pending = null; $.ui.invalidate('ui.render') }
      return { text: petOn ? 'neon77: companion online.' : 'neon77: companion offline. /neon77 on to wake it.' }
    }
    if (arg === 'calm' || arg === 'normal' || arg === 'hyper') {
      intensity = arg
      await $.store.set('intensity', intensity)
      bump($)
      return { text: `neon77: intensity ${intensity}.` }
    }
    if (arg === 'pet') {
      if (state === 'IDLE' || state === 'SLEEP' || state === 'DEEP_SLEEP') { lastInputAt = Date.now(); setState('IDLE'); actionFrame = 0; bump($) }
      line = pick(IDLE_LINES)
      $.ui.toast('prrrr', { timeoutMs: 1500 })
      return { text: 'neon77: *purrs*' }
    }
    return {
      text: [
        'neon77 — cyberpunk companion',
        `state: ${state}${danger ? ' +DANGER' : ''} · pet: ${petOn ? 'on' : 'off'} · intensity: ${intensity}`,
        'usage: /neon77 on | off | calm | normal | hyper | pet',
      ].join('\n'),
    }
  })

  on('prompt.submit', ($, e, next) => {
    lastInputAt = Date.now()
    if (state === 'SLEEP' || state === 'DEEP_SLEEP') { setState('IDLE'); bump($) }
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (!e.agentId) {
      turnStartedAt = Date.now()
      toolsThisTurn = 0
      verb = pick(VERBS)
      setState('THINKING')
      bump($)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) return next(e)
    toolsThisTurn++
    currentTool = String(e.tool)
    const wasTurn = state === 'THINKING' || state === 'TOOL' || state === 'ERROR'
    if (wasTurn) { setState('TOOL'); bump($) }
    const ran = await next(e)
    try {
      const failed = ran.deny !== undefined || ran.isError === true
      if (failed) { revertTo = 'THINKING'; setState('ERROR'); bump($) }
      else if (state === 'TOOL') { setState('THINKING'); bump($) }
    } catch {
      // never let the cat break a tool call
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId) { netrunners++; return result }
      const seconds = Math.round((Date.now() - turnStartedAt) / 1000)
      lastTurn = { tokens: 0, tools: toolsThisTurn, seconds }
      await readContext($)
      lastInputAt = Date.now()
      if (e.reason === 'error' || e.reason === 'refusal') { revertTo = 'IDLE'; setState('ERROR') }
      else setState('SUCCESS')
      bump($)
      if (seconds > 60) $.ui.toast(`that took ${seconds}s, choom.`)
    } catch {
      // keep going
    }
    return result
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.message) return next(e)
    return next({ ...e, props: { ...e.props, word: verb, suffix: ' ▓▒░' } })
  })

  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const i = VERBS.indexOf(verb)
    return next({ ...e, props: { ...e.props, word: PAST[i >= 0 ? i : 0] ?? 'Jacked in' } })
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !petOn) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns ?? 80
    const rows = catRows(frameCat, rand)
    const catColor = danger ? 'error' : state === 'ERROR' ? 'error' : state === 'SUCCESS' ? 'success' : 'claude'
    const valColor = danger ? 'error' : ctxPercent >= 70 ? 'warning' : 'suggestion'
    const lineColor = state === 'ERROR' ? 'error' : state === 'SUCCESS' ? 'success' : 'text'

    const readout0 = cols >= 45
      ? [
          Text({ color: 'inactive', children: ' ░▒▓ NEURAL LINK ' }),
          Text({ color: valColor, bold: true, children: `${ctxPercent}%` }),
          Text({ color: 'inactive', children: ' ▓▒░  ICE ' }),
          Text({ color: valColor, children: String(toolsThisTurn).padStart(2, '0') }),
          ...(cols >= 70
            ? [
                Text({ color: 'inactive', children: '  UP ' }),
                Text({ color: 'text', children: hms(Date.now() - sessionStartedAt) }),
                Text({ color: 'inactive', children: '   ' }),
                Text({ color: state === 'THINKING' || state === 'TOOL' ? 'claude' : 'subtle', children: rain }),
              ]
            : []),
        ]
      : []
    const prefix = danger ? 'COMPACT IMMINENT · ' : ''
    const spin = state === 'THINKING' || state === 'TOOL' ? ` ${SPIN[frame % SPIN.length] ?? ''}` : ''
    const readout1 = [Text({ color: 'inactive', children: ' > ' }), Text({ color: lineColor, children: `${prefix}${line}${spin}` })]
    const readout2 = cols >= 70
      ? state === 'DEEP_SLEEP'
        ? [Text({ color: 'subtle', children: ' ' + Array.from({ length: Math.min(40, cols - 22) }, () => RAIN_GLYPHS[Math.floor(rand() * RAIN_GLYPHS.length)] ?? '0').join('') })]
        : lastTurn
          ? [Text({ color: 'inactive', children: ` last turn ${lastTurn.tokens ? `${lastTurn.tokens > 0 ? '+' : ''}${short(lastTurn.tokens)} tok · ` : ''}${lastTurn.tools} tools · ${lastTurn.seconds}s` })]
          : [Text({ color: 'inactive', children: ` ${pick(['night city · 2077', 'neural link stable', 'no ICE detected'])}` })]
      : []

    const row = (cat: string, rest: ReturnType<typeof Text>[]) =>
      Box({ flexDirection: 'row', children: [Text({ color: catColor, children: cat.padEnd(19) }), ...rest] })

    return Box({ flexDirection: 'column', paddingX: 1, children: [row(rows[0] ?? '', readout0), row(rows[1] ?? '', readout1), row(rows[2] ?? '', readout2)] })
  })
}
