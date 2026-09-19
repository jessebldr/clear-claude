// Pure. No I/O, no Node API, no clock, no environment: everything arrives as an argument,
// so the same state and options always produce the same lines.
//
//   identity   Fable 5.1  high  |  clear-claude on main  o      who is working, and where
//   capacity   ctx 43%   5h 39% . 42m   7d 58% . 13h42m       the numbers are the content
//
// Drawn as one full-width bar when both fit, as two rows when they do not. Two looks: `pills`,
// drawn to the design spec, where each metric is a tinted chip, and `text`, which has
// no backgrounds and is what is drawn whenever colour is off.
//
// Every glyph below was measured against the cell advance of Cascadia Mono, Consolas and Lucida
// Console, and anything that was not exactly one cell in all three was rejected -- which is why
// there is no reset symbol (U+21BB is 1.1-1.33 cells and comes from a fallback font), no warning
// triangle and no check mark (both double-width), and no eighth-blocks (not monospace in Consolas
// or Lucida Console). Cell width is not the whole of it: where a glyph's ink sits is measured
// too, by bench/optical.mjs, which is how the star and the half-block bar were retired.
import { sanitize } from './sanitize.mjs'
import { ASSUMED_COLUMNS, barCells, composeLine, formatClock, formatReset, spreadLine, usableColumns } from './layout.mjs'

// Where a chip changes state. The two kinds of number mean different things, so they turn at
// different places.
//
// A quota (5-hour, weekly) is a budget: 80 % used is worth knowing, 95 % is nearly out.
//
// Context is not a budget that runs to 100. Claude Code compacts on its own before then -- around
// 80 % of a 200k window; ccstatusline hard-codes 0.8 as the usable share, and claude-hud, which
// models the auto-compact buffer, warns at 75 and 90. The payload does not carry the real
// threshold, so it is not claimed here; but with context at 80 / 95 the warning arrived as the
// compaction did and "critical" was never reached at all. Turning at 70 leaves time to /compact
// or /clear on one's own terms, and answer quality drifts down well before a window is full.
export const THRESHOLDS = { context: { warn: 70, critical: 85 }, quota: { warn: 80, critical: 95 } }

const BAR_CELLS = 10
const MODEL_MAX_WIDTH = 24
const EFFORT_MAX_WIDTH = 8
const NAME_MAX_WIDTH = { wide: 32, medium: 32, narrow: 20 }

const GLYPHS = {
  unicode: {
    group: '  │  ', // U+2502 light vertical: the only rule on the line
    item: '  ',
    pair: ' · ', // U+00B7 middle dot, joining a value to its reset time
    // The text look's meter is one glyph, U+25AC, for both the fill and the groove: a bar of one
    // height, centred on the digits beside it (measured), told apart by hue and weight. It
    // replaced a full block on a hairline -- a 17 px slab welded to a 1 px rule -- and then a
    // lower half block, which hung 4 px under the digits. A shade (U+2591) renders as a hatch.
    bar: '▬',
    // Without styling a fill and a groove of the same glyph are the same thing, so a terminal
    // that cannot style gets two different ones.
    filled: '█',
    empty: '─',
    unknown: '—',
    dirty: '  ●',
    // Powerline's round caps. Private-use code points, written as numbers so that no editor or
    // diff ever shows an empty box where they are. No font has to supply them: they are only
    // used where the terminal draws them itself.
    capLeft: String.fromCodePoint(0xe0b6),
    capRight: String.fromCodePoint(0xe0b4),
    // There is no smaller corner. The only glyphs that cut just a cell's outer corners are the
    // sextants (U+1FB2B, U+1FB1B), and they are outside the Basic Multilingual Plane: shipped, and
    // photographed in a real session, they arrived as grey crosses -- Claude Code does not carry
    // an astral character through its status line intact, colour or shape. Everything this
    // renderer draws is therefore BMP, and a test holds it to that.
    ahead: '↑',
    behind: '↓',
    ellipsis: '…',
  },
  ascii: {
    group: '  |  ',
    item: '  ',
    pair: '  ',
    filled: '#',
    empty: '-',
    unknown: '-',
    dirty: '*',
    ahead: '+',
    behind: '-',
    ellipsis: '...',
  },
}

