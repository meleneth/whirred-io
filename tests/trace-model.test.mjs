import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { buildTrace, visibleRows } from '../docs/.vitepress/theme/components/traceModel.mjs'
const span = (id, start, parent, overrides = {}) => ({ spanID: id, traceID: 'trace', operationName: id, startTime: start, duration: 10, processID: 'p', tags: [], references: parent ? [{ refType: 'CHILD_OF', traceID: 'trace', spanID: parent }] : [], ...overrides })
const payload = spans => ({ data: [{ traceID: 'trace', spans, processes: { p: { serviceName: 'service' } } }] })
test('child-before-parent ordering, multiple roots, orphan and cross-trace links remain navigable', () => {
 const m = buildTrace(payload([span('child', 12, 'root'), span('root', 10), span('orphan', 30, 'missing'), span('external', 40, 'root', { references: [{ refType: 'CHILD_OF', traceID: 'other', spanID: 'root' }] })]))
 assert.deepEqual(visibleRows(m).map(r => [r.node.spanID, r.depth]), [['root', 0], ['child', 1], ['orphan', 0], ['external', 0]])
 assert.equal(m.duration, 40)
 assert.equal(visibleRows(m, { collapsed: new Set(['root']) }).length, 3)
 assert.deepEqual(visibleRows(m, { collapsed: new Set(['root']), query: 'child' }).map(r => r.node.spanID), ['root', 'child'])
 assert.equal(visibleRows(m, { service: 'absent' }).length, 0)
})
test('cycles do not hang or hide spans; invalid exports fail clearly', () => {
 const m = buildTrace(payload([span('a', 0, 'b'), span('b', 1, 'a'), span('self', 2, 'self')]))
 assert.equal(visibleRows(m).length, 3)
 assert.throws(() => buildTrace(payload([])), /No spans/)
 assert.throws(() => buildTrace(payload([span('a', 0), span('a', 1)])), /duplicate/)
 assert.throws(() => buildTrace(payload([span('a', NaN)])), /Invalid/)
})
test('all published traces retain full trees, match manifest hashes, and fit hosting budget', () => {
 const catalog = JSON.parse(readFileSync('docs/.vitepress/theme/data/iam-traces.json'))
 let total = 0
 for (const entry of catalog) {
  const bytes = readFileSync(`docs/public${entry.file}`)
  const m = buildTrace(JSON.parse(bytes))
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  assert.equal(bytes.length, entry.bytes)
  assert.equal(m.trace.traceID, entry.traceID)
  assert.equal(visibleRows(m).length, entry.spans)
  assert.ok(entry.bytes < 1_000_000)
  if (entry.kind === 'subtree') {
   assert.equal(m.roots.length, 1)
   assert.equal(m.roots[0].spanID, entry.rootSpanID)
   assert.ok(entry.sourceSpans > entry.spans)
  } else assert.ok(entry.sourceBytes < 1_500_000)
  assert.ok(statSync(`docs/public/traces/iam/${entry.id}.svg`).size > 0)
  total += bytes.length
 }
 assert.ok(total < 4_000_000)
})
