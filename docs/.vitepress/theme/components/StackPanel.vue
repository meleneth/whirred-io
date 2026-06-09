<script setup lang="ts">
import { computed } from 'vue'
import { o11yStackState, type O11yStack } from './o11yStack'

const props = defineProps<{
  stack: O11yStack
}>()

const isVisible = computed(() => {
  return !o11yStackState.hydrated || o11yStackState.activeStack === props.stack
})
</script>

<template>
  <section
    v-show="isVisible"
    class="o11y-stack-panel"
    :data-o11y-stack-panel="stack"
  >
    <slot />
  </section>
</template>
