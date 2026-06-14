import React from 'react';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { ChevronRight, Info } from 'lucide-react';
import './app-settings-kit.css';

/**
 * 设置页共享布局组件（grouped rows 风格）。
 *
 * 设计语言：slim 面包屑头 + 分组 section label + 实线卡片 + 高密度设置行。
 * 所有颜色均来自 AppTheme 输出的 CSS variables，不写死核心色。
 */

export function SettingsPage({
  trail,
  description,
  action,
  children,
}: {
  trail: string[];
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-page">
      <header className="settings-breadcrumb">
        <div className="settings-breadcrumb-copy">
          <p className="settings-breadcrumb-trail">
            {trail.map((item, index) => (
              <React.Fragment key={item}>
                {index > 0 ? (
                  <ChevronRight aria-hidden="true" className="settings-breadcrumb-sep" size={13} />
                ) : null}
                <span>{item}</span>
              </React.Fragment>
            ))}
          </p>
          {description ? <p className="settings-breadcrumb-desc">{description}</p> : null}
        </div>
        {action ? <div className="settings-breadcrumb-action">{action}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function SettingsGroup({
  label,
  aside,
  note,
  flush = false,
  padded = false,
  className = '',
  cardProps,
  children,
}: {
  label?: string;
  aside?: React.ReactNode;
  note?: React.ReactNode;
  /** flush 时不包裹实线卡片，直接渲染 children（用于卡片网格等场景） */
  flush?: boolean;
  /** padded 时卡片改为内边距布局、不画行分隔线（用于表单型分组） */
  padded?: boolean;
  className?: string;
  /** 透传到实线卡片容器，用于承载 role/aria 等语义 */
  cardProps?: React.HTMLAttributes<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const cardClassName = ['settings-card', padded ? 'is-padded' : '', cardProps?.className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <section className={`settings-group ${className}`.trim()}>
      {label || aside ? (
        <div className="settings-group-label">
          {label ? <p>{label}</p> : <span />}
          {aside ? <div className="settings-group-aside">{aside}</div> : null}
        </div>
      ) : null}
      {note ? <p className="settings-group-note">{note}</p> : null}
      {flush ? (
        children
      ) : (
        <div {...cardProps} className={cardClassName}>
          {children}
        </div>
      )}
    </section>
  );
}

export function SettingsSegmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  block = false,
  wrap = false,
}: {
  options: Array<{ label: React.ReactNode; value: T; key?: string; disabled?: boolean }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** block 时填满容器宽度、各选项等分（用于全宽分段） */
  block?: boolean;
  /** wrap 时允许多行排列，适合选项较多且文案随语言变长的场景 */
  wrap?: boolean;
}) {
  const className = ['settings-segmented', block ? 'is-block' : '', wrap ? 'is-wrapped' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            aria-pressed={active}
            className={active ? 'settings-segmented-option is-active' : 'settings-segmented-option'}
            disabled={option.disabled}
            key={option.key ?? String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsRow({
  leading,
  title,
  description,
  children,
  className = '',
  align = 'center',
}: {
  leading?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** 行尾控件 */
  children?: React.ReactNode;
  className?: string;
  /** start 用于行尾控件较高（如多行描述）时顶部对齐 */
  align?: 'center' | 'start';
}) {
  return (
    <div className={`settings-row settings-row-${align} ${className}`.trim()}>
      {leading ? <span className="settings-row-leading">{leading}</span> : null}
      {title || description ? <SettingsRowCopy title={title} description={description} /> : null}
      {children ? <div className="settings-row-control">{children}</div> : null}
    </div>
  );
}

export function SettingsRowCopy({
  title,
  description,
  infoMode = 'interactive',
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /**
   * decorative 用于整行本身已经是 button 的场景，避免在 button 中嵌套可聚焦控件。
   * 这类行应由父级按钮承载 tooltip。
   */
  infoMode?: 'interactive' | 'decorative';
}) {
  const tooltipDescription = settingTooltipDescription(description);
  const showVisibleDescription = description && !tooltipDescription;
  return (
    <div className="settings-row-copy">
      {title ? (
        <strong className="settings-row-title">
          <span className="settings-row-title-text">{title}</span>
          {tooltipDescription ? (
            <SettingsInfoIndicator
              description={tooltipDescription}
              interactive={infoMode === 'interactive'}
            />
          ) : null}
        </strong>
      ) : null}
      {showVisibleDescription ? <p>{description}</p> : null}
    </div>
  );
}

export function SettingsRowDescriptionTooltip({
  description,
  children,
}: {
  description?: React.ReactNode;
  children: React.ReactElement;
}) {
  const tooltipDescription = settingTooltipDescription(description);
  if (!tooltipDescription) return children;
  return (
    <ReaderTooltip content={<SettingsTooltipContent>{tooltipDescription}</SettingsTooltipContent>}>
      {children}
    </ReaderTooltip>
  );
}

function SettingsInfoIndicator({
  description,
  interactive,
}: {
  description: string;
  interactive: boolean;
}) {
  const indicator = (
    <span
      aria-hidden={interactive ? undefined : true}
      aria-label={interactive ? description : undefined}
      className={
        interactive ? 'settings-row-info-trigger' : 'settings-row-info-trigger is-decorative'
      }
      tabIndex={interactive ? 0 : undefined}
    >
      <Info size={13} strokeWidth={2.2} />
    </span>
  );

  if (!interactive) return indicator;
  return (
    <ReaderTooltip content={<SettingsTooltipContent>{description}</SettingsTooltipContent>}>
      {indicator}
    </ReaderTooltip>
  );
}

function SettingsTooltipContent({ children }: { children: React.ReactNode }) {
  return <span className="settings-row-info-tooltip">{children}</span>;
}

function settingTooltipDescription(description: React.ReactNode) {
  if (typeof description !== 'string') return '';
  return description.trim();
}

export function SettingsToggle({
  checked,
  onChange,
  id,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="settings-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="settings-switch-track" aria-hidden="true" />
    </label>
  );
}

export function SettingsRadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={checked ? 'settings-radio-dot is-checked' : 'settings-radio-dot'}
    />
  );
}
