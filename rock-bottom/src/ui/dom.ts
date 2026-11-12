/** A tiny hyperscript helper: h('div', { class: 'card' }, 'text', child) */

export type Child = Node | string | number | null | undefined | false;

type EventHandlers = {
  [K in keyof HTMLElementEventMap as `on${K}`]?: (event: HTMLElementEventMap[K]) => void;
};

export type Props = EventHandlers & {
  class?: string;
  [attribute: string]: unknown;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      element.addEventListener(name.slice(2), value as EventListener);
    } else if (name === 'class') {
      element.className = String(value);
    } else if (value === true) {
      element.setAttribute(name, '');
    } else {
      element.setAttribute(name, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

/** Inline SVG from trusted, hard-coded markup. */
export function svg(markup: string, className = ''): SVGElement {
  const holder = document.createElement('div');
  holder.innerHTML = markup.trim();
  const element = holder.firstElementChild as SVGElement;
  if (className) element.setAttribute('class', className);
  element.setAttribute('aria-hidden', 'true');
  return element;
}

export function formatPoints(value: number): string {
  return value.toLocaleString('en-GB');
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
