# Creating a Million Users

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Section: Developer Affordances

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: draft

We did not build an async user creation pipeline because product needed it. We built it to see if our distributed retrieval model could take a beating.

When you want to load **hundreds of thousands of users spread across organizations and account hierarchies**, you need a way to generate them first. That meant async bulk creation: not for production signup, but for stress testing.

## Why async synthetic users?

The whole point of this project was to test:

- **Multi-object retrieval** across services
- **Hierarchical lookups** with parent accounts
- **Authorization behavior** under load

To make those tests meaningful, we needed a lot of users. A million at a time was a good start.

Synchronous creation would never cut it, so we leaned on async:

1. Enqueue synthetic user creation messages.
2. Let workers fan out the actual record creation.
3. Use the generated data to test retrieval at scale.

This was not production signup. It was a data factory.

## LocalStack to Goaws

Our first attempt used **LocalStack** for SNS/SQS emulation. It failed almost immediately:

- It did not reliably delete messages.
- Queues ballooned out of control.
- Even on a 32 GB machine, it could OOM itself to death.

Switching to **Goaws** changed the shape of the test harness:

- Single Go binary, trivial to run.
- Faithful enough to real AWS queue semantics for this workload.
- Even under a million synthetic user messages, it stayed tiny in memory.

Goaws made the stress harness possible. LocalStack was too heavy for this specific loop.

## Rails workers in containers

We did not need a separate worker cluster. Workers ran directly inside the same Rails service containers, using command overrides:

```yaml [docker-compose.yml]
services:
  user_mgmt_worker:
    build: .
    command: bundle exec rake jobs:work
```

That was enough to start multiple worker processes chewing through SQS messages in parallel. No production environment, no special scaling story: just containers and code paths close to the main app.

Because these were synthetic workloads, we could turn the dials however we wanted: 1 worker, 10 workers, 100 workers. The only limit was curiosity and the host machine.

## The stress test

Once the pieces were in place, we hammered the system:

- Bulk-created users by the million.
- Distributed them across deep organization and account hierarchies.
- Ran retrieval queries to see how the system held up.

The point was not to keep the users. It was to watch the retrieval pipeline under load and prove the design was sound enough to keep exploring.

Bulk creation was fast, retrieval scaled, and the caches plus CTE queries behaved as expected. The only reason to stop was running out of interesting theses to test.

## Outro

The async user creation project was not a feature. It was a synthetic stress harness that let us throw millions of objects into the system and prove our retrieval and authorization model scaled.

LocalStack collapsed. Goaws cruised. Rails workers inside Docker made it easy to spin up as much concurrency as we wanted.

Next: [Part 1: CTE](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-1-cte)
