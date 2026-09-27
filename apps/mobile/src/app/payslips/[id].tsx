import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useApi, type Payslip, type PayslipLine } from "@/lib/api";
import { Banner, C, Card, Empty, fmtDay, fmtRange, mono, peso, s, Screen, StatusPill } from "@/lib/ui";

function Lines({ title, lines, total }: { title: string; lines: PayslipLine[]; total: number }) {
  return (
    <Card>
      <Text style={s.h2}>{title}</Text>
      {lines.map((l, i) => (
        <View key={`${l.code}-${i}`} style={s.between}>
          <Text style={[s.body, { flex: 1 }]}>
            {l.label}
            {l.qty ? <Text style={s.small}> × {l.qty}</Text> : null}
          </Text>
          <Text style={[s.body, s.mono]}>{peso(l.amount)}</Text>
        </View>
      ))}
      <View style={[s.between, { borderTopWidth: 1, borderColor: C.border, paddingTop: 10 }]}>
        <Text style={[s.body, { fontWeight: "700" }]}>Total</Text>
        <Text style={[s.body, s.mono, { fontWeight: "700" }]}>{peso(total)}</Text>
      </View>
    </Card>
  );
}

export default function PayslipDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<{ payslip: Payslip }>(`/payslips/${id}`);
  const p = q.data?.payslip;
  // Employer contributions are already stripped by the API; "info" lines are shown but not totalled.
  const lines = p?.lines ?? [];
  const info = lines.filter((l) => l.kind === "info");

  return (
    <Screen title="Payslip" subtitle={p ? `${p.run.name} · ${fmtRange(p.run.periodStart, p.run.periodEnd)}` : undefined} loading={q.loading} onRefresh={q.reload}>
      <Banner text={q.error} />
      {p ? (
        <>
          <Card style={{ backgroundColor: C.dark, borderColor: C.dark }}>
            <View style={s.between}>
              <Text style={{ color: C.onDark, opacity: 0.8, fontSize: 13 }}>Net pay · paid {fmtDay(p.run.payDate)}</Text>
              <StatusPill status={p.run.status} />
            </View>
            <Text style={{ color: "#ffffff", fontSize: 38, lineHeight: 44, fontWeight: "700", letterSpacing: -1.2, fontFamily: mono }}>{peso(p.netPay)}</Text>
          </Card>
          <Lines title="Earnings" lines={lines.filter((l) => l.kind === "earning")} total={p.grossPay} />
          <Lines title="Deductions" lines={lines.filter((l) => l.kind === "deduction")} total={p.totalDeductions} />
          {info.length ? (
            <Card>
              <Text style={s.h2}>Notes</Text>
              {info.map((l, i) => (
                <View key={`${l.code}-${i}`} style={s.between}>
                  <Text style={[s.muted, { flex: 1 }]}>{l.label}</Text>
                  <Text style={[s.muted, s.mono]}>{peso(l.amount)}</Text>
                </View>
              ))}
            </Card>
          ) : null}
          {p.ytd ? (
            <Card>
              <Text style={s.h2}>Year to date</Text>
              {(
                [
                  ["Gross", p.ytd.gross],
                  ["Withholding tax", p.ytd.tax],
                  ["Net", p.ytd.net],
                ] as const
              ).map(([k, v]) => (
                <View key={k} style={s.between}>
                  <Text style={s.muted}>{k}</Text>
                  <Text style={[s.body, s.mono]}>{peso(v)}</Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : (
        <Empty text="Payslip not found" loading={q.loading} />
      )}
    </Screen>
  );
}
