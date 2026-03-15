# 🤖 GO-TONGX — AI 项目助手

> 基于 Tauri + React + Rust 的智能项目管理桌面应用

## ✨ 功能特性

- 📁 **项目管理** — 创建、搜索、筛选项目
- 🧠 **AI 技能中心** — MCP 插件生态、技能市场、Agent 管理
- 💬 **AI 对话** — 支持在线/本地大模型（硅基流动、DeepSeek、Gemini、LM Studio）
- 🧾 **差旅管理** — 发票 OCR 识别、行程报销
- 📝 **全局模板** — 可复用的项目模板系统
- 🎨 **三套主题** — 浅色 / 暗色 / 液态玻璃（iOS 26 风格）

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Rust + Tauri 2.0 |
| 样式 | CSS Variables + Tailwind |
| AI  | OpenAI 兼容 API + MCP 协议 |
| 存储 | SQLite (rusqlite) |

## 🚀 新电脑部署

### 1. 安装依赖工具

- [Git](https://git-scm.com/downloads)
- [Node.js v18+](https://nodejs.org)
- [Rust](https://rustup.rs)

### 2. 克隆并运行

```powershell
cd K:\
git clone https://github.com/147258369zhh-lgtm/-.git
cd -
npm install
npm run tauri dev
```

> 首次编译 Rust 约需 5-15 分钟，之后秒启动

## 📦 日常同步

```powershell
# 推送改动
git add -A
git commit -m "更新说明"
git push

# 另一台电脑拉取
git pull
```
