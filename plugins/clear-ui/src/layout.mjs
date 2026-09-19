// Pure. No I/O, no Node API.
import { displayWidth, truncate } from './sanitize.mjs'

export const WIDE_MIN_COLUMNS = 80
export const MEDIUM_MIN_COLUMNS = 50

// Cells kept free at the right edge for Claude Code's own padding. Taken from claude-hud's
// practice, not from documentation; revisit when Phase E measures real terminals.
const RIGHT_RESERVE = 4

// What to fit to when the terminal has not said how wide it is. Something has to bound the
// line: without a bound, a long model and project name draw a row wider than most terminals
// and wrap. 80 is the width a terminal that declares nothing is least likely to be under.
export const ASSUMED_COLUMNS = 80

/** 'wide' | 'medium' | 'narrow'. An unknown width is narrow: never guess a wide terminal. */
export function breakpointOf(columns) {
  if (!Number.isInteger(columns) || columns <= 0) return 'narrow'
  if (columns >= WIDE_MIN_COLUMNS) return 'wide'
  if (columns >= MEDIUM_MIN_COLUMNS) return 'medium'
  return 'narrow'
}

/**
 * Cells a line may use, or undefined when the width is unknown.
 *
 * Never more than the terminal said it has. An earlier version floored this at 10 cells, so a
 * terminal declaring 8 columns was handed 10 and wrapped -- and the test asserted the floor,
 * which kept the defect green.
 */
export function usableColumns(columns) {
  if (!Number.isInteger(columns) || columns <= 0) return undefined
  return Math.max(1, columns - RIGHT_RESERVE)
}

/**
 * { filled, empty } cell counts for a meter of `cells` cells.
 *
 * Rounding decides the two ends, and both ends carry meaning a plain round gets wrong. Only
 * 100% fills every cell: with ten cells, a plain round made 95%, 96%, 99% and 100% draw the
 * same completely full meter, which hides the distinction exactly where it matters most. And
 * any value above zero keeps at least one cell, so "barely started" is visible as different
 * from "nothing at all". In between, the nearest cell is still the nearest cell.
 */
export function barCells(percent, cells) {
  const clamped = Math.min(100, Math.max(0, percent))
  if (clamped >= 100) return { filled: cells, empty: 0 }
  if (clamped <= 0) return { filled: 0, empty: cells }
  const nearest = Math.round((clamped / 100) * cells)
  const filled = Math.max(1, Math.min(cells - 1, nearest))
  return { filled, empty: cells - filled }
}

/**
 * "1d6h", "2h10m", "42m", "<1m". `ms` is the time remaining. Two units at most, and never a
 * leading zero unit: an hour count of zero is noise, not precision.
 */
export function formatCountdown(ms) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
  return `${Math.floor(hours / 24)}d${hours % 24}h`
}

/**
 * When a window resets, as a countdown: one form for every window, as the design spec draws it.
 * It used to name the weekday beyond 24 hours, which made the weekly chip read differently from
 * the one beside it. Returns '' when the moment is unknown or already past.
 */
export function formatReset(resetsAt, now) {
  if (!Number.isFinite(resetsAt) || !Number.isFinite(now) || resetsAt <= now) return ''
  return formatCountdown(resetsAt - now)
}

/** "10:42", 24-hour, in `timeZone` (the host's when undefined). '' when it cannot be formatted. */
export function formatClock(at, timeZone) {
  if (!Number.isFinite(at)) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(at))
  } catch {
    return ''
  }
}

/**
 * Joins segments into one line that fits `maxWidth` cells.
 *
 * A segment is { plain, styled, priority, atoms }: `plain` is measured, `styled` is printed,
 * the segment with the highest priority number is dropped first, and `atoms` counts the
 * separate things it tells you -- a quota with its reset time carries two, a quota alone one.
 * When a single segment is still too wide it is cut, unstyled. `maxWidth` undefined means no
 * limit.
 */
export function fitLine(segments, separator, maxWidth, ellipsis) {
  return composeLine(segments, separator, maxWidth, ellipsis).styled
}

/** As fitLine, but also returns the plain text, so a caller can measure what it built. */
export function composeLine(segments, separator, maxWidth, ellipsis) {
  const kept = segments.filter(segment => segment && segment.plain !== '')
  // A separator may be a function of the two segments it stands between, so that what joins two
  // things can say how they relate -- and is worked out again whenever a segment is dropped.
  const between = typeof separator === 'function' ? separator : () => separator
  const joined = (list, key) => list.map((segment, i) => (i === 0 ? '' : between(list[i - 1], segment)[key]) + segment[key]).join('')
  const widthOf = list => displayWidth(joined(list, 'plain'))

  if (maxWidth !== undefined) {
    while (kept.length > 1 && widthOf(kept) > maxWidth) {
      let drop = 0
      for (let i = 1; i < kept.length; i++) if (kept[i].priority >= kept[drop].priority) drop = i
      kept.splice(drop, 1)
    }
    if (kept.length === 1 && widthOf(kept) > maxWidth) {
      const cut = truncate(kept[0].plain, maxWidth, ellipsis)
      return { styled: cut, plain: cut, kept: 1, atoms: kept[0].atoms ?? 1, truncated: true }
    }
  }
  return {
    styled: joined(kept, 'styled'),
    plain: joined(kept, 'plain'),
    kept: kept.length,
    atoms: kept.reduce((sum, segment) => sum + (segment.atoms ?? 1), 0),
    truncated: false,
  }
}

/**
 * Puts `left` at the left edge and `right` at the right edge of a `maxWidth` row.
 *
 * This is what makes the result read as a status *bar* rather than a paragraph: two anchors
 * with the terminal's own width between them, instead of a short block hugging the left
 * margin. The gap is plain spaces -- a rule drawn through it competes with the meter, which
 * is also a horizontal line, and the eye then has two rails to follow instead of one.
 *
 * Returns null when the two would not fit, so the caller can fall back to stacking them.
 */
export function spreadLine(left, right, maxWidth, minimumGap = 3) {
  if (maxWidth === undefined || left.plain === '' || right.plain === '') return null
  const gap = maxWidth - displayWidth(left.plain) - displayWidth(right.plain)
  if (gap < minimumGap) return null
  return left.styled + ' '.repeat(gap) + right.styled
}
