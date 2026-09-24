<script setup>
import TraceExample from '../../../.vitepress/theme/components/TraceExample.vue'
</script>

# GraphQL Auth Explosion: Trace Gallery

[Case study](./iam-system-demo) · [September 17 benchmark results](./graphql-auth-explosion-results)

An **Account** can have a parent Account and many Users. Each **Group** belongs to an Account, and a membership links a User to a Group. To authorize a membership, Group Service must read its owning Group to find that Account. It can then check whether the actor may read the Account or has `group.read` for the Group. Authorization Service also reads the actor’s own Group memberships to find applicable grants. The waterfalls show these reads alongside the Account and Organization service calls they trigger.

This page has **ten complete workload traces**. A workload may contain several HTTP requests; its trace includes the whole recorded operation. Each card names the input and returned data. Scroll its preview to follow the call tree, or open the browser to inspect every span. The examples were collected on September 24, 2026 from clean revision `4e00444` after workload warmup. They illustrate *how* work is done; one trace is not a repeatable timing result.

## The datasets

| Fixture | Data in the fixture | Used below |
| --- | --- | --- |
| **Deep chain** | 25 Accounts in a parent chain, 500 Users, 50 Groups, and 525 user–group memberships | Hierarchy and deep GraphQL requests |
| **Wide organization** | 251 Accounts, 5,020 Users, 502 Groups, and 5,271 memberships in one organization | Authorization and organization retrieval |
| **MSP 10k** | A multi-organization dataset with 9,999 available client Accounts | One GraphQL page of 200 Accounts; this trace is one request, not the whole walk |

“Batch size” is the maximum number of records requested together. Redis “cold” means Redis DB 1 was cleared before the request; it does not mean Rails or PostgreSQL was restarted. The examples use `/can` permission checks; the organization and GraphQL workloads use collection checks. The hierarchy examples have Redis disabled.

