import React, { useEffect, useState } from 'react';
import { BookOpen, Bot, Eye, EyeOff, Settings2, ShieldCheck } from 'lucide-react';
import type { Agent, AgentKind, AppSettings, LlmProvider } from '@yomitomo/shared';
import {
  agentKindLabel,
  agentPersonalities,
  agentPersonalityName,
  annotationColors,
  annotationDensityOptions,
  findAgentPersonalityId,
  personalitiesForKind,
  type AgentDraft,
} from './app-settings';
import chenYanshuCover from './assets/agent-profiles/chen-yanshu-cover.webp';
import guXingjianCover from './assets/agent-profiles/gu-xingjian-cover.webp';
import linZhiweiCover from './assets/agent-profiles/lin-zhiwei-cover.webp';
import shenQingyuanCover from './assets/agent-profiles/shen-qingyuan-cover.webp';
import xuWenquCover from './assets/agent-profiles/xu-wenqu-cover.webp';
import zhouYanCover from './assets/agent-profiles/zhou-yan-cover.webp';
import heMinghengCover from './assets/reviewer-profiles/he-mingheng-cover.webp';
import liangZhengyanCover from './assets/reviewer-profiles/liang-zhengyan-cover.webp';
import suDingbaiCover from './assets/reviewer-profiles/su-dingbai-cover.webp';
import tangJianCover from './assets/reviewer-profiles/tang-jian-cover.webp';
import xiaGuiningCover from './assets/reviewer-profiles/xia-guining-cover.webp';
import yeTinglanCover from './assets/reviewer-profiles/ye-tinglan-cover.webp';
import { ColorPicker } from './app-settings-color-picker';
import { AvatarImage, Field } from './app-ui';
import type { SaveState } from './app-types';
import { Button } from './components/ui/button';

type AgentFilter = AgentKind;
type AgentPresenceLine = { enter: string; rest: string };
type AgentCardModel = { agent: Agent; persisted: boolean };
type AgentLineCue = {
  agentId: string;
  id: string;
  state: 'enter' | 'rest';
  text: string;
};

const agentFilterOptions: Array<{ value: AgentFilter; label: string; agentLabel: string }> = [
  { value: 'annotation', label: '阅读理解', agentLabel: '阅读助手' },
  { value: 'review', label: '深度审阅', agentLabel: '审阅助手' },
];

const agentPronunciationMap: Record<string, string> = {
  'reading-partner': 'Lín Zhīwēi',
  'root-reviewer': 'Zhōu Yàn',
  'question-mentor': 'Xǔ Wènqú',
  'insight-editor': 'Chén Yànshū',
  'concept-translator': 'Shěn Qīngyuán',
  'structure-navigator': 'Gù Xíngjiǎn',
  'evidence-archivist': 'Liáng Zhèngyán',
  'reader-advocate': 'Yè Tīnglán',
  'final-copy-editor': 'Táng Jiǎn',
  'logic-auditor': 'Hé Mínghéng',
  'risk-examiner': 'Sū Dìngbái',
  'action-calibrator': 'Xià Guīníng',
};

const agentCoverMap: Record<string, string> = {
  'reading-partner': linZhiweiCover,
  'root-reviewer': zhouYanCover,
  'question-mentor': xuWenquCover,
  'insight-editor': chenYanshuCover,
  'concept-translator': shenQingyuanCover,
  'structure-navigator': guXingjianCover,
  'evidence-archivist': liangZhengyanCover,
  'reader-advocate': yeTinglanCover,
  'final-copy-editor': tangJianCover,
  'logic-auditor': heMinghengCover,
  'risk-examiner': suDingbaiCover,
  'action-calibrator': xiaGuiningCover,
};

const defaultAgentPresenceLine: AgentPresenceLine = {
  enter: '我在，陪你慢慢看。',
  rest: '我先休息一下，有需要再叫我。',
};

