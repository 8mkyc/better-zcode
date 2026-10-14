import { useState } from "react";
import { RefreshCwIcon, ExternalLinkIcon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  useThirdPartyBalances,
  type ThirdPartyBalanceEntry,
} from "@/hooks/useThirdPartyBalances.js";

function formatFetchedAt(fetchedAt: number | null): string | null {
  if (!fetchedAt) return null;
  const minutes = Math.floor((Date.now() - fetchedAt) / 60_000);
  if (minutes <= 0) return "<1min";
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h`;
}

function BalanceRow({ entry, onRefresh }: { entry: ThirdPartyBalanceEntry; onRefresh: () => void }) {
  const { intl } = useZCodeIntl();
  return (
    <div className="flex items-center justify-between gap-3 text-ui-sm">
      <span className="truncate text-foreground-subtle">{entry.label}</span>
      <span className="flex items-center gap-1.5">
        {entry.state === "ok" ? (
          <span className="font-mono text-ui-sm text-foreground">{entry.balanceText}</span>
        ) : null}
        {entry.state === "loading" ? (
          <RefreshCwIcon className="size-3 animate-spin text-foreground-subtlest" />
        ) : null}
        {entry.state === "error" ? (
          <span className="text-ui-sm text-foreground-subtlest">--</span>
        ) : null}
        {entry.state === "unsupported" ? (
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
        {entry.state !== "unsupported" ? (
          <button
            type="button"
            aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.refresh" })}
            className="text-foreground-subtlest transition-colors hover:text-foreground-subtle"
            onClick={onRefresh}
          >
            <RefreshCwIcon className="size-3" />
          </button>
        ) : null}
        {formatFetchedAt(entry.fetchedAt) ? (
          <span className="text-ui-sm text-foreground-subtlest">
            {formatFetchedAt(entry.fetchedAt)}
          </span>
        ) : null}
      </span>
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
  const { entries, refresh, supported } = useThirdPartyBalances();
  const [refreshTick, setRefreshTick] = useState(0);
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
        <button
          type="button"
          aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.refreshAll" })}
          className="text-foreground-subtlest transition-colors hover:text-foreground-subtle"
          onClick={() => {
            refresh();
            setRefreshTick((tick) => tick + 1);
          }}
        >
          <RefreshCwIcon
            key={refreshTick}
            className="size-3.5 animate-none data-[spin=true]:animate-spin"
            data-spin="false"
          />
        </button>
      </div>
      {entries.map((entry) => (
        <BalanceRow key={entry.providerId} entry={entry} onRefresh={refresh} />
      ))}
    </div>
  );
}
