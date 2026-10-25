# Cross-Service Resource Gems

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Section: Developer Affordances

A remote model contains more than a class name and endpoint. It defines wire format, custom reads, batching limits, result ordering, authorization-context propagation, and trace operations. The IAM demo packages those client contracts once so every consumer uses the same implementation without pretending the records have a new owner.

## Nine Local Gems, Three Responsibilities

The repository keeps nine local gems under `gems/`:

| Responsibility | Gems |
| --- | --- |
| Actor scope and propagation | `authorization-context` |
| Shared remote transport and owner-side model enforcement | `authorized-resource` |
| Concrete cross-service clients | `account-resource`, `capability-grant-resource`, `group-resource`, `group-user-resource`, `organization-account-resource`, `organization-resource`, `user-resource` |

All seven concrete resource gems depend on `authorized-resource ~> 0.2`. Five also declare Faraday because their custom endpoints use it directly: capability grant, Group, OrganizationAccount, Organization, and User. `authorization-context` depends on Active Support; `authorized-resource` depends on Active Record, ActiveResource, authorization context, and the OpenTelemetry API.

These dependencies describe implementation needs, not domain ownership. `account-resource` is a client for Account Service. A service that depends on the gem does not acquire Account records or Account policy.

## What a Resource Contract Contains

The Account client owns the remote operations that every consumer must perform the same way:

```ruby
class Account < AuthorizedResource::Base
  self.site = ENV.fetch("ACCOUNT_SERVICE_API_BASE_URL")
  self.collection_name = "accounts"

  def self.with_parents_batch(account_ids)
    Array(account_ids).each_slice(batch_size).flat_map do |ids|
      authorized_read("with_parents_batch") do
        response = connection.post(
          "/accounts_with_parents",
          { account_ids: ids }.to_json,
          headers.merge("Content-Type" => "application/json")
        )
        format.decode(response.body).map do |hierarchy|
          hierarchy.map { |attributes| new(attributes) }
        end
      end
    end
  end
end
```

The complete client also restores batched hierarchies to requested-root order and fails ambiguous results closed. Other resource gems own their corresponding searches, count calls, capability reads, Organization membership lookups, and managed-Organization paging.

The boundary includes:

- endpoint, collection, identifier, and schema configuration;
- custom reads and filtered searches;
- request chunking and ordering guarantees;
- response decoding and regrouping;
- authorization-context propagation; and
- logical operation names for telemetry.

It excludes the caller's workflow, presentation concerns, and the owning service's persistence model or policy. The separate `MspManagedOrganization.page` adapter in User Management knows how to request an MSP page; it does not decide which rows may be disclosed. Organization Service still selects the relationship rows and enforces their policy.

## Shared Code Does Not Mean Shared Deployment State

The services use Bundler path dependencies, so container builds copy the required gem directories before `bundle install` and retain them in the final image. The repository root is the Docker build context.

This arrangement gives the monorepo one testable implementation per remote contract without a private gem publication step. It does not guarantee that every running service uses the same version. Images must still be rebuilt and deployed together when a contract change requires it, and an independently deployed service could run an older package.

The focused gem specs exercise configuration, headers, custom endpoints, batching, decoded result shapes, policy evaluation, and failure handling. Service request specs then exercise those clients and owner-side models through their application paths. That evidence supports the contract behavior; it is not a current latency benchmark.

Shared resource gems reduce duplicated client behavior while leaving ownership visible: callers transport an actor and a request, the owning service returns owner-authorized data, and Authorization Service evaluates the permissions the owner asks about.

Related: [Explicit Authorization Contexts at the Model Boundary](./dev-affordances-explicit-authorization-boundaries)
