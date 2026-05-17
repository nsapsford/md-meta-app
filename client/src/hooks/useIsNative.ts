import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export function useIsNative(): boolean {
  return isNative;
}
