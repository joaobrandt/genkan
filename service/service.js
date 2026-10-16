// genkan's launcher service. Being a registered dev-mode webOS service is what lets it call
// applicationManager/launch, which a bare script can't. It lives in the app package and
// touches no OS files.
//
// Flags:
//   --boot   launch genkan on start, retrying until the app manager is ready. autostart.sh
//            passes it at boot, so the TV comes up in genkan.
//   --watch  also watch the app in front, and put genkan in place of LG's home whenever it
//            comes up (on HOME, or when an app closes back to it).
var Service = require('webos-service');
var fs = require('fs');
var exec = require('child_process').exec;
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

var service = new Service('ws.brandt.genkan.service');
try {
  fs.writeFileSync('/tmp/genkan-svc.pid', String(process.pid));
} catch (e) {
  /* ignore */
}
log('start pid=' + process.pid + ' args=[' + ARGS.join(' ') + ']');

service.register('status', function (m) {
  m.respond({returnValue: true, running: true, pid: process.pid});
});

// screenOff / screenOn: the app's screensaver darkens the panel after a long idle (the TV and
// genkan stay on). tvpower may refuse a dev app, so this goes through luna-send, which as root
// may call anything.
function tvpower(method) {
  return function (m) {
    exec(
      '/usr/bin/luna-send -n 1 luna://com.webos.service.tvpower/power/' + method + " '{}'",
      function (err, out) {
        log(method + ': ' + (err ? err.message : out.trim()));
        m.respond({returnValue: !err});
      }
    );
  };
}
service.register('screenOff', tvpower('turnOffScreen'));
service.register('screenOn', tvpower('turnOnScreen'));

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

// LG's home comes to the front on HOME a beat after the key, so launching genkan on the key
// itself only flashes it before LG's home covers it. Follow the app in front instead, and
// replace LG's home as soon as it gets there. The foreground updates are only open to root, so
// they come through luna-send. If the TV keeps bringing LG's home back, let it be rather than
// fight it in a loop.
function replaceLgHome() {
  var p = spawn(
    '/usr/bin/luna-send',
    ['-i', 'luna://com.webos.applicationManager/getForegroundAppInfo', '{"subscribe":true}'],
    {stdio: ['ignore', 'pipe', 'ignore']}
  );
  var buf = '';
  var recent = []; // when genkan last took LG home's place
  p.stdout.on('data', function (chunk) {
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
      if (m.appId !== LG_HOME) return;
      var now = Date.now();
      recent = recent.filter(function (t) {
        return now - t < 3000;
      });
      if (recent.length >= 6) {
        log('LG home keeps coming back; leaving it');
        return;
      }
      recent.push(now);
      launch('over LG home');
    });
  });
  p.on('exit', function (code) {
    log('foreground watch ended (' + code + '), restarting');
    setTimeout(replaceLgHome, 2000);
  });
  log('watching for LG home');
}

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

if (ARGS.indexOf('--boot') !== -1)
  setTimeout(function () {
    bootLaunch(1);
  }, 1000);
if (ARGS.indexOf('--watch') !== -1) replaceLgHome();
