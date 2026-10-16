// Night, 22:00–06:00: the room is likely dark and quiet, so genkan is too. Dimmer text and
// tiles (styles under body.night, toggled by the clock in main.ts), softer music (music.ts)
// and a screensaver that comes sooner (screensaver.ts).
const FROM = 22;
const TO = 6;

export function isNight(d = new Date()): boolean {
  return d.getHours() >= FROM || d.getHours() < TO;
}
