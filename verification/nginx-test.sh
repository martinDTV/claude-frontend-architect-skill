#!/usr/bin/env bash
# Extracts the reverse-proxy example from microfrontends.md and validates it with nginx -t.
set -euo pipefail
tmp=$(mktemp -d)
mkdir -p "$tmp/conf.d"
python3 - "$tmp" <<'PY'
import re, sys, pathlib
ref = pathlib.Path(__file__).resolve() if False else None
s = open('../plugins/frontend-architect/skills/frontend-architect/references/microfrontends.md').read()
m = re.search(r"```nginx\n# @verify nginx:\S+\n(.*?)```", s, re.S)
open(f"{sys.argv[1]}/conf.d/frontends.conf", 'w').write(m.group(1))
open(f"{sys.argv[1]}/nginx.conf", 'w').write(f"pid {sys.argv[1]}/nginx.pid;\nerror_log {sys.argv[1]}/error.log;\nevents {{}}\nhttp {{ access_log off; include {sys.argv[1]}/conf.d/*.conf; }}\n")
PY
nginx -t -c "$tmp/nginx.conf"
