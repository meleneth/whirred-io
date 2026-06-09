# Finer Points of Exception Handling

> Status: draft
>
> Disclosure: this article was substantially rewritten by AI from my notes because I wanted the idea clearer than I was getting it on the page. This blog is intended to be a mostly no-AI-slop zone, so this is called out explicitly.

## Or: This Pattern Will Eat Your Code Base

Exception handling got extra tricky in the age of observability.

Reporting an exception is fine. Reporting it and then continuing as if the failed operation succeeded is the bug.

The worst part is not only production correctness. It is developer experience. In production, an error-reporting agent may at least leave a breadcrumb. In development and test, that breadcrumb is often disabled, stubbed, ignored, or not configured. Then the exception is simply swallowed. The original stack trace is gone, and the test fails later with no obvious connection to the operation that actually broke.

That turns a normal exception into a debugging seance.

<O11yStackSelector />

In other words, this:

<StackPanel stack="newrelic">

```ruby
begin
  sync_customer!(customer)
rescue => error
  NewRelic::Agent.notice_error(error)
end

continue_the_workflow!
```

`notice_error()` is reporting, not handling. If it is disabled in test, this rescue block deletes the exception entirely.

</StackPanel>

<StackPanel stack="opentelemetry">

```ruby
begin
  sync_customer!(customer)
rescue => error
  span = OpenTelemetry::Trace.current_span
  span.record_exception(error)
  span.status = OpenTelemetry::Trace::Status.error(error.message)
end

continue_the_workflow!
```

`record_exception()` and span error status are reporting, not handling. If tracing is disabled in test, this rescue block deletes the exception entirely.

</StackPanel>

<StackPanel stack="datadog">

```ruby
begin
  sync_customer!(customer)
rescue => error
  Datadog::Tracing.active_span&.set_error(error)
end

continue_the_workflow!
```

`set_error()` is reporting, not handling. If tracing is disabled in test, this rescue block deletes the exception entirely.

</StackPanel>

A rescue block should not end after telemetry unless the code has actually recovered. After reporting, choose what happens next: `raise`, `retry`, return an explicit fallback, mark the job failed, enqueue a retry, render an error response, or translate the failure into a domain result.

This article is not anti-New Relic, anti-OpenTelemetry, or anti-Datadog. It is anti report-and-continue.

<StackPanel stack="newrelic">

## The New Relic shape

In the New Relic Ruby agent, the familiar handled-error call looks like this:

```ruby
begin
  charge_customer!(invoice)
rescue PaymentGateway::Timeout => error
  NewRelic::Agent.notice_error(
    error,
    custom_params: {
      invoice_id: invoice.id,
      gateway: 'stripe'
    },
    expected: false
  )

  raise
end
```

That call reports the error to New Relic. It does not make the application safe to continue. The `raise` is still the important line.

This is a good rescue block only if the explicit call adds something the automatic boundary capture would not: extra context, expected-error classification, filtering behavior, or a translation into a local failure type.

If the block only calls `notice_error` and then `raise`, delete the rescue and let the exception reach the controller, job, or framework boundary that New Relic already instruments. The important part is not performing the telemetry side effect by hand. The important part is preserving failure semantics.

The dangerous version keeps the reporting and deletes the failure. That is how a failed payment, failed sync, or failed authorization check becomes a logged-and-continued workflow.

## The ReportedException flow

Sometimes re-raising the original exception is exactly right. Most code should do that, or handle the failure explicitly.

A wrapper is not the point. It is useful at boundaries where an error has already been reported and higher layers need a consistent local signal that says: this failed, it was reported, do not report it again.

That boundary pattern can look like this:

```ruby
class ReportedException < StandardError
  attr_reader :original_error

  def initialize(original_error, message: nil)
    @original_error = original_error
    super(message || original_error.message)
    set_backtrace(original_error.backtrace)
  end
end
```

Then the reporting boundary becomes explicit:

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  NewRelic::Agent.notice_error(
    error,
    custom_params: {
      customer_id: customer.id,
      reported_exception: ReportedException.name
    }
  )

  raise ReportedException.new(error)
end
```

Production gets the original `ExternalCrm::Unavailable`. The application still stops the broken path. Tests get a clear local signal that the operation failed after reporting.

The New Relic-specific trick is that the wrapper class can be ignored or filtered in New Relic configuration while the original error is still explicitly sent through `notice_error`:

```yaml [newrelic.yml]
common: &default_settings
  error_collector:
    ignore_classes:
      - ReportedException
