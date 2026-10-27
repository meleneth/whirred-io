<script setup>
import TraceExample from '../../../.vitepress/theme/components/TraceExample.vue'
</script>

# GraphQL at Scale

![Before: 2.240786 seconds and 1,008 spans. After: 0.367791 seconds and 106 spans. Bars show proportional client durations.](/images/graphql-at-scale-before-after.svg)

*One controlled request. The faster path combines changes to retrieval, authorization, and cache configuration; the chart does not isolate their individual effects.*

GraphQL was the visible edge of this performance problem, but it was not its cause. The expensive part lived underneath: remote object retrieval, hierarchy traversal, and authorization work repeated once per record. The query language made it easy to ask for a connected result. Whether that query was practical depended on the shape of the computation used to assemble it.

The system in this case study is a distributed identity and access management application. Separate Rails services own users, accounts, organizations, groups and memberships, and capability grants. A User Management service composes those REST resources into application-facing GraphQL responses. The test data includes individual customers, enterprises with account trees, and managed service providers (MSPs) linked to thousands of client organizations.

That sounds like an ambitious workload, but the system did not begin in crisis. Its ordinary authorization path worked reasonably well.

## The system works

Access is capability-based. Grants belong to groups, users belong to groups, and each grant names a permission and a scope. A small effective set might look like this:

```text
account.read
account.users.read
account.users.write
```

The names are deliberately distinct. Permission to read an account is not automatically permission to read its users. Reading a group is another decision. An organization-account relationship can be read through either `organization.read.accounts` on the organization or `account.read` on that account, but either alternative authorizes the relationship row—not every object connected to it.

Account grants flow downward through a physical `parent_account_id` chain. MSP access adds a second, authorization-only edge: a grant on a provider account or its ancestors can cover accounts in a linked client organization. The provider account never appears in the client's returned account hierarchy. Affiliation alone grants nothing; the actor still needs the relevant ordinary capability.

For a typical application request, this is tractable. The actor operates in one account context, the receiving service knows the records and policy it owns, and Authorization Service evaluates the requested permission. The design is doing useful work: it keeps authorization beside the data being disclosed and preserves service ownership.

## User management changes the problem

A user-management screen is not a typical request. It needs users across many accounts, the groups attached to those users, the account records used to present them, and sometimes account ancestry. Every apparent relationship crosses an HTTP boundary.

ActiveResource makes those remote resources pleasant to use, but it cannot change their cost. `account.parent`, `user.groups`, or an innocent-looking `find` can mean another service request. That service may then fetch the actor's group memberships, resolve account ancestry, discover an MSP provider relationship, query grants, and only then return the record.

The multiplication is more serious than a familiar database N+1. It is closer to:

```text
records
× remote relationships
× authorization lookups
× hierarchy work
```

The original object-at-a-time paths were reasonable extensions of code built for one account. The workload changed. Once a page crossed hundreds of account contexts, the unit of work could no longer remain one record.

## Batching changes the shape of retrieval

The useful optimization was not shaving a few milliseconds from `Account.find`. It was replacing a series of independent questions with one set-shaped question.

Account Service now accepts a set of account IDs. Its hierarchy endpoint resolves multiple roots with a recursive CTE and returns a hierarchy correlated to each requested root. User, Group, and GroupUser searches likewise accept arrays of join keys. GraphQL-Ruby's DataLoader collects field requests, then the sources issue bounded, chunked REST calls. The source still respects pagination and a configured maximum batch size; batching is not permission to construct an unbounded response.

One trace makes the difference concrete. In an October 5 production-stack laboratory run, loading eight account hierarchies individually took 0.577 seconds, made eight top-level requests, and produced 88 traced HTTP client spans plus 144 application SQL spans. Sending the same eight roots to the batch endpoint took 0.097 seconds, made one top-level request, and produced 11 HTTP client spans plus 18 SQL spans. Both returned 172 account rows with the same SHA-256 result hash.

That is not a historical before-and-after measurement of a deployed application. It is a controlled execution of both current code paths. What it establishes is narrower and still valuable: when the same relationship work is expressed as a set, the owning service can replace repeated network and database work with set-oriented SQL.

## Authorization becomes the next bottleneck

Batching retrieval revealed the next bad shape. The first authorization interface asked, in effect, “what can this actor do on each of these scopes?” It returned complete capability arrays. The caller then searched those arrays for the one permission required by the operation.

That interface is useful when an application really needs to render every action available to a user. It is wasteful when User Service only needs to know whether 251 candidate accounts permit `account.users.read`.

The implementation amplified the mismatch. The batched capability endpoint preserved correct per-target results, but evaluated accounts one at a time internally: hierarchy resolution, provider lookup, membership lookup, and an all-permissions grant query repeated across the candidate set. Faster resource retrieval had exposed authorization as another collection of record-shaped computations.

## Ask the smaller question

The replacement path asks for a decision about an operation and a bounded candidate set. For account reads, Authorization Service receives the candidate account IDs and `account.read`. It resolves their physical and virtual authorization paths in batches, loads the actor's explicit group memberships, and runs a grant query constrained by group, scope type, candidate scope IDs, and the requested permission. It correlates the matching scopes back to candidates and caches a boolean decision per actor, permission, and target.

Conceptually, the work changed from:

```text
retrieve candidate resources
→ retrieve broad capability state for every scope
→ correlate capabilities with records locally
```

to:

```text
retrieve candidate resources
→ evaluate operation X against those candidates
→ return correlated decisions or enforce the authorized set
```

There are two enforcement forms. Ordinary resource reads are fail-closed: every record returned by a service must satisfy its declared policy, or the batch is rejected. Policies with alternatives—such as an organization-account row readable through its organization or its account—use a per-target decision response so each record can satisfy either branch. The system does not fetch unauthorized records and quietly filter them in GraphQL.

