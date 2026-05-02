import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Cable, KeyRound, Plus, Save, Trash2 } from "lucide-react";
import type { Agent, DesktopStore, LlmProvider, ProviderType } from "@reader/shared";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import "./styles.css";

type ProviderDraft = Partial<LlmProvider>;
type AgentDraft = Partial<Agent>;

const emptyProvider: ProviderDraft = {
  name: "Anthropic",
  type: "anthropic",
  baseUrl: "https://api.anthropic.com",
  modelName: "claude-3-5-sonnet-latest",
  apiKey: ""
};

const emptyAgent: AgentDraft = {
  nickname: "阅读伙伴",
  username: "reader",
  avatar: "🤖",
  soul: "你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。"
};

function App() {
  const [store, setStore] = useState<DesktopStore>({ providers: [], agents: [] });
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProvider);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(emptyAgent);
  const [testState, setTestState] = useState("");
  const [logPath, setLogPath] = useState("");

  useEffect(() => {
    window.readerDesktop.getState().then(setStore);
    window.readerDesktop.getLogPath().then(setLogPath);
  }, []);

  const providerOptions = useMemo(() => store.providers.map((provider) => ({ id: provider.id, label: provider.name })), [store.providers]);

  async function saveProvider() {
    const nextStore = await window.readerDesktop.saveProvider(providerDraft);
    setStore(nextStore);
    setProviderDraft(emptyProvider);
    setTestState("");
  }

  async function testProvider(id: string) {
    setTestState("测试中...");
    const result = await window.readerDesktop.testProvider(id);
    setTestState(result.ok ? `连通成功：${result.message}` : `连通失败：${result.message}`);
  }

  async function saveAgent() {
    const providerId = agentDraft.providerId || store.providers[0]?.id || "";
    const nextStore = await window.readerDesktop.saveAgent({ ...agentDraft, providerId });
    setStore(nextStore);
    setAgentDraft(emptyAgent);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid max-w-7xl grid-cols-[340px_1fr] gap-6 px-6 py-7">
        <Card className="bg-[#fff8ea] p-0">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Cable size={22} />
              </div>
              <div>
                <CardTitle className="text-xl">Reader Agent</CardTitle>
                <CardDescription>本地服务：127.0.0.1:43891</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-accent p-4 text-sm leading-6 text-accent-foreground">
              桌面端启动后开放本地 WebSocket。插件连接成功后显示绿灯，并可把 @Agent 的批注讨论发送到这里执行。
            </div>
            {logPath ? (
              <button className="mt-3 w-full rounded-2xl border border-border bg-background p-3 text-left text-xs leading-5 text-muted-foreground" type="button" onClick={() => navigator.clipboard.writeText(logPath)}>
                日志文件：{logPath}
              </button>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <KeyRound className="text-primary" />
                <div>
                  <CardTitle>LLM Provider</CardTitle>
                  <CardDescription>当前 Anthropic 可测试和调用，OpenAI/Gemini 先保存配置。</CardDescription>
                </div>
              </div>
              <Button type="button" onClick={saveProvider}>
                <Save size={16} /> 保存 Provider
              </Button>
            </CardHeader>
            <CardContent>
              <ProviderForm draft={providerDraft} onChange={setProviderDraft} />

              <div className="mt-5 grid gap-3">
                {store.providers.map((provider) => (
                  <div className="item-card" key={provider.id}>
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <strong>{provider.name}</strong>
                        <Badge variant="secondary">{provider.type}</Badge>
                      </div>
                      <p>{provider.modelName} · {provider.baseUrl}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" type="button" onClick={() => setProviderDraft(provider)}>编辑</Button>
                      <Button variant="secondary" size="sm" type="button" onClick={() => testProvider(provider.id)}>测试</Button>
                      <Button variant="destructive" size="icon" type="button" onClick={() => window.readerDesktop.deleteProvider(provider.id).then(setStore)}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {testState ? <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">{testState}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <Bot className="text-primary" />
                <div>
                  <CardTitle>Agent</CardTitle>
                  <CardDescription>username 用于插件批注里 @ 调用。</CardDescription>
                </div>
              </div>
              <Button type="button" onClick={saveAgent} disabled={store.providers.length === 0}>
                <Plus size={16} /> 保存 Agent
              </Button>
            </CardHeader>
            <CardContent>
              <AgentForm draft={agentDraft} providers={providerOptions} onChange={setAgentDraft} />

              <div className="mt-5 grid gap-3">
                {store.agents.map((agent) => (
                  <div className="item-card" key={agent.id}>
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-full bg-accent text-xl">{agent.avatar}</div>
                      <div>
                        <strong>{agent.nickname}</strong>
                        <p>@{agent.username}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" type="button" onClick={() => setAgentDraft(agent)}>编辑</Button>
                      <Button variant="destructive" size="icon" type="button" onClick={() => window.readerDesktop.deleteAgent(agent.id).then(setStore)}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function ProviderForm({ draft, onChange }: { draft: ProviderDraft; onChange: (draft: ProviderDraft) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="名称"><Input value={draft.name || ""} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field>
      <Field label="API 类型">
        <Select value={draft.type || "anthropic"} onChange={(event) => onChange({ ...draft, type: event.target.value as ProviderType })}>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </Select>
      </Field>
      <Field label="Base URL"><Input value={draft.baseUrl || ""} onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })} /></Field>
      <Field label="Model Name"><Input value={draft.modelName || ""} onChange={(event) => onChange({ ...draft, modelName: event.target.value })} /></Field>
      <Field className="col-span-2" label="API Key"><Input type="password" value={draft.apiKey || ""} onChange={(event) => onChange({ ...draft, apiKey: event.target.value })} /></Field>
    </div>
  );
}

function AgentForm({ draft, providers, onChange }: { draft: AgentDraft; providers: Array<{ id: string; label: string }>; onChange: (draft: AgentDraft) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Provider">
        <Select value={draft.providerId || providers[0]?.id || ""} onChange={(event) => onChange({ ...draft, providerId: event.target.value })}>
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
        </Select>
      </Field>
      <Field label="头像"><Input value={draft.avatar || ""} onChange={(event) => onChange({ ...draft, avatar: event.target.value })} /></Field>
      <Field label="Nickname"><Input value={draft.nickname || ""} onChange={(event) => onChange({ ...draft, nickname: event.target.value })} /></Field>
      <Field label="Username"><Input value={draft.username || ""} onChange={(event) => onChange({ ...draft, username: event.target.value })} /></Field>
      <Field className="col-span-2" label="Soul"><Textarea value={draft.soul || ""} onChange={(event) => onChange({ ...draft, soul: event.target.value })} /></Field>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
