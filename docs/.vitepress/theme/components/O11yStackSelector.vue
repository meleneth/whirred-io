<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

type Stack = 'newrelic' | 'datadog' | 'opentelemetry'

const STORAGE_KEY = 'whirred-o11y-stack'
const stacks: Array<{ value: Stack; label: string }> = [
  { value: 'newrelic', label: 'New Relic' },
  { value: 'datadog', label: 'Datadog' },
  { value: 'opentelemetry', label: 'OpenTelemetry' }
]

const activeStack = ref<Stack>('newrelic')

function applyStack(stack: Stack) {
  document.documentElement.dataset.o11yStack = stack
  document.documentElement.classList.add('o11y-stack-filtered')
}

onMounted(() => {
  const saved = window.localStorage.getItem(STORAGE_KEY) as Stack | null
  if (saved && stacks.some((stack) => stack.value === saved)) {
    activeStack.value = saved
  }

  applyStack(activeStack.value)
})

watch(activeStack, (stack) => {
  window.localStorage.setItem(STORAGE_KEY, stack)
  applyStack(stack)
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
