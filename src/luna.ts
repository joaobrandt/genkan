// Minimal luna-service2 bridge. webOS injects window.PalmServiceBridge into every
// web app; each call gets a fresh bridge whose single response arrives on
// `onservicecallback`.

interface PalmBridge {
  onservicecallback: ((msg: string) => void) | null;
  call(uri: string, params: string): void;
  cancel?(): void;
}
declare global {
  interface Window {
    PalmServiceBridge?: {new (): PalmBridge};
  }
}

interface Reply {
  returnValue?: boolean;
  errorText?: string;
}

// One request, one reply: the bridge is cancelled as soon as it answers.
function call(uri: string, params: object, Bridge: {new (): PalmBridge}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const bridge = new Bridge();
    const timer = setTimeout(() => reject(new Error('a TV não respondeu')), 4000);
    bridge.onservicecallback = (msg) => {
      clearTimeout(timer);
      try {
        bridge.cancel?.();
      } catch {
        /* noop */
      }
      let res: Reply = {};
      try {
        res = JSON.parse(msg);
      } catch {
        /* treated as failure by the caller */
      }
      resolve(res);
    };
    bridge.call(uri, JSON.stringify(params));
  });
}

/** Launch an app (or switch to an HDMI input) by webOS app ID. Rejects with the
 *  TV's error text, e.g. when the app isn't installed. */
export async function launchApp(id: string): Promise<void> {
  const Bridge = window.PalmServiceBridge;
  if (!Bridge) {
    console.log(`launch ${id} (not on webOS)`);
    return;
  }

  const res = await call('luna://com.webos.applicationManager/launch', {id}, Bridge);
  if (!res.returnValue) throw new Error(res.errorText || 'falha ao abrir');
}

/** Switch the panel off or back on, leaving the TV and genkan running. Goes through genkan's
 *  service, which can reach tvpower when the app itself may not. */
export function setScreen(on: boolean) {
  const Bridge = window.PalmServiceBridge;
  if (!Bridge) {
    console.log(`screen ${on ? 'on' : 'off'} (not on webOS)`);
    return;
  }
  call(`luna://ws.brandt.genkan.service/${on ? 'screenOn' : 'screenOff'}`, {}, Bridge).catch(() => {
    /* best effort: at worst the panel stays as it is */
  });
}

let power: PalmBridge | undefined; // held for the life of the app: a live subscription

/** Call `fn` whenever the panel comes back on after being off — a key press on the remote
 *  lights it again without that key ever reaching genkan. */
export function onScreenOn(fn: () => void) {
  const Bridge = window.PalmServiceBridge;
  if (!Bridge || power) return;

  let wasOff = false;
  power = new Bridge();
  power.onservicecallback = (msg) => {
    let res: {state?: string; processing?: string} = {};
    try {
      res = JSON.parse(msg);
    } catch {
      return;
    }
    if (res.state === undefined) return;
    const on = res.state === 'Active' && !res.processing;
    if (on && wasOff) fn();
    wasOff = !on;
  };
  power.call(
    'luna://com.webos.service.tvpower/power/getPowerState',
    JSON.stringify({subscribe: true})
  );
}

const CLIENT = 'ws.brandt.genkan';
let saverRequests: PalmBridge | undefined; // held for the life of the app: a live subscription

/** Keep the TV's own screensaver from covering genkan. tvpower asks every registered client
 *  before showing it, and answering ack: false vetoes it — as youtube-webos does.
 *  The panel's off timer and power saving are unaffected. */
export function blockScreenSaver() {
  const Bridge = window.PalmServiceBridge;
  if (!Bridge || saverRequests) return;

  saverRequests = new Bridge();
  saverRequests.onservicecallback = (msg) => {
    let req: {timestamp?: string} = {};
    try {
      req = JSON.parse(msg);
    } catch {
      return;
    }
    if (req.timestamp === undefined) return; // the reply to registering, not a request
    call(
      'luna://com.webos.service.tvpower/power/responseScreenSaverRequest',
      {clientName: CLIENT, ack: false, timestamp: req.timestamp},
      Bridge
    ).catch(() => {
      /* best effort: at worst the TV's saver shows */
    });
  };
  saverRequests.call(
    'luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
    JSON.stringify({clientName: CLIENT, subscribe: true})
  );
}
