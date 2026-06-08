# 病案首页功能说明

## 📋 概述

病案首页是住院病历的重要组成部分，根据《病历书写基本规范》要求，包含患者基本信息、住院信息、诊断信息、手术信息、费用信息和医师签名等核心内容。

## 🏗️ 架构设计

### 文书编码

- **编码**: `DOC000`
- **ID**: `doc-000`
- **范式**: `summary`（系统自动汇总）
- **分组**: `timed`（时限必填文书）
- **时限**: 出院24小时内

### 文件结构

```
src/
├── config/
│   └── docRegistry.ts              # 文书注册表（DOC000定义）
├── services/
│   ├── samples/
│   │   ├── templates.ts            # 字段模板（homepageTemplate）
│   │   └── homepage.ts             # 样例数据
│   └── types.ts                    # 类型契约
├── components/
│   └── clinical/
│       └── HomepageCard.tsx        # 病案首页卡片组件
└── paradigms/
    └── summary/
        └── summaryData.ts          # 范式配置（homepageConfig）
```

## 📝 字段定义

### 患者基本信息
- `patientInfo`: 患者基本信息（姓名、性别、年龄、身份证号、职业、民族、婚姻状况）
- `contactInfo`: 联系人信息（联系人、关系、电话、地址）

### 住院信息
- `admissionInfo`: 住院信息（住院号、入院日期、出院日期、住院天数）
- `admissionDept`: 入院科室（选项型）
- `dischargeDept`: 出院科室（选项型）

### 诊断信息
- `primaryDiagnosis`: 主要诊断（ICD-10编码）
- `otherDiagnoses`: 其他诊断（ICD-10编码数组）
- `hospitalInfection`: 医院感染（文本型）

### 手术/操作信息
- `operations`: 手术/操作信息（手术日期、名称、术者、麻醉方式）

### 费用信息
- `totalCost`: 总费用及分项费用

### 医师签名
- `chiefPhysician`: 主任医师
- `attendingPhysician`: 主治医师
- `residentPhysician`: 住院医师
- `coder`: 编码员
- `qualityControl`: 质控医师

## 🎯 交互范式

病案首页采用**系统自动汇总**范式（SummaryParadigm）：

1. **数据拉取**: 从HIS/EMR系统静默拉取患者全量信息
2. **智能汇总**: AI自动汇总患者信息、诊断、手术、费用等
3. **草稿生成**: 生成结构化的病案首页草稿
4. **医生审核**: 医生审核并微调内容
5. **一键回写**: 确认无误后一键回写至EMR系统

## 🖥️ UI组件

### HomepageCard组件

位于 `src/components/clinical/HomepageCard.tsx`，提供以下功能：

- **分区展示**: 患者信息、住院信息、诊断信息、手术信息、费用信息、医师签名
- **结构化布局**: 清晰的网格布局，信息一目了然
- **视觉层次**: 使用不同颜色标识不同信息区域
- **响应式设计**: 适配不同屏幕尺寸

```tsx
import HomepageCard from '@/components/clinical/HomepageCard';

<HomepageCard
  patient={patientInfo}
  contact={contactInfo}
  admission={admissionInfo}
  diagnosis={diagnosisInfo}
  operation={operationInfo}
  cost={costInfo}
  physicians={physicianSignatures}
/>
```

## 📊 数据样例

### 患者信息样例
```typescript
{
  name: '张三',
  gender: '男',
  age: '65岁',
  idCard: '110101195801011234',
  occupation: '退休',
  ethnicity: '汉族',
  maritalStatus: '已婚'
}
```

### 诊断信息样例
```typescript
{
  primaryDiagnosis: '冠状动脉粥样硬化性心脏病',
  primaryDiagnosisCode: 'I25.1',
  otherDiagnoses: [
    { name: '高血压病3级', code: 'I10' },
    { name: '2型糖尿病', code: 'E11.9' }
  ]
}
```

### 费用信息样例
```typescript
{
  total: '¥45,680.00',
  medication: '¥12,350.00',
  examination: '¥8,920.00',
  treatment: '¥15,680.00',
  material: '¥5,230.00',
  other: '¥3,500.00'
}
```

## 🔧 配置说明

### 文书注册表配置

在 `src/config/docRegistry.ts` 中：

```typescript
{
  code: 'DOC000',
  id: 'doc-000',
  name: '病案首页',
  py: 'basy',
  paradigm: 'summary',
  group: 'timed',
  icon: 'HomeOutlined',
  prototype: 'doc_000_homepage.html',
  dataSources: ['HIS', 'EMR', '医嘱'],
  inputMode: '选项+自动填充',
  timeLimit: '出院24小时内',
}
```

### 字段模板配置

在 `src/services/samples/templates.ts` 中定义 `homepageTemplate`，包含15个字段定义。

### 范式配置

在 `src/paradigms/summary/summaryData.ts` 中定义 `homepageConfig`，配置：

- 表单字段
- 历史拉取标题
- 草稿标签
- 回写标签
- 患者样例数据

## 🚀 使用流程

1. **选择患者**: 在文书选择中心关联患者
2. **选择病案首页**: 在"时限必填文书"分组中选择"病案首页"
3. **自动汇总**: 系统自动从HIS/EMR拉取患者信息
4. **审核草稿**: AI生成的草稿供医生审核
5. **微调修改**: 医生可对草稿进行微调
6. **一键回写**: 确认无误后按F8或点击回写按钮

## 🔌 HIS接口对接

### 待实现接口

```typescript
// 获取病案首页数据
getHomepageData(patientId: string): Promise<HomepageData | null>;

// 回写病案首页
writebackHomepage(data: HomepageData): Promise<SubmitResult>;
```

### 数据映射

| 字段 | HIS字段 | 说明 |
|------|---------|------|
| patientInfo | patient_basic_info | 患者基本信息 |
| admissionInfo | admission_record | 住院记录 |
| primaryDiagnosis | main_diagnosis | 主要诊断 |
| operations | operation_record | 手术记录 |
| totalCost | fee_summary | 费用汇总 |

## 📋 待办事项

- [ ] 对接HIS系统获取真实病案首页数据
- [ ] 实现ICD-10自动编码推荐
- [ ] 实现费用自动汇总
- [ ] 实现医师签名电子化
- [ ] 添加病案首页质控规则
- [ ] 实现病案首页导出功能
- [ ] 添加病案首页打印功能

## 📚 参考资料

- 《病历书写基本规范》（2010年版）
- 《住院病案首页数据填写质量规范（暂行）》
- ICD-10国际疾病分类标准
- 国家卫生健康委员会病案首页填写规范
