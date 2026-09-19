#!/usr/bin/env node
// Repository consistency checks: the facts this repo states in more than one place, and the
// names it must state in only one way. Zero dependencies; run from anywhere:
//
//   node scripts/check-repo.mjs
//
// Exit 0 when everything agrees, 1 with one line per finding otherwise. CI runs it, and
// docs/releasing.md makes it a release step. What it covers, and why each check exists:
//
//   versions   plugin.json, the marketplace entry and (clear-ui) package.json must agree;
//              Claude Code enforces none of it. The CHANGELOG must have the marketplace version.
//   names      a plugin's directory, manifest name and marketplace entry are one slug; every
//              `renames` chain ends at a listed plugin or null; no recorded rename is lost.
//   prompt     the Clear Partner style's SHA-256 and size are recorded in two documents, and
//              source/clear-partner.md carries the same body. Nothing else validates the style.
//              Both diagnostic skills name the style's qualified key, <plugin>:<style name>,
//              which is what they search for and which changes if the plugin is renamed.
//   vocabulary the former plugin id may appear only where history is recorded, plus one
//              pointer to the migration page in README.md and llms.txt.
//   links      relative inline and reference-style links in Markdown, and their #anchors,
//              resolve.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const findings = []
const fail = (check, message) => findings.push(`${check}: ${message}`)
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const readJson = (path) => JSON.parse(read(path))

const STYLE = 'plugins/clear-partner/output-styles/clear-partner.md'
const STYLE_SOURCE = 'source/clear-partner.md'
const HASH_RECORDS = ['plugins/clear-partner/skills/clear-audit/SKILL.md', 'docs/clear-partner-port.md']
const STYLE_KEYS = ['name', 'description', 'keep-coding-instructions', 'force-for-plugin']

// Renames this marketplace has published. Append-only, like the map itself: users who skipped
// a release still resolve through every entry, so one that disappears strands their install.
const RECORDED_RENAMES = { 'clear-claude': 'clear-partner' }

// Where the former id `clear-claude@clear-claude` and its relatives are history, not drift:
// records of what was typed or decided at the time, and this file's own patterns. Everything
// a user or an agent acts on — README, AGENTS.md, llms.txt, the skills, the lifecycle docs —
// is checked.
const LEGACY_ALLOWED = [
  /^CHANGELOG\.md$/,
  /^docs\/migration\.md$/,
  /^docs\/adr\//,
  /^docs\/research\//,
  /^docs\/clear-ui-dogfood\.md$/,
  /^demo\/runs\//,
  /^scripts\/check-repo\.mjs$/,
  /^scripts\/measure-plugin-loading\.sh$/, // the former id is what it installs and measures
]
// These may name the former id exactly once, to send its owners to the migration page, and
// may use none of the other legacy forms.
const MIGRATION_POINTERS = ['README.md', 'llms.txt']
const LEGACY_PATTERNS = [
  [/clear-claude@clear-claude/, 'the former plugin id'],
  [/\/clear-claude:clear-/, 'the former skill namespace'],
  [/plugins\/clear-claude\b/, 'the former plugin directory'],
  [/claude plugin (install|update|enable|disable|uninstall|details|tag) (plugins\/)?clear-claude\b/, 'a plugin command with the former name'],
  [/OWNER\/clear-claude/, 'the pre-publication OWNER placeholder'],
]

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\0').filter((path) => path && existsSync(join(ROOT, path)))
}

