# Local HTTP connection diagnostic

Current finding: the connection spikes follow the IPv6 negative-resolution/search-domain
path used by Ruby fast fallback. Clearing the search list only in the diagnostic
process removes the spikes while retaining fast fallback and the original service
hostname. See the chronological experiments below; deployed settings are unchanged.

Run from the whirred-io repository root. This is the exact command used:

```sh
docker exec -i gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/http-connect-probe.rb > scripts/diagnostics/http-connect-baseline.json
```

The script is streamed on stdin; nothing is installed or changed in the container.
It uses Ruby standard-library APIs, with Bundler selecting the application's installed
net-http version. No Rails boot or caller tracing is loaded in the baseline. The
existing destination server remains running with its normal instrumentation.

The optional `PROBE_TRACING=1` mode loads the project's actual OpenTelemetry initializer,
including its Net::HTTP and HTTP-phase instrumentation, without Rails boot, and runs
only 100 fresh HTTP requests inside recording spans. It uses the existing OTLP exporter.
It was **not run** because the baseline reproduced the connection spikes. If needed:

```sh
docker exec -i -e PROBE_TRACING=1 gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/http-connect-probe.rb > scripts/diagnostics/http-connect-traced.json
```

## Environment and method

- Collected September 11, 2026, starting 23:30:16 UTC.
- Caller: `gp-user-management-service-1`, container `da56493931c7`, working directory `/rails`.
- Destination: `gp-account-service-1`; application base URL `http://account-service:80`.
- Resolved destination for this run: `172.21.0.35`. Do not assume an older trace's IP is still current.
- Ruby 4.0.6, net-http 0.6.0, ActiveResource 6.1.4, Faraday 2.13.4, faraday-net_http 3.4.1.
- `GET /up` maps to `rails/health#show` in account-service's `config/routes.rb`; no actor or authorization bypass headers are used.
- Four sequential cases, 100 samples each, no warm-up or concurrency. Numeric IP resolution occurs once, after the hostname case and outside its own timed loop.
- Monotonic clock; 2-second connect/resolution/read/write limits where applicable, plus a 5-second outer sample deadline. Automatic Net::HTTP retries are disabled to expose failures; the application's default Net::HTTP retry setting is otherwise untouched in production.
- Socket cases use `Socket.tcp` and time only socket opening, excluding close. HTTP cases time client construction (fresh only), connection setup where needed, request, full response-body consumption, and session teardown (fresh only). Persistent initial session setup is reported separately.
- Net::HTTP's `connect` method is separately observed in both HTTP cases. Successful opens record peer and local port. Observer bookkeeping is a small common measurement overhead, not OpenTelemetry instrumentation.
- Successful values only contribute to median, nearest-rank p95, maximum and counts above 10 ms. The first sample is retained even if it fails. Raw JSON keeps every timing and separate failure records.
- Proxy handling matches ActiveResource's `Net::HTTP.new(host, port)`: environment lookup enabled. No proxy environment keys were present and no proxy applied. Raw sockets are direct. The probe aborts if an HTTP proxy applies, rather than silently comparing different routes.

## Results

All times are milliseconds. All four cases succeeded 100/100, with zero failures.

| Case / measured interval | First | Median | p95 | Maximum | >10 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hostname TCP socket open | 8.066 | 3.610 | 15.818 | 30.185 | 12 |
| Numeric-IP TCP socket open | 0.162 | 0.050 | 0.062 | 0.162 | 0 |
| Fresh Net::HTTP whole request | 31.260 | 4.412 | 15.939 | 32.061 | 8 |
| Persistent Net::HTTP whole request, excluding initial setup | 1.221 | 0.724 | 2.314 | 11.426 | 2 |
| Connect method within fresh HTTP requests (same 100 samples) | 3.522 | 2.367 | 7.745 | 27.724 | 5 |

Persistent session setup took 4.203 ms, including a 4.166 ms connect. It opened one
socket (local port 49002, peer 172.21.0.35) before the loop and performed **zero
connect calls during the 100 requests**. Fresh HTTP performed 100 successful opens.
The raw JSON summary's `connect_attempts` and `socket_opens` fields refer specifically
to the Net::HTTP observer; raw TCP opens are represented by each successful socket
sample, and persistent initial setup is in `session_setup` rather than loop totals.

