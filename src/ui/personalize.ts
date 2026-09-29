import { CASING_PRESETS, DEFAULT_PREFS, ROUTE_COLOR_PRESETS, type Prefs } from '../prefs';
import { openSheet } from './bottomSheet';

export interface PersonalizeOptions {
  sheetParent: HTMLElement;
  getPrefs: () => Prefs;
  onChange: (prefs: Prefs) => void;
}

/** Bottom sheet: route line colour and highlight (casing) colour. */
export function openPersonalize(o: PersonalizeOptions): void {
  const content = document.createElement('div');
  content.className = 'sheet-body';

  const preview = document.createElement('div');
  preview.className = 'route-preview';
  const casing = document.createElement('div');
  casing.className = 'route-preview-casing';
  const line = document.createElement('div');
  line.className = 'route-preview-line';
  casing.appendChild(line);
  preview.appendChild(casing);
  const refresh = () => {
    const p = o.getPrefs();
    casing.style.background = p.routeCasing;
    line.style.background = p.routeColor;
  };

  content.append(
    preview,
    swatchSection('Route colour', ROUTE_COLOR_PRESETS, () => o.getPrefs().routeColor, (c) => {
      o.onChange({ ...o.getPrefs(), routeColor: c });
      refresh();
    }),
    swatchSection('Highlight (outline) colour', CASING_PRESETS, () => o.getPrefs().routeCasing, (c) => {
      o.onChange({ ...o.getPrefs(), routeCasing: c });
      refresh();
    }),
  );

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'btn btn-ghost';
  reset.textContent = 'Reset colours';
  reset.addEventListener('click', () => {
    o.onChange({ ...o.getPrefs(), routeColor: DEFAULT_PREFS.routeColor, routeCasing: DEFAULT_PREFS.routeCasing });
    refresh();
    for (const el of content.querySelectorAll<HTMLElement>('.swatch')) {
      el.classList.toggle('is-active', el.dataset.color === o.getPrefs().routeColor || el.dataset.color === o.getPrefs().routeCasing);
    }
  });
  content.appendChild(reset);
  refresh();
  openSheet(o.sheetParent, 'Personalize', content);
}

function swatchSection(title: string, presets: string[], current: () => string, pick: (c: string) => void): HTMLElement {
  const s = document.createElement('section');
  s.className = 'sheet-section';
  const h = document.createElement('h3');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'swatches';
  const mark = () => {
    for (const el of row.querySelectorAll<HTMLElement>('.swatch')) {
      el.classList.toggle('is-active', el.dataset.color === current());
    }
  };
  for (const c of presets) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.dataset.color = c;
    b.style.background = c;
    b.setAttribute('aria-label', c);
    b.addEventListener('click', () => {
      pick(c);
      mark();
    });
    row.appendChild(b);
  }
  const custom = document.createElement('label');
  custom.className = 'swatch swatch-custom';
  custom.title = 'Custom colour';
  const input = document.createElement('input');
  input.type = 'color';
  input.value = current();
  input.addEventListener('input', () => {
    pick(input.value);
    mark();
  });
  custom.appendChild(input);
  row.appendChild(custom);
  s.append(h, row);
  mark();
  return s;
}
