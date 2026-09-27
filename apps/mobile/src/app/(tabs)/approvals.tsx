import { useState } from "react";
import { Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { api, errorMessage, useApi, type LeaveItem } from "@/lib/api";
import { Banner, Button, C, Card, Empty, fmtRange, Input, s, Screen } from "@/lib/ui";

type Decision = "APPROVED" | "REJECTED";

export default function Approvals() {
  const q = useApi<{ items: LeaveItem[] }>("/team/pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: Decision) {
    setBusy(id + decision);
    setError(null);
    try {
      await api(`/leave/${id}/decision`, { body: { decision, note: notes[id] ?? "" } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await q.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Approvals" subtitle={q.data ? `${q.data.items.length} waiting` : undefined} loading={q.loading} onRefresh={q.reload}>
      <Banner text={error ?? q.error} />
      {q.data?.items.length ? (
        q.data.items.map((r) => {
          const name = `${r.employee.preferredName || r.employee.firstName} ${r.employee.lastName}`;
          return (
            <Card key={r.id}>
              <View style={s.between}>
                <Text style={s.h2}>{name}</Text>
                <Text style={s.small}>{r.employee.department?.name ?? ""}</Text>
              </View>
              <View style={s.row}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.leaveType.color }} />
                <Text style={s.body}>{r.leaveType.name}</Text>
              </View>
              <Text style={s.muted}>
                {fmtRange(r.startDate, r.endDate)} · {Number(r.totalDays)} {Number(r.totalDays) === 1 ? "day" : "days"}
              </Text>
              {r.reason ? <Text style={[s.body, { color: C.muted }]}>"{r.reason}"</Text> : null}
              <Input placeholder="Note (optional)" value={notes[r.id] ?? ""} onChangeText={(v) => setNotes((n) => ({ ...n, [r.id]: v }))} maxLength={1000} />
              <View style={s.row}>
                <Button title="Reject" variant="danger" onPress={() => decide(r.id, "REJECTED")} loading={busy === r.id + "REJECTED"} disabled={!!busy} />
                <Button title="Approve" onPress={() => decide(r.id, "APPROVED")} loading={busy === r.id + "APPROVED"} disabled={!!busy} />
              </View>
            </Card>
          );
        })
      ) : (
        <Card>
          <Empty text="Nothing waiting for you" loading={q.loading && !q.data} />
        </Card>
      )}
    </Screen>
  );
}
