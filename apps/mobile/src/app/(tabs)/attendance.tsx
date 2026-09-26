import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import * as Location from "expo-location";
import { fmtMinutes, PUNCH_METHOD_LABELS, type DtrStatus } from "@hris/shared";
import { api, ApiError, errorMessage, useApi, type Dtr, type Punch, type Today } from "@/lib/api";
import { Banner, Button, C, Card, Empty, fmtDay, fmtTime, monthLabel, Pill, s, Screen, todayIso } from "@/lib/ui";

type PunchBody = { photo?: string; latitude?: number; longitude?: number };

/** Front camera selfie, downscaled to ~320px JPEG (same size the web punch card sends). */
async function selfie(): Promise<string> {
  if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error("Camera permission is needed for the selfie");
  const r = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 0.8 });
  const a = r.canceled ? undefined : r.assets[0];
  if (!a) throw new Error("A selfie is required to punch");
  const img = await ImageManipulator.manipulate(a.uri)
    .resize(a.width >= a.height ? { width: 320 } : { height: 320 })
    .renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return `data:image/jpeg;base64,${out.base64}`;
}

async function locate(): Promise<PunchBody> {
  if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error("Allow location access to punch");
  const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: p.coords.latitude, longitude: p.coords.longitude };
}

const addMonth = (ym: string, n: number) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

const DTR_STATUS: Record<DtrStatus, [string, string, string]> = {
  PRESENT: ["Present", C.green, C.greenSoft],
  INCOMPLETE: ["Incomplete", C.amber, C.amberSoft],
  ABSENT: ["Absent", C.red, C.redSoft],
  LEAVE: ["Leave", C.brand, C.brandSoft],
  HOLIDAY: ["Holiday", "#7c3aed", "#f5f3ff"],
  REST_DAY: ["Rest day", C.muted, "#f1f5f9"],
  UPCOMING: ["Upcoming", C.subtle, "#f8fafc"],
};

