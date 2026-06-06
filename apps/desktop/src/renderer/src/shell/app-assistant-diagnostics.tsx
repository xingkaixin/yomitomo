import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Activity, CalendarIcon, ChevronDown, RefreshCw, Route } from 'lucide-react';
import type { Agent, LlmProvider } from '@yomitomo/shared';
import type {
  AssistantExecutionQueryInput,
  AssistantExecutionRun,
  AssistantExecutionSummary,
  AssistantExecutionSummaryGroup,
  AssistantExecutionTotals,
} from '../../../preload';
import { AvatarImage, PanelHeader } from './app-ui';
import { providerLogoMap } from '../settings/app-settings-provider-assets';
import { Button } from '../components/ui/button';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../components/ui/select';
import { useTranslation } from 'react-i18next';

type DiagnosticsProps = {
  agents: Agent[];
  providers: LlmProvider[];
};

type DiagnosticsFilters = {
  range: DateRange;
  agentId: string;
  providerModel: string;
  taskType: string;
  status: string;
  requestedMode: string;
  effectiveMode: string;
};

const allValue = '__all__';
type Translate = ReturnType<typeof useTranslation>['t'];

export function AiTraceSettingsPanel({ agents, providers }: DiagnosticsProps) {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState(defaultFilters);
  const [runs, setRuns] = useState<AssistantExecutionRun[]>([]);
  const [summary, setSummary] = useState<AssistantExecutionSummary | null>(null);
  const [expandedId, setExpandedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = useDiagnosticsOptions(runs, agents, providers, t);
  const agentById = useAgentMap(agents);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const query = queryInput(filters);
    setBusy(true);
    setError('');
    try {
      const [nextRuns, nextSummary] = await Promise.all([
        window.yomitomoDesktop.listAssistantExecutions(query),
        window.yomitomoDesktop.summarizeAssistantExecutions(query),
      ]);
      setRuns(nextRuns);
      setSummary(nextSummary);
      if (expandedId && !nextRuns.some((run) => run.id === expandedId)) setExpandedId('');
    } catch (nextError) {
      setError(errorMessage(nextError, t('diagnostics.traceReadFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel diagnostics-panel">
      <PanelHeader
        icon={<Route size={20} />}
        title={t('diagnostics.traceTitle')}
        description={t('diagnostics.traceDescription')}
      />
      <DiagnosticsToolbar
        filters={filters}
        options={options}
        showModeFilters
        busy={busy}
        onChange={setFilters}
        onRefresh={refresh}
      />
      <DiagnosticsSummaryCards locale={i18n.language} summary={summary} />
      {error ? <DiagnosticsStatus status="error" message={error} onRetry={refresh} /> : null}
      {!error && !busy && runs.length === 0 ? (
        <DiagnosticsStatus message={t('diagnostics.noRuns')} />
      ) : null}
      <div className="diagnostics-run-list" aria-label={t('diagnostics.runList')}>
        {runs.map((run) => (
          <section className="diagnostics-run-card" key={run.id}>
            <button
              className="diagnostics-run-header"
              type="button"
              onClick={() => setExpandedId(expandedId === run.id ? '' : run.id)}
            >
              <span className={`diagnostics-status-dot is-${run.status}`} aria-hidden="true" />
              <AgentIdentity agent={agentById.get(run.agentId)} fallbackName={agentName(run)}>
                <em>{formatDateTime(run.createdAt)}</em>
              </AgentIdentity>
              <span>{run.taskType}</span>
              <span>{run.effectiveMode}</span>
              <span>
                {run.providerName} / {run.modelName}
              </span>
              <span>{statusLabel(run)}</span>
              <span>{formatTokens(run.usage.totalTokens, i18n.language)}</span>
              <span>
                {formatCost(run.estimatedCostMicros, run.currency, t('diagnostics.missingCost'))}
              </span>
              <ChevronDown size={16} />
            </button>
            {expandedId === run.id ? <TraceRunDetails run={run} /> : null}
          </section>
        ))}
      </div>
    </div>
  );
}

const AI_USAGE_WINDOW_DAYS = 70;

export function AiUsagePanel({ agents }: { agents: Agent[] }) {
  const { t, i18n } = useTranslation();
  const [overview, setOverview] = useState<AssistantExecutionTotals | null>(null);
  const [byAgent, setByAgent] = useState<AssistantExecutionSummaryGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const agentById = useAgentMap(agents);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      const summary =
        await window.yomitomoDesktop.summarizeAssistantExecutions(recentWindowQuery());
      setOverview(summary.totals);
      setByAgent(summary.byAgent);
    } catch (nextError) {
      setError(errorMessage(nextError, t('diagnostics.usageReadFailed')));
    } finally {
      setBusy(false);
    }
  }

  const totals = overview || emptyTotals();
  return (
    <div className="stats-ai-usage">
      <div className="stats-ai-usage-bar">
        <p className="stats-ai-usage-caption">
          {t('diagnostics.usageCaption', { days: AI_USAGE_WINDOW_DAYS })}
        </p>
        <Button
          className={busy ? 'stats-ai-usage-refresh is-loading' : 'stats-ai-usage-refresh'}
          disabled={busy}
          type="button"
          variant="secondary"
          onClick={refresh}
        >
          <RefreshCw size={15} />
          {t('diagnostics.refresh')}
        </Button>
      </div>
      <div className="stats-start-overview">
        <section className="stats-status-card">
          <span>{t('diagnostics.estimatedCost')}</span>
          <strong>
            {formatCost(totals.estimatedCostMicros, 'USD', t('diagnostics.missingCost'))}
          </strong>
        </section>
        <section className="stats-status-card">
          <span>{t('diagnostics.totalTokens')}</span>
          <strong>{formatTokens(totals.usage.totalTokens, i18n.language)}</strong>
        </section>
        <section className="stats-status-card">
          <span>{t('diagnostics.callCount')}</span>
          <strong>{formatNumber(totals.runCount, i18n.language)}</strong>
        </section>
      </div>
      {totals.missingCostCount > 0 ? (
        <p className="stats-ai-usage-note">
          {t('diagnostics.missingCostNote', {
            count: formatNumber(totals.missingCostCount, i18n.language),
          })}
        </p>
      ) : null}
      <section className="stats-ai-usage-agents">
        <div className="stats-section-heading">
          <h3>{t('diagnostics.byAgent')}</h3>
          <p>{t('diagnostics.sortByEstimatedCost')}</p>
        </div>
        {error ? (
          <DiagnosticsStatus status="error" message={error} onRetry={refresh} />
        ) : byAgent.length === 0 ? (
          <DiagnosticsStatus
            message={
              busy
                ? t('diagnostics.loadingUsage')
                : t('diagnostics.noUsage', { days: AI_USAGE_WINDOW_DAYS })
            }
          />
        ) : (
          <div className="stats-ai-usage-list">
            {byAgent.map((group) => (
              <div className="stats-ai-usage-row" key={group.key}>
                <AgentIdentity agent={agentById.get(group.key)} fallbackName={group.label} />
                <div className="stats-ai-usage-metrics">
                  <span className="stats-ai-usage-metric">
                    <em>{t('diagnostics.call')}</em>
                    <strong>{formatNumber(group.runCount, i18n.language)}</strong>
                  </span>
                  <span className="stats-ai-usage-metric">
                    <em>{t('diagnostics.estimatedCost')}</em>
                    <strong>
                      {formatCost(group.estimatedCostMicros, 'USD', t('diagnostics.missingCost'))}
                    </strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DiagnosticsToolbar({
  filters,
  options,
  showModeFilters = false,
  busy,
  extraControl,
  onChange,
  onRefresh,
}: {
  filters: DiagnosticsFilters;
  options: DiagnosticsOptions;
  showModeFilters?: boolean;
  busy: boolean;
  extraControl?: React.ReactNode;
  onChange: (filters: DiagnosticsFilters) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="diagnostics-filter-panel">
      <div className="diagnostics-toolbar">
        <DateRangePicker
          value={filters.range}
          onChange={(range) => onChange({ ...filters, range })}
        />
        <FilterSelect
          label={t('diagnostics.assistant')}
          value={filters.agentId}
          options={options.agents}
          onChange={(agentId) => onChange({ ...filters, agentId })}
        />
        <FilterSelect
          label={t('diagnostics.model')}
          value={filters.providerModel}
          options={options.providerModels}
          contentClassName="diagnostics-provider-select-content"
          onChange={(providerModel) => onChange({ ...filters, providerModel })}
        />
        <FilterSelect
          label={t('diagnostics.task')}
          value={filters.taskType}
          options={options.taskTypes}
          onChange={(taskType) => onChange({ ...filters, taskType })}
        />
        <FilterSelect
          label={t('diagnostics.status')}
          value={filters.status}
          options={[
            { value: allValue, label: t('diagnostics.allStatus') },
            { value: 'success', label: 'success' },
            { value: 'fallback', label: 'fallback' },
            { value: 'error', label: 'error' },
          ]}
          onChange={(status) => onChange({ ...filters, status })}
        />
        {showModeFilters ? (
          <>
            <FilterSelect
              label={t('diagnostics.requestedMode')}
              value={filters.requestedMode}
              options={options.modes}
              onChange={(requestedMode) => onChange({ ...filters, requestedMode })}
            />
            <FilterSelect
              label={t('diagnostics.effectiveMode')}
              value={filters.effectiveMode}
              options={options.modes}
              onChange={(effectiveMode) => onChange({ ...filters, effectiveMode })}
            />
          </>
        ) : null}
        {extraControl}
        <Button
          className={busy ? 'diagnostics-refresh is-loading' : 'diagnostics-refresh'}
          disabled={busy}
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
          {t('diagnostics.query')}
        </Button>
      </div>
    </div>
  );
}

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="diagnostics-filter-field diagnostics-date-field">
      <span>{t('diagnostics.timeRange')}</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button className="diagnostics-date-trigger" variant="outline" type="button">
            <CalendarIcon size={15} />
            {dateRangeLabel(value, t)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="diagnostics-calendar-popover" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={value}
            onSelect={(range) => onChange(range || defaultDateRange())}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  contentClassName,
  onChange,
}: {
  label: string;
  value: string;
  options: DiagnosticsOption[];
  contentClassName?: string;
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find((option) => option.value === value) || options[0];
  return (
    <div className="diagnostics-filter-field">
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="diagnostics-select-trigger" aria-label={label}>
          <DiagnosticsOptionContent option={selectedOption} />
        </SelectTrigger>
        <SelectContent className={`diagnostics-select-content ${contentClassName || ''}`}>
          {options.map((option) => (
            <SelectItem className="diagnostics-select-item" key={option.value} value={option.value}>
              <DiagnosticsOptionContent option={option} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DiagnosticsSummaryCards({
  locale,
  summary,
}: {
  locale: string;
  summary: AssistantExecutionSummary | null;
}) {
  const { t } = useTranslation();
  const totals = summary?.totals || emptyTotals();
  return (
    <div className="diagnostics-summary-grid">
      <SummaryCard
        label={t('diagnostics.executions')}
        value={formatNumber(totals.runCount, locale)}
      />
      <SummaryCard
        label={t('diagnostics.status')}
        value={`${totals.successCount} / ${totals.fallbackCount} / ${totals.errorCount}`}
        hint="success / fallback / error"
      />
      <SummaryCard
        label={t('diagnostics.totalTokens')}
        value={formatTokens(totals.usage.totalTokens, locale)}
      />
      <SummaryCard
        label={t('diagnostics.estimatedTotalCost')}
        value={formatCost(totals.estimatedCostMicros, 'USD', t('diagnostics.missingCost'))}
      />
      <SummaryCard
        label={t('diagnostics.missingCost')}
        value={formatNumber(totals.missingCostCount, locale)}
      />
      <SummaryCard
        label={t('diagnostics.averageDuration')}
        value={formatDuration(totals.averageDurationMs)}
      />
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <section className="diagnostics-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <em>{hint}</em> : null}
    </section>
  );
}

function TraceRunDetails({ run }: { run: AssistantExecutionRun }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="diagnostics-run-details">
      <div className="diagnostics-usage-grid">
        <UsageCell label="input" locale={i18n.language} value={run.usage.inputTokens} />
        <UsageCell label="output" locale={i18n.language} value={run.usage.outputTokens} />
        <UsageCell label="cached" locale={i18n.language} value={run.usage.cachedInputTokens} />
        <UsageCell label="cache write" locale={i18n.language} value={run.usage.cacheWriteTokens} />
        <UsageCell label="reasoning" locale={i18n.language} value={run.usage.reasoningTokens} />
        <UsageCell label="total" locale={i18n.language} value={run.usage.totalTokens} />
      </div>
      {run.safeSteps.length > 0 ? (
        <div className="diagnostics-step-list">
          {run.safeSteps.map((step) => (
            <div className="diagnostics-step-row" key={`${run.id}:${step.stepIndex}`}>
              <strong>#{step.stepIndex}</strong>
              <span>{step.eventType}</span>
              <span>{step.toolName || ''}</span>
              <span>{formatDuration(step.latencyMs)}</span>
              <span>{t('diagnostics.results', { count: step.resultCount })}</span>
              <em>{step.failureReason || ''}</em>
            </div>
          ))}
        </div>
      ) : (
        <p className="diagnostics-muted">{t('diagnostics.noTraceSteps')}</p>
      )}
    </div>
  );
}

function UsageCell({ label, locale, value }: { label: string; locale: string; value: number }) {
  return (
    <span>
      <em>{label}</em>
      <strong>{formatTokens(value, locale)}</strong>
    </span>
  );
}

function DiagnosticsStatus({
  message,
  status,
  onRetry,
}: {
  message: string;
  status?: 'error';
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={status === 'error' ? 'diagnostics-status is-error' : 'diagnostics-status'}>
      <Activity size={16} />
      <span>{message}</span>
      {onRetry ? (
        <Button size="sm" variant="outline" type="button" onClick={onRetry}>
          {t('diagnostics.retry')}
        </Button>
      ) : null}
    </div>
  );
}

type DiagnosticsOption =
  | { value: string; label: string; kind?: 'plain' }
  | { value: string; label: string; kind: 'agent'; agent?: Agent }
  | { value: string; label: string; kind: 'provider'; provider?: LlmProvider };

type DiagnosticsOptions = {
  agents: DiagnosticsOption[];
  providerModels: DiagnosticsOption[];
  taskTypes: DiagnosticsOption[];
  modes: DiagnosticsOption[];
};

function useAgentMap(agents: Agent[]) {
  return useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
}

function AgentIdentity({
  agent,
  fallbackName,
  children,
}: {
  agent?: Agent;
  fallbackName: string;
  children?: React.ReactNode;
}) {
  const name = agent?.nickname || fallbackName;
  const fallback = (name || agent?.username || '?').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <span className="diagnostics-agent-identity">
      <AvatarImage
        className="diagnostics-agent-avatar"
        fallback={fallback}
        value={agent?.avatar || fallback}
      />
      <span className="diagnostics-agent-copy">
        <strong>{name}</strong>
        {children}
      </span>
    </span>
  );
}

function DiagnosticsOptionContent({ option }: { option?: DiagnosticsOption }) {
  if (!option) return <span className="diagnostics-option-label" />;
  if (option.kind === 'agent') {
    return <AgentIdentity agent={option.agent} fallbackName={option.label} />;
  }
  if (option.kind === 'provider') {
    return <ProviderIdentity provider={option.provider} fallbackName={option.label} />;
  }
  return <span className="diagnostics-option-label">{option.label}</span>;
}

function ProviderIdentity({
  provider,
  fallbackName,
}: {
  provider?: LlmProvider;
  fallbackName: string;
}) {
  const name = provider?.name || fallbackName;
  const logo = provider?.logo ? providerLogoMap[provider.logo] : undefined;
  return (
    <span className="diagnostics-provider-identity">
      {logo ? (
        <img className="diagnostics-provider-logo" src={logo} alt="" />
      ) : (
        <span className="diagnostics-provider-logo" aria-hidden="true">
          {name.trim().slice(0, 1).toUpperCase() || '?'}
        </span>
      )}
      <span className="diagnostics-provider-name">{name}</span>
    </span>
  );
}

function useDiagnosticsOptions(
  runs: AssistantExecutionRun[],
  agents: Agent[],
  providers: LlmProvider[],
  t: Translate,
): DiagnosticsOptions {
  return useMemo(() => {
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const providerModels = uniqueOptions([
      ...providers.map((provider) => ({
        value: providerModelValue(provider.id, ''),
        label: provider.name,
        kind: 'provider' as const,
        provider,
      })),
      ...runs.map((run) => ({
        value: providerModelValue(run.providerId, ''),
        label: run.providerName,
        kind: 'provider' as const,
        provider: providerById.get(run.providerId),
      })),
    ]);
    return {
      agents: [
        { value: allValue, label: t('diagnostics.allAssistants') },
        ...agents.map((agent) => ({
          value: agent.id,
          label: agent.nickname,
          kind: 'agent' as const,
          agent,
        })),
      ],
      providerModels: [{ value: allValue, label: t('diagnostics.allModels') }, ...providerModels],
      taskTypes: uniqueOptions([
        { value: allValue, label: t('diagnostics.allTasks') },
        { value: 'annotation', label: 'annotation' },
        { value: 'selection_first', label: 'selection_first' },
        { value: 'co_reading_section', label: 'co_reading_section' },
        { value: 'thread_reply', label: 'thread_reply' },
        { value: 'create_thought', label: 'create_thought' },
        { value: 'distillation_review', label: 'distillation_review' },
        ...runs.map((run) => ({ value: run.taskType, label: run.taskType })),
      ]),
      modes: [
        { value: allValue, label: t('diagnostics.allModes') },
        { value: 'fast_response', label: 'fast_response' },
        { value: 'deep_verification', label: 'deep_verification' },
      ],
    };
  }, [agents, providers, runs, t]);
}

function queryInput(filters: DiagnosticsFilters): AssistantExecutionQueryInput {
  const [providerId, modelName] =
    filters.providerModel === allValue ? ['', ''] : filters.providerModel.split('::');
  const from = filters.range.from || addDays(new Date(), -6);
  const to = filters.range.to || new Date();
  return {
    from: startOfDayIso(from),
    to: endOfDayIso(to),
    agentId: emptyIfAll(filters.agentId),
    providerId: providerId || undefined,
    modelName: modelName || undefined,
    taskType: emptyIfAll(filters.taskType),
    status:
      filters.status === allValue
        ? 'all'
        : (filters.status as AssistantExecutionQueryInput['status']),
    requestedMode: emptyIfAll(filters.requestedMode),
    effectiveMode: emptyIfAll(filters.effectiveMode),
    limit: 200,
  };
}

function defaultFilters(): DiagnosticsFilters {
  return {
    range: defaultDateRange(),
    agentId: allValue,
    providerModel: allValue,
    taskType: allValue,
    status: allValue,
    requestedMode: allValue,
    effectiveMode: allValue,
  };
}

function defaultDateRange(): DateRange {
  return { from: addDays(new Date(), -6), to: new Date() };
}

function recentWindowQuery(): AssistantExecutionQueryInput {
  return {
    from: startOfDayIso(addDays(new Date(), -(AI_USAGE_WINDOW_DAYS - 1))),
    to: endOfDayIso(new Date()),
    status: 'all',
  };
}

function emptyTotals(): AssistantExecutionSummary['totals'] {
  return {
    runCount: 0,
    successCount: 0,
    fallbackCount: 0,
    errorCount: 0,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
    },
    estimatedCostMicros: 0,
    missingCostCount: 0,
  };
}

function uniqueOptions<T extends { value: string; label: string }>(options: T[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function providerModelValue(providerId: string, modelName: string) {
  return `${providerId}::${modelName}`;
}

function emptyIfAll(value: string) {
  return value === allValue ? undefined : value;
}

function startOfDayIso(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.toISOString();
}

function endOfDayIso(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next.toISOString();
}

function dateRangeLabel(range: DateRange, t: Translate) {
  if (!range.from) return t('diagnostics.chooseTimeRange');
  if (!range.to) return format(range.from, 'yyyy/MM/dd');
  return `${format(range.from, 'yyyy/MM/dd')} - ${format(range.to, 'yyyy/MM/dd')}`;
}

function agentName(run: AssistantExecutionRun) {
  return run.agentNickname || (run.agentUsername ? `@${run.agentUsername}` : run.agentId);
}

function statusLabel(run: AssistantExecutionRun) {
  return run.fallbackReason ? `${run.status}: ${run.fallbackReason}` : run.status;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, 'yyyy/MM/dd HH:mm');
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function formatTokens(value: number, locale: string) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value, locale);
}

function formatCost(value: number | undefined, currency: string | undefined, missingLabel: string) {
  if (value === undefined) return missingLabel;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 6,
  }).format(value / 1_000_000);
}

function formatDuration(value: number | undefined) {
  if (value === undefined) return '-';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
