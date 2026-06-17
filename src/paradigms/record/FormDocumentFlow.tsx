import { useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import ParadigmShell from '../ParadigmShell';
import DocumentChatWorkspace from '../../components/clinical/DocumentChatWorkspace';
import VersionHistoryDrawer from '../../components/clinical/VersionHistoryDrawer';
import { useDocumentSubmit } from '../../hooks/useDocumentSubmit';
import { usePatientStore } from '../../stores/usePatientStore';
import { pluginRuntimeApi, toIcdItem } from '../../services/pluginRuntime';
import { renderDocument } from '../../services/clinicalService';
import { saveDraft, loadDraft } from '../../services/draftService';
import type { DocDefinition } from '../../config/docRegistry';
import type { ClinicalSection, FieldValue, PatientBrief, DocTemplate, DocFieldDef } from '../../services/types';
import type { RuntimeDocTemplateDto } from '../../services/pluginRuntimeTypes';

interface FormDocumentFlowProps {
  docCode: string;
  docName: string;
}

/** 将后端 RuntimeDocTemplateDto 转换为前端 DocTemplate */
function toDocTemplate(runtimeTemplate: RuntimeDocTemplateDto): DocTemplate {
  return {
    docCode: runtimeTemplate.docCode,
    version: runtimeTemplate.templateVersion,
    title: runtimeTemplate.title || runtimeTemplate.docName,
    fields: runtimeTemplate.fields.map((field): DocFieldDef => ({
      key: field.fieldKey,
      label: field.fieldLabel,
      section: field.sectionName,
      source: field.sourceType as any,
      required: field.required ?? false,
      inputType: field.inputType as any,
      options: field.options?.map(opt => ({
        value: opt.optionValue,
        label: opt.optionLabel,
        render: opt.renderText || opt.optionLabel,
      })),
      default: field.defaultValue,
      placeholder: field.placeholder,
      staticText: field.staticText,
      dictatable: field.dictatable ?? false,
    })),
  };
}

export default function FormDocumentFlow({ docCode, docName }: FormDocumentFlowProps) {
  const { currentPatient } = usePatientStore();
  const patientId = currentPatient?.id || '';
  const patient: PatientBrief = useMemo(
    () =>
      currentPatient
        ? {
            name: currentPatient.name,
            gender: currentPatient.gender,
            age: currentPatient.age,
            bed: currentPatient.bedNo,
            admissionNo: currentPatient.id,
            diagnosis: currentPatient.diagnosis,
          }
        : { name: '', gender: '', age: '', bed: '', admissionNo: '', diagnosis: '' },
    [currentPatient],
  );

  const [template, setTemplate] = useState<DocTemplate | null>(null);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [sectionEdits, setSectionEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const {
    locked,
    setLocked,
    historyOpen,
    closeHistory,
  } = useDocumentSubmit({
    docCode,
    docName,
    patientId,
    editor: currentPatient?.doctor || '医师',
  });

  // 加载模板和字段值
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!patientId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [runtimeTemplate, runtimeValues] = await Promise.all([
          pluginRuntimeApi.getRuntimeTemplate(docCode),
          pluginRuntimeApi.resolveRuntimeValues(docCode, patientId, false),
        ]);

        if (!alive) return;

        // 转换为前端格式
        const tpl = toDocTemplate(runtimeTemplate);
        const backendValues = runtimeValues.values || {};
        const icdItems = (runtimeValues.icdCandidates || []).map(toIcdItem);

        // 合并后端值和默认值
        const initialValues: Record<string, FieldValue> = {};
        tpl.fields.forEach((field) => {
          const backendVal = backendValues[field.key];
          if (backendVal !== undefined && backendVal !== null) {
            // 后端值类型可能是 RuntimeFieldValueDto，需要转换
            initialValues[field.key] = backendVal as unknown as FieldValue;
          } else if (field.inputType === 'icd') {
            initialValues[field.key] = icdItems;
          } else if (field.inputType === 'static') {
            initialValues[field.key] = field.staticText || '';
          } else if (field.default) {
            initialValues[field.key] = field.default;
          } else {
            initialValues[field.key] = '';
          }
        });

        // 检查草稿
        const saved = loadDraft(docCode, patientId);
        setTemplate(tpl);
        if (saved) {
          setValues(saved.values);
          setSectionEdits({});
          setLocked(saved.status === 'submitted');
        } else {
          setValues(initialValues);
          setSectionEdits({});
          setLocked(false);
        }
      } catch (error) {
        if (!alive) return;
        console.error(`加载${docName}失败:`, error);
        message.error(error instanceof Error ? error.message : `加载${docName}失败`);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [docCode, docName, patientId]);

  // 使用 renderDocument 渲染段落
  const rendered = useMemo(() => {
    if (!template) return null;
    return renderDocument(template, values);
  }, [template, values]);

  const finalSections = useMemo(
    () =>
      (rendered?.sections ?? []).map((section) => ({
        section: section.section,
        text: sectionEdits[section.section] ?? section.text,
        edited: sectionEdits[section.section] != null,
      })),
    [rendered, sectionEdits],
  );

  const sections = useMemo<ClinicalSection[]>(
    () =>
      finalSections.map((section) => ({
        key: section.section,
        title: section.section,
        text: section.text,
        fieldKey: section.section,
        editable: true,
      })),
    [finalSections],
  );

  const handleSectionChange = (sectionKey: string, text: string) => {
    const next = { ...sectionEdits, [sectionKey]: text };
    setSectionEdits(next);
    saveDraft({
      docCode,
      patientId,
      values,
      content: '',
      step: 0,
      status: locked ? 'submitted' : 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleReset = (sectionKey: string) => {
    const next = { ...sectionEdits };
    delete next[sectionKey];
    setSectionEdits(next);
    saveDraft({
      docCode,
      patientId,
      values,
      content: '',
      step: 0,
      status: locked ? 'submitted' : 'draft',
      updatedAt: new Date().toISOString(),
    });
  };

  if (!currentPatient) {
    return (
      <ParadigmShell
        doc={{ code: docCode, name: docName } as DocDefinition}
      >
        <div style={{ padding: '48px', textAlign: 'center', color: '#999' }}>
          请先在左侧选择患者后再打开{docName}
        </div>
      </ParadigmShell>
    );
  }

  if (loading || !template) {
    return (
      <ParadigmShell
        doc={{ code: docCode, name: docName } as DocDefinition}
      >
        <div style={{ padding: '48px', textAlign: 'center' }}>
          正在加载{docName}模板和数据...
        </div>
      </ParadigmShell>
    );
  }

  const metaRows = [
    [
      { label: '姓名', value: patient.name },
      { label: '性别', value: patient.gender },
      { label: '年龄', value: patient.age },
    ],
    [
      { label: '床位', value: patient.bed },
      { label: '住院号', value: patient.admissionNo },
      { label: '入院日期', value: currentPatient.admissionDate || '' },
    ],
  ];

  return (
    <>
      <ParadigmShell
        doc={{ code: docCode, name: docName } as DocDefinition}
      >
        <DocumentChatWorkspace
          docName={template.title}
          patient={patient}
          sections={sections}
          metaRows={metaRows}
          locked={locked}
          sectionEdits={sectionEdits}
          onChange={handleSectionChange}
          onReset={handleReset}
          optimize={(text) => text}
        />
      </ParadigmShell>

      <VersionHistoryDrawer
        open={historyOpen}
        docCode={docCode}
        patientId={patientId}
        onClose={closeHistory}
      />
    </>
  );
}
