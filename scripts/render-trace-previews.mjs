import { readFileSync, writeFileSync } from 'node:fs'
import { buildTrace, visibleRows, durationLabel, serviceColor } from '../docs/.vitepress/theme/components/traceModel.mjs'
const catalog = JSON.parse(readFileSync('docs/.vitepress/theme/data/iam-traces.json', 'utf8'))
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
for (const entry of catalog) {
 const model = buildTrace(JSON.parse(readFileSync(`docs/public${entry.file}`, 'utf8')))
 // Preserve every recorded span in downloadable static waterfalls too.
 const rows = visibleRows(model).map(row => row.node)
 const height = 112 + rows.length * 29
 const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}" role="img" aria-labelledby="title desc">`, `<title id="title">${escape(entry.title)}</title><desc id="desc">All recorded spans, nested beneath their parent; siblings in start order. ${rows.length} spans; no span-kind filtering. Every span in this example is available in the interactive viewer.</desc>`, `<rect width="960" height="${height}" rx="10" fill="#101827"/>`, `<g font-family="system-ui,sans-serif" fill="#e2e8f0"><text x="18" y="29" font-size="18" font-weight="600">${escape(entry.title)}</text><text x="18" y="52" font-size="12" fill="#aabbd0">${rows.length} recorded spans · ${escape(durationLabel(model.duration))} envelope · each preview has its own time scale</text>`]
 for (let i = 0; i <= 4; i++) {
  const x = 420 + i * 129
  parts.push(`<path d="M${x} 80V${height - 10}" stroke="#2b3b50"/><text x="${x}" y="74" text-anchor="${i === 4 ? 'end' : 'start'}" font-size="10" fill="#aabbd0">${escape(durationLabel(model.duration * i / 4))}</text>`)
 }
 rows.forEach((s, i) => {
  const y = 96 + i * 29
  let depth = 0
  for (let parent = s.parent; parent; parent = parent.parent) depth++
  const x = 18 + depth * 10
  const maxChars = Math.max(6, Math.floor((402 - x) / 7))
  const label = s.displayName.length > maxChars ? s.displayName.slice(0, maxChars - 1) + '…' : s.displayName
  if (depth) parts.push(`<path d="M${x - 12} ${y - 22}V${y - 3}H${x - 3}" stroke="#61738c" fill="none"/>`)
  parts.push(`<g data-span-id="${s.spanID}"><title>${escape(s.displayName)} · ${escape(s.service)} · +${escape(durationLabel(s.startTime - model.start))} · ${escape(durationLabel(s.duration))}</title><text x="${x}" y="${y}" font-size="12">${escape(label)}</text><text x="${x}" y="${y + 11}" font-size="9" fill="#aabbd0">${escape(s.service)} · ${escape(durationLabel(s.duration))}</text><rect x="${420 + 516 * (s.startTime - model.start) / model.duration}" y="${y - 8}" width="${Math.max(2, 516 * s.duration / model.duration)}" height="15" rx="2" fill="${serviceColor(s.service)}"/></g>`)
 })
 parts.push('</g></svg>')
 writeFileSync(`docs/public/traces/iam/${entry.id}.svg`, parts.join('\n'))
}
