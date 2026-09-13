# GraphQL Auth Explosion: Measured Results

Series: [GraphQL Auth Explosion Case Study](./iam-system-demo)

The largest gains came from reducing the work repeated across service boundaries. Retrieving a depth-25 hierarchy in one request was **24.8× faster** than walking its parents over HTTP. Batching deep user retrieval was **11.5× faster** than fetching records serially. For the largest multi-organization GraphQL walk, warm Redis reduced the total request time from **175.4 seconds to 24.1 seconds**.

Batching retrieval alone did not solve the authorization cost. On the wide workload, asking `/can` about the collection was **15.3× faster** than calculating full capabilities, even with retrieval already batched. Two other capabilities workloads failed to return a response.

These measurements come from the September 10, 2026 benchmark. Tables show seconds as **median [minimum–maximum]** across three measured runs; speedups compare medians. Paginated results cover the complete walk and sum its HTTP request times.

## Hierarchy traversal and smart APIs

Following a parent pointer crosses the network at every level. The hierarchy endpoint moves that traversal into Account Service, where a recursive CTE resolves the lineage in one request. Redis was disabled and actor authorization remained enabled for both paths.

| Depth | Parent-by-parent GET | Hierarchy GET / CTE | Ratio | Client requests |
| --- | ---: | ---: | ---: | --- |
| 1 | 0.055 [0.041–0.057] | 0.081 [0.055–0.092] | 0.7× | 1 → 1 |
| 5 | 0.190 [0.167–0.210] | 0.069 [0.063–0.074] | 2.7× | 5 → 1 |
| 10 | 0.297 [0.274–0.401] | 0.049 [0.045–0.052] | 6.0× | 10 → 1 |
| 25 | 1.385 [0.582–1.601] | 0.056 [0.046–0.076] | 24.8× | 25 → 1 |

At depth 1, the hierarchy endpoint was slower. At depth 25, it replaced 25 client requests with one and cut the median from 1.385s to 0.056s. Both paths returned equivalent IDs and parent links.

The same pattern appeared when requesting several hierarchies: sending the targets together removed another loop over HTTP calls.

| Target set | Individual hierarchy GETs | One batch POST | Ratio | Client requests |
| --- | ---: | ---: | ---: | --- |
| Deep, 8 targets | 0.201 [0.170–0.304] | 0.054 [0.047–0.078] | 3.7× | 8 → 1 |
| Deep, 25 targets | 0.581 [0.556–0.660] | 0.059 [0.033–0.061] | 9.9× | 25 → 1 |
| Wide, 8 targets | 0.257 [0.200–0.281] | 0.073 [0.058–0.135] | 3.5× | 8 → 1 |
| Wide, 251 targets | 7.623 [7.047–10.357] | 0.266 [0.257–0.346] | 28.7× | 251 → 1 |

For 251 targets, one batch replaced 251 requests and reduced the median from 7.623s to 0.266s. In a separate cache comparison, warming Redis reduced the depth-25 hierarchy GET median from 0.040s to 0.006s.

## Retrieval and authorization

Batching user retrieval reduced the deep workload from 13.269s to 1.152s while keeping capabilities authorization in both cases. The wide workload exposed the next cost: batched retrieval still took 27.266s with full capabilities, versus 1.785s with `/can`.

Redis was disabled, with batch size 1000. The deep fixture contained 25 accounts and 500 users; wide contained 251 accounts and 5,020 users; sparse contained 401 accounts and 8,020 users.

| Workload | Mode | Result | Seconds |
| --- | --- | --- | ---: |
| Deep | Serial, capabilities | 3/3 succeeded | 13.269 [12.315–15.346] |
| Deep | Batched, capabilities | 3/3 succeeded | 1.152 [1.142–1.673] |
| Wide | Serial, capabilities | 3/3 empty HTTP replies | 135.832 [135.280–145.987] to failure |
| Wide | Batched, capabilities | 3/3 succeeded | 27.266 [26.598–27.794] |
| Wide | Batched, /can | 3/3 succeeded | 1.785 [1.782–2.410] |
| Sparse | Batched, capabilities | 3/3 empty HTTP replies | 66.507 [63.751–73.404] to failure |
| Sparse | Batched, /can | 3/3 succeeded | 3.829 [3.755–4.639] |

