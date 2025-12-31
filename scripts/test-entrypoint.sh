#!/bin/sh
set -euo pipefail

# Test entrypoint for running tests inside the production image.
# Behavior:
# - If /data is empty, attempt to download from $TEST_DATA_URL and unzip into /data
# - Start the tileserver in background (passing any discovered data file)
# - Wait for the server to become available on http://localhost:8080/
# - Run `npm test` (using xvfb-run if available)

if [ ! -d /data ] || [ -z "$(ls -A /data 2>/dev/null)" ]; then
  echo "/data not provided or empty. This minimal production image does not include download tools (wget/unzip)." >&2
  echo "Mount test data into /data when running the container, for example:" >&2
  echo "  docker run -v \"$(pwd)/test_data:/data:ro\" ..." >&2
  exit 2
fi

XVFB_PID=0

# We don't need to start tileserver here; tests start their own server.
# Ensure test data exists and run tests under Xvfb if available.
if [ ! -d /data ] || [ -z "$(ls -A /data 2>/dev/null)" ]; then
  echo "/data not provided or empty. Mount test data into /data when running the container." >&2
  exit 2
fi

# Run tests (use xvfb-run if available). If not, try starting Xvfb.
if command -v xvfb-run >/dev/null 2>&1; then
  xvfb-run --server-args="-screen 0 1024x768x24" npm --prefix /usr/src/app test
  EXIT_CODE=$?
else
  if command -v Xvfb >/dev/null 2>&1; then
    echo "xvfb-run not present; starting Xvfb :99"
    Xvfb :99 -nolisten tcp &
    XVFB_PID=$!
    export DISPLAY=:99
    npm --prefix /usr/src/app test
    EXIT_CODE=$?
    kill "$XVFB_PID" 2>/dev/null || true
    wait "$XVFB_PID" 2>/dev/null || true
  else
    npm --prefix /usr/src/app test
    EXIT_CODE=$?
  fi
fi

exit $EXIT_CODE
