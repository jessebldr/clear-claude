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
//   names      a plugin's directory, manifest name and marketplace entry are one slug, and
//              `renames` stays resolvable.
//   prompt     the Clear Partner style's SHA-256 and size are recorded in two documents, and
//              source/clear-partner.md carries the same body. Nothing else validates the style.
//   vocabulary the former plugin id may appear only where history is recorded.
//   links      relative links and their #anchors in Markdown resolve.

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

// Where the former id `clear-claude@clear-claude` and its relatives are history, not drift.
const LEGACY_ALLOWED = [
  /^CHANGELOG\.md$/,
  /^docs\/migration\.md$/,
  /^docs\/adr\//,
  /^docs\/research\//,
  /^docs\/clear-ui-dogfood\.md$/,
  /^demo\/runs\//,
  /^plugins\/clear-partner\/skills\/clear-(doctor|audit)\/SKILL\.md$/,
  /^scripts\/check-repo\.mjs$/,
  /^README\.md$/, // one pointer to docs/migration.md; checked separately below
  /^AGENTS\.md$/,
  /^llms\.txt$/,
]
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

  for (const [from, to] of Object.entries(marketplace.renames ?? {})) {
    if (listed.has(from)) fail('names', `renames: "${from}" is still listed in plugins[], so it would never migrate`)
    if (to !== null && !listed.has(to) && !(to in marketplace.renames)) {
      fail('names', `renames: "${from}" points at "${to}", which is neither listed nor renamed`)
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

  const source = read(STYLE_SOURCE).replace(/\r\n/g, '\n')
  const shippedWithoutFlag = text.split('\n').filter((line) => line !== 'force-for-plugin: true').join('\n')
  if (source !== shippedWithoutFlag) fail('prompt', `${STYLE_SOURCE} no longer differs from the shipped style by exactly the force-for-plugin line`)
}

function checkVocabulary(files) {
  for (const path of files) {
    if (!/\.(md|mjs|json|ya?ml|sh|tape|txt)$/.test(path)) continue
    if (LEGACY_ALLOWED.some((allowed) => allowed.test(path))) continue
    const lines = read(path).split('\n')
    lines.forEach((line, index) => {
      for (const [pattern, what] of LEGACY_PATTERNS) {
        if (pattern.test(line)) fail('vocabulary', `${path}:${index + 1} uses ${what}`)
      }
    })
  }
  // The README may name the former id once, to send its owners to the migration page.
  const readme = read('README.md')
  const legacy = readme.split('\n').filter((line) => LEGACY_PATTERNS.some(([pattern]) => pattern.test(line)))
  if (legacy.length > 1) fail('vocabulary', `README.md names the former plugin ${legacy.length} times; only the pointer to docs/migration.md may`)
}

// GitHub's heading anchors: lower-case, drop everything but word characters, spaces and
// hyphens, then spaces to hyphens. Inline code and links contribute their text.
function anchorsOf(markdown) {
  const seen = new Map()
  const anchors = new Set()
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const heading = fenced ? null : /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (!heading) continue
    const text = heading[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '')
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    anchors.add(count === 0 ? base : `${base}-${count}`)
  }
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
      for (const match of line.replace(/`[^`]*`/g, '').matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = match[1]
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
