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

function fmtMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

function isIosBrowserTab(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/** Shared state per file id, so chip and rows agree. */
const states = new Map<string, FileState>();
const busy = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function refresh(files: OfflineFile[]) {
  await Promise.all(
    files.map(async (f) => {
      if (busy.has(f.id)) return;
      states.set(f.id, await getBasemapCacheState(f.url, f.version));
    }),
  );
  notify();
}

async function start(f: OfflineFile) {
  if (busy.has(f.id)) return;
  busy.add(f.id);
  states.set(f.id, { kind: 'downloading', received: 0, total: null });
  notify();
  try {
    const bytes = await downloadBasemap(f.url, f.version, (received, total) => {
      states.set(f.id, { kind: 'downloading', received, total });
      notify();
    });
    states.set(f.id, { kind: 'ready', bytes });
  } catch (e) {
    states.set(f.id, { kind: 'error', message: e instanceof Error ? e.message : 'Download failed' });
  } finally {
    busy.delete(f.id);
  }
  notify();
}

let wired = false;
function wire(files: OfflineFile[]) {
  for (const f of files) if (!states.has(f.id)) states.set(f.id, { kind: 'unknown' });
  if (wired) return;
  wired = true;
  globalThis.addEventListener(BASEMAP_CACHE_EVENT, () => void refresh(files));
  void refresh(files);
}

/** Status chip (top-left). Tap opens the given callback (drawer at the offline section). */
export function mountOfflineChip(parent: HTMLElement, files: OfflineFile[], onTap: () => void): void {
  wire(files);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'offline-chip';
  chip.addEventListener('click', onTap);
  parent.appendChild(chip);
  const render = () => {
    chip.className = 'offline-chip';
    const required = files.filter((f) => f.required).map((f) => states.get(f.id)!);
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
  listeners.add(render);
  render();
}

/** One row per file with download / delete, rendered into `parent`. */
export function renderOfflineRows(parent: HTMLElement, files: OfflineFile[]): void {
  wire(files);
  const host = document.createElement('div');
  host.className = 'offline-rows';
  parent.appendChild(host);
  const render = () => {
    host.innerHTML = '';
    for (const f of files) host.appendChild(renderRow(f));
    if (isIosBrowserTab()) {
      const hint = document.createElement('p');
      hint.className = 'offline-hint';
      hint.textContent = 'iPhone: tap Share → “Add to Home Screen” and open the app from there, or Safari may clear the offline map.';
      host.appendChild(hint);
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
        await refresh(files);
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
            : 'Optional. Relief shading for the Terrain layer.';
      btn.textContent = 'Download';
      btn.addEventListener('click', () => void start(f));
    }
    row.append(head, p, btn);
    return row;
  };
  listeners.add(render);
  render();
}
