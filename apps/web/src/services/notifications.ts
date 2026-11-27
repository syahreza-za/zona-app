/**
 * Cross-platform local notification helper for Web Push (Browser/PWA)
 * and Tauri v2 Desktop (macOS & Windows).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function dispatchDesktopNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    new Notification(title, {
      body,
      icon: './icon.svg',
    });
  } catch {
    // Ignore when blocked by platform policy
  }
}
