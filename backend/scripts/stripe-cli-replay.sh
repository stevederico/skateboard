#!/usr/bin/env bash
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
