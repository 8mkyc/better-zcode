import { ipcMain } from "electron";
import { PlatformChannels } from "@zcode/shared";
import type {
  ThirdPartyBalanceFetchRequest,
  ThirdPartyBalanceFetchResponse,
} from "@zcode/shared";

/** 允许代理查询余额的厂商域名后缀（本 fork 新增；不命中一律拒绝，防止被当成通用代理）。 */
const BALANCE_HOST_SUFFIXES = [
  "deepseek.com",
  "moonshot.cn",
  "moonshot.ai",
  "xiaomimimo.com",
] as const;

function isAllowedBalanceUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 2048) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return BALANCE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function registerThirdPartyBalanceIpc(): void {
  ipcMain.handle(
    PlatformChannels.ThirdPartyBalanceFetch,
    async (_event, payload: unknown): Promise<ThirdPartyBalanceFetchResponse> => {
      const request = payload as Partial<ThirdPartyBalanceFetchRequest> | null;
      if (!isAllowedBalanceUrl(request?.url) || typeof request?.apiKey !== "string") {
        return { ok: false, error: "rejected: invalid url or missing api key" };
      }
      try {
        // Node 侧 fetch 无 CORS 限制；15s 超时防挂。
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        const response = await fetch(request.url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${request.apiKey}`,
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const bodyText = await response.text();
        return { ok: true, status: response.status, bodyText: bodyText.slice(0, 16 * 1024) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}
