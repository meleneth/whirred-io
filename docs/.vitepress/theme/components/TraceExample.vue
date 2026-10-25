<script setup>
import { computed } from 'vue'
import { withBase } from 'vitepress'
import catalog from '../data/iam-traces.json'

const props = defineProps({ id: { type: String, required: true }, description: { type: String, required: true } })
const entry = computed(() => catalog.find(trace => trace.id === props.id))
const preview = computed(() => withBase(`/traces/iam/${props.id}.svg`))
const browser = computed(() => `./graphql-at-scale-trace-browser?trace=${encodeURIComponent(props.id)}`)
</script>

<template>
  <figure v-if="entry" class="trace-example">
    <figcaption>{{ entry.title }}</figcaption>
    <p class="trace-example__description">{{ description }}</p>
    <div class="trace-example__window">
      <a :href="preview" :aria-label="`Open full-size preview of ${entry.title}`">
        <img :src="preview" :alt="`Waterfall preview: ${entry.title}`" loading="lazy" width="960" />
      </a>
    </div>
    <p class="trace-example__links">
      <a :href="entry.jaeger" target="_blank" rel="noopener">Open in Jaeger</a>
      <span aria-hidden="true">·</span>
      <a :href="browser">Explore all {{ entry.spans }} spans</a>
      <span aria-hidden="true">·</span>
      <a :href="preview">Full-size SVG</a>
      <span aria-hidden="true">·</span>
      <a :href="withBase(entry.file)" download>Jaeger JSON</a>
    </p>
  </figure>
</template>

<style scoped>
.trace-example { margin: 1.5rem 0 2rem; }
.trace-example figcaption { margin-bottom: .5rem; font-weight: 600; }
.trace-example__description { margin: 0 0 .75rem; color: var(--vp-c-text-2); }
.trace-example__window { max-height: 390px; overflow: auto; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: #101827; }
.trace-example__window a { display: block; width: max-content; }
.trace-example__window img { display: block; width: 960px; max-width: none; height: auto; margin: 0; }
.trace-example__links { display: flex; flex-wrap: wrap; gap: .35rem; margin: .6rem 0 0; font-size: .875rem; }
</style>
