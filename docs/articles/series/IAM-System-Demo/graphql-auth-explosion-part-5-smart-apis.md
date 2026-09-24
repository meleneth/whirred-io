# GraphQL Auth Explosion Case Study, Part 5: Smart APIs

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

## Smart APIs

The account hierarchy is a tree, but each row only knows its immediate parent through `parent_account_id`. For a deeply nested account, the useful authorization question is often: which ancestors do I need to check before I can answer `can?`?

```mermaid
flowchart LR
  classDef account fill:#0f172a,stroke:#64748b,color:#e2e8f0
  classDef selected fill:#7c2d12,stroke:#fb923c,color:#fff7ed,stroke-width:3px
  classDef ancestor fill:#064e3b,stroke:#34d399,color:#ecfdf5,stroke-width:2px
  classDef sibling fill:#1e293b,stroke:#475569,color:#cbd5e1

  RootA["Account #8f4a<br/>parent_account_id: null"]
  RootB["Account #21c9<br/>parent_account_id: null"]

  ChildA1["Account #0d12<br/>parent_account_id: 8f4a"]
  ChildA2["Account #6f12<br/>parent_account_id: 8f4a"]
  ChildB1["Account #c73b<br/>parent_account_id: 21c9"]

  LeafA1["Account #4b91<br/>parent_account_id: 0d12"]
  LeafA2["Account #de80<br/>parent_account_id: 6f12"]
  LeafA3["Account #f9ac<br/>parent_account_id: 6f12"]
  LeafB1["Account #31e7<br/>parent_account_id: c73b"]

  RootA ~~~ ChildA1
  RootA ~~~ ChildA2
  RootB ~~~ ChildB1
  ChildA1 ~~~ LeafA1
  ChildA2 ~~~ LeafA2
  ChildA2 ~~~ LeafA3
  ChildB1 ~~~ LeafB1

  ChildA1 -. "parent_account_id = 8f4a" .-> RootA
  ChildA2 -. "parent_account_id = 8f4a" .-> RootA
  ChildB1 -. "parent_account_id = 21c9" .-> RootB
  LeafA1 -. "parent_account_id = 0d12" .-> ChildA1
  LeafA2 -. "parent_account_id = 6f12" .-> ChildA2
  LeafA3 -. "parent_account_id = 6f12" .-> ChildA2
  LeafB1 -. "parent_account_id = c73b" .-> ChildB1

  class RootA,ChildA2 ancestor
  class LeafA3 selected
  class RootB,ChildA1,ChildB1,LeafA1,LeafA2,LeafB1 sibling
```

It is very common in this system to need to get the list of parent accounts for a given account because of the way Authorization works.

In the uncached case, Account Service asks Organization Service for the Account IDs belonging to the target's Organization. Organization Service caches that membership list in its own Redis instance. Account Service feeds those IDs into the recursive CTE, returns only the target's direct physical ancestors, and caches that hierarchy in its own Redis instance.

This API deliberately does not return an MSP provider Account as another
parent. Organization Service owns explicit provider/client relationships, and
Authorization Service uses them to build a separate virtual scope graph while
evaluating Group grants. Keeping the public hierarchy physical prevents an
authorization relationship from masquerading as a data-model parent link.

## Measured Evidence

The [hierarchy and batch results](./graphql-auth-explosion-results#hierarchy-traversal-and-smart-apis) measure avoided requests. Inspect the [eight individual hierarchy GETs and one batch POST](./graphql-auth-explosion-traces#eight-hierarchy-calls-or-one-batch) as complete interactive traces.
