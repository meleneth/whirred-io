# frozen_string_literal: true

# Run on stdin inside user-management: see http-connect-probe.md.
require "net/http"
require "socket"
require "json"
require "time"
require "timeout"

def now
  Process.clock_gettime(Process::CLOCK_MONOTONIC)
end

URL = URI(ENV.fetch("PROBE_URL", "#{ENV.fetch('ACCOUNT_SERVICE_API_BASE_URL', 'http://account-service:80')}/up"))
abort "Only plain HTTP is supported" unless URL.scheme == "http"
SAMPLES = 100
TIMEOUT = 2
TRACING = ENV["PROBE_TRACING"] == "1"
if TRACING
  # Use the actual project initializer and installed instrumentation, no Rails boot.
  require File.join(Dir.pwd, "config/initializers/opentelemetry")
end

# Observe real Net::HTTP connect calls, including implicit reconnects. Record the
# socket tuple after successful opens; no debug logging in the timed interval.
module ConnectObserver
  def connect(...)
    event = { started: now }
    started = now
    begin
      result = super
      event[:ms] = (now - started) * 1000
      event[:ok] = true
      io = @socket.io
      event[:local_port] = io.local_address.ip_port
      event[:peer] = io.remote_address.ip_address
      result
    rescue StandardError => e
      event[:ms] = (now - started) * 1000
      event[:ok] = false
      event[:error] = "#{e.class}: #{e.message}"
      raise
    ensure
      ($connect_events ||= []) << event
    end
  end
  private :connect
end
Net::HTTP.prepend(ConnectObserver)

def client
  # Match ActiveResource::Connection#new_http: default environment proxy lookup.
  Net::HTTP.new(URL.hostname, URL.port).tap do |http|
    http.open_timeout = TIMEOUT
    http.read_timeout = TIMEOUT
    http.write_timeout = TIMEOUT
    http.max_retries = 0 # Expose errors instead of hiding retries in a sample.
  end
end

def request(http)
  bytes = 0
  response = http.request(Net::HTTP::Get.new(URL.request_uri)) do |res|
    res.read_body { |chunk| bytes += chunk.bytesize }
  end
  raise "HTTP #{response.code}" unless response.code == "200"
  { status: response.code, bytes: bytes, connection: response["connection"], http_version: response.http_version }
end

def measure
  $connect_events = []
  started = now
  row = begin
    details = Timeout.timeout(5) { yield }
    { ok: true, ms: (now - started) * 1000, **details }
  rescue StandardError => e
    { ok: false, ms: (now - started) * 1000, error: "#{e.class}: #{e.message}" }
  end
  row.merge(connects: $connect_events)
end

def summary(rows)
  values = rows.select { |r| r[:ok] }.map { |r| r[:ms] }.sort
  middle = values.length / 2
  {
    samples: rows.length, successes: values.length, failures: rows.count { |r| !r[:ok] },
    first: rows.first&.slice(:ok, :ms, :error),
    median_ms: values.empty? ? nil : (values[(values.length - 1) / 2] + values[middle]) / 2,
    p95_ms: values.empty? ? nil : values[(values.length * 0.95).ceil - 1],
    max_ms: values.last, over_10_ms: values.count { |v| v > 10 },
    connect_attempts: rows.sum { |r| r[:connects].length },
    socket_opens: rows.sum { |r| r[:connects].count { |c| c[:ok] } }
  }
end

proxy_client = client
metadata = {
  started_at: Time.now.utc.iso8601, ruby: RUBY_DESCRIPTION,
  net_http: Gem.loaded_specs["net-http"]&.version.to_s,
  container_hostname: Socket.gethostname, url: URL.to_s, tracing: TRACING,
  proxy_from_env: proxy_client.proxy_from_env?, proxy_active: proxy_client.proxy?,
  proxy_environment_keys: %w[http_proxy HTTP_PROXY https_proxy HTTPS_PROXY no_proxy NO_PROXY].select { |k| ENV.key?(k) },
  timeout_seconds: TIMEOUT, sample_deadline_seconds: 5, max_retries: 0,
  p95_method: "nearest rank; successful samples only"
}
abort "A proxy applies: direct socket cases would not match the HTTP route" if metadata[:proxy_active]
results = { metadata: metadata, cases: {} }
names = TRACING ? ["http_fresh"] : %w[tcp_hostname tcp_ip http_fresh http_persistent]
names.each do |name|
  # Resolve only after the hostname case, so it does not warm that case first.
  if name == "tcp_ip"
    metadata[:resolved_ip] = Timeout.timeout(TIMEOUT) { Addrinfo.getaddrinfo(URL.hostname, URL.port, nil, :STREAM).first.ip_address }
  end
  http = nil
  setup = nil
  if name == "http_persistent"
    http = client
    setup = measure { http.start; {} }
  end
  rows = Array.new(SAMPLES) do |i|
    run = proc do
      measure do
        case name
        when "tcp_hostname", "tcp_ip"
          host = name == "tcp_hostname" ? URL.hostname : metadata.fetch(:resolved_ip)
          socket = nil
          begin
            started = now
            socket = Socket.tcp(host, URL.port, connect_timeout: TIMEOUT, resolv_timeout: TIMEOUT)
            opened_ms = (now - started) * 1000
            { socket_open_ms: opened_ms, peer: socket.remote_address.ip_address }
          ensure
            socket&.close
          end
        when "http_fresh"
          fresh = client
          begin
            # As ActiveResource does, request on an unstarted Net::HTTP object.
            request(fresh)
          ensure
            fresh.finish if fresh.started?
          end
        when "http_persistent"
          raise "Initial session start failed" unless setup[:ok]
          request(http)
        end
      end
    end
    row = if TRACING
      OpenTelemetry.tracer_provider.tracer("http-connect-probe").in_span("probe.http_fresh") { run.call }
    else
      run.call
    end
    # Socket tables report open time only, excluding socket close/metadata work.
    row[:ms] = row[:socket_open_ms] if row[:ok] && row.key?(:socket_open_ms)
    row.merge(sample: i + 1)
  end
  http.finish if http&.started?
  results[:cases][name] = { summary: summary(rows), session_setup: setup, samples: rows }
end
OpenTelemetry.tracer_provider.shutdown if TRACING
puts JSON.pretty_generate(results)
