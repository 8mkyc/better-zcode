const TASK_RENAME_REQUEST_EVENT = "zcode:rename-active-task";
const TASK_ARCHIVE_REQUEST_EVENT = "zcode:archive-active-task";
const TASK_DELETE_REQUEST_EVENT = "zcode:delete-active-task";

/**
 * 应用级「重命名/归档/删除当前任务」请求：快捷键等不具备任务上下文的入口经此转发，
 * 由当前会话 Header（WorkspaceHeaderSections）监听并执行既有动作链。
 * Header 未挂载（如停留在任务列表首页）时请求自然落空，无副作用。
 */
export function requestActiveTaskRename(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TASK_RENAME_REQUEST_EVENT));
}

export function addActiveTaskRenameListener(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleRequest = () => listener();
  window.addEventListener(TASK_RENAME_REQUEST_EVENT, handleRequest);
  return () => window.removeEventListener(TASK_RENAME_REQUEST_EVENT, handleRequest);
}

export function requestActiveTaskArchive(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TASK_ARCHIVE_REQUEST_EVENT));
}

export function addActiveTaskArchiveListener(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleRequest = () => listener();
  window.addEventListener(TASK_ARCHIVE_REQUEST_EVENT, handleRequest);
  return () => window.removeEventListener(TASK_ARCHIVE_REQUEST_EVENT, handleRequest);
}

export function requestActiveTaskDelete(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TASK_DELETE_REQUEST_EVENT));
}

export function addActiveTaskDeleteListener(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handleRequest = () => listener();
  window.addEventListener(TASK_DELETE_REQUEST_EVENT, handleRequest);
  return () => window.removeEventListener(TASK_DELETE_REQUEST_EVENT, handleRequest);
}
