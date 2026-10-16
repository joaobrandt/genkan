# genkan 玄関

A minimal home screen for LG webOS TVs. *Genkan* is the entryway of a Japanese
house — the first place you step into before any room — and 玄 also means
"dark", which suits a screen that's mostly true OLED black.

Right now it's a single screen: a time-of-day greeting centred on black, with
Holst's [Venus, the Bringer of
Peace](https://commons.wikimedia.org/wiki/File:Holst-_venus.ogg) (U.S. Air Force
Heritage of America Band, public domain) looping underneath.

> Targets **webOS 24 / Chromium 108** on a rooted TV.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173 — size the window to 1920×1080
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
