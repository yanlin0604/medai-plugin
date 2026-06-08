import { describe, expect, it } from 'vitest';
import type { ClinicalSection } from './types';
import { buildSectionContent, buildSubmitLabel, buildSubmitSnapshot, resolvePatientBrief } from './documentFlow';

const sections: ClinicalSection[] = [
  {
    key: 'chief',
    title: '主诉',
    fieldKey: 'chiefComplaint',
    text: '胸痛 2 小时。',
    editable: true,
    source: 'manual',
    required: true,
  },
  {
    key: 'history',
    title: '现病史',
    fieldKey: 'presentIllness',
    text: '活动后加重。',
    editable: true,
    source: 'emr',
  },
  {
    key: 'empty',
    title: '空段落',
    fieldKey: 'emptyField',
    text: '',
    editable: true,
    source: 'manual',
  },
];

describe('documentFlow', () => {
  it('builds ordered submit snapshot from clinical sections and edits', () => {
    const snapshot = buildSubmitSnapshot({
      sections,
      sectionEdits: { history: '活动后胸痛加重，休息后缓解。' },
      changeSummary: '医生确认提交',
    });

    expect(snapshot.fields).toEqual({
      chiefComplaint: '胸痛 2 小时。',
      presentIllness: '活动后胸痛加重，休息后缓解。',
    });
    expect(snapshot.fieldLabels).toEqual({
      chiefComplaint: '主诉',
      presentIllness: '现病史',
    });
    expect(snapshot.fieldOrder).toEqual(['chiefComplaint', 'presentIllness']);
    expect(snapshot.content).toBe('【主诉】胸痛 2 小时。\n【现病史】活动后胸痛加重，休息后缓解。');
    expect(snapshot.changeSummary).toBe('医生确认提交');
  });

  it('can keep empty sections when requested', () => {
    expect(buildSectionContent(sections, undefined, true)).toContain('【空段落】');
  });

  it('normalizes patient store data and keeps short submit labels', () => {
    const brief = resolvePatientBrief({
      id: 'ZY001',
      name: '陈建国',
      gender: '男',
      age: '65岁',
      bedNo: '1201',
      deptName: '心血管内科',
      admissionDate: '2026-06-01',
      admissionDays: 4,
      doctor: '林志远',
      diagnosis: '冠心病',
    });

    expect(brief).toMatchObject({ admissionNo: 'ZY001', bed: '1201', name: '陈建国' });
    expect(buildSubmitLabel('入院记录')).toBe('提交入院记录');
  });
});
