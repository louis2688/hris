import { router } from "expo-router";
import { useApi, type Survey } from "@/lib/api";
import { Banner, C, Card, Empty, fmtDay, Pill, Row, Screen } from "@/lib/ui";

export default function Surveys() {
  const q = useApi<{ surveys: Survey[] }>("/surveys");
  return (
    <Screen title="Surveys" loading={q.loading} onRefresh={q.reload}>
      <Banner text={q.error} />
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {q.data?.surveys.length ? (
          q.data.surveys.map((x, i) => (
            <Row
              key={x.id}
              first={i === 0}
              title={x.title}
              detail={[`${x.questions.length} questions`, x.anonymous ? "Anonymous" : null, x.closesAt ? `Closes ${fmtDay(x.closesAt)}` : null].filter(Boolean).join(" · ")}
              right={x.answered ? <Pill label="Done" color={C.green} bg={C.greenSoft} /> : <Pill label="Open" color={C.amber} bg={C.amberSoft} />}
              onPress={() => router.push(`/surveys/${x.id}`)}
            />
          ))
        ) : (
          <Empty text="No open surveys right now" loading={q.loading && !q.data} />
        )}
      </Card>
    </Screen>
  );
}