```

The exact configuration shape can vary by New Relic agent version and app setup, but the intent is stable: report the original error class; avoid double-counting the wrapper if automatic exception capture sees it later.

In tests, this is much better than a silent rescue:

```ruby
expect {
  SyncCustomer.call(customer)
}.to raise_error(ReportedException, /CRM unavailable/)
```

Now a dependency upgrade, API behavior change, or environment drift fails at the operation that broke instead of surfacing as a spooky assertion failure fifteen lines later.

Use this wrapper sparingly. It is an antidote for a specific boundary problem, not the default answer to every rescue block.

</StackPanel>

<StackPanel stack="opentelemetry">

## The OpenTelemetry shape

OpenTelemetry does not have a direct global `notice_error()` equivalent. The usual trace-level equivalent is to record the exception on the current span and mark the span status as error.

In Ruby, the shape is:

```ruby
require 'opentelemetry-api'

begin
  charge_customer!(invoice)
rescue PaymentGateway::Timeout => error
  span = OpenTelemetry::Trace.current_span

  span.record_exception(error)
  span.status = OpenTelemetry::Trace::Status.error(error.message)
  span.set_attribute('invoice.id', invoice.id)
  span.set_attribute('payment.gateway', 'stripe')

  raise
end
```

The important pieces are:

- `record_exception(error)` adds an exception event to the span.
- `status = OpenTelemetry::Trace::Status.error(...)` marks the span as failed.
- attributes add local context for debugging.
- `raise` preserves the actual failure semantics.

OpenTelemetry's exception semantic convention is span-oriented: an exception is recorded as an event named `exception`, with attributes such as `exception.type`, `exception.message`, and `exception.stacktrace`. If the exception makes the operation fail, the span should also be marked with error status.

A helper can make the reporting side boring:

```ruby
def report_exception_to_otel(error, **attributes)
  span = OpenTelemetry::Trace.current_span
  span.record_exception(error)
  span.status = OpenTelemetry::Trace::Status.error(error.message)

  attributes.each do |key, value|
    span.set_attribute(key.to_s, value) unless value.nil?
  end
end
```

Then the rescue block stays legible:

```ruby
begin
  charge_customer!(invoice)
rescue PaymentGateway::Timeout => error
  report_exception_to_otel(
    error,
    'invoice.id': invoice.id,
    'payment.gateway': 'stripe'
  )

  raise
end
```

The helper reports. The `raise` handles control flow.

</StackPanel>

<StackPanel stack="datadog">

## The Datadog shape

With Datadog's Ruby tracer, the closest equivalent is setting the error on the active span:

```ruby
begin
  charge_customer!(invoice)
rescue PaymentGateway::Timeout => error
  span = Datadog::Tracing.active_span

  span&.set_tag('invoice.id', invoice.id)
  span&.set_tag('payment.gateway', 'stripe')
  span&.set_error(error)

  raise
end
```

Datadog also handles this automatically when you wrap work in `Datadog::Tracing.trace` and allow the exception to escape the block:

```ruby
Datadog::Tracing.trace('payment.charge') do |span|
  span.set_tag('invoice.id', invoice.id)
  span.set_tag('payment.gateway', 'stripe')

  charge_customer!(invoice)
end
```

If `charge_customer!` raises, Datadog's default trace block behavior marks the span with the error type, message, and backtrace. That is often better than a manual rescue because the exception remains an exception.

If you need custom behavior, Datadog exposes `on_error`:

```ruby
handler = proc do |span, error|
  span.set_tag('invoice.id', invoice.id)
  span.set_error(error) unless error.is_a?(PaymentGateway::ExpectedDecline)
end

Datadog::Tracing.trace('payment.charge', on_error: handler) do
  charge_customer!(invoice)
end
```

The same rule applies: `set_error` reports the failure. The block raising, returning, retrying, or translating the failure is the control-flow decision.

</StackPanel>

## The actual rule

These are observability calls:

<StackPanel stack="newrelic">

```ruby
NewRelic::Agent.notice_error(error)
```

</StackPanel>

<StackPanel stack="opentelemetry">

```ruby
span.record_exception(error)
span.status = OpenTelemetry::Trace::Status.error(error.message)
```

</StackPanel>

<StackPanel stack="datadog">

```ruby
Datadog::Tracing.active_span&.set_error(error)
```

</StackPanel>

These are control-flow decisions:

```ruby
raise
retry
return fallback_value
mark_job_failed!
enqueue_retry(customer.id)
render status: :service_unavailable
```

Do not let the first category impersonate the second.

If the code reports and then silently continues, it is exception laundering. The system now contains a control-flow bug hiding behind a dashboard.

## Better shapes

If the operation must fail, report and re-raise the original error:

<StackPanel stack="newrelic">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  NewRelic::Agent.notice_error(error, custom_params: { customer_id: customer.id })
  raise
end
```

</StackPanel>

<StackPanel stack="opentelemetry">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  report_exception_to_otel(error, 'customer.id': customer.id)
  raise
end
```

</StackPanel>

<StackPanel stack="datadog">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  Datadog::Tracing.active_span&.set_error(error)
  raise
end
```

