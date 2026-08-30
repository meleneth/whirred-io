# GraphQL Auth Explosion Case Study, Part 2: Multiple Object Retrieval

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: waiting on reproducible retrieval-mode benchmark
>
> Publication work is intentionally paused pending the experiment described in
> `TODO_FOR_ARTICLE.md` in the `iam-system-demo` repository. The full-organization
> User Management workload needs a runtime switch between serial, one-object-at-a-time
> retrieval and batched collection retrieval so this article can compare the same
> endpoint, fixture, authorization mode, and cache state.

## Multiple Object Retrieval

When fetching a large number of objects from a remote service, one at a time is a latency death sentence. We can provide an array of id's to be fetched, and reduce request latency overall. We started by implementing this at the REST request level, to get timings of improvements from OpenTelemetry in the Jaeger interface for viewing spans. It turns out, we can load up to 500 of these by providing an array of UUIDs with current system configuration.

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

  UM->>AS: GET /accounts?id[]=id1&id[]=id2&id[]=id3
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

  UM->>US: GET /users?account_id[]=account1&account_id[]=account2
  US->>DB: SELECT users WHERE account_id IN (...)
  DB-->>US: users joined by account_id
  US-->>UM: [user1, user2, user3, ...]

  Note over UM,US: The caller supplies multiple account_id join keys,<br/>not a free-form search
```

Previous: [Part 1: CTE](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-1-cte)  
Next: [Part 3: Multiple Object Authorization](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization)
