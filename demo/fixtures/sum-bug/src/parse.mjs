export function parseList(text) {
  return text.split(',').map((part) => Number(part.trim())).filter((n) => !Number.isNaN(n))
}
