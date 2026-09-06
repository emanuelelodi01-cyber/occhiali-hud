#!/bin/sh
set -e

echo "[Container] Starting Node.js WebSocket Relay on port 3001..."
node /app/server/relay.js &

echo "[Container] Starting Nginx on port 80..."
exec nginx -g "daemon off;"
