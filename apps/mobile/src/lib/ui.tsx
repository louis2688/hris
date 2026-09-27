import { useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { LeaveBalance, LeaveStatus } from "@hris/shared";

/** Design tokens (DESIGN.md: warm cream canvas, ink type, one hot-orange accent used scarcely). */
export const C = {
  accent: "#ea2804", // primary: only the single most consequential action per screen
  accentPressed: "#c01f00",
  canvas: "#f9f7f3",
  bone: "#f3f0e8",
  card: "#ffffff",
  dark: "#202020",
  onDark: "#fcfcfc",
  ink: "#202020",
  body: "#3a3a3a",
  muted: "#575757", // charcoal
  mute: "#646464",
  subtle: "#8d8d8d", // ash
  stone: "#bbbbbb",
  border: "rgba(32,32,32,0.12)", // hairline
  green: "#2b9a66",
  greenSoft: "#e8f4ee",
  red: "#c8281c",
  redSoft: "#fcebe8",
  amber: "#a55a07",
  amberSoft: "#fbf0dc",
};

/** Times and codes. ponytail: system mono, JetBrains Mono would need expo-font. */
export const mono = Platform.select({ ios: "Menlo", default: "monospace" });

export const s = StyleSheet.create({
  h1: { fontSize: 30, lineHeight: 34, fontWeight: "700", color: C.ink, letterSpacing: -0.8 },
  h2: { fontSize: 18, lineHeight: 24, fontWeight: "600", color: C.ink, letterSpacing: -0.3 },
  body: { fontSize: 15, color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  small: { fontSize: 12, color: C.mute },
  mono: { fontFamily: mono },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 999, minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, fontSize: 16, color: C.ink, backgroundColor: C.card },
  inputMulti: { borderRadius: 12, minHeight: 96, textAlignVertical: "top" },
  label: { fontSize: 13, fontWeight: "600", color: C.muted, marginBottom: 6 },
});

/** Pill text input (rounded 12 when multiline); border goes ink on focus. */
export function Input({ style, onFocus, onBlur, ...p }: TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      placeholderTextColor={C.subtle}
      {...p}
      style={[s.input, p.multiline && s.inputMulti, focus && { borderColor: C.ink }, style]}
      onFocus={(e) => {
        setFocus(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocus(false);
        onBlur?.(e);
      }}
    />
  );
}

export function Screen({ title, subtitle, loading, onRefresh, children }: { title: string; subtitle?: string; loading?: boolean; onRefresh?: () => void; children: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: C.canvas }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!loading} onRefresh={onRefresh} tintColor={C.ink} /> : undefined}
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
  return <View style={[{ backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: C.border }, style]}>{children}</View>;
}

const variants = {
  dark: { bg: C.dark, fg: C.onDark, border: C.dark, pressed: "#000000" },
  accent: { bg: C.accent, fg: "#ffffff", border: C.accent, pressed: C.accentPressed },
  outline: { bg: C.card, fg: C.ink, border: C.ink, pressed: C.bone },
  danger: { bg: C.card, fg: C.red, border: C.red, pressed: C.redSoft },
};

export function Button({ title, onPress, variant = "dark", loading, disabled, big }: { title: string; onPress: () => void; variant?: keyof typeof variants; loading?: boolean; disabled?: boolean; big?: boolean }) {
  const v = variants[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => ({
        backgroundColor: pressed ? v.pressed : v.bg,
        borderColor: v.border,
        borderWidth: 1,
        borderRadius: 999,
        minHeight: big ? 60 : 48,
        paddingHorizontal: 24,
        alignItems: "center",
        justifyContent: "center",
        opacity: off ? 0.5 : 1,
        flexGrow: 1,
      })}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : <Text style={{ color: v.fg, fontWeight: "600", fontSize: big ? 18 : 16 }}>{title}</Text>}
    </Pressable>
  );
}

/** Pass `border` for neutral tags (canvas + hairline). */
export function Pill({ label, color, bg, border }: { label: string; color: string; bg: string; border?: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", borderWidth: border ? 1 : 0, borderColor: border }}>
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

const STATUS: Record<LeaveStatus, [string, string, string?]> = {
  PENDING: [C.amber, C.amberSoft],
  APPROVED: [C.onDark, C.green],
  REJECTED: [C.red, C.redSoft],
  CANCELLED: [C.mute, C.canvas, C.border],
};
export const StatusPill = ({ status }: { status: LeaveStatus }) => <Pill label={status.charAt(0) + status.slice(1).toLowerCase()} color={STATUS[status][0]} bg={STATUS[status][1]} border={STATUS[status][2]} />;

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
  return <View style={{ paddingVertical: 20, alignItems: "center" }}>{loading ? <ActivityIndicator color={C.ink} /> : <Text style={s.muted}>{text}</Text>}</View>;
}

export function Balances({ balances, loading }: { balances?: LeaveBalance[]; loading?: boolean }) {
  if (!balances?.length) return <Empty loading={loading && !balances} text="No leave balances yet" />;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {balances.map((b) => (
        <View key={b.leaveTypeId} style={{ width: "48%", flexGrow: 1, backgroundColor: C.bone, borderRadius: 12, padding: 12, gap: 2 }}>
          <View style={s.row}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: b.color }} />
            <Text style={s.muted} numberOfLines={1}>
              {b.leaveTypeName}
            </Text>
          </View>
          <Text style={{ fontSize: 22, fontWeight: "700", color: C.ink, letterSpacing: -0.5 }}>
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
