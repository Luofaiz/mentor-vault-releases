import { useEffect, useState } from 'react';
import {
  createProfessor,
  importProfessors,
  listProfessors,
  purgeProfessor,
  restoreProfessor,
  trashProfessor,
  updateProfessor,
} from '../lib/professors';
import { useI18n } from '../lib/i18n';
import type { Professor, ProfessorDraft } from '../types/professor';

export function useProfessorDirectory() {
  const { t } = useI18n();
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const records = await listProfessors({ includeDeleted: true });
      setProfessors(records);
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setError(t('loadProfessorRecordsFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (draft: ProfessorDraft) => {
    await createProfessor(draft);
    await refresh();
  };

  const update = async (id: string, draft: ProfessorDraft) => {
    await updateProfessor(id, draft);
    await refresh();
  };

  const moveToTrash = async (id: string) => {
    await trashProfessor(id);
    await refresh();
  };

  const restore = async (id: string) => {
    await restoreProfessor(id);
    await refresh();
  };

  const purge = async (id: string) => {
    await purgeProfessor(id);
    await refresh();
  };

  const importRecords = async (drafts: ProfessorDraft[]) => {
    const result = await importProfessors(drafts);
    await refresh();
    return result;
  };

  return {
    professors,
    isLoading,
    error,
    refresh,
    create,
    update,
    moveToTrash,
    restore,
    purge,
    importRecords,
  };
}
