// Turns recorded frames into the published GIFs and their PNG covers.
//
//   node demo/edit.mjs [job ...]        default: every job
//   FRAMES=<dir> node demo/edit.mjs     where the frames-<name>/ folders are (default: demo/)
//
// What it does to time, and nothing else: it drops frames in which nothing on screen changes
// (waiting for the model, a blinking cursor), plays the rest faster to fit a length, holds the
// last frame, and opens on a chosen frame of the same recording so that a paused thumbnail
// shows the result instead of an empty terminal. It never touches what is inside a frame: every
// frame shown is an unaltered frame of the recording, under a caption banner.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const FRAMES = resolve(process.env.FRAMES ?? here)
const ASSETS = resolve(here, '..', 'assets')
// An explicit font file: drawtext's fontconfig lookup crashes ffmpeg on Windows.
const FONT = (process.env.FONTFILE ?? 'C:/Windows/Fonts/consolab.ttf').replace(/\\/g, '/').replace(/:/g, '\\:')

const FPS = 12
const TERMINAL = '0x171717'
const MARGIN = '0x101010'
const CANVAS = 1300 // every primary asset is this wide
const INNER = 10 // breathing room right of the text: VHS pads a terminal on the left only
const BANNER = 36
const MAX_STILL = 4 // frames: the longest stretch of "nothing changes" that survives
const COVER_SECONDS = 1.0
const HOLD_SECONDS = 2.6
const RED = '0xE06C6C'
const GREEN = '0x5FBF77'
const BLUE = '0x61AFEF'

const pair = (slug, target) => ({
  target,
  cover: 'last',
  words: slug,
  panes: [
    { frames: `${slug}-before`, title: 'BEFORE  Claude Code, no plugin', colour: RED },
    { frames: `${slug}-after`, title: 'AFTER  + clear-claude plugin', colour: GREEN },
  ],
})

// `cover` is a frame number of the recording, or 'last'. For the status bar it is the moment
// the dirty dot is lit and the context chip is filled, which the last frame no longer shows.
const JOBS = {
  'clear-ui-demo': {
    target: 20,
    cover: 632,
    panes: [{ frames: 'clear-ui-wide', title: 'CLEAR UI  the bottom row of a real Claude Code session', colour: BLUE, note: 'watch ctx, and the dot beside main' }],
  },
  'demo-port-3000': pair('port', 20),
  'demo-disk-space': pair('disk', 20),
  'demo-chmod': pair('chmod', 20),
  'clear-ui-narrow': {
    target: 16,
    cover: 'last',
    canvas: 720,
    panes: [{ frames: 'clear-ui-narrow', title: 'CLEAR UI  narrow terminal', colour: BLUE, note: 'two rows' }],
  },
}

const ffmpeg = args => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] })
const probe = file =>
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { encoding: 'utf8' }).trim()
const md5 = file => createHash('md5').update(readFileSync(file)).digest('hex')
const frame = (dir, layer, i) => join(FRAMES, `frames-${dir}`, `frame-${layer}-${String(i).padStart(5, '0')}.png`)
const count = dir => readdirSync(join(FRAMES, `frames-${dir}`)).filter(n => n.startsWith('frame-text-')).length

function banner(pane, right) {
  const text = (value, colour, x) => `drawtext=fontfile='${FONT}':text='${value}':fontcolor=${colour}:fontsize=17:x=${x}:y=10`
  const parts = [`pad=iw:ih+${BANNER}:0:${BANNER}:color=${MARGIN}`, text(pane.title, pane.colour, '16')]
  if (right) parts.push(text(right, '0x9A9A9A', 'w-tw-16'))
  return parts.join(',')
}

