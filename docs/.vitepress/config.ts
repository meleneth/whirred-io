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
            { text: 'Articles', link: '/articles/' },
            { text: 'Guide', link: '/guide/getting-started' }
        ],
        sidebar: [
            {
                text: 'Articles',
                items: [
                    { text: 'All Articles', link: '/articles/' },
                    {
                        text: 'GraphQL Auth Explosion Case Study',
                        collapsed: false,
                        items: [
                            { text: 'Series Home', link: '/articles/series/IAM-System-Demo/iam-system-demo' },
                            { text: 'Overview', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study' },
                            { text: 'Part 1: CTE', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-1-cte' },
                            { text: 'Part 2: Multiple Object Retrieval', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval' },
                            { text: 'Part 3: Multiple Object Authorization', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization' },
                            { text: 'Part 4: Redis Cache', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service' },
                            { text: 'Part 5: Smart APIs', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis' },
                            { text: 'Part 6: Async MADNESS', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-async-madness' },
                            { text: 'Part 7: GraphQL and Dataloader', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-7-graphql-and-dataloader' },
                            { text: 'Part 8: Falcon', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-part-8-falcon' },
                            { text: 'Conclusion', link: '/articles/series/IAM-System-Demo/graphql-auth-explosion-conclusion' }
                        ]
                    },
                    {
                        text: 'Developer Affordances',
                        collapsed: false,
                        items: [
                            { text: 'Scaffold: Distributed Platform', link: '/articles/series/IAM-System-Demo/dev-affordances-distributed-platform-in-10-minutes' },
                            { text: 'ActiveResource Default Implementation', link: '/articles/series/IAM-System-Demo/dev-affordances-activeresource-default-implementation' },
                            { text: 'Creating a Million Users', link: '/articles/series/IAM-System-Demo/dev-affordances-creating-a-million-users' },
                            { text: 'Devcontainers for Local Systems', link: '/articles/series/IAM-System-Demo/devcontainers-for-local-distributed-systems' },
                            { text: 'Foreman Process Orchestration', link: '/articles/series/IAM-System-Demo/foreman-for-local-process-orchestration' }
                        ]
                    },
                    {
                        text: 'Engineering Essays',
                        collapsed: false,
                        items: [
                            { text: 'Finer Points of Exception Handling', link: '/articles/finer-points-exception-handling' }
                        ]
                    }
                ]
            },
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
