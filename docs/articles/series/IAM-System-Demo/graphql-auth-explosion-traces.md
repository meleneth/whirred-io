<script setup>
import TraceExample from '../../../.vitepress/theme/components/TraceExample.vue'
</script>

# GraphQL Auth Explosion: Trace Gallery

Series: [GraphQL Auth Explosion Case Study](./iam-system-demo) · [Measured results](./graphql-auth-explosion-results)

LLM Disclaimer:
LLM's were used in the preperation of this series of articles. For the most part I try to call out per-article if it is particularly LLM heavy, but for the most part I'm trying to keep it human-written and avoid triggering people.

The User Management page needs every user from every account in an organization. A system built around one user working in one account now has to retrieve and authorize records across the whole account tree. These traces show how that change in workload multiplies service calls, and how the changes in the articles remove those multipliers.

Follow the repeated calls in each comparison: walking parents, calculating capabilities for each account, and fetching related records. Batching has to survive every layer. One service looping over a collection can bring back the work that the caller just eliminated.

Benchmarking and inspecting traces also exposed an IPv6 misconfiguration causing latency spikes. In this environment, the misconfiguration was having IPv6 enabled at all. That was a useful reminder to investigate the environment alongside the application: repeated work explained the authorization explosion, but it did not explain every delay.

Each waterfall can be explored here or opened in the full browser. Select a span to inspect the request, SQL, or events behind it. Compare the calls and their nesting first; each waterfall has its own time scale. The [measured results](./graphql-auth-explosion-results) provide the repeated timing comparisons.

## Single-record /can versus full capabilities

A full capability list makes sense when a user is working in one account: fetch the permissions once, then check whether the required permission is present. The first example shows that familiar operation. The second asks Authorization Service the narrower question directly: can this user read this account?

<TraceExample id="authorization-record-capabilities" />

[Explore single-record full capabilities](./graphql-auth-explosion-trace-browser?trace=authorization-record-capabilities) · [Jaeger subtree JSON](/traces/iam/authorization-record-capabilities.json)

<TraceExample id="authorization-record-can" />

[Explore single-record /can](./graphql-auth-explosion-trace-browser?trace=authorization-record-can) · [Jaeger subtree JSON](/traces/iam/authorization-record-can.json)

Both calls still need the account's hierarchy and organization membership to resolve authorization. Changing the question to `/can` does not make that underlying work disappear. With one account, the repetition that causes trouble in User Management is easy to miss. The next pair shows what happens when the question covers a collection.

These excerpts concern the same account but come from different workloads, so they are not a controlled speed comparison. Both selected account requests returned HTTP 200; the larger serial-retrieval request containing the capabilities example failed with an empty HTTP reply.

## Full capabilities repeats the work inside a collection

Batching retrieval is only part of the fix. If authorization calculates a full capability list separately for every account in the result, it repeats hierarchy and membership work inside an apparently batched request.

Look for that repetition in the first waterfall. Within this one authorization call, the capabilities path makes **19 hierarchy requests and 19 membership requests**. The `/can` path asks one permission question across the requested accounts and makes **one of each**.

<TraceExample id="authorization-collection-capabilities" />

[Explore collection full capabilities](./graphql-auth-explosion-trace-browser?trace=authorization-collection-capabilities) · [Jaeger subtree JSON](/traces/iam/authorization-collection-capabilities.json)

<TraceExample id="authorization-collection-can" />

[Explore collection /can](./graphql-auth-explosion-trace-browser?trace=authorization-collection-can) · [Jaeger subtree JSON](/traces/iam/authorization-collection-can.json)

This is the multiplier described in [Part 3: Multiple Object Authorization](./graphql-auth-explosion-part-3-multiple-object-authorization). The intended rule is that every account must be authorized or the whole request fails. Checking the collection together has to preserve that rule and the downward inheritance of grants; the article's authorization audit remains open.

