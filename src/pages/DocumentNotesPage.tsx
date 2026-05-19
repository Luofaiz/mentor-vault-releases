import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  Bold,
  ChevronDown,
  ChevronUp,
  Code2,
  Download,
  Eraser,
  FileImage,
  FileText,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Plus,
  Quote,
  Redo2,
  Search,
  Strikethrough,
  Trash2,
  Underline,
  Undo2,
  X,
} from 'lucide-react';
import { useDocumentNotes } from '../hooks/useDocumentNotes';
import { useListOrderPreferences } from '../hooks/useListOrderPreferences';
import { useI18n } from '../lib/i18n';
import { moveKeyToDropPosition, orderItems } from '../lib/listOrdering';
import { cn } from '../lib/utils';
import type { DocumentNote } from '../types/note';

type DropPosition = 'before' | 'after';
type InsertImageStatus = 'idle' | 'loading' | 'error';
type EditorBlock = 'div' | 'h1' | 'h2' | 'h3' | 'blockquote' | 'pre';

interface ActiveEditorFormats {
  block: EditorBlock;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  orderedList: boolean;
  unorderedList: boolean;
}

interface TextNodeSegment {
  node: Text;
  start: number;
  end: number;
}

interface CssHighlightRegistry {
  delete: (name: string) => boolean;
  set: (name: string, highlight: unknown) => void;
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\((data:image\/[^)\s]+|https?:\/\/[^)\s]+|blob:[^)]+|file:[^)]+)\)/g;
const MARKDOWN_INLINE_PATTERN =
  /!\[([^\]]*)\]\((data:image\/[^)\s]+|https?:\/\/[^)\s]+|blob:[^)]+|file:[^)]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|<u>(.*?)<\/u>|\*([^*\n]+)\*/g;
