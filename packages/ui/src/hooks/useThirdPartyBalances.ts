/**
 * 第三方模型厂商余额（本 fork 新增）。
 *
 * 依据 provider_settings 视图里 personal（自定义）provider 的 baseUrl 识别厂商，
 * 命中已知厂商且配置了 apiKey 的才进入余额查询；余额经平台桥（main 进程代理
 * fetch，域名白名单）获取，绕开 renderer CORS。结果缓存在 localStorage（5 分钟 TTL）。
 *
 * 「今日已用」：每次成功查询记录日快照（thirdPartyBalanceDaily），显示
 * = 上一自然日最后一次余额 − 当前余额（正数=消费，负数=余额增加/充值）。
 *
 * MiMo（小米 Tokens Plan）：控制台用量接口只认登录 Cookie（`tp-` API key 读不了），
 * Cookie 存 localStorage `zcode:mimoCookie`，仅发往 xiaomimimo.com（main 侧再拦一道）。
 */
/* oxlint-disable eslint(max-lines) -- 余额 hook 含厂商适配/解析/缓存/快照接线，拆分会把一条查询链路打散到三处。 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  computeTodaySpent,
  formatDateKey,
  loadStore as loadDailyStore,
  recordBalanceObservation,
} from "@/lib/thirdPartyBalanceDaily.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useProviderSettingsView } from "@/hooks/useProviderSettingsView.js";

export type ThirdPartyVendorId = "deepseek" | "moonshot" | "mimo";

export interface ThirdPartyBalanceEntry {
  providerId: string;
  label: string;
  vendor: ThirdPartyVendorId;
  /** 余额展示文本（如 ¥88.50）；mimo 为 null。 */
  balanceText: string | null;
  /** 今日已用（元）：正=消费、负=余额增加；无基线为 null。 */
  todaySpentValue: number | null;
  /** 余额币种符号（¥/$…），用于格式化今日已用。 */
  currencySymbol: string | null;
  /** mimo：月度窗口消耗比（0..1），面板负责本地化格式化。 */
  monthPercent: number | null;
  /** mimo：计划额度已用/总量（token 数）。 */
  planUsed: number | null;
  planLimit: number | null;
  /** error | loading | ok | unsupported */
  state: "error" | "loading" | "ok" | "unsupported";
  errorMessage?: string;
  fetchedAt: number | null;
  /** mimo 等暂无公开接口/未配置时的控制台链接。 */
  consoleUrl?: string;
  /** mimo：缺 Cookie 或会话过期，面板给「设置 Cookie」入口。 */
  needsCookie?: boolean;
}

interface CachedEntry {
  balanceText?: string;
  symbol?: string;
  balance?: number;
  monthPercent?: number;
  planUsed?: number;
  planLimit?: number;
  fetchedAt: number;
}

interface BalanceCachePayload {
  balances: Record<string, CachedEntry>;
}

const CACHE_KEY = "zcode:third-party-balances";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MIMO_COOKIE_KEY = "zcode:mimoCookie";
const MIMO_USAGE_URL = "https://platform.xiaomimimo.com/api/v1/tokenPlan/usage";

