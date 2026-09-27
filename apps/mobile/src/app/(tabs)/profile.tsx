import { Alert, Text, View } from "react-native";
import { ROLE_LABELS, type SessionUser } from "@hris/shared";
import { useApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Banner, Button, C, Card, fmtDay, s, Screen } from "@/lib/ui";

type Named = { name: string } | null;
type Employee = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  workEmail: string | null;
  mobile: string | null;
  phone: string | null;
  hireDate: string;
  jobTitle: Named;
  department: Named;
  location: Named;
  manager: { firstName: string; lastName: string; preferredName: string | null } | null;
};

export default function Profile() {
  const { user, signOut } = useAuth();
  const me = useApi<{ user: SessionUser; employee: Employee | null }>("/me");
  const e = me.data?.employee;
  const rows: [string, string | null | undefined][] = e
    ? [
        ["Employee ID", e.employeeCode],
        ["Job title", e.jobTitle?.name],
        ["Department", e.department?.name],
        ["Location", e.location?.name],
        ["Manager", e.manager ? `${e.manager.preferredName || e.manager.firstName} ${e.manager.lastName}` : null],
        ["Work email", e.workEmail],
        ["Mobile", e.mobile ?? e.phone],
        ["Hired", fmtDay(e.hireDate)],
      ]
    : [];

  return (
    <Screen title="Profile" loading={me.loading} onRefresh={me.reload}>
      <Banner text={me.error} />
      <Card style={{ alignItems: "center", paddingVertical: 24 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.bone, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", letterSpacing: -0.5, color: C.ink }}>
            {(user?.name ?? "?")
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}
          </Text>
        </View>
        <Text style={s.h2}>{user?.name}</Text>
        <Text style={s.muted}>
          {user?.email} · {user ? ROLE_LABELS[user.role] : ""}
        </Text>
      </Card>
      {rows.length ? (
        <Card>
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <View key={k} style={[s.between, { paddingVertical: 4 }]}>
                <Text style={s.muted}>{k}</Text>
                <Text style={[s.body, k === "Employee ID" && s.mono, { flexShrink: 1, textAlign: "right" }]}>{v}</Text>
              </View>
            ))}
        </Card>
      ) : null}
      <Button
        title="Sign out"
        variant="danger"
        onPress={() =>
          Alert.alert("Sign out?", undefined, [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => void signOut() },
          ])
        }
      />
    </Screen>
  );
}
