import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { countLeaveDays, createLeaveRequestSchema, DAY_PART_LABELS, DAY_PARTS, type DayPart, type LeaveBalance } from "@hris/shared";
import { api, errorMessage, useApi } from "@/lib/api";
import { Banner, Button, C, Chip, Input, s, todayIso } from "@/lib/ui";

type LeaveType = { id: string; name: string; color: string; allowHalfDay: boolean; isPaid: boolean };
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function Parts({ label, value, onChange }: { label: string; value: DayPart; onChange: (v: DayPart) => void }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={[s.row, { flexWrap: "wrap" }]}>
        {DAY_PARTS.map((p) => (
          <Chip key={p} label={DAY_PART_LABELS[p]} active={value === p} onPress={() => onChange(p)} />
        ))}
      </View>
    </View>
  );
}

export default function NewLeave() {
  const types = useApi<{ items: LeaveType[] }>("/leave-types");
  const bal = useApi<{ balances: LeaveBalance[] }>("/me/balances");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [sp, setSp] = useState<DayPart>("FULL");
  const [ep, setEp] = useState<DayPart>("FULL");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = types.data?.items.find((t) => t.id === typeId) ?? types.data?.items[0];
  const b = bal.data?.balances.find((x) => x.leaveTypeId === type?.id && x.year === Number(start.slice(0, 4)));
  const single = start === end;
  const half = type?.allowHalfDay ?? false;
  // ponytail: live count skips holidays (no mobile holiday endpoint); the server recounts with holidays on submit.
  const days = isDate(start) && isDate(end) ? countLeaveDays(start, end, half ? sp : "FULL", half ? (single ? sp : ep) : "FULL") : 0;
  const over = !!(type?.isPaid && b && days > b.available);

  async function submit() {
    setError(null);
    const p = createLeaveRequestSchema.safeParse({ leaveTypeId: type?.id ?? "", startDate: start, endDate: end, startDayPart: half ? sp : "FULL", endDayPart: half ? (single ? sp : ep) : "FULL", reason });
    if (!p.success) return setError(p.error.issues[0]?.message ?? "Check the form");
    setBusy(true);
    try {
      await api("/leave", { body: p.data });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: C.canvas }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={s.label}>Leave type</Text>
        <View style={[s.row, { flexWrap: "wrap" }]}>
          {types.data?.items.map((t) => {
            const tb = bal.data?.balances.find((x) => x.leaveTypeId === t.id && x.year === Number(start.slice(0, 4)));
            return <Chip key={t.id} dot={t.color} label={tb ? `${t.name} (${tb.available})` : t.name} active={t.id === type?.id} onPress={() => setTypeId(t.id)} />;
          }) ?? <Text style={s.muted}>{types.error ?? "Loading..."}</Text>}
        </View>
      </View>

      <View style={[s.row, { alignItems: "flex-start" }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>From</Text>
          <Input
            value={start}
            onChangeText={(v) => {
              setStart(v);
              if (isDate(v) && v > end) setEnd(v);
            }}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>To</Text>
          <Input value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
      </View>

      {half ? (
        single ? (
          <Parts label="Day" value={sp} onChange={setSp} />
        ) : (
          <>
            <Parts label="First day" value={sp} onChange={setSp} />
            <Parts label="Last day" value={ep} onChange={setEp} />
          </>
        )
      ) : null}

      <View>
        <Text style={s.label}>Reason (optional)</Text>
        <Input value={reason} onChangeText={setReason} multiline maxLength={1000} />
      </View>

      <View style={{ backgroundColor: over ? C.amberSoft : C.bone, borderRadius: 12, padding: 14, gap: 2 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", letterSpacing: -0.5, color: over ? C.amber : C.ink }}>
          {days} {days === 1 ? "day" : "days"}
        </Text>
        <Text style={s.muted}>{b ? `${b.available} available${over ? ". This is more than your balance." : ""}` : "Weekends excluded; holidays are deducted on submit."}</Text>
      </View>

      <Banner text={error} />
      <Button title="Submit request" onPress={submit} loading={busy} disabled={!type} />
    </ScrollView>
  );
}
