import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const config = defineConfig({
    title: 'whirred.io',
    description: 'Engineering notes, product updates, and technical deep dives.',
    lang: 'en-US',
    cleanUrls: true,
    appearance: 'dark',
    lastUpdated: true,
    head: [
        ['meta', { name: 'theme-color', content: '#0f172a' }],
        [
            'script',
            {},
            "(() => { try { const key = 'vitepress-theme-appearance'; if (!localStorage.getItem(key)) localStorage.setItem(key, 'dark'); } catch (_) {} })();"
        ]
    ],
    themeConfig: {
        siteTitle: 'whirred.io',
        nav: [
            { text: 'Home', link: '/' },
            { text: 'Guide', link: '/guide/getting-started' }
        ],
        sidebar: [
            {
                text: 'Guide',
                items: [{ text: 'Getting Started', link: '/guide/getting-started' }]
            }
        ]
    },
    markdown: {
        theme: {
            light: 'github-light',
            dark: 'github-dark'
        },
        lineNumbers: true
    },
    mermaid: {
        theme: 'dark'
    }
})

export default withMermaid(config)
