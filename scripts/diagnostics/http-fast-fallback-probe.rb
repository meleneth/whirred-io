# frozen_string_literal: true

# Isolated process only: alternate the global Ruby socket option, one request at a time.
require "net/http"
require "json"
require "timeout"
require "time"

def clock
  Process.clock_gettime(Process::CLOCK_MONOTONIC)
end

module ObserveConnect
  def connect(...)
    started = clock
    result = super
    $connect_ms << (clock - started) * 1000
    result
  end
  private :connect
end
Net::HTTP.prepend(ObserveConnect)
url = URI("#{ENV.fetch('ACCOUNT_SERVICE_API_BASE_URL', 'http://account-service:80')}/up")
abort "Expected plain HTTP" unless url.scheme == "http"
abort "Unexpected proxy" if Net::HTTP.new(url.hostname, url.port).proxy?
original = Socket.tcp_fast_fallback
results = { metadata: { started_at: Time.now.utc.iso8601, ruby: RUBY_DESCRIPTION,
                       net_http: Gem.loaded_specs["net-http"].version.to_s,
                       container: Socket.gethostname, url: url.to_s, original_fast_fallback: original,
                       order: "100 rounds; alternate which option runs first", tracing: false,
                       localdomain_override: ENV["LOCALDOMAIN"] }, cases: {} }
rows = { "enabled" => [], "disabled" => [] }
begin
  100.times do |round|
    [true, false].rotate(round % 2).each do |enabled|
      Socket.tcp_fast_fallback = enabled
      $connect_ms = []
      http = nil
      started = clock
      row = begin
        Timeout.timeout(5) do
          http = Net::HTTP.new(url.hostname, url.port)
          http.open_timeout = http.read_timeout = http.write_timeout = 2
          http.max_retries = 0
          bytes = 0
          response = http.request(Net::HTTP::Get.new(url.request_uri)) do |r|
            r.read_body { |chunk| bytes += chunk.bytesize }
          end
          raise "HTTP #{response.code}" unless response.code == "200"
          { ok: true, ms: (clock - started) * 1000, status: response.code, bytes: bytes }
        end
      rescue StandardError => e
        { ok: false, ms: (clock - started) * 1000, error: "#{e.class}: #{e.message}" }
      ensure
        http.finish if http&.started?
      end
      rows[enabled ? "enabled" : "disabled"] << row.merge(round: round + 1, connect_ms: $connect_ms)
    end
  end
ensure
  Socket.tcp_fast_fallback = original
end
def summary(values)
  sorted = values.sort
  { first_ms: values.first, count: values.size,
    median_ms: sorted.empty? ? nil : (sorted[(sorted.size - 1) / 2] + sorted[sorted.size / 2]) / 2,
    p95_ms: sorted.empty? ? nil : sorted[(sorted.size * 0.95).ceil - 1],
    max_ms: sorted.last, over_10_ms: sorted.count { |v| v > 10 } }
end
rows.each do |name, samples|
  successes = samples.select { |r| r[:ok] }
  results[:cases][name] = { first_sample: samples.first, failures: samples.count { |r| !r[:ok] },
                           request: summary(successes.map { |r| r[:ms] }),
                           connect: summary(successes.flat_map { |r| r[:connect_ms] }), samples: samples }
end
puts JSON.pretty_generate(results)