const agentPresenceLineMap: Partial<Record<string, AgentPresenceLine>> = {
  'reading-partner': {
    enter: '我在，陪你慢慢看。',
    rest: '先走了，你继续读。',
  },
  'root-reviewer': {
    enter: '铅笔备好了，开始拆。',
    rest: '三角尺放下了，回头见。',
  },
  'question-mentor': {
    enter: '来了，看看哪里值得停一下。',
    rest: '问题先存着，想好了再聊。',
  },
  'insight-editor': {
    enter: '我来收拾，散的交给我。',
    rest: '线索收好了，用的时候翻。',
  },
  'concept-translator': {
    enter: '在的，哪里读不顺跟我说。',
    rest: '撤了，顺了就好。',
  },
  'structure-navigator': {
    enter: '地图打开了，不会让你迷路。',
    rest: '导航关了，路你已经认得。',
  },
  'evidence-archivist': {
    enter: '把材料交过来，我逐条对。',
    rest: '账清了，经得起查。',
  },
  'reader-advocate': {
    enter: '我看看你的困惑有没有被漏掉。',
    rest: '该留的都在了，撤了。',
  },
  'final-copy-editor': {
    enter: '红笔带了，希望用不上。',
    rest: '能存了。',
  },
  'logic-auditor': {
    enter: '给我看看你的推理链。',
    rest: '缝隙标完了，改不改你定。',
  },
  'risk-examiner': {
    enter: '动手之前，先让我问几句。',
    rest: '边界画完了，出了线别怪我。',
  },
  'action-calibrator': {
    enter: '看看你的"接下来"能不能落地。',
    rest: '能执行的都改好了，直接用。',
  },
};

function agentPresenceLine(agent: Agent, nextEnabled: boolean) {
  const personalityId = agent.presetId || findAgentPersonalityId(agent.soul);
  const lines = agentPresenceLineMap[personalityId] || defaultAgentPresenceLine;
  return nextEnabled ? lines.enter : lines.rest;
}

function agentRouteProviderId(settings: AppSettings, filter: AgentFilter) {
  return filter === 'review'
    ? settings.reviewAssistantProviderId
    : settings.readingAssistantProviderId;
}

function hasAgentRoute(settings: AppSettings, providers: LlmProvider[], filter: AgentFilter) {
  const providerId = agentRouteProviderId(settings, filter);
  return Boolean(providerId && providers.some((provider) => provider.id === providerId));
}

function routeNoticeCopy(filter: AgentFilter, hasProviders: boolean) {
  const modeLabel = agentFilterOptions.find((option) => option.value === filter)?.label || '助手';

  if (!hasProviders) {
    return {
      title: '先连接模型供应商',
      description:
        '这些助手资料可以先浏览。要让他们真正参与阅读，需要在模型与路由里添加供应商并分配任务路由。',
    };
  }

  return {
    title: `还没有配置${modeLabel}模型路由`,
    description: '这些助手会先展示在这里。选择模型供应商后，就可以在阅读中使用当前模式。',
  };
}

function previewAgentsForFilter(filter: AgentFilter): AgentCardModel[] {
  return personalitiesForKind(filter).map((personality) => ({
    agent: {
      id: `agent_preview_${personality.id}`,
      kind: personality.kind,
      presetId: personality.id,
      enabled: personality.defaultEnabled,
      providerId: '',
      nickname: personality.name,
      username: personality.name,
      avatar: personality.name.slice(0, 1),
      annotationColor: personality.defaultColor,
      annotationDensity: 'medium',
      temperature: personality.temperature,
      soul: personality.soul,
      createdAt: '',
      updatedAt: '',
    },
    persisted: false,
  }));
}

function visibleAgentsForFilter(agents: Agent[], filter: AgentFilter): AgentCardModel[] {
  const filteredAgents = agents
    .filter((agent) => (agent.kind || 'annotation') === filter)
    .map((agent) => ({ agent, persisted: true }));

  return filteredAgents.length > 0 ? filteredAgents : previewAgentsForFilter(filter);
}

