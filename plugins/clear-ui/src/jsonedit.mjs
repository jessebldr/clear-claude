// Pure. No I/O, no Node API.
//
// Surgical edits to one top-level key of a JSON document, on the raw text.
//
// Why not parse-modify-stringify: settings.json belongs to the user. Re-serialising it would
// reorder nothing but would reformat everything — indentation, blank lines, key spacing — and
// a diff of the whole file is exactly what a tool editing someone's settings must not produce.
// Editing the text means every byte we did not intend to touch is still the byte it was.

const isSpace = char => char === ' ' || char === '\t' || char === '\n' || char === '\r'

const skipSpace = (text, i) => {
  while (i < text.length && isSpace(text[i])) i++
  return i
}

/** Index just past the string literal starting at `i`. */
function skipString(text, i) {
  i++
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2
      continue
    }
    if (text[i] === '"') return i + 1
    i++
  }
  return i
}

/** Index just past the value starting at or after `i`. */
function skipValue(text, i) {
  i = skipSpace(text, i)
  const char = text[i]
  if (char === '"') return skipString(text, i)
  if (char === '{' || char === '[') {
    const close = char === '{' ? '}' : ']'
    let depth = 0
    while (i < text.length) {
      if (text[i] === '"') {
        i = skipString(text, i)
        continue
      }
      if (text[i] === char) depth++
      else if (text[i] === close) {
        depth--
        if (depth === 0) return i + 1
      }
      i++
    }
    return i
  }
  while (i < text.length && text[i] !== ',' && text[i] !== '}' && !isSpace(text[i])) i++
  return i
}

/**
 * Locates a top-level key's `"name": value` pair.
 * @returns { start, end } byte offsets, or null when the key or a JSON object is absent
 */
export function locateKey(text, key) {
  let i = skipSpace(text, 0)
  if (text[i] !== '{') return null
  i++
  while (i < text.length) {
    i = skipSpace(text, i)
    if (text[i] === '}') return null
    if (text[i] === ',') {
      i++
      continue
    }
    if (text[i] !== '"') return null
    const start = i
    const afterKey = skipString(text, i)
    let name
    try {
      name = JSON.parse(text.slice(start, afterKey))
    } catch {
      return null
    }
    const colon = skipSpace(text, afterKey)
    if (text[colon] !== ':') return null
    const end = skipValue(text, colon + 1)
    if (name === key) return { start, end }
    i = end
  }
  return null
}

/** True when the document is an object with no keys. */
function isEmptyObject(text) {
  const open = skipSpace(text, 0)
  if (text[open] !== '{') return false
  return text[skipSpace(text, open + 1)] === '}'
}

/**
 * Sets one top-level key, replacing its pair in place or inserting it as the first key.
 * Every other byte of `text` is preserved.
 */
export function setKey(text, key, value, indent = '  ') {
  const pair = `${JSON.stringify(key)}: ${JSON.stringify(value, null, indent).split('\n').join(`\n${indent}`)}`
  const found = locateKey(text, key)
  if (found) return text.slice(0, found.start) + pair + text.slice(found.end)

  const open = text.indexOf('{')
  if (open === -1) return `{\n${indent}${pair}\n}\n`
  const comma = isEmptyObject(text) ? '' : ','
  return `${text.slice(0, open + 1)}\n${indent}${pair}${comma}${text.slice(open + 1)}`
}

/**
 * Removes one top-level key together with the separator that joined it to its neighbours, so
 * that `removeKey(setKey(text, …), …)` returns `text` unchanged.
 */
export function removeKey(text, key) {
  const found = locateKey(text, key)
  if (!found) return text
  let { start, end } = found

  const afterValue = skipSpace(text, end)
  let tookComma = false
  if (text[afterValue] === ',') {
    end = afterValue + 1
  } else {
    // Last key in the object: the comma that precedes it goes instead, taking the whitespace
    // between itself and this key along with it.
    let before = start
    while (before > 0 && isSpace(text[before - 1])) before--
    if (text[before - 1] === ',') {
      start = before - 1
      tookComma = true
    }
  }
  if (!tookComma) {
    // Take the line this key sat on, so neither a blank line nor a stray indent is left.
    while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--
    if (text[start - 1] === '\n') {
      start--
      if (text[start - 1] === '\r') start--
    }
  }
  return text.slice(0, start) + text.slice(end)
}
