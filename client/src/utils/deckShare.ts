import { Capacitor } from '@capacitor/core';
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

/**
 * Open the Konami DB handoff link. The deck-transfer extension only runs in
 * extension-capable browsers, so natively we hand the URL to Firefox for
 * Android via its `firefox://open?url=` scheme (Capacitor routes non-http
 * schemes to an Android VIEW intent) instead of the system default browser.
 * On the web a normal new tab suffices.
 */
export function openDeckPortal(url: string): void {
  if (isNative()) {
    window.location.href = `firefox://open?url=${encodeURIComponent(url)}`;
  } else {
    window.open(url, '_blank', 'noopener');
  }
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