Fresh HTTP sample 29 took 32.061 ms, of which 27.724 ms was inside `connect`.
But sample 1 took 31.260 ms with only 3.522 ms inside `connect`, and sample 86 took
12.216 ms with only 1.668 ms inside `connect`. Whole-request outliers cannot all be
attributed to connection setup. Persistent samples 19 and 71 took 11.305 and 11.426 ms
without opening another connection.

## Findings and lifecycle

The 20–34 ms range is reproducible without caller Rails boot or caller OpenTelemetry:
raw hostname opens reached 30.185 ms and fresh Net::HTTP connect reached 27.724 ms.
Numeric-IP opens were much faster in the subsequent case. This does not require
caller tracing as an explanation; it does not measure tracing's contribution to
the original workload.

The installed ActiveResource `lib/active_resource/connection.rb` implements
`request -> http -> configure_http(new_http)`: each request creates a new Net::HTTP
object. Account inherits ActiveResource::Base and uses `connection.get/post`.
Although the ActiveResource connection wrapper may persist, its HTTP socket does not.
Installed net-http 0.6.0 `lib/net/http.rb:2373` starts an unstarted session in a block,
sets `Connection: close` when absent, and closes the session after the request.
The fresh probe deliberately follows this path; all 100 responses said `Connection: close`.

Other user-management models call Faraday convenience methods. The installed default
net_http adapter builds Net::HTTP and executes `http.start { ...request... }` for each
request, closing the session at block exit. Its no-proxy branch explicitly passes
`nil` to Net::HTTP after Faraday resolves proxy configuration; ActiveResource instead
allows Net::HTTP environment lookup. The actual Account route uses ActiveResource.

The reuse conclusion therefore comes from the client lifecycle and observed opens,
not from counting `reused=false` on connect spans. Requests reusing an existing socket
need not call `connect` at all, as the persistent probe demonstrates.

## Hypotheses and smallest next experiment

Hostname resolution and/or scheduling in that path is the leading hypothesis.
The caller resolver is Docker's `127.0.0.11`, with `search lan` and `ndots:0`.
These measurements do not establish whether delay occurs in Docker DNS, Ruby/native
resolver work, address selection, or thread scheduling. The cases were sequential,
so changing host load remains a confounder. `Socket.tcp` also is not exactly the
`TCPSocket.open` path used by this installed Net::HTTP.

The smallest next experiment is a bounded, alternating set of standalone
`Addrinfo.getaddrinfo` timings and already-resolved numeric `TCPSocket.open` timings
inside this same caller. Include hostname `TCPSocket.open` as the matched Net::HTTP
primitive. That would separate resolver work from socket opening while reducing
the time-order confounder. Do not change DNS configuration or enable packet capture
based on the current evidence alone.

No heavyweight benchmarks, packet captures, or production behavior changes were made.

## Follow-up: resolver and Ruby fast fallback

The operator reports eight physical cores, X Windows running, and very light load.
Do not treat generic machine saturation as an established explanation. During the
follow-up the caller had `cpu.max = max 100000`, zero throttled periods/time, and
host CPU pressure `some avg10=0.26`, `full avg10=0.00`. Those observations do not
exclude a localized runtime synchronization delay, but give no evidence of a CPU quota problem.

The first follow-up ran 100 rounds rotating through six cases: native unspecified-family
and IPv4-only getaddrinfo, hostname and numeric `TCPSocket.open`, and direct A/AAAA
queries to Docker's resolver. The raw results are in `resolver-baseline.json`.
Native unspecified-family lookup peaked at 0.844 ms; hostname TCPSocket peaked at
15.500 ms. The DNS A case had one 11.775 ms outlier; AAAA peaked at 1.001 ms and
returned no addresses. Slow TCPSocket opens therefore were not mirrored by generally
slow standalone resolver calls.

Ruby's `Socket.tcp_fast_fallback` was true, with no environment override. A second
run added `TCPSocket.open(host, 80, fast_fallback: false)` to the rotating cases,
changing only this probe socket's option. Each case ran 100 times, all successfully:

