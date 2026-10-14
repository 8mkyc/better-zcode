import { BrowserWindow, ipcMain, session } from "electron";
import { PlatformChannels } from "@zcode/shared";
import type { MimoLoginResult } from "@zcode/shared";

const MIMO_URL = "https://platform.xiaomimimo.com/";
/** 登录成功的标志 Cookie（控制台会话三件套之一，见社区逆向文档）。 */
const MIMO_TOKEN_COOKIE = "api-platform_serviceToken";
const POLL_INTERVAL_MS = 1_000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1_000;

async function readMimoCookieHeader(): Promise<string | null> {
  const cookies = await session.defaultSession.cookies.get({ url: MIMO_URL });
  const hasToken = cookies.some((cookie) => cookie.name === MIMO_TOKEN_COOKIE);
  if (!hasToken || cookies.length === 0) {
    return null;
  }
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * MiMo 登录窗（本 fork 新增）：打开平台登录页，用户登录后轮询默认会话的
 * xiaomimimo Cookie，检测到会话 token 即组装 Cookie 请求头返回并自动关窗。
 * 取消/超时返回 error；Cookie 只回传给 renderer 再发往 xiaomimimo（余额 IPC 白名单拦截）。
 */
export function registerMimoLoginIpc(): void {
  ipcMain.handle(PlatformChannels.MimoLoginWindow, async (): Promise<MimoLoginResult> => {
    return await new Promise<MimoLoginResult>((resolve) => {
      const win = new BrowserWindow({
        width: 560,
        height: 760,
        autoHideMenuBar: true,
        title: "登录 MiMo",
      });
      let settled = false;
      const settle = (result: MimoLoginResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearInterval(timer);
        clearTimeout(timeout);
        if (!win.isDestroyed()) {
          win.close();
        }
        resolve(result);
      };
      const timer = setInterval(() => {
        void readMimoCookieHeader().then((header) => {
          if (header) {
            settle({ ok: true, cookie: header });
          }
        });
      }, POLL_INTERVAL_MS);
      const timeout = setTimeout(() => settle({ ok: false, error: "timeout" }), LOGIN_TIMEOUT_MS);
      win.on("closed", () => settle({ ok: false, error: "cancelled" }));
      void win.loadURL(MIMO_URL).catch((error: unknown) => {
        settle({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    });
  });
}
