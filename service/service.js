// genkan's launcher service. Being a registered dev-mode webOS service is what lets it call
// applicationManager/launch, which a bare script can't. It lives in the app package and
// touches no OS files.
//
// genkan is the TV's home because it's the app manager's default app for the "home" category,
// which is what surface-manager launches on HOME (KeyFilters/systemUi.js). The service makes it
// so at every start, then keeps watch:
//
// Flags:
//   --boot   launch genkan on start, retrying until the app manager is ready. autostart.sh
//            passes it at boot, so the TV comes up in genkan.
//   --watch  also watch the app in front, and put genkan there whenever an app closes with
//            nothing behind it, or LG's home comes up anyway.
var Service = require('webos-service');
var fs = require('fs');
var spawn = require('child_process').spawn;

var APP_ID = 'ws.brandt.genkan';
var LG_HOME = 'com.webos.app.home';
var LOG = '/tmp/genkan-svc.log';
var ARGS = process.argv.slice(2);

function log(msg) {
  try {
    fs.appendFileSync(LOG, '[' + new Date().toISOString() + '] ' + msg + '\n');
  } catch (e) {
    /* ignore */
  }
}

// webos-service exits after ~5s idle unless timeouts are disabled, and reads the flag when the
// service is built, so push it first to stay resident.
if (process.argv.indexOf('--disable-timeouts') === -1) process.argv.push('--disable-timeouts');

// Right after a restart the bus can still hold this name for the instance just stopped, so wait
// and retry rather than die. (Atomics.wait is node's only synchronous sleep.)
var service;
for (var attempt = 1; !service; attempt++) {
  try {
    service = new Service('ws.brandt.genkan.service');
  } catch (e) {
    if (attempt >= 20 || String(e.message).indexOf('already exists') === -1) throw e;
    log('bus name still taken, retrying');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
}
try {
  fs.writeFileSync('/tmp/genkan-svc.pid', String(process.pid));
} catch (e) {
  /* ignore */
}
log('start pid=' + process.pid + ' args=[' + ARGS.join(' ') + ']');

// luna-send as root may call what this service may not over its own bus connection (the app
// manager's foreground info and default apps, tvpower). Two things make its processes outlive
// this one if it's killed (as installing does): they ignore SIGPIPE, like node, so a dead reader
// doesn't stop them; and node hands them its open file descriptors, among them that bus
// connection, which isn't close-on-exec, so a leftover would keep the service's bus name
// registered and the next start couldn't take it. So each luna-send gets /dev/null in place of
// every socket open here, and, given `limit` seconds, is stopped by timeout after that long.
var devNull = fs.openSync('/dev/null', 'r');
function spawnLunaSend(args, limit) {
  var stdio = ['ignore', 'pipe', 'ignore'];
  fs.readdirSync('/proc/self/fd').forEach(function (name) {
    var fd = Number(name);
    if (fd < 3) return;
    try {
      if (fs.readlinkSync('/proc/self/fd/' + name).indexOf('socket:') === 0) stdio[fd] = devNull;
    } catch (e) {
      /* gone already */
    }
  });
  for (var i = 3; i < stdio.length; i++) if (stdio[i] === undefined) stdio[i] = 'ignore';
  if (limit)
    return spawn('/usr/bin/timeout', [String(limit), '/usr/bin/luna-send'].concat(args), {
      stdio: stdio
    });
  return spawn('/usr/bin/luna-send', args, {stdio: stdio});
}

// One luna call through luna-send; `done` gets its first reply (null if none came). -i rather
// than -n 1, which over a pipe can exit before it prints the reply; the call is ended once it has
// answered.
function lunaSend(uri, params, done) {
  var p = spawnLunaSend(['-i', uri, JSON.stringify(params)], 5);
  var buf = '',
    finished = false;
  var timer = setTimeout(function () {
    finish(null);
  }, 5000);
  function finish(reply) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    p.kill();
    if (done) done(reply);
  }
  p.stdout.on('data', function (chunk) {
    buf += chunk;
    var nl = buf.indexOf('\n');
    if (nl === -1) return;
    var reply = null;
    try {
      reply = JSON.parse(buf.slice(0, nl));
    } catch (e) {
      /* not a reply: treated as none */
    }
    finish(reply);
  });
  p.on('exit', function () {
    finish(null);
  });
}

service.register('status', function (m) {
  m.respond({returnValue: true, running: true, pid: process.pid});
});

// screenOff / screenOn: the app's screensaver darkens the panel after a long idle (the TV and
// genkan stay on).
function tvpower(method) {
  return function (m) {
    lunaSend('luna://com.webos.service.tvpower/power/' + method, {}, function (reply) {
      log(method + ': ' + JSON.stringify(reply));
      m.respond({returnValue: !!(reply && reply.returnValue)});
    });
  };
}
service.register('screenOff', tvpower('turnOffScreen'));
service.register('screenOn', tvpower('turnOnScreen'));

