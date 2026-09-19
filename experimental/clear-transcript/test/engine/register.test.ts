// Runs under `claude plugin test` (function hooks enabled): the plugin is loaded from this folder by the
// engine's own host, and every tree it returns goes through the terminal surface's real validator. There is
// no core beneath a plugin in a test, so each test seats a stand-in that draws the word CORE: seeing CORE
// means the plugin passed the row through to the engine.
import { describe, expect, test } from 'claude-code/testing'

const PLUGIN = 'clear-transcript'
const VIEWPORT = { columns: 100, rows: 40, isFullscreen: true }

// The first screen of a real reply (test/fixtures/replies/structured-partner.md), three heading levels.
const REPLY = [
  '# B-tree vs hash indexes',
  '',
  '**Short version:** a B-tree keeps keys in sorted order, so it handles equality, ranges and prefixes. **Default to B-tree.**',
  '',
  '## How a B-tree index works',
  '',
  '### Mental model',
  '',
  'Think of a phone book with a thumb index. You jump to a section, then a page, then a line.',
  '',
  '### Structure (technically a B+tree)',
  '',
  '- **Internal nodes** hold sorted separator keys and pointers to child pages.',
  '- **Leaf nodes** hold the actual index entries.',
  '',
  '```sql',
  '## not a heading: this line is code',
  'CREATE INDEX idx ON t (a);',
  '```',
].join('\n')

const stock = (on: any) => on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'CORE' }))

const mount = ($: any, component: string, props: any, extra: any = {}) =>
  $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component, requestId: `${component}-1`, viewport: VIEWPORT, props, ...extra })

const answer = (text: string) => ({ text, isFirstOfReply: true })
const prompt = (isExpanded: boolean) => ({ text: 'a prompt', origin: { kind: 'composer' }, isExpanded })

const call = (tool: string, input: any, extra: any = {}) => ({ tool_use_id: `toolu_${tool}_${JSON.stringify(input).length}`, tool, input, isRunning: false, isErrored: false, isInterrupted: false, output: undefined, ...extra })
const GROUP = {
  calls: [
    call('Read', { file_path: 'C:\\work\\src\\sum.mjs' }),
    call('Read', { file_path: 'C:\\work\\src\\parse.mjs' }),
    call('Bash', { command: 'node --test' }, { isErrored: true, output: 'Exit code 1\nnot ok 2 - adds negative numbers too' }),
  ],
  isActive: false,
  isExpanded: false,
}

const texts = async (ui: any, type: string) => (await ui.findAll({ type })).map((found: any) => found.text)

