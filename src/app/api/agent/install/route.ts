import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;

  const script = `#!/usr/bin/env bash
set -euo pipefail

if [ -z "\${TC_TOKEN:-}" ]; then
  echo "TC_TOKEN env var required" >&2
  exit 1
fi
SERVER="\${TC_SERVER:-${origin}}"
TC_DIR="\$HOME/.tokencalc"
AGENT_FILE="\$TC_DIR/agent.js"

mkdir -p "\$TC_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required (v20+). Install from https://nodejs.org" >&2
  exit 1
fi

NODE_VERSION=\$(node --version | sed 's/^v//' | cut -d. -f1)
if [ "\$NODE_VERSION" -lt 20 ]; then
  echo "Node.js v20 or newer required (got v\$NODE_VERSION)" >&2
  exit 1
fi

echo "Downloading agent…"
curl -fsSL "\$SERVER/agent.js" -o "\$AGENT_FILE"
chmod +x "\$AGENT_FILE"

echo "Installing codeburn (if missing)…"
if ! command -v codeburn >/dev/null 2>&1; then
  npm install -g codeburn >/dev/null
fi

echo "Configuring agent…"
node "\$AGENT_FILE" install --token="\$TC_TOKEN" --server="\$SERVER"

echo ""
echo "✔ TokenCalc agent installed."
echo "  Logs:    \$TC_DIR/agent.log"
echo "  Config:  \$TC_DIR/config.json"
echo "  Manual run: node \$AGENT_FILE run"
echo "  Uninstall:  node \$AGENT_FILE uninstall"
`;

  return new NextResponse(script, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
