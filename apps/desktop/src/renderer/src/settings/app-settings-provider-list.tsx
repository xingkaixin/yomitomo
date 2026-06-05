import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import type { LlmProvider } from '@yomitomo/shared';
import { providerLogoMap } from './app-settings-provider-assets';

const DELETE_HOLD_MS = 900;

export function ProviderList({
  providers,
  usedProviderIds,
  onCreate,
  onDelete,
  onEdit,
}: {
  providers: LlmProvider[];
  usedProviderIds: ReadonlySet<string>;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onEdit: (provider: LlmProvider) => void;
}) {
  return (
    <section className="provider-card-section" aria-label="模型供应商">
      <div className="provider-card-grid">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            used={usedProviderIds.has(provider.id)}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
        <CreateProviderCard onCreate={onCreate} />
      </div>
    </section>
  );
}

function CreateProviderCard({ onCreate }: { onCreate: () => void }) {
  function createFromKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onCreate();
  }

  return (
    <article
      className="provider-card provider-create-card"
      role="button"
      tabIndex={0}
      aria-label="新增模型供应商"
      onClick={onCreate}
      onKeyDown={createFromKeyboard}
    >
      <header className="provider-card-header">
        <div className="provider-card-identity">
          <span className="provider-create-logo">
            <Plus size={18} />
          </span>
          <h4>添加供应商</h4>
        </div>
      </header>
      <footer className="provider-card-footer">
        <span className="provider-card-footnote">配置模型服务商和 API Key</span>
        <span className="provider-create-action">新增</span>
      </footer>
    </article>
  );
}

function ProviderCard({
  provider,
  used,
  onDelete,
  onEdit,
}: {
  provider: LlmProvider;
  used: boolean;
  onDelete: (id: string) => void;
  onEdit: (provider: LlmProvider) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [holdingDelete, setHoldingDelete] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const deleteTimerRef = useRef<number | null>(null);
  const logo =
    providerLogoMap[provider.logo || 'anthropic.png'] || providerLogoMap['anthropic.png'];

  useEffect(() => {
    if (!menuOpen) return;

    function closeOutside(event: PointerEvent) {
      if (!cardRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }

    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [menuOpen]);

  useEffect(() => () => clearDeleteTimer(), []);

  function clearDeleteTimer() {
    if (deleteTimerRef.current !== null) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    setHoldingDelete(false);
  }

  function startDeleteHold() {
    if (deleteTimerRef.current !== null) return;
    setHoldingDelete(true);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      setHoldingDelete(false);
      setMenuOpen(false);
      onDelete(provider.id);
    }, DELETE_HOLD_MS);
  }

  function editProvider() {
    setMenuOpen(false);
    onEdit(provider);
  }

  return (
    <article className={menuOpen ? 'provider-card is-menu-open' : 'provider-card'} ref={cardRef}>
      <header className="provider-card-header">
        <div className="provider-card-identity">
          <img className="provider-card-logo" src={logo} alt="" />
          <h4>{provider.name}</h4>
        </div>
        {used ? <span className="provider-used-label">已使用</span> : null}
      </header>
      <footer className="provider-card-footer">
        <span className="provider-card-model">{provider.modelName}</span>
        <div className="provider-card-actions">
          <button
            className="provider-card-menu-button"
            type="button"
            aria-label={`打开${provider.name}设置菜单`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Settings2 size={16} />
          </button>
          {menuOpen ? (
            <div className="provider-card-menu" role="menu">
              <button type="button" role="menuitem" onClick={editProvider}>
                <Pencil size={14} />
                编辑
              </button>
              <button
                className={
                  holdingDelete
                    ? 'provider-delete-menu-item is-holding-delete'
                    : 'provider-delete-menu-item'
                }
                type="button"
                role="menuitem"
                onPointerCancel={clearDeleteTimer}
                onPointerDown={startDeleteHold}
                onPointerLeave={clearDeleteTimer}
                onPointerUp={clearDeleteTimer}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') startDeleteHold();
                }}
                onKeyUp={clearDeleteTimer}
              >
                <Trash2 size={14} />
                长按删除
              </button>
            </div>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
