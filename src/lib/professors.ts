import { INITIAL_PROFESSORS } from '../data/seed';
import { getDesktopApi } from './desktop';
import { createWorkbookBlob, parseWorkbookRows } from './xlsx';
import type { Professor, ProfessorDraft, ProfessorFilters, ProfessorStatus } from '../types/professor';

const STORAGE_KEY = 'vibe.professors.v1';
const PROFESSOR_STORE_VERSION = 2;
const PROFESSOR_EXPORT_COLUMNS: Array<{ key: keyof ProfessorDraft; label: string }> = [
  { key: 'name', label: '姓名' },
  { key: 'school', label: '学校' },
  { key: 'college', label: '学院' },
  { key: 'email', label: '邮箱' },
  { key: 'title', label: '职称' },
  { key: 'homepage', label: '主页' },
  { key: 'researchArea', label: '研究方向' },
  { key: 'status', label: '状态' },
  { key: 'tags', label: '标签' },
  { key: 'firstContactDate', label: '初次联系日期' },
  { key: 'lastContactDate', label: '最后联系日期' },
  { key: 'notes', label: '备注' },
];

interface ProfessorStore {
  version: number;
  professors: Professor[];
}

interface ImportProfessorsResult {
  created: number;
  updated: number;
  skipped: number;
}

const STATUS_LABEL_TO_VALUE: Record<string, ProfessorStatus> = {
  Pending: 'Pending',
  Drafting: 'Drafting',
  Contacted: 'Contacted',
  'Follow-Up Due': 'Follow-Up Due',
  Replied: 'Replied',
  未读: '未读',
  不读: '未读',
  '未读？': '未读',
  已读不回: '已读不回',
  官回: '官回',
  待面试: '待面试',
  待考核: '待考核',
  Unread: '未读',
  'Read No Reply': '已读不回',
  'Read, no reply': '已读不回',
  'Official Reply': '官回',
  Rejected: 'Rejected',
  待联系: 'Pending',
  草稿中: 'Drafting',
  已联系: 'Contacted',
  待跟进: 'Follow-Up Due',
  已回复: 'Replied',
  已拒绝: 'Rejected',
};

const IMPORT_HEADER_ALIASES: Record<keyof ProfessorDraft, string[]> = {
  name: ['姓名', 'name'],
  school: ['学校', 'school'],
  college: ['学院', '院系', 'college', 'department'],
  email: ['邮箱', 'email'],
  title: ['职称', 'title'],
  homepage: ['主页', 'homepage', 'website', 'url'],
  researchArea: ['研究方向', 'research area', 'researcharea'],
  status: ['状态', 'status'],
  tags: ['标签', 'tags'],
  firstContactDate: ['初次联系日期', 'first contact date', 'firstcontactdate'],
  lastContactDate: ['最后联系日期', 'last contact date', 'lastcontactdate'],
  notes: ['备注', 'notes', 'note'],
};

function excelSerialToDate(serial: number) {
  const utcTime = Date.UTC(1899, 11, 30) + Math.round(serial * 86400 * 1000);
  return new Date(utcTime).toISOString().slice(0, 10);
}

function normalizeDateValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 20000 && value < 60000) {
      return excelSerialToDate(value);
    }
    return new Date(value).toISOString().slice(0, 10);
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 60000) {
      return excelSerialToDate(serial);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  return String(value ?? '')
    .split(/[,，;；\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeStatus(value: unknown): ProfessorStatus {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return 'Pending';
  }

  return STATUS_LABEL_TO_VALUE[raw] ?? raw;
}

function buildLegacyMigrationNote(raw: Record<string, unknown>, notes: string) {
  const legacyParts = [
    raw.country ? `原国家/地区：${String(raw.country).trim()}` : '',
    raw.applicationSeason ? `原申请季：${String(raw.applicationSeason).trim()}` : '',
    raw.followUpDate ? `原计划跟进日期：${normalizeDateValue(raw.followUpDate)}` : '',
  ].filter(Boolean);

  if (legacyParts.length === 0) {
    return notes.trim();
  }

  const legacyLine = `[迁移保留] ${legacyParts.join('；')}`;
  if (notes.includes(legacyLine)) {
    return notes.trim();
  }

  return [notes.trim(), legacyLine].filter(Boolean).join('\n');
}

function normalizeProfessorRecord(raw: Record<string, unknown>): Professor {
  const status = normalizeStatus(raw.status);
  const lastContactDate = normalizeDateValue(raw.lastContactDate);
  const firstContactDate = normalizeDateValue(raw.firstContactDate) || (
    lastContactDate && status !== 'Pending' && status !== 'Drafting' ? lastContactDate : ''
  );
  const notes = buildLegacyMigrationNote(raw, String(raw.notes ?? ''));

  return {
    id: String(raw.id ?? crypto.randomUUID()),
    name: String(raw.name ?? '').trim(),
    title: String(raw.title ?? '').trim(),
    school: String(raw.school ?? '').trim(),
    college: String(raw.college ?? raw.department ?? '').trim(),
    email: String(raw.email ?? '').trim(),
    homepage: String(raw.homepage ?? raw.website ?? raw.profileUrl ?? '').trim(),
    researchArea: String(raw.researchArea ?? '').trim(),
    status,
    tags: normalizeTags(raw.tags),
    firstContactDate,
    lastContactDate,
    notes,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : undefined,
  };
}

function normalizeDraft(draft: ProfessorDraft): ProfessorDraft {
  return {
    name: draft.name.trim(),
    title: draft.title.trim(),
    school: draft.school.trim(),
    college: String(draft.college ?? '').trim(),
    email: draft.email.trim(),
    homepage: draft.homepage.trim(),
    researchArea: draft.researchArea.trim(),
    status: normalizeStatus(draft.status),
    tags: normalizeTags(draft.tags),
    firstContactDate: normalizeDateValue(draft.firstContactDate),
    lastContactDate: normalizeDateValue(draft.lastContactDate),
    notes: draft.notes.trim(),
  };
}

function professorToDraft(professor: Professor): ProfessorDraft {
  return {
    name: professor.name,
    title: professor.title,
    school: professor.school,
    college: professor.college,
    email: professor.email,
    homepage: professor.homepage,
    researchArea: professor.researchArea,
    status: professor.status,
    tags: [...professor.tags],
    firstContactDate: professor.firstContactDate,
    lastContactDate: professor.lastContactDate,
    notes: professor.notes,
  };
}

function filterProfessors(professors: Professor[], filters: ProfessorFilters = {}) {
  const query = filters.query?.trim().toLowerCase();

  return professors
    .filter((professor) => (filters.includeDeleted ? true : !professor.deletedAt))
    .filter((professor) => {
      if (!query) {
        return true;
      }

      return [
        professor.name,
        professor.title,
        professor.school,
        professor.college,
        professor.email,
        professor.homepage,
        professor.researchArea,
        professor.status,
        professor.firstContactDate,
        professor.lastContactDate,
        professor.notes,
        professor.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function writeBrowserStore(professors: Professor[]) {
  const next: ProfessorStore = {
    version: PROFESSOR_STORE_VERSION,
    professors,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function readBrowserStore(): ProfessorStore {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = { version: PROFESSOR_STORE_VERSION, professors: INITIAL_PROFESSORS };
    writeBrowserStore(seeded.professors);
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ProfessorStore>;
    if (!Array.isArray(parsed.professors)) {
      throw new Error('Invalid professor store.');
    }

    const professors = parsed.professors.map((record) => normalizeProfessorRecord(record as unknown as Record<string, unknown>));
    if (parsed.version !== PROFESSOR_STORE_VERSION || JSON.stringify(professors) !== JSON.stringify(parsed.professors)) {
      writeBrowserStore(professors);
    }

    return {
      version: PROFESSOR_STORE_VERSION,
      professors,
    };
  } catch {
    const seeded = { version: PROFESSOR_STORE_VERSION, professors: INITIAL_PROFESSORS };
    writeBrowserStore(seeded.professors);
    return seeded;
  }
}

function createProfessorRecord(draft: ProfessorDraft): Professor {
  const normalized = normalizeDraft(draft);
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    ...normalized,
    createdAt: now,
    updatedAt: now,
  };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseRowsFromHtmlTable(text: string) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(text, 'text/html');
  const rows = Array.from(documentNode.querySelectorAll('table tr'));
  return rows.map((row) =>
    Array.from(row.querySelectorAll('th,td')).map((cell) => cell.textContent?.trim() ?? ''),
  );
}

function parseRowsFromSpreadsheetXml(text: string) {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) {
    return [];
  }

  const rowNodes = Array.from(xml.getElementsByTagNameNS('*', 'Row'));
  return rowNodes.map((row) =>
    Array.from(row.getElementsByTagNameNS('*', 'Cell')).map((cell) => {
      const dataNode = cell.getElementsByTagNameNS('*', 'Data')[0];
      return dataNode?.textContent?.trim() ?? '';
    }),
  );
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  return headers.findIndex((header) => aliases.includes(header));
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

function mapRowsToProfessorDrafts(rows: string[][]): ProfessorDraft[] {
  if (rows.length === 0) {
    return [];
  }

  const normalizedHeaders = rows[0].map(normalizeHeader);
  const columnMap = Object.fromEntries(
    Object.entries(IMPORT_HEADER_ALIASES).map(([key, aliases]) => [
      key,
      findHeaderIndex(normalizedHeaders, aliases.map(normalizeHeader)),
    ]),
  ) as Record<keyof ProfessorDraft, number>;

  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => {
      const tagsCell = columnMap.tags >= 0 ? row[columnMap.tags] ?? '' : '';
      return normalizeDraft({
        name: columnMap.name >= 0 ? row[columnMap.name] ?? '' : '',
        school: columnMap.school >= 0 ? row[columnMap.school] ?? '' : '',
        college: columnMap.college >= 0 ? row[columnMap.college] ?? '' : '',
        email: columnMap.email >= 0 ? row[columnMap.email] ?? '' : '',
        title: columnMap.title >= 0 ? row[columnMap.title] ?? '' : '',
        homepage: columnMap.homepage >= 0 ? row[columnMap.homepage] ?? '' : '',
        researchArea: columnMap.researchArea >= 0 ? row[columnMap.researchArea] ?? '' : '',
        status: columnMap.status >= 0 ? normalizeStatus(row[columnMap.status]) : 'Pending',
        tags: normalizeTags(tagsCell),
        firstContactDate: columnMap.firstContactDate >= 0 ? row[columnMap.firstContactDate] ?? '' : '',
        lastContactDate: columnMap.lastContactDate >= 0 ? row[columnMap.lastContactDate] ?? '' : '',
        notes: columnMap.notes >= 0 ? row[columnMap.notes] ?? '' : '',
      });
    });
}

function mergeProfessors(current: Professor[], drafts: ProfessorDraft[]): { professors: Professor[]; result: ImportProfessorsResult } {
  const nextProfessors = [...current];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  drafts.forEach((draft) => {
    const normalized = normalizeDraft(draft);
    if (!normalized.name || !normalized.school) {
      skipped += 1;
      return;
    }

    const emailKey = normalized.email.toLowerCase();
    const existingIndex = emailKey
      ? nextProfessors.findIndex((professor) => professor.email.toLowerCase() === emailKey)
      : nextProfessors.findIndex(
          (professor) =>
            professor.name.trim().toLowerCase() === normalized.name.toLowerCase() &&
            professor.school.trim().toLowerCase() === normalized.school.toLowerCase(),
        );
    if (existingIndex < 0) {
      nextProfessors.unshift(createProfessorRecord(normalized));
      created += 1;
      return;
    }

    nextProfessors[existingIndex] = {
      ...nextProfessors[existingIndex],
      ...normalized,
      deletedAt: undefined,
      updatedAt: Date.now(),
    };
    updated += 1;
  });

  return {
    professors: nextProfessors,
    result: { created, updated, skipped },
  };
}

export async function listProfessors(filters: ProfessorFilters = {}) {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    return desktopApi.professors.list(filters);
  }

  return filterProfessors(readBrowserStore().professors, filters);
}

export async function createProfessor(draft: ProfessorDraft) {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    return desktopApi.professors.create(normalizeDraft(draft));
  }

  const nextProfessor = createProfessorRecord(draft);
  const current = readBrowserStore();
  writeBrowserStore([nextProfessor, ...current.professors]);
  return nextProfessor;
}

export async function updateProfessor(id: string, draft: ProfessorDraft) {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    return desktopApi.professors.update(id, normalizeDraft(draft));
  }

  const current = readBrowserStore();
  const normalized = normalizeDraft(draft);
  const nextProfessors = current.professors.map((professor) =>
    professor.id === id
      ? {
          ...professor,
          ...normalized,
          updatedAt: Date.now(),
        }
      : professor,
  );
  writeBrowserStore(nextProfessors);
  return nextProfessors.find((professor) => professor.id === id)!;
}

export async function trashProfessor(id: string) {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    return desktopApi.professors.trash(id);
  }

  const current = readBrowserStore();
  const deletedAt = Date.now();
  const nextProfessors = current.professors.map((professor) =>
    professor.id === id
      ? {
          ...professor,
          deletedAt,
          updatedAt: deletedAt,
        }
      : professor,
  );
  writeBrowserStore(nextProfessors);
  return nextProfessors.find((professor) => professor.id === id)!;
}

export async function restoreProfessor(id: string) {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    return desktopApi.professors.restore(id);
  }

  const current = readBrowserStore();
  const nextProfessors = current.professors.map((professor) =>
    professor.id === id
      ? {
          ...professor,
          deletedAt: undefined,
          updatedAt: Date.now(),
        }
      : professor,
  );
  writeBrowserStore(nextProfessors);
  return nextProfessors.find((professor) => professor.id === id)!;
}

