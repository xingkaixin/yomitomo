const scrollMode = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ? 'auto'
  : 'smooth';

function keepInList(link: HTMLElement) {
  const list = link.closest('ul');
  if (list && list.scrollHeight > list.clientHeight) {
    list.scrollTop = link.offsetTop - list.offsetTop - list.clientHeight / 2;
  }
}

function setupScrollSync() {
  const bar = document.querySelector('[data-float-bar]');
  const banner = document.querySelector('[data-docs-banner]');
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-head]')];
  const dockLabel = document.querySelector<HTMLElement>('[data-dock-label]');
  const fallback = dockLabel?.textContent ?? '';
  const heads = [...new Set(links.map((link) => link.dataset.head ?? ''))].flatMap((id) => {
    const head = document.getElementById(id);
    return head ? [head] : [];
  });

  const syncBar = () => {
    if (bar && banner) bar.toggleAttribute('data-show', banner.getBoundingClientRect().bottom <= 0);
  };

  const syncOutline = () => {
    const line = window.innerHeight * 0.2;
    let current: HTMLElement | undefined;
    for (const head of heads) {
      if (head.getBoundingClientRect().top > line) break;
      current = head;
    }
    let currentLabel = fallback;
    for (const link of links) {
      if (current && link.dataset.head === current.id) {
        if (!link.hasAttribute('aria-current')) keepInList(link);
        link.setAttribute('aria-current', 'location');
        currentLabel = link.textContent?.trim() ?? fallback;
      } else {
        link.removeAttribute('aria-current');
      }
    }
    if (dockLabel) dockLabel.textContent = currentLabel;
  };

  const sync = () => {
    syncBar();
    syncOutline();
  };

  let queued = false;
  window.addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        sync();
      });
    },
    { passive: true },
  );
  window.addEventListener('resize', sync);
  sync();
}

function setupPageList() {
  const wrap = document.querySelector<HTMLElement>('[data-pages-wrap]');
  const pages = document.querySelector<HTMLElement>('[data-pages]');
  if (!wrap || !pages) return;

  const sync = () => {
    wrap.toggleAttribute('data-more-above', pages.scrollTop > 1);
    wrap.toggleAttribute(
      'data-more-below',
      pages.scrollTop + pages.clientHeight < pages.scrollHeight - 1,
    );
  };
  pages.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(pages);

  const scrollPages = (direction: number) =>
    pages.scrollBy({ top: direction * pages.clientHeight * 0.6, behavior: scrollMode });
  wrap.querySelector('[data-pages-up]')?.addEventListener('click', () => scrollPages(-1));
  wrap.querySelector('[data-pages-down]')?.addEventListener('click', () => scrollPages(1));

  window.addEventListener('pagehide', () => {
    try {
      sessionStorage.setItem(`docs-pages:${pages.dataset.scrollKey}`, String(pages.scrollTop));
    } catch {
      // Storage can be blocked; the list then falls back to centering the current page.
    }
  });
}

function setupSheets() {
  for (const trigger of document.querySelectorAll<HTMLElement>('[data-sheet-open]')) {
    const sheet = document.querySelector<HTMLDialogElement>(
      `[data-sheet="${trigger.dataset.sheetOpen}"]`,
    );
    if (!sheet) continue;

    trigger.addEventListener('click', () => {
      sheet.showModal();
      sheet.focus();
      sheet.querySelector('[aria-current]')?.scrollIntoView({ block: 'center' });
    });
    sheet.querySelector('.sheet-close')?.addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target === sheet || target.closest('a')) sheet.close();
    });
  }
}

setupScrollSync();
setupPageList();
setupSheets();
