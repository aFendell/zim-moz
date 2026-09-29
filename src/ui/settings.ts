import { COLOR_PRESETS, DEFAULT_PREFS, GROUPS, type Flavor, type LandmarkGroup, type Prefs } from '../prefs';
import type { Overrides } from '../data/types';
import { exportOverrides, parseOverridesExport } from '../data/store';
import type { Drawer } from './drawer';
import { renderOfflineRows, type OfflineFile } from './offline';

export interface SettingsOptions {
  drawer: Drawer;
  getPrefs: () => Prefs;
  onChange: (prefs: Prefs) => void;
  terrainReady: () => Promise<boolean>;
  offlineFiles: OfflineFile[];
  getOverrides: () => Overrides;
  onImport: (overrides: Overrides) => void;
  onClearAll: () => void;
}

const TYPES: { flavor: Flavor; label: string; swatch: [string, string, string] }[] = [
  { flavor: 'light', label: 'Day', swatch: ['#e8e6dc', '#c6dfb8', '#80c9e0'] },
  { flavor: 'dark', label: 'Night', swatch: ['#1f2227', '#2a3a2e', '#1b3a4a'] },
  { flavor: 'grayscale', label: 'Gray', swatch: ['#e6e6e6', '#d0d0d0', '#bdbdbd'] },
];

const GROUP_LABEL: Record<LandmarkGroup, string> = {
  towns: 'Towns & villages',
  fuel: 'Fuel stations',
  services: 'Hospitals, police, ATMs',
};

