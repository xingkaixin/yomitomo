import { useState, type KeyboardEvent } from 'react';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import type { LlmProvider } from '@yomitomo/shared';
import { providerLogoMap } from './app-settings-provider-assets';
import { useTranslation } from 'react-i18next';
import { providerDisplayName } from '../i18n/app-i18n-labels';
import { SettingsConfirmDialog } from './app-settings-confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { IconButton } from '../components/ui/icon-button';

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
  const { t } = useTranslation();
  return (
    <section className="provider-card-section" aria-label={t('settings.models.listAria')}>
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
  const { t } = useTranslation();
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
      aria-label={t('settings.models.addProviderAria')}
      onClick={onCreate}
      onKeyDown={createFromKeyboard}
    >
      <header className="provider-card-header">
        <div className="provider-card-identity">
          <span className="provider-create-logo">
            <Plus size={18} />
          </span>
          <h4>{t('settings.models.addProvider')}</h4>
        </div>
      </header>
      <footer className="provider-card-footer">
        <span className="provider-card-footnote">{t('settings.models.addProviderFootnote')}</span>
        <span className="provider-create-action">{t('settings.models.add')}</span>
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
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const logo =
    providerLogoMap[provider.logo || 'anthropic.png'] || providerLogoMap['anthropic.png'];
  const displayName = providerDisplayName(provider);

  function editProvider() {
    setMenuOpen(false);
    onEdit(provider);
  }

  function confirmDelete() {
    setConfirmOpen(false);
    onDelete(provider.id);
  }

  return (
    <article className={menuOpen ? 'provider-card is-menu-open' : 'provider-card'}>
      <header className="provider-card-header">
        <div className="provider-card-identity">
          <img className="provider-card-logo" src={logo} alt="" />
          <h4>{displayName}</h4>
        </div>
        {used ? <span className="provider-used-label">{t('settings.models.used')}</span> : null}
      </header>
      <footer className="provider-card-footer">
        <span className="provider-card-model">{provider.modelName}</span>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <div className="provider-card-actions">
            <DropdownMenuTrigger asChild>
              <IconButton
                className="provider-card-menu-button"
                aria-label={t('settings.models.openProviderMenu', { name: displayName })}
              >
                <Settings2 size={16} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="provider-card-menu">
              <DropdownMenuItem asChild>
                <button type="button" onClick={editProvider}>
                  <Pencil size={14} />
                  {t('settings.models.edit')}
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button
                  className="provider-delete-menu-item"
                  type="button"
                  aria-label={t('settings.models.deleteProviderAria', { name: displayName })}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 size={14} />
                  {t('settings.models.deleteProvider')}
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </div>
        </DropdownMenu>
      </footer>
      <SettingsConfirmDialog
        cancelLabel={t('settings.confirm.cancel')}
        confirmLabel={t('settings.models.deleteProviderConfirm')}
        description={t('settings.models.deleteProviderConfirmDescription')}
        open={confirmOpen}
        title={t('settings.models.deleteProviderConfirmTitle', { name: displayName })}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </article>
  );
}
