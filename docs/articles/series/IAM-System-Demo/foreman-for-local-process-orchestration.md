# Foreman for Local Process Orchestration

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Section: Developer Affordances

> Status: skeleton

## Why this belongs here

Once the environment exists, the next problem is orchestration. A distributed Rails demo can be technically local while still needing several long-running processes: web services, workers, queues, caches, telemetry, and docs.

Foreman is useful because it makes that process set explicit.

## What Foreman should make visible

- which services are expected to run together
- which processes are web servers, workers, or support services
- which ports and environment variables matter
- how logs from separate services line up in time
- what changed when one service was added or removed

## Why it matters to this case study

The auth explosion is a coordination problem. User Management calls User, Account, Organization, Group, and Authorization services. Those calls need to be visible locally, not hidden behind a pile of terminal tabs and half-remembered commands.

Foreman does not make the architecture correct. It makes the running shape legible enough to debug.

Previous: [Devcontainers for Local Distributed Systems](/articles/series/IAM-System-Demo/devcontainers-for-local-distributed-systems)
