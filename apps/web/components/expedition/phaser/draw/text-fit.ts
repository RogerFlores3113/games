import { truncateLabel } from "../font/glyphs-5x7";

/** `name` if it fits in `maxChars`, else its last word if that fits, else a
 * truncation with an ellipsis. */
export function fitLabel(name: string, maxChars: number): string {
  if (Array.from(name).length <= maxChars) return name;
  const last = name.split(" ").at(-1) ?? name;
  if (Array.from(last).length <= maxChars) return last;
  return truncateLabel(name, Math.max(1, maxChars));
}

/** Greedy word wrap to lines of at most `maxChars`; an over-long word is cut. */
export function wrapWords(value: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of value.split(" ")) {
    const next = current === "" ? word : `${current} ${word}`;
    if (next.length <= maxChars) {
      current = next;
    } else {
      if (current !== "") lines.push(current);
      current = word.slice(0, maxChars);
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}