export function readMimoCookie(): string {
  try {
    return window.localStorage.getItem(MIMO_COOKIE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeMimoCookie(cookie: string): void {
  try {
    if (cookie.trim()) {
      window.localStorage.setItem(MIMO_COOKIE_KEY, cookie.trim());
    } else {
      window.localStorage.removeItem(MIMO_COOKIE_KEY);
    }
  } catch {
    // localStorage 不可用时静默：MiMo 用量退回控制台链接。
  }
}

/** vendor 识别：baseUrl 子串匹配；识别不出的自定义 provider 不查（不乱猜接口）。 */
export function detectThirdPartyVendor(
  baseUrl: string,
): { vendor: ThirdPartyVendorId; consoleUrl?: string } | null {
  const host = baseUrl.toLowerCase();
  if (host.includes("deepseek")) {
    return { vendor: "deepseek" };
  }
  if (host.includes("moonshot")) {
    return { vendor: "moonshot" };
  }
  if (host.includes("xiaomimimo") || host.includes("mimo")) {
    return { vendor: "mimo", consoleUrl: "https://platform.xiaomimimo.com/console" };
  }
  return null;
}

function readCache(): BalanceCachePayload {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { balances: {} };
    const parsed = JSON.parse(raw) as BalanceCachePayload;
    return parsed.balances ? parsed : { balances: {} };
  } catch {
    return { balances: {} };
  }
}

function writeCacheEntry(entryKey: string, entry: CachedEntry): void {
  try {
    const cache = readCache();
    cache.balances[entryKey] = entry;
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage 不可用时跳过缓存，仅保留本次会话内存结果。
  }
}

function balanceEndpointFor(vendor: ThirdPartyVendorId): string | null {
  switch (vendor) {
    case "deepseek":
      return "https://api.deepseek.com/user/balance";
    case "moonshot":
      // 国内 .cn / 国际 .ai 都走同一鉴权与响应结构，直接用官方主域。
      return "https://api.moonshot.cn/v1/users/me/balance";
    case "mimo":
      return null;
  }
}

interface VendorBalancePayload {
  balanceText: string;
  balance: number;
  symbol: string;
}

function parseDeepSeekBalance(bodyText: string): VendorBalancePayload | null {
  try {
    const parsed = JSON.parse(bodyText) as {
      is_available?: boolean;
      balance_infos?: Array<{ currency?: string; total_balance?: string }>;
    };
    const info = parsed.balance_infos?.[0];
    if (!info?.total_balance) return null;
    const currency = (info.currency ?? "CNY").toUpperCase();
    const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : `${currency} `;
    return {
      balanceText: `${symbol}${info.total_balance}`,
      balance: Number(info.total_balance),
      symbol,
    };
  } catch {
    return null;
  }
}

function parseMoonshotBalance(bodyText: string): VendorBalancePayload | null {
  try {
    const parsed = JSON.parse(bodyText) as {
      data?: {
        available_balance?: string;
        currency?: string;
      };
    };
    const data = parsed.data;
    if (!data?.available_balance) return null;
    const currency = (data.currency ?? "CNY").toUpperCase();
    const symbol = currency === "CNY" ? "¥" : currency === "USD" ? "$" : `${currency} `;
    return {
      balanceText: `${symbol}${data.available_balance}`,
      balance: Number(data.available_balance),
      symbol,
    };
  } catch {
    return null;
  }
}

interface MimoUsagePayload {
  monthPercent: number;
  planUsed?: number;
  planLimit?: number;
}

/**
 * 解析 MiMo tokenPlan/usage（控制台逆向接口，社区开源实现证实）：
 * data.monthUsage.percent 为 0..1 月度窗口消耗比，缺省时用 items 兜底。
 */
export function parseMimoUsage(bodyText: string): MimoUsagePayload | null {
  try {
    const parsed = JSON.parse(bodyText) as {
      code?: number;
      data?: {
        monthUsage?: {
          percent?: number;
          items?: Array<{ name?: string; used?: number; limit?: number; percent?: number }>;
        };
        planUsage?: {
          items?: Array<{ name?: string; used?: number; limit?: number }>;
        };
      };
    };
    if (parsed.code !== 0 || !parsed.data) return null;
    const month = parsed.data.monthUsage;
    const monthItem =
      month?.items?.find((item) => item.name === "month_total_token") ?? month?.items?.[0];
    let percent = month?.percent;
    if (percent === undefined && monthItem) {
      percent =
        monthItem.percent ??
        (monthItem.limit && monthItem.limit > 0
          ? (monthItem.used ?? 0) / monthItem.limit
          : undefined);
    }
    if (percent === undefined || Number.isNaN(percent)) return null;
    const planItem = parsed.data.planUsage?.items?.find((item) => item.name === "plan_total_token");
    return {
      monthPercent: percent,
      planUsed: planItem?.used,
      planLimit: planItem?.limit,
    };
  } catch {
    return null;
  }
}

/** token 数压缩显示（64M/256M 形态），面板展示用。 */
export function compactTokens(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return `${value}`;
}

export function useThirdPartyBalances(options?: { refreshSignal?: number }) {
  const platform = useOptionalPlatform();
  const providerSettingsSnapshot = useProviderSettingsView();
  const providerSettingsView =
    providerSettingsSnapshot.state.status === "ready"
      ? providerSettingsSnapshot.state.view
      : null;
  const refreshSignal = options?.refreshSignal ?? 0;
  const [cacheVersion, setCacheVersion] = useState(0);
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({});

  const targets = useMemo(() => {
    const providers = providerSettingsView?.providers ?? [];
    const entries: Array<{
      providerId: string;
      label: string;
      vendor: ThirdPartyVendorId;
      consoleUrl?: string;
      apiKey: string;
      baseUrl: string;
      entryKey: string;
    }> = [];
    for (const provider of providers) {
      if (provider.effectiveConfig.group !== "standard-personal") continue;
      if (provider.enabled === false) continue;
      const baseUrl = provider.effectiveConfig.api?.baseUrl ?? "";
      const detected = detectThirdPartyVendor(baseUrl);
      if (!detected) continue;
      // mimo 用 Cookie 查用量，不需要 apiKey；其余厂商没有 key 不查。
      const access = provider.effectiveConfig.access;
      const apiKey = access?.type === "api-key" ? (access.apiKey ?? "") : "";
      if (detected.vendor !== "mimo" && !apiKey) continue;
      const entryKey = `${provider.providerId}`;
      entries.push({
        providerId: provider.providerId,
        label: provider.providerName?.trim() || provider.providerId,
        vendor: detected.vendor,
        consoleUrl: detected.consoleUrl,
        apiKey,
        baseUrl,
        entryKey,
      });
    }
    return entries;
  }, [providerSettingsView]);

  const refresh = useCallback(
    (force: boolean) => {
      if (!platform?.fetchThirdPartyBalance) return;
      const cache = readCache();
      for (const target of targets) {
        const cached = cache.balances[target.entryKey];
        const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
        if (!force && fresh) continue;
        setLoadingKeys((current) => ({ ...current, [target.entryKey]: true }));

        const run = async (): Promise<CachedEntry> => {
          if (target.vendor === "mimo") {
            const cookie = readMimoCookie();
            if (!cookie) {
              throw new Error("mimo cookie missing");
            }
            const response = await platform.fetchThirdPartyBalance!({
              url: MIMO_USAGE_URL,
              authKind: "cookie",
              cookie,
            });
            if (!response.ok || response.status < 200 || response.status >= 300) {
              throw new Error(response.ok ? `HTTP ${response.status}` : response.error);
            }
            const parsed = parseMimoUsage(response.bodyText);
            if (!parsed) {
              // code!=0 多为会话过期；payload 不合法也算同一种失败。
              throw new Error("mimo usage unavailable (login required?)");
            }
            return {
              monthPercent: parsed.monthPercent,
              planUsed: parsed.planUsed,
              planLimit: parsed.planLimit,
              fetchedAt: Date.now(),
            };
          }
          const endpoint = balanceEndpointFor(target.vendor);
          const request = endpoint
            ? { url: endpoint, apiKey: target.apiKey }
            : {
                url: `${target.baseUrl.replace(/\/+$/, "")}${
                  target.vendor === "moonshot" ? "/v1/users/me/balance" : "/user/balance"
                }`,
                apiKey: target.apiKey,
              };
          const response = await platform.fetchThirdPartyBalance!(request);
          if (!response.ok || response.status < 200 || response.status >= 300) {
            throw new Error(response.ok ? `HTTP ${response.status}` : response.error);
          }
          const parsed =
            target.vendor === "deepseek"
              ? parseDeepSeekBalance(response.bodyText)
              : parseMoonshotBalance(response.bodyText);
          if (!parsed) {
            throw new Error("unexpected balance payload");
          }
          // 日快照：今日已用的基线来源。
          recordBalanceObservation(target.entryKey, parsed.balance);
          return {
            balanceText: parsed.balanceText,
            symbol: parsed.symbol,
            balance: parsed.balance,
            fetchedAt: Date.now(),
          };
        };

        void run()
          .then((entry) => {
            writeCacheEntry(target.entryKey, entry);
            setCacheVersion((version) => version + 1);
          })
          .catch((error: unknown) => {
            // 失败不写缓存（保留旧值）；缺 Cookie 时不算异常噪音。
            if ((error as Error)?.message !== "mimo cookie missing") {
              console.warn("[third-party-balance] 查询失败", target.providerId, error);
            }
          })
          .finally(() => {
            setLoadingKeys((current) => {
              const next = { ...current };
              delete next[target.entryKey];
              return next;
            });
          });
      }
    },
    [platform, targets],
  );

  useEffect(() => {
    refresh(false);
  }, [refresh, refreshSignal]);

  const entries: ThirdPartyBalanceEntry[] = useMemo(() => {
    const cache = readCache();
    const dailyStore = loadDailyStore();
    const today = formatDateKey(new Date());
    void cacheVersion; // 依赖缓存版本号触发重算
    return targets.map((target) => {
      const cached = cache.balances[target.entryKey];
      const isLoading = Boolean(loadingKeys[target.entryKey]);
      const base = {
        providerId: target.providerId,
        label: target.label,
        vendor: target.vendor,
        consoleUrl: target.consoleUrl,
      };

      if (target.vendor === "mimo") {
        const hasCookie = Boolean(readMimoCookie());
        const mimoBase = {
          ...base,
          balanceText: null,
          todaySpentValue: null,
          currencySymbol: null,
          monthPercent: null as number | null,
          planUsed: null as number | null,
          planLimit: null as number | null,
        };
        if (isLoading) {
          return {
            ...mimoBase,
            monthPercent: cached?.monthPercent ?? null,
            planUsed: cached?.planUsed ?? null,
            planLimit: cached?.planLimit ?? null,
            state: "loading" as const,
            fetchedAt: cached?.fetchedAt ?? null,
            needsCookie: true,
          };
        }
        if (cached?.monthPercent !== undefined) {
          return {
            ...mimoBase,
            monthPercent: cached.monthPercent,
            planUsed: cached.planUsed ?? null,
            planLimit: cached.planLimit ?? null,
            state: "ok" as const,
            fetchedAt: cached.fetchedAt,
            needsCookie: false,
          };
        }
        return {
          ...mimoBase,
          state: hasCookie ? ("error" as const) : ("unsupported" as const),
          errorMessage: hasCookie ? "mimo session expired or unavailable" : undefined,
          fetchedAt: null,
          needsCookie: true,
        };
      }

      const todaySpentValue =
        cached?.balance !== undefined
          ? computeTodaySpent(dailyStore, target.entryKey, cached.balance, today)
          : null;
      if (isLoading) {
        return {
          ...base,
          balanceText: cached?.balanceText ?? null,
          todaySpentValue,
          currencySymbol: cached?.symbol ?? null,
          monthPercent: null,
          planUsed: null,
          planLimit: null,
          state: "loading" as const,
          fetchedAt: cached?.fetchedAt ?? null,
        };
      }
      if (cached) {
        return {
          ...base,
          balanceText: cached.balanceText ?? null,
          todaySpentValue,
          currencySymbol: cached.symbol ?? null,
          monthPercent: null,
          planUsed: null,
          planLimit: null,
          state: "ok" as const,
          fetchedAt: cached.fetchedAt,
        };
      }
      return {
        ...base,
        balanceText: null,
        todaySpentValue: null,
        currencySymbol: null,
        monthPercent: null,
        planUsed: null,
        planLimit: null,
        state: "error" as const,
        errorMessage: "balance unavailable",
        fetchedAt: null,
      };
    });
  }, [loadingKeys, targets, cacheVersion]);

  return { entries, refresh: () => refresh(true), supported: entries.length > 0 };
}
