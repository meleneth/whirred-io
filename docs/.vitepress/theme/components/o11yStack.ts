import { reactive } from 'vue'

export type O11yStack = 'newrelic' | 'datadog' | 'opentelemetry'

export const o11yStackState = reactive({
  activeStack: 'newrelic' as O11yStack,
  hydrated: false
})

export function setO11yStack(stack: O11yStack) {
  o11yStackState.activeStack = stack
}
