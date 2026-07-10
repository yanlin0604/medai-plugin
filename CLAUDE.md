[根目录](../CLAUDE.md) > **medai-plugin**

# medai-plugin — AI 智能病历书写助手桌面插件

> 文档生成时间：2026-07-09 15:40:12

## 变更记录 (Changelog)

| 时间 | 变更内容 |
|------|---------|
| 2026-07-09 15:40:12 | 初始生成模块级 CLAUDE.md |

---

## 模块职责

医生桌面侧边栏 AI 助手（Tauri 2 桌面应用），本仓库的**核心产品**。职责：

- **范式驱动文书生成**：14 类住院文书按 3 大交互范式 + 1 类特殊（summary/record/recording/special）配置化路由到范式容器
- **床旁语音**：录音会话、实时 ASR 转写（WebSocket）、入院语音建档（admissionVoice）、手术/查房长录音
- **EMR 联动**：检测演示 EMR 的窗口上下文（气泡模式 idle→detected→expanded）、字段助手（fieldAssist）拦截焦点字段做 AI 补全
- **安全回写**：回写 demo 系统 inbox（HTTP）与字段级回写，含防串户/审计

## 入口与启动

| 项 | 位置 |
|----|------|
| 前端入口 | `src/main.tsx` → `src/App.tsx`（BrowserRouter + 气泡/展开双模式外壳） |
| Rust 入口 | `src-tauri/src/main.rs` → `src-tauri/src/lib.rs`（Tauri Builder、命令注册、EMR 上下文桥接常驻任务） |
| 路由 | `/`（AppLayout）、`/round` 查房工作台、`/doc/:code` 统一文书工作区、`/meeting` 会议讨论、`/settings` 设置 |
| 启动 | `npm run tauri dev`（完整）/ `npm run dev`（仅前端，端口 5173） |

## 对外接口

### 消费的后端接口
- **MedAi-Service 插件运行时**：`{VITE_API_BASE_URL}/medical/pluginRuntime/**`（客户端：`src/services/pluginRuntime.ts`，类型契约：`src/services/pluginRuntimeTypes.ts`）
- **ASR WebSocket**：`VITE_ASR_WS_URL`（`ws://…/ws/asr`，`src/services/asr/browserAsrSession.ts`）
- **字段提取 WebSocket**：`VITE_FIELD_EXTRACTION_WS_URL`（`src/services/fieldExtractionService.ts`）
- **鉴权**：请求头携带 `VITE_PLUGIN_API_KEY`

### Tauri IPC 命令（前端 invoke → Rust）
录音（start/pause/resume/stop/get_audio_devices）、文件（export_document/save_audio_local/read_local_cache）、HIS 桥接（detect_his_window、get/clear_latest_emr_context、bs_edit_assist、field_assist、demo_clinical_data）、回写（writeback_to_bs_inbox、push_field_writeback_http）、系统（get_system_info、toggle_devtools）。完整清单见 `src-tauri/src/lib.rs` 的 `invoke_handler`。

## 关键依赖与配置

- 前端：React 18、Ant Design 6（zhCN）、TailwindCSS 3、Zustand 4、TipTap 2、axios、react-router-dom 6
- Rust：tauri 2、tokio、cpal（音频）、serde
- 配置：`.env`（API/ASR/字段提取地址、`VITE_ROUND_MOCK_ASR=1` 查房模拟 ASR、`VITE_SKIP_WRITEBACK_VALIDATION=1`）
- `vite.config.ts`：别名 `@ → ./src`，忽略 `src-tauri` 监听

## 数据模型（核心概念）

- **文书注册表** `src/config/docRegistry.ts`：`DOC_REGISTRY`（DOC001-DOC099 及 HIS 异形码 D0C001/D0C011/D0C013）、`ParadigmId`、`DocGroupId`（timed/onDemand/event）、`PARADIGMS` 范式元数据。**新增文书只需在此追加配置。**
- **范式容器** `src/paradigms/`：`ParadigmShell.tsx` 总入口 → `SummaryParadigm`（DischargeFlow 出院专属工作台）/ `RecordParadigm`（FormDocumentFlow、RecordDocumentFlow）/ `RecordingParadigm`（AdmissionFlow、SurgeryFlow）/ `SpecialParadigm`（DeathRecordFlow，AI 仅排版、强制审核、禁用语音）
- **状态** `src/stores/`：useAuthStore、usePatientStore、useBubbleStore（气泡模式）、useFieldAssistStore
- **服务层** `src/services/`：pluginRuntime（后端运行时）、documentFlow、draftService/versionService（草稿与版本）、evidenceCompletion（证据补全）、dischargeRuntime、admissionRuntime、emrContext/（上下文检测激活）、fieldAssist/（意图解析/生成/回写）、admissionVoice/（候选归并/患者模式）、writebackConfig、bubbleDischargeWriteback

## 测试与质量

- vitest 单测约 20 个，与源码同目录（`*.test.ts(x)`），覆盖 documentFlow、evidenceCompletion、dischargeRuntime、pluginRuntime、candidateReducer、intentResolver、roundDraft、meetingDraft 等核心逻辑
- `npm run test`；`npm run lint`（ESLint，零告警）；`npm run test:e2e`（Playwright，`tests/e2e` 目前为空占位）

## 常见问题 (FAQ)

- **文书编码为何有 `D0C001` 这类怪码？** HIS 侧异形码（字母 O 写作数字 0），展示别名映射见 `pluginRuntime.ts` 的 `DOC_DISPLAY_ALIAS_CODES`。
- **README 与代码不一致？** `README.md` 部分章节（如 DocEditor 页面、命令清单）滞后于实际代码，以 `src/App.tsx` 路由与 `src-tauri/src/lib.rs` 命令注册为准。
- **无后端如何演示？** `src/services/samples/` 提供本地模板/样例数据兜底；`LOCAL_DEFINITION_FIRST_DOC_CODES` 控制本地定义优先的文书。

## 相关文件清单

- 入口：`src/main.tsx`、`src/App.tsx`、`src-tauri/src/lib.rs`
- 架构核心：`src/config/docRegistry.ts`、`src/paradigms/ParadigmShell.tsx`、`src/pages/DocWorkspace/UnifiedDocWorkspace.tsx`
- 后端契约：`src/services/pluginRuntime.ts`、`src/services/pluginRuntimeTypes.ts`
- Rust 桥接：`src-tauri/src/his/window_detect.rs`、`src-tauri/src/commands/writeback.rs`
- 配置：`.env`、`vite.config.ts`、`tailwind.config.ts`、`tsconfig.json`
