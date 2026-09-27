import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, isApprover, useAuth } from "@/lib/auth";
import { useNotificationTaps } from "@/lib/push";
import { C } from "@/lib/ui";

const header = { headerShown: true, headerTintColor: C.ink, headerStyle: { backgroundColor: C.canvas }, headerShadowVisible: false } as const;
/** Pushed pages: back button only, the page draws its own big title. */
const page = { ...header, title: "", headerBackButtonDisplayMode: "minimal" } as const;
const modal = (title: string) => ({ ...header, presentation: "modal", title }) as const;

function Nav() {
  const { user, ready } = useAuth();
  useNotificationTaps(ready && !!user, isApprover(user));
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.canvas } }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="new-leave" options={modal("New leave request")} />
        <Stack.Screen name="new-request" options={modal("New request")} />
        <Stack.Screen name="correction" options={modal("Attendance correction")} />
        <Stack.Screen name="assistant" options={{ ...header, title: "HR Assistant", headerBackButtonDisplayMode: "minimal" }} />
        {["approvals", "profile", "schedule", "payslips/index", "payslips/[id]", "announcements/index", "announcements/[id]", "surveys/index", "surveys/[id]"].map((name) => (
          <Stack.Screen key={name} name={name} options={page} />
        ))}
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
