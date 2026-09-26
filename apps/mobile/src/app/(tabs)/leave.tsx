import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import type { LeaveBalance, Paginated } from "@hris/shared";
import { api, errorMessage, useApi, type LeaveItem } from "@/lib/api";
import { Balances, Banner, Button, C, Card, Empty, fmtRange, s, Screen, StatusPill, todayIso } from "@/lib/ui";

export default function Leave() {
  const bal = useApi<{ balances: LeaveBalance[] }>("/me/balances");
  const mine = useApi<Paginated<LeaveItem>>("/me/leave?pageSize=50");
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  function cancel(r: LeaveItem) {
    Alert.alert("Cancel this request?", `${r.leaveType.name}, ${fmtRange(r.startDate, r.endDate)}`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: async () => {
          setCancelling(r.id);
          setError(null);
          try {
            await api(`/leave/${r.id}/cancel`, { body: {} });
            void mine.reload();
            void bal.reload();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setCancelling(null);
          }
        },
      },
    ]);
  }

  const today = todayIso();
  return (
    <Screen
      title="Leave"
      loading={bal.loading || mine.loading}
      onRefresh={() => {
        void bal.reload();
        void mine.reload();
      }}
    >
      <Button title="New leave request" onPress={() => router.push("/new-leave")} />
      <Banner text={error ?? bal.error ?? mine.error} />
      <Card>
        <Text style={s.h2}>Balances</Text>
        <Balances balances={bal.data?.balances} loading={bal.loading} />
      </Card>
      <Card>
        <Text style={s.h2}>My requests</Text>
        {mine.data?.items.length ? (
          mine.data.items.map((r) => (
            <View key={r.id} style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderColor: C.border }}>
              <View style={s.between}>
                <View style={[s.row, { flex: 1 }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.leaveType.color }} />
                  <Text style={[s.body, { fontWeight: "600" }]} numberOfLines={1}>
                    {r.leaveType.name}
                  </Text>
                </View>
                <StatusPill status={r.status} />
              </View>
              <Text style={s.muted}>
                {fmtRange(r.startDate, r.endDate)} · {Number(r.totalDays)} {Number(r.totalDays) === 1 ? "day" : "days"}
              </Text>
              {r.reason ? <Text style={s.small}>{r.reason}</Text> : null}
              {r.decisionNote ? <Text style={s.small}>Note: {r.decisionNote}</Text> : null}
              {r.status === "PENDING" || (r.status === "APPROVED" && r.startDate.slice(0, 10) > today) ? (
                <View style={{ alignSelf: "flex-start" }}>
                  <Button title="Cancel" variant="danger" onPress={() => cancel(r)} loading={cancelling === r.id} />
                </View>
              ) : null}
            </View>
          ))
        ) : (
          <Empty text="No leave requests yet" loading={mine.loading && !mine.data} />
        )}
      </Card>
    </Screen>
  );
}
