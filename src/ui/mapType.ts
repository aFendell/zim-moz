import type { Flavor, LandmarkGroup, Prefs } from '../prefs';
import { openSheet } from './bottomSheet';

export interface MapTypeOptions {
  parent: HTMLElement;
  sheetParent: HTMLElement;
  getPrefs: () => Prefs;
  onChange: (prefs: Prefs) => void;
  terrainReady: () => Promise<boolean>;
}

const TYPES: { flavor: Flavor; label: string; swatch: [string, string, string] }[] = [
  { flavor: 'light', label: 'Day', swatch: ['#e8e6dc', '#c6dfb8', '#80c9e0'] },
  { flavor: 'dark', label: 'Night', swatch: ['#1f2227', '#2a3a2e', '#1b3a4a'] },
  { flavor: 'grayscale', label: 'Gray', swatch: ['#e6e6e6', '#d0d0d0', '#bdbdbd'] },
];

const GROUPS: { id: LandmarkGroup; label: string; hint: string }[] = [
  { id: 'towns', label: 'Towns & villages', hint: 'Named places along the route' },
  { id: 'fuel', label: 'Fuel stations', hint: 'From OpenStreetMap, within 2.5 km of the route' },
  { id: 'services', label: 'Hospitals, police, ATMs', hint: '' },
];

/** Google-Maps-style "Map type" button + bottom sheet. */
export function mountMapTypeButton(o: MapTypeOptions): void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn sheet-opener';
  btn.innerHTML = '<span aria-hidden="true">◧</span>';
  btn.setAttribute('aria-label', 'Map type and details');
  btn.addEventListener('click', () => void open());
  o.parent.appendChild(btn);

  const open = async () => {
    const prefs = o.getPrefs();
    const content = document.createElement('div');
    content.className = 'sheet-body';

    const sec1 = section('Map type');
    const grid = document.createElement('div');
    grid.className = 'type-grid';
    for (const t of TYPES) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `type-card${prefs.flavor === t.flavor ? ' is-active' : ''}`;
      const sw = document.createElement('div');
      sw.className = 'type-swatch';
      sw.style.background = `linear-gradient(135deg, ${t.swatch[0]} 0 45%, ${t.swatch[1]} 45% 70%, ${t.swatch[2]} 70%)`;
      const lbl = document.createElement('span');
      lbl.textContent = t.label;
      card.append(sw, lbl);
      card.addEventListener('click', () => {
        o.onChange({ ...o.getPrefs(), flavor: t.flavor });
        for (const c of grid.querySelectorAll('.type-card')) c.classList.remove('is-active');
        card.classList.add('is-active');
      });
      grid.appendChild(card);
    }
    sec1.appendChild(grid);

    const sec2 = section('Map details');
    const terrainRow = toggleRow('Terrain (hillshade)', '', prefs.terrain, (on) =>
      o.onChange({ ...o.getPrefs(), terrain: on }),
    );
    sec2.appendChild(terrainRow.row);
    const ready = await o.terrainReady();
    if (!ready) {
      terrainRow.hint.textContent = navigator.onLine
        ? 'Streams while online. Download it in the offline panel for off-grid use.'
        : 'Not downloaded. Get it from the offline panel when on wifi.';
      if (!navigator.onLine) terrainRow.input.disabled = true;
    }

    const lmRow = toggleRow('Landmarks along the route', '', prefs.landmarks, (on) => {
      o.onChange({ ...o.getPrefs(), landmarks: on });
      sub.hidden = !on;
    });
    sec2.appendChild(lmRow.row);
    const sub = document.createElement('div');
    sub.className = 'toggle-sub';
    sub.hidden = !prefs.landmarks;
    for (const g of GROUPS) {
      const r = toggleRow(g.label, g.hint, prefs.landmarkGroups.includes(g.id), (on) => {
        const cur = o.getPrefs();
        const groups = on ? [...new Set([...cur.landmarkGroups, g.id])] : cur.landmarkGroups.filter((x) => x !== g.id);
        o.onChange({ ...cur, landmarkGroups: groups });
      });
      sub.appendChild(r.row);
    }
    sec2.appendChild(sub);

    content.append(sec1, sec2);
    openSheet(o.sheetParent, 'Map', content);
  };
}

function section(title: string): HTMLElement {
  const s = document.createElement('section');
  s.className = 'sheet-section';
  const h = document.createElement('h3');
  h.textContent = title;
  s.appendChild(h);
  return s;
}

function toggleRow(label: string, hint: string, checked: boolean, onChange: (on: boolean) => void) {
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
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  row.append(text, input);
  return { row, input, hint: h };
}
