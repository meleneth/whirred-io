# GraphQL Auth Explosion Case Study, Part 6: GraphQL and Dataloader

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: waiting on Dataloader consistency audit; [trace evidence is available](./graphql-auth-explosion-traces#graphql-preserves-the-service-boundaries).

LLM Disclaimer:
LLM's were used in the preperation of this series of articles. For the most part I try to call out per-article if it is particularly LLM heavy, but for the most part I'm trying to keep it human-written and avoid triggering people.

## GraphQL Is Where the N+1 Comes Back

Everything up to this point can be implemented through REST APIs. Those APIs now accept collections: multiple Account IDs, multiple User `account_id` join keys, and multiple GroupUser `user_id` join keys.

GraphQL puts a convenient object graph over those service boundaries. That is useful, but it creates exactly the abstraction that made the original problem dangerous: field resolvers make remote records look local again. Dataloader is the mechanism that preserves the collection-shaped REST calls underneath that object graph.

It does not do that automatically. A Dataloader source receives a collection of keys; its implementation must actually make a collection-shaped downstream request. A source that loops over its keys is still an N+1.

## The Query We Need to Make Cheap

This is the organization-wide query used by the demo's wide-organization fixture. One client request asks for every Account, every User belonging to those Accounts, and every Group belonging to those Users:

```graphql
query OrganizationUsers($organizationId: ID!, $as: ID!) {
  organization(id: $organizationId, as: $as) {
    id
    name
    accounts {
      id
      name
      users {
        id
        email
        accountId
        groups {
          id
          name
        }
      }
    }
  }
}
```

```json
{
  "organizationId": "<wide-organization fixture ID>",
  "as": "<that organization's top-level administrator ID>"
}
```

The query looks like a tree because that is the response shape the client wants. It is not the order in which the services can retrieve the data:

```mermaid
flowchart TB
  Organization[Organization]
  Accounts[Every Account in the organization]
  Users[Every User belonging to those Accounts]
  Memberships[Every GroupUser row for those Users]
  Groups[Every Group referenced by those memberships]

  Organization --> Accounts
  Accounts --> Users
  Users --> Memberships
  Memberships --> Groups
```

The Group lookup is necessarily a second stage. The system does not know which Group records to request until the GroupUser response supplies their IDs.

## What Naïve Field Resolution Would Do

Without key collection, resolving the nested fields reproduces the cross-network N+1 at each level. The following diagram shows request shape, not authorization traffic; each downstream service still performs the authorization required for the records it returns.

```mermaid
sequenceDiagram
  autonumber
  participant GQL as GraphQL
  participant AS as Account Service
  participant US as User Service
  participant GS as Group Service

  Note over GQL,AS: Once for every Account
  loop
    GQL->>AS: GET /accounts/:id
    AS-->>GQL: one Account
  end

  Note over GQL,US: Once for every Account
  loop
    GQL->>US: GET /users?account_id=:account_id
    US-->>GQL: Users for one Account
  end

  Note over GQL,GS: Once for every User
  loop
    GQL->>GS: GET /group_users?user_id=:user_id
    GS-->>GQL: memberships for one User
  end

  Note over GQL,GS: Once for every referenced Group
  loop
    GQL->>GS: GET /groups/:id
    GS-->>GQL: one Group
  end
```

This is why “we use GraphQL” is not a performance strategy. GraphQL supplies a place to express nested work. Without a batching implementation, it becomes a very polite distributed N+1 generator.

## What Dataloader Actually Changes

When every collection fits within the configured batch size, the same logical field resolutions can become the following downstream data requests. Larger collections are split into `ceil(key count / batch size)` requests per stage; they must never fall back to one request per record.

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant GQL as GraphQL + Dataloader
  participant OS as Organization Service
  participant AS as Account Service
  participant US as User Service
  participant GS as Group Service

  C->>GQL: POST /graphql<br/>OrganizationUsers query + variables
  GQL->>OS: GET /organizations/:id
  OS-->>GQL: Organization
  GQL->>OS: GET /organization_accounts?organization_id=:id
  OS-->>GQL: account_id collection
  GQL->>AS: GET /accounts?id[]=id1&id[]=id2&...
  AS-->>GQL: Account collection

  Note over GQL,US: Account fields contribute account_id keys
  GQL->>US: POST /users/search<br/>{ account_id: [id1, id2, ...] }
  US-->>GQL: User collection

  Note over GQL,GS: User fields contribute user_id keys
  GQL->>GS: POST /group_users/search<br/>{ user_id: [id1, id2, ...] }
  GS-->>GQL: GroupUser collection containing group_id values
  GQL->>GS: POST /groups/search<br/>{ id: [id1, id2, ...] }
  GS-->>GQL: Group collection

  GQL-->>C: nested Organization to Accounts to Users to Groups response
```

The number of GraphQL field resolutions has not changed. The number and shape of network requests has. Dataloader waits until it has the keys requested for a source, calls that source once for the collected keys, and requires the source to return one result for each key in the original order.

## Collect, Fetch, Regroup

`UsersByAccountId` demonstrates the essential transformation. Many Account objects independently resolve their `users` field, but they share one source instance for the same actor and request context:

```mermaid
flowchart LR
  A1[Account A<br/>resolve users]
  A2[Account B<br/>resolve users]
  A3[Account C<br/>resolve users]
  Keys[UsersByAccountId keys<br/>A, B, C]
  Request["POST /users/search<br/>{ account_id: [A, B, C] }"]
  Response[User collection]
  Regroup[Group by user.account_id]
  Results["A to [users]<br/>B to [users]<br/>C to [users]"]

  A1 --> Keys
  A2 --> Keys
  A3 --> Keys
  Keys --> Request
  Request --> Response
  Response --> Regroup
  Regroup --> Results
```

The regrouping step is part of the contract. Returning one flat collection is not enough: Dataloader must associate each Account key with exactly the Users that belong to it, including an empty array when an Account has none.

`GroupsByUserId` performs the same operation with a dependency in the middle:

```mermaid
flowchart LR
  UserKeys[Collected user_id keys]
  MembershipRequest["POST /group_users/search<br/>{ user_id: [...] }"]
  Memberships[GroupUser rows]
  GroupIDs[Unique group_id values]
  GroupRequest["POST /groups/search<br/>{ id: [...] }"]
  GroupRecords[Group records]
  Regroup[Regroup Groups by user_id]

  UserKeys --> MembershipRequest
  MembershipRequest --> Memberships
  Memberships --> GroupIDs
  GroupIDs --> GroupRequest
  GroupRequest --> GroupRecords
  GroupRecords --> Regroup
  Memberships --> Regroup
```

That requires two batched stages, not one Group request. Showing both stages keeps the remaining request cardinality visible: traces should contain the GroupUser request followed by the Group request.

## Dataloader Preserves the Work Done Earlier

The Dataloader layer is effective only because the lower layers already expose collection-shaped operations. It can collect Account IDs, but Account Service must accept multiple IDs. It can collect account join keys, but User Service must accept multiple `account_id` values. It can collect User IDs, but Group Service must accept multiple `user_id` values.

The implementation still has to preserve the actor identity, authorization semantics, ordering, missing-record policy, chunk boundaries, and trace context through every source. Those details are under audit before this page is ready for publication. The lesson does not depend on pretending they are already perfect:

> Dataloader creates an opportunity to batch. Only the source implementation decides whether that opportunity survives the next network boundary.


## Measured Evidence

The [MSP scale results](./graphql-auth-explosion-results#graphql-msp-scale) report complete paginated walks, and the [batch-boundary comparison](./graphql-auth-explosion-results#batch-boundaries) compares sizes 200, 1000, and 10000. [Explore the selected GraphQL traces](./graphql-auth-explosion-traces#graphql-preserves-the-service-boundaries), including one warm MSP page; a page trace is not the full walk.
