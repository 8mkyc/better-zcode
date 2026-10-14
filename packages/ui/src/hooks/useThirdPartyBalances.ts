/**
 * 第三方模型厂商余额（本 fork 新增）。
 *
 * 依据 provider_settings 视图里 personal（自定义）provider 的 baseUrl 识别厂商，
 * 命中已知厂商且配置了 apiKey 的才进入余额查询；余额经平台桥（main 进程代理
 * fetch，域名白名单）获取，绕开 renderer CORS。结果缓存在 localStorage（5 分钟 TTL），
 * 打开面板 / 手动刷新时重新拉取。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThirdPartyBalanceFetchResponse } from "@zcode/shared";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useProviderSettingsView } from "@/hooks/useProviderSettingsView.js";

export type ThirdPartyVendorId = "deepseek" | "moonshot" | "mimo";

export interface ThirdPartyBalanceEntry {
  providerId: string;
  label: string;
  vendor: ThirdPartyVendorId;
  /** 余额展示文本（如 ¥88.50）；mimo 等无接口厂商为 null。 */
  balanceText: string | null;
  /** error | loading | ok | unsupported */
  state: "error" | "loading" | "ok" | "unsupported";
  errorMessage?: string;
  fetchedAt: number | null;
  /** mimo 等暂无公开接口的厂商给出的控制台链接。 */
  consoleUrl?: string;
}

interface BalanceCachePayload {
  balances: Record<string, { balanceText: string; fetchedAt: number }>;
}

const CACHE_KEY = "zcode:third-party-balances";
const CACHE_TTL_MS = 5 * 60 * 1000;

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

function writeCache(entryKey: string, balanceText: string, fetchedAt: number): void {
  try {
    const cache = readCache();
    cache.balances[entryKey] = { balanceText, fetchedAt };
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
  balanceText: string | null;
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
    return { balanceText: `${symbol}${info.total_balance}` };
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
    return { balanceText: `${symbol}${data.available_balance}` };
  } catch {
    return null;
  }
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
      const access = provider.effectiveConfig.access;
      const apiKey = access?.type === "api-key" ? (access.apiKey ?? "") : "";
      if (!apiKey) continue;
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
        if (target.vendor === "mimo") continue; // 无公开接口，静态展示
        const cached = cache.balances[target.entryKey];
        const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
        if (!force && fresh) continue;
        setLoadingKeys((current) => ({ ...current, [target.entryKey]: true }));
        const endpoint = balanceEndpointFor(target.vendor);
        const request: Parameters<
          NonNullable<typeof platform.fetchThirdPartyBalance>
        >[0] = endpoint
          ? { url: endpoint, apiKey: target.apiKey }
          : // 自定义域名（如 moonshot.ai 直连用户配置的 baseUrl 同源查询）
            {
                url: `${target.baseUrl.replace(/\/+$/, "")}${
                  target.vendor === "moonshot" ? "/v1/users/me/balance" : "/user/balance"
                }`,
                apiKey: target.apiKey,
              };
        void platform
          .fetchThirdPartyBalance(request)
          .then((response: ThirdPartyBalanceFetchResponse) => {
            if (response.ok && response.status >= 200 && response.status < 300) {
              const parsed =
                target.vendor === "deepseek"
                  ? parseDeepSeekBalance(response.bodyText)
                  : target.vendor === "moonshot"
                    ? parseMoonshotBalance(response.bodyText)
                    : null;
              if (parsed?.balanceText) {
                writeCache(target.entryKey, parsed.balanceText, Date.now());
                setCacheVersion((version) => version + 1);
                return;
              }
              throw new Error("unexpected balance payload");
            }
            throw new Error(response.ok ? `HTTP ${response.status}` : response.error);
          })
          .catch((error: unknown) => {
            // 失败不写缓存（保留旧值），错误态由无缓存时的 render 兜底展示。
            console.warn("[third-party-balance] 查询失败", target.providerId, error);
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
    void cacheVersion; // 依赖缓存版本号触发重算
    return targets.map((target) => {
      const cached = cache.balances[target.entryKey];
      const isLoading = Boolean(loadingKeys[target.entryKey]);
      if (target.vendor === "mimo") {
        return {
          providerId: target.providerId,
          label: target.label,
          vendor: target.vendor,
          balanceText: null,
          state: "unsupported" as const,
          fetchedAt: null,
          consoleUrl: target.consoleUrl,
        };
      }
      if (isLoading) {
        return {
          providerId: target.providerId,
          label: target.label,
          vendor: target.vendor,
          balanceText: null,
          state: "loading" as const,
          fetchedAt: cached?.fetchedAt ?? null,
        };
      }
      if (cached) {
        return {
          providerId: target.providerId,
          label: target.label,
          vendor: target.vendor,
          balanceText: cached.balanceText,
          state: "ok" as const,
          fetchedAt: cached.fetchedAt,
        };
      }
      return {
        providerId: target.providerId,
        label: target.label,
        vendor: target.vendor,
        balanceText: null,
        state: "error" as const,
        errorMessage: "balance unavailable",
        fetchedAt: null,
      };
    });
  }, [loadingKeys, targets, cacheVersion]);

  return { entries, refresh: () => refresh(true), supported: entries.length > 0 };
}