// Make genkan the app manager's default app for the "home" category, which is what HOME
// launches. It keeps it in /var/luna/preferences/general ("defaultApps"), so it outlasts a
// reboot, and only takes an app whose appinfo has the "home" appCategory. At boot, though, the
// system profile's own default (LG's home) wins until this sets it again, so set it at every start.
function becomeHome() {
  lunaSend(
    'luna://com.webos.applicationManager/setDefaultApp',
    {category: 'home', appId: APP_ID},
    function (reply) {
      log('default home app: ' + JSON.stringify(reply));
    }
  );
}

function launch(reason, done) {
  service.call('luna://com.webos.applicationManager/launch', {id: APP_ID}, function (m) {
    log('launch (' + reason + '): ' + JSON.stringify(m && m.payload));
    if (done) done(!!(m && m.payload && m.payload.returnValue === true));
  });
}

// Cold boot: the app manager isn't ready the moment we start, so retry every 2s until it
// accepts the launch, for up to a minute.
function bootLaunch(attempt) {
  launch('boot #' + attempt, function (ok) {
    if (!ok && attempt < 30)
      setTimeout(function () {
        bootLaunch(attempt + 1);
      }, 2000);
  });
}

// Follow the app in front, for the two other ways LG's home comes up:
// - Leaving an app with BACK (or its closing) with nothing behind it empties the front, and a
//   second later the app manager's last-app handler launches the TV's idle app, which the system
//   profile says is LG's home. Launching genkan in that second cancels the handler
//   ("newapp_on_foreground"), so LG's home never comes up. Only while the TV is on, so turning it
//   off doesn't start genkan.
// - Anything that still launches LG's home by name (the on-screen context menu's Home button
//   does): put genkan in its place, after a brief flash of it.
// The foreground updates are only open to root, so they come through luna-send. If the TV keeps
// bringing LG's home back, let it be rather than fight it in a loop.
var watcher = null;
var recent = []; // when genkan last took the front
function takeFront(reason) {
  var now = Date.now();
  recent = recent.filter(function (t) {
    return now - t < 3000;
  });
  if (recent.length >= 6) {
    log('LG home keeps coming back; leaving it');
    return;
  }
  recent.push(now);
  launch(reason);
}
function watchFront() {
  watcher = spawnLunaSend([
    '-i',
    'luna://com.webos.applicationManager/getForegroundAppInfo',
    '{"subscribe":true}'
  ]);
  try {
    fs.writeFileSync('/tmp/genkan-watch.pid', String(watcher.pid)); // autostart.sh stops it
  } catch (e) {
    /* ignore */
  }
  var buf = '';
  watcher.stdout.on('data', function (chunk) {
    buf += chunk;
    var lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(function (line) {
      var m;
      try {
        m = JSON.parse(line);
      } catch (e) {
        return;
      }
      if (m.appId === '') {
        lunaSend('luna://com.webos.service.tvpower/power/getPowerState', {}, function (power) {
          if (power && power.state === 'Active' && !power.processing) takeFront('front empty');
        });
      } else if (m.appId === LG_HOME) {
        takeFront('over LG home');
      }
    });
  });
  watcher.on('exit', function (code) {
    log('foreground watch ended (' + code + '), restarting');
    setTimeout(watchFront, 2000);
  });
  log('watching the front');
}

// autostart.sh stops the running instance with SIGTERM before starting a new one: take the
// foreground watcher along, rather than leave it behind.
process.on('SIGTERM', function () {
  if (watcher) {
    watcher.removeAllListeners('exit');
    watcher.kill();
  }
  process.exit(0);
});

// Waking from standby doesn't run the boot hook again, but this process is only frozen while
// the TV rests, so a 1s heartbeat that fires far too late means it just woke: launch genkan a
// few times while the app manager and compositor come back. The heartbeat also keeps the
// process alive.
var lastBeat = Date.now();
setInterval(function () {
  var now = Date.now(),
    gap = now - lastBeat;
  lastBeat = now;
  if (gap < 10000) return;
  log('woke after ~' + Math.round(gap / 1000) + 's');
  var tries = 0;
  var retry = setInterval(function () {
    launch('wake ' + ++tries);
    if (tries >= 4) clearInterval(retry);
  }, 1500);
}, 1000);

becomeHome();
if (ARGS.indexOf('--boot') !== -1)
  setTimeout(function () {
    bootLaunch(1);
  }, 1000);
if (ARGS.indexOf('--watch') !== -1) watchFront();
