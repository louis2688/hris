import { Alert, Text } from "react-native";
import { router, type Href } from "expo-router";
import { useApi, type Announcement, type Survey } from "@/lib/api";
import { isApprover, useAuth } from "@/lib/auth";
import { Banner, C, Card, Pill, Row, Screen } from "@/lib/ui";

const Count = ({ n }: { n: number }) => (n ? <Pill label={String(n)} color={C.onDark} bg={C.dark} /> : null);

export default function More() {
  const { user, signOut } = useAuth();
  const ann = useApi<{ items: Announcement[] }>("/announcements");
  const sur = useApi<{ surveys: Survey[] }>("/surveys");
  const needsAck = ann.data?.items.filter((a) => a.requiresAck && !a.ackedAt).length ?? 0;
  const openSurveys = sur.data?.surveys.filter((x) => !x.answered).length ?? 0;
  const items: [string, string, Href, number?][] = [
    ["Payslips", "Pay periods and breakdowns", "/payslips"],
    ["Schedule", "Your shifts for the next 2 weeks", "/schedule"],
    ["Announcements", needsAck ? `${needsAck} to acknowledge` : "Company news and policies", "/announcements", needsAck],
    ["Surveys", openSurveys ? `${openSurveys} waiting for you` : "Pulse and feedback surveys", "/surveys", openSurveys],
    ["HR Assistant", "Ask about leave, pay and policies", "/assistant"],
    ...(isApprover(user) ? [["Approvals", "Leave, requests and corrections", "/approvals"] as [string, string, Href]] : []),
    ["Profile", user?.email ?? "", "/profile"],
  ];

  return (
    <Screen
      title="More"
      loading={ann.loading || sur.loading}
      onRefresh={() => {
        void ann.reload();
        void sur.reload();
      }}
    >
      <Banner text={ann.error ?? sur.error} />
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        {items.map(([title, detail, href, n], i) => (
          <Row key={title} first={i === 0} title={title} detail={detail} right={<Count n={n ?? 0} />} onPress={() => router.push(href)} />
        ))}
      </Card>
      <Card style={{ paddingVertical: 4, gap: 0 }}>
        <Row
          first
          title="Sign out"
          onPress={() =>
            Alert.alert("Sign out?", undefined, [
              { text: "Cancel", style: "cancel" },
              { text: "Sign out", style: "destructive", onPress: () => void signOut() },
            ])
          }
        />
      </Card>
      <Text style={{ textAlign: "center", color: C.subtle, fontSize: 12 }}>Signed in as {user?.name}</Text>
    </Screen>
  );
}
