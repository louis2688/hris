import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { REQUEST_KINDS, type RequestKind } from "@hris/shared";
import { api, errorMessage, useApi, type RequestLists } from "@/lib/api";
import { describe, FILEABLE, KIND_LABEL } from "@/lib/requests";
import { Banner, Button, C, Card, Chip, Empty, s, Screen, StatusPill } from "@/lib/ui";

export default function Requests() {
  const q = useApi<RequestLists>("/requests");
  const [kind, setKind] = useState<RequestKind>("overtime");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = q.data?.[kind] ?? [];

  function cancel(id: string, title: string) {
    Alert.alert("Cancel this request?", title, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel request",
        style: "destructive",
        onPress: async () => {
          setBusy(id);
          setError(null);
          try {
            await api(`/requests/${kind}/${id}/cancel`, { body: {} });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await q.reload();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  }

  return (
    <Screen title="Requests" loading={q.loading} onRefresh={q.reload}>
      <Button title="New request" onPress={() => router.push({ pathname: "/new-request", params: { kind: FILEABLE.includes(kind) ? kind : "overtime" } })} />
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {REQUEST_KINDS.map((k) => {
          const n = q.data?.[k].filter((r) => r.status === "PENDING").length;
          return <Chip key={k} label={n ? `${KIND_LABEL[k]} (${n})` : KIND_LABEL[k]} active={k === kind} onPress={() => setKind(k)} />;
        })}
      </View>
      <Banner text={error ?? q.error} />
      {FILEABLE.includes(kind) ? null : <Text style={s.muted}>{kind === "coe" ? "Certificate" : "Loan"} requests are filed on the web. They show up here once filed.</Text>}
      <Card style={{ gap: 0, paddingVertical: 6 }}>
        {items.length ? (
          items.map((r, i) => {
            const d = describe(kind, r);
            return (
              <View key={r.id} style={{ gap: 4, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: C.border }}>
                <View style={s.between}>
                  <Text style={[s.body, { fontWeight: "600", flex: 1 }]}>{d.title}</Text>
                  <StatusPill status={r.status} />
                </View>
                {d.lines.map((l, j) => (
                  <Text key={j} style={j ? s.small : s.muted}>
                    {l}
                  </Text>
                ))}
                {d.note ? <Text style={s.small}>Note: {d.note}</Text> : null}
                {r.status === "PENDING" ? (
                  <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    <Button title="Cancel" variant="danger" onPress={() => cancel(r.id, d.title)} loading={busy === r.id} disabled={!!busy} />
                  </View>
                ) : null}
              </View>
            );
          })
        ) : (
          <Empty text={`No ${kind === "coe" ? "COE" : KIND_LABEL[kind].toLowerCase()} requests yet`} loading={q.loading && !q.data} />
        )}
      </Card>
    </Screen>
  );
}