const HEADING_MARKDOWN_PATTERN = /^(#{1,3})\s+(.+)$/;
const TASK_MARKDOWN_PATTERN = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const UNORDERED_LIST_MARKDOWN_PATTERN = /^\s*[-*]\s+(.*)$/;
const ORDERED_LIST_MARKDOWN_PATTERN = /^\s*\d+[.)]\s+(.*)$/;
const FENCE_MARKDOWN_PATTERN = /^\s*```\s*$/;
const NOTE_FIND_HIGHLIGHT_NAME = 'mentor-note-find';
const NOTE_FIND_CURRENT_HIGHLIGHT_NAME = 'mentor-note-find-current';
const NOTE_FIND_HIGHLIGHT_STYLE_ID = 'mentor-note-find-highlight-style';
const INITIAL_ACTIVE_FORMATS: ActiveEditorFormats = {
  block: 'div',
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  orderedList: false,
  unorderedList: false,
};

function readCommandState(command: string) {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function getSelectionNode(selection: Selection) {
  if (selection.rangeCount === 0) {
    return null;
  }

  const node = selection.getRangeAt(0).commonAncestorContainer;
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

function findSelectionBlock(editor: HTMLElement, selection: Selection): EditorBlock {
  let node = getSelectionNode(selection);
  while (node && node !== editor) {
    if (node instanceof HTMLElement) {
      if (node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'H3') {
        return node.tagName.toLowerCase() as EditorBlock;
      }

      if (node.tagName === 'BLOCKQUOTE') {
        return 'blockquote';
      }

      if (node.tagName === 'PRE') {
        return 'pre';
      }
    }
    node = node.parentElement;
  }

  return 'div';
}

function selectionHasAncestorTag(editor: HTMLElement, tagName: string) {
  const selection = window.getSelection();
  const node = selection ? getSelectionNode(selection) : null;
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  const ancestor = node.closest(tagName);
  return Boolean(ancestor && editor.contains(ancestor));
}

function getCssHighlightRegistry() {
  if (typeof CSS === 'undefined') {
    return null;
  }

  return (CSS as unknown as { highlights?: CssHighlightRegistry }).highlights ?? null;
}

function createCssHighlight(ranges: Range[]) {
  const HighlightConstructor = (window as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  return HighlightConstructor ? new HighlightConstructor(...ranges) : null;
}

function canUseCssHighlights() {
  return Boolean(getCssHighlightRegistry() && (window as unknown as { Highlight?: unknown }).Highlight);
}

function clearNoteFindHighlights() {
  const registry = getCssHighlightRegistry();
  registry?.delete(NOTE_FIND_HIGHLIGHT_NAME);
  registry?.delete(NOTE_FIND_CURRENT_HIGHLIGHT_NAME);
}

function ensureNoteFindHighlightStyle() {
  if (document.getElementById(NOTE_FIND_HIGHLIGHT_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = NOTE_FIND_HIGHLIGHT_STYLE_ID;
  style.textContent = `
    ::highlight(${NOTE_FIND_HIGHLIGHT_NAME}) {
      background: rgba(253, 224, 71, 0.55);
      color: inherit;
    }

    ::highlight(${NOTE_FIND_CURRENT_HIGHLIGHT_NAME}) {
      background: rgba(177, 95, 47, 0.32);
      color: inherit;
    }
  `;
  document.head.append(style);
}

function collectEditorText(editor: HTMLElement) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const segments: TextNodeSegment[] = [];
  let text = '';
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;
    const value = textNode.textContent ?? '';
    if (value) {
      segments.push({
        node: textNode,
        start: text.length,
        end: text.length + value.length,
      });
      text += value;
    }
    currentNode = walker.nextNode();
  }

  return { segments, text };
}

function createRangeFromTextOffsets(segments: TextNodeSegment[], start: number, end: number) {
  const startSegment = segments.find((segment) => start >= segment.start && start < segment.end);
  const endSegment = segments.find((segment) => end > segment.start && end <= segment.end);

  if (!startSegment || !endSegment) {
    return null;
  }

  const range = document.createRange();
  range.setStart(startSegment.node, start - startSegment.start);
  range.setEnd(endSegment.node, end - endSegment.start);
  return range;
}

function findEditorTextRanges(editor: HTMLElement, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const { segments, text } = collectEditorText(editor);
  const haystack = text.toLowerCase();
  const ranges: Range[] = [];
  let searchFrom = 0;

  while (searchFrom < haystack.length) {
    const matchStart = haystack.indexOf(needle, searchFrom);
    if (matchStart === -1) {
      break;
    }

    const range = createRangeFromTextOffsets(segments, matchStart, matchStart + needle.length);
    if (range) {
      ranges.push(range);
    }
    searchFrom = matchStart + needle.length;
  }

  return ranges;
}

function renderNoteFindHighlights(matches: Range[], currentIndex: number) {
  const registry = getCssHighlightRegistry();
  if (!registry || !canUseCssHighlights()) {
    return false;
  }

  ensureNoteFindHighlightStyle();
  registry.delete(NOTE_FIND_HIGHLIGHT_NAME);
  registry.delete(NOTE_FIND_CURRENT_HIGHLIGHT_NAME);

  if (matches.length > 0) {
    const allMatchesHighlight = createCssHighlight(matches);
    if (allMatchesHighlight) {
      registry.set(NOTE_FIND_HIGHLIGHT_NAME, allMatchesHighlight);
    }
  }

  const currentMatch = matches[currentIndex];
  if (currentMatch) {
    const currentMatchHighlight = createCssHighlight([currentMatch]);
    if (currentMatchHighlight) {
      registry.set(NOTE_FIND_CURRENT_HIGHLIGHT_NAME, currentMatchHighlight);
    }
  }

  return true;
}

function revealNoteFindMatch(match: Range | undefined, shouldSelectFallback: boolean) {
  if (!match) {
    return;
  }

  if (shouldSelectFallback) {
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(match.cloneRange());
  }

  const matchElement = match.startContainer instanceof Element ? match.startContainer : match.startContainer.parentElement;
  matchElement?.scrollIntoView({ block: 'center' });
}

function getDropPosition(event: DragEvent<HTMLElement>): DropPosition {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function createFallbackNote(): DocumentNote {
  const now = Date.now();
  return {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `note-${now}`,
    title: '',
    body: '',
    createdAt: now,
    updatedAt: now,
  };
}

function formatUpdatedAt(value: number, locale: string) {
  if (!Number.isFinite(value)) {
    return '';
  }

  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getExcerpt(body: string) {
  return body.replace(MARKDOWN_IMAGE_PATTERN, '[image]').replace(/\s+/g, ' ').trim();
}

function sanitizeMarkdownFilename(value: string) {
  const fallback = 'document-note';
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

function triggerMarkdownDownload(title: string, body: string) {
  const normalizedTitle = title.trim() || '未命名笔记';
  const content = body.startsWith('# ') ? body : `# ${normalizedTitle}\n\n${body}`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeMarkdownFilename(normalizedTitle)}.md`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Invalid image data.'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read image.')));
    reader.readAsDataURL(file);
  });
}

function getImageAltText(file: File) {
  return sanitizeMarkdownImageAlt(file.name.replace(/\.[^.]+$/, ''));
}

function sanitizeMarkdownImageAlt(value: string) {
  return value.replace(/[[\]()\r\n]/g, '').trim() || 'image';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return character;
    }
  });
}

function sanitizeLinkHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '#';
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^(https?:|mailto:|file:|blob:|data:image\/)/i.test(trimmed)) {
    return '#';
  }

  return trimmed;
}

function normalizeUserLinkHref(value: string) {
  const sanitized = sanitizeLinkHref(value);
  if (
    sanitized === '#' ||
    /^[a-z][a-z0-9+.-]*:/i.test(sanitized) ||
    sanitized.startsWith('#') ||
    sanitized.startsWith('/') ||
    sanitized.startsWith('./') ||
    sanitized.startsWith('../')
  ) {
    return sanitized;
  }

  return `https://${sanitized}`;
}

