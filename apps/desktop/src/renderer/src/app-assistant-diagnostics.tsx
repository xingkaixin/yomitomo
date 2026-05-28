import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Activity, CalendarIcon, ChevronDown, DollarSign, RefreshCw, Route } from 'lucide-react';
import type { Agent, LlmProvider } from '@yomitomo/shared';
import type {
  AssistantExecutionQueryInput,
  AssistantExecutionRun,
  AssistantExecutionSummary,
  AssistantExecutionSummaryGroup,
} from '../../preload';
import { AvatarImage, PanelHeader } from './app-ui';
import { providerLogoMap } from './app-settings-provider-assets';
import { Button } from './components/ui/button';
import { Calendar } from './components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';

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

export function AiTraceSettingsPanel({ agents, providers }: DiagnosticsProps) {
  const [filters, setFilters] = useState(defaultFilters);
  const [runs, setRuns] = useState<AssistantExecutionRun[]>([]);
  const [summary, setSummary] = useState<AssistantExecutionSummary | null>(null);
  const [expandedId, setExpandedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = useDiagnosticsOptions(runs, agents, providers);
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
      setError(errorMessage(nextError, '读取助手调用链路失败。'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel diagnostics-panel">
      <PanelHeader
        icon={<Route size={20} />}
        title="助手调用链路"
        description="查看助手执行模式、状态、usage、成本估算和脱敏步骤，定位链路问题。"
      />
      <DiagnosticsToolbar
        filters={filters}
        options={options}
        showModeFilters
        busy={busy}
        onChange={setFilters}
        onRefresh={refresh}
      />
      <DiagnosticsSummaryCards summary={summary} />
      {error ? <DiagnosticsStatus status="error" message={error} onRetry={refresh} /> : null}
      {!error && !busy && runs.length === 0 ? (
        <DiagnosticsStatus message="当前时间范围没有助手执行记录。" />
      ) : null}
      <div className="diagnostics-run-list" aria-label="助手调用链路列表">
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
              <span>{formatTokens(run.usage.totalTokens)}</span>
              <span>{formatCost(run.estimatedCostMicros, run.currency)}</span>
              <ChevronDown size={16} />
            </button>
            {expandedId === run.id ? <TraceRunDetails run={run} /> : null}
          </section>
        ))}
      </div>
    </div>
  );
}

