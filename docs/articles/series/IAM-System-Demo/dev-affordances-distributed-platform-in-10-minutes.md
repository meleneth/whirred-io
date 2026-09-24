# How I Scaffolded an Entire Distributed Platform in 10 Minutes

> Status: Draft

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Section: Developer Affordances

**tl;dr:** I spent a long time writing a scaffolding tool, then used it to make the boring first ten minutes of this experiment genuinely take ten minutes.

To explore GraphQL authorization in a service-oriented system, I needed more than a few isolated Rails applications. I needed a playground with separate services and databases, service discovery, messaging, observability, and enough environment configuration to run the whole thing consistently.

I already had [Mobilis](https://github.com/meleneth/mobilis), a tool I wrote to scaffold service-based architectures. The script below describes the initial platform: which services exist, which infrastructure they depend on, and how they connect. Mobilis turned that description into the repository layout, Rails applications, Docker Compose configuration, environment files, and helper scripts.

The useful part was not that it "designed a distributed system" for me. It did not. It gave me a repeatable baseline so I could spend the next hour testing authorization behavior instead of copying Compose fragments, allocating ports, and bootstrapping the same Rails conventions five times.

The result is preserved as the [initial generated codebase](https://github.com/meleneth/iam-system-demo/tree/134a9a2e956438289680b489d9d047cd9988859a).

## What the scaffold bought me

The generated repository started with several concrete affordances:

- Each service had its own application and database configuration.
- Docker Compose could start the platform as a connected system.
- Ports were assigned consistently, so development, test, and production-shaped stacks could coexist without accidental conflicts.
- Observability services were wired in from the beginning rather than postponed until debugging became painful.
- Connections between applications and their dependencies were expressed once in the DSL and reflected in the generated environment.

None of these tasks is individually difficult. Together, they create enough friction that it is tempting to simplify an experiment until it no longer resembles the system being investigated. Scaffolding made the more representative experiment cheap enough to try.

## Making Compose usable

One small feature did a disproportionate amount of work: the generated `dc_dev`, `dc_test`, and `dc_prod` scripts. Each script bundles the Compose files, overrides, and environment arguments for one environment. From the operator's perspective, a layered configuration behaves like a single `compose.yml`.

Underneath those commands, the repository has top-level Compose entry points assembled from per-service includes, plus `development.env`, `test.env`, and `production.env`. Top-level `*-overrides.yml` files hold the differences that cannot be shared cleanly. Rails' production database layout, for example, may require more database roles than the development setup.

That structure is more machinery than this particular experiment ultimately needed; most of the work happened in development. Its value was consistency. Once Mobilis knew how environments were composed, every generated platform got the same interface and I did not have to reconstruct the correct command each time.

## What the scaffold did not buy me

Fast generation also made it cheap to encode questionable decisions. I chose LocalStack where GoAWS may have been a better fit, attached Redis only to the authorization service, and omitted a dedicated Groups service. Those were real modeling mistakes, not generator failures.

That distinction matters. A scaffold removes setup cost and makes conventions repeatable. It does not validate the architecture those conventions produce. In this project, the generated baseline was valuable precisely because it let me reach the interesting mistakes sooner, observe their consequences, and revise the system.

Here is the input that produced that baseline:

```ruby
#!/usr/bin/env ruby

require "mobilis"

Mobilis::DSL.generate("parent_account_id") do
  # Infra
  redis("authcache")

  localstack("eventstream") do |svc|
    svc.sns_sqs("capability-changes", ["capability-changes"])
    svc.sns_sqs("group-membership-changes", ["group-membership-changes"])
    svc.sns_sqs("account-structure-changes", ["account-structure-changes"])
  end

  otel_collector("otel-collector")
  grafana("grafana")
  jaeger("jaeger")
  prometheus("prometheus")

  connect from: "grafana", to: "prometheus"
  connect from: "otel-collector", to: "jaeger"
  connect from: "prometheus", to: "otel-collector"

  # Services

  rails("user-service", primary_database: postgres("user-db"), api: true) do |svc|
    svc.install_graphql!
    svc.use_rspec!

    svc.write_file("app/models/user.rb", <<~USERMODEL)
      # frozen_string_literal: true

      class User < ApplicationRecord
      end
    USERMODEL

    svc.write_file("db/migrate/20250714003610_create_users.rb", <<~USERS)
      # frozen_string_literal: true
      class CreateUsers < ActiveRecord::Migration[8.0]
        def change
          create_table :users, id: :uuid do |t|
            t.uuid :account_id, index: true
            t.string :email
            t.string :username
            t.string :first_name
            t.string :last_name
            t.string :middle_name
            t.string :phone_number
            t.string :alt_phone
            t.string :slack_id
            t.string :avatar_url
            t.string :linkedin
            t.string :github
            t.string :twitter
            t.string :tshirt_size
            t.string :pronouns
            t.string :timezone
            t.timestamps
          end
        end
      end
    USERS
  end

  rails("account-service", primary_database: postgres("account-db"), api: true) do |svc|
    svc.install_graphql!
    svc.use_rspec!

    svc.write_file("db/migrate/20250714003609_create_accounts.rb", <<~ACCOUNTS)
      # frozen_string_literal: true
      class CreateAccounts < ActiveRecord::Migration[8.0]
        def change
          create_table :accounts, id: :uuid do |t|
            t.string :name
            t.uuid :parent_account_id, index: true

            t.timestamps
          end

          add_foreign_key :accounts, :accounts, column: :parent_account_id
        end
      end
    ACCOUNTS

    svc.write_file("app/models/account.rb", <<~ACCOUNTMODEL)
      # frozen_string_literal: true
      # app/models/account.rb

      class Account < ApplicationRecord
        belongs_to :parent_account, class_name: "Account", optional: true
        has_many :child_accounts, class_name: "Account", foreign_key: :parent_account_id, dependent: :nullify
        before_validation :assign_default_name, on: :create

        private

        def assign_default_name
          if name.blank?
            self.id ||= SecureRandom.uuid
            self.name = "Account \#{id}".truncate(36)
          end
        end
      end
    ACCOUNTMODEL
  end

  rails("authorization-service", primary_database: postgres("authz-db"), api: true) do |svc|
    svc.install_graphql!
    svc.use_rspec!

    svc.write_file("db/migrate/20250714003611_create_capabilities.rb", <<~CAPABILITIES)
      # frozen_string_literal: true
      class CreateCapabilities < ActiveRecord::Migration[8.0]
        def change
          create_table :capabilities, id: :uuid do |t|
            t.uuid :subject_id, index: true
            t.uuid :account_id, index: true
            t.string :permission
            t.timestamps
          end
        end
      end
    CAPABILITIES
  end

  connect from: "authorization-service", to: "authcache"

  rails("organization-service", primary_database: postgres("organization-db"), api: true) do |svc|
    svc.install_graphql!
  end

  rails("user-management-service") do |svc|
    svc.install_graphql!
    svc.use_tailwind!
    svc.use_rspec!
    svc.write_file("scripts/setup.sh", <<~SETUP)
      #!/bin/bash
      bundle add activeresource --require active_resource
    SETUP

    svc.write_file("scripts/create_user.rb", <<~USERMODEL)
      # frozen_string_literal: true

      # app/models/user.rb
      class User < ActiveResource::Base
        self.site = ENV.fetch("USER_API_BASE_URL") # e.g., http://user-service:3000/
        self.format = :json

        # Optional: if the resource uses UUIDs instead of integers
        self.primary_key = "id"

        # Optional: if user-service uses a different collection path
        self.collection_name = "users"

        # Optional: handle nested resources, errors, etc.
      end
    USERMODEL

    svc.write_file("scripts/create_user.rb", <<~CREATEUSER)
      User.create(name: "bleh")
    CREATEUSER
  end

  # OTEL wiring
  connect from: "user-service", to: "otel-collector"
  connect from: "account-service", to: "otel-collector"
  connect from: "authorization-service", to: "otel-collector"
  connect from: "user-management-service", to: "otel-collector"

  # user-management wiring

  connect from: "user-management-service", to: "user-service"
  connect from: "user-management-service", to: "account-service"
  connect from: "user-management-service", to: "authorization-service"
  connect from: "user-management-service", to: "organization-service"
end
```

This is intentionally the **initial** scaffold, not the current data model.
The generated `capabilities.subject_id` table predates the authorization model
described in the case study. Active `capability_grants` now belong to Groups,
users receive them through Group memberships, and the later Group Service is a
first-class owner of Groups and membership rows. The old table remains only as
historical scaffold residue; current authorization does not read it.


## Related

- [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)
