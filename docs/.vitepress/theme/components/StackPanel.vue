<script setup lang="ts">
defineProps<{
  stack: 'newrelic' | 'datadog' | 'opentelemetry'
}>()
</script>

<template>
  <section class="o11y-stack-panel" :data-o11y-stack-panel="stack">
    <slot />
  </section>
</template>
