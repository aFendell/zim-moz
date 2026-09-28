import type { Leg, MergedLocation } from '../data/types';
import { formatKm } from '../data/legs';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderLocationCard(
  loc: MergedLocation,
  legIn: Leg | undefined,
  legOut: Leg | undefined,
  baseUrl: string,
  onEdit: (id: string) => void,
): HTMLElement {
  const card = el('div', 'card');
  if (loc.image) {
    const img = el('img', 'card-img');
    img.src = baseUrl + loc.image;
    img.alt = loc.name;
    card.appendChild(img);
  }
  const head = el('div', 'card-head');
  head.appendChild(el('h2', 'card-title', loc.name));
  if (loc.type === 'border') head.appendChild(el('span', 'badge badge-border', 'border'));
  if (loc.modified) head.appendChild(el('span', 'badge badge-modified', 'modified'));
  card.appendChild(head);

  const dist = el('div', 'card-dist');
  if (legIn) dist.appendChild(el('span', undefined, `↦ from previous: ${formatKm(legIn.distanceKm, legIn.source)}`));
  if (legOut) dist.appendChild(el('span', undefined, `↦ to next: ${formatKm(legOut.distanceKm, legOut.source)}`));
  if (legIn || legOut) card.appendChild(dist);

  if (loc.description) card.appendChild(el('p', 'card-desc', loc.description));
  if (loc.type === 'border') {
    const dl = el('dl', 'card-border');
    for (const [k, v] of [
      ['Documents', loc.documents],
      ['Fees', loc.fees],
      ['Hours', loc.hours],
    ] as const) {
      if (!v) continue;
      dl.appendChild(el('dt', undefined, k));
      dl.appendChild(el('dd', undefined, v));
    }
    if (dl.childElementCount) card.appendChild(dl);
  }
  if (loc.notes) card.appendChild(el('p', 'card-notes', loc.notes));

  const actions = el('div', 'card-actions');
  const edit = el('button', 'btn btn-small', 'Edit');
  edit.type = 'button';
  edit.addEventListener('click', () => onEdit(loc.id));
  actions.appendChild(edit);
  card.appendChild(actions);
  return card;
}
