#!/usr/bin/env python3
"""Parse project SQL files with PostgreSQL grammar; this is not a live DB test."""
from pathlib import Path
import sys

from pglast import parse_sql

roots = (Path("supabase/patches"), Path("supabase/snapshots"), Path("supabase/tests"))
files = sorted(path for root in roots if root.exists() for path in root.rglob("*.sql"))
if not files:
    print("No SQL files found to validate.", file=sys.stderr)
    sys.exit(1)

errors = []
for path in files:
    try:
        parse_sql(path.read_text(encoding="utf-8"))
    except Exception as exc:  # parser exceptions include line/character details
        errors.append((path, exc))

for path, error in errors:
    print(f"FAIL: {path}: {error}", file=sys.stderr)

if errors:
    print(f"{len(errors)} SQL file(s) failed PostgreSQL grammar parsing.", file=sys.stderr)
    sys.exit(1)

print(f"PostgreSQL grammar parse passed for {len(files)} SQL file(s).")
