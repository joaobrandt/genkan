#!/bin/sh
# genkan's boot hook. The Homebrew Channel runs everything in /var/lib/webosbrew/init.d/ once at
# cold boot (with run-parts, so the symlink there has no extension). It starts the launcher
# service, which makes genkan the TV's home and brings it up, in the background so boot isn't
# held up. `npm run deploy` runs it too, to restart the service on the new code. Remove the
# symlink, or uninstall the app, to turn it off.
SVCDIR=/media/developer/apps/usr/palm/services/ws.brandt.genkan.service
[ -f "$SVCDIR/service.js" ] || exit 0

# Stop the running instance, if that pid is still ours, and wait for it to go: it has to give up
# its bus name before the new one can register it.
PID=$(cat /tmp/genkan-svc.pid 2>/dev/null)
if [ -n "$PID" ] && grep -q -e genkan -e service.js "/proc/$PID/cmdline" 2>/dev/null; then
  kill "$PID"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
    [ -d "/proc/$PID" ] || break
    sleep 0.1
  done
  kill -9 "$PID" 2>/dev/null
fi
# and its foreground watcher, which outlives it if it was killed outright (installing does)
WATCH=$(cat /tmp/genkan-watch.pid 2>/dev/null)
if [ -n "$WATCH" ] && grep -q getForegroundAppInfo "/proc/$WATCH/cmdline" 2>/dev/null; then
  kill "$WATCH"
fi

export NODE_PATH=/usr/lib/node_modules:/usr/lib/nodejs
cd "$SVCDIR"
nohup /usr/bin/node service.js --boot --watch >/tmp/genkan-svc.stdout 2>&1 &
exit 0
