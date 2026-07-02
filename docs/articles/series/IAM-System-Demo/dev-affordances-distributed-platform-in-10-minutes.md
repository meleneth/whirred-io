# How I Scaffolded an Entire Distributed Platform in 10 Minutes

> Status: Draft

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Section: Developer Affordances

tl;dr: first, I spent A Long Time writing a scaffolding tool

In order to explore graphql and service oriented architecture at scale, I needed a playground.

Being able to run your entire setup in different environments forces you to be honest about a bunch of details and I had written the [Mobilis](https://github.com/meleneth/mobilis) project to scaffold service based architectures, so step one was using that to generate the layout.

I used the script at the end to do it.  

Mistakes were made.  Localstack instead of goaws, only having Redis for the authorization service, no Groups service are front of mind when thinking about them.  It did, however prove a fertile lab to find out where the holes in my understanding were.

[initial generated codebase](https://github.com/meleneth/iam-system-demo/tree/134a9a2e956438289680b489d9d047cd9988859a)

So we got to skip-start to being able to blast code in, with a bunch of rails services, a deployment machinism via docker compose, and being able to run all environments at the same time due to non-conflicting ports throughout.

A very useful detail of this abstraction is the dc_dev, dc_test, and dc_prod scripts that get generated.  They bundle up the long list of docker compose flags needed to use the system in different environments, and let you treat it as if it was a simple compose.yml

The complexity is needed because maintaining multiple environments worth of configs can be a very large pain.  The generated system has mutiple top level entry points for compose, and is built out of per-service includes in the top level *-compose.yml files.  We also have all the needed evironment variables in test.env, development.env, and production.env.

The trickies part is the per-env overrides.

we have *-overrides.yml files at the top level.  This was needed because in production, rails defaults to needing a full 4 different DB's not just one.

We probably didn't need all the other databases - I'm pretty sure we only really used the dev env - but not needing it this time didn't really matter when the support came free on the thing I really wanted anyways - one command scaffold of my entire environment so I could start hacking

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


## Related

- [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

Next: [ActiveResource and the Default Implementation that Astounded Me](/articles/series/IAM-System-Demo/dev-affordances-activeresource-default-implementation)
