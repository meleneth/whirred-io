#!/usr/bin/env bash
set -euo pipefail

revision=${1:?full commit hash required}
[[ $revision =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid revision' >&2; exit 2; }
cd "$HOME/dist/whirred-io/$revision"
candidate_dir="$PWD/host-candidate"

docker build --network host -t "whirred-io:$revision" .
docker build -f deploy/Musicshak.Dockerfile -t "musicshak-path:$revision" .
docker run --rm "whirred-io:$revision" nginx -t
docker run --rm "musicshak-path:$revision" nginx -t

python3 deploy/configure_host.py "$revision" "$candidate_dir"
docker compose -f "$candidate_dir/compose.yml" config --quiet
docker run --rm -v "$candidate_dir/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:latest \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

applied=0
rollback() {
  if (( applied )); then
    if [[ -f $candidate_dir/Caddyfile.before ]]; then
      cat "$candidate_dir/Caddyfile.before" > /www/docker-stuff/Caddyfile
    fi
    if [[ -f $candidate_dir/compose.yml.before ]]; then
      cat "$candidate_dir/compose.yml.before" > /www/docker-stuff/compose.yml
    fi
    cd /www/docker-stuff
    docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || true
  fi
}
trap rollback ERR

applied=1
python3 deploy/configure_host.py "$revision" "$candidate_dir" --apply
cd /www/docker-stuff
docker compose config --quiet
docker compose up -d --no-deps whirred musicshak-path
docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose ps whirred musicshak-path caddy
trap - ERR