/** Fills the drawer body: Map type / Map details as tiles, then collapsible Settings. */
export function mountSettings(o: SettingsOptions): void {
  const { drawer } = o;
  drawer.peek.hidden = true; // grip handle only
  const set = (patch: Partial<Prefs>) => o.onChange({ ...o.getPrefs(), ...patch });

  const body = drawer.body;
  body.innerHTML = '';

  // ---- Map type tiles
  const secType = section('map-type', 'Map type');
  const typeGrid = document.createElement('div');
  typeGrid.className = 'type-grid';
  const typeCards = new Map<Flavor, HTMLButtonElement>();
  const syncType = () => {
    const f = o.getPrefs().flavor;
    for (const [k, c] of typeCards) c.classList.toggle('is-active', k === f);
  };
  for (const t of TYPES) {
    const card = tile(t.label, gradient(t.swatch), () => {
      set({ flavor: t.flavor });
      syncType();
    });
    typeCards.set(t.flavor, card);
    typeGrid.appendChild(card);
  }
  syncType();
  secType.appendChild(typeGrid);

  // ---- Map details tiles (toggles)
  const secDetails = section('map-details', 'Map details');
  const detailGrid = document.createElement('div');
  detailGrid.className = 'type-grid';
  const terrainTile = tile('Terrain', 'url("data:image/svg+xml,' + encodeURIComponent(TERRAIN_SVG) + '") center / cover, #ded8c8', () => {
    set({ terrain: !o.getPrefs().terrain });
    syncDetails();
  });
  const lmTile = tile('Landmarks', 'url("data:image/svg+xml,' + encodeURIComponent(LANDMARK_SVG) + '") center / cover, #e8e6dc', () => {
    set({ landmarks: !o.getPrefs().landmarks });
    syncDetails();
  });
  const syncDetails = () => {
    const p = o.getPrefs();
    terrainTile.classList.toggle('is-active', p.terrain);
    lmTile.classList.toggle('is-active', p.landmarks);
    sub.hidden = !p.landmarks;
  };
  detailGrid.append(terrainTile, lmTile);
  secDetails.appendChild(detailGrid);
  const terrainHint = document.createElement('p');
  terrainHint.className = 'tile-hint';
  terrainHint.hidden = true;
  secDetails.appendChild(terrainHint);
  void o.terrainReady().then((ready) => {
    if (ready) return;
    terrainHint.hidden = false;
    terrainHint.textContent = navigator.onLine
      ? 'Terrain streams while online. Download it under Settings › Offline files for off-grid use.'
      : 'Terrain not downloaded. Get it under Settings › Offline files when on wifi.';
  });
  const sub = document.createElement('div');
  sub.className = 'toggle-sub';
  for (const g of GROUPS) {
    sub.appendChild(
      toggleRow(
        GROUP_LABEL[g],
        g === 'fuel' ? 'From OpenStreetMap, within 2.5 km of the route' : '',
        () => o.getPrefs().landmarkGroups.includes(g),
        (on) => {
          const cur = o.getPrefs().landmarkGroups;
          set({ landmarkGroups: on ? [...new Set([...cur, g])] : cur.filter((x) => x !== g) });
        },
      ).row,
    );
  }
  secDetails.appendChild(sub);
  syncDetails();

  // ---- Settings (collapsibles)
  const secSettings = section('settings', 'Settings');

  // Colours
  const colours = collapsible('colours', 'Colours');
  const preview = document.createElement('div');
  preview.className = 'route-preview';
  const casing = document.createElement('div');
  casing.className = 'route-preview-casing';
  const line = document.createElement('div');
  line.className = 'route-preview-line';
  const stopDot = document.createElement('span');
  stopDot.className = 'route-preview-stop';
  stopDot.textContent = '2';
  const borderDot = document.createElement('span');
  borderDot.className = 'route-preview-border';
  borderDot.textContent = '⛿';
  casing.appendChild(line);
  preview.append(casing, stopDot, borderDot);
  const refreshPreview = () => {
    const p = o.getPrefs();
    casing.style.background = p.routeCasing;
    line.style.background = p.routeColor;
    stopDot.style.background = p.stopColor;
    borderDot.style.background = p.borderColor;
  };
  const colorSyncs: (() => void)[] = [];
  const colorRow = (label: string, get: () => string, put: (c: string) => void) => {
    const r = swatchRow(label, get, (c) => {
      put(c);
      refreshPreview();
    });
    colorSyncs.push(r.sync);
    return r.el;
  };
  const lmColor = (g: LandmarkGroup) => (c: string) => set({ landmarkColors: { ...o.getPrefs().landmarkColors, [g]: c } });
  colours.body.append(
    preview,
    colorRow('Route', () => o.getPrefs().routeColor, (c) => set({ routeColor: c })),
    colorRow('Route outline', () => o.getPrefs().routeCasing, (c) => set({ routeCasing: c })),
    colorRow('Our stops', () => o.getPrefs().stopColor, (c) => set({ stopColor: c })),
    colorRow('Border posts', () => o.getPrefs().borderColor, (c) => set({ borderColor: c })),
    colorRow('Towns', () => o.getPrefs().landmarkColors.towns, lmColor('towns')),
    colorRow('Fuel', () => o.getPrefs().landmarkColors.fuel, lmColor('fuel')),
    colorRow('Services', () => o.getPrefs().landmarkColors.services, lmColor('services')),
  );
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-ghost';
  reset.textContent = 'Reset colours';
  reset.addEventListener('click', () => {
    const d = DEFAULT_PREFS;
    set({ routeColor: d.routeColor, routeCasing: d.routeCasing, stopColor: d.stopColor, borderColor: d.borderColor, landmarkColors: { ...d.landmarkColors } });
    refreshPreview();
    for (const s of colorSyncs) s();
  });
  colours.body.appendChild(reset);
  refreshPreview();

  // Offline files
  const offline = collapsible('offline', 'Offline files');
  renderOfflineRows(offline.body, o.offlineFiles);

  // My edits
  const edits = collapsible('my-edits', 'My edits');
  const msg = document.createElement('p');
  msg.className = 'menu-msg';
  msg.hidden = true;
  const say = (text: string) => {
    msg.textContent = text;
    msg.hidden = false;
    setTimeout(() => (msg.hidden = true), 3000);
  };
  const actions = document.createElement('div');
  actions.className = 'edits-actions';
  actions.appendChild(
    btn('Export my edits', async () => {
      const overrides = o.getOverrides();
      if (Object.keys(overrides).length === 0) return say('No local edits yet.');
      const file = new File([exportOverrides(overrides)], `zim-moz-edits-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'zim-moz edits' });
          return;
        } catch {
          /* cancelled; fall through */
        }
      }
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }),
  );
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.hidden = true;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    try {
      const overrides = parseOverridesExport(await f.text());
      o.onImport(overrides);
      say(`Imported edits for ${Object.keys(overrides).length} location(s).`);
    } catch (e) {
      say(e instanceof Error ? e.message : 'Import failed.');
    }
  });
  actions.appendChild(btn('Import edits…', () => fileInput.click()));
  let confirmClear = false;
  const clearBtn = btn('Clear all my edits', () => {
    if (!confirmClear) {
      confirmClear = true;
      clearBtn.textContent = 'Tap again to confirm';
      setTimeout(() => {
        confirmClear = false;
        clearBtn.textContent = 'Clear all my edits';
      }, 3000);
      return;
    }
    confirmClear = false;
    clearBtn.textContent = 'Clear all my edits';
    o.onClearAll();
    say('Local edits cleared.');
  });
  clearBtn.classList.add('btn-ghost');
  actions.appendChild(clearBtn);
  edits.body.append(actions, fileInput, msg);

  secSettings.append(colours.el, offline.el, edits.el);
  body.append(secType, secDetails, secSettings);
}

const TERRAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect width="80" height="60" fill="#e3ddcc"/><path d="M0 48 L18 26 L30 38 L46 16 L62 34 L80 22 V60 H0Z" fill="#b9ad93"/><path d="M0 48 L18 26 L30 38 L46 16 L62 34 L80 22" fill="none" stroke="#8c7f65" stroke-width="2"/><path d="M18 26 L24 40 M46 16 L54 36" stroke="#a89b80" stroke-width="2"/></svg>';
const LANDMARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><rect width="80" height="60" fill="#e8e6dc"/><path d="M6 50 C 25 40, 35 20, 74 10" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round"/><circle cx="20" cy="43" r="4.5" fill="#ea580c" stroke="#fff" stroke-width="1.5"/><circle cx="40" cy="27" r="4.5" fill="#111827" stroke="#fff" stroke-width="1.5"/><circle cx="60" cy="15" r="4.5" fill="#0891b2" stroke="#fff" stroke-width="1.5"/></svg>';

function gradient(s: [string, string, string]) {
  return `linear-gradient(135deg, ${s[0]} 0 45%, ${s[1]} 45% 70%, ${s[2]} 70%)`;
}

function tile(label: string, background: string, onClick: () => void): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'type-card';
  const sw = document.createElement('div');
  sw.className = 'type-swatch';
  sw.style.background = background;
  const lbl = document.createElement('span');
  lbl.textContent = label;
  card.append(sw, lbl);
  card.addEventListener('click', onClick);
  return card;
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function section(id: string, title: string): HTMLElement {
  const s = document.createElement('section');
  s.className = 'sheet-section';
  s.id = id;
  const h = document.createElement('h3');
  h.textContent = title;
  s.appendChild(h);
  return s;
}

function collapsible(id: string, title: string): { el: HTMLDetailsElement; body: HTMLElement } {
  const el = document.createElement('details');
  el.className = 'collapsible';
  el.id = id;
  const summary = document.createElement('summary');
  summary.textContent = title;
  const body = document.createElement('div');
  body.className = 'collapsible-body';
  el.append(summary, body);
  return { el, body };
}

function toggleRow(label: string, hint: string, get: () => boolean, onChange: (on: boolean) => void) {
  const row = document.createElement('label');
  row.className = 'toggle-row';
  const text = document.createElement('div');
  text.className = 'toggle-text';
  const l = document.createElement('span');
  l.textContent = label;
  const h = document.createElement('small');
  h.textContent = hint;
  text.append(l, h);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.checked = get();
  input.addEventListener('change', () => onChange(input.checked));
  row.append(text, input);
  return { row, input, hint: h };
}

function swatchRow(label: string, current: () => string, pick: (c: string) => void) {
  const el = document.createElement('div');
  el.className = 'color-row';
  const l = document.createElement('span');
  l.className = 'color-label';
  l.textContent = label;
  const row = document.createElement('div');
  row.className = 'swatches';
  const input = document.createElement('input');
  input.type = 'color';
  const sync = () => {
    for (const s of row.querySelectorAll<HTMLElement>('.swatch[data-color]')) s.classList.toggle('is-active', s.dataset.color === current());
    input.value = current();
  };
  for (const c of COLOR_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.color = c;
    b.style.background = c;
    b.setAttribute('aria-label', c);
    b.addEventListener('click', () => {
      pick(c);
      sync();
    });
    row.appendChild(b);
  }
  const custom = document.createElement('label');
  custom.className = 'swatch swatch-custom';
  custom.title = 'Custom colour';
  input.addEventListener('input', () => {
    pick(input.value);
    sync();
  });
  custom.appendChild(input);
  row.appendChild(custom);
  el.append(l, row);
  sync();
  return { el, sync };
}
