---
layout: home

hero:
  name: whirred.io
  text: Practical engineering notes
  tagline: Build logs, architecture sketches, and lessons from shipping software.
  actions:
    - theme: brand
      text: Start reading
      link: /guide/getting-started

features:
  - title: Dark First
    details: Theme defaults to dark mode while preserving appearance controls.
  - title: Mermaid Ready
    details: Use mermaid fenced blocks to turn docs into living diagrams.
  - title: Highlighted Code
    details: VitePress + Shiki for clean syntax highlighting with line numbers.
---

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
