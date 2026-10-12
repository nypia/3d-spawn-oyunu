type TagOf<S extends string> = S extends `${infer T}.${string}` ? T : S;
type ElementOf<S extends string> =
  TagOf<S> extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[TagOf<S>] : HTMLElement;

/** Küçük DOM yardımcısı: h('div.class', {attr}, ...children) */
export function h<S extends string>(
  tag: S,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): ElementOf<S> {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name) as ElementOf<S>;
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const c of children) el.append(c);
  return el;
}

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
