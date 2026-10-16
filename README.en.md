# Better ZCode

An experience-enhanced fork of the [open-source ZCode](https://github.com/zai-org/ZCode) desktop client — keyboard-first conversation management plus a third-party model balance panel.

> **Unofficial fork, not affiliated with or endorsed by Z.ai.** Built from the Apache-2.0 open-source release; all changes are public (see [NOTICE](NOTICE.md) and the diff table). Installers are unsigned — SmartScreen will ask on first run.

[中文说明](README.md)

## Features

- **Conversation hotkeys** (rebindable in Settings → Shortcuts): F2 rename · F3 archive · F4 delete (with confirm) · F5 pin/unpin · F6 unread/read toggle. Full menu also on sidebar right-click.
- **Fork-and-delete** (keyboard rewind): every assistant reply has a "Continue from here" button — opens a new conversation up to that message (context kept) and deletes the original. File changes are not reverted.
- **Third-party balance panel**: the **¥** button in the composer toolbar shows DeepSeek / Kimi balance + today's spend, and Xiaomi MiMo Tokens Plan monthly percentage. Providers are auto-discovered from your ZCode custom model config; MiMo supports one-click login for cookies.
- **Coexists with official ZCode**: separate product name / icon / install dir / appId; shares `~/.zcode` data; **no telemetry**; never overwritten by official auto-update.

## Install

Download `Better ZCode-<version>-win-x64.exe` from [Releases](../../releases), install, done. Data lives in `~/.zcode` and survives uninstall.

## Build from source

Node 24+ and pnpm 10+:

```bash
pnpm install
pnpm --filter "@zcode/desktop..." run build
pnpm --filter "@zcode/desktop" run bundle -- --os win --arch x64
```

## Syncing upstream

Upstream ships snapshot-style major versions every 2-4 weeks. See [docs/同步上游手册.md](docs/同步上游手册.md) (Chinese) for the rebase flow, conflict hotspot list, and verification checklist.

## License

[Apache-2.0](LICENSE). Original copyright Z.ai (see [NOTICE](NOTICE.md)). This fork is a community project, not affiliated with or endorsed by Z.ai.
