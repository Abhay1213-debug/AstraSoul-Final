#!/bin/bash
# Moves a PUBLISHABLE Supabase key from the clipboard into .env.local WITHOUT ever printing it.
# Usage (from the project folder):  bash tools/check-live-setup/save-key-from-clipboard.sh [env-file]
# - Accepts only a value that looks like a publishable key (sb_publishable_...). A secret key, a password or anything else is
#   refused and nothing is changed.
# - The key is never put on a command line (so not in shell history or process lists) and is never printed.
# - The clipboard is emptied afterwards.
set -euo pipefail
file="${1:-.env.local}"
key="$(pbpaste | tr -d '[:space:]')"
if [[ ! "$key" =~ ^sb_publishable_[A-Za-z0-9_-]{20,}$ ]]; then
  echo "NOT SAVED: the clipboard does not hold a publishable key (it must start with sb_publishable_). Nothing was changed."
  exit 1
fi
if [ ! -f "$file" ]; then
  echo "NOT SAVED: $file was not found. Nothing was changed."
  exit 1
fi
KEY="$key" python3 - "$file" <<'PY'
import os, re, sys
path, key = sys.argv[1], os.environ['KEY']
text = open(path).read()
line = 'VITE_SUPABASE_PUBLISHABLE_KEY=' + key
if re.search(r'^VITE_SUPABASE_PUBLISHABLE_KEY=.*$', text, re.M):
    text = re.sub(r'^VITE_SUPABASE_PUBLISHABLE_KEY=.*$', lambda m: line, text, flags=re.M)
else:
    text = text.rstrip('\n') + '\n' + line + '\n'
open(path, 'w').write(text)
PY
printf '' | pbcopy
echo "Saved a publishable key to $file (the clipboard has been emptied). The key was not printed."
