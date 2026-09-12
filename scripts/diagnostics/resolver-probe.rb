# frozen_string_literal: true

require "socket"
require "resolv"
require "timeout"
require "json"
require "time"

def clock
  Process.clock_gettime(Process::CLOCK_MONOTONIC)
end

def snapshot
  %w[/sys/fs/cgroup/cpu.max /sys/fs/cgroup/cpu.stat /proc/pressure/cpu /proc/loadavg].to_h do |path|
    [path, File.read(path)]
  end
end

host = "account-service"
ip = Timeout.timeout(2) { Addrinfo.getaddrinfo(host, 80, :INET, :STREAM).first.ip_address }
metadata = { started_at: Time.now.utc.iso8601, ruby: RUBY_DESCRIPTION, hostname: Socket.gethostname,
             target: host, ip: ip, before: snapshot, resolver: File.read("/etc/resolv.conf"),
             order: "100 rounds; rotate case order by round; no warmup", timeout_seconds: 2,
             tcp_fast_fallback: Socket.tcp_fast_fallback, localdomain_override: ENV["LOCALDOMAIN"] }
cases = {
  "getaddrinfo_unspec" => -> { Addrinfo.getaddrinfo(host, 80, nil, :STREAM).map(&:ip_address) },
  "getaddrinfo_ipv4" => -> { Addrinfo.getaddrinfo(host, 80, :INET, :STREAM).map(&:ip_address) },
  "getaddrinfo_ipv6" => -> {
    begin
      Addrinfo.getaddrinfo(host, 80, :INET6, :STREAM).map(&:ip_address)
    rescue SocketError => e
      # No IPv6 answer is expected for this IPv4-only service; retain the result.
      { negative_answer: e.message }
    end
  },
  "getaddrinfo_ipv6_absolute" => -> {
    begin
      Addrinfo.getaddrinfo("#{host}.", 80, :INET6, :STREAM).map(&:ip_address)
    rescue SocketError => e
      { negative_answer: e.message }
    end
  },
  "tcpsocket_hostname" => -> { TCPSocket.open(host, 80) },
  "tcpsocket_hostname_absolute" => -> { TCPSocket.open("#{host}.", 80) },
  "tcpsocket_hostname_no_fast_fallback" => -> { TCPSocket.open(host, 80, fast_fallback: false) },
  "tcpsocket_ip" => -> { TCPSocket.open(ip, 80) },
  "docker_dns_a" => -> {
    Resolv::DNS.open(nameserver: ["127.0.0.11"], search: [], ndots: 0) do |dns|
      dns.timeouts = [1]
      dns.getresources("#{host}.", Resolv::DNS::Resource::IN::A).map { |r| r.address.to_s }
    end
  },
  "docker_dns_aaaa" => -> {
    Resolv::DNS.open(nameserver: ["127.0.0.11"], search: [], ndots: 0) do |dns|
      dns.timeouts = [1]
      dns.getresources("#{host}.", Resolv::DNS::Resource::IN::AAAA).map { |r| r.address.to_s }
    end
  },
  "docker_dns_aaaa_search_suffix" => -> {
    Resolv::DNS.open(nameserver: ["127.0.0.11"], search: [], ndots: 0) do |dns|
      dns.timeouts = [1]
      dns.getresources("#{host}.lan.", Resolv::DNS::Resource::IN::AAAA).map { |r| r.address.to_s }
    end
  }
}
rows = cases.keys.to_h { |name| [name, []] }
100.times do |round|
  cases.keys.rotate(round % cases.size).each do |name|
    value = nil
    started = clock
    row = begin
      Timeout.timeout(2) do
        started = clock
        value = cases.fetch(name).call
        elapsed = (clock - started) * 1000
        { ok: true, ms: elapsed, result: value.is_a?(Socket) || value.is_a?(TCPSocket) ? value.remote_address.ip_address : value }
      end
    rescue StandardError => e
      { ok: false, ms: (clock - started) * 1000, error: "#{e.class}: #{e.message}" }
    ensure
      value.close if value.is_a?(TCPSocket)
    end
    rows[name] << row.merge(round: round + 1, started: started)
  end
end
metadata[:after] = snapshot
results = rows.transform_values do |samples|
  values = samples.select { |r| r[:ok] }.map { |r| r[:ms] }.sort
  { summary: { first: samples.first, successes: values.size, failures: samples.count { |r| !r[:ok] },
               median_ms: values.empty? ? nil : (values[(values.size - 1) / 2] + values[values.size / 2]) / 2,
               p95_ms: values.empty? ? nil : values[(values.size * 0.95).ceil - 1],
               max_ms: values.last, over_10_ms: values.count { |v| v > 10 } }, samples: samples }
end
puts JSON.pretty_generate(metadata: metadata, cases: results)
