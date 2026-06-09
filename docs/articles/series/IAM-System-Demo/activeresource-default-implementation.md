# ActiveResource and the Default Implementation that Astounded Me

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

> Status: skeleton
ActiveResource is a library that got removed from Ruby on Rails.

It's supposed to let you access a remote object somewhat like you would a local model.

Out of the box, the rails Rest model can be 'a bit awkward' for using these things - for values of it's very easy to transfer the entire table and do local filtering, which 'doesn't scale' as the kids say.

So we made `lib/mel/filterable.rb`:

```ruby [lib/mel/filterable.rb]
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

This lets you declare filterable fields in your database model

```ruby [app/models/organization_account.rb]
# frozen_string_literal: true

# app/models/organization_accounts.rb

class OrganizationAccount < ApplicationRecord
  include Mel::Filterable
  filterable_fields :account_id, :organization_id

  belongs_to :organization, class_name: "Organization", optional: false
  validates :account_id, presence: true
end
```

and add a bit to the controller (authorization calls omitted):

```ruby [app/controllers/organization_accounts_controller.rb]
class OrganizationAccountsController < ApplicationController
  before_action :require_filters, only: [:index]

  def require_filters
    if params.slice(*OrganizationAccount.allowed_filters).blank?
      render json: { error: "Filter required" }, status: 400
    end
  end

  # GET /organization_accounts
  def index
    filters = params.slice(*OrganizationAccount.allowed_filters).permit!
    raise BadFilterError unless filters.present?

    results = OrganizationAccount.where(*filters)
    render json: results
  end
end
```

This lets you (in a remote service) do this:

```ruby
org_accounts = OrganizationAccount.find(
  :all,
  params: { organization_id: org_account.organization_id }
)
```

without bringing the whole table local and filtering it the hard way.

What might not be immediately visible here is that the filters support arrays - you can ask for multiple objects at the same time, and they will be returned in 1 HTTP call that corresponds to 1 SQL query, and retrieve multiple objects.

```ruby
accounts_to_load = [
  '43ef7000-f81d-4402-a513-263bc6016be0',
  '194f08f2-3763-4a54-b07f-0d378cbb3d4d'
]

accounts = Account.find(:all, params: { id: accounts_to_load })
```

If you need to encode array-style params via Faraday, it can be done like this:

```ruby
def self.user_can(user_id, scope_type, permission, scope_id)
  scope_ids = Array(scope_id)
  query_string = URI.encode_www_form(scope_ids.map { |id| ["scope_id[]", id] })

  url = "#{Env::AUTHORIZATION_SERVICE_API_BASE_URL}/can/#{scope_type}/#{permission}?#{query_string}"

  response = Faraday.get(url) do |req|
    req.headers["pad-user-id"] = user_id
  end

  response.status == 200
end
```

