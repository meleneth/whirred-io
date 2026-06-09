---
layout: home

hero:
  name: whirred.io
  text: Practical engineering notes
  tagline: Build logs, architecture sketches, and lessons from shipping software.
  actions:
    - theme: brand
      text: Start reading
      link: /articles/

features:
  - title: Dark First
    details: Theme defaults to dark mode while preserving appearance controls.
  - title: Mermaid Ready
    details: Use mermaid fenced blocks to turn docs into living diagrams.
  - title: Highlighted Code
    details: VitePress + Shiki for clean syntax highlighting with line numbers.
---

## Article drafts

- [How I Scaffolded an Entire Distributed Platform in 10 Minutes](/articles/series/IAM-System-Demo/distributed-platform-in-10-minutes)
- [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)
- [Finer Points of Exception Handling](/articles/finer-points-exception-handling)

## Mermaid preview

```mermaid
flowchart LR
  A[Draft Post] --> B[Review]
  B --> C[Publish]
  C --> D[Share]
```

## Code highlighting preview

```ts
export function publishPost(title: string): string {
  return `Published: ${title}`
}
```
