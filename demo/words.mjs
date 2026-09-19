// Words in the assistant's text in the newest Claude Code transcript of a project directory.
// usage: node words.mjs <absolute project dir>
// The count comes from the session that was just recorded, so the number on the banner is the
// number of words on screen, not an estimate and not a different run.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const project = process.argv[2]
const slug = project.replace(/[^A-Za-z0-9]/g, '-')
const dir = join(homedir(), '.claude', 'projects', slug)
const newest = readdirSync(dir)
  .filter(name => name.endsWith('.jsonl'))
  .map(name => join(dir, name))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]

const rows = readFileSync(newest, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  })
  .filter(Boolean)

const text = rows
  .filter(row => row.type === 'assistant')
  .flatMap(row => (row.message?.content ?? []).filter(part => part.type === 'text').map(part => part.text))
  .join(' ')

console.log(text.split(/\s+/).filter(Boolean).length)