describe('register', () => {
  test('section titles are underlined over the engine Markdown; sub-headings stay the engine\'s', async ($, on) => {
    stock(on)
    const ui = await mount($, 'AssistantMessage', answer(REPLY))

    expect(await ui.find({ text: 'CORE' })).toBeUndefined()
    for (const title of ['B-tree vs hash indexes', 'How a B-tree index works']) {
      expect((await ui.find({ type: 'Text', text: title }))?.props).toMatchObject({ bold: true, underline: true })
    }
    expect(await ui.find({ type: 'Text', text: 'Mental model' })).toBeUndefined()

    const markdown = await texts(ui, 'Markdown')
    expect(markdown).toHaveLength(2)
    expect(markdown[0]).toStartWith('**Short version:**')
    expect(markdown[1]).toStartWith('### Mental model')
    // Code, its fence and the heading-looking line inside it reach the engine's renderer untouched.
    expect(markdown[1]).toContain('```sql\n## not a heading: this line is code\nCREATE INDEX idx ON t (a);\n```')
    await ui.unmount()
  })

  test('a reply whose only headings are sub-headings is the engine\'s to draw', async ($, on) => {
    stock(on)
    const ui = await mount($, 'AssistantMessage', answer('Lead.\n\n### Detail\n\nBody.'))
    expect((await ui.find({ text: 'CORE' }))?.type).toBe('Text')
    await ui.unmount()
  })

  test('every word of the answer is still on screen, in order', async ($, on) => {
    stock(on)
    const ui = await mount($, 'AssistantMessage', answer(REPLY))
    const drawn = await ui.drawn()
    const words = (node: any): string => (typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('\n') : node && typeof node === 'object' ? `${node.props?.text ?? ''}\n${words(node.children ?? [])}` : '')
    const squash = (s: string) => s.replace(/^#{1,6}[ \t]+/gm, '').replace(/[\u25cf\s]+/g, ' ').trim()
    expect(squash(words(drawn))).toBe(squash(REPLY))
    await ui.unmount()
  })

  test('an answer with no heading is the engine\'s to draw', async ($, on) => {
    stock(on)
    const ui = await mount($, 'AssistantMessage', answer('**Use Postgres.** It handles concurrent writes.\n\n- one\n- two'))
    expect((await ui.find({ text: 'CORE' }))?.type).toBe('Text')
    expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(0)
    await ui.unmount()
  })

  test('a block after a tool call keeps the gutter and draws no bullet', async ($, on) => {
    stock(on)
    const first = await mount($, 'AssistantMessage', answer(REPLY))
    expect(await first.find({ type: 'Text', text: '\u25cf' })).toBeDefined()
    await first.unmount()
    const later = await mount($, 'AssistantMessage', { text: REPLY, isFirstOfReply: false }, { requestId: 'AssistantMessage-2' })
    expect(await later.find({ type: 'Text', text: '\u25cf' })).toBeUndefined()
    await later.unmount()
  })

  test('in the expanded view (ctrl+o, --verbose) every row is the engine\'s', async ($, on) => {
    stock(on)
    const seen = await mount($, 'UserMessage', prompt(true))
    expect((await seen.find({ text: 'CORE' }))?.type).toBe('Text')
    const ui = await mount($, 'AssistantMessage', answer(REPLY))
    expect((await ui.find({ text: 'CORE' }))?.type).toBe('Text')
    const group = await mount($, 'ToolGroup', GROUP)
    expect((await group.find({ text: 'CORE' }))?.type).toBe('Text')

    // Leaving the view brings the drawing back, for rows that were already on screen too.
    await seen.redraw(prompt(false))
    expect(await ui.find({ text: 'CORE' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'How a B-tree index works' })).toBeDefined()
    for (const mounted of [seen, ui, group]) await mounted.unmount()
  })

  test('a settled group names its targets and lets a failure out', async ($, on) => {
    stock(on)
    const ui = await mount($, 'ToolGroup', GROUP)
    expect(await ui.find({ text: 'CORE' })).toBeUndefined()
    const lines = await texts(ui, 'Text')
    expect(lines).toContain('Read sum.mjs, parse.mjs')
    expect(lines.some((line: string) => line.includes('node --test') && line.includes('Exit code 1'))).toBe(true)
    const label = await ui.find({ type: 'Text', text: /^failed$/ })
    expect(label?.props).toMatchObject({ color: 'error' })
    await ui.unmount()
  })

  test('a live group, a running call and an expanded group are the engine\'s', async ($, on) => {
    stock(on)
    for (const [id, props] of [
      ['live', { ...GROUP, isActive: true }],
      ['running', { ...GROUP, calls: [{ ...GROUP.calls[0], isRunning: true }] }],
      ['expanded', { ...GROUP, isExpanded: true }],
    ] as const) {
      const ui = await mount($, 'ToolGroup', props, { requestId: id })
      expect((await ui.find({ text: 'CORE' }))?.type).toBe('Text')
      await ui.unmount()
    }
  })

  test('hostile text in a command cannot reach the terminal', async ($, on) => {
    stock(on)
    const hostile = { ...GROUP, calls: [call('Bash', { command: 'echo \u001b[31mred\u001b]8;;https://evil.example\u0007x\u001b]8;;\u0007 \u202egnp.exe' }, { isErrored: true, output: '\u001b[2JExit code 1' })] }
    // A control character in a Text is refused by the surface, so a mount that resolves proves it is gone.
    const ui = await mount($, 'ToolGroup', hostile)
    const line = (await texts(ui, 'Text')).join(' ')
    expect(line).toContain('echo redx gnp.exe')
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202e]/)
    await ui.unmount()
  })

  test('/clear-transcript off hands every row back, and on takes them again', async ($, on) => {
    stock(on)
    on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
    on('command.register', ($: any, e: any) => ({ value: { command: e.name } }))
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const ui = await mount($, 'AssistantMessage', answer(REPLY))
    expect(await ui.find({ text: 'CORE' })).toBeUndefined()

    const off = await $.command.run({ command: PLUGIN, args: 'off', origin: { kind: 'composer' } })
    expect(off.text).toContain('off')
    expect(off.context).toBeUndefined()
    expect((await ui.find({ text: 'CORE' }))?.type).toBe('Text')

    await $.command.run({ command: PLUGIN, args: 'on', origin: { kind: 'composer' } })
    expect(await ui.find({ text: 'CORE' })).toBeUndefined()
    await ui.unmount()
  })

  test('other surfaces are never touched', async ($, on) => {
    stock(on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AssistantMessage', requestId: 'desktop-1', viewport: VIEWPORT, props: answer(REPLY) })
    expect((await ui.find({ text: 'CORE' }))?.type).toBe('Text')
    await ui.unmount()
  })
})
