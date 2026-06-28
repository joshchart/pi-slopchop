import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { buildStructuredDiff } from "../diff.js";
import { createInitialReviewState, startVisualSelection, upsertLineCommentRange } from "../state.js";
import type { ReviewFile } from "../types.js";
import { buildDisplayRows, getSelectedRangeStatusComment, getVisualSelectionJumpBlockMessage, moveLineTargetBySteps, wrapUiLines } from "../ui/review-app.js";

describe("buildDisplayRows", () => {
  it("keeps deleted and added rows independently commentable when line numbers overlap", () => {
    const diff = buildStructuredDiff(
      ["alpha", "removed", "kept"].join("\n") + "\n",
      ["alpha", "kept"].join("\n") + "\n",
      3,
    );

    const rowsAtLineTwo = buildDisplayRows(diff)
      .filter((row) => row.displayLineNumber === 2);

    expect(rowsAtLineTwo).toHaveLength(2);
    expect(rowsAtLineTwo.map((row) => ({
      kind: row.kind,
      commentLineNumber: row.commentLineNumber,
      commentSide: row.commentSide,
    }))).toEqual([
      { kind: "removed", commentLineNumber: 2, commentSide: "deleted" },
      { kind: "context", commentLineNumber: 2, commentSide: "added" },
    ]);
  });
});

function makeFile(path: string): ReviewFile {
  return {
    id: path,
    path,
    worktreeStatus: null,
    hasWorkingTreeFile: true,
    inGitDiff: true,
    inLastCommit: false,
    gitDiff: null,
    lastCommit: null,
  };
}

describe("wrapUiLines", () => {
  it("wraps long helper text to the available width", () => {
    const lines = wrapUiLines(
      ["Use f/d for line, l for file, or a for all."],
      20,
    );

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => visibleWidth(line) <= 20)).toBe(true);
  });
});

describe("visual selection jump behavior", () => {
  it("blocks non-contiguous diff jumps while a visual selection is active", () => {
    expect(getVisualSelectionJumpBlockMessage(false)).toBeNull();
    expect(getVisualSelectionJumpBlockMessage(true)).toBe(
      "Visual selection only supports contiguous line movement. Press Esc to clear the selection first.",
    );
  });

  it("supports counted contiguous movement without crossing hidden gaps", () => {
    const targets = [
      { side: "added" as const, line: 10 },
      { side: "added" as const, line: 11 },
      { side: "added" as const, line: 12 },
      { side: "added" as const, line: 20 },
      { side: "added" as const, line: 21 },
    ];

    expect(moveLineTargetBySteps(targets, targets[0]!, 2, true)).toEqual({ side: "added", line: 12 });
    expect(moveLineTargetBySteps(targets, targets[0]!, 5, true)).toEqual({ side: "added", line: 12 });
    expect(moveLineTargetBySteps(targets, targets[2]!, 1, false)).toEqual({ side: "added", line: 20 });
  });
});

describe("selected range status", () => {
  it("only marks an exact selected range as commented", () => {
    const files = [makeFile("src/a.ts")];
    let state = createInitialReviewState(files);
    state = upsertLineCommentRange(state, "src/a.ts", "git-diff", "added", 10, 14, "Range note");
    state = startVisualSelection(state, "src/a.ts", "git-diff", { side: "added", line: 11 });

    expect(getSelectedRangeStatusComment(
      state,
      "src/a.ts",
      "git-diff",
      { side: "added", startLine: 11, endLine: 12 },
    )).toBeUndefined();

    expect(getSelectedRangeStatusComment(
      state,
      "src/a.ts",
      "git-diff",
      { side: "added", startLine: 10, endLine: 14 },
    )?.body).toBe("Range note");
  });
});
