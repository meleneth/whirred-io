# GraphQL Auth Explosion Case Study, Part 6: Async MADNESS

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: Codex expansion draft

> Attribution: Codex generated the expansion in this draft from the current `meleneth/iam-system-demo` source and its commit history. This note is intentionally specific so the generated lines remain obvious until they are rewritten.

## Four Different Ideas Were Hiding Under “Async”

Once collection APIs existed, the next temptation was to call everything async and declare victory. The source history is more useful than that story.

There are four separate mechanisms:

- **Batching:** send many logical keys in one downstream request.
- **Chunking:** divide a collection into bounded batches.
- **Concurrency:** allow several chunks to be in flight at once.
- **Continuation:** divide the user-visible result into independently requested pages.

They solve different problems. Concurrency cannot replace batching, and a giant batch cannot replace continuation.

## The First Async Fetch

The user-management account view used the `async` gem to fetch groups of account IDs concurrently:

```ruby
Async do |task|
  account_ids.each_slice(5).map do |group|
    task.async do
      OpenTelemetry::Context.with_current(parent_ctx) do
        Account.with_headers("pad-user-id" => actor_id) do
          Account.where(id: group).to_a
        end
      end
    end
  end.flat_map(&:wait)
end.wait
```

This was already better than one `Account.find` per account because each task fetched a collection. Async execution reduced the wall-clock cost of the remaining partitions.

The ordering matters:

1. Fix the single-record API.
2. Pick a bounded chunk size.
3. Add bounded concurrency across chunks.

Starting at step three merely launches the N+1 faster.

## The GraphQL Source Uses a Bounded Worker Pool

The current [`Sources::AccountById`](https://github.com/meleneth/iam-system-demo/blob/main/user-management-service/app/graphql/sources/account_by_id.rb) uses:

```ruby
CHUNK_SIZE = 200
MAX_CONCURRENCY = 4
```

It deduplicates keys, partitions them, and processes at most four partitions concurrently. The current implementation uses a small thread worker pool rather than an Async reactor because the code has to coexist with ActiveResource headers, tracing context, and Rails connection state.

That is not an aesthetic detail. Concurrency makes hidden mutable state and connection-pool assumptions observable. The repository README explicitly lists races in shared headers as a known deficiency.

## “Real Async” Was Tried and Reverted

The git history records an attempt to replace the thread pool with `Async::Semaphore` and `async-http`. The commit was named:

> Attempt at going real async, which I thought we had before, but maybe not?

It was then reverted.

That failed experiment belongs in the case study because it prevents a false conclusion. The durable architecture is not “Ruby Async made the system scale.” The durable architecture is:

- collection-shaped endpoints;
- bounded partitions;
- explicit concurrency limits;
- request identity and trace propagation;
- service-owned authorization and cache decisions.

The concurrency implementation can change without changing those invariants.

## Concurrency Amplifies the Existing Request Shape

Suppose 600 accounts are fetched in batches of 200:

```text
600 accounts / 200 per request = 3 downstream requests
```

Sequential execution pays roughly the sum of their latencies. With a concurrency limit of four, all three may overlap, so wall-clock time approaches the slowest partition rather than the sum.

But downstream work still exists. Each partition may cause:

- account hydration;
- user hydration;
- group membership hydration;
- group hydration;
- distinct-scope authorization;
- JSON construction and serialization.

Increasing concurrency consumes more downstream connections and capacity. It can improve latency while reducing the number of simultaneous top-level requests the complete system can safely support.

## The Large Fanout Results Put a Boundary Around the Claim

The full continuation benchmark produced these representative results:

| Workload | Accounts returned | Pages | Warm full-walk time |
| --- | ---: | ---: | ---: |
| 10k MSP fanout | 9,999 | 10 | 46.276s |
| 50k MSP fanout | 49,999 | 50 | 281.135s |
| 100k MSP fanout | 99,999 | 100 | 686.220s |

Warm Redis results were not materially faster than cold results for these payload-heavy walks. The dominant work was repeated user/group hydration and serialization across continuation pages, not the cached authorization primitive.

This is what the system should look like when the fixed overheads have been removed: cost scales with the amount of real data work left to perform.

It also explains why simply raising the page size is not a free win. Fewer HTTP pages reduce page overhead, but an enormous page makes one GraphQL request own all downstream hydration, authorization, memory, and serialization work. Eventually the retry unit and latency become unreasonable.

## Backpressure Is Part of Correctness

The concurrency limit is not merely a performance knob. It protects:

- downstream Rails thread pools;
- HTTP connection pools;
- database pools;
- Redis connections;
- memory retained by partial GraphQL results;
- the ability of other requests to make progress.

The useful question is not “can all partitions run at once?” It is “how many partitions may this request own while the complete distributed system remains healthy?”

Async is valuable here. It lets a request overlap independent I/O and use more of the deployed system. But it is the final multiplier on a good request shape, not the source of that shape.

Previous: [Part 5: Smart APIs](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis)  
Next: [Part 7: GraphQL and Dataloader](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-7-graphql-and-dataloader)