function checkVersionsAndNames() {
  const marketplace = readJson('.claude-plugin/marketplace.json')
  const listed = new Map(marketplace.plugins.map((entry) => [entry.name, entry]))
  const dirs = readdirSync(join(ROOT, 'plugins')).filter((name) => statSync(join(ROOT, 'plugins', name)).isDirectory())

  for (const dir of dirs) {
    const manifest = readJson(`plugins/${dir}/.claude-plugin/plugin.json`)
    if (manifest.name !== dir) fail('names', `plugins/${dir} has manifest name "${manifest.name}"`)
    const entry = listed.get(manifest.name)
    if (!entry) {
      fail('names', `plugins/${dir} is not listed in marketplace.json`)
      continue
    }
    if (entry.source !== `./plugins/${dir}`) fail('names', `marketplace source for ${dir} is "${entry.source}"`)
    if (entry.version !== manifest.version) {
      fail('versions', `${dir}: plugin.json ${manifest.version} but marketplace.json ${entry.version}`)
    }
    if ((entry.displayName ?? manifest.displayName) !== manifest.displayName) {
      fail('names', `${dir}: displayName differs between plugin.json and marketplace.json`)
    }
    const pkgPath = `plugins/${dir}/package.json`
    if (existsSync(join(ROOT, pkgPath)) && readJson(pkgPath).version !== manifest.version) {
      fail('versions', `${dir}: package.json ${readJson(pkgPath).version} but plugin.json ${manifest.version}`)
    }
  }
  for (const name of listed.keys()) {
    if (!dirs.includes(name)) fail('names', `marketplace.json lists "${name}" but plugins/${name} does not exist`)
  }

  const renames = marketplace.renames ?? {}
  for (const [from, to] of Object.entries(RECORDED_RENAMES)) {
    if (renames[from] !== to) fail('names', `renames: the published entry "${from}" → "${to}" is missing or was edited; the map is append-only`)
  }
  for (const from of Object.keys(renames)) {
    if (listed.has(from)) fail('names', `renames: "${from}" is still listed in plugins[], so it would never migrate`)
    // Follow the chain the way the loader does: to a listed plugin, to null (removed), or fail.
    const seen = new Set()
    let name = from
    while (name !== null && !listed.has(name)) {
      if (seen.has(name)) { fail('names', `renames: the chain from "${from}" loops at "${name}"`); break }
      seen.add(name)
      if (!(name in renames)) { fail('names', `renames: the chain from "${from}" ends at "${name}", which is neither listed nor renamed`); break }
      name = renames[name]
    }
  }

  const version = marketplace.metadata?.version
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) fail('versions', `marketplace metadata.version is "${version}"`)
  else if (!read('CHANGELOG.md').includes(`## [${version}]`)) {
    fail('versions', `CHANGELOG.md has no "## [${version}]" section for the marketplace version`)
  }
}

function checkPrompt() {
  const bytes = readFileSync(join(ROOT, STYLE))
  if (bytes.includes(0x0d)) {
    fail('prompt', `${STYLE} has CRLF line endings in this checkout; its hash cannot be checked (.gitattributes pins it to LF)`)
    return
  }
  const sha = createHash('sha256').update(bytes).digest('hex')
  for (const record of HASH_RECORDS) {
    const text = read(record)
    if (!text.includes(sha)) fail('prompt', `${record} does not record the style's SHA-256 ${sha}`)
    if (!new RegExp(`\\b${bytes.length}\\b`).test(text)) fail('prompt', `${record} does not record the style's size, ${bytes.length} bytes`)
  }

  const text = bytes.toString('utf8')
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)
  if (!frontmatter) return fail('prompt', `${STYLE} has no frontmatter block`)
  const keys = frontmatter[1].split('\n').filter((line) => /^\S/.test(line)).map((line) => line.split(':')[0])
  if (keys.join() !== STYLE_KEYS.join()) fail('prompt', `${STYLE} frontmatter keys are [${keys.join(', ')}]; expected [${STYLE_KEYS.join(', ')}]`)

  // The skills look for a file that takes the plugin's place in Claude Code's style table. Its
  // key is built from the plugin's name, so a rename silently points them at the wrong string.
  const styleName = /^name:\s*(.+)$/m.exec(frontmatter[1])?.[1].trim()
  const qualified = `${readJson('plugins/clear-partner/.claude-plugin/plugin.json').name}:${styleName}`
  for (const skill of ['clear-doctor', 'clear-audit']) {
    const path = `plugins/clear-partner/skills/${skill}/SKILL.md`
    if (!read(path).includes(`\`${qualified}\``)) fail('prompt', `${path} does not name the style's qualified key \`${qualified}\``)
  }

  // Only inside the frontmatter, and exactly once: the body must match line for line.
  const flagLines = frontmatter[1].split('\n').filter((line) => line === 'force-for-plugin: true')
  if (flagLines.length !== 1) fail('prompt', `${STYLE} frontmatter has ${flagLines.length} "force-for-plugin: true" lines; expected 1`)
  const sourceFrontmatter = frontmatter[1].split('\n').filter((line) => line !== 'force-for-plugin: true').join('\n')
  const shippedWithoutFlag = `---\n${sourceFrontmatter}\n---\n${text.slice(frontmatter[0].length)}`
  const source = read(STYLE_SOURCE).replace(/\r\n/g, '\n')
  if (source !== shippedWithoutFlag) fail('prompt', `${STYLE_SOURCE} no longer differs from the shipped style by exactly the force-for-plugin line`)
}

