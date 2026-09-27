import { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import type { SurveyQuestion } from "@hris/shared";
import { api, ApiError, errorMessage, useApi, type Survey } from "@/lib/api";
import { Banner, Button, C, Card, Chip, Empty, Input, s, Screen } from "@/lib/ui";

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function Answer({ q, value, onChange }: { q: SurveyQuestion; value: string | number | undefined; onChange: (v: string | number) => void }) {
  if (q.type === "text") return <Input value={String(value ?? "")} onChangeText={onChange} multiline maxLength={4000} />;
  if (q.type === "choice") return <View style={{ gap: 8 }}>{q.options?.map((o) => <Chip key={o} label={o} active={value === o} onPress={() => onChange(o)} />)}</View>;
  const [lo, hi] = q.type === "rating" ? [1, 5] : [0, 10];
  return (
    <View style={{ gap: 6 }}>
      <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
        {range(lo, hi).map((n) => (
          <Chip key={n} label={String(n)} active={value === n} onPress={() => onChange(n)} />
        ))}
      </View>
      <View style={s.between}>
        <Text style={s.small}>{q.type === "rating" ? "Poor" : "Not likely"}</Text>
        <Text style={s.small}>{q.type === "rating" ? "Excellent" : "Very likely"}</Text>
      </View>
    </View>
  );
}

export default function TakeSurvey() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<{ surveys: Survey[] }>("/surveys");
  const sv = q.data?.surveys.find((x) => x.id === id);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!sv) return;
    setError(null);
    const missing = sv.questions.filter((x) => x.required && String(answers[x.id] ?? "").trim() === "").length;
    if (missing) return setError(`Answer the ${missing} required ${missing === 1 ? "question" : "questions"} first`);
    setBusy(true);
    try {
      await api(`/surveys/${id}/responses`, { body: { answers } });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDone(true);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!sv) return <Screen title="Survey" loading={q.loading} onRefresh={q.reload}>{q.error ? <Banner text={q.error} /> : <Empty text="This survey is closed" loading={q.loading} />}</Screen>;

  const answered = done || sv.answered;
  return (
    <Screen title={sv.title} subtitle={sv.anonymous ? "Anonymous survey" : "Your name is recorded with your answers"} loading={q.loading} onRefresh={q.reload}>
      {sv.description ? <Text style={[s.body, { color: C.body }]}>{sv.description}</Text> : null}
      {answered ? (
        <Banner tone="ok" text="Thanks, your answers are in. Each survey can be answered once." />
      ) : (
        <>
          {sv.questions.map((x, i) => (
            <Card key={x.id}>
              <Text style={[s.body, { fontWeight: "600" }]}>
                {i + 1}. {x.text}
                {x.required ? "" : <Text style={s.small}> (optional)</Text>}
              </Text>
              <Answer q={x} value={answers[x.id]} onChange={(v) => setAnswers((a) => ({ ...a, [x.id]: v }))} />
            </Card>
          ))}
          <Banner text={error} />
          <Button title="Submit answers" variant="accent" onPress={submit} loading={busy} />
        </>
      )}
    </Screen>
  );
}
