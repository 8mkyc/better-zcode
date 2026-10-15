/**
 * 第三方余额面板的用户微调设置（本 fork 新增）。
 * 全部走 localStorage，面板里的设置对话框读写——显示项/排序/刷新间隔可调，
 * 不需要改代码重新打包（好维护的口径：旋钮进配置，代码只管逻辑）。
 */

export interface ThirdPartyBalanceSettings {
  /** 行内「今日」（金额已用 / 百分比已用）。 */
  showToday: boolean;
  /** 顶部「今日花费」总额行。 */
  showTodayTotal: boolean;
  /** 计划额度小字（如 MiMo 计划 64M/256M）。 */
  showPlan: boolean;
  /** 供应商显示顺序（providerId；未列出的按名称排后面）。 */
  order: string[];
  /** 自动刷新间隔（分钟）。 */
  refreshMinutes: number;
}

const STORAGE_KEY = "zcode:third-party-balance-settings";

export const DEFAULT_BALANCE_SETTINGS: ThirdPartyBalanceSettings = {
  showToday: true,
  showTodayTotal: true,
  showPlan: true,
  order: [],
  refreshMinutes: 5,
};

export function loadBalanceSettings(): ThirdPartyBalanceSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BALANCE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<ThirdPartyBalanceSettings>;
    return {
      ...DEFAULT_BALANCE_SETTINGS,
      ...parsed,
      order: Array.isArray(parsed.order) ? parsed.order.map(String) : [],
      refreshMinutes: Math.max(1, Math.min(60, Number(parsed.refreshMinutes) || 5)),
    };
  } catch {
    return { ...DEFAULT_BALANCE_SETTINGS };
  }
}

export function saveBalanceSettings(settings: ThirdPartyBalanceSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 不可用时静默：保持默认设置。
  }
}
