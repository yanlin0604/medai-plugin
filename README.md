# MedAI Plugin — AI智能病历书写助手插件系统

<p align="center">
  <img src="src-tauri/icons/icon.png" alt="AI智能病历书写助手" width="128" height="128">
</p>

<p align="center">
  <strong>AI智能病历书写助手桌面端插件</strong><br>
  基于 Tauri 2 + React 18 + TypeScript 构建的医疗AI辅助文书生成桌面应用
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-blue?logo=tauri" alt="Tauri 2">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18">
  <img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Rust-1.x-000000?logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/License-Private-red" alt="License">
</p>

---

## 📋 目录

- [项目简介](#-项目简介)
- [功能模块](#-功能模块)
- [技术栈](#-技术栈)
- [项目结构](#-项目结构)
- [快速开始](#-快速开始)
- [开发指南](#-开发指南)
- [Tauri 命令（IPC）](#-tauri-命令ipc)
- [前端状态管理](#-前端状态管理)
- [环境变量](#-环境变量)
- [构建与打包](#-构建与打包)
- [项目进度](#-项目进度)
- [贡献指南](#-贡献指南)

---

## 🏥 项目简介

MedAI Plugin 是一款面向医院住院部医生的 **AI智能病历书写桌面端插件**，以侧边栏面板形式常驻于医生工作桌面，与医院信息系统（HIS）联动运行。核心能力包括：

- 🔉 **床旁语音录音**：查房时实时录音并转写为文字
- 📝 **AI辅助文书生成**：基于患者EMR数据，LLM自动生成住院病历文书
- 🏥 **HIS系统联动**：自动检测HIS窗口、读取患者上下文、安全回写文书
- ✅ **病历质控检查**：对生成文书进行完整性、一致性、规范性、逻辑性质控
- 📋 **智能推荐**：根据入院时限与患者状态，主动推荐需要书写的文书模板

---

## 🧩 功能模块

### 0. 病案首页（Homepage）

病案首页是住院病历的重要组成部分，包含患者基本信息、住院信息、诊断信息、手术信息、费用信息和医师签名等。

- 📋 **自动填充**：从HIS/EMR系统自动拉取患者信息、诊断、费用等数据
- 🏥 **ICD编码**：根据诊断自动匹配ICD-10编码
- 💰 **费用汇总**：自动汇总住院期间全部费用
- ✍️ **医师签名**：支持主任医师、主治医师、住院医师、编码员、质控医师签名
- 📤 **一键回写**：生成完成后一键回写至EMR系统

### 1. 查房工作台（Round Workbench）

一站式查房助手，支持床旁录音、患者信息自动对齐、实时ASR语音转写。

- 录音会话管理（开始/暂停/恢复/停止）
- 音频设备自动枚举与选择
- 录音文件本地保存
- 患者信息与录音任务绑定

### 2. 文书编辑器（Document Editor）

富文本AI辅助文书生成器，是当前最完善的功能模块。

- 📄 **文书模板**：入院记录、首次病程记录、主治医师查房记录等
- 🤖 **AI生成**：打字机效果逐字输出，含4步思维链可视化：
  1. EMR要素提取
  2. 诊疗规范检索
  3. LLM文书组装
  4. 质控审核校验
- 📋 **一键复制** / **回写HIS**（含锁定/解锁安全流控）
- 🛡️ **质控标识**：自动校验文书通过/不通过状态

### 3. 会议讨论（Meeting Discussion）

疑难病例讨论与死亡病例讨论的录音记录与患者路由功能。

### 4. 质控检查（Quality Control）

病历内涵质控引擎，检查维度包括：

| 维度 | 说明 |
|------|------|
| 完整性 | 必填要素是否齐全 |
| 一致性 | 各文书间数据是否矛盾 |
| 规范性 | 格式与术语是否符合标准 |
| 逻辑性 | 诊疗逻辑是否合理自洽 |

### 5. 回写HIS（HIS Write-back）

安全地将AI生成的文书回写至HIS系统。

- 🔒 **防串户锁**：防止患者身份错位
- ⚠️ **并发冲突检测**：多人同时编辑时检测冲突
- ✅ **二次确认机制**：关键操作需双重确认

---

## 🛠 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3 | UI框架 |
| TypeScript | 5.5 | 类型安全 |
| Vite | 5.4 | 构建工具 |
| TailwindCSS | 3.4 | 原子化样式 |
| Zustand | 4.5 | 状态管理 |
| Ant Design | 6.4 | UI组件库（中文本地化） |
| TipTap | - | 富文本编辑器 |
| React Router | 6.26 | 客户端路由 |
| Axios | 1.7 | HTTP客户端 |
| date-fns | 3.6 | 日期处理 |
| clsx | 2.1 | 类名工具 |

### 后端（Rust / Tauri 2）

| 技术 | 版本 | 用途 |
|------|------|------|
| Tauri | 2.0 | 桌面应用框架 |
| Tokio | 1 (full) | 异步运行时 |
| cpal | 0.15 | 跨平台音频录制 |
| serde / serde_json | 1 | 序列化 |
| uuid | 1 | 会话ID生成 |
| chrono | 0.4 | 时间处理 |
| anyhow | 1 | 错误处理 |
| whoami | 1 | 系统信息获取 |
| env_logger | 0.10 | 日志输出 |

### AI 集成

- **ASR 实时转写**：WebSocket 语音识别服务
- **LLM 文书生成**：大语言模型驱动的病历文书自动生成
- **智能补全**：输入时实时建议
- **ICD 推荐**：诊断编码智能推荐

---

## 📁 项目结构

```
medai-plugin/
├── index.html                     # Vite HTML 入口
├── package.json                   # Node.js 依赖与脚本
├── vite.config.ts                 # Vite 构建配置
├── tailwind.config.ts             # Tailwind 主题（含医疗色系）
├── tsconfig.json                  # TypeScript 配置
├── postcss.config.js              # PostCSS 配置
├── src/                           # 🖥️ 前端源码（React + TS）
│   ├── main.tsx                   # React 入口
│   ├── App.tsx                    # 根组件（路由配置）
│   ├── vite-env.d.ts              # 环境变量类型声明
│   │
│   ├── assets/
│   │   ├── icons/                 # 图标资源
│   │   ├── images/                # 图片资源
│   │   └── styles/
│   │       └── global.css         # 全局样式（Tailwind指令 + 自定义动画）
│   │
│   ├── components/
│   │   ├── Layout/
│   │   │   └── AppLayout.tsx      # ✅ 主侧边栏布局（核心UI）
│   │   ├── Audio/                 # 🚧 音频组件
│   │   ├── Common/               # 🚧 通用组件
│   │   ├── Editor/               # 🚧 编辑器组件
│   │   ├── Medical/              # 🚧 医疗业务组件
│   │   └── clinical/             # ✅ 临床业务组件
│   │       ├── HomepageCard.tsx   # ✅ 病案首页卡片组件
│   │       ├── EmrContextCard.tsx # ✅ EMR上下文卡片
│   │       └── ...               # 其他临床组件
│   │
│   ├── pages/
│   │   ├── Dashboard/             # 🚧 仪表盘
│   │   ├── DocEditor/             # ✅ 文书编辑器（AI生成 + 质控）
│   │   ├── RoundWorkbench/        # 🚧 查房工作台
│   │   ├── Meeting/               # 🚧 会议讨论
│   │   ├── Settings/              # 🚧 系统设置
│   │   ├── Login/                 # 🚧 登录页
│   │   └── Knowledge/             # 🚧 知识库
│   │
│   ├── stores/
│   │   ├── useAuthStore.ts        # ✅ 认证状态（Zustand）
│   │   └── usePatientStore.ts     # ✅ 患者/文书状态（Zustand）
│   │
│   ├── config/                    # 🚧 应用配置
│   ├── hooks/                     # 🚧 自定义Hooks
│   ├── services/                  # 🚧 API服务层
│   ├── types/                     # 🚧 TypeScript类型定义
│   └── utils/                     # 🚧 工具函数
│
├── src-tauri/                     # 🦀 后端源码（Rust / Tauri 2）
│   ├── Cargo.toml                 # Rust 依赖
│   ├── tauri.conf.json            # Tauri 应用配置
│   ├── build.rs                   # 构建脚本
│   ├── icons/                     # 应用图标资源（icon.png；Windows 构建需 icon.ico）
│   │
│   └── src/
│       ├── main.rs                # Rust 入口
│       ├── lib.rs                 # Tauri Builder + 插件注册 + 命令路由
│       │
│       ├── audio/
│       │   └── recorder.rs        # AudioState 录音状态管理
│       │
│       ├── commands/
│       │   ├── audio.rs           # ✅ 录音控制命令
│       │   ├── file_ops.rs        # ✅ 文件操作命令
│       │   ├── his_bridge.rs      # 🚧 HIS桥接命令
│       │   └── system_tray.rs     # ✅ 系统信息命令
│       │
│       ├── his/
│       │   ├── clipboard.rs       # 🚧 剪贴板操作
│       │   ├── hotkey.rs          # 🚧 全局热键
│       │   └── window_detect.rs   # 🚧 HIS窗口检测
│       │
│       └── utils/
│           ├── logger.rs          # ✅ 日志初始化
│           └── config.rs          # 🚧 配置管理
│
└── tests/                         # 🧪 测试目录
    ├── unit/                      # 单元测试（vitest）
    ├── integration/               # 集成测试
    └── e2e/                       # 端到端测试（Playwright）
```

> ✅ = 已实现　🚧 = 占位/开发中

---

## 🚀 快速开始

### 前置条件

| 依赖 | 版本要求 | 安装方式 |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Rust | stable | [rustup.rs](https://rustup.rs) |
| Tauri CLI | 2.0 | `npm install -g @tauri-apps/cli` |

> 💡 Windows 环境还需安装 [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 和 [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)。

### 安装与运行

```bash
# 1. 克隆项目
git clone <repository-url>
cd medai-plugin

# 2. 安装前端依赖
npm install

# 3. 启动开发模式（前端 + Tauri 后端同时启动）
npm run tauri dev
```

应用启动后将打开一个 **390×750** 的侧边栏窗口，模拟医生桌面助手面板。

### 仅前端开发

如果只需开发前端界面，无需启动 Tauri 后端：

```bash
npm run dev
# 访问 http://localhost:5173
```

---

## 📖 开发指南

### 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 前端开发服务器 |
| `npm run tauri dev` | 启动 Tauri 开发模式（前端 + Rust 热重载） |
| `npm run build` | 构建前端（TypeScript 检查 + Vite 打包） |
| `npm run tauri build` | 构建生产安装包（NSIS / MSI） |
| `npm run preview` | 预览构建产物 |
| `npm run lint` | ESLint 代码检查 |
| `npm run test` | 运行单元测试（vitest） |
| `npm run test:e2e` | 运行端到端测试（Playwright） |

### 路径别名

项目配置了 `@` 路径别名指向 `./src`，在 TypeScript 和 Vite 中均可使用：

```typescript
import { useAuthStore } from '@/stores/useAuthStore'
import AppLayout from '@/components/Layout/AppLayout'
```

### UI 开发规范

- 使用 **Ant Design** 组件库，已配置中文本地化（`zhCN`）
- 样式采用 **TailwindCSS** 原子类 + 自定义医疗色系：
  - `primary-*`：品牌蓝（主要操作）
  - `medical-success`：正常/通过
  - `medical-warning`：警告/时限临近
  - `medical-danger`：异常/超时
  - `medical-info`：信息提示

---

## 🔌 Tauri 命令（IPC）

前端通过 `@tauri-apps/api` 的 `invoke()` 调用 Rust 后端命令：

```typescript
import { invoke } from '@tauri-apps/api/core'

// 示例：开始录音
const sessionId = await invoke<string>('start_audio_recording', {
  roundTaskId: 'task-001'
})
```

### 命令清单

| 命令 | 模块 | 参数 | 返回值 | 状态 |
|------|------|------|--------|------|
| `start_audio_recording` | audio | `round_task_id: String` | `String`（会话UUID） | 🟡 部分（CPAL未接入） |
| `pause_audio_recording` | audio | - | `()` | 🔴 桩 |
| `resume_audio_recording` | audio | - | `()` | 🔴 桩 |
| `stop_audio_recording` | audio | - | `String` | 🔴 桩 |
| `get_audio_devices` | audio | - | `Vec<String>` | 🟢 可用 |
| `export_document` | file_ops | `content, format, path` | `String` | 🟢 可用 |
| `save_audio_local` | file_ops | `data: Vec<u8>, filename` | `String` | 🟢 可用 |
| `read_local_cache` | file_ops | `key` | `Option<String>` | 🔴 桩（返回None） |
| `detect_his_window` | his_bridge | - | `Option<HisWindowInfo>` | 🔴 桩（返回None） |
| `get_clipboard_text` | his_bridge | - | `String` | 🔴 桩（返回空） |
| `set_clipboard_text` | his_bridge | `text` | `()` | 🔴 桩（仅日志） |
| `get_system_info` | system_tray | - | `SystemInfo` | 🟢 可用 |
| `get_homepage_data` | his_bridge | `patient_id: String` | `Option<HomepageData>` | 🔴 桩（待实现） |

> 🟢 可用　🟡 部分实现　🔴 桩/待开发

### Rust 数据结构

```rust
// 系统信息
struct SystemInfo {
    os: String,        // 操作系统
    arch: String,      // 架构
    hostname: String,  // 主机名
}

// HIS窗口信息
struct HisWindowInfo {
    title: String,          // 窗口标题
    process_name: String,   // 进程名
    patient_id: String,     // 患者ID
    patient_name: String,   // 患者姓名
}
```

---

## 🗃 前端状态管理

使用 [Zustand](https://github.com/pmndrs/zustand) 管理全局状态：

### `useAuthStore` — 认证状态

```typescript
import { useAuthStore } from '@/stores/useAuthStore'

const { token, userInfo, permissions, setToken, setUserInfo, logout } = useAuthStore()
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `token` | `string \| null` | 认证令牌 |
| `userInfo` | `UserInfo \| null` | 用户信息（ID、姓名、科室、角色） |
| `permissions` | `string[]` | 权限列表 |

### `usePatientStore` — 患者/文书状态

```typescript
import { usePatientStore } from '@/stores/usePatientStore'

const {
  isLoggedIn, currentPatient, selectedDoc,
  isGenerating, generationProgress, recommendedDoc,
  setLoggedIn, selectPatient, selectDoc, setGenerating, setProgress, resetAll
} = usePatientStore()
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `isLoggedIn` | `boolean` | HIS连接状态 |
| `currentPatient` | `Patient \| null` | 当前患者（ID、姓名、性别、年龄、床号、诊断等） |
| `selectedDoc` | `DocTemplate \| null` | 选中文书模板（含病案首页DOC000） |
| `isGenerating` | `boolean` | AI是否正在生成 |
| `generationProgress` | `number` | 生成进度（0-100） |
| `recommendedDoc` | `DocTemplate \| null` | AI推荐的文书（含紧急度提示） |

---

## 🔐 环境变量

在项目根目录创建 `.env` 文件：

```env
VITE_API_BASE_URL=http://localhost:8080/api    # 后端API地址
VITE_ASR_WS_URL=ws://localhost:8081/asr         # ASR语音识别WebSocket地址
VITE_APP_TITLE=AI智能病历书写助手              # 应用标题
```

---

## 📦 构建与打包

### 生产构建

```bash
# 构建前端 + Rust 后端，生成安装包
npm run tauri build
```

### 输出产物

| 格式 | 说明 | 路径 |
|------|------|------|
| NSIS | Windows安装程序（推荐） | `src-tauri/target/release/bundle/nsis/` |
| MSI | Windows安装包 | `src-tauri/target/release/bundle/msi/` |

### Tauri 配置要点

- **窗口尺寸**：默认 390×750（最小 320×500），居中显示，带标题栏
- **CSP策略**：限制为 `self` + `localhost` HTTP/WS 连接
- **系统托盘**：已配置托盘图标
- **自动更新**：已配置 updater 插件（需部署更新服务端点）
- **安装语言**：支持 zh-CN / en-US 双语安装

---

## 📊 项目进度

### 模块完成度

| 模块 | 前端 | 后端 | 说明 |
|------|------|------|------|
| 病案首页（Homepage） | ✅ | 🔴 | 文书注册表、字段模板、范式配置、UI组件已实现，HIS接口待对接 |
| 侧边栏布局（AppLayout） | ✅ | - | HIS检测、患者卡片、AI推荐、模板搜索、录音按钮 |
| 文书编辑器（DocEditor） | ✅ | - | AI生成模拟、思维链、质控、复制/回写 |
| 查房工作台 | 🚧 | 🟡 | 录音命令已定义，CPAL接入待完成 |
| 会议讨论 | 🚧 | - | 页面占位 |
| 质控检查 | 🚧 | - | 编辑器内有基础展示 |
| 回写HIS | 🚧 | 🔴 | 命令桩已定义，实现待开发 |
| HIS窗口联动 | - | 🔴 | 窗口检测/剪贴板/热键均为桩 |
| 音频录制 | - | 🟡 | 设备枚举可用，录音流未接入 |
| 文件操作 | - | 🟢 | 导出文档/保存音频可用 |
| 认证/登录 | 🚧 | - | Store已定义，页面占位 |
| 测试 | - | - | 框架已配置，无测试文件 |

### 里程碑

- [x] **M0** — 项目脚手架搭建（Tauri + React + TS + TailwindCSS）
- [x] **M1** — 核心UI原型（侧边栏布局 + 文书编辑器 + AI生成模拟）
- [x] **M1.5** — 病案首页功能（文书注册表、字段模板、范式配置、UI组件）
- [ ] **M2** — 音频录制与ASR转写
- [ ] **M3** — HIS系统联动（窗口检测 + 患者对齐 + 回写）
- [ ] **M4** — 质控引擎与智能推荐
- [ ] **M5** — 生产化（测试、安全加固、自动更新、性能优化）

---

## 🤝 贡献指南

### 分支策略

- `main` — 稳定发布分支
- `dev` — 开发集成分支
- `feature/*` — 功能开发分支

### 代码规范

- **TypeScript**：严格模式，`noUnusedLocals` + `noUnusedParameters`
- **ESLint**：执行 `npm run lint` 检查代码质量
- **Rust**：遵循 `rustfmt` + `clippy` 规范
- **提交信息**：遵循 [Conventional Commits](https://www.conventionalcommits.org/) 格式

### 开发流程

1. 从 `dev` 创建 `feature/xxx` 分支
2. 完成开发并自测
3. 执行 `npm run lint` 确保代码质量
4. 提交 Pull Request 至 `dev` 分支
5. Code Review 通过后合并

---

## 📄 许可证

本项目为私有项目，未经授权不得使用、复制或分发。
