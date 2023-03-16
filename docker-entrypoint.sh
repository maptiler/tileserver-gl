#!/bin/sh
if ! which -- "${1}"; then
  # first arg is not an executable
  export DISPLAY=:99
  # Launch Xvfb if needed
  xdpyinfo --display "${DISPLAY}" >/dev/null 2>&1 || Xvfb "${DISPLAY}" -nolisten unix &
  exec node /usr/src/app/ "$@"
fi

exec "$@"
