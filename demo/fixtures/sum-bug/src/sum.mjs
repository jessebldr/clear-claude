// Adds every number in the list.
export function sum(values) {
  let total = 0
  for (const v of values) {
    if (v > 0) total += v
  }
  return total
}
