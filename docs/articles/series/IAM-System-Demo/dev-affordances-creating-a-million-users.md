# Creating a Million Users

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Section: Developer Affordances

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
- In this run it used far less observed memory than the LocalStack setup.

Goaws made the stress harness practical on the development host. This was an
operator observation from the experiment, not a controlled memory benchmark of
the two projects.

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

The run produced the large fixture needed to expose retrieval behavior. It did
not record a publication-quality creation-duration, worker-count, failure-rate,
or peak-memory result, so it should not be read as proof of a one-million-user
throughput limit. The measured articles use named subsets and fixtures with
their own request outcomes instead.

## Outro

The async user creation project was not a feature. It was a synthetic data
factory that made large retrieval and authorization experiments possible. The
later benchmarks and correctness suites—not the fact that the records could be
created—supply the evidence about those request paths.

LocalStack failed this local workload; Goaws completed it with much lower
observed overhead. Rails workers inside Docker made the concurrency easy to
adjust, while the absence of a controlled creation benchmark remains a limit of
this experiment.
