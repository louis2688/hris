import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useApi, type Announcement } from "@/lib/api";
import { C } from "@/lib/ui";

const icon =
  (name: ComponentProps<typeof Ionicons>["name"]) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function TabsLayout() {
  // Badge on More: announcements still waiting for my acknowledgement. Refetches when the tabs regain focus.
  const ann = useApi<{ items: Announcement[] }>("/announcements");
  const needsAck = ann.data?.items.filter((a) => a.requiresAck && !a.ackedAt).length ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.subtle,
        tabBarStyle: { backgroundColor: C.canvas, borderTopColor: C.border, borderTopWidth: 1, elevation: 0, shadowOpacity: 0 },
        tabBarLabelStyle: { fontWeight: "600" },
        sceneStyle: { backgroundColor: C.canvas },
      }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="attendance" options={{ title: "Attendance", tabBarIcon: icon("time-outline") }} />
      <Tabs.Screen name="leave" options={{ title: "Leave", tabBarIcon: icon("calendar-outline") }} />
      <Tabs.Screen name="requests" options={{ title: "Requests", tabBarIcon: icon("document-text-outline") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("grid-outline"), tabBarBadge: needsAck || undefined, tabBarBadgeStyle: { backgroundColor: C.dark, color: C.onDark } }} />
    </Tabs>
  );
}
