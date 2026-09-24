// Jaeger timestamps and durations are microseconds. Keep raw spans intact.
export function buildTrace(payload) {
  const trace = payload?.data?.[0]
  if (!trace || !Array.isArray(trace.spans) || !trace.spans.length) throw new Error('No spans in this Jaeger export.')
  const nodes = new Map()
  for (const span of trace.spans) {
    if (!span.spanID || nodes.has(span.spanID) || !Number.isFinite(span.startTime) || !Number.isFinite(span.duration) || span.duration < 0) throw new Error('Invalid or duplicate span.')
    const tags = Object.fromEntries((span.tags || []).map(t => [t.key, t.value]))
    const endpoint = tags['http.method'] && tags['http.target']
      ? `${tags['http.method']} ${String(tags['http.target']).split('?')[0]}` : ''
    const displayName = endpoint && !/^HTTP\s+\S+$/i.test(span.operationName)
      ? `${span.operationName} · ${endpoint}` : endpoint || span.operationName
    nodes.set(span.spanID, { ...span, displayName, service: trace.processes?.[span.processID]?.serviceName || 'Unknown service', tagsByKey: tags, children: [], parent: null })
  }
  const roots = []
  for (const node of nodes.values()) {
    const ref = (node.references || []).find(r => r.refType === 'CHILD_OF' && r.traceID === trace.traceID)
    const parent = ref && nodes.get(ref.spanID)
    let ancestor = parent
    const seen = new Set([node.spanID])
    while (ancestor && !seen.has(ancestor.spanID)) { seen.add(ancestor.spanID); ancestor = ancestor.parent }
    if (parent && !ancestor) { node.parent = parent; parent.children.push(node) }
    else roots.push(node)
  }
  const sort = list => list.sort((a, b) => a.startTime - b.startTime || a.spanID.localeCompare(b.spanID))
  sort(roots)
  for (const node of nodes.values()) sort(node.children)
  const all = [...nodes.values()]
  const start = Math.min(...all.map(s => s.startTime))
  const end = Math.max(...all.map(s => s.startTime + s.duration))
  return { trace, nodes, roots, start, duration: Math.max(1, end - start), services: [...new Set(all.map(s => s.service))].sort() }
}

export function visibleRows(model, { collapsed = new Set(), query = '', service = '' } = {}) {
  const term = query.trim().toLowerCase()
  const filtering = !!(term || service)
  const included = new Set()
  if (filtering) for (const node of model.nodes.values()) {
    if ((!service || node.service === service) && (!term || `${node.operationName} ${node.service} ${node.spanID} ${JSON.stringify(node.tags || [])}`.toLowerCase().includes(term))) {
      let parent = node
      while (parent) { included.add(parent.spanID); parent = parent.parent }
    }
  }
  const rows = []
  const stack = model.roots.slice().reverse().map(node => ({ node, depth: 0 }))
  while (stack.length) {
    const row = stack.pop()
    if (filtering && !included.has(row.node.spanID)) continue
    rows.push(row)
    if (filtering || !collapsed.has(row.node.spanID)) for (const node of row.node.children.slice().reverse()) stack.push({ node, depth: row.depth + 1 })
  }
  return rows
}
export function durationLabel(us) { return us >= 1e6 ? `${(us / 1e6).toFixed(3)} s` : `${(us / 1000).toFixed(2)} ms` }
export function serviceColor(name) {
  let hash = 0
  for (const char of name) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0
  return `hsl(${hash % 360} 58% 45%)`
}
