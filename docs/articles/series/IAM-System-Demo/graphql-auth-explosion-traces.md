<script setup>
import TraceExample from '../../../.vitepress/theme/components/TraceExample.vue'
</script>

# GraphQL Auth Explosion: Trace Gallery

Series: [GraphQL Auth Explosion Case Study](./iam-system-demo) · [Measured results](./graphql-auth-explosion-results)

The User Management page turns one account’s worth of work into an organization-wide query. Parent lookups, capability checks, and related-record retrieval all repeat across the account tree. The traces show where those loops cross service boundaries—and how collection APIs reduce the calls.

The clearest example is authorization: the selected 19-account group-membership authorization performs **19 capability computations and 19 membership lookups**. The matching collection `/can` authorization performs **one permission computation and one membership lookup**. Batching record retrieval alone leaves that authorization work inside the request.

The waterfalls below are interactive, with authorization, cache, SQL, and event details available on each span. They show individual workloads from September 13, 2026; the [measured results](./graphql-auth-explosion-results) provide repeated timing comparisons from September 10.

## Single-record /can versus full capabilities

For one account, the two authorization paths look similar. The capabilities endpoint returns the user’s full permission list, which the caller checks for the permission it needs. `/can` answers the specific permission question directly. Both still retrieve the account hierarchy and organization membership.

<TraceExample id="authorization-record-capabilities" />

[Explore single-record full capabilities](./graphql-auth-explosion-trace-browser?trace=authorization-record-capabilities) · [Jaeger subtree JSON](/traces/iam/authorization-record-capabilities.json)

<TraceExample id="authorization-record-can" />

[Explore single-record /can](./graphql-auth-explosion-trace-browser?trace=authorization-record-can) · [Jaeger subtree JSON](/traces/iam/authorization-record-can.json)

These excerpts select one account computation from each workload; the reduced spans do not record account IDs, so they do not establish a same-account comparison. Both enclosing workloads completed successfully. HTTP status is recorded by the collection harness, while the spans show authorization work. Their durations do not establish a speedup between the two approaches.

## Full capabilities repeats the work inside a collection

The difference becomes pronounced across a collection. Both excerpts show `GroupUser.collection.authorize` for 19 account scopes in the wide fixture. The capabilities subtree contains **19 account capability computations, 19 ancestry CTEs, and 19 organization-membership lookups**. The `/can` subtree contains **one 19-account permission computation, one ancestry CTE, and one membership lookup**. The SQL and application spans expose the repeated work without HTTP timing spans.

<TraceExample id="authorization-collection-capabilities" />

[Explore collection full capabilities](./graphql-auth-explosion-trace-browser?trace=authorization-collection-capabilities) · [Jaeger subtree JSON](/traces/iam/authorization-collection-capabilities.json)

<TraceExample id="authorization-collection-can" />

[Explore collection /can](./graphql-auth-explosion-trace-browser?trace=authorization-collection-can) · [Jaeger subtree JSON](/traces/iam/authorization-collection-can.json)

The collection path removes repeated service calls, but its correctness remains under review in [Part 3: Multiple Object Authorization](./graphql-auth-explosion-part-3-multiple-object-authorization). The open audit covers downward grant inheritance and the requirement that every account pass authorization for the request to succeed.

