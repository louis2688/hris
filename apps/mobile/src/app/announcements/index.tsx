import { View } from "react-native";
import { router } from "expo-router";
import { useApi, type Announcement } from "@/lib/api";
import { Banner, C, Card, Empty, fmtDay, Pill, Row, Screen } from "@/lib/ui";

export default function Announcements() {
  // API returns pinned first, then newest.
  const q = useApi<{ items: Announcement[] }>("/announcements");
  return (
    <Screen title="Announcements" loading={q.loading} onRefresh={q.reload}>
      <Banner text={q.error} />
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {q.data?.items.length ? (
          q.data.items.map((a, i) => (
            <Row
              key={a.id}
              first={i === 0}
              title={a.title}
              detail={`${fmtDay(a.publishedAt)}${a.author ? ` · ${a.author}` : ""}`}
              right={
                <View style={{ gap: 4, alignItems: "flex-end" }}>
                  {a.pinned ? <Pill label="Pinned" color={C.ink} bg={C.bone} /> : null}
                  {a.requiresAck ? a.ackedAt ? <Pill label="Acknowledged" color={C.green} bg={C.greenSoft} /> : <Pill label="Needs ack" color={C.amber} bg={C.amberSoft} /> : null}
                </View>
              }
              onPress={() => router.push(`/announcements/${a.id}`)}
            />
          ))
        ) : (
          <Empty text="No announcements yet" loading={q.loading && !q.data} />
        )}
      </Card>
    </Screen>
  );
}
