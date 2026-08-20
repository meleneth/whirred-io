# GraphQL Auth Explosion Case Study, Part 8: Falcon

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: Codex source-audit draft

> Attribution: Codex generated this source-audit draft from the current `meleneth/iam-system-demo` source and commit history. It intentionally refuses to claim a Falcon result that the repository does not currently demonstrate.

## The Repository Does Not Prove the Original Claim

The original draft says that moving from Puma to Falcon unlocks Async and produces large per-server gains for this network-heavy workload.

That is a plausible hypothesis. It is not what the current source repository proves.

The current user-management service:

- includes Puma in its Gemfile;
- configures Puma's thread pool in `config/puma.rb`;
- starts Rails through Thruster and the normal Rails server command;
- includes the `async` gem for explicit within-request work;
- does not include Falcon as the deployed web server.

The historical `real_async` branch adds `async-http` and an `Async::Semaphore` to the GraphQL account source, but still declares Puma as the Rails web server. The corresponding “real async” commit was later reverted on the main line.

This article therefore needs to separate three kinds of concurrency before making a server claim.

## Server Concurrency

Puma serves several top-level requests through worker processes and thread pools. When one thread waits on a downstream HTTP call, another thread may serve another request.

Falcon uses an Async-based execution model that can schedule I/O-bound work cooperatively. That may reduce the cost of keeping many waiting operations in flight.

Both are server-level strategies. Neither changes an individual GraphQL request from this:

```text
N accounts -> N user requests -> N x M group requests
```

into a batched request. A server can tolerate a bad request shape more efficiently while the system still collapses under the multiplied downstream work.

## Within-Request Concurrency

The account Dataloader source partitions account IDs and overlaps a bounded number of downstream requests. That is within-request concurrency.

It can be implemented with threads, Async tasks, fibers, or another scheduler. The surrounding invariants remain:

- batch before partitioning;
- cap the number of in-flight partitions;
- preserve actor headers and trace context;
- respect connection-pool limits;
- reconstruct results in the caller's key order.

Changing the web server may make one implementation more natural. It does not remove those requirements.

## Downstream Concurrency

Every concurrent top-level or within-request operation becomes load on another service:

```text
user-management concurrency
  -> user-service requests
  -> group-service requests
  -> authorization-service requests
  -> database and Redis work
```

A benchmark that measures only user-management request throughput can make a server look excellent while saturating a downstream pool or increasing tail latency across the complete system.

The unit of measurement has to be the distributed request, not the front server in isolation.

## What Would Establish the Falcon Claim

To make Falcon a supported conclusion, the comparison should hold the architecture constant and record at least:

- identical GraphQL query and fixture;
- identical service topology and downstream pool sizes;
- Puma and Falcon process/concurrency configuration;
- requests per second;
- median, P95, and P99 latency;
- errors and timeouts;
- CPU and memory per service;
- downstream request counts from traces;
- whether one large request harms unrelated small requests.

The dense query and continuation fanout fixtures are useful because they stress different things:

- dense expansion stresses payload size and a large number of users in one authorization scope;
- MSP fanout stresses repeated account partitions and continuations;
- a small account query provides a latency control.

Until that comparison is recorded in the repository, Falcon remains an experiment worth running, not an architectural result established by this case study.

The `real_async` branch is nevertheless valuable experimental material: it preserves the scheduler-oriented client attempt and gives the benchmark work a concrete historical implementation to inspect rather than requiring the experiment to be reconstructed from memory.

## The Result the Repository Does Establish

The source does establish a stronger and more portable conclusion:

> Web-server concurrency matters after the distributed request has been engineered around collections. It cannot substitute for that engineering.

The important wins survive whether the composition service runs Puma, Falcon, or something else:

- hierarchy traversal happens in account-service;
- remote retrieval accepts bounded collections;
- authorization collapses rows to distinct scopes;
- GraphQL Dataloader preserves collection opportunities;
- continuation prevents enormous estates from becoming one response;
- concurrency is bounded instead of assumed free.

That is a more defensible end to the series than crediting the web server for work the API and data model actually did.

Previous: [Part 7: GraphQL and Dataloader](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-7-graphql-and-dataloader)  
Next: [Conclusion: Architecture Is Throughput](/articles/series/IAM-System-Demo/graphql-auth-explosion-conclusion)