Wide serial retrieval and sparse batched retrieval failed in all three runs with capabilities authorization. Each connection closed without an HTTP response, before the client deadline. The table records time to failure for those rows; the cause remains unresolved. Deep serial, deep batched, and wide batched capabilities requests all completed, so the failure depended on the workload.

The faster `/can` results still require the [authorization semantics audit in Part 3](./graphql-auth-explosion-part-3-multiple-object-authorization). Timing success does not verify permission inheritance or the requirement to authorize every account in the collection.

## Application cache

Warm Redis helped the wide organization walk, but made little difference for one dense account containing 20,000 users. Both comparisons used batched `/can`, batch size 1000, and complete organization partition walks. “Cold” means Redis was flushed; PostgreSQL buffers could already be warm.

| Fixture | Cold Redis | Warm Redis | Cold/warm ratio |
| --- | ---: | ---: | ---: |
| Wide organization | 1.061 [0.963–1.251] | 0.745 [0.713–0.770] | 1.4× |
| Dense account, 20,000 users | 3.210 [3.122–3.307] | 3.136 [2.847–3.764] | 1.0× |

The wide organization’s median fell by about 30%. The dense account’s median fell by only about 2%, with overlapping ranges. Cache gains varied substantially with the workload.

## GraphQL MSP scale

The multi-organization MSP walks showed much larger cache gains. With batched `/can` and batch size 10000, warm Redis made complete GraphQL walks roughly seven times faster than running without Redis.

| Returned accounts (pages) | Redis off | Redis cold | Redis warm | Off/warm ratio |
| --- | ---: | ---: | ---: | ---: |
| 9,999 (1) | 16.693 [16.534–16.972] | 7.474 [7.165–7.826] | 2.135 [2.103–2.302] | 7.8× |
| 49,999 (5) | 84.470 [83.670–87.601] | 37.970 [37.413–38.872] | 11.603 [10.843–13.206] | 7.3× |
| 99,999 (10) | 175.411 [174.357–183.449] | 78.770 [78.492–81.241] | 24.058 [22.257–28.946] | 7.3× |

All these walks completed. For the nominal 100k fixture, returning 99,999 accounts across ten pages took 175.4s without Redis, 78.8s with cold Redis, and 24.1s with warm Redis. These accounts span multiple organizations.

## Batch boundaries

Larger pages reduced the repeated work needed to retrieve the same 9,999 accounts. This comparison used the nominal MSP 10k fixture with Redis enabled and `/can`.

| Batch size | Pages | Cold | Warm |
| --- | ---: | ---: | ---: |
| 200 | 50 | 18.441 [18.074–22.060] | 10.264 [10.101–10.438] |
| 1000 | 10 | 9.892 [9.704–10.360] | 3.597 [3.465–3.664] |
| 10000 | 1 | 7.474 [7.165–7.826] | 2.135 [2.103–2.302] |

Increasing batch size from 200 to 10000 reduced the walk from 50 pages to one. The median warm total fell from 10.264s to 2.135s, a 4.8× improvement; the cold total improved by 2.5×. The test did not measure the memory cost or concurrent throughput of those larger responses.

Caching did not improve every GraphQL workload: a separate dense-organization query at batch size 10000 had a warm median of 3.770s versus 3.279s cold.

## Measurement scope

The benchmark ran on an AMD Ryzen 9 7940HS host with 8 cores / 16 threads and about 61 GiB usable RAM, using Ruby 4.0.6, PostgreSQL 18.6, and Redis 8.10.1. Seeding had finished and background workers were stopped before measurement.

Three runs per comparison show the size and variation of these effects in this environment. They do not establish tail latency, performance under concurrent load, or a maximum supported dataset. Full-walk totals exclude pauses between requests and trace collection. Peak memory and the cause of the failed requests were not measured or established.

The [trace gallery](./graphql-auth-explosion-traces) illustrates the service calls behind these patterns using samples from a later September 12 collection. The [benchmark JSON](/traces/iam/benchmark-summary.json) contains the extracted comparisons, and the [collection status](/traces/iam/collection-status.json) records completion details for the September 10 run.
