import { useState } from "react";
import { Button } from "@/components/ui/button.js";
import { Checkbox } from "@/components/ui/checkbox.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

/** 「以后不再显示」持久化键（本 fork 新增）。删除该键可重新看到确认弹窗。 */
const FORK_AND_DELETE_SKIP_CONFIRM_KEY = "zcode:forkAndDelete.skipConfirm";

export function shouldSkipForkAndDeleteConfirm(): boolean {
  try {
    return window.localStorage.getItem(FORK_AND_DELETE_SKIP_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 「从此处继续对话」首次确认弹窗：展示功能原理 + 可勾选「以后不再显示」。
 * 只在分叉并删除路径使用；普通删除（F4/右键）始终走通用 ConfirmDialog。
 */
export function ForkAndDeleteConfirmDialog({
  open,
  onResolve,
}: {
  open: boolean;
  /** 用户做出选择：确认/取消 + 是否记住偏好。 */
  onResolve: (confirmed: boolean, rememberSkip: boolean) => void;
}) {
  const { intl } = useZCodeIntl();
  const [remember, setRemember] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onResolve(false, false);
        }
      }}
    >
      <DialogContent className="max-w-xl overflow-hidden rounded-2xl p-0">
        <div className="flex min-w-0 flex-col gap-6 p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle>
              {intl.formatMessage({ id: "confirmDialog.forkAndDeleteTitle" })}
            </DialogTitle>
          </DialogHeader>
          <div className="text-ui-base text-foreground-subtle whitespace-pre-line">
            {intl.formatMessage({ id: "confirmDialog.forkAndDeleteDetail" })}
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-ui-base">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            {intl.formatMessage({ id: "confirmDialog.forkAndDeleteDontAskAgain" })}
          </label>
          <DialogFooter className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="h-10 min-w-0 px-5"
              onClick={() => onResolve(false, false)}
            >
              {intl.formatMessage({ id: "common.cancel" })}
            </Button>
            <Button
              type="button"
              size="lg"
              className="h-10 min-w-0 px-5"
              onClick={() => onResolve(true, remember)}
            >
              {intl.formatMessage({ id: "confirmDialog.forkAndDeleteConfirm" })}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 读取勾选偏好后落盘。 */
export function persistForkAndDeleteSkip(skip: boolean): void {
  try {
    if (skip) {
      window.localStorage.setItem(FORK_AND_DELETE_SKIP_CONFIRM_KEY, "1");
    } else {
      window.localStorage.removeItem(FORK_AND_DELETE_SKIP_CONFIRM_KEY);
    }
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为每次询问。
  }
}
