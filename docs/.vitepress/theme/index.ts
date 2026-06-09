import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import O11yStackSelector from './components/O11yStackSelector.vue'
import StackPanel from './components/StackPanel.vue'
import './style.css'

const theme: Theme = {
    extends: DefaultTheme,
    enhanceApp({ app }) {
        app.component('O11yStackSelector', O11yStackSelector)
        app.component('StackPanel', StackPanel)
    }
}

export default theme
