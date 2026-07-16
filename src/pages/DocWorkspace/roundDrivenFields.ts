import type { DocFieldDef } from '../../services/types';

export interface RoundDrivenFieldSession {
  field: Pick<DocFieldDef, 'roundDriven'>;
  value: string;
}

export function selectRoundDrivenSessions<T extends RoundDrivenFieldSession>(
  sessions: readonly T[],
  overwriteExisting: boolean,
): T[] {
  return sessions.filter((session) =>
    session.field.roundDriven === true && (overwriteExisting || !session.value.trim()),
  );
}
