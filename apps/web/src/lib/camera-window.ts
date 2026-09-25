const windowName = "star-home-cameras";

type ScreenArea = { availLeft: number; availTop: number; availWidth: number; availHeight: number };
type ScreenDetails = { screens: ScreenArea[]; currentScreen: ScreenArea };
type ExtendedWindow = Window & { getScreenDetails?: () => Promise<ScreenDetails> };
type ExtendedScreen = Screen & { isExtended?: boolean };

async function moveToOtherScreen(popup: Window): Promise<void> {
  const host = window as ExtendedWindow;
  if (!(screen as ExtendedScreen).isExtended || !host.getScreenDetails) return;
  try {
    const details = await host.getScreenDetails();
    const target = details.screens.find((item) => item !== details.currentScreen);
    if (!target || popup.closed) return;
    popup.moveTo(target.availLeft, target.availTop);
    popup.resizeTo(target.availWidth, target.availHeight);
  } catch {
    return;
  }
}

export function openCameraWindow(objectId: string): boolean {
  const width = Math.min(1440, window.screen.availWidth);
  const height = Math.min(900, window.screen.availHeight);
  const popup = window.open(`/security/cameras?object=${encodeURIComponent(objectId)}`, windowName, `popup,width=${width},height=${height}`);
  if (!popup) return false;
  popup.focus();
  void moveToOtherScreen(popup);
  return true;
}