| Jump to | Question answered by the traces |
| --- | --- |
| [Five parents or one hierarchy request](#follow-parents-or-ask-for-the-hierarchy) | What happens when the caller follows a parent pointer over HTTP? |
| [Eight separate requests or one batch](#eight-hierarchy-calls-or-one-batch) | What happens when the caller needs several hierarchies? |
| [Authorization in a full request](#authorization-inside-a-complete-organization-request) | What does a batched permission check look like in context? |
| [Wide organization, cold and warm Redis](#organization-retrieval-with-cold-and-warm-redis) | Which work remains after retrieval and authorization are batched? |
| [Deep GraphQL and an MSP page](#graphql-preserves-the-service-boundaries) | How do nested fields cross service boundaries? |

## Follow parents, or ask for the hierarchy

**Input:** one Account five levels down in the deep chain. **Expected output:** that Account and its four ancestors, five Account records total. The first request follows `parent` with five sequential HTTP GETs. The second asks Account Service for the whole lineage in one GET; Account Service uses a recursive SQL query. Both requests completed and returned the same lineage.

<TraceExample id="hierarchy-walk" description="Five sequential Account GETs. Follow the repeated Account Service and authorization calls beneath each parent step." />
<TraceExample id="hierarchy-cte" description="One hierarchy GET returns the same five Accounts. Find the recursive SQL query inside Account Service." />

[Part 1](./graphql-auth-explosion-part-1-cte) explains the recursive query and its organization boundary. These traces show the request shape; the [benchmark timing table](./graphql-auth-explosion-results#hierarchy-traversal-and-smart-apis) reports the separate September 17 measurements.

## Eight hierarchy calls, or one batch

**Input:** eight target Accounts from the deep chain. Their lineage responses contain **172 Account records in total**, including ancestors returned for more than one target. The first request asks for each hierarchy separately: eight HTTP GETs. The second sends all eight target IDs in one POST. Both return the same hierarchy data. This pair illustrates a second loop that remains even after each individual hierarchy can be fetched in one call.

<TraceExample id="hierarchy-individual" description="Eight hierarchy GETs for eight targets. Their repeated service and permission checks fill much of the waterfall." />
<TraceExample id="hierarchy-batch" description="One POST carries the eight target IDs and returns the same 172 Account records across their lineages." />

[Part 5](./graphql-auth-explosion-part-5-smart-apis) explains the batch API. The 172 returned records are across the eight lineage responses; they are not 172 distinct Accounts in the fixture.

## Authorization inside a complete organization request

**Input:** the wide organization's User Management request, using batched retrieval, collection `/can`, batch size 1000, and Redis disabled. **Output:** 251 Accounts, 5,020 Users, 502 Groups, and 5,271 memberships. The complete request succeeded and passed exact-record checks.

Each membership contains a Group ID, but authorization needs the **owning Account ID**. Under `GroupUser.collection.authorize`, Group Service first reads the matching Groups' `id` and `account_id` (`SQL Group Pluck`). It then checks `account.users.read` for those Accounts. One batch covers 20 Account scopes, whose hierarchy and organization context are loaded as sets. The successful account-wide check means this sample does not need the fallback `group.read` check for each Group.

<TraceExample id="authorization-collection-can" description="The complete wide-organization /can request with Redis off. Search for GroupUser.collection.authorize, then SQL Group Pluck: Group Service reads owning Groups before checking their Accounts." />

Two other group reads serve different purposes. Authorization Service calls `/internal/auth/memberships` to find **the actor's** Group IDs for grant lookup. Later, `Load 502 groups` fetches full Group records for the User Management response. The trace's `SQL Group Pluck` and `SQL Group Load` show the authorization lookup and response retrieval separately.

The archived *full-capabilities* request over this fixture is too large for useful live browsing: it has 84,519 spans and ended with an empty HTTP reply after 89.648 seconds. The successful collection `/can` request preserves the work as sets and makes the shared resource and model authorization boundaries visible. That is a structural observation, not a successful latency comparison; the trace does not establish why the capabilities connection closed. [Part 3](./graphql-auth-explosion-part-3-multiple-object-authorization) explains the permission question and remaining correctness audit.

## Organization retrieval with cold and warm Redis

**Input:** the wide organization's User Management request. Each response contains **251 Accounts, 5,020 Users, 502 Groups, and 5,271 memberships**. Both requests use batched retrieval, collection `/can`, and batch size 1000. The cold request begins after Redis DB 1 is cleared. A priming request runs before the warm request, so the latter can reuse cached data. Both responses passed exact-record checks.

<TraceExample id="organization-cold" description="The full wide-organization request after Redis is cleared. Watch services populate cache entries while retrieving and authorizing records." />
<TraceExample id="organization-warm" description="The same wide-organization request after a priming request. Compare cache reads and the work that still crosses service boundaries." />

Only Redis was reset between cache states. Rails processes stayed running, and PostgreSQL buffers may have been warm. [Part 4](./graphql-auth-explosion-part-4-redis-cache-per-service) explains which service owns each cache and the missing invalidation mechanism.

## GraphQL preserves the service boundaries

**Input:** one GraphQL query for the deep-chain organization, asking for Accounts, their Users, and those Users' Groups. The response covers **25 Accounts and 500 Users**; the deep fixture has 50 Groups and 525 memberships. Both requests use batch size 1000 and collection `/can`. Their returned identities passed fixture checks. Redis is cleared for the cold request and primed for the warm one.

<TraceExample id="graphql-cold" description="One complete GraphQL request for the 25-Account deep chain after Redis is cleared. Follow batched Dataloader stages into the owning services." />
<TraceExample id="graphql-warm" description="The same GraphQL query after cache priming. Service boundaries remain even when cache reads shorten parts of the request." />

Dataloader combines keys available in one stage. It must fetch memberships before it knows which Group IDs to request, so the Group lookup follows in another stage. [Part 6](./graphql-auth-explosion-part-6-graphql-and-dataloader) discusses that dependency and the remaining consistency audit. These deep-fixture traces and the wide-organization traces above use different datasets, so their elapsed times do not form a REST-versus-GraphQL comparison.

### One MSP page

**Input:** the first page of a GraphQL query across the MSP dataset, with page size 200 and warm Redis. **Output:** 200 sorted client Accounts, their associated Users and Groups, a total of **9,999 available Accounts**, and cursor `200`. The returned records and cursor passed exact-record checks. This trace covers **one page only**; a complete walk would issue more page requests.

<TraceExample id="graphql-msp" description="One warm GraphQL page of 200 Accounts from a multi-organization dataset. Follow the service calls needed to fill this page; the remaining pages are outside this request." />

## Reading the exports

Every card links to its complete Jaeger JSON and a full-size SVG. The [manifest](/traces/iam/manifest.json) records source revision, request outcome, and export hash. Parent spans include the time spent in their children, so adding bars together does not give request time. Client elapsed time and the recorded span envelope are shown separately in the browser.

Executed SQL spans exclude ActiveRecord query-cache hits; the per-request query cache remained enabled. These examples are separate from the [September 17 benchmark](./graphql-auth-explosion-results). The much larger authorization workloads are discussed in [Part 3](./graphql-auth-explosion-part-3-multiple-object-authorization) without turning selected pieces of those requests into gallery traces.
