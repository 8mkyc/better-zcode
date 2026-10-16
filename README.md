<div align="center">
  <img src="assets/logo.png" alt="Better ZCode" width="128" height="128" />
</div>

<h1 align="center">Better ZCode</h1>

<p align="center">
  基于 <a href="https://github.com/zai-org/ZCode">ZCode 开源版</a> 的体验增强分支 —— 把高频对话管理动作全部键盘化，外加第三方模型余额面板。
</p>

<p align="center">
  <a href="LICENSE">Apache-2.0</a> ·
  <a href="docs/与官方差异表.md">与官方差异表</a> ·
  <a href="docs/隐私说明.md">隐私说明</a> ·
  <a href="README.en.md">English</a>
</p>

> [!IMPORTANT]
> **第三方改款，与 Z.ai / 智谱无隶属关系。** 基于 Apache-2.0 开源版修改，改动清单全公开（见 NOTICE 与差异表）。安装包未做代码签名，首次运行 SmartScreen 选“仍要运行”。

## 这是什么

官方 ZCode 桌面端很好，但高频操作全要鼠标。本分支把**对话管理全家桶搬上键盘**，并加了一个第三方模型余额面板——全部改动可关、可审计、可一键回到官方版。

| 你的情况 | 建议 |
| --- | --- |
| 想要键盘流对话管理 + 余额显示 | ✅ 直接用本分支 |
| 只想要 ZCode 自身 token 用量显示 | 试试 [zcode-token-usage-statusbar](https://github.com/xhwxt/zcode-token-usage-statusbar)（外挂，零侵入） |
| 要官方支持/最新闭源功能 | 用官方版；本分支跟随开源版版本号 |

## 功能

### ⌨️ 对话管理快捷键（全部可在 设置 → 快捷键 改键）

| 键 | 功能 |
| --- | --- |
| **F2** | 重命名当前对话 |
| **F3** | 归档当前对话 |
| **F4** | 删除当前对话（带确认） |
| **F5** | 置顶 / 取消置顶 |
| **F6** | 未读 / 已读切换 |

右键侧边栏对话同样有完整菜单（含删除）。

### 🎯 分叉并删除（键盘流 rewind）

每条 AI 回复的动作栏有「🗑 从此处继续对话」按钮：**从这条消息开出新对话（保留之前全部上下文），原对话删除**——文件修改不回滚。用来给失控的对话“截断重来”，省上下文。

### 💰 第三方余额面板

输入框工具条的 **¥** 按钮 → 弹出第三方模型余额面板：

- **DeepSeek / Kimi**：余额 + 今日已用（¥）
- **小米 MiMo Tokens Plan**：月度已用百分比 + 计划额度用量
- 「今日花费」总额行；每 5 分钟自动刷新（可调）
- 供应商从你的 ZCode 自定义模型配置**自动发现**；MiMo 支持一键登录抓 Cookie
- 数据只存本地；API key / Cookie 只发对应厂商官方域名（白名单代码公开可审计）

### 🛡 与官方的关系

- **可与官方 ZCode 并排安装**：产品名/图标/安装目录/appId 全部隔离，互不覆盖
- 共享 `~/.zcode` 业务数据（对话记录两边都在）
- **无遥测**：本分支构建不含官方遥测上报
- 不会被官方自动更新覆盖

## 安装

1. 到 [Releases](../../releases) 下载 `Better ZCode-<版本>-win-x64.exe`
2. 双击安装（SmartScreen 提示选“更多信息 → 仍要运行”，因未购买代码签名）
3. 打开即用；余额面板按需在弹窗里配置

**卸载**：系统“应用”里卸载 Better ZCode；对话数据在 `~/.zcode`，不受影响。

**更新**：新版本发布后下载新 exe 覆盖安装即可（数据保留）。

## 从源码构建

```bash
git clone https://github.com/<you>/better-zcode.git
cd better-zcode
pnpm install
pnpm --filter "@zcode/desktop..." run build
pnpm --filter "@zcode/desktop" run bundle -- --os win --arch x64
# 产物：packages/desktop/dist/*.exe
```

要求：Node 24+、pnpm 10+。详见 [docs/同步上游手册.md](docs/同步上游手册.md)。

## 同步上游

上游（zai-org/ZCode）以“快照式大版本”更新（约 2-4 周一次）。本分支把全部改动收敛为少量主题补丁，冲突热点清单与逐项验证步骤见 [同步上游手册](docs/同步上游手册.md)。

## 致谢与许可

- 上游：[zai-org/ZCode](https://github.com/zai-org/ZCode)（Apache-2.0）
- 灵感与对照：[zcode-token-usage-statusbar](https://github.com/xhwxt/zcode-token-usage-statusbar)、[Open-ZCode](https://github.com/Leelion96/Open-ZCode)、[zcode-full](https://github.com/jiaqiangbandongg/zcode-full)

[Apache-2.0](LICENSE) © Better ZCode 贡献者；原始版权归 Z.ai（见 NOTICE）。
