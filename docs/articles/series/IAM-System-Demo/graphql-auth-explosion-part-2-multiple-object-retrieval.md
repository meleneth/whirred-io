# GraphQL Auth Explosion Case Study, Part 2: Multiple Object Retrieval

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: draft; retrieval-mode benchmark collected September 17, 2026.

The [measured retrieval results](./graphql-auth-explosion-results#retrieval-and-authorization) now compare serial and batched modes with the same fixture, authorization mode, and cache state.

| Deep fixture, capabilities mode, Redis disabled | Median seconds [minimum–maximum] | Outcome |
| --- | ---: | --- |
| Serial retrieval | 23.673 [21.907–25.449] | 3/3 succeeded |
| Batched retrieval | 2.076 [2.050–2.366] | 3/3 succeeded |

The ratio of medians is 11.4×. Wide serial retrieval hit the 180-second client deadline in all three runs; wide batched retrieval returned three empty HTTP replies. Neither provides a completed wide-fixture latency comparison. These retrieval traces are too large for the hosted gallery; the [eight-target hierarchy pair](./graphql-auth-explosion-traces#eight-hierarchy-calls-or-one-batch) illustrates batching at a different boundary.

## Multiple Object Retrieval

When fetching a large number of objects from a remote service, one at a time is a latency death sentence. We can provide an array of IDs and reduce request latency overall. The current resource clients use configurable chunks: `IAM_DEMO_BATCH_SIZE` defaults to 1,000 and accepts values from 1 through 10,000. OpenTelemetry traces keep each resulting HTTP request and owning-service query visible.

### One Object Per Request

```mermaid
sequenceDiagram
  autonumber
  participant UM as User Management
  participant AS as Account Service
  participant DB as Account Database

  Note over UM,AS: Once for every account ID
  loop
    UM->>AS: GET /accounts/:id
    AS->>DB: SELECT one account
    DB-->>AS: one account
    AS-->>UM: one account
  end

  Note over UM,AS: N objects become<br/>N network round trips
```

### Multiple Primary Keys in One Request

```mermaid
sequenceDiagram
  autonumber
  participant UM as User Management
  participant AS as Account Service
  participant DB as Account Database

  UM->>AS: POST /accounts/search<br/>{ id: [id1, id2, id3] }
  AS->>DB: SELECT accounts WHERE id IN (...)
  DB-->>AS: account collection
  AS-->>UM: [account1, account2, account3, ...]

  Note over UM,AS: Explicit primary keys cross the service boundary<br/>as one collection
```

### Multiple Records Through Multiple Join Keys

```mermaid
sequenceDiagram
  autonumber
  participant UM as User Management
  participant US as User Service
  participant DB as User Database

  UM->>US: POST /users/search<br/>{ account_id: [account1, account2] }
  US->>DB: SELECT users WHERE account_id IN (...)
  DB-->>US: users joined by account_id
  US-->>UM: [user1, user2, user3, ...]

  Note over UM,US: The caller supplies multiple account_id join keys,<br/>not a free-form search
```
