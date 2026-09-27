import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, isApprover, useAuth } from "@/lib/auth";
import { useNotificationTaps } from "@/lib/push";
import { C } from "@/lib/ui";

function Nav() {
  const { user, ready } = useAuth();
  useNotificationTaps(ready && !!user, isApprover(user));
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.canvas } }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="new-leave" options={{ presentation: "modal", headerShown: true, title: "New leave request", headerTintColor: C.ink, headerStyle: { backgroundColor: C.canvas }, headerShadowVisible: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Nav />
    </AuthProvider>
  );
}
