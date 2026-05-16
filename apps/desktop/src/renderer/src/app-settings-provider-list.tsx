import { Plus } from 'lucide-react';
import type { LlmProvider } from '@yomitomo/shared';
import { providerLogoMap } from './app-settings-provider-assets';
import { Button } from './components/ui/button';

export function ProviderList({
  providers,
  selectedProviderId,
  usedProviderIds,
  onCreate,
  onSelect,
}: {
  providers: LlmProvider[];
  selectedProviderId: string | null;
  usedProviderIds: ReadonlySet<string>;
  onCreate: () => void;
  onSelect: (provider: LlmProvider) => void;
}) {
  return (
    <aside className="config-list">
      <div className="config-list-header">
        <div className="config-list-title">模型供应商</div>
        <Button className="action-button create-action" size="sm" type="button" onClick={onCreate}>
          <Plus size={16} />
          新增
        </Button>
      </div>
      <div className="config-list-scroll">
        {providers.map((provider) => (
          <button
            className={
              provider.id === selectedProviderId
                ? 'config-list-item is-plain is-active'
                : 'config-list-item is-plain'
            }
            key={provider.id}
            type="button"
            onClick={() => onSelect(provider)}
          >
            {usedProviderIds.has(provider.id) ? (
              <span className="provider-used-label">已使用</span>
            ) : null}
            <img
              className="provider-logo"
              src={
                providerLogoMap[provider.logo || 'anthropic.png'] ||
                providerLogoMap['anthropic.png']
              }
              alt=""
            />
            <span className="min-w-0">
              <strong>{provider.name}</strong>
              <span>
                {provider.type} · {provider.modelName}
              </span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
