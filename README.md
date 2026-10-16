# genkan 玄関

A minimal home screen for LG webOS TVs. *Genkan* is the entryway of a Japanese
house — the first place you step into before any room — and 玄 also means
"dark", which suits a screen that's mostly true OLED black.

It's a single screen over a night sky generated at launch — a new one each time:
stars, a Milky Way band with dust lanes, faint nebulae and a few distant spiral,
elliptical and edge-on galaxies, turning, with twinkling stars and shooting
stars every few seconds — and Holst's [Venus, the Bringer of
Peace](https://commons.wikimedia.org/wiki/File:Holst-_venus.ogg) (U.S. Air Force
Heritage of America Band, public domain) looping underneath. A time-of-day
greeting sits in the top half, and a PS4-style row of the HDMI inputs, apps and
the TV's settings in the bottom half. Left and Right slide the row under the
selected tile, which stays on the left; OK opens it. The row is a fixed list in
`src/tiles.ts`.

> Targets **webOS 24 / Chromium 108** on a rooted TV.

## Develop

```sh
npm install
npm run dev   # http://localhost:5173 — the layout scales to fit any window
```

## Deploy

Needs the [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-installation)
(`ares-package`) and root ssh to the TV with `~/.ssh/id_ed25519`.

```sh
echo 'TV_IP=192.168.x.x' > .env
npm run deploy   # build → package → install over ssh → launch
```

The install goes over plain ssh rather than `ares-install`, which fails against
the rooted TV's dropbear — see the comment in `scripts/deploy.mjs`.
