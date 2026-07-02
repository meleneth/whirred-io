# Devcontainers for Local Distributed Systems

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Section: Developer Affordances

> Status: skeleton

## Why this belongs here

The IAM demo is a distributed system, even when it runs on one machine. That means the local development environment has to make multiple services, ports, databases, caches, queues, and documentation surfaces feel boring enough to work with.

The devcontainer is not the core auth problem. It is an affordance: it reduces the number of unrelated setup decisions a developer has to make before they can inspect the actual system behavior.

## What the devcontainer should provide

- a consistent Node/Ruby/service toolchain for the repo
- predictable port forwarding for the docs and local services
- a one-command path to start the documentation server
- enough Docker access to build or run the service topology
- fewer host-machine assumptions during debugging

## Why it matters to this case study

When the interesting failure is hidden in request fan-out, cache boundaries, and service ownership, local setup friction is not harmless. Every broken port, missing dependency, or different host configuration steals attention from the actual architecture.

A good devcontainer does not solve the distributed system. It makes the system available for inspection.

Previous: [Creating a Million Users](/articles/series/IAM-System-Demo/dev-affordances-creating-a-million-users)

Next: [Foreman for Local Process Orchestration](/articles/series/IAM-System-Demo/foreman-for-local-process-orchestration)
