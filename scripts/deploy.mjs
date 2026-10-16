// One-shot deploy: build -> package the app and its launcher service (no ares minify) ->
// install -> make genkan the TV's home (boot hook + HOME watcher) and launch it.
// Usage: npm run deploy   (reads TV_IP from .env)
import {execSync, spawn} from 'node:child_process';
import {readFileSync, readdirSync, rmSync} from 'node:fs';
import {homedir} from 'node:os';

const {id: APP_ID} = JSON.parse(readFileSync('public/appinfo.json', 'utf8'));
const TV_IP = process.env.TV_IP;
if (!TV_IP) throw new Error('TV_IP is not set — add it to .env');
const SSH_KEY = `${homedir()}/.ssh/id_ed25519`;
const SSH = `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no root@${TV_IP}`;
const SVC = `/media/developer/apps/usr/palm/services/${APP_ID}.service`;
const BOOT_HOOK = '/var/lib/webosbrew/init.d/50-genkan';
const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, {stdio: 'inherit'});
};

// 1. Build (tsc + Vite, targeting Chromium 108)
run('npm run build');

// 2. Clean old ipks, then package the app (dist) and its launcher service (service) together,
// without ares' legacy minifier (it chokes on Vite output).
for (const f of readdirSync('.').filter((f) => f.endsWith('.ipk'))) rmSync(f);
run('ares-package dist service -o . --no-minify');

// 3. Install on the TV
const ipk = readdirSync('.').find((f) => f.endsWith('.ipk'));

// ─── WORKAROUND: ares-install "Unable to exec" ──────────────────────────────────────────
// ares-install uploads the ipk over SFTP and immediately runs `ls -l` on it; the rooted
// TV's dropbear (Homebrew Channel) kills that exec channel, so the install never happens.
// Do what ares-install does over plain ssh instead: stream the ipk into the TV's temp dir,
// call appInstallService's dev/install, wait for "installed", then remove the temp ipk.
// To revert: replace this whole block with  run(`ares-install --device <profile> ${ipk}`);
const TMP_IPK = `/media/developer/temp/${ipk}`;

function lunaInstall(ipkPath) {
  const param = JSON.stringify({id: 'com.ares.defaultName', ipkUrl: ipkPath, subscribe: true});
  const cmd = `/usr/bin/luna-send-pub -i luna://com.webos.appInstallService/dev/install '${param}'`;
  console.log(`\n$ ssh root@${TV_IP} ${cmd}`);
  return new Promise((resolve, reject) => {
    // -i keeps luna-send subscribed; closing stdin + killing ssh is how we end it
    const p = spawn(
      'ssh',
      ['-i', SSH_KEY, '-o', 'StrictHostKeyChecking=no', `root@${TV_IP}`, cmd],
      {stdio: ['pipe', 'pipe', 'inherit']}
    );
    const finish = (err) => {
      clearTimeout(timer);
      p.stdin.end();
      p.kill();
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('install timed out after 3 min')), 180_000);
    let buf = '',
      json = '',
      lastState;
    p.stdout.on('data', (chunk) => {
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        json += buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        let msg;
        try {
          msg = JSON.parse(json);
        } catch {
          continue; // response spans several lines
        }
        json = '';
        if (msg.returnValue === false)
          return finish(
            new Error(`install failed: ${msg.errorText || msg.errorMessage || JSON.stringify(msg)}`)
          );
        const state = msg.details?.state ?? '';
        if (state && state !== lastState) console.log(`  install state: ${(lastState = state)}`);
        if (/FAILED/i.test(state))
          return finish(new Error(`install failed: ${msg.details.reason || state}`));
        if (/installed|^SUCCESS/i.test(state)) return finish();
      }
    });
    p.on('exit', (code) =>
      finish(new Error(`luna-send exited (code ${code}) before reporting "installed"`))
    );
  });
}

run(`${SSH} "mkdir -p /media/developer/temp && cat > ${TMP_IPK}" < ${ipk}`);
await lunaInstall(TMP_IPK);
run(`${SSH} "rm -f ${TMP_IPK}"`);
// ─── END WORKAROUND ─────────────────────────────────────────────────────────────────────

// 4. Make genkan the home: link the boot hook into the Homebrew Channel's init.d, then run it
// now, since installing killed the service. It starts the launcher service, which launches
// genkan and watches HOME — without this, HOME stays dead until the next reboot.
run(`${SSH} "ln -sf ${SVC}/autostart.sh ${BOOT_HOOK} && sh ${SVC}/autostart.sh"`);

console.log(`\n✓ deployed; ${APP_ID} launched, and set to come up at boot and on HOME`);
