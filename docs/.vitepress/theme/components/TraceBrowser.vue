<script setup>
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue'
import { withBase } from 'vitepress'
import catalog from '../data/iam-traces.json'
import { buildTrace, visibleRows, durationLabel, serviceColor } from './traceModel.mjs'

const props = defineProps({ initialTrace: { type: String, default: '' }, embedded: Boolean })
const active = ref(props.initialTrace || catalog[0].id)
const model = shallowRef(null)
const selected = ref('')
const collapsed = ref(new Set())
const query = ref('')
const service = ref('')
const zoom = ref(1)
const loading = ref(false)
const error = ref('')
const scrollPane = ref(null)
let controller
const entry = computed(() => catalog.find(t => t.id === active.value))
const rows = computed(() => model.value ? visibleRows(model.value, { collapsed: collapsed.value, query: query.value, service: service.value }) : [])
const labelWidth = computed(() => Math.max(380, 200 + Math.max(0, ...rows.value.map(row => row.depth)) * 12))
const detail = computed(() => model.value?.nodes.get(selected.value))
function writeURL() {
  if (props.embedded) return
  const url = new URL(window.location.href)
  url.searchParams.set('trace', active.value)
  if (selected.value) url.searchParams.set('span', selected.value)
  else url.searchParams.delete('span')
  window.history.replaceState(null, '', url)
}
async function load(id, span = '') {
  controller?.abort()
  model.value = null; error.value = ''; selected.value = ''; query.value = ''; service.value = ''; zoom.value = 1; collapsed.value = new Set()
  if (!catalog.some(t => t.id === id)) { error.value = 'This trace is not in the gallery. Choose an example below.'; loading.value = false; return }
  active.value = id
  const request = new AbortController(); controller = request; loading.value = true
  try {
    const response = await fetch(withBase(entry.value.file), { signal: request.signal })
    if (!response.ok) throw new Error(`Trace download failed (${response.status}).`)
    const parsed = buildTrace(await response.json())
    if (request.signal.aborted) return
    model.value = parsed
    selected.value = parsed.nodes.has(span) ? span : parsed.roots[0].spanID
    writeURL()
  } catch (e) { if (!request.signal.aborted) error.value = e.message || 'Unable to read this trace.' }
  finally { if (controller === request) loading.value = false }
}
function readURL() {
  const url = new URL(window.location.href)
  load(url.searchParams.get('trace') || catalog[0].id, url.searchParams.get('span') || '')
}
function selectSpan(id) { selected.value = id; writeURL() }
function toggle(id) {
  const next = new Set(collapsed.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsed.value = next
}
function focusSpan() {
  const node = detail.value
  if (!node) return
  zoom.value = Math.min(32, Math.max(1, model.value.duration / Math.max(node.duration, 1) / 1.5))
  requestAnimationFrame(() => {
    if (scrollPane.value) scrollPane.value.scrollLeft = ((node.startTime - model.value.start) / model.value.duration) * 650 * zoom.value
  })
}
onMounted(() => {
  if (props.embedded) load(props.initialTrace)
  else { readURL(); window.addEventListener('popstate', readURL) }
})
onBeforeUnmount(() => { controller?.abort(); window.removeEventListener('popstate', readURL) })
</script>

<template>
  <section class="trace-browser" :style="{ '--trace-label-width': `${labelWidth}px` }" aria-label="Interactive Jaeger trace browser">
    <label v-if="!embedded" class="trace-picker">Example
      <select :value="active" @change="load($event.target.value)"><option v-for="item in catalog" :key="item.id" :value="item.id">{{ item.title }}</option></select>
    </label>
    <p v-if="entry"><a :href="entry.jaeger" target="_blank" rel="noopener">Open this trace in Jaeger</a> · <a :href="withBase(entry.file)" download>Download complete Jaeger JSON</a> · {{ (entry.bytes / 1000).toFixed(1) }} kB</p>
    <p v-if="loading" role="status">Loading trace…</p>
    <p v-if="error" role="alert">{{ error }} <button @click="load(active)">Retry</button></p>
    <template v-if="model">
      <p><strong>{{ model.nodes.size }} spans</strong> · {{ model.services.length }} services · {{ durationLabel(model.duration) }} elapsed span envelope</p>
      <p v-if="entry?.railsProcessesStable" class="trace-note">Measured after Rails workload warmup with unchanged server processes. ActiveRecord query caching remains enabled; Solid Cache is removed. Cold Redis examples clear only Redis.</p>
      <p v-if="entry?.sourceClientElapsedSeconds != null" class="trace-note">Workload client elapsed: <strong>{{ entry.sourceClientElapsedSeconds.toFixed(3) }} s</strong> · {{ entry.sourceHttpStatus ? `HTTP ${entry.sourceHttpStatus}` : entry.sourceRequestOutcome }}. This includes time outside the recorded span envelope.</p>
      <p class="trace-note">Indentation shows parent/child nesting within this example. Bars share a relative time axis. Parent durations include children; overlapping spans are not additive. Search keeps ancestors visible. The span envelope can differ from benchmark HTTP timing.</p>
      <div class="trace-controls">
        <label>Search spans and tags <input v-model="query" type="search" placeholder="e.g. /can, SELECT, graphql" /></label>
        <label>Service <select v-model="service" aria-label="Service"><option value="">All services</option><option v-for="name in model.services" :key="name">{{ name }}</option></select></label>
        <label>Zoom {{ Number(zoom).toFixed(0) }}× <input v-model.number="zoom" type="range" min="1" max="32" step="1" /></label>
        <button @click="collapsed = new Set()">Expand all</button>
        <button @click="collapsed = new Set([...model.nodes.keys()])">Collapse all</button>
        <button @click="query = ''; service = ''; zoom = 1; collapsed = new Set()">Reset view</button>
      </div>
      <div class="trace-legend"><span v-for="name in model.services" :key="name"><i :style="{ background: serviceColor(name) }"></i>{{ name }}</span></div>
      <p aria-live="polite">{{ rows.length }} of {{ model.nodes.size }} spans shown</p>
      <div ref="scrollPane" class="trace-scroll" tabindex="0" aria-label="Scrollable trace waterfall">
        <div :style="{ width: `calc(var(--trace-label-width) + ${650 * zoom}px)` }">
          <div class="trace-axis"><span>Operation / service</span><div><span>0</span><span>{{ durationLabel(model.duration / 2) }}</span><span>{{ durationLabel(model.duration) }}</span></div></div>
          <div v-for="{ node, depth } in rows" :key="node.spanID" class="trace-row" :data-depth="depth" :class="{ selected: node.spanID === selected }">
            <div class="trace-name" :style="{ paddingLeft: `${8 + depth * 12}px` }">
              <button v-if="node.children.length" class="trace-toggle" :aria-expanded="!collapsed.has(node.spanID) || !!query || !!service" :aria-label="`Toggle children of ${node.displayName}`" @click="toggle(node.spanID)">{{ collapsed.has(node.spanID) && !query && !service ? '+' : '−' }}</button>
              <span v-else class="trace-leaf">·</span>
              <button class="trace-operation" :title="`${node.service}: ${node.displayName}`" :aria-pressed="node.spanID === selected" @click="selectSpan(node.spanID)"><strong>{{ node.displayName }}</strong><small>{{ node.service }} · {{ durationLabel(node.duration) }}</small></button>
            </div>
            <button class="trace-track" :aria-label="`Inspect ${node.displayName}, ${durationLabel(node.duration)}`" @click="selectSpan(node.spanID)"><span class="trace-bar" :style="{ background: serviceColor(node.service), left: `${100 * (node.startTime - model.start) / model.duration}%`, width: `${100 * node.duration / model.duration}%` }"></span></button>
          </div>
        </div>
      </div>
      <p v-if="!rows.length">No spans match these filters.</p>
      <section v-if="detail" class="trace-detail" aria-label="Selected span details">
        <h2>Selected span: {{ detail.displayName }}</h2>
        <p>{{ detail.service }} · starts +{{ durationLabel(detail.startTime - model.start) }} · duration {{ durationLabel(detail.duration) }}</p>
        <p><code>{{ detail.spanID }}</code> · <a :href="`${embedded ? './graphql-auth-explosion-trace-browser' : ''}?trace=${active}&span=${detail.spanID}`">Link to this span</a> · <button @click="focusSpan">Zoom to span</button></p>
        <p v-if="detail.parent">Parent: <button @click="selectSpan(detail.parent.spanID)">{{ detail.parent.displayName }}</button></p>
        <template v-if="detail.tagsByKey['db.statement']"><h3>SQL executed</h3><pre>{{ detail.tagsByKey['db.statement'] }}</pre></template>
        <table><thead><tr><th>Tag</th><th>Value</th></tr></thead><tbody><tr v-for="(tag, i) in detail.tags" :key="i"><td>{{ tag.key }}</td><td><code>{{ typeof tag.value === 'object' ? JSON.stringify(tag.value) : tag.value }}</code></td></tr></tbody></table>
        <details><summary>Logs, references, warnings and process metadata</summary><pre>{{ JSON.stringify({ logs: detail.logs, references: detail.references, warnings: detail.warnings, traceWarnings: model.trace.warnings, process: model.trace.processes?.[detail.processID] }, null, 2) }}</pre></details>
      </section>
      <details><summary>Trace provenance</summary><p>Trace ID: <code>{{ entry.traceID }}</code></p><p>{{ entry.source }}</p><p>Complete export; only JSON whitespace removed. SHA-256: <code>{{ entry.sha256 }}</code></p></details>
    </template>
    <noscript>This viewer needs JavaScript. Download the Jaeger JSON files from the trace gallery to inspect them elsewhere.</noscript>
  </section>
</template>

<style scoped>
.trace-browser { --trace-label-width: 380px; margin: 24px 0; }
.trace-browser button, .trace-browser input, .trace-browser select { font: inherit; }
.trace-browser input, .trace-browser select, .trace-controls button, .trace-detail button, .trace-browser p button { border: 1px solid var(--vp-c-divider); border-radius: 5px; padding: 5px 9px; background: var(--vp-c-bg); color: var(--vp-c-text-1); }
.trace-browser button { cursor: pointer; }
.trace-browser :focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
.trace-picker, .trace-controls label { display: flex; flex-direction: column; gap: 5px; }
.trace-picker select { max-width: 100%; }
.trace-controls { display: flex; gap: 12px; flex-wrap: wrap; align-items: end; font-size: 13px; }
.trace-controls input, .trace-controls select { max-width: 230px; }
.trace-note { color: var(--vp-c-text-2); font-size: 13px; }
.trace-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 16px; font-size: 12px; }
.trace-legend i { display: inline-block; width: 10px; height: 10px; margin-right: 5px; border-radius: 2px; }
.trace-scroll { overflow: auto; max-height: 620px; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.trace-axis, .trace-row { display: grid; grid-template-columns: var(--trace-label-width) 1fr; }
.trace-axis { position: sticky; top: 0; z-index: 3; background: var(--vp-c-bg-alt); padding: 8px 0; font-size: 12px; }
.trace-axis > span { padding-left: 10px; position: sticky; left: 0; background: var(--vp-c-bg-alt); z-index: 4; }
.trace-axis > div { display: flex; justify-content: space-between; padding: 0 5px; }
.trace-row { border-top: 1px solid var(--vp-c-divider); min-height: 47px; }
.trace-row.selected { background: var(--vp-c-brand-soft); }
.trace-name { position: sticky; left: 0; z-index: 1; background: var(--vp-c-bg); display: flex; align-items: center; overflow: hidden; padding-left: 8px; border-right: 1px solid var(--vp-c-divider); }
.selected .trace-name { background: var(--vp-c-bg-alt); box-shadow: inset 3px 0 var(--vp-c-brand-1); }
.trace-toggle, .trace-leaf { flex: 0 0 24px; text-align: center; }
.trace-operation { text-align: left; overflow: hidden; flex: 1; min-width: 0; padding: 4px; }
.trace-operation strong, .trace-operation small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; line-height: 18px; }
.trace-operation small { color: var(--vp-c-text-2); font-size: 11px; }
.trace-track { position: relative; background: repeating-linear-gradient(to right, transparent 0, transparent calc(25% - 1px), var(--vp-c-divider) 25%); }
.trace-bar { position: absolute; top: 15px; height: 16px; min-width: 2px; border-radius: 3px; }
.trace-detail { border-top: 1px solid var(--vp-c-divider); margin-top: 24px; }
.trace-detail table { width: 100%; font-size: 12px; }
.trace-detail td { overflow-wrap: anywhere; min-width: 120px; }
.trace-detail pre { max-height: 360px; overflow: auto; font-size: 12px; }
.trace-browser details { overflow-wrap: anywhere; margin-top: 16px; }
:global(.Layout.wide-trace .VPDoc:not(.has-sidebar) .container), :global(.Layout.wide-trace .VPDoc:not(.has-sidebar) .content), :global(.Layout.wide-trace .VPDoc:not(.has-sidebar) .content-container) { max-width: 1280px; width: 100%; }
</style>
