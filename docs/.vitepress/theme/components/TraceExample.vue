<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import TraceBrowser from './TraceBrowser.vue'
const props = defineProps({ id: { type: String, required: true } })
const container = ref(null)
const ready = ref(false)
let observer
onMounted(() => {
  if (!('IntersectionObserver' in window)) { ready.value = true; return }
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { ready.value = true; observer.disconnect() }
  }, { rootMargin: '200px' })
  observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="container" class="trace-example">
    <TraceBrowser v-if="ready" :initial-trace="props.id" embedded />
    <p v-else>Full trace waterfall loads as this example comes into view.</p>
  </div>
</template>

<style scoped>
.trace-example { min-height: 180px; margin: 24px 0; }
</style>
