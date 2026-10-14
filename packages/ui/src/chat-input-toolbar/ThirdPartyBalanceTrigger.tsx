import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import { ChatThirdPartyBalancePanel } from "@/chat-input-toolbar/ThirdPartyBalancePanel.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/**
 * 「余额」按钮（本 fork 新增）：长在输入框工具条上（上下文占用旁），
 * 点击弹出第三方余额面板（含今日花费总额）。不悬浮、不常驻，随客户端原生 DPI 渲染。
 */
export function ThirdPartyBalanceTrigger() {
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={intl.formatMessage({ id: "chat.thirdPartyBalance.title" })}
          className="h-7 min-w-7 px-1.5 text-ui-sm text-foreground-subtle hover:text-foreground"
        >
          ¥
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="!w-80 p-3">
        <ChatThirdPartyBalancePanel />
      </PopoverContent>
    </Popover>
  );
}
