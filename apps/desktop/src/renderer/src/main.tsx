import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, Cable, Eye, EyeOff, KeyRound, Plus, Save, Trash2, Upload, User } from "lucide-react";
import type { Agent, DesktopStore, LlmProvider, ProviderType, UserProfile } from "@reader/shared";
import avatar01Raw from "./assets/avatars/lorelei-1777775032907.svg?raw";
import avatar02Raw from "./assets/avatars/lorelei-1777775031622.svg?raw";
import avatar03Raw from "./assets/avatars/lorelei-1777775029913.svg?raw";
import avatar04Raw from "./assets/avatars/lorelei-1777775028333.svg?raw";
import avatar05Raw from "./assets/avatars/lorelei-1777775026600.svg?raw";
import avatar06Raw from "./assets/avatars/lorelei-1777775024807.svg?raw";
import avatar07Raw from "./assets/avatars/lorelei-1777775022413.svg?raw";
import avatar08Raw from "./assets/avatars/lorelei-1777775020299.svg?raw";
import avatar09Raw from "./assets/avatars/lorelei-1777775017575.svg?raw";
import avatar10Raw from "./assets/avatars/lorelei-1777775015590.svg?raw";
import avatar11Raw from "./assets/avatars/lorelei-1777775014247.svg?raw";
import avatar12Raw from "./assets/avatars/lorelei-1777775012500.svg?raw";
import avatar13Raw from "./assets/avatars/lorelei-1777775010023.svg?raw";
import avatar14Raw from "./assets/avatars/lorelei-1777775007436.svg?raw";
import avatar15Raw from "./assets/avatars/lorelei-1777775004996.svg?raw";
import avatar16Raw from "./assets/avatars/lorelei-1777775003025.svg?raw";
import avatar17Raw from "./assets/avatars/lorelei-1777775001230.svg?raw";
import avatar18Raw from "./assets/avatars/lorelei-1777774999602.svg?raw";
import avatar19Raw from "./assets/avatars/lorelei-1777774980195.svg?raw";
import avatar20Raw from "./assets/avatars/lorelei-1777774975114.svg?raw";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Select } from "./components/ui/select";
import { Textarea } from "./components/ui/textarea";
import "./styles.css";

type SettingKey = "general" | "providers" | "agents";
type ProviderDraft = Partial<LlmProvider>;
type AgentDraft = Partial<Agent>;
type UserDraft = Partial<UserProfile>;

const agentAvatars = [
  avatar01Raw,
  avatar02Raw,
  avatar03Raw,
  avatar04Raw,
  avatar05Raw,
  avatar06Raw,
  avatar07Raw,
  avatar08Raw,
  avatar09Raw,
  avatar10Raw,
  avatar11Raw,
  avatar12Raw,
  avatar13Raw,
  avatar14Raw,
  avatar15Raw,
  avatar16Raw,
  avatar17Raw,
  avatar18Raw,
  avatar19Raw,
  avatar20Raw
].map((raw, index) => ({ id: `avatar-${index + 1}`, src: svgToDataUrl(raw) }));

const annotationColors = ["#f4c95d", "#8ab6d6", "#8fc7a3", "#d9a7c7", "#f2a65a", "#a7b8e8", "#c8b88a", "#e58f8a"];

const defaultUser: UserProfile = {
  id: "user_local",
  nickname: "我",
  username: "me",
  avatar: "",
  annotationColor: annotationColors[0],
  updatedAt: ""
};

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
  avatar: agentAvatars[0]?.src || "",
  annotationColor: annotationColors[1],
  soul: "你是一个克制、敏锐的结对阅读伙伴。优先回应用户正在讨论的文本，给出清晰、具体、可追问的判断。"
};

const emptyStore: DesktopStore = {
  user: defaultUser,
  providers: [],
  agents: []
};

