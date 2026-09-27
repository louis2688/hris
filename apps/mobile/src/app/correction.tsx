import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { CORRECTION_KIND_LABELS, CORRECTION_KINDS, correctionSchema } from "@hris/shared";
import { api, errorMessage } from "@/lib/api";
import { Banner, Button, C, Chip, Input, s } from "@/lib/ui";

type Kind = (typeof CORRECTION_KINDS)[number];

export default function NewCorrection() {
  const p = useLocalSearchParams<{ date?: string; kind?: string }>();
  const [date, setDate] = useState(p.date ?? "");
  const [kind, setKind] = useState<Kind>(CORRECTION_KINDS.includes(p.kind as Kind) ? (p.kind as Kind) : "MISSED_BOTH");
  const [inTime, setIn] = useState("");
  const [outTime, setOut] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirrors correctionNeeds() in @hris/shared (not exported from the package root).
  const needIn = kind !== "MISSED_OUT";
  const needOut = kind !== "MISSED_IN";

  async function submit() {
    setError(null);
    const r = correctionSchema.safeParse({ date, kind, inTime: needIn ? inTime : "", outTime: needOut ? outTime : "", reason });
    if (!r.success) return setError(r.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    try {
      await api("/attendance/corrections", { body: r.data });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.canvas }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={s.label}>Date</Text>
        <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
      </View>
      <View>
        <Text style={s.label}>What happened</Text>
        <View style={[s.row, { flexWrap: "wrap" }]}>
          {CORRECTION_KINDS.map((k) => (
            <Chip key={k} label={CORRECTION_KIND_LABELS[k]} active={k === kind} onPress={() => setKind(k)} />
          ))}
        </View>
      </View>
      <View style={[s.row, { alignItems: "flex-start" }]}>
        {needIn ? (
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Time in (24h)</Text>
            <Input value={inTime} onChangeText={setIn} placeholder="08:00" keyboardType="numbers-and-punctuation" maxLength={5} />
          </View>
        ) : null}
        {needOut ? (
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Time out (24h)</Text>
            <Input value={outTime} onChangeText={setOut} placeholder="17:00" keyboardType="numbers-and-punctuation" maxLength={5} />
          </View>
        ) : null}
      </View>
      <View>
        <Text style={s.label}>Reason</Text>
        <Input value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="e.g. Forgot to clock out" />
      </View>
      <Text style={s.small}>Your manager reviews it. Once approved, the punches are added to your time record.</Text>
      <Banner text={error} />
      <Button title="Submit correction" onPress={submit} loading={busy} />
    </ScrollView>
  );
}