export async function purgeProfessor(id: string) {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    await desktopApi.professors.purge(id);
    return;
  }

  const current = readBrowserStore();
  writeBrowserStore(current.professors.filter((professor) => professor.id !== id));
}

export async function importProfessors(drafts: ProfessorDraft[]) {
  const desktopApi = getDesktopApi();
  if (desktopApi) {
    const current = await desktopApi.professors.list({ includeDeleted: true });
    const merged = mergeProfessors(current, drafts);

    for (const professor of merged.professors) {
      const existed = current.find((record) => record.id === professor.id);
      if (existed) {
        await desktopApi.professors.update(professor.id, professorToDraft(professor));
      } else {
        await desktopApi.professors.create(professorToDraft(professor));
      }
    }

    return merged.result;
  }

  const current = readBrowserStore();
  const merged = mergeProfessors(current.professors, drafts);
  writeBrowserStore(merged.professors);
  return merged.result;
}

export async function parseProfessorExcelFile(file: File) {
  const lowerName = file.name.toLowerCase();

  let rows: string[][] = [];
  if (lowerName.endsWith('.xlsx')) {
    rows = await parseWorkbookRows(file);
  } else {
    const text = await file.text();
    if (lowerName.endsWith('.csv')) {
      rows = text
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => parseCsvLine(line));
    } else if (text.includes('<table')) {
      rows = parseRowsFromHtmlTable(text);
    } else {
      rows = parseRowsFromSpreadsheetXml(text);
    }
  }

  return mapRowsToProfessorDrafts(rows);
}

export function exportProfessorsToExcel(professors: Professor[]) {
  const rows = professors.map((professor) => professorToDraft(professor));
  const workbookRows = [
    PROFESSOR_EXPORT_COLUMNS.map((column) => column.label),
    ...rows.map((row) =>
      PROFESSOR_EXPORT_COLUMNS.map((column) =>
        column.key === 'tags' ? row.tags.join(', ') : String(row[column.key] ?? ''),
      ),
    ),
  ];

  const blob = createWorkbookBlob(workbookRows);
  const dateKey = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `professors-${dateKey}.xlsx`);
}
