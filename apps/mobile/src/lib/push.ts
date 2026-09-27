import { useEffect } from "react";
import { Platform } from "react-native";
import { router, type Href } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";

// Remote push needs a development/production build; Expo Go (SDK 53+) can't receive it on Android.
const K = "hris.pushToken";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Ask permission, get this phone's Expo push token and register it for the signed-in user. Never throws. */
export async function registerForPush() {
  try {
    if (!Device.isDevice) return; // simulators can't get push tokens
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return console.warn("Push disabled: set expo.extra.eas.projectId in app.json (run `eas init`).");
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", { name: "Default", importance: Notifications.AndroidImportance.DEFAULT });
    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/devices", { body: { token, platform: Platform.OS } });
    await SecureStore.setItemAsync(K, token);
  } catch (e) {
    console.warn("Push registration failed", e);
  }
}

/** Stop pushes to this phone. Call while still signed in (the DELETE needs the bearer token). */
export async function unregisterPush() {
  try {
    const token = await SecureStore.getItemAsync(K);
    if (!token) return;
    await SecureStore.deleteItemAsync(K);
    await api("/devices", { method: "DELETE", body: { token } });
  } catch (e) {
    console.warn("Push unregister failed", e);
  }
}

/** Web links sent by notify() -> app screens. Unknown links open Home. /leave/<id> goes to Approvals only for approvers. */
export function screenFor(link: unknown, approver: boolean): Href {
  const l = typeof link === "string" ? link : "";
  if (l.startsWith("/me/leave")) return "/leave";
  if (l.startsWith("/leave/")) return approver ? "/approvals" : "/leave";
  if (l.startsWith("/attendance")) return "/attendance";
  return "/";
}

/** Open the mapped screen when a notification is tapped (including the tap that cold-started the app). */
export function useNotificationTaps(signedIn: boolean, approver: boolean) {
  const resp = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!signedIn || !resp || resp.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    Notifications.clearLastNotificationResponse();
    router.push(screenFor(resp.notification.request.content.data?.link, approver));
  }, [resp, signedIn, approver]);
}
