import { describe, expect, it } from "vitest";
import { listTasks, getTask } from "../tasks";
import { inlineCode, rstCodeSpans } from "./inlineCode";

describe("inlineCode (our own text)", () => {
  it("turns `name` into code without the backticks", () => {
    expect(inlineCode("`_weighted_percentile` is a helper, with `average=True`.")).toEqual([
      { code: true, text: "_weighted_percentile" },
      { code: false, text: " is a helper, with " },
      { code: true, text: "average=True" },
      { code: false, text: "." },
    ]);
  });

  it("leaves text without backticks, and a lone backtick, as plain text", () => {
    expect(inlineCode("plain")).toEqual([{ code: false, text: "plain" }]);
    expect(inlineCode("a ` b")).toEqual([{ code: false, text: "a ` b" }]);
    expect(inlineCode("")).toEqual([]);
  });
});

describe("rstCodeSpans (quoted upstream text)", () => {
  it("marks ``literals`` and :role:`targets` as code, keeping every character", () => {
    const q = "Fixed ``_weighted_percentile`` with ``average=True``; see :func:`metrics.d2_pinball_score` and `n_splits`.";
    const segs = rstCodeSpans(q);
    expect(segs.filter((s) => s.code).map((s) => s.text)).toEqual([
      "``_weighted_percentile``",
      "``average=True``",
      ":func:`metrics.d2_pinball_score`",
      "`n_splits`",
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(q);
  });

  it("keeps every real quote word for word when its parts are joined back", () => {
    for (const { slug } of listTasks()) {
      for (const q of getTask(slug)!.about.quotes) expect(rstCodeSpans(q.text).map((s) => s.text).join(""), slug).toBe(q.text);
    }
  });
});
