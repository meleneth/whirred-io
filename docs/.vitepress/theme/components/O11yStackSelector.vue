<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { o11yStackState, setO11yStack, type O11yStack } from './o11yStack'

const STORAGE_KEY = 'whirred-o11y-stack'
const stacks: Array<{ value: O11yStack; label: string }> = [
  { value: 'newrelic', label: 'New Relic' },
  { value: 'datadog', label: 'Datadog' },
  { value: 'opentelemetry', label: 'OpenTelemetry' }
]

const activeStack = computed({
  get: () => o11yStackState.activeStack,
  set: (stack: O11yStack) => setO11yStack(stack)
})

function isStack(value: string | null): value is O11yStack {
  return stacks.some((stack) => stack.value === value)
}

onMounted(() => {
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (isStack(saved)) {
    setO11yStack(saved)
  }

  o11yStackState.hydrated = true
})

watch(activeStack, (stack) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, stack)
  }
})
</script>

<template>
  <div class="o11y-stack-selector" aria-label="Observability stack selector">
    <label for="o11y-stack-select">Frame examples for</label>
    <select id="o11y-stack-select" v-model="activeStack">
      <option v-for="stack in stacks" :key="stack.value" :value="stack.value">
        {{ stack.label }}
      </option>
    </select>
  </div>
</template>
