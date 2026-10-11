/**
 * Keyword search over the team memory, with an honest label on the results.
 *
 * Ranking is BM25, the classic search-engine formula: a passage scores higher
 * when it contains more of the query's words, when those words are rare in
 * the whole memory (a rare word like "pyodide" tells you more than "team"),
 * and when it is short (one matching word in a 2-line bullet counts for more
 * than in a 40-line table). Written by hand, not taken from a library, so every
 * number can be explained.
 *
 * Keyword overlap measures topic, not answers: a passage can share every word
 * of a question and still lack the fact asked for. So search never claims to
 * have the answer. It labels results "closest" (here are the nearest passages:
 * check whether they answer it) or "nothing related" (the question isn't about
 * our memory). Deciding whether a passage holds the answer is section 2's job.
 *
 * Pure: takes passages (see corpus.ts), returns results. No file access.
 */
import type { Passage } from "./corpus";
import { SYNONYM_GROUPS } from "./synonyms";

// ---------------------------------------------------------------------------
// Words: stop words, word endings, tokenising
// ---------------------------------------------------------------------------

/** Common words that match almost every passage and so only add noise. */
const STOP_WORDS = new Set(
  (
    "a an the and or but if of to in on at by for with from as is are was were be been being it its " +
    "this that these those i we you he she they them our your my me us do does did doing done have has " +
    "had not no so than then there here what which who whom how why when where can could should would " +
    "will shall may might must just also into out up about all any each more most other some such same " +
    "too very get got let don won isn doesn didn aren wasn" // last ones: halves of "don't", "won't", …
  ).split(" ")
);

const VOWELS = "aeiou";

/** Is the letter at `i` a consonant? "y" counts as a vowel after a consonant ("by", "query"). */
function isConsonant(w: string, i: number): boolean {
  if (VOWELS.includes(w[i])) return false;
  if (w[i] === "y") return i === 0 || !isConsonant(w, i - 1);
  return true;
}

/** Number of vowel→consonant switches, Porter's "measure": "tr"=0, "not"=1, "provid"=2. */
function measure(w: string): number {
  let m = 0;
  for (let i = 1; i < w.length; i++) if (isConsonant(w, i) && !isConsonant(w, i - 1)) m++;
  return m;
}

/** Ends consonant-vowel-consonant, last not w/x/y: "not", "mak", "clos" (short words that keep their "e"). */
function endsCvc(w: string): boolean {
  const n = w.length;
  return n >= 3 && isConsonant(w, n - 3) && !isConsonant(w, n - 2) && isConsonant(w, n - 1) && !"wxy".includes(w[n - 1]);
}

const hasVowel = (w: string) => [...w].some((_, i) => !isConsonant(w, i));

/**
 * Common words in our memory that the rules below would get wrong, mapped to
 * their stem directly: "used" would become "us" and "added" "ad", and
 * "agree" would lose its "e" while "agreed" keeps its "-eed".
 */
const IRREGULAR: Record<string, string> = Object.assign(Object.create(null), {
  use: "use", used: "use", uses: "use", using: "use",
  add: "add", added: "add", adds: "add", adding: "add",
  agree: "agree", agreed: "agree", agrees: "agree", agreeing: "agree",
});

/**
 * Strip common English word endings so "crashes", "crashed" and "crash" match.
 * A light stemmer: plurals, -ly, -ed/-ing, then Porter's rule for a final "e"
 * (keep it on short words like "note" and "make", drop it on longer ones like
 * "provide"), which is what keeps "notes" → "note" (not "not") and makes
 * "making" and "make" agree. A short exceptions list (above) covers a few
 * common words the rules get wrong. Not a dictionary: irregular words ("made") and a
 * few odd cases stay unmatched, which is fine for a ranking signal.
 */
