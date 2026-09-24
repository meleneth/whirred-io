# Extracting Cross-Service Models into Shared Gems

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Section: Developer Affordances

The IAM demo originally defined its remote models inside every service that needed them. `Account`, `User`, `Group`, and `OrganizationAccount` looked like ordinary application models, but they were ActiveResource clients for records owned somewhere else. As the APIs gained batching, authorization context, tracing, and stricter result handling, those copies stopped being harmless duplication.

The refactor extracted each cross-service model into a small gem. The goal was not to create a general SDK or hide the network. It was to give every consumer one tested implementation of the same remote contract while keeping service ownership visible.

This article covers the extraction completed in [`4e00444`](https://github.com/meleneth/iam-system-demo/tree/4e00444fc2b6bd11bf2ec1489422590eb5390bfb) and the directory cleanup in [`42f2ec4`](https://github.com/meleneth/iam-system-demo/tree/42f2ec4). The authorization semantics beneath these models are covered separately in [Explicit Authorization Contexts at the Model Boundary](./dev-affordances-explicit-authorization-boundaries).

## Why the service-local copies became a problem

A remote model contains more than its class name and endpoint. It defines the wire format, primary key, collection path, custom endpoints, batching limits, response reconstruction, authorization-context propagation, and trace names. A fix applied in one service but missed in another creates two clients for what is supposed to be one contract.

That risk grew with the system. An `Account` client needed single and batched hierarchy reads. `OrganizationAccount` needed organization lookup, managed-account pagination, counts, and internal selection endpoints. Group-related resources needed authorization-safe searches and collection behavior. Each new operation expanded the surface that could drift.

The duplication also obscured a useful architectural fact. An `Account` ActiveResource class is not owned by User Management or Authorization Service simply because a copy lives in that application's `app/models`. It is a client for Account Service. Its code should have the same identity wherever it is used.

## The package boundary

The repository now keeps nine related local gems under `gems/`:

| Layer | Gems | Responsibility |
| --- | --- | --- |
| Request authority | `authorization-context` | Scope, capture, restoration, and transport headers |
| Shared remote/local behavior | `authorized-resource` | ActiveResource transport guards, owning-model authorization, batching, failures, and telemetry |
| Remote contracts | seven `*-resource` gems | One concrete client for each cross-service record type |

The seven contract gems are `account-resource`, `capability-grant-resource`, `group-resource`, `group-user-resource`, `organization-account-resource`, `organization-resource`, and `user-resource`.

Each contract gem is intentionally small. Its gemspec depends on `authorized-resource`, its library defines the familiar model constant, and its specs exercise the endpoints and result shapes specific to that resource. For example, the Account client owns the code for batch hierarchy retrieval and for restoring results to the caller's requested order:

```ruby
class Account < AuthorizedResource::Base
  self.site = ENV.fetch("ACCOUNT_SERVICE_API_BASE_URL")
  self.collection_name = "accounts"

  def self.with_parents_batch(account_ids)
    Array(account_ids).each_slice(batch_size).flat_map do |ids|
      authorized_read("with_parents_batch") do
        raw = connection.post(
          "/accounts_with_parents",
          { account_ids: ids }.to_json,
          headers.merge("Content-Type" => "application/json")
        )

        ActiveSupport::JSON.decode(raw.body).map do |hierarchy|
          hierarchy.map { |attributes| new(attributes) }
        end
      end
    end
  end
end
```

The important part is not that this code lives in a gem. It is that batching, context propagation, and decoding now have one implementation for every caller.

## What changed in the services

Consumers declare the contracts they actually use:

```ruby
gem "authorization-context", path: "../gems/authorization-context"
gem "authorized-resource", path: "../gems/authorized-resource"
gem "account-resource", path: "../gems/account-resource"
gem "user-resource", path: "../gems/user-resource"
```

The extraction removed 492 lines of copied model implementations from service `app/models` directories. The commit added 993 lines across the new packages, their isolated specs, dependency wiring, lockfiles, and container builds. That is not presented as a net line-count reduction: packaging code responsibly adds manifests and tests. The gain is that contract behavior exists once and can be verified without booting an arbitrary consumer service.

The application still refers to `Account`, `User`, or `Group`. Moving those constants preserved the calling code while changing where their behavior is owned. This made the refactor narrow enough to validate against the same end-to-end workloads instead of combining it with a rewrite of every call site.

## Local gems inside container builds

Path dependencies introduce a deployment detail: Bundler must see the local gem directories when it resolves and installs dependencies. Each service image therefore copies its required gems into the build stage before `bundle install`, then carries those paths into the final image because the installed bundle still refers to them.

That makes the Docker build dependency graph explicit. A service cannot be built from its application directory alone while its Gemfile points outside that directory; the repository root is the build context. It also means a resource-gem change invalidates the relevant dependency layer, which is desirable when the service must be rebuilt against a changed contract.

For this monorepo, path gems are a useful intermediate boundary:

- changes remain atomic with their service consumers;
- no private gem server or publication step is required;
- Bundler and gemspecs still express dependencies precisely;
- each package can run focused specs;
- extracting or publishing a package later would not require inventing its boundary from scratch.

The tradeoff is coordination. These gems do not let services deploy incompatible versions independently while they all point at the same checkout. That is acceptable for this demo and should not be confused with a universal microservice packaging strategy.

## What belongs in a resource gem

The extraction used a practical rule: code belongs in a resource gem when it describes the client contract for one owning service.

That includes:

- endpoint and collection configuration;
- schemas and identifiers;
- custom reads and searches;
- request chunking and ordering guarantees;
- response decoding;
- logical operation names for authorization and traces.

It does not include the caller's workflow, presentation concerns, or the owning service's persistence model. The resource gem knows how to ask for Accounts; it does not decide why User Management needs them. Conversely, Account Service still owns its Active Record model and the policy attached to those records.

This distinction prevents “shared models” from becoming a shared domain layer that couples every service to every other service's internals. What is shared is the remote contract, not database ownership.

## Verification after extraction

The refactor was checked at three levels:

1. Each resource gem received isolated specs for its configuration, headers, custom endpoints, batching, and decoded results.
2. The affected service suites exercised the gems through their existing application paths.
3. The production-shaped gallery workloads were rerun against clean revision `4e00444`.

Those new traces are now in the [trace gallery](./graphql-auth-explosion-traces). They show the `authorized_resource.*` operations at the transport boundary and `authorized_resource.authorize` inside the service that owns the data. The successful wide request still returned exactly 251 Accounts, 5,020 Users, 502 Groups, and 5,271 memberships after the model implementations moved out of the consuming applications.

The extraction did not make remote calls local, remove service failures, or turn distributed contracts into ordinary Ruby inheritance. It did something more modest and more useful: it made one remote contract mean the same thing everywhere it is used.

Back to: [Developer Affordances](/articles/series/IAM-System-Demo/iam-system-demo#developer-affordances)
