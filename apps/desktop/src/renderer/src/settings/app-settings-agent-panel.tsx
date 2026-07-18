import React, { useEffect, useState } from 'react';
import { BookOpen, Bot, Eye, EyeOff, Settings2, ShieldCheck, X } from 'lucide-react';
import type { Agent, AgentKind, AppSettings, LlmProvider, UiLanguage } from '@yomitomo/shared';
import { agentPersonalities, normalizeUiLanguage } from '@yomitomo/shared';
import {
  elementDialogSourceRect,
  useSourceAwareDialogTransition,
  type DialogSourceRect,
} from '../shell/app-dialog-transition';
import { useTranslation } from 'react-i18next';
import {
  agentPersonalityName,
  annotationColors,
  annotationDensityOptions,
  findAgentPersonalityId,
  localizedPersonalityForAgent,
  personalitiesForKind,
  type AgentDraft,
} from './app-settings';
import { resolveAgentPersonaAssets } from './agent-persona-assets';
import { ColorPicker } from './app-settings-color-picker';
import { AvatarImage } from '../shell/app-ui';
import type { SaveState } from '../shell/app-types';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '../components/ui/dialog';
import { Field } from '../components/ui/field';
import { IconButton } from '../components/ui/icon-button';
import { SegmentedControl } from '../components/ui/segmented-control';

type AgentFilter = AgentKind;
type AgentPresenceLine = { enter: string; rest: string };
type AgentCardModel = { agent: Agent; persisted: boolean };
type AgentLineCue = {
  agentId: string;
  id: string;
  state: 'enter' | 'rest';
  text: string;
};

const agentFilterOptions: Array<{ value: AgentFilter }> = [
  { value: 'annotation' },
  { value: 'review' },
];
type Translate = ReturnType<typeof useTranslation>['t'];

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

const defaultAgentPresenceLine: AgentPresenceLine = {
  enter: '我在，陪你慢慢看。',
  rest: '我先休息一下，有需要再叫我。',
};

const defaultAgentPresenceLines: Record<UiLanguage, AgentPresenceLine> = {
  'zh-CN': defaultAgentPresenceLine,
  en: {
    enter: "I'm here. Let's read this through.",
    rest: "I'll step back for now.",
  },
};

const agentPresenceLineMap: Record<UiLanguage, Partial<Record<string, AgentPresenceLine>>> = {
  'zh-CN': {
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
  },
  en: {
    'reading-partner': {
      enter: "I'm in the margin.",
      rest: "I'll leave the margin to you.",
    },
    'root-reviewer': {
      enter: 'Pencil ready. Let me take it apart.',
      rest: 'The set square is down for now.',
    },
    'question-mentor': {
      enter: "I'm here. Let's find the next question.",
      rest: "I'll leave the questions waiting.",
    },
    'insight-editor': {
      enter: "I'll gather the useful threads.",
      rest: 'The usable lines are saved.',
    },
    'concept-translator': {
      enter: "I'm here. Point me at the unclear term.",
      rest: 'Clear enough for now.',
    },
    'structure-navigator': {
      enter: 'Map open. I will keep the route visible.',
      rest: 'Navigation is off for now.',
    },
    'evidence-archivist': {
      enter: "Hand me the material. I'll trace it back.",
      rest: 'The ledger is squared.',
    },
    'reader-advocate': {
      enter: "I'll watch for what the reader cared about.",
      rest: 'The important traces are kept.',
    },
    'final-copy-editor': {
      enter: 'Red pen ready. I hope I barely need it.',
      rest: 'This can survive.',
    },
    'logic-auditor': {
      enter: 'Show me the reasoning chain.',
      rest: 'The gaps are marked.',
    },
    'risk-examiner': {
      enter: 'Before action, let me ask about the boundary.',
      rest: 'The boundaries are marked.',
    },
    'action-calibrator': {
      enter: "Let's make the next step executable.",
      rest: 'The doable version is ready.',
    },
  },
};

