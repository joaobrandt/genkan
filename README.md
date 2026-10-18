# genkan 玄関

A minimal home screen for LG webOS TVs. *Genkan* is the entryway of a Japanese
house — the first place you step into before any room — and 玄 also means
"dark", which suits a screen that's mostly true OLED black.

It's a single screen over a night sky generated on the TV once per installation
and kept: stars, a Milky Way band with dust lanes, faint nebulae and a few
distant spiral, elliptical and edge-on galaxies and tonight's moon, turning,
with twinkling stars and shooting stars every few seconds — and Holst's [Venus,
the Bringer of Peace](https://commons.wikimedia.org/wiki/File:Holst-_venus.ogg)
(U.S. Air Force Heritage of America Band, public domain) looping underneath. The
date, time and weather sit in the top right corner, and a PS4-style row of the
HDMI inputs, apps and the TV's settings in the bottom half. Left and Right slide
the row under the selected tile, which stays on the left; OK opens it, and
genkan starts on the tile opened last. The row is a fixed list in
`src/tiles.ts`. A green dot on an input tile means the TV sees a device on at
that HDMI port.

After two minutes without input genkan becomes a screensaver: the clock, the row
and the music fade away and only the sky keeps turning. The next key press brings
them back and does nothing else. The TV's own screensaver is vetoed, so it never
covers the sky. After half an hour of screensaver the panel switches off (the TV
stays on), and any key lights it again.

From 22:00 to 06:00 genkan keeps it down: dimmer text and tiles, the music at a
third of its volume, and the screensaver after 45 seconds instead of two minutes.

> Targets **webOS 24 / Chromium 108** on a rooted TV.

## Develop

```sh
npm install
npm run dev   # http://localhost:5173 — the layout scales to fit any window
```

The weather ([Open-Meteo](https://open-meteo.com), no account needed) is for the
place set in `.env`, read at build time; without it the weather line stays hidden:

```sh
VITE_LAT=-23.55
VITE_LON=-46.63
```

## Deploy

Needs the [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-installation)
(`ares-package`) and root ssh to the TV with `~/.ssh/id_ed25519`.

```sh
echo 'TV_IP=192.168.x.x' > .env
npm run deploy   # build → package → install over ssh → make it the home → launch
```

The install goes over plain ssh rather than `ares-install`, which fails against
the rooted TV's dropbear — see the comment in `scripts/deploy.mjs`.

## How genkan becomes the home

The TV brings up LG's home in two ways, and genkan takes its place in both,
without touching any OS files:

- **HOME**: surface-manager asks the app manager for the *default app of the
  "home" category* (`/usr/lib/qml/KeyFilters/systemUi.js`). LG's home is that
  default only because it's the one app declaring `"appCategory": ["home"]`.
  genkan declares it too (`public/appinfo.json`) and is made the default with
  `applicationManager/setDefaultApp`, kept in `/var/luna/preferences/general`.
  HOME then opens genkan directly.
- **BACK out of an app**, or any app closing with nothing behind it: the front
  goes empty, and a second later the app manager's last-app handler launches
  the TV's *idle app*, LG's home, as the read-only system profile says.
  Launching genkan within that second cancels the handler
  (`newapp_on_foreground`), so LG's home never starts.

Both are done by **a launcher service** in the app package
([`service/service.js`](service/service.js)). It sets the default home app at
every start (at boot the system profile's default wins until then), watches
the app in front for an empty front and launches genkan into it, launches
genkan at boot (retrying until the app manager is ready) and on waking from
standby, and, as a last fallback, replaces LG's home should anything still
launch it by name (the on-screen context menu's Home button does), with a brief
flash. The calls a dev service may not make go through `luna-send` as root.

**A boot hook** starts the service: `npm run deploy` links
[`service/autostart.sh`](service/autostart.sh) into the Homebrew Channel's
`/var/lib/webosbrew/init.d/` as `50-genkan`, which runs at every cold boot.
Deploying runs it too, to restart the service on the new code.

A cold boot (a restart, or power cut) still comes up on the last input first:
that's LG's boot daemon, and genkan takes over once the Homebrew Channel starts
its services, about 30 seconds in. With Quick Start+ on, the power button
doesn't cold-boot: the TV resumes, and the service brings genkan back as it
wakes.

To go back to the stock Home, give LG's home the default back **before**
uninstalling genkan (otherwise HOME opens nothing), then delete the link:

```sh
luna-send -n 1 luna://com.webos.applicationManager/setDefaultApp '{"category":"home","appId":"com.webos.app.home"}'
rm /var/lib/webosbrew/init.d/50-genkan
```
