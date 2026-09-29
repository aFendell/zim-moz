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

/** Fills the drawer: quick chips in the peek strip, full settings in the body. */
export function mountSettings(o: SettingsOptions): void {
  const { drawer } = o;
  const set = (patch: Partial<Prefs>) => {
    o.onChange({ ...o.getPrefs(), ...patch });
    renderPeek();
  };

  // ---- peek strip: quick chips
  const renderPeek = () => {
    const p = o.getPrefs();
    drawer.peek.innerHTML = '';
    const title = document.createElement('span');
    title.className = 'peek-title';
    title.textContent = 'Map & settings';
    const chips = document.createElement('div');
    chips.className = 'peek-chips';
    for (const t of TYPES) chips.appendChild(chip(t.label, p.flavor === t.flavor, () => set({ flavor: t.flavor })));
    chips.appendChild(chip('Terrain', p.terrain, () => set({ terrain: !p.terrain })));
    chips.appendChild(chip('Landmarks', p.landmarks, () => set({ landmarks: !p.landmarks })));
    drawer.peek.append(title, chips);
  };

  // ---- body
  const body = drawer.body;
  body.innerHTML = '';

  // Map type
  const secType = section('map-type', 'Map type');
  const grid = document.createElement('div');
  grid.className = 'type-grid';
  const cards = new Map<Flavor, HTMLButtonElement>();
  for (const t of TYPES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'type-card';
    const sw = document.createElement('div');
    sw.className = 'type-swatch';
    sw.style.background = `linear-gradient(135deg, ${t.swatch[0]} 0 45%, ${t.swatch[1]} 45% 70%, ${t.swatch[2]} 70%)`;
    const lbl = document.createElement('span');
    lbl.textContent = t.label;
    card.append(sw, lbl);
    card.addEventListener('click', () => {
      set({ flavor: t.flavor });
      syncType();
    });
    cards.set(t.flavor, card);
    grid.appendChild(card);
  }
  const syncType = () => {
    const f = o.getPrefs().flavor;
    for (const [k, c] of cards) c.classList.toggle('is-active', k === f);
  };
  syncType();
  secType.appendChild(grid);

  // Details
  const secDetails = section('map-details', 'Map details');
  const terrain = toggleRow('Terrain', '', () => o.getPrefs().terrain, (on) => set({ terrain: on }));
  secDetails.appendChild(terrain.row);
  void o.terrainReady().then((ready) => {
    if (ready) return;
    terrain.hint.textContent = navigator.onLine
      ? 'Streams while online. Download it below for off-grid use.'
      : 'Not downloaded. Get it below when on wifi.';
    if (!navigator.onLine) terrain.input.disabled = true;
  });
  const lm = toggleRow('Landmarks along the route', '', () => o.getPrefs().landmarks, (on) => {
    set({ landmarks: on });
    sub.hidden = !on;
  });
  secDetails.appendChild(lm.row);
  const sub = document.createElement('div');
  sub.className = 'toggle-sub';
  sub.hidden = !o.getPrefs().landmarks;
  for (const g of GROUPS) {
    const r = toggleRow(
      GROUP_LABEL[g],
      g === 'fuel' ? 'From OpenStreetMap, within 2.5 km of the route' : '',
      () => o.getPrefs().landmarkGroups.includes(g),
      (on) => {
        const cur = o.getPrefs().landmarkGroups;
        set({ landmarkGroups: on ? [...new Set([...cur, g])] : cur.filter((x) => x !== g) });
      },
    );
    sub.appendChild(r.row);
  }
  secDetails.appendChild(sub);

  // Colours
  const secColors = section('colours', 'Colours');
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
  const colorRows: (() => void)[] = [];
  const colorRow = (label: string, get: () => string, put: (c: string) => void) => {
    const r = swatchRow(label, get, (c) => {
      put(c);
      refreshPreview();
    });
    colorRows.push(r.sync);
    return r.el;
  };
  secColors.append(
    preview,
    colorRow('Route', () => o.getPrefs().routeColor, (c) => set({ routeColor: c })),
    colorRow('Route outline', () => o.getPrefs().routeCasing, (c) => set({ routeCasing: c })),
    colorRow('Our stops', () => o.getPrefs().stopColor, (c) => set({ stopColor: c })),
    colorRow('Border posts', () => o.getPrefs().borderColor, (c) => set({ borderColor: c })),
    colorRow('Towns', () => o.getPrefs().landmarkColors.towns, (c) => set({ landmarkColors: { ...o.getPrefs().landmarkColors, towns: c } })),
    colorRow('Fuel', () => o.getPrefs().landmarkColors.fuel, (c) => set({ landmarkColors: { ...o.getPrefs().landmarkColors, fuel: c } })),
    colorRow('Services', () => o.getPrefs().landmarkColors.services, (c) => set({ landmarkColors: { ...o.getPrefs().landmarkColors, services: c } })),
  );
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-ghost';
  reset.textContent = 'Reset colours';
  reset.addEventListener('click', () => {
    const d = DEFAULT_PREFS;
    set({ routeColor: d.routeColor, routeCasing: d.routeCasing, stopColor: d.stopColor, borderColor: d.borderColor, landmarkColors: { ...d.landmarkColors } });
    refreshPreview();
    for (const s of colorRows) s();
  });
  secColors.appendChild(reset);
  refreshPreview();

  // Offline
  const secOffline = section('offline', 'Offline files');
  renderOfflineRows(secOffline, o.offlineFiles);

  // My edits
  const secEdits = section('my-edits', 'My edits');
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
  secEdits.append(actions, fileInput, msg);

  body.append(secType, secDetails, secColors, secOffline, secEdits);
  renderPeek();
}

function chip(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `chip${active ? ' is-active' : ''}`;
  b.textContent = label;
  b.addEventListener('pointerdown', (e) => e.stopPropagation()); // don't start a drawer drag
  b.addEventListener('click', onClick);
  return b;
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
  const input = document.createElement('input');
  input.type = 'color';
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
