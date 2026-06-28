import { filterFilesBySearch } from "./search.js";
import type {
  CommentIntent,
  CommentSide,
  DiffReviewComment,
  ReviewFile,
  ReviewFocus,
  ReviewLineRange,
  ReviewLineTarget,
  ReviewScope,
  ReviewState,
  ReviewVisualSelection,
} from "./types.js";
import { scopeFileKey } from "./types.js";

function hasFilesForScope(files: ReviewFile[], scope: ReviewScope): boolean {
  return getScopedFiles(files, scope).length > 0;
}

export function getDefaultScope(files: ReviewFile[]): ReviewScope {
  if (hasFilesForScope(files, "git-diff")) return "git-diff";
  if (hasFilesForScope(files, "last-commit")) return "last-commit";
  return "all-files";
}

export function getScopedFiles(files: ReviewFile[], scope: ReviewScope): ReviewFile[] {
  switch (scope) {
    case "git-diff":
      return files.filter((file) => file.inGitDiff);
    case "last-commit":
      return files.filter((file) => file.inLastCommit);
    case "all-files":
      return files.filter((file) => file.hasWorkingTreeFile);
  }
}

export function getFilteredFiles(files: ReviewFile[], state: ReviewState): ReviewFile[] {
  return filterFilesBySearch(getScopedFiles(files, state.activeScope), state.searchQuery);
}

export function ensureActiveFile(state: ReviewState, files: ReviewFile[]): ReviewState {
  const filtered = getFilteredFiles(files, state);
  if (filtered.length === 0) {
    return { ...state, activeFileId: null };
  }
  if (filtered.some((file) => file.id === state.activeFileId)) {
    return state;
  }
  return { ...state, activeFileId: filtered[0]!.id };
}

export function createInitialReviewState(files: ReviewFile[]): ReviewState {
  const initialScope = getDefaultScope(files);
  const scoped = getScopedFiles(files, initialScope);
  return {
    activeScope: initialScope,
    activeFileId: scoped[0]?.id ?? null,
    searchQuery: "",
    focus: "navigator",
    wrapLines: false,
    hideUnchanged: false,
    selectedCommentIndex: 0,
    selectedLineTargetByScopeFile: {},
    visualSelectionByScopeFile: {},
    draft: {
      allComment: "",
      allIntent: "fix",
      comments: [],
    },
  };
}

export function setScope(state: ReviewState, files: ReviewFile[], scope: ReviewScope): ReviewState {
  return ensureActiveFile({ ...state, activeScope: scope, selectedCommentIndex: 0 }, files);
}

export function setSearchQuery(state: ReviewState, files: ReviewFile[], query: string): ReviewState {
  return ensureActiveFile({ ...state, searchQuery: query, selectedCommentIndex: 0 }, files);
}

export function moveActiveFile(state: ReviewState, files: ReviewFile[], delta: number): ReviewState {
  const filtered = getFilteredFiles(files, state);
  if (filtered.length === 0) return { ...state, activeFileId: null };
  const index = filtered.findIndex((file) => file.id === state.activeFileId);
  const currentIndex = index >= 0 ? index : 0;
  const nextIndex = Math.max(0, Math.min(filtered.length - 1, currentIndex + delta));
  return { ...state, activeFileId: filtered[nextIndex]!.id, selectedCommentIndex: 0 };
}

export function setActiveFileId(state: ReviewState, files: ReviewFile[], fileId: string | null): ReviewState {
  const filtered = getFilteredFiles(files, state);
  if (fileId == null || !filtered.some((file) => file.id === fileId)) {
    return ensureActiveFile({ ...state, activeFileId: fileId, selectedCommentIndex: 0 }, files);
  }
  return { ...state, activeFileId: fileId, selectedCommentIndex: 0 };
}

export function cycleFocus(state: ReviewState): ReviewState {
  const order: ReviewFocus[] = ["navigator", "diff", "comments"];
  const index = order.indexOf(state.focus);
  return { ...state, focus: order[(index + 1) % order.length]! };
}

