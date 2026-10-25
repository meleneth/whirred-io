# ActiveResource Makes the Network Look Local

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Section: Developer Affordances

ActiveResource gives remote REST records a Rails-model-shaped API. That is convenient, but it can hide the most important property of an operation: a `find` or association traversal may be an HTTP request with downstream SQL and authorization work.

The IAM demo keeps that convenience while making collection APIs and authorization context explicit.

## Filter at the Owning Service

Owning models declare which filters their collection endpoint accepts:

```ruby
module Mel
  module Filterable
    extend ActiveSupport::Concern

    class_methods do
      def filterable_fields(*fields)
        @filterable_fields ||= []
        @filterable_fields.concat(fields.map(&:to_s))
      end

      def allowed_filters
        @filterable_fields || []
      end
    end
  end
end
```

`OrganizationAccount` permits `account_id` and `organization_id`. Its controller rejects an unfiltered collection read, applies the filter in Organization Service's database, materializes the rows, and lets the model policy authorize every returned relationship.

```ruby
def index
  filters = params.slice(*OrganizationAccount.allowed_filters).permit!
  raise BadFilterError unless filters.present?

  results = OrganizationAccount.where(filters).to_a
  render json: results
end
```

Filtering at the owner avoids transferring an entire table for local selection. It is not authorization proof: each `OrganizationAccount` row still requires `organization.read.accounts` on its Organization or `account.read` on its Account.

## Prefer Explicit Search Bodies for Large Collections

Array filters can carry several IDs in one call, but long query strings are a poor interface for large batches. Collection-heavy paths use JSON search endpoints:

```ruby
class User < AuthorizedResource::Base
  def self.search(params)
    authorized_read("search") do
      response = connection.post(
        "/users/search",
        params.to_json,
        headers.merge("Content-Type" => "application/json")
      )
      format.decode(response.body).map { |attributes| new(attributes) }
    end
  end
end
```

The caller enters `AuthorizationContext.as_requesting_user` once. `AuthorizedResource::Base` adds a fresh `pad-user-id` header and transports the response; User Service owns the `account.users.read` policy for the returned Users. The client does not make a second `/can` call or treat the response as authority for later requests.

This is the balance the demo needs: familiar model syntax at call sites, explicit collection-shaped APIs for expensive paths, and no ambiguity about which side of the HTTP boundary owns policy.

Related: [Explicit Authorization Contexts at the Model Boundary](./dev-affordances-explicit-authorization-boundaries) and [Cross-Service Resource Gems](./dev-affordances-cross-service-resource-gems)
