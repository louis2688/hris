import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { api, errorMessage, useApi, type Announcement } from "@/lib/api";
import { Banner, Button, C, Card, Empty, fmtDay, s, Screen } from "@/lib/ui";

/** Body is Markdown on the web; mobile shows plain paragraphs with the common markers stripped. */
const paragraphs = (md: string) =>
  md
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#{1,6}\s+/gm, "").replace(/(\*\*|__)(.*?)\1/g, "$2").trim())
    .filter(Boolean);

export default function AnnouncementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // ponytail: no single-item endpoint; the feed is at most 50 rows, so reuse it.
  const q = useApi<{ items: Announcement[] }>("/announcements");
  const a = q.data?.items.find((x) => x.id === id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ack() {
    setBusy(true);
    setError(null);
    try {
      await api(`/announcements/${id}/ack`, { body: {} });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await q.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={a?.title ?? "Announcement"} subtitle={a ? `${fmtDay(a.publishedAt)}${a.author ? ` · ${a.author}` : ""}` : undefined} loading={q.loading} onRefresh={q.reload}>
      <Banner text={error ?? q.error} />
      {a ? (
        <>
          <Card>
            {paragraphs(a.body).map((p, i) => (
              <Text key={i} style={[s.body, { lineHeight: 22, color: C.body }]}>
                {p}
              </Text>
            ))}
          </Card>
          {a.requiresAck ? (
            a.ackedAt ? (
              <Banner tone="ok" text={`You acknowledged this on ${fmtDay(a.ackedAt)}.`} />
            ) : (
              <Button title="Acknowledge" variant="accent" onPress={ack} loading={busy} />
            )
          ) : null}
        </>
      ) : (
        <Empty text="This announcement is no longer available" loading={q.loading && !q.data} />
      )}
    </Screen>
  );
}
