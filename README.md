# medai-plugin

住院部AI助手插件系统 - 桌面端应用

基于 Tauri + React + TypeScript 构建的医疗AI辅助文书生成桌面端插件。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + TailwindCSS + Zustand + TipTap
- **后端**: Tauri 2 + Rust（录音/文件操作/HIS窗口联动/系统托盘）
- **AI集成**: ASR实时转写 + LLM文书生成 + 智能补全 + ICD推荐

## 功能模块

- 查房工作台：一站式录音、患者对齐、实时转写
- 文书编辑器：富文本编辑、AI辅助生成、版本对比
- 会议讨论：疑难病例/死亡讨论录音与患者路由
- 质控检查：病历内涵质控（完整性/一致性/规范性/逻辑性）
- 回写HIS：安全回写（防串户锁/并发冲突检测/二次确认）
