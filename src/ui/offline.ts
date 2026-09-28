import {
  BASEMAP_CACHE_EVENT,
  deleteBasemap,
  downloadBasemap,
  getBasemapCacheState,
  type BasemapCacheState,
} from '../data/basemapCache';

export interface OfflineFile {
  id: string;
  label: string;
  url: string;
  version: number;
  sizeHintMB: number;
  /** Required files drive the chip status; optional ones (terrain) do not. */
  required: boolean;
}

type FileState =
  | { kind: 'unknown' }
  | BasemapCacheState
  | { kind: 'downloading'; received: number; total: number | null };

export interface OfflineOptions {
  parent: HTMLElement;
  files: OfflineFile[];
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

function isIosBrowserTab(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Status chip + panel listing each offline file with its own download/delete. */
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

  const states = new Map<string, FileState>(opts.files.map((f) => [f.id, { kind: 'unknown' }]));
  const busy = new Set<string>();

  const refresh = async () => {
    await Promise.all(
      opts.files.map(async (f) => {
        if (busy.has(f.id)) return;
        states.set(f.id, await getBasemapCacheState(f.url, f.version));
      }),
    );
    render();
  };

  const start = async (f: OfflineFile) => {
    if (busy.has(f.id)) return;
    busy.add(f.id);
    states.set(f.id, { kind: 'downloading', received: 0, total: null });
    render();
    try {
      const bytes = await downloadBasemap(f.url, f.version, (received, total) => {
        states.set(f.id, { kind: 'downloading', received, total });
        render();
      });
      states.set(f.id, { kind: 'ready', bytes });
    } catch (e) {
      states.set(f.id, { kind: 'error', message: e instanceof Error ? e.message : 'Download failed' });
    } finally {
      busy.delete(f.id);
    }
    render();
  };

  const renderChip = () => {
    chip.className = 'offline-chip';
    const required = opts.files.filter((f) => f.required).map((f) => states.get(f.id)!);
    const downloading = [...states.values()].find((s) => s.kind === 'downloading');
    if (downloading && downloading.kind === 'downloading') {
      const pct = downloading.total ? Math.round((downloading.received / downloading.total) * 100) : null;
      chip.textContent = pct === null ? `↓ ${fmtMB(downloading.received)}` : `↓ ${pct}%`;
      chip.classList.add('is-busy');
    } else if (required.every((s) => s.kind === 'ready')) {
      chip.textContent = '● Offline ready';
      chip.classList.add('is-ready');
    } else if (required.some((s) => s.kind === 'stale')) {
      chip.textContent = '● Map update available';
      chip.classList.add('is-missing');
    } else if (required.some((s) => s.kind === 'error')) {
      chip.textContent = '! Offline unavailable';
      chip.classList.add('is-missing');
    } else if (required.some((s) => s.kind === 'unknown')) {
      chip.textContent = '…';
    } else {
      chip.textContent = '○ Offline map not downloaded';
      chip.classList.add('is-missing');
    }
  };

  const renderRow = (f: OfflineFile): HTMLElement => {
    const s = states.get(f.id)!;
    const row = document.createElement('div');
    row.className = 'offline-row';
    const head = document.createElement('div');
    head.className = 'offline-row-head';
    const name = document.createElement('strong');
    name.textContent = f.label;
    const meta = document.createElement('span');
    meta.className = 'offline-row-meta';
    head.append(name, meta);
    const p = document.createElement('p');
    p.className = 'offline-text';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-small';
    if (s.kind === 'ready') {
      meta.textContent = `stored, ${fmtMB(s.bytes)}`;
      p.textContent = f.required ? 'Works with no signal.' : 'Available offline.';
      btn.textContent = 'Delete';
      btn.className = 'btn btn-ghost btn-small';
      btn.addEventListener('click', async () => {
        await deleteBasemap(f.url, f.version);
        await refresh();
      });
    } else if (s.kind === 'downloading') {
      meta.textContent = `${fmtMB(s.received)}${s.total ? ` / ${fmtMB(s.total)}` : ''}`;
      p.textContent = 'Downloading… keep this page open.';
      btn.hidden = true;
    } else if (s.kind === 'error') {
      meta.textContent = 'failed';
      p.textContent = s.message;
      btn.textContent = 'Retry';
      btn.addEventListener('click', () => void start(f));
    } else {
      meta.textContent = `~${f.sizeHintMB} MB`;
      p.textContent =
        s.kind === 'stale'
          ? 'A newer version is available. Download it while on wifi.'
          : f.required
            ? 'Download while on wifi so the map works off-grid.'
            : 'Optional. Hillshade relief for the Terrain layer.';
      btn.textContent = 'Download';
      btn.addEventListener('click', () => void start(f));
    }
    row.append(head, p, btn);
    return row;
  };

  const render = () => {
    renderChip();
    panel.innerHTML = '';
    for (const f of opts.files) panel.appendChild(renderRow(f));
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
