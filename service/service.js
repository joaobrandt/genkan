// genkan's launcher service. Being a registered dev-mode webOS service is what lets it call
// applicationManager/launch, which a bare script can't. It lives in the app package, touches
// no OS files, and only reads the remote — it never grabs it.
//
// Flags:
//   --boot   launch genkan on start, retrying until the app manager is ready. autostart.sh
//            passes it at boot, so the TV comes up in genkan.
//   --watch  also watch the remote, and launch genkan whenever HOME is pressed.
var Service = require('webos-service');
var fs = require('fs');

var APP_ID = 'ws.brandt.genkan';
var HOME_CODE = 773; // HOME on this TV's Magic Remote
var EV_KEY = 1;
var EVENT_SIZE = 16; // 32-bit input_event
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

// Watch every input device for HOME, so it doesn't matter which one the remote turns up as.
// The fds are non-blocking and polled from one timer: a blocking read per device would pin a
// libuv thread each, and with ~32 input nodes the 4-thread pool runs out before the device
// that carries HOME ever gets read.
function watchHome() {
  var fds = [];
  try {
    fs.readdirSync('/dev/input').forEach(function (f) {
      if (f.indexOf('event') !== 0) return;
      try {
        fds.push(fs.openSync('/dev/input/' + f, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK));
      } catch (e) {
        /* unreadable node — skip it */
      }
    });
  } catch (e) {
    log('readdir /dev/input: ' + e.message);
    return;
  }
  log('watching ' + fds.length + ' input devices');

  var buf = Buffer.alloc(EVENT_SIZE * 64);
  var last = 0;
  setInterval(function () {
    for (var i = 0; i < fds.length; i++) {
      var bytes = 0;
      try {
        bytes = fs.readSync(fds[i], buf, 0, buf.length, null);
      } catch (e) {
        continue; // EAGAIN: nothing waiting on this device
      }
      for (var off = 0; off + EVENT_SIZE <= bytes; off += EVENT_SIZE) {
        var home =
          buf.readUInt16LE(off + 8) === EV_KEY &&
          buf.readUInt16LE(off + 10) === HOME_CODE &&
          buf.readInt32LE(off + 12) === 1;
        if (home && Date.now() - last > 800) {
          last = Date.now();
          launch('home key');
        }
      }
    }
  }, 16);
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
if (ARGS.indexOf('--watch') !== -1) watchHome();