// Three levels, set by what was measured in a real session rather than by what SGR promises.
// Claude Code paints status-line text in its own muted grey (#999999 on #191A1B in the dark
// theme), so "plain" is already quiet, bold adds weight but no brightness, and faint halves that
// grey to #59595A -- 2.6:1 against the background, which is not text anyone can read. So:
//
//   HI     bold, and bright where the theme is known: the numbers, and the model
//   PLAIN  Claude Code's grey: everything else a person reads -- labels, names, reset times
//   DIM    faint: structure only -- rules, the dot, the meter's groove. Never words.
//
// An earlier version put labels and reset times in DIM, and they were the illegible part.
const HI = { bold: true, bright: true }
const DIM = { dim: true }
const PLAIN = {}
// Roles only the pill looks can show; in the text look they are PLAIN and DIM.
const MUTE = { role: 'secondary' }
const WHERE = { role: 'where' }
const BRANCH = { bold: true, role: 'where' }
const LABEL = { role: 'label' }
const DOT = { dim: true, role: 'secondary' }
const DIRTY = { color: '33', role: 'dirty' }
const GREEN = '32'
const YELLOW = '33'
const RED = '31'
const SGR = { bold: '1', dim: '2' }
// What HI adds to bold. Claude Code repaints every span that has no explicit foreground -- SGR 39
// included, measured live: it came back #999999 -- so brightness takes a named colour, and which
// one depends on the theme Claude Code is set to. Unknown theme: bold alone, which is safe.
const BRIGHT = { dark: '97', light: '30' }

// The colour system of the pill look, from the design spec (docs/ui-architecture.md, "The design
// spec"). Colours are roles, not segments:
//
//   primary    the model, and every number                  secondary  labels, times, "on", effort
//   where      the project and its branch: the one hue      faint      the rule
//   green / amber / red   a chip's level                     dirty      the working-tree dot
//
// Identity is typography, with no backgrounds. Only a metric is a chip, and a chip is a dark tint
// of its level under text in that level's hue -- never a saturated block, which the spec lists
// under "don't". The roles and their grouping come from prompts with years of use: Pure (one hue,
// for where; grey for the rest), Starship (connective words, not boxes), Oh My Posh (state owns
// the colour, identity does not), ccstatusline (a segment that sets both colours owns its
// contrast).
//
// Every colour is explicit because Claude Code repaints anything that is not (#999999, measured),
// and identity text sits on a background this code does not choose -- so there is one set per
// Claude Code theme. Each is [24-bit, xterm-256]: macOS Terminal has no 24-bit colour, and the
// 256 cube is the same everywhere, which the 16 ANSI names are not. The cube has no dark tints,
// so there every chip falls back to one grey and the text carries the level alone.
export const PALETTES = {
  dark: {
    primary: [[230, 237, 243], 255],
    secondary: [[148, 163, 184], 145],
    faint: [[71, 85, 105], 240],
    where: [[96, 165, 250], 75],
    green: [[34, 197, 94], 41],
    amber: [[245, 158, 11], 214],
    red: [[239, 68, 68], 203],
    dirty: [[249, 115, 22], 208],
    chip: [[30, 41, 59], 236],
    okBg: [[14, 36, 24], 236],
    warnBg: [[43, 32, 11], 236],
    criticalBg: [[42, 18, 21], 236],
  },
  light: {
    primary: [[15, 23, 42], 234],
    secondary: [[71, 85, 105], 240],
    faint: [[176, 186, 201], 250],
    where: [[29, 78, 216], 26],
    green: [[21, 128, 61], 28],
    amber: [[180, 83, 9], 130],
    red: [[185, 28, 28], 124],
    dirty: [[234, 88, 12], 202],
    chip: [[226, 232, 240], 254],
    okBg: [[220, 252, 231], 254],
    warnBg: [[253, 246, 214], 254],
    criticalBg: [[254, 226, 226], 254],
  },
}
const LEVEL_INK = { ok: 'green', warn: 'amber', critical: 'red' }
const LEVEL_GROUND = { ok: 'okBg', warn: 'warnBg', critical: 'criticalBg' }
// A no-break space: an ordinary one at the edge of a row is trimmed before it is drawn.
const PAD = String.fromCharCode(0xa0)

