#!/bin/sh
# genkan's boot hook. The Homebrew Channel runs everything in /var/lib/webosbrew/init.d/ once
# at cold boot (with run-parts, so the symlink there has no extension). It starts the
# launcher service, which brings genkan up and watches HOME, in the background so boot isn't
# held up. `npm run deploy` runs it too, since installing kills the running service. Remove
# the symlink, or uninstall the app, to turn it off.
SVCDIR=/media/developer/apps/usr/palm/services/ws.brandt.genkan.service
[ -f "$SVCDIR/service.js" ] || exit 0
[ -f /tmp/genkan-svc.pid ] && kill -9 "$(cat /tmp/genkan-svc.pid)" 2>/dev/null
export NODE_PATH=/usr/lib/node_modules:/usr/lib/nodejs
cd "$SVCDIR"
nohup /usr/bin/node service.js --boot --watch >/tmp/genkan-svc.stdout 2>&1 &
exit 0
