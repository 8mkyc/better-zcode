/* oxlint-disable eslint(max-lines) -- 余额面板含行渲染/今日口径/设置对话框/Cookie 登录流，拆分会把一条面板交互链打散到三处。 */
import { useState } from "react";
import { RefreshCwIcon, ExternalLinkIcon, KeyRoundIcon, Settings2Icon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { toast } from "@/components/ui/toast.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  loadBalanceSettings,
  saveBalanceSettings,
} from "@/lib/thirdPartyBalanceSettings.js";
import {
  compactTokens,
  readMimoCookie,
  useThirdPartyBalances,
  writeMimoCookie,
  type ThirdPartyBalanceEntry,
} from "@/hooks/useThirdPartyBalances.js";

/** mimo 月度窗口：0..1 消耗比 → "已用 25% · 剩 75%"（本地化）。 */
function formatMonthUsage(
  entry: ThirdPartyBalanceEntry,
  intl: { formatMessage: (desc: { id: string }, values?: Record<string, string>) => string },
): string | null {
  if (entry.monthPercent === null) return null;
  const used = Math.round(entry.monthPercent * 1000) / 10;
  const left = Math.round((1 - entry.monthPercent) * 1000) / 10;
  return intl.formatMessage({ id: "chat.thirdPartyBalance.usage" }, {
    used: `${used}`,
    left: `${left}`,
  });
}

/** mimo 计划额度："计划 64M/256M"（本地化）。 */
function formatPlanGrant(
  entry: ThirdPartyBalanceEntry,
  intl: { formatMessage: (desc: { id: string }, values?: Record<string, string>) => string },
): string | null {
  if (entry.planUsed === null || entry.planLimit === null || !entry.planLimit) return null;
  return intl.formatMessage({ id: "chat.thirdPartyBalance.planGrant" }, {
    used: compactTokens(entry.planUsed),
    limit: compactTokens(entry.planLimit),
  });
}

