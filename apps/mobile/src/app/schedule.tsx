import { Text, View } from "react-native";
import { useApi, type ScheduleDay } from "@/lib/api";
import { Banner, C, Card, Empty, fmtDay, mono, Pill, s, Screen, todayIso } from "@/lib/ui";

export default function Schedule() {
  // Server default range: today (Manila) + 13 days.
  const q = useApi<{ from: string; to: string; days: ScheduleDay[] }>("/attendance/schedule");
  const today = todayIso();
  return (
    <Screen title="Schedule" subtitle="Next 2 weeks" loading={q.loading} onRefresh={q.reload}>
      <Banner text={q.error} />
      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {q.data?.days.length ? (
          q.data.days.map((d, i) => (
            <View key={d.date} style={[s.between, { paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: C.border }]}>
              <View style={{ gap: 4, flex: 1 }}>
                <Text style={[s.body, { fontWeight: "600" }]}>
                  {fmtDay(d.date)}
                  {d.date === today ? <Text style={s.small}> · Today</Text> : null}
                </Text>
                <View style={[s.row, { flexWrap: "wrap" }]}>
                  {d.holiday ? <Pill label={d.holiday.name} color={C.ink} bg={C.bone} /> : null}
                  {d.override ? <Pill label="Changed" color={C.amber} bg={C.amberSoft} /> : null}
                </View>
              </View>
              {d.shift ? (
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={[s.body, { fontFamily: mono, fontWeight: "600" }]}>
                    {d.shift.startTime} - {d.shift.endTime}
                  </Text>
                  <Text style={s.small}>{d.shift.name}</Text>
                </View>
              ) : (
                <Text style={s.muted}>Rest day</Text>
              )}
            </View>
          ))
        ) : (
          <Empty text="No schedule set up yet" loading={q.loading && !q.data} />
        )}
      </Card>
    </Screen>
  );
}
