# 住院病历生成阶段总结 PPT 叙事计划

## 受众
项目阶段评审、产品/交付负责人、医院业务方与研发管理层。

## 目标
说明当前项目在“住院病历生成”方向已经具备的能力、覆盖的功能、工程成熟度和下一阶段需要补齐的内容。

## 叙事主线
从系统定位切入，先讲“不是单点生成，而是围绕住院文书的桌面插件工作流”，再展开文书覆盖、生成链路、核心场景、质量安全、集成能力，最后明确当前边界和下一阶段路线。

## 页表
1. 封面
2. 项目定位与价值
3. 核心功能模块
4. 核心亮点与技术创新
5. 阶段性成果
6. 下一步规划

## 来源计划
主要依据本地源码与配置：`src/config/docRegistry.ts`、`src/services/pluginRuntime.ts`、`src/services/admissionRuntime.ts`、`src/services/dischargeRuntime.ts`、`src/pages/DocWorkspace/UnifiedDocWorkspace.tsx`、`src/paradigms/summary/DischargeFlow.tsx`、`src/paradigms/recording/AdmissionFlow.tsx`、`src/pages/RoundWorkbench/index.tsx`、`src/paradigms/recording/useSurgerySession.ts`、`src/paradigms/special/DeathRecordFlow.tsx`、`src/services/fieldAssist/*`、`src/services/emsBridge.ts`、`src-tauri/src/commands/writeback.rs`、`src-tauri/src/commands/audio.rs`。

## 视觉系统
医疗产品阶段汇报风格：白底、深蓝标题、绿色表示已落地能力、紫色表示语音/AI能力、玫红表示边界与风险。使用项目图标与结构化卡片、流程图、成熟度矩阵。

## 编辑性计划
所有关键标题、指标、矩阵、流程节点均使用可编辑 PowerPoint 文本和形状，不作为图片烘焙。
