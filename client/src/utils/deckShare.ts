import { Capacitor, registerPlugin } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const isNative = () => Capacitor.isNativePlatform();

/** Copy text to the clipboard (native plugin or web Clipboard API). */
export async function copyText(text: string): Promise<void> {
  if (isNative()) {
    await Clipboard.write({ string: text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}

/** Share `.ydk` text via the OS share sheet (native) or download a file (web). */
export async function shareYdk(ydk: string, filename = 'deck.ydk'): Promise<void> {
  if (isNative()) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: ydk,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, url: result.uri });
  } else {
    downloadYdk(ydk, filename);
  }
}

interface BrowserLauncher {
  openInFirefox(options: { url: string }): Promise<{ browser: 'firefox' | 'default' | 'none' }>;
}
const BrowserLauncher = registerPlugin<BrowserLauncher>('BrowserLauncher');

/** Where openDeckPortal actually landed the URL. */
export type PortalTarget = 'firefox' | 'default' | 'none' | 'web';

/**
 * Open the Konami DB handoff link. The deck-transfer extension only runs in
 * extension-capable browsers, so natively we pin the VIEW intent to Firefox
 * for Android (the firefox:// deep-link scheme is silently ignored by some
 * builds), falling back to the default browser if no Firefox is installed.
 * On the web a normal new tab suffices. Callers that also touch the
 * clipboard should invoke this before any await: on the web window.open must
 * run inside the click's user activation, and the body here is synchronous
 * up to the native bridge call.
 */
export async function openDeckPortal(url: string): Promise<PortalTarget> {
  if (isNative()) {
    const { browser } = await BrowserLauncher.openInFirefox({ url });
    return browser;
  }
  window.open(url, '_blank', 'noopener');
  return 'web';
}

/** Web-only: trigger a browser download of the `.ydk` text. */
export function downloadYdk(ydk: string, filename = 'deck.ydk'): void {
  const blob = new Blob([ydk], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
