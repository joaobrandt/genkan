export interface Tile {
  id: string; // webOS app ID — launching an HDMI input app switches the TV to that input
  title: string;
  icon: string; // public/icons/*
}

// The home row, left to right. App Store icons are 512px (twice the tile), the rest SVG.
export const TILES: Tile[] = [
  {id: 'com.webos.app.hdmi1', title: 'PlayStation 5', icon: 'icons/ps5.jpg'},
  {id: 'com.webos.app.hdmi2', title: 'Nintendo Switch 2', icon: 'icons/nsw2.png'},
  {id: 'com.webos.app.hdmi3', title: 'TV', icon: 'icons/tv.svg'},
  {id: 'youtube.leanback.v4', title: 'YouTube', icon: 'icons/youtube.png'},
  {id: 'com.disney.disneyplus-prod', title: 'Disney+', icon: 'icons/disney.png'},
  {id: 'amazon', title: 'Prime Video', icon: 'icons/prime.png'},
  {id: 'com.apple.appletv', title: 'Apple TV', icon: 'icons/appletv.svg'},
  {id: 'org.webosbrew.hbchannel', title: 'Homebrew Channel', icon: 'icons/homebrew.svg'}, // webosbrew, MIT
  {id: 'com.palm.app.settings', title: 'Settings', icon: 'icons/settings.svg'}
];