export function stem(word: string): string {
  if (word in IRREGULAR) return IRREGULAR[word];
  // Words of 3 letters or fewer are left alone ("one" must not become "on").
  if (word.length <= 3 || !/^[a-z]+$/.test(word)) return word;
  let w = word;

  // Plurals and "-s" verbs: processes → process, queries → query, fixes → fix, notes → note.
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies") && w.length > 4) w = w.slice(0, -3) + "y";
  else if (/(ch|sh|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && w.length > 3 && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);

  // -ly only on longer words, so "family", "supply", "early" stay whole.
  if (w.endsWith("ly") && w.length >= 7) w = w.slice(0, -2);

  // -ed / -ing: tried → try, running → run, making → make, tested → test.
  // Not "-eed" (need, speed) and not when no vowel would be left (thing, shed).
  if (w.endsWith("ied") && w.length > 4) w = w.slice(0, -3) + "y";
  else {
    const m = /^(.+?)(ed|ing)$/.exec(w);
    if (m && !w.endsWith("eed") && m[1].length >= 3 && hasVowel(m[1])) {
      w = m[1];
      if (/([^aeiouslz])\1$/.test(w)) w = w.slice(0, -1); // runn → run (but keep "fill", "miss")
      else if (measure(w) === 1 && endsCvc(w)) w += "e"; // mak → make, clos → close
    }
  }

  // Final "e" (Porter step 5): drop it on longer words (provide → provid, so it
  // matches "provided"); keep it on short consonant-vowel-consonant ones (note, make).
  if (w.endsWith("e") && w.length > 4) {
    const base = w.slice(0, -1);
    const m = measure(base);
    if (m > 1 || (m === 1 && !endsCvc(base))) w = base;
  }
  return w;
}
// A run of letters/digits (any alphabet) that may hold . _ / - # inside it:
// "anthropicprovider.ts", "#8", "one-on-one", "5.2.0". It can't end in . _ / -
// ("end." gives "end"), which also keeps matching linear on long runs of dots.
const CHUNK = /[\p{L}\p{N}#](?:[\p{L}\p{N}#._/-]*[\p{L}\p{N}#])?/gu;
const NOT_LETTER_OR_DIGIT = /[^\p{L}\p{N}]+/u;
// Chinese, Japanese and Korean are written without spaces, so a run of them
// is cut off from neighbouring Latin text: "我们为什么使用DuckDB" → "我们为什么使用" + "duckdb".
const CJK_RUN = /([\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]+)/gu;

/** One chunk of text: the whole chunk if it holds punctuation (else null), and its words. */
interface WordGroup {
  whole: string | null;
  /** Each word as written (lowercase) and as a search term (stemmed). Stop words left out. */
  parts: { word: string; term: string }[];
}

/**
 * Split text into word groups. A chunk with punctuation inside (a file name,
 * "#8", "one-on-one") keeps its whole form, unstemmed, next to its parts.
 * Single Latin letters are dropped; digits and other scripts are kept.
 */
function wordGroups(text: string): WordGroup[] {
  const groups: WordGroup[] = [];
  for (const chunk of text.toLowerCase().replace(CJK_RUN, " $1 ").match(CHUNK) ?? []) {
    const words = chunk.split(NOT_LETTER_OR_DIGIT).filter(Boolean);
    const whole = words.length > 0 && words.join("") !== chunk ? chunk : null;
    const parts = words
      .filter((w) => !STOP_WORDS.has(w) && !(w.length < 2 && /[a-z]/.test(w)))
      .map((word) => ({ word, term: stem(word) }));
    if (whole || parts.length > 0) groups.push({ whole, parts });
  }
  return groups;
}

/**
 * Turn text into search terms (how passages are indexed). A compound like
 * `anthropicProvider.ts` gives the whole name AND its parts, so both an exact
 * `anthropicProvider.ts` and a plain `anthropicProvider` find it.
 */
export function tokenize(text: string): string[] {
  return wordGroups(text).flatMap((g) => [...(g.whole ? [g.whole] : []), ...g.parts.map((p) => p.term)]);
}

/** One word as a search term: exact if it holds punctuation, stemmed otherwise. */
export function normalizeTerm(word: string): string {
  const w = word.toLowerCase();
  return /^[\p{L}\p{N}]+$/u.test(w) ? stem(w) : w;
}

/** term → index of its synonym group. */
const GROUP_OF = new Map<string, number>();
SYNONYM_GROUPS.forEach((group, g) => group.forEach((w) => GROUP_OF.set(normalizeTerm(w), g)));
const GROUP_TERMS = SYNONYM_GROUPS.map((group) => group.map(normalizeTerm));

// ---------------------------------------------------------------------------
// BM25 ranking
// ---------------------------------------------------------------------------

/** BM25's two standard knobs: k1 = how fast repeats of a word stop counting, b = how much long passages are penalised. */
const K1 = 1.2;
const B = 0.75;
/** A synonym match counts a bit less than the word the person actually typed. */
const SYNONYM_WEIGHT = 0.8;

export interface SearchIndex {
  passages: Passage[];
  /** Per passage: how often each term occurs in it. */
  termCounts: Map<string, number>[];
  /** Per passage: number of terms. */
  lengths: number[];
  avgLength: number;
  /** term → how many passages contain it. */
  docFreq: Map<string, number>;
}

/** Count every passage's terms once, so each search is just arithmetic. */
export function buildIndex(passages: Passage[]): SearchIndex {
  const termCounts = passages.map((p) => {
    const counts = new Map<string, number>();
    for (const t of tokenize(p.text)) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
  });
  const lengths = termCounts.map((c) => [...c.values()].reduce((a, b) => a + b, 0));
  const docFreq = new Map<string, number>();
  for (const counts of termCounts) for (const t of counts.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length);
  return { passages, termCounts, lengths, avgLength, docFreq };
}

/**
 * Inverse document frequency: high for rare terms, near 0 for terms in every
 * passage. A term found nowhere gets the highest value.
 */
function idf(index: SearchIndex, term: string): number {
  const n = index.passages.length;
  const df = index.docFreq.get(term) ?? 0;
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

/** BM25 contribution of one term to one passage, using the given idf. */
function termScore(index: SearchIndex, term: string, termIdf: number, i: number): number {
  const tf = index.termCounts[i].get(term) ?? 0;
  if (tf === 0) return 0;
  const lengthNorm = 1 - B + (B * index.lengths[i]) / index.avgLength;
  return (termIdf * tf * (K1 + 1)) / (tf + K1 * lengthNorm);
}

// ---------------------------------------------------------------------------
// The query as "concepts": one idea, scored once
// ---------------------------------------------------------------------------

/** A word the person typed, and the ways a passage can match it (itself, or a synonym at 0.8). */
interface Word {
  word: string;
  term: string;
  idf: number;
  /** Does the word or one of its synonyms appear anywhere in the memory? */
  known: boolean;
  ways: { term: string; idf: number; weight: number; label: string }[];
}

/** One way of writing the idea: a plain word, or a compound with its parts. */
interface Form {
  /**
   * Exact forms: the compound as written ("anthropicprovider.ts") and, for a
   * path, its file name too ("packages/ai/src/anthropicprovider.ts" also
   * matches a passage that only says "anthropicprovider.ts"). Empty for a plain word.
   */
  exacts: Word[];
  /** Per exact form: the summed idf of this form's parts that it contains. */
  exactCoveredIdf: number[];
  /** Its words: one for a plain word, several for a compound. */
  parts: Word[];
}

/**
 * One idea in the query. Usually one Form; several when the query wrote the
 * same idea twice ("Slack-style … Slack") or used two words from one synonym
 * group ("nightly daily"). Then the idea counts once, as its best Form.
 */
interface Concept {
  forms: Form[];
  /** How much the concept counts: the sum of its words' idf (for its largest form). */
  weight: number;
  /** Share of that weight the memory knows (some word or synonym of it appears somewhere), 0–1. */
  known: number;
}

function makeWord(index: SearchIndex, word: string, term: string): Word {
  const termIdf = idf(index, term);
  const ways = [{ term, idf: termIdf, weight: 1, label: term }];
  const g = GROUP_OF.get(term);
  // A synonym scores with the typed word's idf when that is lower, so a rare
  // synonym can't outrank the word the person actually typed.
  for (const syn of g === undefined ? [] : GROUP_TERMS[g]) {
    if (syn !== term) ways.push({ term: syn, idf: Math.min(termIdf, idf(index, syn)), weight: SYNONYM_WEIGHT, label: `${term}→${syn}` });
  }
  return { word, term, idf: termIdf, known: ways.some((w) => index.docFreq.has(w.term)), ways };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Union-find over form indexes: merging stays near-linear even for long queries. */
function unionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => void (parent[find(a)] = find(b));
  return { find, union };
}

function queryConcepts(index: SearchIndex, query: string): Concept[] {
  const forms: Form[] = wordGroups(query).map((g) => {
    const exacts = g.whole ? [g.whole] : [];
    const fileName = g.whole?.split("/").pop();
    if (fileName && fileName !== g.whole && /[^\p{L}\p{N}]/u.test(fileName)) exacts.push(fileName);
    // A word repeated inside one compound ("one-on-one") counts once.
    const parts = [...new Map(g.parts.map((p) => [p.term, p])).values()];
    const partWords = parts.map((p) => makeWord(index, p.word, p.term));
    return {
      exacts: exacts.map((e) => makeWord(index, e, e)),
      exactCoveredIdf: exacts.map((e) => {
        const inside = new Set(tokenize(e));
        return sum(partWords.filter((p) => inside.has(p.term)).map((p) => p.idf));
      }),
      parts: partWords,
    };
  });

  // Merge forms that are the same idea into one concept: the same plain word
  // twice, two words of one synonym group ("nightly daily"), the same exact
  // compound or file name twice, or a plain word that is part of a compound
  // ("Slack-style … Slack"). Two compounds that only share a part (two file
  // names ending in ".ts") stay separate ideas.
  const { find, union } = unionFind(forms.length);
  const firstWithKey = new Map<string, number>();
  const link = (key: string, i: number) => {
    const j = firstWithKey.get(key);
    if (j === undefined) firstWithKey.set(key, i);
    else union(i, j);
  };
  const isPlain = (f: Form) => f.exacts.length === 0;
  forms.forEach((f, i) => {
    for (const e of f.exacts) link(`exact:${e.term}`, i);
    const words = isPlain(f) ? f.parts : f.exacts;
    for (const w of words) {
      if (isPlain(f)) link(`word:${w.term}`, i);
      const g = GROUP_OF.get(w.term);
      if (g !== undefined) link(`group:${g}`, i);
    }
  });
  forms.forEach((f, i) => {
    if (isPlain(f)) return;
    for (const p of f.parts) {
      const j = firstWithKey.get(`word:${p.term}`);
      if (j !== undefined) union(i, j);
    }
  });
  const byRoot = new Map<number, Form[]>();
  forms.forEach((f, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), f]));

  return [...byRoot.values()].map((cForms) => {
    // Weigh a compound like the same words written with spaces: the sum of its
    // parts' idf, with only the parts the memory knows counting as known (so
    // "kubernetes-based" isn't "known" just because "based" is). An exact
    // compound that appears in the memory is fully known.
    const weightOf = (f: Form) => (f.parts.length > 0 ? sum(f.parts.map((p) => p.idf)) : Math.max(0, ...f.exacts.map((e) => e.idf)));
    const knownOf = (f: Form) => {
      if (f.exacts.some((e) => e.known)) return 1;
      if (f.parts.length === 0) return 0;
      return sum(f.parts.filter((p) => p.known).map((p) => p.idf)) / weightOf(f);
    };
    return { forms: cForms, weight: Math.max(...cForms.map(weightOf)), known: Math.max(...cForms.map(knownOf)) };
  });
}

/** Best score of one word in passage i, and how it matched. */
function wordScore(index: SearchIndex, w: Word, i: number): { score: number; label: string } {
  let best = { score: 0, label: "" };
  for (const way of w.ways) {
    const s = way.weight * termScore(index, way.term, way.idf, i);
    if (s > best.score) best = { score: s, label: way.label };
  }
  return best;
}

/**
 * Score of one form in passage i, and the share of its words matched.
 *
 * A plain word: its BM25 score. A compound: the better of
 *  - the exact compound's score, and
 *  - the sum of its matched parts' scores × the share (by idf) of its parts
 *    that matched.
 * The share stops a generic part ("ts", "src", "doc") from ranking a passage
 * that only shares that part above the one with the exact file name, while a
 * passage matching most parts of a path still scores high.
 */
function formScore(index: SearchIndex, f: Form, i: number): { score: number; share: number; labels: string[] } {
  const parts = f.parts.map((p) => ({ p, ...wordScore(index, p, i) }));
  const matched = parts.filter((x) => x.score > 0);
  const share = f.parts.length > 0 ? sum(matched.map((x) => x.p.idf)) / sum(f.parts.map((p) => p.idf)) : 0;
  const byParts = { score: sum(matched.map((x) => x.score)) * share, share, labels: matched.map((x) => x.label) };
  // An exact match is evidence for every part it contains, so it scores as
  // its own BM25 × (idf of the parts it covers / its own idf), and covers
  // that share of the form. "anthropicprovider.ts" inside a path query then
  // counts like matching both "anthropicprovider" and "ts", not like one word.
  let best = byParts;
  for (const [k, e] of f.exacts.entries()) {
    const { score, label } = wordScore(index, e, i);
    if (score === 0) continue;
    const coveredIdf = f.exactCoveredIdf[k];
    const exactShare = f.parts.length > 0 ? coveredIdf / sum(f.parts.map((p) => p.idf)) : 1;
    const exactScore = coveredIdf > 0 ? (score * coveredIdf) / e.idf : score;
    if (exactScore > best.score) best = { score: exactScore, share: exactShare, labels: [label] };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Search and the label
// ---------------------------------------------------------------------------

/**
 * "closest": here are the nearest passages; check whether they answer it.
 * "nothing related": no word of the question matches anything in the memory.
 */
export type MatchLabel = "closest" | "nothing related";

export interface SearchResult {
  passage: Passage;
  score: number;
  /** How the passage matched (a synonym shows as "endless→infinit"). */
  matched: string[];
}

export interface SearchResponse {
  /**
   * About the question, not the page of results: with `limit` 0 a query can be
   * "closest" with an empty `results`. Callers print a header only over a
   * non-empty list.
   */
  label: MatchLabel;
  results: SearchResult[];
  /** Share of the query's weight (rare words weigh more) that the top result matched, 0–1. */
  coverage: number;
  /** Share of the query's weight that appears anywhere in the memory, 0–1. */
  knownShare: number;
  /** There are results and knownShare < LOW_OVERLAP_SHARE: warn that the passages may be unrelated. */
  lowOverlap: boolean;
  /** Words of the question found nowhere in the memory (nor any synonym), as typed (lowercase). */
  unknownTerms: string[];
  /** The question was longer than MAX_QUERY_CHARS and only its start was searched. */
  truncated: boolean;
}

/** Longer questions are cut to this many characters: a question, not a document, keeps search fast. */
export const MAX_QUERY_CHARS = 2000;

/*
 * When to say what. The owner's top rule: hiding a real answer is the worst
 * failure. So search never hides passages because of a score or a ratio:
 *
 * - "nothing related" only when no word of the question (or a synonym)
 *   matches any passage at all, i.e. there are no results.
 * - Otherwise "closest", with the passages. If much of the question's weight
 *   is words our notes never use, `lowOverlap` is set and `unknownTerms`
 *   lists them, so the CLI can warn "these passages may be unrelated".
 *
 *   known share = sum of the weights (idf) of the query words that appear
 *                 anywhere in the memory / sum of the weights of all words
 *
 * Why not hide on a cut? Earlier rounds tried the top passage's coverage
 * (answerable went as low as 0.15, off-topic as high as 0.28) and known share
 * (off-topic up to 0.77, answerable down to 0.30 on casual wording like
 * "whats the deal with pkill"). Neither separates the two, and every cut hid
 * some correct rank-1 passages. One unknown word ("ditch") is enough to drag
 * a short question down, because a word found nowhere gets the highest idf.
 *
 * LOW_OVERLAP_SHARE = 0.5 is the warning line: below it, most of what was
 * asked (by importance) isn't in our notes. On Casebench 1's calibration set it
 * flagged 2 of 4 off-topic questions and 0 of 14 answerable ones (that eval set
 * stayed with Casebench 1; write a new one once this memory has content). It only adds a warning, so a
 * wrong side costs a sentence, not a hidden answer.
 *
 * Only ratios are used, never an absolute BM25 score: scores grow with the
 * size of the memory (idf ~ log of the number of passages), so a fixed score
 * floor would drift as the notes grow. A share of the query's weight doesn't.
 */
export const LOW_OVERLAP_SHARE = 0.5;

/**
 * Rank passages for a question and label the result set.
 *
 * Each query concept adds the score of its best form (see formScore), so it
 * counts once. Ties are broken by file and line, so the same query on the same
 * passages always gives the same output.
 */
export function search(index: SearchIndex, query: string, limit = 3): SearchResponse {
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError(`limit must be a whole number ≥ 0, got ${limit}`);
  const truncated = query.length > MAX_QUERY_CHARS;
  const concepts = queryConcepts(index, truncated ? query.slice(0, MAX_QUERY_CHARS) : query);

  // Ideas none of whose words appear anywhere can't score; skip them (fast for long, unknown-heavy queries).
  const matchable = concepts.filter((c) =>
    c.forms.some((f) => [...f.exacts, ...f.parts].some((w) => w.ways.some((way) => index.docFreq.has(way.term))))
  );
  const scored = index.passages.map((passage, i) => {
    let score = 0;
    let covered = 0;
    const matched: string[] = [];
    for (const c of matchable) {
      const best = c.forms.map((f) => formScore(index, f, i)).reduce((a, b) => (b.score > a.score ? b : a));
      if (best.score <= 0) continue;
      score += best.score;
      covered += c.weight * best.share;
      matched.push(...best.labels);
    }
    return { passage, score, matched, covered };
  });

  const ranked = scored
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.passage.file.localeCompare(b.passage.file) ||
        a.passage.startLine - b.passage.startLine
    );

  const total = sum(concepts.map((c) => c.weight));
  const coverage = ranked.length > 0 && total > 0 ? ranked[0].covered / total : 0;
  const knownShare = total > 0 ? sum(concepts.map((c) => c.weight * c.known)) / total : 0;
  const unknownTerms = [
    ...new Set(concepts.flatMap((c) => c.forms.flatMap((f) => f.parts.filter((p) => !p.known).map((p) => p.word)))),
  ];
  return {
    label: ranked.length > 0 ? "closest" : "nothing related",
    results: ranked.slice(0, limit).map(({ passage, score, matched }) => ({ passage, score, matched })),
    coverage,
    knownShare,
    // No warning over an empty answer: "nothing related" already says it.
    lowOverlap: ranked.length > 0 && knownShare < LOW_OVERLAP_SHARE,
    unknownTerms,
    truncated,
  };
}