function checkVocabulary(files) {
  for (const path of files) {
    if (!/\.(md|mjs|json|ya?ml|sh|tape|txt)$/.test(path)) continue
    if (LEGACY_ALLOWED.some((allowed) => allowed.test(path))) continue
    const pointer = MIGRATION_POINTERS.includes(path)
    let pointers = 0
    read(path).split('\n').forEach((line, index) => {
      for (const [pattern, what] of LEGACY_PATTERNS) {
        const hits = line.match(new RegExp(pattern.source, 'g'))?.length ?? 0
        if (hits === 0) continue
        if (pointer && pattern === LEGACY_PATTERNS[0][0]) pointers += hits
        else fail('vocabulary', `${path}:${index + 1} uses ${what}`)
      }
    })
    if (pointers > 1) fail('vocabulary', `${path} names the former plugin id ${pointers} times; only one pointer to docs/migration.md may`)
    if (pointers === 1 && !read(path).includes('docs/migration.md')) fail('vocabulary', `${path} names the former plugin id without linking docs/migration.md`)
  }
}

// GitHub's heading anchors: lower-case, drop everything but word characters, spaces and
// hyphens, then spaces to hyphens. Inline code and links contribute their text.
// A repeated heading gets -1, -2, … and skips any slug already taken, as GitHub's slugger does.
function anchorsOf(markdown) {
  const counts = new Map()
  const anchors = new Set()
  const lines = markdown.split('\n')
  let fenced = false
  lines.forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) return
    let heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)?.[1]
    // Setext: a text line underlined with === or ---.
    if (heading === undefined && /^(=+|-+)\s*$/.test(lines[index + 1] ?? '') && /\S/.test(line) && !/^\s*([-*+>|#]|\d+\.)/.test(line)) heading = line.trim()
    if (heading === undefined) return
    const text = heading.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '')
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
    let slug = base
    while (anchors.has(slug)) {
      const next = (counts.get(base) ?? 0) + 1
      counts.set(base, next)
      slug = `${base}-${next}`
    }
    anchors.add(slug)
  })
  return anchors
}

function checkLinks(files) {
  const anchorCache = new Map()
  for (const path of files) {
    if (!path.endsWith('.md') && path !== 'llms.txt') continue
    if (path.startsWith('demo/runs/')) continue // raw model output, kept as recorded
    let fenced = false
    read(path).split('\n').forEach((line, index) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
      if (fenced) return
      const bare = line.replace(/`[^`]*`/g, '')
      const targets = [...bare.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1])
      const definition = /^\s{0,3}\[[^\]]+\]:\s+<?([^\s>]+)>?/.exec(bare) // [label]: target
      if (definition) targets.push(definition[1])
      for (const target of targets) {
        if (/^(https?:|mailto:)/.test(target)) continue
        const [file, anchor] = target.split('#')
        const resolved = file ? posix.normalize(posix.join(posix.dirname(path), decodeURIComponent(file))) : path
        if (resolved.startsWith('..') || !existsSync(join(ROOT, resolved))) {
          fail('links', `${path}:${index + 1} links to ${target}, which does not exist`)
          continue
        }
        if (!anchor || !resolved.endsWith('.md')) continue
        if (!anchorCache.has(resolved)) anchorCache.set(resolved, anchorsOf(read(resolved).replace(/\r\n/g, '\n')))
        if (!anchorCache.get(resolved).has(anchor.toLowerCase())) {
          fail('links', `${path}:${index + 1} links to ${target}, but ${resolved} has no such heading`)
        }
      }
    })
  }
}

const files = trackedFiles()
checkVersionsAndNames()
checkPrompt()
checkVocabulary(files)
checkLinks(files)

if (findings.length > 0) {
  for (const finding of findings) console.error(finding)
  console.error(`\n${findings.length} finding${findings.length === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(`check-repo: ok — versions, names, prompt record, vocabulary and links agree (${files.length} files).`)