function renderMarkdownInline(line: string) {
  let html = '';
  let lastIndex = 0;
  MARKDOWN_INLINE_PATTERN.lastIndex = 0;

  for (const match of line.matchAll(MARKDOWN_INLINE_PATTERN)) {
    const index = match.index ?? 0;
    html += escapeHtml(line.slice(lastIndex, index));

    if (match[2]) {
      html += `<img src="${escapeHtml(match[2])}" alt="${escapeHtml(sanitizeMarkdownImageAlt(match[1]))}" data-note-image="true">`;
    } else if (match[4] && match[5]) {
      html += `<a href="${escapeHtml(sanitizeLinkHref(match[5]))}" target="_blank" rel="noreferrer">${escapeHtml(match[4])}</a>`;
    } else if (match[6]) {
      html += `<code>${escapeHtml(match[6])}</code>`;
    } else if (match[7]) {
      html += `<strong>${escapeHtml(match[7])}</strong>`;
    } else if (match[8]) {
      html += `<s>${escapeHtml(match[8])}</s>`;
    } else if (match[9]) {
      html += `<u>${escapeHtml(match[9])}</u>`;
    } else if (match[10]) {
      html += `<em>${escapeHtml(match[10])}</em>`;
    }

    lastIndex = index + match[0].length;
  }

  html += escapeHtml(line.slice(lastIndex));
  return html || '<br>';
}

function renderTaskListItem(line: string) {
  const match = line.match(TASK_MARKDOWN_PATTERN);
  if (!match) {
    return '';
  }

  const checked = match[1].toLowerCase() === 'x';
  return [
    '<li data-note-task-item="true">',
    `<input type="checkbox" data-note-checkbox="true" contenteditable="false"${checked ? ' checked' : ''}>`,
    `<span>${renderMarkdownInline(match[2])}</span>`,
    '</li>',
  ].join('');
}

function renderMarkdownList(lines: string[], ordered: boolean) {
  const tag = ordered ? 'ol' : 'ul';
  const items = lines
    .map((line) => {
      const match = line.match(ordered ? ORDERED_LIST_MARKDOWN_PATTERN : UNORDERED_LIST_MARKDOWN_PATTERN);
      return match ? `<li>${renderMarkdownInline(match[1])}</li>` : '';
    })
    .join('');

  return `<${tag}>${items}</${tag}>`;
}

function renderMarkdownTaskList(lines: string[]) {
  return `<ul data-note-task-list="true">${lines.map(renderTaskListItem).join('')}</ul>`;
}

function markdownToEditorHtml(body: string) {
  if (!body) {
    return '';
  }

  const lines = body.split('\n');
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (FENCE_MARKDOWN_PATTERN.test(line)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_MARKDOWN_PATTERN.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n')) || '<br>'}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(HEADING_MARKDOWN_PATTERN);
    if (headingMatch) {
      blocks.push(`<h${headingMatch[1].length}>${renderMarkdownInline(headingMatch[2])}</h${headingMatch[1].length}>`);
      index += 1;
      continue;
    }

    if (TASK_MARKDOWN_PATTERN.test(line)) {
      const taskLines: string[] = [];
      while (index < lines.length && TASK_MARKDOWN_PATTERN.test(lines[index])) {
        taskLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderMarkdownTaskList(taskLines));
      continue;
    }

    if (ORDERED_LIST_MARKDOWN_PATTERN.test(line)) {
      const listLines: string[] = [];
      while (index < lines.length && ORDERED_LIST_MARKDOWN_PATTERN.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderMarkdownList(listLines, true));
      continue;
    }

    if (UNORDERED_LIST_MARKDOWN_PATTERN.test(line)) {
      const listLines: string[] = [];
      while (index < lines.length && UNORDERED_LIST_MARKDOWN_PATTERN.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderMarkdownList(listLines, false));
      continue;
    }

    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${quoteLines.map((quoteLine) => `<div>${renderMarkdownInline(quoteLine)}</div>`).join('')}</blockquote>`);
      continue;
    }

    blocks.push(`<div>${renderMarkdownInline(line)}</div>`);
    index += 1;
  }

  return blocks.join('');
}

function isElementNode(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE;
}

function trimMarkdownWrapperContent(value: string) {
  return value.replace(/^\s+|\s+$/g, '');
}

function wrapInlineMarkdown(content: string, prefix: string, suffix = prefix) {
  const leading = content.match(/^\s*/)?.[0] ?? '';
  const trailing = content.match(/\s*$/)?.[0] ?? '';
  const inner = content.slice(leading.length, content.length - trailing.length);
  return inner ? `${leading}${prefix}${inner}${suffix}${trailing}` : content;
}

function inlineNodesToMarkdown(nodes: Iterable<Node>) {
  return Array.from(nodes).map(inlineNodeToMarkdown).join('');
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.replace(/\u00a0/g, ' ') ?? '';
  }

  if (!isElementNode(node)) {
    return '';
  }

  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') ?? '';
    if (!src) {
      return '';
    }
    return `![${sanitizeMarkdownImageAlt(node.getAttribute('alt') ?? 'image')}](${src})`;
  }

  if (node.tagName === 'BR') {
    return '\n';
  }

  const content = inlineNodesToMarkdown(node.childNodes);
  const trimmedContent = trimMarkdownWrapperContent(content);

  if (!trimmedContent) {
    return content;
  }

  if (node.tagName === 'STRONG' || node.tagName === 'B') {
    return wrapInlineMarkdown(content, '**');
  }

  if (node.tagName === 'EM' || node.tagName === 'I') {
    return wrapInlineMarkdown(content, '*');
  }

  if (node.tagName === 'U') {
    return wrapInlineMarkdown(content, '<u>', '</u>');
  }

  if (node.tagName === 'S' || node.tagName === 'STRIKE' || node.tagName === 'DEL') {
    return wrapInlineMarkdown(content, '~~');
  }

  if (node.tagName === 'CODE' && node.parentElement?.tagName !== 'PRE') {
    return wrapInlineMarkdown(content.replace(/`/g, ''), '`');
  }

  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? '';
    return href ? wrapInlineMarkdown(content, '[', `](${sanitizeLinkHref(href)})`) : content;
  }

  return content;
}

