# genkan 玄関

A minimal home screen for LG webOS TVs. *Genkan* is the entryway of a Japanese
house — the first place you step into before any room — and 玄 also means
"dark", which suits a screen that's mostly true OLED black.

It's a single screen over a night sky generated at launch — a new one each time:
stars, a Milky Way band with dust lanes, faint nebulae and a few distant spiral,
elliptical and edge-on galaxies and tonight's moon, turning, with twinkling
stars and shooting stars every few seconds — and Holst's [Venus, the Bringer of
Peace](https://commons.wikimedia.org/wiki/File:Holst-_venus.ogg) (U.S. Air Force
Heritage of America Band, public domain) looping underneath. The date, time and
weather sit in the top right corner, and a PS4-style row of the HDMI inputs,
apps and the TV's settings in the bottom half. Left and Right slide the row
under the selected tile, which stays on the left; OK opens it, and genkan starts
on the tile opened last. The row is a fixed list in `src/tiles.ts`. A green dot
on an input tile means the TV sees a device on at that HDMI port.

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

The TV's own Home is a signed, read-only app, so genkan takes over around it,
without touching any OS files:

- **A launcher service** in the app package ([`service/service.js`](service/service.js)).
  Being a registered webOS service is what lets it launch apps. It launches
  genkan at boot (retrying until the app manager is ready) and on waking from
  standby, and puts it in place of LG's home whenever that comes to the front:
  on HOME, or when an app closes back to it. (Launching on the HOME key itself
  doesn't work: LG's home arrives a beat later and covers genkan.)
- **A boot hook**: `npm run deploy` links [`service/autostart.sh`](service/autostart.sh)
  into the Homebrew Channel's `/var/lib/webosbrew/init.d/` as `50-genkan`, which
  starts the service at every cold boot. Deploying also runs it straight away,
  since installing kills the running service.

To go back to the stock Home, delete that link and uninstall the app.
