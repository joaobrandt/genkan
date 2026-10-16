// Burn-in care: the selected tile's frame, its title and the clock would otherwise land on
// the same pixels every time genkan is up. Whenever they're out of sight (under another app,
// or faded out by the screensaver) the whole layout moves to a new spot up to RANGE px away,
// too little to notice and enough to spread the wear, like LG's own Screen Shift.
const RANGE = 8;
const stage = document.getElementById('stage')!;

export function shift() {
  const r = () => `${Math.round((Math.random() * 2 - 1) * RANGE)}px`;
  stage.style.setProperty('--shift-x', r());
  stage.style.setProperty('--shift-y', r());
}

shift();