function listItemToMarkdown(listItem: HTMLElement, ordered: boolean, index: number) {
  const checkbox = listItem.querySelector<HTMLInputElement>('input[data-note-checkbox="true"]');
  const clone = listItem.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input[data-note-checkbox="true"]').forEach((input) => input.remove());
  const content = inlineNodesToMarkdown(clone.childNodes).replace(/\n+/g, ' ').trim();

  if (checkbox) {
    return `- [${checkbox.checked ? 'x' : ' '}] ${content}`;
  }

  return `${ordered ? `${index + 1}.` : '-'} ${content}`;
}

function blockNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.replace(/\u00a0/g, ' ') ?? '';
  }

  if (!isElementNode(node)) {
    return '';
  }

  if (node.tagName === 'H1' || node.tagName === 'H2' || node.tagName === 'H3') {
    const depth = Number(node.tagName.slice(1));
    return `${'#'.repeat(depth)} ${inlineNodesToMarkdown(node.childNodes).trim()}`;
  }

  if (node.tagName === 'BLOCKQUOTE') {
    return Array.from(node.childNodes)
      .map((child) => (isElementNode(child) ? inlineNodesToMarkdown(child.childNodes) : inlineNodeToMarkdown(child)).trim())
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join('\n');
  }

  if (node.tagName === 'PRE') {
    return `\`\`\`\n${node.textContent?.replace(/\u00a0/g, ' ') ?? ''}\n\`\`\``;
  }

  if (node.tagName === 'UL' || node.tagName === 'OL') {
    const ordered = node.tagName === 'OL';
    return Array.from(node.children)
      .filter((child): child is HTMLElement => child.tagName === 'LI')
      .map((child, index) => listItemToMarkdown(child, ordered, index))
      .join('\n');
  }

  if (node.tagName === 'LI') {
    return listItemToMarkdown(node, false, 0);
  }

  if (node.tagName === 'BR') {
    return '';
  }

  return inlineNodesToMarkdown(node.childNodes).replace(/\n+$/g, '');
}

function convertSelectionListToTaskList() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const node = getSelectionNode(selection);
  const list = node instanceof HTMLElement ? node.closest('ul') : null;
  if (!list) {
    return;
  }

  list.setAttribute('data-note-task-list', 'true');
  Array.from(list.children)
    .filter((child): child is HTMLElement => child.tagName === 'LI')
    .forEach((listItem) => {
      listItem.setAttribute('data-note-task-item', 'true');
      if (listItem.querySelector('input[data-note-checkbox="true"]')) {
        return;
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.setAttribute('data-note-checkbox', 'true');
      checkbox.setAttribute('contenteditable', 'false');
      listItem.prepend(checkbox);
    });
}

function editorToMarkdown(editor: HTMLElement) {
  const lines: string[] = [];
  let pendingLine = '';

  Array.from(editor.childNodes).forEach((node) => {
    if (isElementNode(node)) {
      if (pendingLine) {
        lines.push(pendingLine);
        pendingLine = '';
      }
      lines.push(blockNodeToMarkdown(node).replace(/\n+$/g, ''));
      return;
    }

    pendingLine += inlineNodeToMarkdown(node);
  });

  if (pendingLine || lines.length === 0) {
    lines.push(pendingLine);
  }

  return lines.join('\n').replace(/\u00a0/g, ' ');
}

function ToolbarButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    onClick();
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={handleMouseDown}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-stone-600 transition-colors hover:bg-stone-100',
        active ? 'border-stone-300 bg-stone-100 text-stone-950' : 'border-transparent bg-transparent',
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-stone-200" />;
}