The context boundaries matter as much as the SQL. The real actor ID follows the request from GraphQL to each owning service. Authorization Service uses a narrowly scoped `IAM_SYSTEM_AUTH` identity only to retrieve relationship facts such as memberships and MSP provider links. It uses `IAM_SYSTEM` for allowlisted internal hierarchy reads while evaluating the stored actor. Neither identity turns the original actor request into an unrestricted resource read.

## What the traces establish

The clearest authorization comparison uses the 251-account `wide_org` fixture containing 5,020 users. Both October 5 requests used batched retrieval with Redis disabled and passed exact checks for accounts, parent links, users, account scopes, groups, totals, and cursors.

The full-capabilities trace took 12.994 seconds. It contains 18,406 spans, including 2,319 HTTP client spans and 4,596 application SQL spans. The targeted path took 3.356 seconds, with 560 total spans, 88 HTTP client spans, and 137 SQL spans. In the waterfall, the capabilities trace is dominated by 760 hierarchy calls, 760 organization-context calls, and 760 provider-context calls. In the targeted trace those three categories appear 17 times each because the work is performed on chunks and permission-specific sets.

The most recent corrected trace pair, collected October 25, exercises the user-management request the screen actually needs. The request identifies only the MSP account and actor. It does not smuggle in a prepared list of users or managed accounts, ask for unrelated hierarchy fields, or choose the result size:

```graphql
query MspUsers($mspAccountId: ID!, $actor: ID!) {
  mspUserManagement(mspAccountId: $mspAccountId, as: $actor) {
    loading
    loadedCount
    totalCount
    continuance
    accounts {
      id
      users {
        id
        email
        accountId
        groups { id name }
      }
    }
  }
}
```

The service discovers the managed accounts and loads their users. In the deterministic `small_msp_10` fixture, that means all ten client accounts and their ten users; the eleventh fixture user is the MSP administrator making the request. The two measured requests and responses are byte-identical. Independent checks match the exact account IDs, user IDs, account scopes, group memberships, totals, and cursor.

The deliberately slow profile used truly serial retrieval and single-scope full-capability authorization with Redis disabled. It took 2.241 seconds and produced 1,008 spans: 387 receiving-service API spans and 575 application SQL spans. The optimized profile used batched retrieval and targeted authorization after all four scoped Redis databases were flushed. It took 0.368 seconds and produced 106 spans: 35 receiving-service API spans, 35 SQL spans, and 26 Redis pipeline spans. That is 6.09 times faster with 89.5% fewer spans in this single controlled sample. This comparison intentionally changes retrieval, authorization, and cache configuration together. It demonstrates the combined architecture, not the isolated contribution of any one change.

<TraceExample id="msp10-all-users-slow" description="The complete 1,008-span request for every user managed by this MSP. Truly serial retrieval and repeated single-scope capability, hierarchy, membership, and provider-context work dominate the waterfall." />

<TraceExample id="msp10-all-users-fast-cold" description="The byte-identical 106-span response through batched retrieval and targeted, set-shaped authorization, measured after the scoped Redis flush." />

These exports deliberately omit outbound HTTP client spans, generic authorization wrappers, and GraphQL lifecycle spans. Trace-context propagation still attaches each receiving-service API span to the caller's active request, DataLoader batch, or retained authorization boundary. The smaller trace is therefore evidence about the recorded application work under the same reduced instrumentation, not a count of every runtime event.

Cache state is not a footnote. In the optimized trace, “cold” means Redis DB 1 was flushed for account, authorization, group, and organization caches. Rails and PostgreSQL stayed warm, two workload warmups ran before the flush, and Active Record's request query cache remained enabled. The request still executed 26 Redis pipelines containing 161 commands as misses were read and results written. A warm result proves cache reuse, not uncached speed: for the wide organization workload, a separate pair measured 1.313 seconds cold and 0.975 seconds warm.

The large MSP fixtures provide scale context without proving production scalability. A warm GraphQL trace over the 9,999-client fixture returned one page of 200 managed accounts and 200 users in 0.237 seconds; it did not return all 9,999 clients. The repeated September matrix did complete full pagination walks: for 9,999 managed accounts, medians were 5.42 seconds cold and 2.93 seconds warm at batch size 10,000. The 99,999-account observations were 63.44 and 37.40 seconds, but some associated large traces were incomplete because Jaeger's receiver rejected oversized exports. Those are controlled response measurements on a seeded stack, not concurrency, throughput, or production-traffic evidence.

Correctness is also bounded by what was tested. The selected traces compare every returned identity against deterministic fixtures, and focused audits cover direct grants, inherited grants, sibling denials, unrelated MSPs, mixed batches, and cache modes. They do not certify the system. This demo trusts caller-supplied actor and internal identity headers; production authentication and signed service identity are outside it. Its benchmark data is fixed, and a general write, revocation, and coordinated cache-invalidation protocol is also outside the project.

## Composition and execution are different concerns

GraphQL remained useful throughout. It describes the application result and lets DataLoader collect related field requests. REST remains the interface to the services that own the data and the authorization policy. They solve different problems in this architecture.

The failure was not that a graph query existed. The failure was executing a set request as a long sequence of remote object operations, then retrieving broad authorization state to answer narrow yes-or-no questions. Once retrieval, hierarchy resolution, and authorization were expressed in the shapes their owners could evaluate efficiently, GraphQL could continue doing its actual job: composing the result.

That does not mean GraphQL automatically scales. It means the scalability of a composition layer is determined below its syntax—by candidate-set boundaries, network fan-out, authorization semantics, cache scope, data ownership, and whether the traces show the work the code is really doing.