export function cycleFocusBackward(state: ReviewState): ReviewState {
  const order: ReviewFocus[] = ["navigator", "diff", "comments"];
  const index = order.indexOf(state.focus);
  return { ...state, focus: order[(index - 1 + order.length) % order.length]! };
}

export function setFocus(state: ReviewState, focus: ReviewFocus): ReviewState {
  return { ...state, focus };
}

export function setWrapLines(state: ReviewState, wrapLines: boolean): ReviewState {
  return { ...state, wrapLines };
}

export function toggleHideUnchanged(state: ReviewState): ReviewState {
  return { ...state, hideUnchanged: !state.hideUnchanged };
}

function sameLineTarget(a: ReviewLineTarget | null, b: ReviewLineTarget | null): boolean {
  return a?.side === b?.side && a?.line === b?.line;
}

function sameLineRange(a: ReviewLineRange | null, b: ReviewLineRange | null): boolean {
  return a?.side === b?.side && a?.startLine === b?.startLine && a?.endLine === b?.endLine;
}

export function normalizeLineRange(side: ReviewLineTarget["side"], startLine: number, endLine: number): ReviewLineRange {
  return {
    side,
    startLine: Math.min(startLine, endLine),
    endLine: Math.max(startLine, endLine),
  };
}

export function getVisualSelection(state: ReviewState, fileId: string | null, scope: ReviewScope): ReviewVisualSelection | null {
  if (fileId == null) return null;
  return state.visualSelectionByScopeFile[scopeFileKey(scope, fileId)] ?? null;
}

export function getVisualSelectionRange(state: ReviewState, fileId: string | null, scope: ReviewScope): ReviewLineRange | null {
  const selection = getVisualSelection(state, fileId, scope);
  if (selection == null || selection.anchor.side !== selection.focus.side) return null;
  return normalizeLineRange(selection.anchor.side, selection.anchor.line, selection.focus.line);
}

export function setVisualSelection(state: ReviewState, fileId: string, scope: ReviewScope, selection: ReviewVisualSelection | null): ReviewState {
  const key = scopeFileKey(scope, fileId);
  const next = { ...state.visualSelectionByScopeFile };
  if (selection == null) {
    delete next[key];
  } else {
    next[key] = selection;
  }
  return { ...state, visualSelectionByScopeFile: next };
}

export function clearVisualSelection(state: ReviewState, fileId: string, scope: ReviewScope): ReviewState {
  return setVisualSelection(state, fileId, scope, null);
}

export function startVisualSelection(state: ReviewState, fileId: string, scope: ReviewScope, target: ReviewLineTarget): ReviewState {
  return setVisualSelection(state, fileId, scope, { anchor: target, focus: target });
}

export function updateVisualSelectionFocus(state: ReviewState, fileId: string, scope: ReviewScope, focus: ReviewLineTarget): ReviewState {
  const existing = getVisualSelection(state, fileId, scope);
  if (existing == null) return startVisualSelection(state, fileId, scope, focus);
  return setVisualSelection(state, fileId, scope, { anchor: existing.anchor, focus });
}

export function setSelectedLineTarget(state: ReviewState, fileId: string, scope: ReviewScope, target: ReviewLineTarget): ReviewState {
  return {
    ...state,
    selectedLineTargetByScopeFile: {
      ...state.selectedLineTargetByScopeFile,
      [scopeFileKey(scope, fileId)]: target,
    },
  };
}

export function getSelectedLineTarget(state: ReviewState, fileId: string | null, scope: ReviewScope): ReviewLineTarget | null {
  if (fileId == null) return null;
  return state.selectedLineTargetByScopeFile[scopeFileKey(scope, fileId)] ?? null;
}

