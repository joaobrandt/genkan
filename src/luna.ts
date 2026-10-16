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

/** Launch an app (or switch to an HDMI input) by webOS app ID. Rejects with the
 *  TV's error text, e.g. when the app isn't installed. */
export function launchApp(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const Bridge = window.PalmServiceBridge;
    if (!Bridge) {
      console.log(`launch ${id} (not on webOS)`);
      resolve();
      return;
    }

    const bridge = new Bridge();
    const timer = setTimeout(() => reject(new Error('timed out')), 4000);
    bridge.onservicecallback = (msg) => {
      clearTimeout(timer);
      try {
        bridge.cancel?.();
      } catch {
        /* noop */
      }
      let res: {returnValue?: boolean; errorText?: string} = {};
      try {
        res = JSON.parse(msg);
      } catch {
        /* treated as failure below */
      }
      if (res.returnValue) resolve();
      else reject(new Error(res.errorText || 'launch failed'));
    };
    bridge.call('luna://com.webos.applicationManager/launch', JSON.stringify({id}));
  });
}
