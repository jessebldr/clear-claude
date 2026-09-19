// Node-only: reads the statusline JSON Claude Code pipes in.
//
// Never rejects and never waits for EOF. A parent that keeps the pipe open must not be able
// to keep this process alive, so the payload is parsed as soon as it is complete and every
// wait is bounded. Anything unexpected resolves to null, which draws nothing.

export const FIRST_BYTE_TIMEOUT_MS = 400
export const TOTAL_TIMEOUT_MS = 1000
export const MAX_BYTES = 256 * 1024

function parseObject(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/** Resolves to the parsed object, or null on a TTY, timeout, oversized or malformed input. */
export function readStdin(stream, limits = {}) {
  const firstByteTimeoutMs = limits.firstByteTimeoutMs ?? FIRST_BYTE_TIMEOUT_MS
  const totalTimeoutMs = limits.totalTimeoutMs ?? TOTAL_TIMEOUT_MS
  const maxBytes = limits.maxBytes ?? MAX_BYTES

  return new Promise(resolve => {
    if (stream.isTTY) return resolve(null)

    const chunks = []
    let bytes = 0
    let settled = false
    const timers = []

    const settle = value => {
      if (settled) return
      settled = true
      timers.forEach(clearTimeout)
      stream.removeListener('data', onData)
      stream.removeListener('end', onEnd)
      stream.removeListener('error', onError)
      stream.pause()
      resolve(value ?? null)
    }
    const text = () => Buffer.concat(chunks).toString('utf8')
    const onData = chunk => {
      bytes += chunk.length
      if (bytes > maxBytes) return settle(null)
      chunks.push(chunk)
      const parsed = parseObject(text())
      if (parsed !== undefined) settle(parsed)
    }
    const onEnd = () => settle(parseObject(text()))
    const onError = () => settle(null)

    timers.push(setTimeout(() => bytes === 0 && settle(null), firstByteTimeoutMs))
    timers.push(setTimeout(() => settle(null), totalTimeoutMs))
    stream.on('data', onData)
    stream.on('end', onEnd)
    stream.on('error', onError)
  })
}