export function clampSelectedLineTarget(state: ReviewState, fileId: string, scope: ReviewScope, visibleTargets: ReviewLineTarget[]): ReviewState {
  if (visibleTargets.length === 0) return state;
  const current = getSelectedLineTarget(state, fileId, scope);
  if (current == null) return setSelectedLineTarget(state, fileId, scope, visibleTargets[0]!);
  if (visibleTargets.some((target) => sameLineTarget(target, current))) return state;

  const next = visibleTargets.find((target) => target.line >= current.line) ?? visibleTargets[visibleTargets.length - 1]!;
  return setSelectedLineTarget(state, fileId, scope, next);
}

export function moveSelectedLineTarget(state: ReviewState, fileId: string, scope: ReviewScope, visibleTargets: ReviewLineTarget[], delta: number): ReviewState {
  if (visibleTargets.length === 0) return state;
  const current = getSelectedLineTarget(state, fileId, scope) ?? visibleTargets[0]!;
  const index = Math.max(0, visibleTargets.findIndex((target) => sameLineTarget(target, current)));
  const nextIndex = Math.max(0, Math.min(visibleTargets.length - 1, index + delta));
  return setSelectedLineTarget(state, fileId, scope, visibleTargets[nextIndex]!);
}

export function getCommentKey(comment: Pick<DiffReviewComment, "fileId" | "scope" | "side" | "startLine" | "endLine">): string {
  return `${comment.scope}::${comment.fileId}::${comment.side}::${comment.startLine ?? "file"}::${comment.endLine ?? "file"}`;
}

function withTrimmedBody(body: string): string {
  return body.trim();
}

export function getLineCommentRange(state: ReviewState, fileId: string, scope: ReviewScope, side: Exclude<CommentSide, "file">, startLine: number, endLine: number): DiffReviewComment | undefined {
  const range = normalizeLineRange(side, startLine, endLine);
  return state.draft.comments.find((comment) => (
    comment.fileId === fileId
      && comment.scope === scope
      && comment.side === side
      && comment.startLine === range.startLine
      && comment.endLine === range.endLine
  ));
}

export function getLineComment(state: ReviewState, fileId: string, scope: ReviewScope, side: Exclude<CommentSide, "file">, line: number): DiffReviewComment | undefined {
  return getLineCommentRange(state, fileId, scope, side, line, line);
}

export function getCommentForLine(state: ReviewState, fileId: string, scope: ReviewScope, side: Exclude<CommentSide, "file">, line: number): DiffReviewComment | undefined {
  return state.draft.comments
    .filter((comment) => (
      comment.fileId === fileId
        && comment.scope === scope
        && comment.side === side
        && comment.startLine != null
        && comment.endLine != null
        && comment.startLine <= line
        && line <= comment.endLine
    ))
    .sort((a, b) => {
      const aSize = (a.endLine ?? a.startLine ?? 0) - (a.startLine ?? 0);
      const bSize = (b.endLine ?? b.startLine ?? 0) - (b.startLine ?? 0);
      if (aSize !== bSize) return aSize - bSize;
      const aStart = a.startLine ?? 0;
      const bStart = b.startLine ?? 0;
      if (aStart !== bStart) return aStart - bStart;
      return a.id.localeCompare(b.id);
    })[0];
}

export function getFileComment(state: ReviewState, fileId: string, scope: ReviewScope): DiffReviewComment | undefined {
  return state.draft.comments.find((comment) => (
    comment.fileId === fileId
      && comment.scope === scope
      && comment.side === "file"
  ));
}

export function getCommentsForFileScope(state: ReviewState, fileId: string, scope: ReviewScope): DiffReviewComment[] {
  return state.draft.comments
    .filter((comment) => comment.fileId === fileId && comment.scope === scope)
    .sort((a, b) => {
      const aLine = a.startLine ?? -1;
      const bLine = b.startLine ?? -1;
      if (a.side !== b.side) {
        if (a.side === "file") return -1;
        if (b.side === "file") return 1;
        if (a.side === "deleted") return -1;
        if (b.side === "deleted") return 1;
      }
      if (aLine !== bLine) return aLine - bLine;
      const aEnd = a.endLine ?? aLine;
      const bEnd = b.endLine ?? bLine;
      if (aEnd !== bEnd) return aEnd - bEnd;
      return a.id.localeCompare(b.id);
    });
}

