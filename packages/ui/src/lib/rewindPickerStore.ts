import { create } from "zustand";

/**
 * 「从此处继续」选择模式（本 fork 新增）：双击 Esc 进入，把每条 AI 回复的
 * 分叉并删除按钮全部亮出（平时 hover 才显），点一条即从该消息继续；
 * Esc / 点击任意动作后退出。仅存 UI 开关，无业务数据。
 */
interface RewindPickerState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useRewindPickerStore = create<RewindPickerState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
