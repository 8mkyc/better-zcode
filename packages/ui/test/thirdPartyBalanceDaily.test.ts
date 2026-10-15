import { describe, expect, it } from "vitest";
import {
  computeTodaySpent,
  formatDateKey,
  pruneStore,
  upsertObservation,
  type DailyBalanceStore,
} from "../src/lib/thirdPartyBalanceDaily.js";

const day = (y: number, m: number, d: number) => formatDateKey(new Date(y, m - 1, d));

describe("第三方余额日快照", () => {
  it("formatDateKey 输出 YYYY-MM-DD 且补零", () => {
    expect(day(2026, 10, 5)).toBe("2026-10-05");
    expect(day(2026, 1, 31)).toBe("2026-01-31");
  });

  it("upsertObservation 同日覆盖为最新值", () => {
    let store: DailyBalanceStore = {};
    store = upsertObservation(store, "ds", 100, new Date(2026, 9, 13, 9, 0, 0));
    store = upsertObservation(store, "ds", 98, new Date(2026, 9, 13, 18, 0, 0));
    expect(Object.keys(store.ds)).toHaveLength(1);
    expect(store.ds[day(2026, 10, 13)].balance).toBe(98);
  });

  it("computeTodaySpent = 基线（昨日最后一次）− 当前余额", () => {
    let store: DailyBalanceStore = {};
    store = upsertObservation(store, "ds", 100, new Date(2026, 9, 12, 10, 0, 0));
    store = upsertObservation(store, "ds", 95, new Date(2026, 9, 12, 22, 0, 0)); // 昨日最后一次
    store = upsertObservation(store, "ds", 92, new Date(2026, 9, 13, 9, 0, 0)); // 今天也被记录
    // 基线取昨日最后一次 95，当前 92 → 已用 3
    expect(computeTodaySpent(store, "ds", 92, day(2026, 10, 13))).toBe(3);
  });

  it("无昨日基线时用当日首记录兜底（同值=0）", () => {
    const store = upsertObservation({}, "ds", 100, new Date(2026, 9, 13, 9, 0, 0));
    expect(computeTodaySpent(store, "ds", 100, day(2026, 10, 13))).toBe(0);
  });

  it("无昨日基线时兜底=当日首次观测（后续消费算得出）", () => {
    let store = upsertObservation({}, "ds", 100, new Date(2026, 9, 13, 8, 0, 0));
    store = upsertObservation(store, "ds", 92, new Date(2026, 9, 13, 18, 0, 0));
    // 首次 100 → 当前 92，兜底口径"自今日首次记录起"= 8
    expect(computeTodaySpent(store, "ds", 92, day(2026, 10, 13))).toBe(8);
  });

  it("从未记录过返回 null", () => {
    expect(computeTodaySpent({}, "ds", 100, day(2026, 10, 13))).toBeNull();
  });

  it("余额增加（充值）返回负数", () => {
    const store = upsertObservation({}, "ds", 50, new Date(2026, 9, 12, 20, 0, 0));
    expect(computeTodaySpent(store, "ds", 150, day(2026, 10, 13))).toBe(-100);
  });

  it("pruneStore 只保留最近 keepDays 天", () => {
    let store: DailyBalanceStore = {};
    store = upsertObservation(store, "ds", 1, new Date(2026, 8, 1, 8, 0, 0)); // 09-01
    store = upsertObservation(store, "ds", 2, new Date(2026, 9, 30, 8, 0, 0)); // 10-30
    store = upsertObservation(store, "ds", 3, new Date(2026, 8, 20, 8, 0, 0)); // 09-20
    const pruned = pruneStore(store, day(2026, 10, 30), 45);
    const dates = Object.keys(pruned.ds).sort();
    // 45 天回溯到 09-15：09-01 被裁掉，09-20/10-30 保留
    expect(dates).toEqual(["2026-09-20", "2026-10-30"]);
  });

  it("多 provider 互不干扰", () => {
    let store: DailyBalanceStore = {};
    store = upsertObservation(store, "ds", 100, new Date(2026, 9, 12, 8, 0, 0));
    store = upsertObservation(store, "kimi", 20, new Date(2026, 9, 12, 8, 0, 0));
    expect(computeTodaySpent(store, "ds", 90, day(2026, 10, 13))).toBe(10);
    expect(computeTodaySpent(store, "kimi", 18, day(2026, 10, 13))).toBe(2);
  });
});