</StackPanel>

If you are at a reporting boundary where duplicate reporting is the problem, report the original error and raise a wrapper that higher layers understand:

<StackPanel stack="newrelic">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  NewRelic::Agent.notice_error(error, custom_params: { customer_id: customer.id })
  raise ReportedException.new(error)
end
```

</StackPanel>

<StackPanel stack="opentelemetry">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  report_exception_to_otel(error, 'customer.id': customer.id)
  raise ReportedException.new(error)
end
```

</StackPanel>

<StackPanel stack="datadog">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  Datadog::Tracing.active_span&.set_error(error)
  raise ReportedException.new(error)
end
```

</StackPanel>

If the operation has a real fallback, make the fallback explicit:

<StackPanel stack="newrelic">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  NewRelic::Agent.notice_error(error, custom_params: { customer_id: customer.id })
  enqueue_customer_sync_retry(customer.id)
  return :retry_scheduled
end
```

</StackPanel>

<StackPanel stack="opentelemetry">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  report_exception_to_otel(error, 'customer.id': customer.id)
  enqueue_customer_sync_retry(customer.id)
  return :retry_scheduled
end
```

</StackPanel>

<StackPanel stack="datadog">

```ruby
begin
  sync_customer!(customer)
rescue ExternalCrm::Unavailable => error
  Datadog::Tracing.active_span&.set_error(error)
  enqueue_customer_sync_retry(customer.id)
  return :retry_scheduled
end
```

</StackPanel>

If the exception is expected domain behavior, do not pretend it is an infrastructure failure:

<StackPanel stack="newrelic">

```ruby
begin
  charge_customer!(invoice)
rescue PaymentGateway::CardDeclined => error
  NewRelic::Agent.add_custom_attributes(payment_decline_code: error.code)
  return :card_declined
end
```

</StackPanel>

<StackPanel stack="opentelemetry">

```ruby
begin
  charge_customer!(invoice)
rescue PaymentGateway::CardDeclined => error
  OpenTelemetry::Trace.current_span.set_attribute('payment.decline_code', error.code)
  return :card_declined
end
```

</StackPanel>

<StackPanel stack="datadog">

```ruby
begin
  charge_customer!(invoice)
rescue PaymentGateway::CardDeclined => error
  Datadog::Tracing.active_span&.set_tag('payment.decline_code', error.code)
  return :card_declined
end
```

</StackPanel>

If the job should stop, say so:

<StackPanel stack="newrelic">

```ruby
begin
  rebuild_search_index!(account)
rescue SearchCluster::Unavailable => error
  NewRelic::Agent.notice_error(error, custom_params: { account_id: account.id })
  mark_job_failed!(error.message)
  raise
end
```

</StackPanel>

<StackPanel stack="opentelemetry">

```ruby
begin
  rebuild_search_index!(account)
rescue SearchCluster::Unavailable => error
  report_exception_to_otel(error, 'account.id': account.id)
  mark_job_failed!(error.message)
  raise
end
```

</StackPanel>

<StackPanel stack="datadog">

```ruby
begin
  rebuild_search_index!(account)
rescue SearchCluster::Unavailable => error
  Datadog::Tracing.active_span&.set_tag('account.id', account.id)
  Datadog::Tracing.active_span&.set_error(error)
  mark_job_failed!(error.message)
  raise
end
```

</StackPanel>

Each version reports if reporting is useful. None of them pretend reporting is recovery.

## Practical guidance

Use observability APIs inside rescue blocks only when the rescue block has a reason to exist: adding context, classifying expected behavior, suppressing duplicate reporting, translating the failure, retrying, scheduling repair work, or returning an explicit domain result.

If all the block does is report and re-raise, the better code is often no rescue block at all. Let the exception reach the controller, job, or framework boundary that your observability stack already instruments.

A good rescue block should answer three questions:

1. What failed?
2. Who was told?
3. What happens next?

If the answer to the third question is “nothing,” the code is probably swallowing a failure. The dashboard should tell you what happened. The test suite should still tell you where it happened.

## References

- [New Relic Ruby: sending handled errors](https://docs.newrelic.com/docs/apm/agents/ruby-agent/api-guides/sending-handled-errors-new-relic/)
- [New Relic Ruby agent configuration](https://docs.newrelic.com/docs/ruby/ruby-agent-configuration/)
- [OpenTelemetry exception semantic conventions](https://opentelemetry.io/docs/specs/otel/trace/exceptions/)
- [OpenTelemetry Ruby instrumentation](https://opentelemetry.io/docs/languages/ruby/instrumentation/)
- [Datadog server-side custom instrumentation: setting errors on a span](https://docs.datadoghq.com/tracing/trace_collection/custom_instrumentation/server-side/)