export function AgentSettings({
  agents,
  error,
  providers,
  settings,
  onConfigureRoutes,
  onToggle,
}: {
  agents: Agent[];
  error: string;
  providers: LlmProvider[];
  settings: AppSettings;
  saveState: SaveState;
  onConfigureRoutes: () => void;
  onToggle: (agent: Agent) => void;
}) {
  const [filter, setFilter] = useState<AgentFilter>('annotation');
  const [lineCue, setLineCue] = useState<AgentLineCue | null>(null);
  const visibleAgents = visibleAgentsForFilter(agents, filter);
  const routeConfigured = hasAgentRoute(settings, providers, filter);
  const routeNotice = routeConfigured ? null : routeNoticeCopy(filter, providers.length > 0);
  const currentMode = agentFilterOptions.find((option) => option.value === filter);
  const emptyKindLabel = currentMode?.agentLabel || agentKindLabel(filter);

  useEffect(() => {
    if (!lineCue) return;

    const timeoutId = window.setTimeout(() => {
      setLineCue((current) => (current?.id === lineCue.id ? null : current));
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [lineCue]);

  function handleAgentToggle(agent: Agent) {
    const nextEnabled = !agent.enabled;
    setLineCue({
      agentId: agent.id,
      id: `${agent.id}-${nextEnabled ? 'enter' : 'rest'}-${Date.now()}`,
      state: nextEnabled ? 'enter' : 'rest',
      text: agentPresenceLine(agent, nextEnabled),
    });
    onToggle(agent);
  }

  return (
    <div className="settings-panel agent-settings-panel">
      <header className="agent-library-header">
        <div>
          <h2>今天陪你思考的人</h2>
          <p>不同模式，不同视角，组成你专属的思考团队。</p>
        </div>
      </header>
      <section className="agent-library">
        <div className="agent-library-toolbar">
          <AgentFilterTabs agents={agents} value={filter} onChange={setFilter} />
          {error ? (
            <div className="agent-error-status" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        {routeNotice ? (
          <div className="agent-route-notice">
            <span>
              <Settings2 size={18} />
            </span>
            <div>
              <strong>{routeNotice.title}</strong>
              <p>{routeNotice.description}</p>
            </div>
            <Button
              className="action-button agent-route-configure"
              size="sm"
              type="button"
              onClick={onConfigureRoutes}
            >
              <Settings2 size={15} />
              去配置模型与路由
            </Button>
          </div>
        ) : null}
        <div className="agent-card-list">
          {visibleAgents.length === 0 ? (
            <div className="agent-list-empty">
              <Bot size={22} />
              <strong>还没有{emptyKindLabel}</strong>
              <p>这里会展示可用于阅读理解和深度审阅的预设助手。</p>
            </div>
          ) : (
            visibleAgents.map(({ agent, persisted }) => (
              <AgentProfileListCard
                agent={agent}
                canToggle={routeConfigured && persisted}
                key={agent.id}
                lineCue={lineCue?.agentId === agent.id ? lineCue : null}
                onToggle={handleAgentToggle}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function AgentProfileListCard({
  agent,
  canToggle,
  lineCue,
  onToggle,
}: {
  agent: Agent;
  canToggle: boolean;
  lineCue: AgentLineCue | null;
  onToggle: (agent: Agent) => void;
}) {
  const personalityName = agentPersonalityName(agent);
  const personality = agentPersonalities.find(
    (item) => item.id === (agent.presetId || findAgentPersonalityId(agent.soul)),
  );
  const cover = personality ? agentCoverMap[personality.id] : undefined;
  const intro = personality?.selfIntroduction || personality?.introduction || '';
  const motto = personality?.description || personalityName;
  const roleTitle = personality?.roleTitle || personalityName;
  const pronunciation = personality ? agentPronunciationMap[personality.id] : '';

  const enabled = canToggle && agent.enabled;
  const statusLabel = canToggle ? (agent.enabled ? '在场' : '休息中') : '待配置';
  const statusClassName = !canToggle
    ? 'agent-list-status-badge is-pending'
    : agent.enabled
      ? 'agent-list-status-badge'
      : 'agent-list-status-badge is-resting';
  const cardClassName = [
    'agent-list-card',
    enabled ? 'is-enabled' : '',
    canToggle ? '' : 'needs-route',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={cardClassName}
      style={{ '--agent-accent': agent.annotationColor } as React.CSSProperties}
    >
      <div className="agent-list-body">
        <div className="agent-list-identity">
          <div className="agent-list-cover-frame">
            <span className={statusClassName}>{statusLabel}</span>
            {lineCue ? (
              <span
                className={
                  lineCue.state === 'enter'
                    ? 'agent-list-line-bubble is-entering'
                    : 'agent-list-line-bubble is-resting'
                }
                key={lineCue.id}
              >
                {lineCue.text}
              </span>
            ) : null}
            {cover ? (
              <img className="agent-list-cover" src={cover} alt={`${agent.nickname} 工作照`} />
            ) : (
              <div className="agent-list-cover is-placeholder">
                <AvatarImage
                  value={agent.avatar}
                  className="size-16"
                  fallback={agent.nickname.slice(0, 1)}
                />
              </div>
            )}
          </div>
          <div className="agent-list-heading">
            <div className="agent-list-name-row">
              <h3>{agent.nickname}</h3>
              {pronunciation ? <span>{pronunciation}</span> : null}
            </div>
            {motto ? <blockquote>{motto}</blockquote> : null}
          </div>
        </div>
        <div className="agent-list-content">
          {intro ? <p className="agent-list-intro">{intro}</p> : null}
        </div>
      </div>
      <div className="agent-list-footer">
        <span className="agent-list-role">{roleTitle}</span>
        <label className={canToggle ? 'agent-card-toggle' : 'agent-card-toggle is-disabled'}>
          <input
            aria-label={
              canToggle
                ? agent.enabled
                  ? `让${agent.nickname}先休息`
                  : `请${agent.nickname}加入`
                : `${agent.nickname}需要先配置模型路由`
            }
            type="checkbox"
            checked={canToggle && agent.enabled}
            disabled={!canToggle}
            onChange={() => {
              if (canToggle) onToggle(agent);
            }}
          />
          <span className="settings-toggle-switch" aria-hidden="true" />
        </label>
      </div>
    </article>
  );
}

function AgentFilterTabs({
  agents,
  value,
  onChange,
}: {
  agents: Agent[];
  value: AgentFilter;
  onChange: (value: AgentFilter) => void;
}) {
  return (
    <div className="agent-filter-tabs" role="tablist" aria-label="思考模式">
      {agentFilterOptions.map((option) => {
        const count = agents.filter(
          (agent) => (agent.kind || 'annotation') === option.value,
        ).length;
        const visibleCount = count || personalitiesForKind(option.value).length;
        const Icon = option.value === 'annotation' ? BookOpen : ShieldCheck;
        return (
          <button
            aria-label={option.label}
            aria-selected={value === option.value}
            className={value === option.value ? 'agent-filter-tab is-active' : 'agent-filter-tab'}
            key={option.value}
            role="tab"
            type="button"
            onClick={() => onChange(option.value)}
          >
            <Icon size={18} />
            <span>{option.label}</span>
            <strong>{visibleCount}</strong>
          </button>
        );
      })}
    </div>
  );
}

function moveOptionSelection<T extends string>(
  event: React.KeyboardEvent<HTMLElement>,
  values: T[],
  current: T,
  onSelect: (value: T) => void,
) {
  const keyOffset: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  };
  const currentIndex = Math.max(0, values.indexOf(current));
  let nextIndex = currentIndex;

  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = values.length - 1;
  else if (event.key in keyOffset) {
    nextIndex = (currentIndex + keyOffset[event.key] + values.length) % values.length;
  } else {
    return;
  }

  const nextValue = values[nextIndex];
  if (!nextValue) return;

  event.preventDefault();
  const target = event.currentTarget;
  onSelect(nextValue);
  requestAnimationFrame(() => {
    const radios = Array.from(target.querySelectorAll<HTMLElement>('[role="radio"]'));
    radios[nextIndex]?.focus();
  });
}

export function AgentForm({
  draft,
  error,
  onChange,
}: {
  draft: AgentDraft;
  error: string;
  onChange: (draft: AgentDraft) => void;
}) {
  const agentKind = draft.kind || 'annotation';
  const personality =
    agentPersonalities.find((item) => item.id === draft.presetId) ||
    agentPersonalities.find((item) => item.soul === draft.soul) ||
    personalitiesForKind(agentKind)[0];

  return (
    <div className="settings-form-grid">
      <section className="agent-profile-card col-span-2">
        <div className="agent-profile-hero">
          <AvatarImage
            value={draft.avatar || ''}
            className="size-20"
            fallback={draft.nickname?.slice(0, 1) || 'AI'}
          />
          <div>
            <span>{agentKindLabel(agentKind)}</span>
            <h4>{personality?.roleTitle || draft.nickname}</h4>
            <p>{personality?.introduction || '选择左侧预设助手查看介绍。'}</p>
          </div>
        </div>
        {personality ? (
          <div className="agent-profile-scenes">
            <div>
              <strong>工作照提示词</strong>
              <p>{personality.portraitPrompt}</p>
            </div>
            <div>
              <strong>工作场景</strong>
              <p>{personality.sceneDescription}</p>
            </div>
          </div>
        ) : null}
      </section>
      <Field
        className="col-span-2"
        id="agent-enabled"
        description="启用后，这位助手会进入对应的阅读或审核选择列表。"
        label="启用状态"
      >
        <button
          aria-pressed={Boolean(draft.enabled)}
          className={draft.enabled ? 'agent-enable-toggle is-enabled' : 'agent-enable-toggle'}
          type="button"
          onClick={() => onChange({ ...draft, enabled: !draft.enabled })}
        >
          {draft.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
          <span>{draft.enabled ? '已启用' : '未启用'}</span>
        </button>
      </Field>
      <Field
        id="agent-color"
        description="这些颜色已按阅读器高亮可见性筛选。"
        label={agentKind === 'review' ? '标识颜色' : '批注颜色'}
      >
        <ColorPicker
          colors={annotationColors}
          value={draft.annotationColor || annotationColors[1]}
          onChange={(annotationColor) => onChange({ ...draft, annotationColor })}
        />
      </Field>
      {agentKind === 'annotation' ? (
        <Field
          className="col-span-2"
          id="agent-annotation-density"
          description="决定助手主动批注时的积极程度，会影响提示词和模型采样。"
          label="批注密度"
        >
          <div
            aria-describedby="agent-annotation-density-description"
            aria-labelledby="agent-annotation-density-label"
            className="density-grid"
            role="radiogroup"
            onKeyDown={(event) =>
              moveOptionSelection(
                event,
                annotationDensityOptions.map((option) => option.value),
                draft.annotationDensity || 'medium',
                (annotationDensity) => onChange({ ...draft, annotationDensity }),
              )
            }
          >
            {annotationDensityOptions.map((option) => (
              <button
                aria-checked={(draft.annotationDensity || 'medium') === option.value}
                className={
                  (draft.annotationDensity || 'medium') === option.value
                    ? 'density-choice is-active'
                    : 'density-choice'
                }
                key={option.value}
                role="radio"
                tabIndex={(draft.annotationDensity || 'medium') === option.value ? 0 : -1}
                type="button"
                onClick={() => onChange({ ...draft, annotationDensity: option.value })}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      {error ? <p className="form-error col-span-2">{error}</p> : null}
    </div>
  );
}
