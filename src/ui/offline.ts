import {
  BASEMAP_CACHE_EVENT,
  deleteBasemap,
  downloadBasemap,
  getBasemapCacheState,
  type BasemapCacheState,
} from '../data/basemapCache';

type UiState =
  | { kind: 'unknown' }
  | BasemapCacheState
  | { kind: 'downloading'; received: number; total: number | null };

export interface OfflineOptions {
  url: string;
  version: number;
  parent: HTMLElement;
  sizeHintMB: number;
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

function isIosBrowserTab(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Status chip + expandable panel with the download button and iOS install hint. */
export function mountOfflinePanel(opts: OfflineOptions): void {
  const wrap = document.createElement('div');
  wrap.className = 'offline';
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'offline-chip';
  const panel = document.createElement('div');
  panel.className = 'offline-panel';
  panel.hidden = true;
  wrap.append(chip, panel);
  opts.parent.appendChild(wrap);

  let state: UiState = { kind: 'unknown' };
  let busy = false;

  const refresh = async () => {
    if (busy) return;
    state = await getBasemapCacheState(opts.url, opts.version);
    render();
  };

  const start = async () => {
    if (busy) return;
    busy = true;
    state = { kind: 'downloading', received: 0, total: null };
    render();
    try {
      const bytes = await downloadBasemap(opts.url, opts.version, (received, total) => {
        state = { kind: 'downloading', received, total };
        render();
      });
      state = { kind: 'ready', bytes };
    } catch (e) {
      state = { kind: 'error', message: e instanceof Error ? e.message : 'Download failed' };
    } finally {
      busy = false;
    }
    render();
  };

  const render = () => {
    chip.className = 'offline-chip';
    let label = '…';
    if (state.kind === 'ready') {
      label = '● Offline ready';
      chip.classList.add('is-ready');
    } else if (state.kind === 'downloading') {
      const pct = state.total ? Math.round((state.received / state.total) * 100) : null;
      label = pct === null ? `↓ ${fmtMB(state.received)}` : `↓ ${pct}%`;
      chip.classList.add('is-busy');
    } else if (state.kind === 'stale') {
      label = '● Map update available';
      chip.classList.add('is-missing');
    } else if (state.kind === 'missing') {
      label = '○ Offline map not downloaded';
      chip.classList.add('is-missing');
    } else if (state.kind === 'error') {
      label = '! Offline unavailable';
      chip.classList.add('is-missing');
    }
    chip.textContent = label;

    panel.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'offline-text';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary';
    if (state.kind === 'ready') {
      p.textContent = `Basemap stored on this device (${fmtMB(state.bytes)}). The map works with no signal.`;
      btn.textContent = 'Delete offline map';
      btn.className = 'btn btn-ghost';
      btn.addEventListener('click', async () => {
        await deleteBasemap();
        await refresh();
      });
    } else if (state.kind === 'downloading') {
      p.textContent = `Downloading… ${fmtMB(state.received)}${state.total ? ` of ${fmtMB(state.total)}` : ''}. Keep this page open.`;
      btn.hidden = true;
    } else if (state.kind === 'error') {
      p.textContent = state.message;
      btn.textContent = 'Retry';
      btn.addEventListener('click', start);
    } else {
      p.textContent =
        state.kind === 'stale'
          ? 'A newer basemap is available. Download it while on wifi.'
          : `Download the basemap (~${opts.sizeHintMB} MB) while on wifi so the map works off-grid.`;
      btn.textContent = 'Download offline map';
      btn.addEventListener('click', start);
    }
    panel.append(p, btn);
    if (isIosBrowserTab()) {
      const hint = document.createElement('p');
      hint.className = 'offline-hint';
      hint.textContent =
        'iPhone: tap Share → “Add to Home Screen” and open the app from there, or Safari may clear the offline map.';
      panel.appendChild(hint);
    }
  };

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) panel.hidden = true;
  });
  globalThis.addEventListener(BASEMAP_CACHE_EVENT, () => void refresh());

  render();
  void refresh();
}
