import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CheckCircleOutlined,
  Loading3QuartersOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Modal } from 'antd';
import { pluginRuntimeApi } from '../../services/pluginRuntime';
import type { Patient } from '../../stores/usePatientStore';

interface PatientSwitchModalProps {
  open: boolean;
  currentPatientId?: string;
  onClose: () => void;
  onSelect: (patient: Patient) => void;
}

export default function PatientSwitchModal({
  open,
  currentPatientId,
  onClose,
  onSelect,
}: PatientSwitchModalProps) {
  const [keyword, setKeyword] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const loadPatients = useCallback(async () => {
    setLoading(true);
    setErrorText('');
    try {
      const result = await pluginRuntimeApi.listPatients();
      setPatients(result.patients);
    } catch (error) {
      setPatients([]);
      setErrorText(error instanceof Error ? error.message : '患者列表加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPatients();
  }, [loadPatients, open]);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const filteredPatients = useMemo(() => {
    const keywordText = keyword.trim().toLowerCase();
    if (!keywordText) return patients;

    return patients.filter((patient) => {
      const searchableText = [
        patient.name,
        patient.id,
        patient.bedNo,
        patient.gender,
        patient.age,
        patient.deptName,
        patient.doctor,
        patient.diagnosis,
        patient.admissionDate,
      ].join(' ').toLowerCase();

      return searchableText.includes(keywordText);
    });
  }, [keyword, patients]);

  const renderPatientMeta = (patient: Patient) => {
    const parts = [
      patient.bedNo ? `${patient.bedNo}床` : '',
      patient.gender,
      patient.age,
      patient.deptName,
    ].filter(Boolean);
    return parts.join(' / ');
  };

  return (
    <Modal
      centered
      destroyOnHidden
      footer={null}
      open={open}
      title={null}
      width={420}
      onCancel={onClose}
    >
      <div className="pt-1">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">切换患者</h2>
            {/* <p className="mt-1 text-[11px] font-medium text-slate-500">
              从后台患者列表选择当前工作患者
            </p> */}
          </div>
        </div>

        <form className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 focus-within:border-[#1E3A8A] focus-within:bg-white" onSubmit={handleSearch}>
          <SearchOutlined className="shrink-0 text-slate-400" />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400"
            placeholder="搜索姓名、住院号、床号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <button
            type="submit"
            className="rounded-md bg-[#1E3A8A] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#172554] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            搜索
          </button>
        </form>

        <div className="custom-scrollbar max-h-[420px] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs font-medium text-slate-400">
              <Loading3QuartersOutlined className="animate-spin text-lg text-[#1E3A8A]" />
              正在加载患者
            </div>
          ) : errorText ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-rose-100 bg-rose-50/50 px-4 text-center">
              <p className="text-xs font-bold text-rose-600">{errorText}</p>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-100 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
                onClick={() => void loadPatients()}
              >
                <ReloadOutlined />
                重新加载
              </button>
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 text-center">
              <SearchOutlined className="text-lg text-slate-300" />
              <p className="mt-2 text-xs font-bold text-slate-500">暂无匹配患者</p>
              <p className="mt-1 text-[10px] text-slate-400">请换一个关键词后重试</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPatients.map((patient) => {
                const active = patient.id === currentPatientId;
                return (
                  <button
                    key={patient.id}
                    type="button"
                    className={[
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'border-[#1E3A8A] bg-[#F0F5FF]'
                        : 'border-slate-200 bg-white hover:border-[#1E3A8A] hover:bg-slate-50',
                    ].join(' ')}
                    onClick={() => onSelect(patient)}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#1E3A8A]">
                      {active ? <CheckCircleOutlined /> : <UserOutlined />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-bold text-slate-900">{patient.name}</span>
                        {active ? (
                          <span className="shrink-0 rounded-full bg-[#1E3A8A] px-1.5 py-0.5 text-[9px] font-bold text-white">
                            当前
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
                        {renderPatientMeta(patient) || '患者信息待完善'}
                      </div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-400">
                        住院号 {patient.id}{patient.diagnosis ? ` · ${patient.diagnosis}` : ''}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