| Interval | First ms | Median ms | p95 ms | Max ms | >10 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native getaddrinfo, unspecified family | 0.450 | 0.188 | 0.361 | 0.867 | 0 |
| Native getaddrinfo, IPv4 only | 0.354 | 0.162 | 0.280 | 0.367 | 0 |
| Hostname TCPSocket, default fast fallback | 9.692 | 2.246 | 7.236 | 28.364 | 2 |
| Hostname TCPSocket, fast fallback false | 0.738 | 0.295 | 0.534 | 0.755 | 0 |
| Numeric TCPSocket | 0.051 | 0.057 | 0.130 | 0.179 | 0 |
| Docker DNS A query | 0.527 | 0.329 | 0.722 | 4.070 | 0 |
| Docker DNS AAAA query | 0.201 | 0.199 | 0.547 | 2.659 | 0 |

Exact second-run command (the first used the same script before the seventh case
was added, writing `resolver-baseline.json`):

```sh
docker exec -i gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/resolver-probe.rb > scripts/diagnostics/resolver-fast-fallback-comparison.json
```

Raw samples and before/after CPU observations are retained in both JSON files.
This implicates Ruby's hostname fast-fallback path much more specifically than
Docker DNS in general. It does not yet identify the exact wait inside that path.
Ruby documents this as its Happy Eyeballs connection algorithm and exposes the
[fast-fallback switch](https://docs.ruby-lang.org/en/4.0/Socket.html).

### Net::HTTP confirmation

Next, 100 rounds alternated fresh Net::HTTP requests with fast fallback enabled and
disabled, reversing the first option each round. The switch was changed only within
the disposable Ruby probe process, then restored. No caller Rails/tracing was loaded.
All 200 requests succeeded and each recorded one successful connect.

| Interval | First ms | Median ms | p95 ms | Max ms | >10 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Net::HTTP connect, fallback enabled | 4.672 | 2.259 | 9.588 | 30.009 | 5 |
| Net::HTTP connect, fallback disabled | 0.478 | 0.349 | 0.527 | 0.716 | 0 |
| Whole request, fallback enabled | 6.813 | 3.927 | 11.179 | 31.385 | 7 |
| Whole request, fallback disabled | 2.473 | 1.563 | 3.039 | 14.337 | 1 |

```sh
docker exec -i gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/http-fast-fallback-probe.rb > scripts/diagnostics/http-fast-fallback-comparison.json
```

This confirms that the setting controls the observed Net::HTTP connection spikes in
the isolated caller test. The disabled case's one 14.337 ms whole-request outlier
occurred despite all connects being below 0.717 ms; it is a separate delay.
Do not label this a TCP handshake problem or recommend changing the deployed setting
without considering that the algorithm also handles dual-stack reachability.

### IPv6-only lookup isolates a slower resolver path

The next rotating run added native IPv6-only getaddrinfo. All 100 calls returned
the expected negative answer, `No address associated with hostname`; they are
recorded as completed negative lookups, not successful IPv6 resolutions. Median
was 2.998 ms, p95 11.681 ms, maximum 23.214 ms, and six calls exceeded 10 ms.
In the same run unspecified-family getaddrinfo had a 0.212 ms median; direct
absolute-name Docker AAAA queries had a 0.243 ms median. This suggests the native
IPv6 negative-lookup path, rather than IPv4 resolution itself, is responsible.

```sh
docker exec -i gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/resolver-probe.rb > scripts/diagnostics/resolver-ipv6-comparison.json
```

The script at that point had eight cases. Subsequent revisions add explicit
absolute-name and `account-service.lan.` controls to test search-domain behavior.

### Search-domain isolation and confirmation

The container has `search lan` and `options ndots:0`. Adding a trailing dot makes
the name absolute. In another rotating 100-sample-per-case run:

| Interval | First ms | Median ms | p95 ms | Max ms | >10 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| IPv6 lookup, `account-service` | 2.541 | 2.002 | 4.624 | 21.468 | 1 |
| IPv6 lookup, `account-service.` | 0.209 | 0.208 | 0.586 | 1.865 | 0 |
| TCPSocket, `account-service`, fallback enabled | 2.267 | 2.117 | 3.753 | 7.848 | 0 |
| TCPSocket, `account-service.`, fallback enabled | 0.310 | 0.345 | 0.817 | 2.133 | 0 |
| Direct Docker AAAA, `account-service.` | 0.147 | 0.222 | 0.489 | 1.142 | 0 |
| Direct Docker AAAA, `account-service.lan.` | 1.813 | 2.090 | 5.343 | 22.575 | 2 |

All 1,100 operations completed; IPv6 and suffixed queries returned negative/empty
answers, explicitly retained in the raw samples. In this particular run none of
the default TCPSocket opens exceeded 10 ms; the median difference remained.

Then the same 11-case script ran with an empty `LOCALDOMAIN` only in its own
process. This overrides the resolver search list without changing `/etc/resolv.conf`
or the running application. Fast fallback remained enabled:

| Interval, empty LOCALDOMAIN | First ms | Median ms | p95 ms | Max ms | >10 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| IPv6 lookup, `account-service` | 0.448 | 0.264 | 0.448 | 0.560 | 0 |
| TCPSocket, `account-service` | 0.378 | 0.345 | 0.585 | 0.764 | 0 |
| Explicit Docker AAAA, `account-service.lan.` | 1.763 | 2.713 | 10.474 | 28.029 | 6 |

The explicit suffixed lookup still exhibits spikes in the same rotating process
where ordinary hostname opens are now fast. That is a stronger control against
changing machine load than comparing two independent runs alone.

Finally, repeat the fresh Net::HTTP alternating-setting probe with empty
`LOCALDOMAIN`. All 200 HTTP requests succeeded:

| Interval, empty LOCALDOMAIN | First ms | Median ms | p95 ms | Max ms | >10 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Net::HTTP connect, fallback enabled | 0.796 | 0.458 | 0.835 | 1.131 | 0 |
| Net::HTTP connect, fallback disabled | 0.422 | 0.329 | 0.870 | 1.120 | 0 |
| Whole request, fallback enabled | 2.477 | 1.832 | 4.013 | 6.421 | 0 |
| Whole request, fallback disabled | 1.706 | 1.707 | 3.913 | 10.986 | 1 |

Exact commands:

```sh
docker exec -i gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/resolver-probe.rb > scripts/diagnostics/resolver-search-suffix-comparison.json
docker exec -i -e LOCALDOMAIN= gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/resolver-probe.rb > scripts/diagnostics/resolver-no-search-comparison.json
docker exec -i -e LOCALDOMAIN= gp-user-management-service-1 bundle exec ruby - < scripts/diagnostics/http-fast-fallback-probe.rb > scripts/diagnostics/http-no-search-comparison.json
```

**Established:** using the absolute name, disabling fast fallback, or clearing
the process search list removes the recurring multi-millisecond hostname penalty
in these probes. The search-list intervention works for Net::HTTP without disabling
Happy Eyeballs. CPU quota throttling was absent. Socket reuse is a separate issue
that multiplies how often the application encounters this setup cost.

**Mechanism supported by these controls:** fast fallback performs address-family
resolution separately. The IPv4 service resolves locally, while its IPv6-negative
lookup explores the `lan` search domain before completing. That negative-search
path adds latency to connection setup. `ndots:0` controls the initial lookup order;
it does not turn off search-domain processing after a negative answer. The
[resolver documentation](https://man7.org/linux/man-pages/man5/resolv.conf.5.html)
documents the per-process `LOCALDOMAIN` override; Ruby documents the
[dual-stack connection behavior](https://docs.ruby-lang.org/en/4.0/Socket.html).

The exact internal upstream hop responsible for the slow `account-service.lan.`
negative answer has not been traced. Docker's resolver file lists external server
`172.17.0.1`; no packet capture was taken, so do not claim a demonstrated off-host
network trip. These controls establish the relevant configuration/lookup path,
not every internal resolver event or the cause of unrelated HTTP response outliers.

The smallest next diagnostic, if upstream attribution is needed, is to compare
explicit `account-service.lan.` negative queries through Docker's resolver and its
configured upstream, with matching A/AAAA types and bounded samples. A potential
configuration correction should preserve service discovery and needed search
domains; none has been applied as part of this investigation.
