import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AI_HISTORY, AI_MAX_INPUT } from "@hris/shared";
import { apiStream, ApiError, errorMessage } from "@/lib/api";
import { Banner, Button, C, Card, Input, s } from "@/lib/ui";

type Msg = { role: "user" | "assistant"; content: string };
type Event = { type: "text"; text: string } | { type: "tool"; name: string } | { type: "error"; message: string } | { type: "done" };

/**
 * Streams NDJSON from POST /api/v1/assistant. expo/fetch exposes response.body as a ReadableStream on
 * iOS and Android, so text appears as it arrives. If a runtime has no body stream, falls back to
 * reading the whole response and parsing the lines at the end.
 */
async function ask(messages: Msg[], on: (e: Event) => void) {
  const res = await apiStream("/assistant", { messages: messages.slice(-AI_HISTORY) });
  const parse = (line: string) => line.trim() && on(JSON.parse(line) as Event);
  const reader = res.body?.getReader();
  if (!reader) return (await res.text()).split("\n").forEach(parse);
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(parse);
  }
  parse(buf);
}

const SUGGESTIONS = ["How many vacation days do I have left?", "When is the next payday?", "What's my schedule this week?"];

export default function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  async function send(q = text.trim()) {
    if (!q || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setText("");
    setError(null);
    setBusy(true);
    const append = (t: string) => setMsgs((m) => [...m.slice(0, -1), { role: "assistant", content: m.at(-1)!.content + t }]);
    try {
      await ask(history, (e) => {
        if (e.type === "text") {
          setTool(null);
          append(e.text);
        } else if (e.type === "tool") setTool(e.name);
        else if (e.type === "error") setError(e.message);
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setOff(e.message);
      else setError(errorMessage(e));
    } finally {
      // Drop an empty assistant bubble (error before any text) so the next request's history stays valid.
      setMsgs((m) => (m.at(-1)?.role === "assistant" && !m.at(-1)!.content ? m.slice(0, -1) : m));
      setTool(null);
      setBusy(false);
    }
  }

  if (off)
    return (
      <View style={{ flex: 1, backgroundColor: C.canvas, padding: 20 }}>
        <Card>
          <Text style={s.h2}>The HR Assistant isn't set up yet</Text>
          <Text style={s.muted}>Your admin needs to connect an AI provider before you can chat here. Everything else in the app works as usual.</Text>
          <Text style={s.small}>{off}</Text>
        </Card>
      </View>
    );

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: C.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0 /* ponytail: approx. status bar + header height */} style={{ flex: 1 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 12 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          {msgs.length ? null : (
            <View style={{ gap: 10 }}>
              <Text style={s.muted}>Ask about your leave, pay, schedule or company policies. Answers use your own HR records.</Text>
              {SUGGESTIONS.map((q) => (
                <Button key={q} title={q} variant="outline" onPress={() => send(q)} />
              ))}
            </View>
          )}
          {msgs.map((m, i) => (
            <View
              key={i}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                backgroundColor: m.role === "user" ? C.dark : C.card,
                borderColor: C.border,
                borderWidth: m.role === "user" ? 0 : 1,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={{ fontSize: 15, lineHeight: 21, color: m.role === "user" ? C.onDark : C.ink }}>{m.content || (tool ? `Looking up ${tool.replace(/_/g, " ")}...` : "...")}</Text>
            </View>
          ))}
          <Banner text={error} />
        </ScrollView>
        <View style={[s.row, { padding: 12, borderTopWidth: 1, borderColor: C.border, alignItems: "flex-end" }]}>
          <View style={{ flex: 1 }}>
            <Input value={text} onChangeText={setText} placeholder="Ask HR anything" maxLength={AI_MAX_INPUT} multiline style={{ borderRadius: 24, minHeight: 48, maxHeight: 120 }} />
          </View>
          <View>
            <Button title="Send" onPress={() => send()} loading={busy} disabled={!text.trim()} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