function agentPresenceLine(agent: Agent, nextEnabled: boolean, uiLanguage: UiLanguage) {
  const personalityId = agent.presetId || findAgentPersonalityId(agent.soul);
  const lines =
    agentPresenceLineMap[uiLanguage][personalityId] || defaultAgentPresenceLines[uiLanguage];
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

function routeNoticeCopy(filter: AgentFilter, hasProviders: boolean, t: Translate) {
  if (!hasProviders) {
    return {
      title: t('settings.agents.routeNotice.noProviderTitle'),
      description: t('settings.agents.routeNotice.noProviderDescription'),
    };
  }

  return {
    title: t('settings.agents.routeNotice.noRouteTitle', {
      mode: t(`settings.agents.modes.${filter}`),
    }),
    description: t('settings.agents.routeNotice.noRouteDescription'),
  };
}

function previewAgentsForFilter(filter: AgentFilter, uiLanguage: UiLanguage): AgentCardModel[] {
  return personalitiesForKind(filter, uiLanguage).map((personality) => ({
    agent: {
      id: `agent_preview_${personality.id}`,
      kind: personality.kind,
      presetId: personality.id,
      enabled: personality.defaultEnabled,
      providerId: '',
      nickname: personality.name,
      username: personality.name,
      avatar:
        resolveAgentPersonaAssets(uiLanguage, personality.id)?.avatar ||
        personality.name.slice(0, 1),
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

function visibleAgentsForFilter(
  agents: Agent[],
  filter: AgentFilter,
  uiLanguage: UiLanguage,
): AgentCardModel[] {
  const filteredAgents = agents
    .filter((agent) => (agent.kind || 'annotation') === filter)
    .map((agent) => ({ agent, persisted: true }));

  return filteredAgents.length > 0 ? filteredAgents : previewAgentsForFilter(filter, uiLanguage);
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
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AgentFilter>('annotation');
  const [lineCue, setLineCue] = useState<AgentLineCue | null>(null);
  const [detail, setDetail] = useState<{ agent: Agent; sourceRect: DialogSourceRect } | null>(null);
  const uiLanguage = normalizeUiLanguage(settings.uiLanguage);
  const visibleAgents = visibleAgentsForFilter(agents, filter, uiLanguage);
  const routeConfigured = hasAgentRoute(settings, providers, filter);
  const routeNotice = routeConfigured ? null : routeNoticeCopy(filter, providers.length > 0, t);
  const emptyKindLabel = t(`settings.agents.kindLabels.${filter}`);

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
      text: agentPresenceLine(agent, nextEnabled, uiLanguage),
    });
    onToggle(agent);
  }

  return (
    <div className="settings-panel agent-settings-panel">
      <header className="agent-library-header">
        <div>
          <h2>{t('settings.agents.title')}</h2>
          <p>{t('settings.agents.subtitle')}</p>
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
              {t('settings.agents.configureRoutes')}
            </Button>
          </div>
        ) : null}
        <div className="agent-card-list">
          {visibleAgents.length === 0 ? (
            <div className="agent-list-empty">
              <Bot size={22} />
              <strong>{t('settings.agents.emptyTitle', { kind: emptyKindLabel })}</strong>
              <p>{t('settings.agents.emptyDescription')}</p>
            </div>
          ) : (
            visibleAgents.map(({ agent, persisted }) => (
              <AgentProfileListCard
                agent={agent}
                canToggle={routeConfigured && persisted}
                key={agent.id}
                lineCue={lineCue?.agentId === agent.id ? lineCue : null}
                uiLanguage={uiLanguage}
                onOpenDetail={(detailAgent, sourceRect) =>
                  setDetail({ agent: detailAgent, sourceRect })
                }
                onToggle={handleAgentToggle}
              />
            ))
          )}
        </div>
      </section>
      {detail ? (
        <AgentProfileDetailDialog
          agent={detail.agent}
          sourceRect={detail.sourceRect}
          uiLanguage={uiLanguage}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

type AgentProfileFields = {
  cover: string | undefined;
  avatar: string;
  intro: string;
  motto: string;
  roleTitle: string;
  pronunciation: string;
  displayName: string;
};

function resolveAgentProfileFields(agent: Agent, uiLanguage: UiLanguage): AgentProfileFields {
  const personalityName = agentPersonalityName(agent, uiLanguage);
  const personality = localizedPersonalityForAgent(agent, uiLanguage);
  const assets = resolveAgentPersonaAssets(uiLanguage, personality?.id);
  return {
    cover: assets?.cover,
    avatar: assets?.avatar || agent.avatar,
    intro: personality?.selfIntroduction || personality?.introduction || '',
    motto: personality?.description || personalityName,
    roleTitle: personality?.roleTitle || personalityName,
    pronunciation:
      uiLanguage === 'zh-CN' && personality ? agentPronunciationMap[personality.id] || '' : '',
    displayName: personality?.name || agent.nickname,
  };
}

function AgentProfileListCard({
  agent,
  canToggle,
  lineCue,
  uiLanguage,
  onOpenDetail,
  onToggle,
}: {
  agent: Agent;
  canToggle: boolean;
  lineCue: AgentLineCue | null;
  uiLanguage: UiLanguage;
  onOpenDetail: (agent: Agent, sourceRect: DialogSourceRect) => void;
  onToggle: (agent: Agent) => void;
}) {
  const { t } = useTranslation();
  const { cover, avatar, motto, roleTitle, pronunciation, displayName } = resolveAgentProfileFields(
    agent,
    uiLanguage,
  );

  const enabled = canToggle && agent.enabled;
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
      <div className="agent-list-photo">
        {roleTitle ? <span className="agent-list-role-badge">{roleTitle}</span> : null}
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
          <img
            className="agent-list-cover"
            src={cover}
            alt={t('settings.agents.coverAlt', { name: displayName })}
          />
        ) : (
          <div className="agent-list-cover is-placeholder">
            <AvatarImage value={avatar} className="size-16" fallback={displayName.slice(0, 1)} />
          </div>
        )}
        <div className="agent-list-nameplate">
          <span className="agent-list-name">{displayName}</span>
          {pronunciation ? <span className="agent-list-pinyin">{pronunciation}</span> : null}
        </div>
      </div>
      <div className="agent-list-text">
        {motto ? <blockquote className="agent-list-motto">{motto}</blockquote> : null}
        <div className="agent-list-footer">
          <button
            type="button"
            className="agent-list-detail-button"
            aria-label={t('settings.agents.detail.open', { name: displayName })}
            onClick={(event) => onOpenDetail(agent, elementDialogSourceRect(event.currentTarget))}
          >
            <BookOpen size={14} />
            {t('settings.agents.detail.introLabel')}
          </button>
          <label className={canToggle ? 'agent-card-toggle' : 'agent-card-toggle is-disabled'}>
            <input
              aria-label={
                canToggle
                  ? agent.enabled
                    ? t('settings.agents.toggleRest', { name: displayName })
                    : t('settings.agents.toggleJoin', { name: displayName })
                  : t('settings.agents.toggleNeedsRoute', { name: displayName })
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
      </div>
    </article>
  );
}

function AgentProfileDetailDialog({
  agent,
  sourceRect,
  uiLanguage,
  onClose,
}: {
  agent: Agent;
  sourceRect: DialogSourceRect;
  uiLanguage: UiLanguage;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogStyle = useSourceAwareDialogTransition(sourceRect);
  const { cover, avatar, intro, pronunciation, displayName } = resolveAgentProfileFields(
    agent,
    uiLanguage,
  );

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogPortal>
        <DialogOverlay className="agent-detail-overlay">
          <DialogContent
            aria-label={displayName}
            className="agent-detail-dialog source-aware-dialog"
            style={
              { ...dialogStyle, '--agent-accent': agent.annotationColor } as React.CSSProperties
            }
          >
            <IconButton
              className="agent-detail-close"
              aria-label={t('settings.agents.detail.close')}
              onClick={onClose}
            >
              <X size={18} />
            </IconButton>
            <div className="agent-detail-photo">
              {cover ? (
                <img
                  className="agent-detail-cover"
                  src={cover}
                  alt={t('settings.agents.coverAlt', { name: displayName })}
                />
              ) : (
                <div className="agent-detail-cover is-placeholder">
                  <AvatarImage
                    value={avatar}
                    className="size-20"
                    fallback={displayName.slice(0, 1)}
                  />
                </div>
              )}
              <div className="agent-list-nameplate">
                <span className="agent-list-name">{displayName}</span>
                {pronunciation ? <span className="agent-list-pinyin">{pronunciation}</span> : null}
              </div>
            </div>
            <div className="agent-detail-body">
              {intro ? <p className="agent-detail-intro">{intro}</p> : null}
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
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
  const { t } = useTranslation();
  const options = agentFilterOptions.map((option) => {
    const count = agents.filter((agent) => (agent.kind || 'annotation') === option.value).length;
    const visibleCount = count || personalitiesForKind(option.value).length;
    const Icon = option.value === 'annotation' ? BookOpen : ShieldCheck;

    return {
      value: option.value,
      ariaLabel: t(`settings.agents.modes.${option.value}`),
      label: (
        <>
          <Icon size={18} />
          <span>{t(`settings.agents.modes.${option.value}`)}</span>
          <strong>{visibleCount}</strong>
        </>
      ),
    };
  });

  return (
    <SegmentedControl
      aria-label={t('settings.agents.modeTabs')}
      className="agent-filter-tabs"
      optionClassName="agent-filter-tab"
      role="tablist"
      value={value}
      options={options}
      onValueChange={onChange}
    />
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
  const { t } = useTranslation();
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
            <span>{t(`settings.agents.kindLabels.${agentKind}`)}</span>
            <h4>{personality?.roleTitle || draft.nickname}</h4>
            <p>{personality?.introduction || t('settings.agents.form.choosePreset')}</p>
          </div>
        </div>
        {personality ? (
          <div className="agent-profile-scenes">
            <div>
              <strong>{t('settings.agents.form.portraitPrompt')}</strong>
              <p>{personality.portraitPrompt}</p>
            </div>
            <div>
              <strong>{t('settings.agents.form.scene')}</strong>
              <p>{personality.sceneDescription}</p>
            </div>
          </div>
        ) : null}
      </section>
      <Field
        className="col-span-2"
        id="agent-enabled"
        description={t('settings.agents.form.enabledDescription')}
        label={t('settings.agents.form.enabled')}
      >
        <button
          aria-pressed={Boolean(draft.enabled)}
          className={draft.enabled ? 'agent-enable-toggle is-enabled' : 'agent-enable-toggle'}
          type="button"
          onClick={() => onChange({ ...draft, enabled: !draft.enabled })}
        >
          {draft.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
          <span>
            {draft.enabled
              ? t('settings.agents.form.enabledOn')
              : t('settings.agents.form.enabledOff')}
          </span>
        </button>
      </Field>
      <Field
        id="agent-color"
        description={t('settings.agents.form.colorDescription')}
        label={
          agentKind === 'review'
            ? t('settings.agents.form.reviewColor')
            : t('settings.agents.form.annotationColor')
        }
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
          description={t('settings.agents.form.densityDescription')}
          label={t('settings.agents.form.density')}
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
                <strong>{t(`settings.agents.density.${option.value}.label`)}</strong>
                <span>{t(`settings.agents.density.${option.value}.description`)}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      {error ? <p className="form-error col-span-2">{error}</p> : null}
    </div>
  );
}
