import { create } from 'zustand';
import { DocDefinition, getDocByCode } from '../config/docRegistry';

export interface Patient {
  id: string; // 住院号
  name: string;
  gender: string;
  age: string;
  bedNo: string;
  deptName: string;
  admissionDate: string;
  admissionDays: number;
  doctor: string;
  diagnosis: string;
}

interface PatientState {
  isLoggedIn: boolean;
  currentPatient: Patient | null;
  /** 当前选中文书（承载范式信息，驱动范式路由） */
  selectedDoc: DocDefinition | null;
  isGenerating: boolean;
  generationProgress: number;
  /** AI 智能推荐文书 */
  recommendedDoc: DocDefinition | null;

  setLoggedIn: (loggedIn: boolean) => void;
  selectPatient: (patient: Patient | null) => void;
  selectDoc: (doc: DocDefinition | null) => void;
  setGenerating: (generating: boolean) => void;
  setProgress: (progress: number) => void;
  resetAll: () => void;
}

export const usePatientStore = create<PatientState>((set) => ({
  isLoggedIn: false, // 初始为游客状态 (未登录)
  currentPatient: null, // 初始为暂无活动患者
  selectedDoc: null,
  isGenerating: false,
  generationProgress: 0,
  // 默认推荐首次病程记录（入院已12小时，时限临近）
  recommendedDoc: getDocByCode('DOC002') ?? null,

  setLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
  selectPatient: (patient) =>
    set(() => {
      if (!patient) {
        return {
          currentPatient: null,
          selectedDoc: null,
          isGenerating: false,
          generationProgress: 0,
        };
      }
      return { currentPatient: patient };
    }),
  selectDoc: (selectedDoc) => set({ selectedDoc, isGenerating: false, generationProgress: 0 }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setProgress: (generationProgress) => set({ generationProgress }),
  resetAll: () =>
    set({
      isLoggedIn: false,
      currentPatient: null,
      selectedDoc: null,
      isGenerating: false,
      generationProgress: 0,
    }),
}));
