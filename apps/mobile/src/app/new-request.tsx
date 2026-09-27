import { useState } from "react";
import { Alert, Image, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { EXPENSE_CATEGORIES, expenseSchema, fmtMinutes, otMinutes, overtimeSchema } from "@hris/shared";
import { api, errorMessage } from "@/lib/api";
import { Banner, Button, C, Chip, Input, s, todayIso } from "@/lib/ui";

type Kind = "overtime" | "expenses";
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Camera or library photo, downscaled to 1600px JPEG (server caps receipts at 5 MB). */
async function pickReceipt(camera: boolean): Promise<string | null> {
  if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Camera permission is needed to photograph the receipt");
  const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
  const a = r.canceled ? undefined : r.assets[0];
  if (!a) return null;
  const long = Math.max(a.width, a.height);
  let m = ImageManipulator.manipulate(a.uri);
  if (long > 1600) m = m.resize(a.width >= a.height ? { width: 1600 } : { height: 1600 });
  const out = await (await m.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return out.uri;
}

export default function NewRequest() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<Kind>(params.kind === "expenses" ? "expenses" : "overtime");
  const [date, setDate] = useState(todayIso());
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<(typeof EXPENSE_CATEGORIES)[number] | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addReceipt() {
    const go = (camera: boolean) => () => pickReceipt(camera).then((u) => u && setReceipt(u), (e) => setError(errorMessage(e)));
    Alert.alert("Receipt photo", undefined, [
      { text: "Take photo", onPress: go(true) },
      { text: "Choose from library", onPress: go(false) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function submit() {
    setError(null);
    let path: string, body: unknown;
    if (kind === "overtime") {
      const p = overtimeSchema.safeParse({ date, startTime: start, endTime: end, reason });
      if (!p.success) return setError(p.error.issues[0]?.message ?? "Check the form");
      [path, body] = ["/requests/overtime", p.data];
    } else {
      const p = expenseSchema.safeParse({ date, category, amount, description });
      if (!p.success) return setError(p.error.issues[0]?.message ?? "Check the form");
      path = "/requests/expenses";
      if (receipt) {
        const fd = new FormData();
        Object.entries(p.data).forEach(([k, v]) => fd.append(k, v));
        // React Native FormData file part: { uri, name, type }.
        fd.append("receipt", { uri: receipt, name: "receipt.jpg", type: "image/jpeg" } as unknown as Blob);
        body = fd;
      } else body = p.data;
    }
    setBusy(true);
    try {
      await api(path, { body });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const mins = isTime(start) && isTime(end) && start !== end ? otMinutes(start, end) : 0;

  return (
    <ScrollView style={{ backgroundColor: C.canvas }} contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={s.row}>
        <Chip label="Overtime" active={kind === "overtime"} onPress={() => setKind("overtime")} />
        <Chip label="Expense" active={kind === "expenses"} onPress={() => setKind("expenses")} />
      </View>

      <View>
        <Text style={s.label}>Date</Text>
        <Input value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} />
      </View>

      {kind === "overtime" ? (
        <>
          <View style={[s.row, { alignItems: "flex-start" }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Start (24h)</Text>
              <Input value={start} onChangeText={setStart} placeholder="HH:mm" keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>End (24h)</Text>
              <Input value={end} onChangeText={setEnd} placeholder="HH:mm" keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>
          </View>
          {mins ? <Text style={s.muted}>{fmtMinutes(mins)}{end <= start ? ", ends the next day" : ""}</Text> : null}
          <View>
            <Text style={s.label}>Reason</Text>
            <Input value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="What was the overtime for?" />
          </View>
        </>
      ) : (
        <>
          <View>
            <Text style={s.label}>Category</Text>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              {EXPENSE_CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={c === category} onPress={() => setCategory(c)} />
              ))}
            </View>
          </View>
          <View>
            <Text style={s.label}>Amount (PHP)</Text>
            <Input value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" maxLength={14} />
          </View>
          <View>
            <Text style={s.label}>Description</Text>
            <Input value={description} onChangeText={setDescription} multiline maxLength={500} />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={s.label}>Receipt (optional)</Text>
            {receipt ? <Image source={{ uri: receipt }} style={{ width: 120, height: 160, borderRadius: 12, backgroundColor: C.bone }} /> : null}
            <View style={s.row}>
              <Button title={receipt ? "Replace photo" : "Add photo"} variant="outline" onPress={addReceipt} />
              {receipt ? <Button title="Remove" variant="danger" onPress={() => setReceipt(null)} /> : null}
            </View>
          </View>
        </>
      )}

      <Banner text={error} />
      <Button title="Submit request" onPress={submit} loading={busy} />
    </ScrollView>
  );
}