export function AgentCostSettingsPanel({ agents, providers }: DiagnosticsProps) {
  const [filters, setFilters] = useState(defaultFilters);
  const [summary, setSummary] = useState<AssistantExecutionSummary | null>(null);
  const [dimension, setDimension] = useState<CostDimension>('byAgent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const groups = summary?.[dimension] || [];
  const options = useDiagnosticsOptions([], agents, providers);
  const agentById = useAgentMap(agents);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setBusy(true);
    setError('');
    try {
      setSummary(await window.yomitomoDesktop.summarizeAssistantExecutions(queryInput(filters)));
    } catch (nextError) {
      setError(errorMessage(nextError, '读取用量与成本失败。'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-panel diagnostics-panel">
      <PanelHeader
        icon={<DollarSign size={20} />}
        title="用量与成本"
        description="按时间范围聚合 token、估算成本、价格缺失记录和平均耗时。"
      />
      <DiagnosticsToolbar
        filters={filters}
        options={options}
        busy={busy}
        extraControl={
          <DimensionSelect value={dimension} onChange={(value) => setDimension(value)} />
        }
        onChange={setFilters}
        onRefresh={refresh}
      />
      <DiagnosticsSummaryCards summary={summary} />
      {error ? <DiagnosticsStatus status="error" message={error} onRetry={refresh} /> : null}
      {!error && !busy && groups.length === 0 ? (
        <DiagnosticsStatus message="当前时间范围没有可聚合的助手执行记录。" />
      ) : null}
      <CostGroupsTable groups={groups} agentById={agentById} showAgents={dimension === 'byAgent'} />
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
  return (
    <div className="diagnostics-filter-panel">
      <div className="diagnostics-toolbar">
        <DateRangePicker
          value={filters.range}
          onChange={(range) => onChange({ ...filters, range })}
        />
        <FilterSelect
          label="助手"
          value={filters.agentId}
          options={options.agents}
          onChange={(agentId) => onChange({ ...filters, agentId })}
        />
        <FilterSelect
          label="模型"
          value={filters.providerModel}
          options={options.providerModels}
          contentClassName="diagnostics-provider-select-content"
          onChange={(providerModel) => onChange({ ...filters, providerModel })}
        />
        <FilterSelect
          label="任务"
          value={filters.taskType}
          options={options.taskTypes}
          onChange={(taskType) => onChange({ ...filters, taskType })}
        />
        <FilterSelect
          label="状态"
          value={filters.status}
          options={[
            { value: allValue, label: '全部状态' },
            { value: 'success', label: 'success' },
            { value: 'fallback', label: 'fallback' },
            { value: 'error', label: 'error' },
          ]}
          onChange={(status) => onChange({ ...filters, status })}
        />
        {showModeFilters ? (
          <>
            <FilterSelect
              label="请求模式"
              value={filters.requestedMode}
              options={options.modes}
              onChange={(requestedMode) => onChange({ ...filters, requestedMode })}
            />
            <FilterSelect
              label="实际模式"
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
          查询
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
  return (
    <div className="diagnostics-filter-field diagnostics-date-field">
      <span>时间范围</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button className="diagnostics-date-trigger" variant="outline" type="button">
            <CalendarIcon size={15} />
            {dateRangeLabel(value)}
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

type CostDimension = 'byAgent' | 'byProviderModel' | 'byTaskType' | 'byMode';

function DimensionSelect({
  value,
  onChange,
}: {
  value: CostDimension;
  onChange: (value: CostDimension) => void;
}) {
  return (
    <div className="diagnostics-filter-field">
      <span>分组</span>
      <Select value={value} onValueChange={(nextValue) => onChange(nextValue as CostDimension)}>
        <SelectTrigger className="diagnostics-select-trigger" aria-label="聚合维度">
          <SelectValue placeholder="聚合维度" />
        </SelectTrigger>
        <SelectContent className="diagnostics-select-content">
          <SelectItem className="diagnostics-select-item" value="byAgent">
            按助手
          </SelectItem>
          <SelectItem className="diagnostics-select-item" value="byProviderModel">
            按 provider/model
          </SelectItem>
          <SelectItem className="diagnostics-select-item" value="byTaskType">
            按任务类型
          </SelectItem>
          <SelectItem className="diagnostics-select-item" value="byMode">
            按执行模式
          </SelectItem>
        </SelectContent>
      </Select>
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

function DiagnosticsSummaryCards({ summary }: { summary: AssistantExecutionSummary | null }) {
  const totals = summary?.totals || emptyTotals();
  return (
    <div className="diagnostics-summary-grid">
      <SummaryCard label="执行数" value={formatNumber(totals.runCount)} />
      <SummaryCard
        label="状态"
        value={`${totals.successCount} / ${totals.fallbackCount} / ${totals.errorCount}`}
        hint="success / fallback / error"
      />
      <SummaryCard label="总 tokens" value={formatTokens(totals.usage.totalTokens)} />
      <SummaryCard label="估算成本" value={formatCost(totals.estimatedCostMicros, 'USD')} />
      <SummaryCard label="价格缺失" value={formatNumber(totals.missingCostCount)} />
      <SummaryCard label="平均耗时" value={formatDuration(totals.averageDurationMs)} />
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
  return (
    <div className="diagnostics-run-details">
      <div className="diagnostics-usage-grid">
        <UsageCell label="input" value={run.usage.inputTokens} />
        <UsageCell label="output" value={run.usage.outputTokens} />
        <UsageCell label="cached" value={run.usage.cachedInputTokens} />
        <UsageCell label="cache write" value={run.usage.cacheWriteTokens} />
        <UsageCell label="reasoning" value={run.usage.reasoningTokens} />
        <UsageCell label="total" value={run.usage.totalTokens} />
      </div>
      {run.safeSteps.length > 0 ? (
        <div className="diagnostics-step-list">
          {run.safeSteps.map((step) => (
            <div className="diagnostics-step-row" key={`${run.id}:${step.stepIndex}`}>
              <strong>#{step.stepIndex}</strong>
              <span>{step.eventType}</span>
              <span>{step.toolName || ''}</span>
              <span>{formatDuration(step.latencyMs)}</span>
              <span>{step.resultCount} results</span>
              <em>{step.failureReason || ''}</em>
            </div>
          ))}
        </div>
      ) : (
        <p className="diagnostics-muted">没有可展示的脱敏 trace steps。</p>
      )}
    </div>
  );
}

function UsageCell({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <em>{label}</em>
      <strong>{formatTokens(value)}</strong>
    </span>
  );
}

function CostGroupsTable({
  groups,
  agentById,
  showAgents,
}: {
  groups: AssistantExecutionSummaryGroup[];
  agentById: Map<string, Agent>;
  showAgents: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="diagnostics-table-wrap">
      <table className="diagnostics-table">
        <thead>
          <tr>
            <th>分组</th>
            <th>runs</th>
            <th>success/fallback/error</th>
            <th>input</th>
            <th>output</th>
            <th>cached</th>
            <th>reasoning</th>
            <th>total</th>
            <th>cost</th>
            <th>缺价</th>
            <th>平均耗时</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key}>
              <td>
                {showAgents ? (
                  <AgentIdentity agent={agentById.get(group.key)} fallbackName={group.label} />
                ) : (
                  group.label
                )}
              </td>
              <td>{formatNumber(group.runCount)}</td>
              <td>{`${group.successCount}/${group.fallbackCount}/${group.errorCount}`}</td>
              <td>{formatTokens(group.usage.inputTokens)}</td>
              <td>{formatTokens(group.usage.outputTokens)}</td>
              <td>{formatTokens(group.usage.cachedInputTokens)}</td>
              <td>{formatTokens(group.usage.reasoningTokens)}</td>
              <td>{formatTokens(group.usage.totalTokens)}</td>
              <td>{formatCost(group.estimatedCostMicros, 'USD')}</td>
              <td>{formatNumber(group.missingCostCount)}</td>
              <td>{formatDuration(group.averageDurationMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  return (
    <div className={status === 'error' ? 'diagnostics-status is-error' : 'diagnostics-status'}>
      <Activity size={16} />
      <span>{message}</span>
      {onRetry ? (
        <Button size="sm" variant="outline" type="button" onClick={onRetry}>
          重试
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
        { value: allValue, label: '全部助手' },
        ...agents.map((agent) => ({
          value: agent.id,
          label: agent.nickname,
          kind: 'agent' as const,
          agent,
        })),
      ],
      providerModels: [{ value: allValue, label: '全部模型' }, ...providerModels],
      taskTypes: uniqueOptions([
        { value: allValue, label: '全部任务' },
        { value: 'annotation', label: 'annotation' },
        { value: 'selection_first', label: 'selection_first' },
        { value: 'co_reading_section', label: 'co_reading_section' },
        { value: 'thread_reply', label: 'thread_reply' },
        ...runs.map((run) => ({ value: run.taskType, label: run.taskType })),
      ]),
      modes: [
        { value: allValue, label: '全部模式' },
        { value: 'fast_response', label: 'fast_response' },
        { value: 'deep_verification', label: 'deep_verification' },
      ],
    };
  }, [agents, providers, runs]);
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

function dateRangeLabel(range: DateRange) {
  if (!range.from) return '选择时间范围';
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

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatTokens(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return formatNumber(value);
}

function formatCost(value: number | undefined, currency: string | undefined) {
  if (value === undefined) return '价格缺失';
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
