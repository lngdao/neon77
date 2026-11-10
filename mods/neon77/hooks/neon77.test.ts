import { test, expect, mock } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'neon77',
  surface: 'terminal',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 9 }, view: {} },
} as const


// The engine beneath the plugins, answered by the test.
function engine(on: On) {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: (e as { answer?: string }).answer ?? '' }))
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 20_000, window: 200_000, percent: 10 }, rateLimits: [] } }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.render', { component: 'Spinner' }, ($, e) => $.ui.resolve(e).Text({ children: [e.props.word] }))
  on('ui.render', { component: 'TurnDuration' }, ($, e) => $.ui.resolve(e).Text({ children: [e.props.word] }))
}

const TOOL_OK = { result: { stdout: '', stderr: '', interrupted: false, isImage: false } }

test('band draws the cat and readout, and follows a turn', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  engine(on)
  on('tool.call', { tool: 'Bash' }, () => TOOL_OK as never)
  on('tool.call', { tool: 'Edit' }, () => ({ deny: 'nope' }))

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount(BAND)

  // boot: cat body and a boot line (the first tick draws it)
  await clock.advance(100)
  expect(await ui.find({ type: 'Text', text: /\|\\__\/,\|/ }), 'check 1').toBeDefined()
  expect(await ui.find({ type: 'Text', text: /NEURAL LINK/ }), 'check 2').toBeDefined()
  expect(await ui.find({ type: 'Text', text: /BOOTING|LOADING|LINK ESTABLISHED|hello, choom/ }), 'check 3').toBeDefined()

  // boot sequence ends in idle
  await clock.advance(4000)
  expect(await ui.find({ type: 'Text', text: /BOOTING/ }), 'check 4').toBeUndefined()

  // a turn starts: thinking words
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(await ui.find({ type: 'Text', text: /decrypting|crunching|tracing routes|reading the chrome/ }), 'check 5').toBeDefined()

  // a tool runs: tool label while it runs, then back to thinking
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(await ui.find({ type: 'Text', text: /^01$/ }), 'check 6: one tool counted').toBeDefined()

  // a failing tool: error line
  await $.tool.call({ tool: 'Edit', file_path: '/tmp/x', old_string: 'a', new_string: 'b' })
  expect(await ui.find({ type: 'Text', text: /ICE bit back|signal lost|ouch|daemon crashed|glitch in the matrix|lỗi rồi/ }), 'check 7').toBeDefined()

  // the turn completes: success line
  await $.turn.complete({ answer: 'ok', durationMs: 100, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  expect(await ui.find({ type: 'Text', text: /clean run|daemon compiled|zero casualties|link closed|wrap, netrunner|xong rồi|ICE melted|data secured/ }), 'check 8').toBeDefined()
  expect(await ui.find({ type: 'Text', text: /2 tools/ }), 'check 9').toBeDefined()
})

test('narrow band keeps the cat and the line only', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, requestId: 'narrow', props: { ...BAND.props, bodyColumns: 40 } })
  expect(await ui.find({ type: 'Text', text: /\|\\__\/,\|/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /NEURAL LINK/ })).toBeUndefined()
})

test('spinner word is rewritten to a cyberpunk verb', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  engine(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't2' })
  const drawn = await $.ui.render({ surface: 'terminal', component: 'Spinner', requestId: 'spin', props: { word: 'Baking', message: null, suffix: '…', mode: 'thinking' } })
  expect(drawn).toBeDefined()
})