function build(name, job) {
  for (const pane of job.panes) {
    if (!existsSync(join(FRAMES, `frames-${pane.frames}`))) {
      console.log(`${name}: frames-${pane.frames}/ not found under ${FRAMES}; record it first`)
      return
    }
  }
  const total = Math.min(...job.panes.map(p => count(p.frames)))
  const work = join(FRAMES, `work-${name}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })

  // 1. Composite every frame once: terminal ground + text layer + cursor layer, under a banner.
  const inputs = []
  const chains = []
  job.panes.forEach((pane, p) => {
    const size = probe(frame(pane.frames, 'text', 1))
    inputs.push('-f', 'lavfi', '-i', `color=c=${TERMINAL}:s=${size}:r=${FPS}`)
    inputs.push('-framerate', String(FPS), '-i', join(FRAMES, `frames-${pane.frames}`, 'frame-text-%05d.png'))
    inputs.push('-framerate', String(FPS), '-i', join(FRAMES, `frames-${pane.frames}`, 'frame-cursor-%05d.png'))
    const words = job.words ? `${readFileSync(join(FRAMES, `${job.words}-${p === 0 ? 'before' : 'after'}.words`), 'utf8').trim()} words` : pane.note
    const base = p * 3
    chains.push(`[${base}][${base + 1}]overlay=format=auto:shortest=1[t${p}];[t${p}][${base + 2}]overlay=format=auto:shortest=1,pad=iw+${INNER}:ih:0:0:color=${TERMINAL},${banner(pane, words)}[p${p}]`)
  })
  const canvas = job.canvas ?? CANVAS
  const joined =
    job.panes.length === 2
      ? `[p0]pad=iw+3:ih:0:0:color=0x3a3a3a[l];[l][p1]hstack=shortest=1`
      : `[p0]null`
  const graph = `${chains.join(';')};${joined},pad=${canvas}:ih+16:(ow-iw)/2:8:color=${MARGIN}`
  ffmpeg([...inputs, '-filter_complex', graph, '-frames:v', String(total), '-start_number', '1', join(work, '%05d.png')])

  // 2. Decide which frames survive. A frame is "still" when every pane's text layer is
  //    byte-identical to the previous frame's; the cursor layer blinks on its own and is ignored.
  const signature = i => job.panes.map(p => md5(frame(p.frames, 'text', i))).join()
  const kept = []
  let previous = null
  let still = 0
  for (let i = 1; i <= total; i++) {
    const now = signature(i)
    still = now === previous ? still + 1 : 0
    previous = now
    if (still <= MAX_STILL) kept.push(i)
  }
  // 3. Play what is left fast enough to fit, by keeping every n-th frame.
  const room = Math.max(1, Math.floor((job.target - COVER_SECONDS - HOLD_SECONDS) * FPS))
  const step = Math.max(1, Math.ceil(kept.length / room))
  const played = kept.filter((_, index) => index % step === 0)
  const last = total
  const cover = job.cover === 'last' ? last : Math.min(job.cover, last)

  const png = i => join(work, `${String(i).padStart(5, '0')}.png`).replace(/\\/g, '/')
  const lines = [`file '${png(cover)}'`, `duration ${COVER_SECONDS}`]
  for (const i of played) lines.push(`file '${png(i)}'`, `duration ${(1 / FPS).toFixed(4)}`)
  lines.push(`file '${png(last)}'`, `duration ${HOLD_SECONDS}`, `file '${png(last)}'`)
  const list = join(work, 'list.txt')
  writeFileSync(list, lines.join('\n') + '\n')

  // 4. One palette for the whole clip; a small or diff-based one loses the chips' dark tints.
  const gif = join(ASSETS, `${name}.gif`)
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-filter_complex', 'split[x][y];[x]palettegen=stats_mode=full:max_colors=256[p];[y][p]paletteuse=dither=none:diff_mode=rectangle', '-fps_mode', 'vfr', gif])
  copyFileSync(png(cover), join(ASSETS, `${name}.png`))

  const seconds = COVER_SECONDS + played.length / FPS + HOLD_SECONDS
  console.log(
    `${name}: ${total} frames (${(total / FPS).toFixed(0)} s) -> ${kept.length} after dropping stills -> every ${step}${step === 1 ? 'st' : step === 2 ? 'nd' : step === 3 ? 'rd' : 'th'} = ${played.length} frames, ${seconds.toFixed(1)} s, cover frame ${cover}`,
  )
  rmSync(work, { recursive: true, force: true })
}

const asked = process.argv.slice(2)
for (const [name, job] of Object.entries(JOBS)) if (asked.length === 0 || asked.includes(name)) build(name, job)
