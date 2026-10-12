/**
 * The coach's hand-written content per task (content/scikit-learn/<slug>/coach.json): three questions
 * that make the student explain their change, each with a rubric of key points. Every point names the
 * real text it comes from (evidence), so the rubric can't drift from the sources
 * (lib/coach/coachContent.test.ts checks every quote).
 */
export interface RubricPoint {
  id: string;
  /** The point in our words, shown to the student after they answer. */
  text: string;
  /** Where it comes from: a file in the task folder (source.md, fix.diff, tests.diff, before/…) or "contributing/…". */
  evidence: { file: string; quote: string };
}

export interface CoachQuestion {
  id: string;
  prompt: string;
  points: RubricPoint[];
}

export interface TaskCoach {
  /** Where the changelog fragment goes: doc/whats_new/upcoming_changes/<folder>/<PR>.<type>.rst */
  changelog: { folder: string; type: string; mentions: string[] };
  questions: CoachQuestion[];
}
