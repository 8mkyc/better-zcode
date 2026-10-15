import { useEffect } from "react";
import { isEditableShortcutEventTarget } from "@/shortcuts/bindings.js";
import { useRewindPickerStore } from "@/lib/rewindPickerStore.js";

const DOUBLE_ESC_WINDOW_MS = 400;

/**
 * 双击 Esc 进入/退出「从此处继续」选择模式（本 fork 新增）。
 * 双击判定 400ms 内两次 Esc keydown；可编辑元素聚焦时不触发（不打扰打字）。
 * 选择模式中单击 Esc 退出。
 */
export function useRewindPickerHotkey() {
  useEffect(() => {
    let lastEscAt = 0;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) {
        return;
      }
      if (isEditableShortcutEventTarget(event.target)) {
        return;
      }
      const store = useRewindPickerStore.getState();
      if (store.active) {
        // 选择模式中单击 Esc = 取消
        event.preventDefault();
        store.setActive(false);
        lastEscAt = 0;
        return;
      }
      const now = Date.now();
      if (now - lastEscAt < DOUBLE_ESC_WINDOW_MS) {
        event.preventDefault();
        store.setActive(true);
        lastEscAt = 0;
        return;
      }
      lastEscAt = now;
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
