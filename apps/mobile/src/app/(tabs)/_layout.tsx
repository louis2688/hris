import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { isApprover, useAuth } from "@/lib/auth";
import { C } from "@/lib/ui";

const icon =
  (name: ComponentProps<typeof Ionicons>["name"]) =>
  ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const { user } = useAuth();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.brand, tabBarInactiveTintColor: C.subtle, sceneStyle: { backgroundColor: C.surface } }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="attendance" options={{ title: "Attendance", tabBarIcon: icon("time-outline") }} />
      <Tabs.Screen name="leave" options={{ title: "Leave", tabBarIcon: icon("calendar-outline") }} />
      <Tabs.Screen name="approvals" options={{ title: "Approvals", tabBarIcon: icon("checkmark-done-outline"), href: isApprover(user) ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person-outline") }} />
    </Tabs>
  );
}
