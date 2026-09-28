import type { LocationOverride, MergedLocation } from '../data/types';

export interface SheetCallbacks {
  onSave: (id: string, override: LocationOverride) => void;
  onReset: (id: string) => void;
  onClose: () => void;
}

/** Bottom sheet edit form. One instance, re-rendered per location. */
export class EditSheet {
  private root: HTMLElement;
  private cb: SheetCallbacks;
  private current: MergedLocation | null = null;

  constructor(parent: HTMLElement, cb: SheetCallbacks) {
    this.cb = cb;
    this.root = document.createElement('div');
    this.root.className = 'sheet';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  open(loc: MergedLocation) {
    this.current = loc;
    this.root.innerHTML = '';
    this.root.hidden = false;

    const form = document.createElement('form');
    form.className = 'sheet-form';
    form.noValidate = true;

    const head = document.createElement('div');
    head.className = 'sheet-head';
    const title = document.createElement('strong');
    title.textContent = `Edit: ${loc.name}`;
    const close = button('✕', 'sheet-close', () => this.cb.onClose());
    close.setAttribute('aria-label', 'Close');
    head.append(title, close);
    form.appendChild(head);

    const name = field('Name', 'text', loc.name);
    const description = field('Description', 'textarea', loc.description);
    const notes = field('Notes', 'textarea', loc.notes);
    const lat = field('Latitude', 'number', String(loc.lat), '0.0001');
    const lng = field('Longitude', 'number', String(loc.lng), '0.0001');
    form.append(name.wrap, description.wrap, notes.wrap);
    const coords = document.createElement('div');
    coords.className = 'sheet-coords';
    coords.append(lat.wrap, lng.wrap);
    form.appendChild(coords);

    const err = document.createElement('p');
    err.className = 'sheet-error';
    err.hidden = true;
    form.appendChild(err);

    const actions = document.createElement('div');
    actions.className = 'sheet-actions';
    const save = button('Save', 'btn btn-primary', () => form.requestSubmit());
    save.type = 'submit';
    actions.appendChild(save);
    if (loc.modified) {
      actions.appendChild(button('Reset to original', 'btn btn-ghost', () => this.cb.onReset(loc.id)));
    }
    form.appendChild(actions);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const latV = Number(lat.input.value);
      const lngV = Number(lng.input.value);
      if (!Number.isFinite(latV) || latV < -90 || latV > 90 || !Number.isFinite(lngV) || lngV < -180 || lngV > 180) {
        err.textContent = 'Coordinates out of range.';
        err.hidden = false;
        return;
      }
      const nameV = name.input.value.trim();
      if (!nameV) {
        err.textContent = 'Name is required.';
        err.hidden = false;
        return;
      }
      this.cb.onSave(loc.id, {
        name: nameV,
        description: description.input.value.trim(),
        notes: notes.input.value.trim(),
        lat: latV,
        lng: lngV,
      });
    });

    this.root.appendChild(form);
    name.input.focus();
  }

  close() {
    this.current = null;
    this.root.hidden = true;
    this.root.innerHTML = '';
  }

  get isOpen() {
    return this.current !== null;
  }
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function field(
  label: string,
  kind: 'text' | 'textarea' | 'number',
  value: string,
  step?: string,
): { wrap: HTMLLabelElement; input: HTMLInputElement | HTMLTextAreaElement } {
  const wrap = document.createElement('label');
  wrap.className = 'sheet-field';
  const span = document.createElement('span');
  span.textContent = label;
  let input: HTMLInputElement | HTMLTextAreaElement;
  if (kind === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else {
    input = document.createElement('input');
    input.type = kind;
    if (kind === 'number') {
      input.inputMode = 'decimal';
      if (step) input.step = step;
    }
  }
  input.value = value;
  wrap.append(span, input);
  return { wrap, input };
}