Both selected authorization operations completed without a recorded exception. The enclosing wide capabilities request failed with an empty HTTP reply (curl 52), while the `/can` workload completed. The serial capabilities workload also completed in this refresh; its earlier failure did not recur. A separate [benchmark comparison in which both paths completed](./graphql-auth-explosion-results#retrieval-and-authorization) measured a 15.3× improvement for `/can` on the wide workload.

## Follow parents, or ask for the hierarchy

Authorization needs the target account and its direct ancestors. Following `account.parent` looks like ordinary model code, but here each step crosses the network. At depth five, the caller has to wait for five account requests in sequence.

The hierarchy endpoint replaces those five requests with one. Account Service follows the parent links with a recursive CTE in its database and returns the complete lineage.

<TraceExample id="hierarchy-walk" />

[Explore parent traversal](./graphql-auth-explosion-trace-browser?trace=hierarchy-walk) · [Jaeger JSON](/traces/iam/hierarchy-walk.json)

<TraceExample id="hierarchy-cte" />

[Explore the hierarchy GET](./graphql-auth-explosion-trace-browser?trace=hierarchy-cte) · [Jaeger JSON](/traces/iam/hierarchy-cte.json)

[Part 1: CTE](./graphql-auth-explosion-part-1-cte) explains the traversal and its organization boundary. The benefit grows with the network calls avoided: at depth one, the benchmark found the hierarchy endpoint slower. These examples have Redis disabled and retain actor authorization.

## Eight hierarchy calls, or one batch

Resolving a lineage in one request fixes the loop over parents. A caller asking about several accounts can still create another loop: one hierarchy request per target.

For the same eight targets, individual GETs repeat the service path eight times. One batch POST sends the targets together and lets Account Service resolve their lineages as a set—the collection API described in [Part 5: Smart APIs](./graphql-auth-explosion-part-5-smart-apis).

<TraceExample id="hierarchy-individual" />

[Explore individual GETs](./graphql-auth-explosion-trace-browser?trace=hierarchy-individual) · [Jaeger JSON](/traces/iam/hierarchy-individual.json)

<TraceExample id="hierarchy-batch" />

[Explore the batch POST](./graphql-auth-explosion-trace-browser?trace=hierarchy-batch) · [Jaeger JSON](/traces/iam/hierarchy-batch.json)

Redis is disabled in both examples. The reduction comes from batching the hierarchy requests. [Part 2](./graphql-auth-explosion-part-2-multiple-object-retrieval) applies the same approach to retrieving records by IDs and join keys.

## Organization retrieval with cold and warm Redis

Once retrieval and authorization operate on collections, caching can reduce the work that remains. Each service caches derived results from data it owns: Organization Service caches membership expansion, Account Service caches ancestry, and Authorization Service caches capability lists and permission decisions. The caller still crosses those boundaries, but the owning service can reuse work from an earlier request.

The cold request populates the caches; the warm request can reuse those entries. Both still perform authorization and retrieve records. Caching changes the work inside the owning services while preserving the caller’s service boundaries.

<TraceExample id="organization-cold" />

[Explore cold organization retrieval](./graphql-auth-explosion-trace-browser?trace=organization-cold) · [Jaeger JSON](/traces/iam/organization-cold.json)

<TraceExample id="organization-warm" />

[Explore warm organization retrieval](./graphql-auth-explosion-trace-browser?trace=organization-warm) · [Jaeger JSON](/traces/iam/organization-warm.json)

Both use the wide organization, batched `/can`, and batch size 1000. “Cold” means Redis was flushed. PostgreSQL's buffers may already be warm. [Part 4: Redis Cache](./graphql-auth-explosion-part-4-redis-cache-per-service) explains the ownership decision and the demo's missing invalidation mechanism. The measured benefit varies by workload.

## GraphQL preserves the service boundaries

GraphQL lets the client ask for an organization, its accounts, their users, and those users' groups as one nested result. Those fields still depend on records owned by separate services. Resolving each field with an individual remote lookup would recreate the original explosion.

The cold and warm traces contain batched Dataloader operations with downstream authorization, SQL, and cache work beneath GraphQL execution. Some calls still depend on earlier results: group membership must be retrieved before the group IDs are known. [Dataloader](./graphql-auth-explosion-part-6-graphql-and-dataloader) collects keys within each stage, and its sources send those keys to the downstream APIs together.

<TraceExample id="graphql-cold" />

[Explore cold GraphQL](./graphql-auth-explosion-trace-browser?trace=graphql-cold) · [Jaeger JSON](/traces/iam/graphql-cold.json)

<TraceExample id="graphql-warm" />

[Explore warm GraphQL](./graphql-auth-explosion-trace-browser?trace=graphql-warm) · [Jaeger JSON](/traces/iam/graphql-warm.json)

These use the deep fixture, batch size 1000, and `/can`. The organization examples above use a different fixture, so their timings do not establish a REST-versus-GraphQL comparison. The Dataloader consistency audit remains open in Part 6.

The final trace shows how the same work fits inside **one page** of a larger MSP query. Smaller pages limit the work in each response, but the complete walk repeats that work across more requests. This warm page uses batch size 200; the benchmark's nominal 10k fixture required 50 pages and returned 9,999 accounts in total.

<TraceExample id="graphql-msp" />

[Explore the MSP page](./graphql-auth-explosion-trace-browser?trace=graphql-msp) · [Jaeger JSON](/traces/iam/graphql-msp.json)

Across the complete walk, those page-level costs add up. The [batch-size benchmark](./graphql-auth-explosion-results#batch-boundaries) reduced the warm total from 10.264s for 50 pages to 2.135s for one larger page.

## Trace context

The gallery contains nine complete traces and four authorization excerpts. Each excerpt includes the selected call and its descendants. The [manifest](/traces/iam/manifest.json) records the source revision, request outcome, and export details; the linked JSON files contain the spans displayed here.

Each waterfall has its own time scale, and parent durations include their children. All seed queues were empty and all ten seed workers were stopped before collection. Controller/action, HTTP, response-lifecycle, serialization, and materialization spans are omitted at their source; cache operations remain. Cross-service trace propagation remains intact, and spans may share an external initiating parent because there is no Rack root. Instrumentation changed between the September 10 benchmark and these September 13 samples, so span totals across the collections are not directly comparable. Gaps between spans do not identify the cause of a delay.