function replaceComment(state: ReviewState, matcher: (comment: DiffReviewComment) => boolean, nextComment: DiffReviewComment | null): ReviewState {
  const remaining = state.draft.comments.filter((comment) => !matcher(comment));
  return {
    ...state,
    draft: {
      ...state.draft,
      comments: nextComment == null ? remaining : [...remaining, nextComment],
    },
  };
}

export function upsertLineCommentRange(
  state: ReviewState,
  fileId: string,
  scope: ReviewScope,
  side: Exclude<CommentSide, "file">,
  startLine: number,
  endLine: number,
  body: string,
  intent: CommentIntent = "fix",
): ReviewState {
  const trimmed = withTrimmedBody(body);
  const range = normalizeLineRange(side, startLine, endLine);
  const existing = getLineCommentRange(state, fileId, scope, side, range.startLine, range.endLine);
  const nextComment = trimmed.length === 0
    ? null
    : {
        id: existing?.id ?? `line:${scope}:${fileId}:${side}:${range.startLine}-${range.endLine}`,
        fileId,
        scope,
        side,
        intent,
        startLine: range.startLine,
        endLine: range.endLine,
        body: trimmed,
      };

  return replaceComment(
    state,
    (comment) => (
      comment.fileId === fileId
        && comment.scope === scope
        && comment.side === side
        && comment.startLine === range.startLine
        && comment.endLine === range.endLine
    ),
    nextComment,
  );
}

export function upsertLineComment(state: ReviewState, fileId: string, scope: ReviewScope, side: Exclude<CommentSide, "file">, line: number, body: string, intent: CommentIntent = "fix"): ReviewState {
  return upsertLineCommentRange(state, fileId, scope, side, line, line, body, intent);
}

export function upsertFileComment(state: ReviewState, fileId: string, scope: ReviewScope, body: string, intent: CommentIntent = "fix"): ReviewState {
  const trimmed = withTrimmedBody(body);
  const existing = getFileComment(state, fileId, scope);
  const nextComment = trimmed.length === 0
    ? null
    : {
        id: existing?.id ?? `file:${scope}:${fileId}`,
        fileId,
        scope,
        side: "file" as const,
        intent,
        startLine: null,
        endLine: null,
        body: trimmed,
      };

  return replaceComment(
    state,
    (comment) => comment.fileId === fileId && comment.scope === scope && comment.side === "file",
    nextComment,
  );
}

export function deleteComment(state: ReviewState, id: string): ReviewState {
  return {
    ...state,
    draft: {
      ...state.draft,
      comments: state.draft.comments.filter((comment) => comment.id !== id),
    },
  };
}

export function setAllComment(state: ReviewState, allComment: string, allIntent: CommentIntent = state.draft.allIntent): ReviewState {
  return {
    ...state,
    draft: {
      ...state.draft,
      allComment: allComment.trim(),
      allIntent,
    },
  };
}

export function moveSelectedCommentIndex(state: ReviewState, totalItems: number, delta: number): ReviewState {
  if (totalItems <= 0) return { ...state, selectedCommentIndex: 0 };
  const nextIndex = Math.max(0, Math.min(totalItems - 1, state.selectedCommentIndex + delta));
  return { ...state, selectedCommentIndex: nextIndex };
}

export function hasDraftContent(state: ReviewState): boolean {
  return state.draft.allComment.trim().length > 0 || state.draft.comments.length > 0;
}

export function hasVisualSelection(state: ReviewState, fileId: string | null, scope: ReviewScope): boolean {
  return getVisualSelectionRange(state, fileId, scope) != null;
}

export function sameCommentRange(comment: DiffReviewComment, range: ReviewLineRange): boolean {
  return sameLineRange(
    comment.side === "file" || comment.startLine == null || comment.endLine == null
      ? null
      : { side: comment.side, startLine: comment.startLine, endLine: comment.endLine },
    range,
  );
}
