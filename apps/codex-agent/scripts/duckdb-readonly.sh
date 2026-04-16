#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 <context.duckdb> <sql>" >&2
  exit 64
fi

db_path="$1"
sql="$2"

if [ ! -f "$db_path" ]; then
  echo "DuckDB file not found: $db_path" >&2
  exit 66
fi

if ! command -v duckdb >/dev/null 2>&1; then
  echo "duckdb CLI not found" >&2
  exit 69
fi

case "$(printf '%s' "$sql" | tr '[:upper:]' '[:lower:]')" in
  *insert*|*update*|*delete*|*drop*|*alter*|*create*|*attach*|*install*|*load*)
    echo "refusing non-read-only SQL" >&2
    exit 65
    ;;
esac

duckdb -readonly -json "$db_path" "$sql"
