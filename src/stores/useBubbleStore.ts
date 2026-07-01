import { create } from 'zustand';
import { getEmrContextKey, type EmrContext, type EmrContextDebug } from '../services/emrContext/types';

export type BubbleMode = 'idle' | 'detected' | 'expanded';
export type BubbleEmrContext = EmrContext;

interface BubbleState {
  mode: BubbleMode;
  detectedContext: BubbleEmrContext | null;
  emrDebug: EmrContextDebug | null;
  activatedContextKeys: string[];

  setDetectedContext: (context: BubbleEmrContext | null) => void;
  setEmrDebug: (debug: EmrContextDebug) => void;
  expand: (context?: BubbleEmrContext | null) => void;
  collapse: () => void;
  markActivated: (contextKey: string) => void;
  hasActivated: (contextKey: string) => boolean;
}

export function getBubbleContextKey(context: Pick<BubbleEmrContext, 'patientId' | 'docCode' | 'docName'>) {
  return getEmrContextKey(context);
}

export const useBubbleStore = create<BubbleState>((set, get) => ({
  mode: 'idle',
  detectedContext: null,
  emrDebug: null,
  activatedContextKeys: [],

  setDetectedContext: (detectedContext) =>
    set((state) => ({
      detectedContext,
      mode: state.mode === 'expanded' ? 'expanded' : detectedContext ? 'detected' : 'idle',
    })),

  setEmrDebug: (emrDebug) => set({ emrDebug }),

  expand: (context) =>
    set((state) => ({
      detectedContext: context === undefined ? state.detectedContext : context,
      mode: 'expanded',
    })),

  collapse: () =>
    set((state) => ({
      mode: state.detectedContext ? 'detected' : 'idle',
    })),

  markActivated: (contextKey) =>
    set((state) => {
      if (state.activatedContextKeys.includes(contextKey)) {
        return state;
      }

      return {
        activatedContextKeys: [...state.activatedContextKeys, contextKey],
      };
    }),

  hasActivated: (contextKey) => get().activatedContextKeys.includes(contextKey),
}));
