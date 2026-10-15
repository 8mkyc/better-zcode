/**
 * 第三方余额日快照（本 fork 新增）：每次成功查询余额记录一条 {日期→余额}，
 * 用于「今日已用」= 上一自然日最后一次余额 − 当前余额（正数=消费，负数=余额增加/充值）。
 * 记录保留 keepDays 天；纯逻辑（store 读写为薄壳），localStorage 不可用时静默降级为不记录。
 */

export interface DailyBalanceStore {
  [providerId: string]: {
    /** balance/ts = 当日最新；first/firstTs = 当日首次（无昨日基线时的兜底基线）。 */
    [date: string]: { balance: number; ts: number; first?: number; firstTs?: number };
  };
}

const STORAGE_KEY = "zcode:third-party-balance-daily";
const DEFAULT_KEEP_DAYS = 45;

/** 本地日期 YYYY-MM-DD（不引 Intl，保证纯函数可测）。 */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 记录当日余额：同日覆盖最新值，但保留当日首次值（兜底基线用）。返回新 store。 */
export function upsertObservation(
  store: DailyBalanceStore,
  providerId: string,
  balance: number,
  now: Date,
): DailyBalanceStore {
  const date = formatDateKey(now);
  const existing = store[providerId]?.[date];
  return {
    ...store,
    [providerId]: {
      ...store[providerId],
      [date]: {
        balance,
        ts: now.getTime(),
        first: existing?.first ?? balance,
        firstTs: existing?.firstTs ?? now.getTime(),
      },
    },
  };
}

/**
 * 今日已用 = 基线余额 − 当前余额。
 * 基线取值两级：①严格早于 today 的最近一次观测（昨日收尾值，最准）；
 * ②无昨日基线时兜底用当日首次观测（今天第一次查到的值，立刻有数、
 * 口径为"自今日首次记录起的消耗"）；两条都没有（从未记录过）返回 null。
 */
export function computeTodaySpent(
  store: DailyBalanceStore,
  providerId: string,
  currentBalance: number,
  today: string,
): number | null {
  const observations = store[providerId];
  if (!observations) {
    return null;
  }
  let baseline: { balance: number; ts: number } | null = null;
  let baselineDate = "";
  for (const [date, obs] of Object.entries(observations)) {
    if (date >= today) {
      continue;
    }
    const newerDate = date > baselineDate;
    const sameDateNewerTs = date === baselineDate && baseline !== null && obs.ts > baseline.ts;
    if (baseline === null || newerDate || sameDateNewerTs) {
      baseline = obs;
      baselineDate = date;
    }
  }
  if (baseline !== null) {
    return baseline.balance - currentBalance;
  }
  const todayObs = observations[today];
  if (!todayObs) {
    return null;
  }
  return (todayObs.first ?? todayObs.balance) - currentBalance;
}

/** 裁剪：每个 provider 只保留最近 keepDays 天（含今天）。返回新 store。 */
export function pruneStore(
  store: DailyBalanceStore,
  today: string,
  keepDays = DEFAULT_KEEP_DAYS,
): DailyBalanceStore {
  const parts = today.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const cutoff = new Date(y, m - 1, d - keepDays);
  const cutoffKey = formatDateKey(cutoff);
  const next: DailyBalanceStore = {};
  for (const [providerId, observations] of Object.entries(store)) {
    const kept: DailyBalanceStore[string] = {};
    for (const [date, obs] of Object.entries(observations)) {
      if (date >= cutoffKey) {
        kept[date] = obs;
      }
    }
    next[providerId] = kept;
  }
  return next;
}

export function loadStore(): DailyBalanceStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw) as DailyBalanceStore;
  } catch {
    return {};
  }
}

export function saveStore(store: DailyBalanceStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级：不记录、不算今日已用。
  }
}

/** 成功查询余额后的统一落库入口：记录 → 裁剪 → 持久化。 */
export function recordBalanceObservation(
  providerId: string,
  balance: number,
  now: Date = new Date(),
): void {
  const today = formatDateKey(now);
  const store = upsertObservation(loadStore(), providerId, balance, now);
  saveStore(pruneStore(store, today));
}