Both selected authorization calls returned HTTP 200, but the enclosing capabilities request failed with an empty HTTP reply while `/can` succeeded. The excerpts show repeated work, not a full-request speedup. The earlier benchmark has a separate [successful wide comparison](./graphql-auth-explosion-results#retrieval-and-authorization).

## Follow parents, or ask for the hierarchy

Authorization needs the target account and its direct ancestors. Following `account.parent` looks like ordinary model code, but here each step crosses the network. At depth five, the caller has to wait for five account requests in sequence.

The hierarchy endpoint lets Account Service answer the whole question. A recursive CTE follows the parent links in its database and returns the lineage in one response. Compare the repeated account requests in the first trace with the single hierarchy request in the second.

<TraceExample id="hierarchy-walk" />

[Explore parent traversal](./graphql-auth-explosion-trace-browser?trace=hierarchy-walk) · [Jaeger JSON](/traces/iam/hierarchy-walk.json)

<TraceExample id="hierarchy-cte" />

[Explore the hierarchy GET](./graphql-auth-explosion-trace-browser?trace=hierarchy-cte) · [Jaeger JSON](/traces/iam/hierarchy-cte.json)

[Part 1: CTE](./graphql-auth-explosion-part-1-cte) explains the traversal and its organization boundary. The benefit grows with the network calls avoided: at depth one, the benchmark found the hierarchy endpoint slower. These examples have Redis disabled and retain actor authorization.

## Eight hierarchy calls, or one batch

Resolving a lineage in one request fixes the loop over parents. A caller asking about several accounts can still create another loop: one hierarchy request per target.

These traces ask for the same eight targets. The first repeats the service path eight times. The second sends the targets together, so Account Service can resolve their lineages as a set. This is the next step in [Part 5: Smart APIs](./graphql-auth-explosion-part-5-smart-apis): expose the operation the caller needs across the collection.

<TraceExample id="hierarchy-individual" />

[Explore individual GETs](./graphql-auth-explosion-trace-browser?trace=hierarchy-individual) · [Jaeger JSON](/traces/iam/hierarchy-individual.json)

<TraceExample id="hierarchy-batch" />

[Explore the batch POST](./graphql-auth-explosion-trace-browser?trace=hierarchy-batch) · [Jaeger JSON](/traces/iam/hierarchy-batch.json)

Redis is disabled in both examples. This pair demonstrates hierarchy batching. [Part 2](./graphql-auth-explosion-part-2-multiple-object-retrieval) applies the same principle to retrieving records by IDs and join keys; its larger retrieval traces are not hosted here.

## Organization retrieval with cold and warm Redis

Once retrieval and authorization operate on collections, caching can reduce the work that remains. Each service caches the data it owns: organization membership stays with Organization Service, and grants stay with Authorization Service. The caller still crosses those boundaries, but the owning service can reuse work from an earlier request.

Compare the database work in these two organization requests. The cold request must populate caches; the warm request can use them. Search for `SELECT` and `PIPELINED` to follow the database queries and batched Redis checks. Authorization and record retrieval remain visible in both.

<TraceExample id="organization-cold" />

[Explore cold organization retrieval](./graphql-auth-explosion-trace-browser?trace=organization-cold) · [Jaeger JSON](/traces/iam/organization-cold.json)

<TraceExample id="organization-warm" />

[Explore warm organization retrieval](./graphql-auth-explosion-trace-browser?trace=organization-warm) · [Jaeger JSON](/traces/iam/organization-warm.json)

Both use the wide organization, batched `/can`, and batch size 1000. “Cold” means Redis was flushed. PostgreSQL's buffers may already be warm. [Part 4: Redis Cache](./graphql-auth-explosion-part-4-redis-cache-per-service) explains the ownership decision and the demo's missing invalidation mechanism. The measured benefit varies by workload.

## GraphQL preserves the service boundaries

GraphQL lets the client ask for an organization, its accounts, their users, and those users' groups as one nested result. Those fields still depend on records owned by separate services. Resolving each field with an individual remote lookup would recreate the original explosion.

[Part 6: GraphQL and Dataloader](./graphql-auth-explosion-part-6-graphql-and-dataloader) explains how collected keys become batched downstream requests. Follow those requests beneath GraphQL execution in these cold and warm examples. Group membership has to be retrieved before the group IDs are known, so that dependency still requires successive stages. Dataloader can collect work within a stage; its source implementation must carry the batch across the service boundary.

<TraceExample id="graphql-cold" />

[Explore cold GraphQL](./graphql-auth-explosion-trace-browser?trace=graphql-cold) · [Jaeger JSON](/traces/iam/graphql-cold.json)

<TraceExample id="graphql-warm" />

[Explore warm GraphQL](./graphql-auth-explosion-trace-browser?trace=graphql-warm) · [Jaeger JSON](/traces/iam/graphql-warm.json)

These use the deep fixture, batch size 1000, and `/can`. The organization examples above use a different fixture, so their timings do not establish a REST-versus-GraphQL comparison. The Dataloader consistency audit remains open in Part 6.

The final trace shows how the same work fits inside **one page** of a larger MSP query. Smaller pages limit the work in each response, but the complete walk repeats that work across more requests. This warm page uses batch size 200; the benchmark's nominal 10k fixture required 50 pages and returned 9,999 accounts in total.

<TraceExample id="graphql-msp" />

[Explore the MSP page](./graphql-auth-explosion-trace-browser?trace=graphql-msp) · [Jaeger JSON](/traces/iam/graphql-msp.json)

The [batch-size results](./graphql-auth-explosion-results#batch-boundaries) compare complete walks. This trace lets you inspect one page's service calls; it does not represent the time to retrieve the whole fixture.

## Selection and provenance

The gallery contains nine full traces and four authorization excerpts from the September 12, 2026 refresh. Each excerpt retains its selected call and every descendant; ancestors and sibling requests are omitted. Both capabilities excerpts come from failed enclosing requests, as described above.

These are individual samples. The benchmark medians come from the earlier September 10 collection. Parent durations include their children, and gaps between recorded spans do not identify what caused a delay. Instrumentation also changed between collections, so total span counts alone are not a measure of improvement.

The [manifest](/traces/iam/manifest.json) records source paths, revisions, working-tree status, request outcomes, excerpt roots, and file hashes. Each example links to its Jaeger JSON and exposes its provenance in the browser. The exports can be reproduced with `scripts/import-iam-traces.py` and `scripts/render-trace-previews.mjs`.
