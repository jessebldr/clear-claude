// Cuts the two Clear Transcript stills in assets/ out of recorded frames.
//
//   bash demo/record.sh clear-transcript-answer && bash demo/record.sh clear-transcript-work
//   node demo/clear-transcript-stills.mjs
//
// Each still is ONE recorded session shown twice: the same transcript as stock Claude Code draws it and as
// Clear Transcript draws it. Every terminal pixel is an unaltered crop of a recorded frame; only the caption
// bands are drawn. The crops leave out the session header and the status bar, so no path, account or usage
// figure of the recording machine is published.
//
// Frame numbers and crops belong to the recordings of 2026-09-20 (5 frames a second, 1200 x 1000, font 14).
// A new recording has other timings and another reply: look at the frames and change the numbers.
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ASSETS = resolve(here, '..', 'assets')
// An explicit font file: drawtext's fontconfig lookup crashes ffmpeg on Windows.
const FONT = (process.env.FONTFILE ?? 'C:/Windows/Fonts/consolab.ttf').replace(/\\/g, '/').replace(/:/g, '\\:')
const TERMINAL = '0x171717'
const MARGIN = '0x101010'
const SIZE = '1200x1000'
const WIDTH = 1150
const BANNER = 34
const RED = '0xE06C6C'
const GREEN = '0x5FBF77'

// VHS writes the text of a frame as a transparent layer; it goes on the terminal ground first.
const frame = (frames, number) => join(here, `frames-${frames}`, `frame-text-${String(number).padStart(5, '0')}.png`)

// A caption may hold no colon, comma or quote: ffmpeg reads them as filter syntax.
function still(name, frames, before, after) {
  const pane = (input, crop, out) => `color=${TERMINAL}:s=${SIZE}[g${input}];[g${input}][${input}:v]overlay=shortest=1,crop=${WIDTH}:${crop.height}:0:${crop.y}[${out}]`
  const band = (text, colour, out) => `color=${MARGIN}:s=${WIDTH}x${BANNER},drawtext=fontfile='${FONT}':text='${text}':fontcolor=${colour}:fontsize=15:x=14:y=10[${out}]`
  const graph = [
    pane(0, before, 'a'),
    pane(1, after, 'b'),
    band(before.caption, RED, 'ta'),
    band(after.caption, GREEN, 'tb'),
    '[ta][a][tb][b]vstack=inputs=4',
  ].join(';')
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', frame(frames, before.frame), '-i', frame(frames, after.frame), '-filter_complex', graph, '-frames:v', '1', join(ASSETS, `${name}.png`)])
  console.log(`assets/${name}.png`)
}

still('clear-transcript-tools', 'clear-transcript-work',
  { frame: 600, y: 168, height: 302, caption: 'STOCK  Claude Code 2.1.278  -  the same session after /clear-transcript off' },
  { frame: 400, y: 168, height: 320, caption: 'CLEAR TRANSCRIPT  -  the group names its files and commands and the failed call has its own line' })

still('clear-transcript-answer', 'clear-transcript-answer',
  { frame: 185, y: 170, height: 306, caption: 'STOCK  Claude Code 2.1.278  -  the same reply in the ctrl+o view - every heading level is plain bold' },
  { frame: 150, y: 119, height: 306, caption: 'CLEAR TRANSCRIPT  -  section titles underlined - nothing else touched - every row where stock puts it' })
