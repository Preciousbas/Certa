export const C1 =
  "Certa needs your camera to take site photos. Tap Allow when asked, or turn it on in your phone settings.";
export const C2 =
  "Certa needs your location to prove the photos were taken on site. Turn on location and try again.";
export const C5 = "This photo is more than 10 minutes old. Please take a new one now.";
export const C6 =
  "This photo looks the same as one sent before. Please take new photos of the work as it is today.";
export const C7 =
  "This photo is too dark or blurry to check. Hold the phone steady and make sure the work is well lit.";
export const C8 =
  "No connection. Your photos are saved on this phone and will upload when you're back online. Keep Certa open.";
export const C9 =
  "Photos sent. Certa is checking them against the stage requirements. This usually takes under a minute.";

export function outsideRadius(distanceM: number, radiusM: number): string {
  return `This photo was taken ${distanceM} m from the site. Photos must be taken within ${radiusM} m. Move closer to the work and take it again.`;
}

export function poorAccuracy(accuracyM: number): string {
  return `Your location isn't accurate enough yet (${accuracyM} m). Step outside or wait a few seconds, then take the photo again.`;
}
