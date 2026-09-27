import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { LeaveBalance } from "@hris/shared";
import { useApi, type LeaveItem, type Today } from "@/lib/api";
import { isApprover, useAuth } from "@/lib/auth";
import { Balances, Banner, C, Card, fmtTime, s, Screen } from "@/lib/ui";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

export default function Home() {
  const { user } = useAuth();
  const today = useApi<Today>("/attendance/today");
  const bal = useApi<{ balances: LeaveBalance[] }>("/me/balances");
  const pending = useApi<{ items: LeaveItem[] }>(isApprover(user) ? "/team/pending" : null);
  const lastIn = today.data?.punches.filter((p) => p.direction !== "OUT").at(-1);

  return (
    <Screen
      title={user?.name.split(" ")[0] ?? ""}
      subtitle={greeting()}
      loading={today.loading || bal.loading || pending.loading}
      onRefresh={() => {
        void today.reload();
        void bal.reload();
        void pending.reload();
      }}
    >
      <Banner text={today.error ?? bal.error ?? pending.error} />

      <Pressable onPress={() => router.navigate("/attendance")}>
        <Card style={{ backgroundColor: today.data?.clockedIn ? C.dark : C.accent, borderColor: "transparent" }}>
          <Text style={{ color: C.onDark, opacity: 0.8, fontSize: 13 }}>Today{today.data?.shift ? ` · ${today.data.shift.name} ${today.data.shift.startTime}-${today.data.shift.endTime}` : ""}</Text>
          <Text style={{ color: "#ffffff", fontSize: 22, fontWeight: "700", letterSpacing: -0.4 }}>
            {today.data ? (today.data.clockedIn ? `Clocked in${lastIn ? ` since ${fmtTime(lastIn.at)}` : ""}` : "Not clocked in") : "Loading..."}
          </Text>
          <Text style={{ color: C.onDark, opacity: 0.9, fontSize: 13 }}>Tap to {today.data?.clockedIn ? "clock out" : "clock in"}</Text>
        </Card>
      </Pressable>

      {isApprover(user) ? (
        <Pressable onPress={() => router.navigate("/approvals")}>
          <Card style={s.between}>
            <View style={{ gap: 2 }}>
              <Text style={s.h2}>Pending approvals</Text>
              <Text style={s.muted}>Leave requests waiting for you</Text>
            </View>
            <Text style={{ fontSize: 28, fontWeight: "700", letterSpacing: -0.6, color: pending.data?.items.length ? C.amber : C.subtle }}>{pending.data?.items.length ?? "-"}</Text>
          </Card>
        </Pressable>
      ) : null}

      <Card>
        <Text style={s.h2}>Leave balances</Text>
        <Balances balances={bal.data?.balances} loading={bal.loading} />
      </Card>
    </Screen>
  );
}