function formatFetchedAt(fetchedAt: number | null): string | null {
  if (!fetchedAt) return null;
  const minutes = Math.floor((Date.now() - fetchedAt) / 60_000);
  if (minutes <= 0) return "<1min";
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h`;
}

/**
 * 今日已用格式化：金额型 = 正数消费（−¥）/ 余额增加（+¥）；
 * 百分比型（mimo）= 今日消耗百分点（−2.1%）/ 回吐（+x.x%）。
 */
function formatTodaySpent(entry: ThirdPartyBalanceEntry): string | null {
  if (entry.todayPercentValue !== null) {
    const points = Math.abs(entry.todayPercentValue).toFixed(1);
    return entry.todayPercentValue >= 0 ? `−${points}%` : `+${points}%`;
  }
  if (entry.todaySpentValue === null) return null;
  const symbol = entry.currencySymbol ?? "¥";
  const value = Math.abs(entry.todaySpentValue).toFixed(2);
  return entry.todaySpentValue >= 0 ? `−${symbol}${value}` : `+${symbol}${value}`;
}

function BalanceRow({
  entry,
  todayLabel,
  showToday,
  showPlan,
  onSetCookie,
  onLogin,
  loginBusy,
}: {
  entry: ThirdPartyBalanceEntry;
  todayLabel: string;
  showToday: boolean;
  showPlan: boolean;
  onSetCookie: () => void;
  onLogin: () => void;
  loginBusy: boolean;
}) {
  const { intl } = useZCodeIntl();
  // 无基线时给"—"占位：行上永远有「今日」位，不再像缺功能。
  const todayText = formatTodaySpent(entry) ?? (entry.state === "ok" ? "—" : "");
  const monthUsageText = formatMonthUsage(entry, intl);
  const planGrantText = formatPlanGrant(entry, intl);
  return (
    <div className="flex flex-col gap-0.5 text-ui-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-foreground-subtle">{entry.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {entry.state === "ok" && entry.balanceText ? (
            <span className="font-mono text-ui-sm text-foreground">{entry.balanceText}</span>
          ) : null}
          {entry.state === "ok" && monthUsageText ? (
            <span className="font-mono text-ui-sm text-foreground">{monthUsageText}</span>
          ) : null}
          {entry.state === "loading" ? (
            <RefreshCwIcon className="size-3 animate-spin text-foreground-subtlest" />
          ) : null}
          {entry.state === "error" ? (
            entry.needsCookie ? (
              <span className="text-ui-sm text-warning">
                {intl.formatMessage({ id: "chat.thirdPartyBalance.cookieExpired" })}
              </span>
            ) : (
              <span className="text-ui-sm text-foreground-subtlest">--</span>
            )
          ) : null}
          {entry.state === "unsupported" && entry.consoleUrl ? (
            <a
              href={entry.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-0.5 text-ui-sm text-foreground-subtle underline decoration-dotted"
            >
              {intl.formatMessage({ id: "chat.thirdPartyBalance.console" })}
              <ExternalLinkIcon className="size-3" />
            </a>
          ) : null}
          {entry.needsCookie ? (
            <>
              <button
                type="button"
                disabled={loginBusy}
                aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.login" })}
                className="flex items-center gap-0.5 text-ui-sm text-foreground-subtle transition-colors hover:text-foreground disabled:opacity-50"
                onClick={onLogin}
              >
                <KeyRoundIcon className={cn("size-3", loginBusy && "animate-pulse")} />
                {intl.formatMessage({ id: "chat.thirdPartyBalance.login" })}
              </button>
              <button
                type="button"
                aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.manualPaste" })}
                className="text-ui-sm text-foreground-subtle underline decoration-dotted transition-colors hover:text-foreground"
                onClick={onSetCookie}
              >
                {intl.formatMessage({ id: "chat.thirdPartyBalance.manualPaste" })}
              </button>
            </>
          ) : null}
          {formatFetchedAt(entry.fetchedAt) ? (
            <span className="text-ui-sm text-foreground-subtlest">
              {formatFetchedAt(entry.fetchedAt)}
            </span>
          ) : null}
        </span>
      </div>
      {(showToday && todayText) || (showPlan && planGrantText) ? (
        <div className="flex items-center justify-between gap-3 pl-0.5">
          <span className="text-ui-sm text-foreground-subtlest">
            {showPlan ? (planGrantText ?? "") : ""}
          </span>
          <span className="text-ui-sm text-foreground-subtlest">
            {showToday && todayText ? `${todayLabel} ${todayText}` : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 「第三方余额」段（本 fork 新增）：挂在 ChatContextUsage 面板尾部，
 * 展示按 baseUrl 识别出的自定义 provider（DeepSeek/Kimi/MiMo）余额。
 * 没有任何可识别 provider 时整段不渲染。
 */
export function ChatThirdPartyBalancePanel({ separated = false }: { separated?: boolean }) {
  const { intl } = useZCodeIntl();
  const platform = useOptionalPlatform();
  const { entries, refresh, applySettings, supported } = useThirdPartyBalances();
  const [settings, setSettings] = useState(() => loadBalanceSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(() => loadBalanceSettings());
  const [refreshTick, setRefreshTick] = useState(0);
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);
  const [cookieDraft, setCookieDraft] = useState(readMimoCookie());
  const [loginBusy, setLoginBusy] = useState(false);
  // 一键登录：打开 MiMo 登录窗 → main 自动抓 Cookie → 存好即刷新（零复制粘贴）。
  const startMimoLogin = () => {
    if (!platform?.openMimoLoginAndGetCookie || loginBusy) {
      return;
    }
    setLoginBusy(true);
    void platform
      .openMimoLoginAndGetCookie()
      .then((result) => {
        if (result.ok) {
          writeMimoCookie(result.cookie);
          setCookieDraft(result.cookie);
          setCookieDialogOpen(false);
          refresh();
          toast(intl.formatMessage({ id: "chat.thirdPartyBalance.loginSuccess" }));
          return;
        }
        toast(
          result.error === "cancelled"
            ? intl.formatMessage({ id: "chat.thirdPartyBalance.loginCancelled" })
            : intl.formatMessage(
                { id: "chat.thirdPartyBalance.loginFailed" },
                { error: result.error },
              ),
        );
      })
      .finally(() => setLoginBusy(false));
  };
  const openSettings = () => {
    setSettingsDraft({ ...loadBalanceSettings(), order: entries.map((e) => e.providerId) });
    setSettingsOpen(true);
  };
  const moveOrder = (index: number, delta: number) => {
    setSettingsDraft((draft) => {
      const order = [...draft.order];
      const target = index + delta;
      if (target < 0 || target >= order.length) {
        return draft;
      }
      const swapped = [...order];
      const tmp = swapped[index]!;
      swapped[index] = swapped[target]!;
      swapped[target] = tmp;
      return { ...draft, order: swapped };
    });
  };
  const saveSettings = () => {
    saveBalanceSettings(settingsDraft);
    setSettings(settingsDraft);
    applySettings();
    setSettingsOpen(false);
  };
  const todayLabel = intl.formatMessage({ id: "chat.thirdPartyBalance.today" });
  // 今日花费总额 = 各家今日已用的正数之和（充值不抵扣花费语义）。
  const spentValues = entries
    .map((entry) => entry.todaySpentValue)
    .filter((value): value is number => value !== null);
  const totalSymbol = entries.find((entry) => entry.currencySymbol)?.currencySymbol ?? "¥";
  const totalSpent = spentValues.reduce((sum, value) => sum + (value > 0 ? value : 0), 0);
  const totalText =
    spentValues.length === 0 ? "—" : `−${totalSymbol}${totalSpent.toFixed(2)}`;
  if (!supported) {
    return null;
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-ui-sm",
        separated && "border-t border-border pt-3",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-ui-sm font-medium text-foreground">
          {intl.formatMessage({ id: "chat.thirdPartyBalance.title" })}
        </span>
        <span className="flex items-center gap-1">
        <button
          type="button"
          aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.settings.title" })}
          className="text-foreground-subtlest transition-colors hover:text-foreground-subtle"
          onClick={openSettings}
        >
          <Settings2Icon className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.refreshAll" })}
          className="text-foreground-subtlest transition-colors hover:text-foreground-subtle"
          onClick={() => {
            refresh();
            setRefreshTick((tick) => tick + 1);
          }}
        >
          <RefreshCwIcon key={refreshTick} className="size-3.5" />
        </button>
        </span>
      </div>
      {settings.showTodayTotal ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-2 py-1">
          <span className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "chat.thirdPartyBalance.todayTotal" })}
          </span>
          <span className="font-mono text-ui-sm font-medium text-foreground">{totalText}</span>
        </div>
      ) : null}
      {entries.map((entry) => (
        <BalanceRow
          key={entry.providerId}
          entry={entry}
          todayLabel={todayLabel}
          showToday={settings.showToday}
          showPlan={settings.showPlan}
          onLogin={startMimoLogin}
          loginBusy={loginBusy}
          onSetCookie={() => {
            setCookieDraft(readMimoCookie());
            setCookieDialogOpen(true);
          }}
        />
      ))}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md overflow-hidden rounded-2xl p-0">
          <div className="flex min-w-0 flex-col gap-4 p-5">
            <DialogHeader className="space-y-2">
              <DialogTitle>
                {intl.formatMessage({ id: "chat.thirdPartyBalance.settings.title" })}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {(
                [
                  ["showToday", "chat.thirdPartyBalance.settings.showToday"],
                  ["showTodayTotal", "chat.thirdPartyBalance.settings.showTodayTotal"],
                  ["showPlan", "chat.thirdPartyBalance.settings.showPlan"],
                ] as const
              ).map(([key, labelId]) => (
                <label key={key} className="flex cursor-pointer items-center gap-2 text-ui-sm">
                  <Checkbox
                    checked={settingsDraft[key]}
                    onCheckedChange={(checked) =>
                      setSettingsDraft((draft) => ({ ...draft, [key]: checked === true }))
                    }
                  />
                  {intl.formatMessage({ id: labelId })}
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-ui-sm">
              {intl.formatMessage({ id: "chat.thirdPartyBalance.settings.refresh" })}
              <input
                type="number"
                min={1}
                max={60}
                value={settingsDraft.refreshMinutes}
                className="w-16 rounded-md border border-input-border bg-input px-2 py-1 text-ui-sm text-foreground outline-none"
                onChange={(event) =>
                  setSettingsDraft((draft) => ({
                    ...draft,
                    refreshMinutes: Math.max(1, Math.min(60, Number(event.target.value) || 5)),
                  }))
                }
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-ui-sm text-foreground-subtle">
                {intl.formatMessage({ id: "chat.thirdPartyBalance.settings.order" })}
              </span>
              {settingsDraft.order.map((id, index) => (
                <div key={id} className="flex items-center justify-between gap-2 text-ui-sm">
                  <span className="truncate text-foreground">
                    {entries.find((entry) => entry.providerId === id)?.label ?? id}
                  </span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.settings.up" })}
                      className="text-foreground-subtlest hover:text-foreground"
                      onClick={() => moveOrder(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.settings.down" })}
                      className="text-foreground-subtlest hover:text-foreground"
                      onClick={() => moveOrder(index, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <DialogFooter className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="h-10 min-w-0 px-5"
                onClick={() => setSettingsOpen(false)}
              >
                {intl.formatMessage({ id: "common.cancel" })}
              </Button>
              <Button type="button" size="lg" className="h-10 min-w-0 px-5" onClick={saveSettings}>
                {intl.formatMessage({ id: "common.confirm" })}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={cookieDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCookieDialogOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-xl overflow-hidden rounded-2xl p-0">
          <div className="flex min-w-0 flex-col gap-5 p-6">
            <DialogHeader className="space-y-2">
              <DialogTitle>
                {intl.formatMessage({ id: "chat.thirdPartyBalance.cookieDialog.title" })}
              </DialogTitle>
            </DialogHeader>
            <div className="text-ui-sm whitespace-pre-line text-foreground-subtle">
              {intl.formatMessage({ id: "chat.thirdPartyBalance.cookieDialog.description" })}
            </div>
            <Button
              type="button"
              size="lg"
              disabled={loginBusy}
              className="h-10 w-full"
              onClick={startMimoLogin}
            >
              <KeyRoundIcon className={cn("size-4", loginBusy && "animate-pulse")} />
              {intl.formatMessage({ id: "chat.thirdPartyBalance.login" })}
            </Button>
            <textarea
              value={cookieDraft}
              rows={4}
              spellCheck={false}
              placeholder={intl.formatMessage({
                id: "chat.thirdPartyBalance.cookieDialog.placeholder",
              })}
              className="w-full rounded-md border border-input-border bg-input px-3 py-2 font-mono text-ui-sm text-foreground outline-none focus-visible:border-input-border-focused"
              onChange={(event) => setCookieDraft(event.target.value)}
            />
            <DialogFooter className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="h-10 min-w-0 px-5"
                onClick={() => setCookieDialogOpen(false)}
              >
                {intl.formatMessage({ id: "common.cancel" })}
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-10 min-w-0 px-5"
                onClick={() => {
                  writeMimoCookie(cookieDraft);
                  setCookieDialogOpen(false);
                  refresh();
                }}
              >
                {intl.formatMessage({ id: "common.confirm" })}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