export function DocumentNotesPage() {
  const { locale, t } = useI18n();
  const { notes, isLoading, error, save, remove } = useDocumentNotes();
  const { preferences, save: saveOrderPreferences } = useListOrderPreferences();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<DocumentNote>(() => createFallbackNote());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [noteDropTarget, setNoteDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const [insertImageStatus, setInsertImageStatus] = useState<InsertImageStatus>('idle');
  const [activeFormats, setActiveFormats] = useState<ActiveEditorFormats>(INITIAL_ACTIVE_FORMATS);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findMatchCount, setFindMatchCount] = useState(0);
  const [findMatchIndex, setFindMatchIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const findMatchesRef = useRef<Range[]>([]);
  const lastSavedSnapshotRef = useRef('');
  const lastEditorBodyRef = useRef('');
  const saveRequestSeqRef = useRef(0);
  const savedEditorSelectionRef = useRef<Range | null>(null);
  const syncedNoteIdRef = useRef<string | null>(null);

  const focusFindInput = () => {
    window.requestAnimationFrame(() => {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    });
  };

  const resetNoteFindState = () => {
    setFindQuery('');
    setFindMatchCount(0);
    setFindMatchIndex(0);
    findMatchesRef.current = [];
    clearNoteFindHighlights();
  };

  const orderedNotes = useMemo<DocumentNote[]>(
    () => orderItems(notes, preferences.noteIds, (note) => note.id),
    [notes, preferences.noteIds],
  );

  const filteredNotes = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return orderedNotes;
    }

    return orderedNotes.filter((note) =>
      [note.title, note.body]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [orderedNotes, search]);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  useEffect(() => {
    if (selectedNoteId && notes.some((note) => note.id === selectedNoteId)) {
      return;
    }

      setSelectedNoteId(orderedNotes[0]?.id ?? null);
  }, [notes, orderedNotes, selectedNoteId]);

  useEffect(() => {
    if (!selectedNote) {
      syncedNoteIdRef.current = null;
      setDraft(createFallbackNote());
      lastSavedSnapshotRef.current = '';
      lastEditorBodyRef.current = '';
      saveRequestSeqRef.current += 1;
      setSaveState('idle');
      resetNoteFindState();
      return;
    }

    const selectedSnapshot = JSON.stringify({
      title: selectedNote.title,
      body: selectedNote.body,
    });

    if (syncedNoteIdRef.current === selectedNote.id) {
      return;
    }

    lastSavedSnapshotRef.current = selectedSnapshot;
    syncedNoteIdRef.current = selectedNote.id;
    savedEditorSelectionRef.current = null;
    setDraft(selectedNote);
    lastEditorBodyRef.current = '';
    saveRequestSeqRef.current += 1;
    setSaveState('saved');
    resetNoteFindState();
  }, [selectedNote]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || draft.body === lastEditorBodyRef.current) {
      return;
    }

    clearNoteFindHighlights();
    findMatchesRef.current = [];
    editor.innerHTML = markdownToEditorHtml(draft.body);
    lastEditorBodyRef.current = draft.body;
  }, [draft.body, selectedNoteId]);

  useEffect(() => {
    if (!isFindOpen) {
      return;
    }

    focusFindInput();
  }, [isFindOpen]);

  useEffect(() => {
    if (!isFindOpen) {
      clearNoteFindHighlights();
      findMatchesRef.current = [];
      setFindMatchCount(0);
      setFindMatchIndex(0);
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) {
        clearNoteFindHighlights();
        findMatchesRef.current = [];
        setFindMatchCount(0);
        setFindMatchIndex(0);
        return;
      }

      const matches = findEditorTextRanges(editor, findQuery);
      const nextIndex = matches.length > 0 ? Math.min(findMatchIndex, matches.length - 1) : 0;
      findMatchesRef.current = matches;
      setFindMatchCount(matches.length);
      if (nextIndex !== findMatchIndex) {
        setFindMatchIndex(nextIndex);
      }
      renderNoteFindHighlights(matches, nextIndex);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [draft.body, findMatchIndex, findQuery, isFindOpen, selectedNoteId]);

  useEffect(() => {
    const matches = findMatchesRef.current;
    const hasNativeHighlight = renderNoteFindHighlights(matches, findMatchIndex);
    revealNoteFindMatch(matches[findMatchIndex], !hasNativeHighlight);
  }, [findMatchIndex, findMatchCount]);

  useEffect(() => clearNoteFindHighlights, []);

  useEffect(() => {
    const handleFindShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f' || !selectedNoteId) {
        return;
      }

      event.preventDefault();
      setIsFindOpen(true);
      focusFindInput();
    };

    document.addEventListener('keydown', handleFindShortcut);
    return () => document.removeEventListener('keydown', handleFindShortcut);
  }, [selectedNoteId]);

  useEffect(() => {
    if (!selectedNoteId) {
      return;
    }

    const snapshot = JSON.stringify({
      title: draft.title,
      body: draft.body,
    });
    if (snapshot === lastSavedSnapshotRef.current) {
      setSaveState((current) => (current === 'saving' ? 'saved' : current));
      return;
    }

    setSaveState('saving');
    const requestSeq = saveRequestSeqRef.current + 1;
    saveRequestSeqRef.current = requestSeq;
    const timer = window.setTimeout(() => {
      void save(selectedNoteId, {
        title: draft.title,
        body: draft.body,
      }).then((record) => {
        if (!record || saveRequestSeqRef.current !== requestSeq || record.id !== selectedNoteId) {
          return;
        }
        const savedSnapshot = JSON.stringify({
          title: record.title,
          body: record.body,
        });
        lastSavedSnapshotRef.current = savedSnapshot;
        setSaveState(savedSnapshot === snapshot ? 'saved' : 'saving');
      }).catch((saveError) => {
        console.error(saveError);
        if (saveRequestSeqRef.current === requestSeq) {
          setSaveState('idle');
        }
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [draft.body, draft.title, save, selectedNoteId]);

  const handleCreateNote = async () => {
    const record = await save(null, {
      title: '',
      body: '',
    });
    if (record) {
      setSelectedNoteId(record.id);
    }
  };

  const handleDeleteNote = async () => {
    if (!selectedNoteId) {
      return;
    }

    const title = draft.title.trim() || t('untitledNote');
    if (!window.confirm(t('deleteNoteConfirm', { title }))) {
      return;
    }

    await remove(selectedNoteId);
    setSelectedNoteId(null);
  };

  const handleExportMarkdown = () => {
    triggerMarkdownDownload(draft.title, draft.body);
  };

  const openNoteFind = () => {
    if (!selectedNoteId) {
      return;
    }

    setIsFindOpen(true);
    focusFindInput();
  };

  const closeNoteFind = () => {
    setIsFindOpen(false);
    setFindQuery('');
    setFindMatchCount(0);
    setFindMatchIndex(0);
    findMatchesRef.current = [];
    clearNoteFindHighlights();
    editorRef.current?.focus();
  };

  const goToFindMatch = (direction: 1 | -1) => {
    const matchCount = findMatchesRef.current.length;
    if (matchCount === 0) {
      return;
    }

    setFindMatchIndex((current) => (current + direction + matchCount) % matchCount);
  };

  const handleFindInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      goToFindMatch(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeNoteFind();
    }
  };

  const refreshActiveFormats = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) {
      setActiveFormats(INITIAL_ACTIVE_FORMATS);
      return;
    }

    const selectionNode = getSelectionNode(selection);
    if (!selectionNode || !editor.contains(selectionNode)) {
      return;
    }

    setActiveFormats({
      block: findSelectionBlock(editor, selection),
      bold: readCommandState('bold'),
      italic: readCommandState('italic'),
      underline: readCommandState('underline'),
      strikeThrough: readCommandState('strikeThrough'),
      orderedList: selectionHasAncestorTag(editor, 'ol'),
      unorderedList: selectionHasAncestorTag(editor, 'ul'),
    });
  };

  const saveEditorSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedEditorSelectionRef.current = range.cloneRange();
      refreshActiveFormats();
    }
  };

  const restoreEditorSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) {
      return;
    }

    selection.removeAllRanges();
    const savedRange = savedEditorSelectionRef.current;
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      selection.addRange(savedRange);
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);
  };

  const updateDraftBodyFromEditor = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const nextBody = editorToMarkdown(editor);
    lastEditorBodyRef.current = nextBody;
    setDraft((current) => (current.body === nextBody ? current : { ...current, body: nextBody }));
    refreshActiveFormats();
  };

  const runEditorCommand = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    restoreEditorSelection();
    document.execCommand(command, false, value);
    updateDraftBodyFromEditor();
    saveEditorSelection();
  };

  const setEditorBlock = (block: EditorBlock) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    restoreEditorSelection();
    if (block === 'blockquote') {
      document.execCommand('formatBlock', false, activeFormats.block === 'blockquote' ? 'div' : 'blockquote');
    } else if (block === 'pre') {
      document.execCommand('formatBlock', false, activeFormats.block === 'pre' ? 'div' : 'pre');
    } else {
      document.execCommand('formatBlock', false, block);
    }
    updateDraftBodyFromEditor();
    saveEditorSelection();
  };

  const toggleTaskList = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    restoreEditorSelection();
    document.execCommand('insertUnorderedList');
    convertSelectionListToTaskList();
    updateDraftBodyFromEditor();
    saveEditorSelection();
  };

  const handleInsertLink = () => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    editor.focus();
    restoreEditorSelection();
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? '';
    const href = window.prompt('输入链接地址', selectedText.startsWith('http') ? selectedText : 'https://');
    if (!href) {
      return;
    }

    const normalizedHref = normalizeUserLinkHref(href);
    if (selectedText) {
      document.execCommand('createLink', false, normalizedHref);
    } else {
      document.execCommand(
        'insertHTML',
        false,
        `<a href="${escapeHtml(normalizedHref)}" target="_blank" rel="noreferrer">${escapeHtml(href)}</a>`,
      );
    }
    updateDraftBodyFromEditor();
    saveEditorSelection();
  };

  const insertImageAtCursor = (src: string, alt: string) => {
    const editor = editorRef.current;
    if (!editor) {
      const markdown = `![${sanitizeMarkdownImageAlt(alt)}](${src})`;
      setDraft((current) => ({
        ...current,
        body: current.body ? `${current.body}\n\n${markdown}` : markdown,
      }));
      return;
    }

    editor.focus();
    restoreEditorSelection();
    document.execCommand(
      'insertHTML',
      false,
      `<div><img src="${escapeHtml(src)}" alt="${escapeHtml(sanitizeMarkdownImageAlt(alt))}" data-note-image="true"></div><div><br></div>`,
    );
    updateDraftBodyFromEditor();
    saveEditorSelection();
  };

  const insertPlainTextAtCursor = (text: string) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    restoreEditorSelection();
    document.execCommand('insertText', false, text);
    updateDraftBodyFromEditor();
    saveEditorSelection();
  };

  const insertImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      return;
    }

    setInsertImageStatus('loading');
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      insertImageAtCursor(dataUrl, getImageAltText(file));
      setInsertImageStatus('idle');
    } catch {
      setInsertImageStatus('error');
    }
  };

  const handleImageInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      void insertImageFile(file);
    }
  };

  const handlePasteNoteBody = (event: ClipboardEvent<HTMLDivElement>) => {
    const imageFile = Array.from<File>(event.clipboardData.files).find((file) => file.type.startsWith('image/'));
    event.preventDefault();
    if (imageFile) {
      void insertImageFile(imageFile);
      return;
    }

    insertPlainTextAtCursor(event.clipboardData.getData('text/plain'));
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      runEditorCommand('bold');
    } else if (key === 'i') {
      event.preventDefault();
      runEditorCommand('italic');
    } else if (key === 'u') {
      event.preventDefault();
      runEditorCommand('underline');
    } else if (key === 'k') {
      event.preventDefault();
      handleInsertLink();
    } else if (key === 'f') {
      event.preventDefault();
      openNoteFind();
    }
  };

  const handleDropNote = async (targetNoteId: string, position: DropPosition) => {
    if (!draggedNoteId || draggedNoteId === targetNoteId || search.trim()) {
      setDraggedNoteId(null);
      setNoteDropTarget(null);
      return;
    }

    const currentOrder = orderedNotes.map((note) => note.id);
    const nextNoteIds = moveKeyToDropPosition(currentOrder, draggedNoteId, targetNoteId, position);
    setDraggedNoteId(null);
    setNoteDropTarget(null);
    await saveOrderPreferences({
      ...preferences,
      noteIds: nextNoteIds,
    });
  };

  const hasNotes = notes.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-8 md:px-12">
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="shrink-0 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">{t('documentNotesEyebrow')}</p>
            <h1 className="mt-3 text-4xl font-serif font-medium tracking-tight text-stone-900">{t('documentNotes')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-500">{t('documentNotesDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCreateNote()}
            className="inline-flex items-center justify-center space-x-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            <Plus className="h-4 w-4" />
            <span>{t('addNote')}</span>
          </button>
        </div>

        {error && <div className="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>}

        {isLoading ? (
          <div className="mt-8 rounded-[2rem] border border-dashed border-stone-200 bg-white px-6 py-16 text-center text-sm text-stone-400">
            {t('loadingNotes')}
          </div>
        ) : !hasNotes ? (
          <div className="mt-8 rounded-[2rem] border border-dashed border-stone-200 bg-white px-6 py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-stone-300" />
            <p className="mt-4 text-lg font-medium text-stone-700">{t('noNotesYet')}</p>
            <button
              type="button"
              onClick={() => void handleCreateNote()}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-stone-800"
            >
              <Plus className="h-4 w-4" />
              <span>{t('createFirstNote')}</span>
            </button>
          </div>
        ) : (
          <div className="mt-8 grid min-h-0 flex-1 gap-6 xl:grid-cols-[20rem_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm">
              <div className="shrink-0 px-2 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-accent" />
                    <h2 className="text-sm font-semibold text-stone-900">{t('noteIndex')}</h2>
                  </div>
                  <span className="text-xs text-stone-400">{notes.length}</span>
                </div>
                <div className="relative mt-4">
                  <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('searchNotes')}
                    className="w-full rounded-full border border-stone-200 bg-stone-50 px-11 py-2.5 text-sm outline-none transition-colors focus:border-accent"
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1 pr-1">
                {filteredNotes.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-stone-400">{t('noNotesMatch')}</p>
                ) : (
                  filteredNotes.map((note) => {
                    const selected = note.id === selectedNoteId;
                    const title = note.title.trim() || t('untitledNote');
                    const excerpt = getExcerpt(note.body);
                    return (
                      <button
                        key={note.id}
                        type="button"
                        draggable={!search.trim()}
                        onDragStart={(event) => {
                          setDraggedNoteId(note.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', note.id);
                        }}
                        onDragOver={(event) => {
                          if (!search.trim()) {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                            setNoteDropTarget({ id: note.id, position: getDropPosition(event) });
                          }
                        }}
                        onDragLeave={() => {
                          setNoteDropTarget((current) => (current?.id === note.id ? null : current));
                        }}
                        onDragEnd={() => {
                          setDraggedNoteId(null);
                          setNoteDropTarget(null);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          void handleDropNote(note.id, getDropPosition(event));
                        }}
                        onClick={() => setSelectedNoteId(note.id)}
                        className={cn(
                          'relative w-full rounded-[1.25rem] px-4 py-3 text-left transition-colors',
                          selected ? 'bg-stone-900 text-white' : 'bg-stone-50 text-stone-700 hover:bg-stone-100',
                          draggedNoteId === note.id && 'opacity-50',
                        )}
                      >
                        {noteDropTarget?.id === note.id && draggedNoteId !== note.id && (
                          <span
                            className={cn(
                              'pointer-events-none absolute left-4 right-4 z-10 h-0.5 rounded-full bg-accent shadow-sm shadow-accent/30',
                              noteDropTarget.position === 'before' ? '-top-1' : '-bottom-1',
                            )}
                          />
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-semibold">{title}</span>
                          <span className={cn('shrink-0 text-[11px]', selected ? 'text-stone-300' : 'text-stone-400')}>
                            {formatUpdatedAt(note.updatedAt, locale)}
                          </span>
                        </div>
                        <p className={cn('mt-2 line-clamp-2 text-xs leading-5', selected ? 'text-stone-300' : 'text-stone-500')}>
                          {excerpt || t('emptyNotePreview')}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
              <div className="shrink-0 border-b border-stone-100 px-6 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <input
                      value={draft.title}
                      onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                      placeholder={t('noteTitlePlaceholder')}
                      className="w-full bg-transparent text-2xl font-semibold tracking-tight text-stone-900 outline-none placeholder:text-stone-300"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-stone-400">
                      <span>{saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('noteSaved') : t('editingNote')}</span>
                      {selectedNote && <span>{t('lastUpdatedAt', { time: formatUpdatedAt(selectedNote.updatedAt, locale) })}</span>}
                      {insertImageStatus === 'error' && <span className="text-rose-500">{t('insertImageFailed')}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageInputChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={handleExportMarkdown}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
                    >
                      <Download className="h-4 w-4" />
                      <span>{t('exportMarkdown')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteNote()}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{t('delete')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-stone-100 bg-stone-50/80 px-4 py-2">
                  <ToolbarButton label="撤销" onClick={() => runEditorCommand('undo')}>
                    <Undo2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton label="重做" onClick={() => runEditorCommand('redo')}>
                    <Redo2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarDivider />
                  <select
                    aria-label="段落格式"
                    title="段落格式"
                    value={activeFormats.block}
                    onFocus={restoreEditorSelection}
                    onChange={(event) => setEditorBlock(event.target.value as EditorBlock)}
                    className="h-8 rounded-lg border border-stone-200 bg-white px-2 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-accent"
                  >
                    <option value="div">正文</option>
                    <option value="h1">一级标题</option>
                    <option value="h2">二级标题</option>
                    <option value="h3">三级标题</option>
                    <option value="blockquote">引用</option>
                    <option value="pre">代码块</option>
                  </select>
                  <ToolbarDivider />
                  <ToolbarButton active={activeFormats.bold} label="加粗" onClick={() => runEditorCommand('bold')}>
                    <Bold className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton active={activeFormats.italic} label="斜体" onClick={() => runEditorCommand('italic')}>
                    <Italic className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton active={activeFormats.strikeThrough} label="删除线" onClick={() => runEditorCommand('strikeThrough')}>
                    <Strikethrough className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton active={activeFormats.underline} label="下划线" onClick={() => runEditorCommand('underline')}>
                    <Underline className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton active={activeFormats.block === 'pre'} label="代码块" onClick={() => setEditorBlock('pre')}>
                    <Code2 className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton active={activeFormats.block === 'blockquote'} label="引用" onClick={() => setEditorBlock('blockquote')}>
                    <Quote className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarDivider />
                  <ToolbarButton active={activeFormats.unorderedList} label="无序列表" onClick={() => runEditorCommand('insertUnorderedList')}>
                    <List className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton active={activeFormats.orderedList} label="有序列表" onClick={() => runEditorCommand('insertOrderedList')}>
                    <ListOrdered className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton label="待办列表" onClick={toggleTaskList}>
                    <ListChecks className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarDivider />
                  <ToolbarButton label="插入链接" onClick={handleInsertLink}>
                    <Link className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton label={insertImageStatus === 'loading' ? t('insertingImage') : t('insertImage')} onClick={() => fileInputRef.current?.click()}>
                    <FileImage className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton label="查找当前笔记" onClick={openNoteFind}>
                    <Search className="h-4 w-4" />
                  </ToolbarButton>
                  <ToolbarButton label="清除格式" onClick={() => runEditorCommand('removeFormat')}>
                    <Eraser className="h-4 w-4" />
                  </ToolbarButton>
                </div>

                {isFindOpen && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-100 bg-white px-4 py-2">
                    <Search className="h-4 w-4 text-stone-400" />
                    <input
                      ref={findInputRef}
                      type="search"
                      value={findQuery}
                      onChange={(event) => {
                        setFindQuery(event.target.value);
                        setFindMatchIndex(0);
                      }}
                      onKeyDown={handleFindInputKeyDown}
                      placeholder="查找当前笔记"
                      className="h-8 min-w-[12rem] flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm text-stone-700 outline-none transition-colors placeholder:text-stone-300 focus:border-accent focus:bg-white"
                    />
                    <span className="min-w-12 text-center text-xs text-stone-500">
                      {findQuery.trim() ? `${findMatchCount > 0 ? findMatchIndex + 1 : 0}/${findMatchCount}` : '0/0'}
                    </span>
                    <button
                      type="button"
                      aria-label="上一个"
                      title="上一个"
                      disabled={findMatchCount === 0}
                      onClick={() => goToFindMatch(-1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="下一个"
                      title="下一个"
                      disabled={findMatchCount === 0}
                      onClick={() => goToFindMatch(1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="关闭查找"
                      title="关闭查找"
                      onClick={closeNoteFind}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition-colors hover:bg-stone-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                <div
                  aria-multiline="true"
                  className="note-rich-editor min-h-0 flex-1 overflow-y-auto bg-white px-6 py-6 font-sans text-base leading-8 text-stone-700 outline-none"
                  contentEditable
                  data-placeholder={t('noteBodyPlaceholder')}
                  onFocus={saveEditorSelection}
                  onInput={updateDraftBodyFromEditor}
                  onKeyDown={handleEditorKeyDown}
                  onKeyUp={saveEditorSelection}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).matches('input[data-note-checkbox="true"]')) {
                      updateDraftBodyFromEditor();
                    }
                  }}
                  onMouseUp={saveEditorSelection}
                  onPaste={handlePasteNoteBody}
                  ref={editorRef}
                  role="textbox"
                  suppressContentEditableWarning
                  tabIndex={0}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