function App() {
  const [store, setStore] = useState<DesktopStore>(emptyStore);
  const [activeSetting, setActiveSetting] = useState<SettingKey>("general");
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUser);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProvider);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(emptyAgent);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [testState, setTestState] = useState("");
  const [logPath, setLogPath] = useState("");

  useEffect(() => {
    const desktop = window.readerDesktop;
    if (!desktop) return;

    desktop.getState().then((nextStore) => {
      setStore(nextStore);
      setUserDraft(nextStore.user);
      if (nextStore.providers[0]) selectProvider(nextStore.providers[0]);
      if (nextStore.agents[0]) selectAgent(nextStore.agents[0]);
    });
    desktop.getLogPath().then(setLogPath);
  }, []);

  const providerOptions = useMemo(() => store.providers.map((provider) => ({ id: provider.id, label: provider.name })), [store.providers]);

  function selectProvider(provider: LlmProvider) {
    setSelectedProviderId(provider.id);
    setProviderDraft(provider);
    setTestState("");
  }

  function createProvider() {
    setSelectedProviderId(null);
    setProviderDraft(emptyProvider);
    setTestState("");
  }

  function selectAgent(agent: Agent) {
    setSelectedAgentId(agent.id);
    setAgentDraft(agent);
  }

  function createAgent() {
    setSelectedAgentId(null);
    setAgentDraft({ ...emptyAgent, providerId: store.providers[0]?.id || "" });
  }

  async function saveUserDraft() {
    if (!window.readerDesktop) return;
    const nextStore = await window.readerDesktop.saveUser(userDraft);
    setStore(nextStore);
    setUserDraft(nextStore.user);
  }

  async function saveProviderDraft() {
    if (!window.readerDesktop) return;
    const nextStore = await window.readerDesktop.saveProvider(providerDraft);
    const savedProvider = providerDraft.id ? nextStore.providers.find((provider) => provider.id === providerDraft.id) : nextStore.providers.at(-1);
    setStore(nextStore);
    if (savedProvider) selectProvider(savedProvider);
  }

  async function deleteProvider(id: string) {
    if (!window.readerDesktop) return;
    const nextStore = await window.readerDesktop.deleteProvider(id);
    setStore(nextStore);
    const nextProvider = nextStore.providers[0];
    if (nextProvider) selectProvider(nextProvider);
    if (!nextProvider) createProvider();
    if (!nextStore.agents.some((agent) => agent.id === selectedAgentId)) {
      const nextAgent = nextStore.agents[0];
      if (nextAgent) selectAgent(nextAgent);
      if (!nextAgent) createAgent();
    }
  }

  async function testProvider(id: string) {
    if (!window.readerDesktop) return;
    setTestState("测试中...");
    const result = await window.readerDesktop.testProvider(id);
    setTestState(result.ok ? `连通成功：${result.message}` : `连通失败：${result.message}`);
  }

  async function saveAgentDraft() {
    if (!window.readerDesktop) return;
    const providerId = agentDraft.providerId || store.providers[0]?.id || "";
    const nextStore = await window.readerDesktop.saveAgent({ ...agentDraft, providerId });
    const savedAgent = agentDraft.id ? nextStore.agents.find((agent) => agent.id === agentDraft.id) : nextStore.agents.at(-1);
    setStore(nextStore);
    if (savedAgent) selectAgent(savedAgent);
  }

  async function deleteAgent(id: string) {
    if (!window.readerDesktop) return;
    const nextStore = await window.readerDesktop.deleteAgent(id);
    setStore(nextStore);
    const nextAgent = nextStore.agents[0];
    if (nextAgent) selectAgent(nextAgent);
    if (!nextAgent) createAgent();
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto grid min-h-screen max-w-7xl grid-cols-[260px_1fr] gap-5 px-6 py-7">
        <aside className="settings-sidebar">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Cable size={21} />
            </div>
            <div>
              <h1 className="text-lg font-black leading-tight">Reader Agent</h1>
              <p className="text-xs text-muted-foreground">127.0.0.1:43891</p>
            </div>
          </div>

          <nav className="grid gap-2">
            <SettingsNavButton active={activeSetting === "general"} icon={<User size={17} />} label="通用" onClick={() => setActiveSetting("general")} />
            <SettingsNavButton active={activeSetting === "providers"} icon={<KeyRound size={17} />} label="供应商" onClick={() => setActiveSetting("providers")} />
            <SettingsNavButton active={activeSetting === "agents"} icon={<Bot size={17} />} label="助手" onClick={() => setActiveSetting("agents")} />
          </nav>

          {logPath ? (
            <button className="mt-auto rounded-2xl border border-border bg-background/60 p-3 text-left text-xs leading-5 text-muted-foreground" type="button" onClick={() => navigator.clipboard.writeText(logPath)}>
              日志文件：{logPath}
            </button>
          ) : null}
        </aside>

        <section className="settings-content">
          {activeSetting === "general" ? <GeneralSettings draft={userDraft} onChange={setUserDraft} onSave={saveUserDraft} /> : null}
          {activeSetting === "providers" ? (
            <ProviderSettings
              draft={providerDraft}
              providers={store.providers}
              selectedId={selectedProviderId}
              testState={testState}
              onChange={setProviderDraft}
              onCreate={createProvider}
              onDelete={deleteProvider}
              onSave={saveProviderDraft}
              onSelect={selectProvider}
              onTest={testProvider}
            />
          ) : null}
          {activeSetting === "agents" ? (
            <AgentSettings
              agents={store.agents}
              draft={agentDraft}
              providers={providerOptions}
              selectedId={selectedAgentId}
              onChange={setAgentDraft}
              onCreate={createAgent}
              onDelete={deleteAgent}
              onSave={saveAgentDraft}
              onSelect={selectAgent}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function SettingsNavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={active ? "settings-nav-item is-active" : "settings-nav-item"} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function GeneralSettings({ draft, onChange, onSave }: { draft: UserDraft; onChange: (draft: UserDraft) => void; onSave: () => void }) {
  return (
    <div className="settings-panel">
      <PanelHeader icon={<User size={20} />} title="通用" description="配置用户头像、昵称和 username，后续批注会使用这组身份信息。" action={<Button type="button" onClick={onSave}><Save size={16} />保存</Button>} />
      <div className="settings-form-grid max-w-3xl">
        <div className="col-span-2 flex items-center gap-4">
          <AvatarImage value={draft.avatar || ""} className="size-20" fallback="我" />
          <ProfileAvatarEditor onChange={(avatar) => onChange({ ...draft, avatar })} />
        </div>
        <Field label="Nickname"><Input value={draft.nickname || ""} onChange={(event) => onChange({ ...draft, nickname: event.target.value })} /></Field>
        <Field label="Username"><Input value={draft.username || ""} onChange={(event) => onChange({ ...draft, username: event.target.value })} /></Field>
        <Field className="col-span-2" label="批注颜色"><ColorPicker value={draft.annotationColor || annotationColors[0]} onChange={(annotationColor) => onChange({ ...draft, annotationColor })} /></Field>
      </div>
    </div>
  );
}

function ProviderSettings({
  draft,
  providers,
  selectedId,
  testState,
  onChange,
  onCreate,
  onDelete,
  onSave,
  onSelect,
  onTest
}: {
  draft: ProviderDraft;
  providers: LlmProvider[];
  selectedId: string | null;
  testState: string;
  onChange: (draft: ProviderDraft) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  onSelect: (provider: LlmProvider) => void;
  onTest: (id: string) => void;
}) {
  return (
    <div className="settings-panel">
      <PanelHeader icon={<KeyRound size={20} />} title="供应商" description="管理 API 类型、Base URL、模型和 API Key。" />
      <div className="settings-detail-grid">
        <ConfigList title="已配置供应商" onCreate={onCreate}>
          {providers.map((provider) => (
            <button className={provider.id === selectedId ? "config-list-item is-plain is-active" : "config-list-item is-plain"} key={provider.id} type="button" onClick={() => onSelect(provider)}>
              <span className="min-w-0">
                <strong>{provider.name}</strong>
                <span>{provider.type} · {provider.modelName}</span>
              </span>
            </button>
          ))}
        </ConfigList>
        <section className="detail-pane">
          <div className="detail-pane-header">
            <div>
              <h3>{draft.id ? "编辑供应商" : "新增供应商"}</h3>
              <p>{draft.id ? "点击左侧其他供应商切换详情。" : "填写完成后保存到供应商列表。"}</p>
            </div>
            <div className="flex gap-2">
              {draft.id ? <Button variant="secondary" type="button" onClick={() => onTest(draft.id!)}>测试</Button> : null}
              {draft.id ? <Button variant="destructive" size="icon" type="button" onClick={() => onDelete(draft.id!)}><Trash2 size={15} /></Button> : null}
              <Button type="button" onClick={onSave}><Save size={16} />保存</Button>
            </div>
          </div>
          <ProviderForm draft={draft} onChange={onChange} />
          {testState ? <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">{testState}</p> : null}
        </section>
      </div>
    </div>
  );
}

function AgentSettings({
  agents,
  draft,
  providers,
  selectedId,
  onChange,
  onCreate,
  onDelete,
  onSave,
  onSelect
}: {
  agents: Agent[];
  draft: AgentDraft;
  providers: Array<{ id: string; label: string }>;
  selectedId: string | null;
  onChange: (draft: AgentDraft) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  onSelect: (agent: Agent) => void;
}) {
  return (
    <div className="settings-panel">
      <PanelHeader icon={<Bot size={20} />} title="助手" description="管理助手身份、头像、供应商和系统提示词。" />
      <div className="settings-detail-grid">
        <ConfigList title="已配置助手" onCreate={onCreate}>
          {agents.map((agent) => (
            <button className={agent.id === selectedId ? "config-list-item is-active" : "config-list-item"} key={agent.id} type="button" onClick={() => onSelect(agent)}>
              <AvatarImage value={agent.avatar} className="size-9" fallback="AI" />
              <span className="min-w-0">
                <strong>{agent.nickname}</strong>
                <span>@{agent.username}</span>
              </span>
            </button>
          ))}
        </ConfigList>
        <section className="detail-pane">
          <div className="detail-pane-header">
            <div>
              <h3>{draft.id ? "编辑助手" : "新增助手"}</h3>
              <p>{providers.length > 0 ? "头像从内置 SVG 里选择。" : "先配置供应商，再保存助手。"}</p>
            </div>
            <div className="flex gap-2">
              {draft.id ? <Button variant="destructive" size="icon" type="button" onClick={() => onDelete(draft.id!)}><Trash2 size={15} /></Button> : null}
              <Button disabled={providers.length === 0} type="button" onClick={onSave}><Save size={16} />保存</Button>
            </div>
          </div>
          <AgentForm draft={draft} providers={providers} onChange={onChange} />
        </section>
      </div>
    </div>
  );
}

function ConfigList({ title, children, onCreate }: { title: string; children: React.ReactNode; onCreate: () => void }) {
  return (
    <aside className="config-list">
      <div className="config-list-title">{title}</div>
      <div className="grid gap-2 overflow-auto pr-1">{children}</div>
      <Button className="mt-auto w-full" type="button" onClick={onCreate}><Plus size={17} />新增</Button>
    </aside>
  );
}

function PanelHeader({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="panel-header">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">{icon}</div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

function ProviderForm({ draft, onChange }: { draft: ProviderDraft; onChange: (draft: ProviderDraft) => void }) {
  return (
    <div className="settings-form-grid">
      <Field label="名称"><Input value={draft.name || ""} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field>
      <Field label="API 类型">
        <Select value={draft.type || "anthropic"} onChange={(event) => onChange({ ...draft, type: event.target.value as ProviderType })}>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </Select>
      </Field>
      <Field label="Base URL"><Input value={draft.baseUrl || ""} onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })} /></Field>
      <Field label="模型"><Input value={draft.modelName || ""} onChange={(event) => onChange({ ...draft, modelName: event.target.value })} /></Field>
      <Field className="col-span-2" label="API Key"><SecretInput value={draft.apiKey || ""} onChange={(apiKey) => onChange({ ...draft, apiKey })} /></Field>
    </div>
  );
}

function AgentForm({ draft, providers, onChange }: { draft: AgentDraft; providers: Array<{ id: string; label: string }>; onChange: (draft: AgentDraft) => void }) {
  return (
    <div className="settings-form-grid">
      <Field label="供应商">
        <Select value={draft.providerId || providers[0]?.id || ""} onChange={(event) => onChange({ ...draft, providerId: event.target.value })}>
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
        </Select>
      </Field>
      <Field label="Nickname"><Input value={draft.nickname || ""} onChange={(event) => onChange({ ...draft, nickname: event.target.value })} /></Field>
      <Field label="Username"><Input value={draft.username || ""} onChange={(event) => onChange({ ...draft, username: event.target.value })} /></Field>
      <Field className="col-span-2" label="批注颜色"><ColorPicker value={draft.annotationColor || annotationColors[1]} onChange={(annotationColor) => onChange({ ...draft, annotationColor })} /></Field>
      <Field className="col-span-2" label="头像">
        <div className="avatar-grid">
          {agentAvatars.map((avatar) => (
            <button className={draft.avatar === avatar.src ? "avatar-choice is-active" : "avatar-choice"} key={avatar.id} type="button" onClick={() => onChange({ ...draft, avatar: avatar.src })}>
              <img alt="" src={avatar.src} />
            </button>
          ))}
        </div>
      </Field>
      <Field className="col-span-2" label="Soul"><Textarea value={draft.soul || ""} onChange={(event) => onChange({ ...draft, soul: event.target.value })} /></Field>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="color-picker">
      <div className="color-swatches">
        {annotationColors.map((color) => (
          <button className={value === color ? "color-swatch is-active" : "color-swatch"} key={color} style={{ backgroundColor: color }} type="button" aria-label={`选择颜色 ${color}`} onClick={() => onChange(color)} />
        ))}
      </div>
      <Input className="max-w-36" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SecretInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input className="pr-12" type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} />
      <button className="secret-toggle" type="button" aria-label={visible ? "隐藏 API Key" : "显示 API Key"} onClick={() => setVisible((next) => !next)}>
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

function ProfileAvatarEditor({ onChange }: { onChange: (avatar: string) => void }) {
  async function loadFile(file: File | undefined) {
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
  }

  return (
    <div className="grid gap-3">
      <label className="upload-button">
        <Upload size={16} />
        上传头像
        <input accept="image/*" type="file" onChange={(event) => loadFile(event.target.files?.[0])} />
      </label>
    </div>
  );
}

function AvatarImage({ value, fallback, className = "size-10" }: { value: string; fallback: string; className?: string }) {
  const image = isImageAvatar(value);
  const svg = isSvgAvatar(value);
  const classes = ["avatar-image", className, image ? "is-image" : "", svg ? "is-svg" : ""].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {image ? <img alt="" src={value} /> : <span>{value || fallback}</span>}
    </span>
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

function svgToDataUrl(raw: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
}

function isImageAvatar(value: string) {
  return value.startsWith("data:image/") || value.startsWith("blob:") || value.startsWith("http") || value.startsWith("/");
}

function isSvgAvatar(value: string) {
  return value.startsWith("data:image/svg+xml") || value.endsWith(".svg");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById("root")!).render(<App />);
