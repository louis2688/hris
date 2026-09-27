import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Banner, Button, C, Input, s } from "@/lib/ui";

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "center", padding: 24, gap: 28 }}>
        <View style={{ gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: C.dark, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: C.onDark, fontSize: 22, fontWeight: "700" }}>H</Text>
          </View>
          <Text style={s.h1}>Welcome back</Text>
          <Text style={s.muted}>Sign in with your work account.</Text>
        </View>
        <View style={{ gap: 14 }}>
          <View>
            <Text style={s.label}>Email</Text>
            <Input value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" placeholder="you@company.com" />
          </View>
          <View>
            <Text style={s.label}>Password</Text>
            <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} returnKeyType="go" />
          </View>
          <Banner text={error} />
          <Button title="Sign in" variant="accent" onPress={submit} loading={busy} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
