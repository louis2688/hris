import { Text } from "react-native";
import { router } from "expo-router";
import { useApi, type Payslip } from "@/lib/api";
import { Banner, Card, Empty, fmtRange, peso, Row, s, Screen, StatusPill } from "@/lib/ui";

export default function Payslips() {
  const q = useApi<{ items: Payslip[] }>("/payslips");
  return (
    <Screen title="Payslips" loading={q.loading} onRefresh={q.reload}>
      <Banner text={q.error} />
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {q.data?.items.length ? (
          q.data.items.map((p, i) => (
            <Row
              key={p.id}
              first={i === 0}
              title={fmtRange(p.run.periodStart, p.run.periodEnd)}
              detail={`${p.run.name} · Paid ${p.run.payDate.slice(0, 10)}`}
              right={
                <>
                  <StatusPill status={p.run.status} />
                  <Text style={[s.body, s.mono, { fontWeight: "700" }]}>{peso(p.netPay)}</Text>
                </>
              }
              onPress={() => router.push(`/payslips/${p.id}`)}
            />
          ))
        ) : (
          <Empty text="No payslips released yet" loading={q.loading && !q.data} />
        )}
      </Card>
    </Screen>
  );
}