// The `essential` preset. Repeated here rather than imported because config.mjs reads a file
// and this module must stay free of Node.
const SHOW_DEFAULT = {
  model: true,
  effort: true,
  project: true,
  git: true,
  context: true,
  fiveHour: true,
  sevenDay: true,
  cost: 'auto',
  lines: false,
  outputStyle: false,
  verification: true,
  activity: true,
}
const STYLE_MAX_WIDTH = 16

// Words, not marks: the check mark and the warning triangle are double-width in the fonts this
// was measured against. The hue only repeats what the word already says.
const VERIFICATION = {
  verified: { label: 'verified', look: PLAIN },
  edited: { label: 'edited since', look: { color: YELLOW } },
  failed: { label: 'verify failed', look: { color: RED } },
}

const LEVEL_MARK = { ok: '', warn: '!', critical: '!!' }
// The meter carries a hue at every level, the value only once there is something to say. That
// gives the healthy line one point of colour that still means something -- without it the whole
// row is grey, which reads as switched off beside Claude Code's own coloured row.
const METER_COLOR = { ok: GREEN, warn: YELLOW, critical: RED }
const VALUE_COLOR = { ok: null, warn: YELLOW, critical: RED }
const valueStyle = level => (VALUE_COLOR[level] ? { bold: true, color: VALUE_COLOR[level] } : HI)

// The level is taken from the number that is actually displayed, so a value shown as 80% is
// never drawn without the marker 80% is supposed to carry.
const showPercent = percent => Math.max(0, Math.round(percent))
const levelOf = (shown, kind) => (shown >= THRESHOLDS[kind].critical ? 'critical' : shown >= THRESHOLDS[kind].warn ? 'warn' : 'ok')

