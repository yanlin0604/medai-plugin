import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ThunderboltOutlined } from '@ant-design/icons';
import { usePatientStore } from '../../stores/usePatientStore';
import type { DocDefinition } from '../../config/docRegistry';
import { findDocInRegistry } from '../../config/docRegistry';
import { pluginRuntimeApi } from '../../services/pluginRuntime';
import UnifiedDocWorkspace from './UnifiedDocWorkspace';

export default function DocWorkspace() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { selectedDoc, currentPatient, selectDoc } = usePatientStore();
  const [runtimeDoc, setRuntimeDoc] = useState<DocDefinition | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState('');

  const loadDocByCode = useCallback(async (docCode: string) => {
    setLoadingDoc(true);
    setDocError('');
    try {
      const docs = await pluginRuntimeApi.listRuntimeDocuments();
      const found = findDocInRegistry(docs, docCode) ?? null;
      setRuntimeDoc(found);
      if (!found) {
        setDocError('后台未返回该文书的启用配置');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '运行时文书目录加载失败';
      setRuntimeDoc(null);
      setDocError(message);
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  // 优先用 store 选中文书；支持通过 URL code 直达（刷新/外链场景）
  const storeDoc = selectedDoc && selectedDoc.code === code ? selectedDoc : null;
  const doc = storeDoc ?? runtimeDoc;

  useEffect(() => {
    if (!code || storeDoc) return;
    void loadDocByCode(code);
  }, [code, loadDocByCode, storeDoc]);

  // URL 直达时回填 store
  useEffect(() => {
    if (doc && selectedDoc?.code !== doc.code) selectDoc(doc);
  }, [doc, selectedDoc, selectDoc]);

  if (!doc && code && (loadingDoc || docError)) {
    return (
      <div className="h-full flex flex-col justify-center items-center p-6 text-center bg-[#F8FAFC]">
        <ThunderboltOutlined className="text-[#1E3A8A] text-2xl animate-bounce" />
        <h3 className="text-sm font-bold text-slate-800 mt-3">
          {loadingDoc ? '正在加载文书配置' : '文书配置不可用'}
        </h3>
        <p className="text-xs text-slate-400 mt-1">{loadingDoc ? '正在从后台读取运行时文书目录。' : docError}</p>
        {!loadingDoc && (
          <button
            onClick={() => void loadDocByCode(code)}
            className="mt-4 text-xs font-bold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg bg-white"
          >
            重新加载
          </button>
        )}
      </div>
    );
  }

  if (!doc || !currentPatient) {
    return (
      <div className="h-full flex flex-col justify-center items-center p-6 text-center bg-[#F8FAFC]">
        <ThunderboltOutlined className="text-[#1E3A8A] text-2xl animate-bounce" />
        <h3 className="text-sm font-bold text-slate-800 mt-3">请先关联患者并选择文书</h3>
        <p className="text-xs text-slate-400 mt-1">返回选择中心，关联患者后选择目标文书以进入全文字段工作台。</p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 text-xs font-bold text-blue-600 border border-blue-200 px-4 py-2 rounded-lg bg-white"
        >
          返回文书选择中心
        </button>
      </div>
    );
  }

  return <UnifiedDocWorkspace doc={doc} patient={currentPatient} />;
}
