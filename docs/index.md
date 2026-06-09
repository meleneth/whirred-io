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
  - title: Case Studies
    details: Deep dives into systems as they get built, stressed, and reshaped.
  - title: Developer Affordances
    details: Notes on the tools and patterns that make distributed work tractable.
  - title: Engineering Essays
    details: Standalone arguments about code, operations, and maintainability.
---

## Start Here

- [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)
- [Developer Affordances](/articles/#developer-affordances)
- [Finer Points of Exception Handling](/articles/finer-points-exception-handling)

## Diagram Preview

```mermaid
flowchart LR
  Problem[Case Study] --> Affordances[Developer Affordances]
  Problem --> Essays[Engineering Essays]
  Affordances --> BetterWork[Better Local Workflows]
```

## Code Highlighting Preview

```ts
export function publishPost(title: string): string {
  return `Published: ${title}`
}
```
