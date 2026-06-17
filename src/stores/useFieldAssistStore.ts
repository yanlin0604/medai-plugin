import { create } from 'zustand';
import { loadFieldAssistHistory, saveFieldAssistDraft } from '../services/fieldAssist/history';
import type { FieldAssistContext, FieldAssistDraft } from '../services/fieldAssist/types';
import { getFieldAssistContextKey, getFieldIdentityKey } from '../services/fieldAssist/types';

interface FieldAssistState {
  context: FieldAssistContext | null;
  drafts: FieldAssistDraft[];
  setContext: (context: FieldAssistContext | null) => void;
  addDraft: (draft: FieldAssistDraft) => void;
  getCurrentDrafts: () => FieldAssistDraft[];
}

export const useFieldAssistStore = create<FieldAssistState>((set, get) => ({
  context: null,
  drafts: loadFieldAssistHistory(),

  setContext: (context) => set({ context }),

  addDraft: (draft) => {
    saveFieldAssistDraft(draft);
    set((state) => ({
      drafts: [draft, ...state.drafts.filter((item) => item.response.generationId !== draft.response.generationId)].slice(0, 50),
    }));
  },

  getCurrentDrafts: () => {
    const { context, drafts } = get();
    if (!context) return [];
    const contextKey = getFieldAssistContextKey(context);
    const identityKey = getFieldIdentityKey(context);
    return drafts.filter((draft) => {
      if (draft.contextKey === contextKey) return true;
      const responseIdentity = `${draft.response.patientId}:${draft.response.docCode}:${draft.response.fieldKey}`;
      return responseIdentity === identityKey;
    });
  },
}));
