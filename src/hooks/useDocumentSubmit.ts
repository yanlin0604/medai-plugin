import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import { saveDraft } from '../services/draftService';
import { submitDocument, watchPatientConsistency } from '../services/emsBridge';
import { appendVersion, getDocVersions } from '../services/versionService';
import type { DocumentPayload, FieldValue } from '../services/types';

interface UseDocumentSubmitOptions {
  docCode: string;
  docName: string;
  patientId: string;
  editor: string;
}

interface SubmitInput {
  fields: Record<string, string>;
  fieldLabels?: Record<string, string>;
  fieldOrder?: string[];
  content: string;
  changeSummary: string;
  draftValues?: Record<string, FieldValue>;
  draftStep?: number;
}

/**
 * 统一文书提交闭环：防串户、提交进度、草稿锁定、版本快照和历史抽屉状态。
 */
export function useDocumentSubmit({ docCode, docName, patientId, editor }: UseDocumentSubmitOptions) {
  const [locked, setLocked] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versionCount, setVersionCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitText, setSubmitText] = useState('');
  const [submitProgress, setSubmitProgress] = useState(0);

  useEffect(() => {
    const stop = watchPatientConsistency(patientId, (c) => setMismatch(!c.consistent));
    return stop;
  }, [patientId]);

  useEffect(() => {
    setVersionCount(getDocVersions(docCode, patientId).length);
  }, [docCode, patientId, locked]);

  const submit = useCallback(
    async ({
      fields,
      fieldLabels,
      fieldOrder,
      content,
      changeSummary,
      draftValues,
      draftStep = 1,
    }: SubmitInput) => {
      if (locked || submitting) return false;
      if (mismatch) {
        message.error('防串户锁定中，禁止提交。请先在病历系统中切回当前患者。');
        return false;
      }

      setSubmitting(true);
      setSubmitProgress(35);
      setSubmitText('提交中');

      try {
        const payload: DocumentPayload = {
          docCode,
          docName,
          patientId,
          fields,
          fieldLabels,
          fieldOrder,
          content,
        };
        const res = await submitDocument(payload);
        if (!res.ok) {
          setSubmitProgress(100);
          setSubmitText('提交失败');
          message.error(res.message);
          return false;
        }

        setSubmitProgress(90);
        setSubmitText('生成版本');
        const now = new Date().toISOString();
        if (draftValues) {
          saveDraft({
            docCode,
            patientId,
            values: draftValues,
            content,
            step: draftStep,
            status: 'submitted',
            updatedAt: now,
          });
        }
        const version = appendVersion({
          docCode,
          patientId,
          content,
          fields,
          fieldLabels,
          editor,
          timestamp: now,
          changeSummary,
        });
        setVersionCount((count) => Math.max(count + 1, version.versionNo));
        setLocked(true);
        setSubmitProgress(100);
        setSubmitText('已提交');
        message.success(res.message);
        return true;
      } finally {
        setSubmitting(false);
        setSubmitProgress(0);
        setSubmitText('');
      }
    },
    [docCode, docName, editor, locked, mismatch, patientId, submitting],
  );

  return {
    locked,
    setLocked,
    mismatch,
    historyOpen,
    openHistory: () => setHistoryOpen(true),
    closeHistory: () => setHistoryOpen(false),
    versionCount,
    submitting,
    submitText,
    submitProgress,
    submit,
  };
}
