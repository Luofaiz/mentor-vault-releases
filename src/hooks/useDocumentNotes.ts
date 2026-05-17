import { useCallback, useEffect, useState } from 'react';
import { deleteNote, listNotes, saveNote } from '../lib/notes';
import { useI18n } from '../lib/i18n';
import type { DocumentNote, DocumentNoteInput } from '../types/note';

export function useDocumentNotes() {
  const { t } = useI18n();
  const [notes, setNotes] = useState<DocumentNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const records = await listNotes();
      setNotes(records);
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setError(t('loadNotesFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const save = useCallback(async (id: string | null, input: DocumentNoteInput) => {
    const record = await saveNote(id, input);
    if (record) {
      setNotes((current) =>
        [
          record,
          ...current.filter((note) => note.id !== record.id),
        ].sort((left, right) => right.updatedAt - left.updatedAt),
      );
    }
    return record;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteNote(id);
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  return {
    notes,
    isLoading,
    error,
    refresh,
    save,
    remove,
  };
}
