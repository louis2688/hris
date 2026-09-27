import { useState } from "react";
import { Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { CORRECTION_KIND_LABELS, REQUEST_KINDS } from "@hris/shared";
import { api, errorMessage, useApi, type Correction, type LeaveItem, type RequestLists } from "@/lib/api";
import { describe, KIND_LABEL } from "@/lib/requests";
import { Banner, Button, C, Card, Empty, fmtDay, fmtRange, Input, s, Screen } from "@/lib/ui";

type Decision = "APPROVED" | "REJECTED";
type Person = { firstName: string; lastName: string; preferredName: string | null; department: { name: string } | null };
/** One pending item from any source, normalised for the card. `path` is its decision endpoint. */
type Item = { key: string; path: string; person?: Person; kind: string; title: string; lines: string[] };

export default function Approvals() {
  const leave = useApi<{ items: LeaveItem[] }>("/team/pending");
  const req = useApi<RequestLists>("/requests/pending");
  const cor = useApi<{ toDecide: (Correction & { employee: Person })[] }>("/attendance/corrections");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items: Item[] = [
    ...(leave.data?.items ?? []).map((r) => ({
      key: `leave-${r.id}`,
      path: `/leave/${r.id}/decision`,
      person: r.employee,
      kind: `Leave · ${r.leaveType.name}`,
      title: `${fmtRange(r.startDate, r.endDate)} · ${Number(r.totalDays)} ${Number(r.totalDays) === 1 ? "day" : "days"}`,
      lines: r.reason ? [r.reason] : [],
    })),
    ...REQUEST_KINDS.flatMap((k) =>
      (req.data?.[k] ?? []).map((r) => {
        const d = describe(k, r);
        return { key: `${k}-${r.id}`, path: `/requests/${k}/${r.id}/decision`, person: r.employee, kind: KIND_LABEL[k], title: d.title, lines: d.lines };
      }),
    ),
    ...(cor.data?.toDecide ?? []).map((c) => ({
      key: `cor-${c.id}`,
      path: `/attendance/corrections/${c.id}/decision`,
      person: c.employee,
      kind: `Correction · ${CORRECTION_KIND_LABELS[c.kind]}`,
      title: `${fmtDay(c.date)}${c.inTime ? ` · in ${c.inTime}` : ""}${c.outTime ? ` · out ${c.outTime}` : ""}`,
      lines: [c.reason],
    })),
  ];
  const loading = leave.loading || req.loading || cor.loading;
  const reload = () => Promise.all([leave.reload(), req.reload(), cor.reload()]);

  async function decide(it: Item, decision: Decision) {
    setBusy(it.key + decision);
    setError(null);
    try {
      await api(it.path, { body: { decision, note: notes[it.key] ?? "" } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen title="Approvals" subtitle={leave.data && req.data && cor.data ? `${items.length} waiting` : undefined} loading={loading} onRefresh={reload}>
      <Banner text={error ?? leave.error ?? req.error ?? cor.error} />
      {items.length ? (
        items.map((it) => (
          <Card key={it.key}>
            <View style={s.between}>
              <Text style={[s.h2, { flex: 1 }]}>{it.person ? `${it.person.preferredName || it.person.firstName} ${it.person.lastName}` : ""}</Text>
              <Text style={s.small}>{it.person?.department?.name ?? ""}</Text>
            </View>
            <Text style={s.muted}>{it.kind}</Text>
            <Text style={[s.body, { fontWeight: "600" }]}>{it.title}</Text>
            {it.lines.map((l, i) => (
              <Text key={i} style={[s.body, { color: C.muted }]}>
                {l}
              </Text>
            ))}
            <Input placeholder="Note (optional)" value={notes[it.key] ?? ""} onChangeText={(v) => setNotes((n) => ({ ...n, [it.key]: v }))} maxLength={500} />
            <View style={s.row}>
              <Button title="Reject" variant="danger" onPress={() => decide(it, "REJECTED")} loading={busy === it.key + "REJECTED"} disabled={!!busy} />
              <Button title="Approve" onPress={() => decide(it, "APPROVED")} loading={busy === it.key + "APPROVED"} disabled={!!busy} />
            </View>
          </Card>
        ))
      ) : (
        <Card>
          <Empty text="Nothing waiting for you" loading={loading && !leave.data} />
        </Card>
      )}
    </Screen>
  );
}
