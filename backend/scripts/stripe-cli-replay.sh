#!/usr/bin/env bash
# Optional local Stripe webhook replay — never run in CI.
#
# Prerequisites:
#   - stripe CLI: https://stripe.com/docs/stripe-cli (logged in)
#   - backend running: cd backend && cargo run
#   - Put the whsec_ that `stripe listen` prints into backend/.env as
#     STRIPE_ENDPOINT_SECRET, then restart cargo run
#
# Usage:
#   ./scripts/stripe-cli-replay.sh
#   ./scripts/stripe-cli-replay.sh checkout.session.completed
set -euo pipefail

FORWARD_TO="${STRIPE_FORWARD_TO:-localhost:8000/api/payment}"
EVENT="${1:-checkout.session.completed}"

if ! command -v stripe >/dev/null 2>&1; then
  echo "stripe CLI not found. Install: https://stripe.com/docs/stripe-cli" >&2
  exit 1
fi

cat <<EOF
Terminal A — forward webhooks (leave running):
  stripe listen --forward-to ${FORWARD_TO}

Terminal B — backend:
  cd backend && cargo run

Then trigger (this script):
  stripe trigger ${EVENT}

CI never runs this. Unit/route coverage uses StripeMock (cargo test).
EOF

stripe trigger "${EVENT}"
