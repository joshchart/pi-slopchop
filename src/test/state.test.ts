import { describe, expect, it } from "vitest";
import {
  clampSelectedLineTarget,
  createInitialReviewState,
  getCommentForLine,
  getDefaultScope,
  getFileComment,
  getFilteredFiles,
  getLineComment,
  getLineCommentRange,
  getVisualSelectionRange,
  moveActiveFile,
  moveSelectedCommentIndex,
  moveSelectedLineTarget,
  setScope,
  setSearchQuery,
  startVisualSelection,
  updateVisualSelectionFocus,
  upsertFileComment,
  upsertLineComment,
  upsertLineCommentRange,
} from "../state.js";
import type { ReviewFile } from "../types.js";

function makeFile(path: string, flags?: Partial<ReviewFile>): ReviewFile {
  return {
    id: path,
    path,
    worktreeStatus: null,
    hasWorkingTreeFile: true,
    inGitDiff: true,
    inLastCommit: false,
    gitDiff: null,
    lastCommit: null,
    ...flags,
  };
}

describe("review state", () => {
  it("picks git diff as the default scope when available", () => {
    expect(getDefaultScope([
      makeFile("src/a.ts", { inGitDiff: true }),
      makeFile("src/b.ts", { inGitDiff: false, inLastCommit: true }),
    ])).toBe("git-diff");
  });

  it("switches scopes and keeps selection valid", () => {
    const files = [
      makeFile("src/a.ts", { inGitDiff: true, inLastCommit: false }),
      makeFile("src/b.ts", { inGitDiff: false, inLastCommit: true }),
    ];
    let state = createInitialReviewState(files);
    state = setScope(state, files, "last-commit");
    expect(state.activeFileId).toBe("src/b.ts");
  });

  it("enforces one line comment per file+scope+side+line", () => {
    const files = [makeFile("src/a.ts")];
    let state = createInitialReviewState(files);
    state = upsertLineComment(state, "src/a.ts", "git-diff", "added", 12, "First");
    state = upsertLineComment(state, "src/a.ts", "git-diff", "added", 12, "Second");
    state = upsertLineComment(state, "src/a.ts", "git-diff", "deleted", 12, "Removed note");

    expect(state.draft.comments).toHaveLength(2);
    expect(getLineComment(state, "src/a.ts", "git-diff", "added", 12)?.body).toBe("Second");
    expect(getLineComment(state, "src/a.ts", "git-diff", "added", 12)?.intent).toBe("fix");
    expect(getLineComment(state, "src/a.ts", "git-diff", "deleted", 12)?.body).toBe("Removed note");
  });

  it("enforces one file comment per file+scope", () => {
    const files = [makeFile("src/a.ts")];
    let state = createInitialReviewState(files);
    state = upsertFileComment(state, "src/a.ts", "git-diff", "One", "discuss");
    state = upsertFileComment(state, "src/a.ts", "git-diff", "Two", "fix");

    expect(state.draft.comments).toHaveLength(1);
    expect(getFileComment(state, "src/a.ts", "git-diff")?.body).toBe("Two");
    expect(getFileComment(state, "src/a.ts", "git-diff")?.intent).toBe("fix");
  });

  it("supports exact multi-line range comments", () => {
    const files = [makeFile("src/a.ts")];
    let state = createInitialReviewState(files);
    state = upsertLineCommentRange(state, "src/a.ts", "git-diff", "added", 12, 15, "Range note", "discuss");

    expect(getLineCommentRange(state, "src/a.ts", "git-diff", "added", 12, 15)?.body).toBe("Range note");
    expect(getLineComment(state, "src/a.ts", "git-diff", "added", 12)).toBeUndefined();
    expect(getCommentForLine(state, "src/a.ts", "git-diff", "added", 13)?.body).toBe("Range note");
  });

  it("tracks visual selection ranges", () => {
    const files = [makeFile("src/a.ts")];
    let state = createInitialReviewState(files);
    state = startVisualSelection(state, "src/a.ts", "git-diff", { side: "deleted", line: 9 });
    state = updateVisualSelectionFocus(state, "src/a.ts", "git-diff", { side: "deleted", line: 5 });

    expect(getVisualSelectionRange(state, "src/a.ts", "git-diff")).toEqual({ side: "deleted", startLine: 5, endLine: 9 });
  });

  it("filters files using search query", () => {
    const files = [makeFile("src/button.ts"), makeFile("src/input.ts")];
    let state = createInitialReviewState(files);
    state = setSearchQuery(state, files, "but");
    expect(getFilteredFiles(files, state).map((file) => file.path)).toEqual(["src/button.ts"]);
  });

  it("moves active file within filtered results", () => {
    const files = [makeFile("src/a.ts"), makeFile("src/b.ts"), makeFile("src/c.ts")];
    let state = createInitialReviewState(files);
    state = moveActiveFile(state, files, 1);
    expect(state.activeFileId).toBe("src/b.ts");
  });

  it("clamps large file jumps to the list boundaries", () => {
    const files = [makeFile("src/a.ts"), makeFile("src/b.ts"), makeFile("src/c.ts")];
    let state = createInitialReviewState(files);
    state = moveActiveFile(state, files, 99);
    expect(state.activeFileId).toBe("src/c.ts");
    state = moveActiveFile(state, files, -99);
    expect(state.activeFileId).toBe("src/a.ts");
  });

  it("clamps selected line target to a visible target", () => {
    const files = [makeFile("src/a.ts")];
    let state = createInitialReviewState(files);
    state = clampSelectedLineTarget(state, "src/a.ts", "git-diff", [{ side: "deleted", line: 4 }, { side: "added", line: 8 }]);
    expect(state.selectedLineTargetByScopeFile["git-diff::src/a.ts"]).toEqual({ side: "deleted", line: 4 });
  });

  it("clamps large diff jumps to the visible boundaries", () => {
    const files = [makeFile("src/a.ts")];
    const visibleTargets = [{ side: "deleted" as const, line: 4 }, { side: "added" as const, line: 8 }, { side: "added" as const, line: 12 }];
    let state = createInitialReviewState(files);
    state = moveSelectedLineTarget(state, "src/a.ts", "git-diff", visibleTargets, 99);
    expect(state.selectedLineTargetByScopeFile["git-diff::src/a.ts"]).toEqual({ side: "added", line: 12 });
    state = moveSelectedLineTarget(state, "src/a.ts", "git-diff", visibleTargets, -99);
    expect(state.selectedLineTargetByScopeFile["git-diff::src/a.ts"]).toEqual({ side: "deleted", line: 4 });
  });

  it("clamps large comment jumps to the list boundaries", () => {
    const files = [makeFile("src/a.ts")];
    let state = createInitialReviewState(files);
    state = moveSelectedCommentIndex(state, 5, 99);
    expect(state.selectedCommentIndex).toBe(4);
    state = moveSelectedCommentIndex(state, 5, -99);
    expect(state.selectedCommentIndex).toBe(0);
  });
});