const showCost = usd => (usd >= 100 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

/**
 * @param state   what stateFromStatusline() returns; null draws nothing
 * @param options columns: terminal width, undefined when unknown
 *                now: epoch ms, for reset countdowns
 *                timeZone: IANA zone for weekday names, undefined for the host's
 *                charset: 'unicode' (default) | 'ascii'
 *                color: boolean, hue (yellow, red); default false
 *                style: boolean, weight (dim); defaults to `color`
 *                show: what to draw, as config.mjs resolves it; omitted keys take the default
 *                look: 'text' (default) | 'pills'; pills need colour, else text is drawn
 *                theme: 'dark' | 'light' | undefined, the theme Claude Code is set to
 *                truecolor: boolean; pills fall back to the 256-colour palette without it
 *                caps: 'round' | 'square' (default); round ends need a terminal that draws them
 *
 * The two are separate because NO_COLOR asks for no colour, not for no styling -- its own FAQ
 * answers "Should the presence of NO_COLOR disable other styling such as bold, underline, and
 * italic?" with "No." Keeping dim under NO_COLOR is what preserves the label/value hierarchy
 * when the hues are gone; a terminal that cannot style at all passes both as false.
 * @returns the lines to print: none, the bar as one row or two, and the activity row while
 *          something is running
 */
export function render(state, options = {}) {
  if (typeof state !== 'object' || state === null) return []
  const { columns, now, timeZone, color = false, style = color } = options
  const glyphs = options.charset === 'ascii' ? GLYPHS.ascii : GLYPHS.unicode
  const show = { ...SHOW_DEFAULT, ...options.show }
  const meter = style && glyphs.bar ? { filled: glyphs.bar, empty: glyphs.bar } : glyphs
  // What may be drawn, and what it must fit in, are two different budgets. `maxWidth` bounds
  // every row even when the terminal said nothing, so a long name can never draw a row wider
  // than the screen; `spreadWidth` is undefined in that case, because padding to a width
  // nobody confirmed is how a bar turns into two wrapped rows.
  const spreadWidth = usableColumns(columns)
  const maxWidth = spreadWidth ?? usableColumns(ASSUMED_COLUMNS)

  // A segment is built from parts of [text, {bold?, dim?, color?}]. Weight is styling and
  // survives NO_COLOR; hue does not. Colour only ever reinforces something the text already
  // says, so every state stays legible with both switched off.
  const paint = (text, look = PLAIN) => {
    if (text === '') return text
    const codes = []
    if (style && look.bold) codes.push(SGR.bold)
    if (style && look.dim) codes.push(SGR.dim)
    if (color && look.color) codes.push(look.color)
    else if (color && look.bright && Object.hasOwn(BRIGHT, options.theme ?? '')) codes.push(BRIGHT[options.theme])
    return codes.length > 0 ? `\x1b[${codes.join(';')}m${text}\x1b[0m` : text
  }

  // The pill looks. A pill owns its foreground and its background, so its contrast is the same
  // on any terminal theme and Claude Code's repaint of unstyled text cannot reach it. Colour is
  // what a pill is made of, so without colour there are no pills and the text look is drawn.
  const pills = color && style && options.look === 'pills'
  const palette = options.theme === 'light' ? PALETTES.light : PALETTES.dark
  const ink = (name, layer) => (options.truecolor ? `${layer};2;${palette[name][0].join(';')}` : `${layer};5;${palette[name][1]}`)
  // Which role a look plays. A look may name its role outright; otherwise its weight decides.
  const roleOf = look =>
    look.role ?? (look.color === RED ? 'red' : look.color === YELLOW ? 'amber' : look.color === GREEN ? 'green' : look.dim ? 'faint' : look.bold ? 'primary' : 'secondary')
  // In the pill look plain words are still written in an explicit colour, with no background.
  const write = (text, look = PLAIN) => (text === '' ? '' : `\x1b[${look.bold ? '1;' : ''}${ink(roleOf(look), 38)}m${text}\x1b[0m`)
  // A chip: one metric on one ground. Healthy quotas sit on the neutral chip; the context chip is
  // tinted green, because it is the metric the row is for; at the warning and critical levels any
  // chip takes that level's tint, and its label takes the hue. The number and the time keep the
  // roles their looks already say.
  const chip = (parts, { level, lead }) => {
    const ground = level === 'ok' && !lead ? 'chip' : LEVEL_GROUND[level]
    const label = level === 'ok' && !lead ? 'secondary' : LEVEL_INK[level]
    // The ends. A terminal has cells, not pixels: it cannot draw the spec's hairline border or its
    // 4 px radius. What it can do is end the chip in a cap -- a half-ellipse in the chip's own
    // colour, on no background -- where the pad cell would be, so a rounded chip is exactly as
    // wide as a square one. Only where the terminal draws that glyph itself; see statusline.mjs.
    const [leftEnd, rightEnd] = options.caps === 'round' && glyphs.capLeft ? ['capLeft', 'capRight'] : []
    const round = leftEnd !== undefined
    const end = glyph => (round ? `\x1b[${ink(ground, 38)}m${glyph}\x1b[0m` : '')
    const inner = round ? parts : [[PAD, PLAIN], ...parts, [PAD, PLAIN]]
    let styled = ''
    let open = ''
    for (const [text, look] of inner) {
      if (text === '') continue
      const codes = `${look.bold ? '1;' : ''}${ink(look.role === 'label' ? label : roleOf(look), 38)};${ink(ground, 48)}`
      if (codes !== open) styled += `${open === '' ? '' : '\x1b[0m'}\x1b[${codes}m`
      open = codes
      styled += text
    }
    const edge = side => (round ? glyphs[side] : PAD)
    return {
      plain: `${edge(leftEnd)}${parts.map(([text]) => text).join('')}${edge(rightEnd)}`,
      styled: `${end(glyphs[leftEnd])}${styled}\x1b[0m${end(glyphs[rightEnd])}`,
    }
  }
  const draw = pills ? write : paint
  // `extra` is what the segment is: { chip: { level, lead } } for a metric, { unit } for identity.
  const segment = (priority, parts, atoms = 1, extra = {}) => ({
    priority,
    atoms,
    ...extra,
    ...(pills && extra.chip
      ? chip(parts, extra.chip)
      : { plain: parts.map(([text]) => text).join(''), styled: parts.map(([text, look]) => draw(text, look)).join('') }),
  })
  const rule = text => ({ plain: text, styled: draw(text, DIM) })
  const word = text => ({ plain: text, styled: draw(text, MUTE) })
  // What stands between two identity segments says how they relate: a space inside a unit, a
  // word where one is a property of the other, a rule between units. It is asked again each time
  // a segment is dropped, so "on" can never be left pointing at a project that is no longer there.
  const between = (before, after) => {
    if (before.unit === 'who' && after.unit === 'who') return word(glyphs.item)
    if (before.part === 'project' && after.part === 'branch') return word(' on ')
    if (before.unit === after.unit) return word(glyphs.item)
    return rule(glyphs.group)
  }
  // Meters stand a cell apart on their own surfaces; in the text look a rule separates the groups.
  const joins = { identity: between, capacity: pills ? { plain: ' ', styled: ' ' } : rule(glyphs.group) }
  // A chip says its level in its tint and its hue; without colour the level has to be text.
  const mark = level => (pills ? '' : LEVEL_MARK[level])
  const clean = (value, maxCells) => sanitize(value, maxCells, glyphs.ellipsis)

  // Detail levels, richest first. What may be drawn is chosen by what actually fits, not by
  // a raw column threshold: when richness came straight from the terminal width, widening from
  // 79 to 80 added the meter, the row stopped fitting, and a single bar became two stacked
  // rows. A terminal that gets wider must never show less or reflow backwards.
  const DETAILS = ['wide', 'medium', 'narrow']

  const compose = detail => {
    const wide = detail === 'wide'
    const narrow = detail === 'narrow'

    // Identity: the model anchors the left, the branch the right, the middle stays quiet.
    const identity = []
    const model = show.model ? clean(state.model, MODEL_MAX_WIDTH) : ''
    const effort = show.effort ? clean(state.effort, EFFORT_MAX_WIDTH) : ''
    const project = show.project ? clean(state.project, NAME_MAX_WIDTH[detail]) : ''
    const branch = show.git ? clean(state.git?.branch, NAME_MAX_WIDTH[detail]) : ''
    // The default style says nothing worth a segment; any other one changes how replies read.
    const outputStyle = show.outputStyle && state.outputStyle !== 'default' ? clean(state.outputStyle, STYLE_MAX_WIDTH) : ''

    // Two units, read as a phrase: who is working (the model, and its effort as a quiet modifier)
    // and where (the project, the one hue on the row, "on" its branch).
    if (model) identity.push(segment(0, [[model, HI]], 1, { unit: 'who' }))
    if (effort && !narrow) identity.push(segment(3, [[effort, MUTE]], 1, { unit: 'who' }))
    if (project && (!narrow || !branch)) identity.push(segment(2, [[project, WHERE]], 1, { unit: 'where', part: 'project' }))
    if (branch) {
      const parts = [[branch, BRANCH]]
      // A dot, not a star: measured in Cascadia Mono and Consolas, `*` rides 1.5-2.5 px above the
      // centre of the lowercase beside it and reads as a stray superscript; U+25CF sits within
      // 1 px of it. The hue is the state's, and the mark is there for when hue is not.
      if (state.git.dirty === true) parts.push([glyphs.dirty, DIRTY])
      let atoms = 1
      if (wide) {
        if (state.git.ahead > 0) { parts.push([` ${glyphs.ahead}${Math.round(state.git.ahead)}`, MUTE]); atoms++ }
        if (state.git.behind > 0) { parts.push([` ${glyphs.behind}${Math.round(state.git.behind)}`, MUTE]); atoms++ }
      }
      identity.push(segment(1, parts, atoms, { unit: 'where', part: 'branch' }))
    }
    if (outputStyle && !narrow) identity.push(segment(4, [[outputStyle, MUTE]], 1, { unit: 'state' }))

    // Beside the branch, because it is a fact about the working tree. "edited since" carries no
    // time: the time it would show is the verification's, which the edit has just made stale.
    const status = state.verification?.status
    const verification = show.verification && Object.hasOwn(VERIFICATION, status ?? '') ? VERIFICATION[status] : undefined
    if (verification && !narrow) {
      const clock = state.verification.status === 'edited' ? '' : formatClock(state.verification.at, timeZone)
      const parts = [[verification.label, verification.look]]
      if (clock && wide) parts.push([` ${clock}`, PLAIN])
      identity.push(segment(3, parts, 1, { unit: 'state' }))
    }

    // Capacity: label plain, number high, meter coloured by level. The number comes before the
    // meter so it is always the same distance from its label, whatever the meter is doing.
    const capacity = []
    if (!show.context) {
      // Nothing: the context segment was switched off.
    } else if (Number.isFinite(state.contextPercent)) {
      const shown = showPercent(state.contextPercent)
      const level = levelOf(shown, 'context')
      const parts = [['ctx ', LABEL], [`${shown}%${mark(level)}`, valueStyle(level)]]
      // A pill is its own meter at every width, so it has no bar to add or to drop.
      if (wide && !pills) {
        const { filled, empty } = barCells(shown, BAR_CELLS)
        parts.push([' ', PLAIN], [meter.filled.repeat(filled), { color: METER_COLOR[level] }], [meter.empty.repeat(empty), DIM])
      }
      capacity.push(segment(0, parts, wide && !pills ? 2 : 1, { chip: { level, lead: true } }))
    } else {
      capacity.push(segment(0, [['ctx ', LABEL], [glyphs.unknown, MUTE]], 1, { chip: { level: 'ok', lead: false } }))
    }

    const usage = (label, window, priority, withReset) => {
      if (!window || !Number.isFinite(window.percent)) return null
      // A window whose reset moment has passed describes a quota that no longer exists.
      if (Number.isFinite(window.resetsAt) && Number.isFinite(now) && window.resetsAt <= now) return null
      const shown = showPercent(window.percent)
      const level = levelOf(shown, 'quota')
      const parts = [[`${label} `, LABEL], [`${shown}%${mark(level)}`, valueStyle(level)]]
      const reset = withReset ? formatReset(window.resetsAt, now, timeZone) : ''
      if (reset) parts.push([glyphs.pair, DOT], [reset, PLAIN])
      return segment(priority, parts, reset ? 2 : 1, { chip: { level, lead: false } })
    }
    const fiveHour = show.fiveHour ? usage('5h', state.fiveHour, 1, !narrow) : null
    const sevenDay = show.sevenDay ? usage('7d', state.sevenDay, 2, wide) : null
    if (fiveHour) capacity.push(fiveHour)
    if (sevenDay) capacity.push(sevenDay)

    // Cost stands in for quota only where there is no quota (API key, Bedrock, Vertex). Zero
    // is hidden: a subscriber has no rate limits before the first response of a session either.
    // Asked for outright (`always`) it sits behind the quotas instead, and is the first to go.
    const standsIn = !fiveHour && !sevenDay && state.costUsd > 0
    if (Number.isFinite(state.costUsd) && (show.cost === 'always' || (show.cost === 'auto' && standsIn))) {
      capacity.push(segment(standsIn ? 1 : 3, [[showCost(state.costUsd), standsIn ? HI : PLAIN]]))
    }
    const added = Number.isFinite(state.linesAdded) ? Math.max(0, Math.round(state.linesAdded)) : 0
    const removed = Number.isFinite(state.linesRemoved) ? Math.max(0, Math.round(state.linesRemoved)) : 0
    if (show.lines && !narrow && added + removed > 0) capacity.push(segment(4, [[`+${added} -${removed}`, PLAIN]]))
    return { identity, capacity }
  }

  // Score every candidate and take the best, rather than walking down a cascade: the richest
  // detail that happens to fit is not always the one that shows the most, because a richer
  // level makes each group longer and can cost a whole group.
  //
  //   an atom kept          10  -- a fact someone came to read; a quota's reset time is one
  //   the detail's rank      1  -- more detail within the same groups is worth a little
  //   a truncated group  -1000  -- disqualifying: a meter cut off mid-run does not read as a
  //                               clipped meter, it reads as a smaller number, so a detail
  //                               level that has to cut one is simply the wrong level
  //
  // Fewer rows wins only on an exact tie, so the single-row bar is a reward for content that
  // already fits, never a reason to drop content.
  let best = null
  DETAILS.forEach((detail, index) => {
    const { identity, capacity } = compose(detail)
    const left = composeLine(identity, joins.identity, maxWidth, glyphs.ellipsis)
    const right = composeLine(capacity, joins.capacity, maxWidth, glyphs.ellipsis)
    const bar = spreadLine(left, right, spreadWidth)
    const rows = bar === null ? 2 : 1
    const score =
      (left.atoms + right.atoms) * 10 +
      (DETAILS.length - index) -
      (left.truncated ? 1000 : 0) -
      (right.truncated ? 1000 : 0)
    if (best === null || score > best.score || (score === best.score && rows < best.rows)) {
      best = { score, rows, lines: bar === null ? [left.styled, right.styled].filter(line => line !== '') : [bar] }
    }
  })

  // The activity row: present only while something runs, and counts only. The agent panel and
  // the spinner already name what is running, so a name here would say it twice. Richest form
  // that fits wins; failure is the one thing that is never the part dropped.
  const activity = show.activity ? state.activity : null
  if (typeof activity !== 'object' || activity === null) return best.lines
  const count = value => (Number.isInteger(value) && value > 0 ? Math.min(value, 99) : 0)
  const agents = count(activity.agents)
  const failed = count(activity.failed)
  const background = count(activity.background)
  const minutes = Number.isFinite(activity.oldestStart) && Number.isFinite(now) ? Math.floor((now - activity.oldestStart) / 60000) : 0

  const row = form => {
    const agentParts = []
    if (agents > 0) agentParts.push([`${agents}`, HI], [agents === 1 ? ' agent' : ' agents', PLAIN])
    if (failed > 0) {
      if (agentParts.length > 0) agentParts.push([glyphs.pair, DOT])
      agentParts.push([`${failed} failed!`, { color: RED }])
    }
    // Whole minutes, and only from the first one: it answers "is something stuck", nothing finer.
    if (form === 'wide' && agents > 0 && minutes >= 1) agentParts.push([glyphs.pair, DOT], [`${Math.min(minutes, 999)}m`, PLAIN])
    const groups = []
    if (agentParts.length > 0) groups.push(segment(0, agentParts))
    if (background > 0) groups.push(segment(1, [[`${background}`, HI], [form === 'narrow' ? ' bg' : ' background', PLAIN]]))
    return composeLine(groups, rule(glyphs.group), maxWidth, glyphs.ellipsis)
  }
  const wanted = (agents + failed > 0 ? 1 : 0) + (background > 0 ? 1 : 0)
  const fitted = ['wide', 'medium', 'narrow'].map(row).find(line => !line.truncated && line.kept === wanted) ?? row('narrow')
  return fitted && fitted.styled !== '' ? [...best.lines, fitted.styled] : best.lines
}
