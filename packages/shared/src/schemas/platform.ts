// Owned by the platform feature. Zod schemas and constants go here.
import { z } from "zod";

export const SSO_PROVIDERS = ["google", "microsoft"] as const;
export type SsoProvider = (typeof SSO_PROVIDERS)[number];

/** Expo push token, e.g. ExponentPushToken[xxxxxxxx] (newer SDKs may issue ExpoPushToken[...]). */
export const expoPushTokenSchema = z.string().max(200).regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, "Invalid Expo push token");

export const registerDeviceSchema = z.object({
  token: expoPushTokenSchema,
  platform: z.enum(["ios", "android", "web"]),
});

export const unregisterDeviceSchema = z.object({ token: expoPushTokenSchema });
