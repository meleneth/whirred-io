#!/usr/bin/env python3
"""Prepare or apply the whirred.io Caddy and Compose additions."""

import argparse
import re
from pathlib import Path

HOST = Path('/www/docker-stuff')
OLD_FALLBACK = '    handle {\n        reverse_proxy musicshak:80\n    }'
NEW_FALLBACK = '    handle {\n        reverse_proxy whirred:80\n    }'
MUSIC_ROUTE = '''    redir /musicshak /musicshak/ 308

    handle_path /musicshak/* {
        reverse_proxy musicshak-path:80
    }

'''


def caddy_candidate(current):
    if 'handle_path /musicshak/*' not in current:
        if current.count(OLD_FALLBACK) != 1:
            raise ValueError('Expected Musicshak root fallback exactly once')
        return current.replace(OLD_FALLBACK, MUSIC_ROUTE + NEW_FALLBACK)
    if current.count(NEW_FALLBACK) != 1 or current.count('handle_path /musicshak/*') != 1:
        raise ValueError('Existing Musicshak or root route differs from expected configuration')
    return current


def compose_candidate(current, revision):
    images = {'whirred': f'whirred-io:{revision}', 'musicshak-path': f'musicshak-path:{revision}'}
    for service, image in images.items():
        marker = f'  {service}:\n'
        if marker in current:
            pattern = rf'(?m)(^  {re.escape(service)}:\n    image: )[^\n]+'
            current, count = re.subn(pattern, lambda match: match.group(1) + image, current)
            if count != 1:
                raise ValueError(f'Unexpected {service} service shape')
        else:
            if current.count('\nvolumes:\n') != 1:
                raise ValueError('Expected one top-level volumes section')
            block = f'  {service}:\n    image: {image}\n    restart: unless-stopped\n    expose:\n      - "80"\n'
            current = current.replace('\nvolumes:\n', '\n' + block + '\nvolumes:\n')
    return current


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('revision')
    parser.add_argument('output', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.revision):
        parser.error('revision must be a full commit hash')

    args.output.mkdir(parents=True, exist_ok=True)
    for name, transform in (
        ('Caddyfile', caddy_candidate),
        ('compose.yml', lambda current: compose_candidate(current, args.revision)),
    ):
        source = HOST / name
        current = source.read_text()
        candidate = transform(current)
        staged = args.output / name
        if args.apply:
            if staged.read_text() != candidate:
                raise ValueError(f'{name} changed after preflight')
            if candidate != current:
                (args.output / f'{name}.before').write_text(current)
                source.write_text(candidate)
        else:
            staged.write_text(candidate)


if __name__ == '__main__':
    main()
