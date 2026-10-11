/**
 * Splits text into plain and code parts, for showing identifiers in <code> on the task page.
 * Pure, so the rules are unit-tested (inlineCode.test.ts).
 */
export interface Segment {
  code: boolean;
  text: string;
}

/**
 * Our own text (about.json summary and hint): `name` becomes a code segment without the backticks.
 * A lone backtick with no partner stays as plain text.
 */
export function inlineCode(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /`([^`\n]+)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ code: false, text: text.slice(last, m.index) });
    out.push({ code: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ code: false, text: text.slice(last) });
  return out;
}

/**
 * Quoted upstream text (reStructuredText): ``literal`` and :role:`target` spans become code segments,
 * keeping every character, so the quote on the page is still word for word what was fetched.
 */
export function rstCodeSpans(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /``[^`]+``|:[\w.:+-]+:`[^`]+`|`[^`\n]+`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ code: false, text: text.slice(last, m.index) });
    out.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ code: false, text: text.slice(last) });
  return out;
}
