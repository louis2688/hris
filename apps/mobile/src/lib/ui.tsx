import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LeaveBalance, LeaveStatus } from "@hris/shared";

/** Web brand tokens (apps/web globals.css). */
export const C = {
  brand: "#0052ff",
  brandDark: "#0047e0",
  brandSoft: "#eef4ff",
  surface: "#f5f7fb",
  card: "#ffffff",
  ink: "#0f172a",
  muted: "#475569",
  subtle: "#94a3b8",
  border: "#e2e8f0",
  green: "#059669",
  greenSoft: "#ecfdf5",
  red: "#dc2626",
  redSoft: "#fef2f2",
  amber: "#b45309",
  amberSoft: "#fffbeb",
};

export const s = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "700", color: C.ink, letterSpacing: -0.4 },
  h2: { fontSize: 17, fontWeight: "700", color: C.ink },
  body: { fontSize: 15, color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  small: { fontSize: 12, color: C.subtle },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: C.ink, backgroundColor: C.card },
  label: { fontSize: 13, fontWeight: "600", color: C.muted, marginBottom: 6 },
});

export function Screen({ title, subtitle, loading, onRefresh, children }: { title: string; subtitle?: string; loading?: boolean; onRefresh?: () => void; children: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.surface }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={C.brand} /> : undefined}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 2, marginBottom: 4 }}>
          {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
          <Text style={s.h1}>{title}</Text>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: 18, padding: 18, gap: 10, borderWidth: 1, borderColor: C.border }, style]}>{children}</View>;
}

const variants = {
  primary: { bg: C.brand, fg: "#fff", border: C.brand },
  dark: { bg: "#1e293b", fg: "#fff", border: "#1e293b" },
  secondary: { bg: C.card, fg: C.ink, border: C.border },
  danger: { bg: C.card, fg: C.red, border: "#fecaca" },
};

export function Button({ title, onPress, variant = "primary", loading, disabled, big }: { title: string; onPress: () => void; variant?: keyof typeof variants; loading?: boolean; disabled?: boolean; big?: boolean }) {
  const v = variants[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => ({
        backgroundColor: v.bg,
        borderColor: v.border,
        borderWidth: 1,
        borderRadius: big ? 18 : 12,
        paddingVertical: big ? 20 : 12,
        paddingHorizontal: 16,
        alignItems: "center",
        opacity: off ? 0.6 : pressed ? 0.85 : 1,
        flexGrow: 1,
      })}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={{ color: v.fg, fontWeight: "700", fontSize: big ? 18 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

const STATUS: Record<LeaveStatus, [string, string]> = {
  PENDING: [C.amber, C.amberSoft],
  APPROVED: [C.green, C.greenSoft],
  REJECTED: [C.red, C.redSoft],
  CANCELLED: [C.muted, "#f1f5f9"],
};
export const StatusPill = ({ status }: { status: LeaveStatus }) => <Pill label={status.charAt(0) + status.slice(1).toLowerCase()} color={STATUS[status][0]} bg={STATUS[status][1]} />;

export function Banner({ text, tone = "error" }: { text?: string | null; tone?: "error" | "ok" }) {
  if (!text) return null;
  const ok = tone === "ok";
  return (
    <View style={{ backgroundColor: ok ? C.greenSoft : C.redSoft, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: ok ? C.green : C.red, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

export function Empty({ text, loading }: { text: string; loading?: boolean }) {
  return <View style={{ paddingVertical: 20, alignItems: "center" }}>{loading ? <ActivityIndicator color={C.brand} /> : <Text style={s.muted}>{text}</Text>}</View>;
}

export function Balances({ balances, loading }: { balances?: LeaveBalance[]; loading?: boolean }) {
  if (!balances?.length) return <Empty loading={loading && !balances} text="No leave balances yet" />;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {balances.map((b) => (
        <View key={b.leaveTypeId} style={{ width: "48%", flexGrow: 1, backgroundColor: C.surface, borderRadius: 14, padding: 12, gap: 2 }}>
          <View style={s.row}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.color }} />
            <Text style={s.muted} numberOfLines={1}>
              {b.leaveTypeName}
            </Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: C.ink }}>
            {b.available}
            <Text style={s.small}> / {b.entitled + b.carriedOver + b.adjustment}</Text>
          </Text>
          {b.pending > 0 ? <Text style={s.small}>{b.pending} pending</Text> : null}
        </View>
      ))}
    </View>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2026-10-12" or a UTC-midnight ISO -> "Mon, Oct 12" (date-only, no timezone drift). */
export function fmtDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export const fmtRange = (a: string, b: string) => (a.slice(0, 10) === b.slice(0, 10) ? fmtDay(a) : `${fmtDay(a)} - ${fmtDay(b)}`);
export const fmtTime = (iso: string | Date, timeZone?: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
