if [ -z "${FACTORY_VERIFY:-}" ]; then
  runner="${FACTORY_HOME:-$(dirname "$(git config --global core.hooksPath 2> /dev/null || echo .)")}/verify/verify.sh"
  [ -f "$runner" ] || {
    printf 'verify: the my-factory runner is not installed (looked for %s). Install my-factory, or set FACTORY_HOME to its folder.\n' "$runner" >&2
    exit 1
  }
  exec bash "$runner" "$0"
fi

c="src/constants.json"
const() { jq -r "$1" "$c"; }

VERIFY_BUILD="node_modules/.bin/vite build --mode production"
VERIFY_START=start_backend
VERIFY_HEALTH="/api/health"
VERIFY_ALLOW='^(404 .*/api/signup/options|401 .*/api/(me|signin))$'
VERIFY_RANDOM_SKIP='subscribe|upgrade|checkout|billing'

start_backend() {
  local state="$artifacts/backend-state"
  mkdir -p "$state"
  jq -n --arg d "$repo/dist" '{staticDir: $d, database: {db: "Verify", dbType: "sqlite", connectionString: "./databases/verify.db"}}' > "$state/config.json"
  SKATEBOARD_BACKEND_DIR="$state" JWT_SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" NODE_ENV=development \
    exec cargo run --manifest-path backend/Cargo.toml --locked
}

verify_pages() {
  printf '/\theading .*level=1\n'
  for url in $(const '.pages[]?.url // empty') settings; do
    printf '/app/%s\t- main\n' "$url"
  done
  printf '/terms\tterms\n'
  printf '/this-route-does-not-exist\t404\n'
}

[ -f guardrails/verify/flows.sh ] && . guardrails/verify/flows.sh