export default function Attendance() {
  const thisMonth = todayIso().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const today = useApi<Today>("/attendance/today");
  const dtr = useApi<Dtr>(`/attendance/dtr?month=${month}`);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const tz = dtr.data?.timeZone;
  const clockedIn = today.data?.clockedIn ?? false;
  const lastIn = today.data?.punches.filter((p) => p.direction !== "OUT").at(-1);

  async function punch() {
    setMsg(null);
    setBusy(true);
    try {
      // Local gate only: the server can't verify this (see README). Skipped when nothing is enrolled.
      if ((await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())) {
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: clockedIn ? "Clock out" : "Clock in" });
        if (!r.success) throw new Error("Verification cancelled");
      }
      // The server tells us what its policy needs; add it and retry. Each requirement is asked for at most once.
      const body: PunchBody = {};
      let r: { punch: Punch };
      for (;;) {
        try {
          r = await api<{ punch: Punch }>("/attendance/today", { body });
          break;
        } catch (e) {
          if (e instanceof ApiError && e.code === "PHOTO_REQUIRED" && !body.photo) body.photo = await selfie();
          else if (e instanceof ApiError && e.code === "LOCATION_REQUIRED" && body.latitude == null) Object.assign(body, await locate());
          else throw e;
        }
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMsg({ text: `${r.punch.direction === "OUT" ? "Clocked out" : "Clocked in"} at ${fmtTime(r.punch.at, tz)}`, tone: "ok" });
      void today.reload();
      void dtr.reload();
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const passkey = e instanceof ApiError && e.code === "PASSKEY_REQUIRED";
      setMsg({ text: passkey ? `${e.message}. Your company requires a passkey for punches, which only the web app supports for now.` : errorMessage(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const rows = dtr.data?.rows.filter((d) => d.status !== "UPCOMING") ?? [];
  const t = dtr.data?.totals;

  return (
    <Screen
      title="Attendance"
      loading={today.loading || dtr.loading}
      onRefresh={() => {
        void today.reload();
        void dtr.reload();
      }}
    >
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ backgroundColor: clockedIn ? C.green : C.brand, padding: 20, gap: 4 }}>
          <Text style={{ color: "#fff", opacity: 0.85, fontSize: 14 }}>{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz })}</Text>
          <Text style={{ color: "#fff", fontSize: 44, fontWeight: "800", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>{fmtTime(now, tz)}</Text>
          <Text style={{ color: "#fff", opacity: 0.9, fontSize: 14 }}>
            {clockedIn ? `Clocked in${lastIn ? ` since ${fmtTime(lastIn.at, tz)}` : ""}` : "Not clocked in"}
            {today.data?.shift ? ` · ${today.data.shift.name}` : ""}
          </Text>
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          <Button big title={clockedIn ? "Clock out" : "Clock in"} variant={clockedIn ? "dark" : "primary"} onPress={punch} loading={busy} disabled={!today.data} />
          <Banner text={msg?.text ?? today.error} tone={msg?.tone} />
        </View>
      </Card>

      <Card>
        <Text style={s.h2}>Today</Text>
        {today.data?.punches.length ? (
          today.data.punches.map((p, i) => (
            <View key={p.id} style={s.between}>
              <View style={s.row}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: (p.direction ?? (i % 2 ? "OUT" : "IN")) === "IN" ? C.green : C.muted }} />
                <Text style={s.body}>{(p.direction ?? (i % 2 ? "OUT" : "IN")) === "IN" ? "In" : "Out"}</Text>
                <Text style={s.small}>{p.source === "MOBILE" ? "Mobile" : PUNCH_METHOD_LABELS[p.method]}</Text>
              </View>
              <Text style={[s.body, { fontWeight: "600" }]}>{fmtTime(p.at, tz)}</Text>
            </View>
          ))
        ) : (
          <Empty text="No punches yet today" loading={today.loading && !today.data} />
        )}
      </Card>

      <Card>
        <View style={s.between}>
          <Pressable hitSlop={12} onPress={() => setMonth(addMonth(month, -1))}>
            <Text style={{ fontSize: 22, color: C.brand }}>‹</Text>
          </Pressable>
          <Text style={s.h2}>DTR · {monthLabel(month)}</Text>
          <Pressable hitSlop={12} disabled={month >= thisMonth} onPress={() => setMonth(addMonth(month, 1))}>
            <Text style={{ fontSize: 22, color: month >= thisMonth ? C.border : C.brand }}>›</Text>
          </Pressable>
        </View>
        <Banner text={dtr.error} />
        {t ? (
          <View style={[s.between, { backgroundColor: C.surface, borderRadius: 14, padding: 12 }]}>
            {[
              ["Present", String(t.present)],
              ["Absent", String(t.absent)],
              ["Late", String(t.lateCount)],
              ["Worked", fmtMinutes(t.workedMinutes)],
            ].map(([k, v]) => (
              <View key={k} style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: C.ink }}>{v}</Text>
                <Text style={s.small}>{k}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {rows.length ? (
          rows
            .slice()
            .reverse()
            .map((d) => {
              const [label, fg, bg] = DTR_STATUS[d.status];
              return (
                <View key={d.date} style={[s.between, { paddingVertical: 8, borderTopWidth: 1, borderColor: C.border }]}>
                  <View style={{ gap: 4, flex: 1 }}>
                    <Text style={[s.body, { fontWeight: "600" }]}>{fmtDay(d.date)}</Text>
                    <Pill label={d.leave ? `${label} · ${d.leave.code}` : d.holiday ? `${label} · ${d.holiday}` : label} color={fg} bg={bg} />
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={s.body}>{d.timeIn || d.timeOut ? `${d.timeIn ?? "--:--"} - ${d.timeOut ?? "--:--"}` : "-"}</Text>
                    <Text style={s.small}>
                      {fmtMinutes(d.workedMinutes)}
                      {d.lateMinutes > 0 ? ` · ${d.lateMinutes}m late` : ""}
                      {d.overtimeMinutes > 0 ? ` · OT ${fmtMinutes(d.overtimeMinutes)}` : ""}
                    </Text>
                  </View>
                </View>
              );
            })
        ) : (
          <Empty text="Nothing recorded this month" loading={dtr.loading && !dtr.data} />
        )}
      </Card>
    </Screen>
  );
}
