/**
 * Notion 「읽는 하루 — 독서 기록」 DB 연동용 매핑 레이어.
 *
 * 앱은 이 파일 밖에서 Notion 속성 이름을 전혀 알지 못한다.
 * Notion DB 구조가 바뀌면 이 파일만 고치면 된다.
 */

/** 실제 Notion 데이터 소스 ID (「읽는 하루 — 독서 기록」) */
export const NOTION_DATA_SOURCE_ID = "2d09a3ce-a236-47f4-847e-904ba03bb2cf";

/** Notion DB의 속성 이름 (한국어 필드명) */
export const NOTION_LOG_PROPERTIES = {
  title: "기록",
  readDate: "읽은 날짜",
  bookName: "책 이름",
  author: "저자",
  startPage: "시작 페이지",
  endPage: "끝 페이지",
  pagesRead: "오늘 읽은 쪽수",
  totalPages: "책 전체 페이지",
  progress: "진행률",
  quote: "인상 깊은 문장",
  thought: "오늘의 생각",
  pageImage: "페이지 사진",
  genre: "장르",
  completed: "완독",
} as const;

/** Notion 장르(multi_select)에 존재하는 옵션 */
export const NOTION_GENRE_OPTIONS = [
  "소설",
  "에세이",
  "인문",
  "과학",
  "자기계발",
  "역사",
  "기타",
] as const;

/** 한 건의 독서 기록을 Notion에 보낼 때 필요한 값 (저장소 구현과 무관한 순수 형태) */
export type NotionLogPayload = {
  bookTitle: string;
  author?: string | null;
  genre?: string | null;
  readDate: string;
  startPage: number;
  endPage: number;
  pagesRead: number;
  totalPages?: number | null;
  currentPage?: number | null;
  completed?: boolean;
  quote?: string | null;
  thought?: string | null;
  /** 공개적으로 접근 가능한 사진 URL (서명 URL 등) */
  photoUrl?: string | null;
};

function richText(value?: string | null) {
  const content = (value ?? "").slice(0, 2000);
  return content ? { rich_text: [{ text: { content } }] } : { rich_text: [] };
}

/** 앱의 기록 1건 → Notion 페이지 properties */
export function toNotionLogProperties(log: NotionLogPayload) {
  const p = NOTION_LOG_PROPERTIES;
  const total = log.totalPages ?? 0;
  const current = log.currentPage ?? log.endPage;
  const progress = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const genre = log.genre?.trim();
  const genreOption = genre
    ? (NOTION_GENRE_OPTIONS as readonly string[]).includes(genre)
      ? genre
      : "기타"
    : null;

  const properties: Record<string, unknown> = {
    [p.title]: {
      title: [{ text: { content: `${log.readDate} · ${log.bookTitle || "제목 없음"}` } }],
    },
    [p.readDate]: { date: { start: log.readDate } },
    [p.bookName]: richText(log.bookTitle),
    [p.author]: richText(log.author),
    [p.startPage]: { number: log.startPage },
    [p.endPage]: { number: log.endPage },
    [p.pagesRead]: { number: log.pagesRead },
    [p.totalPages]: { number: total > 0 ? total : null },
    [p.progress]: { number: progress },
    [p.quote]: richText(log.quote),
    [p.thought]: richText(log.thought),
    [p.completed]: { checkbox: Boolean(log.completed) },
    [p.genre]: { multi_select: genreOption ? [{ name: genreOption }] : [] },
  };

  // 사진이 없을 때는 Notion의 기존 사진을 지우지 않도록 속성 자체를 생략한다.
  if (log.photoUrl) {
    properties[p.pageImage] = {
      files: [{ name: "페이지 사진", type: "external", external: { url: log.photoUrl } }],
    };
  }

  return properties;
}

/* ------------------------------------------------------------------ *
 * Notion → 앱 방향 파싱
 * ------------------------------------------------------------------ */

type NotionProperty = Record<string, unknown>;

function plainText(prop: unknown): string {
  const list = (prop as { rich_text?: { plain_text?: string }[] } | undefined)?.rich_text;
  if (!Array.isArray(list)) return "";
  return list.map((t) => t.plain_text ?? "").join("").trim();
}

function numberOf(prop: unknown): number | null {
  const value = (prop as { number?: number | null } | undefined)?.number;
  return typeof value === "number" ? value : null;
}

function dateOf(prop: unknown): string | null {
  const start = (prop as { date?: { start?: string } | null } | undefined)?.date?.start;
  return start ? start.slice(0, 10) : null;
}

function checkboxOf(prop: unknown): boolean | null {
  const value = (prop as { checkbox?: boolean } | undefined)?.checkbox;
  return typeof value === "boolean" ? value : null;
}

function multiSelectFirst(prop: unknown): string | null {
  const list = (prop as { multi_select?: { name?: string }[] } | undefined)?.multi_select;
  return Array.isArray(list) && list[0]?.name ? list[0].name : null;
}

/** Notion 페이지 1건을 앱 도메인 값으로 변환한 결과 */
export type NotionLogRecord = {
  pageId: string;
  bookTitle: string;
  author: string | null;
  genre: string | null;
  readDate: string;
  startPage: number;
  endPage: number;
  totalPages: number | null;
  completed: boolean | null;
  quote: string | null;
  thought: string | null;
};

export type NotionPage = { id: string; properties?: NotionProperty };

/** 필수 값(날짜·책 이름·시작/끝 페이지)이 없으면 null을 돌려준다. */
export function parseNotionLogPage(page: NotionPage): NotionLogRecord | null {
  const p = NOTION_LOG_PROPERTIES;
  const props = (page.properties ?? {}) as NotionProperty;

  const readDate = dateOf(props[p.readDate]);
  const bookTitle = plainText(props[p.bookName]);
  const startPage = numberOf(props[p.startPage]);
  const endPage = numberOf(props[p.endPage]);

  if (!readDate || !bookTitle || startPage === null || endPage === null) return null;
  if (endPage < startPage) return null;

  const author = plainText(props[p.author]);
  const quote = plainText(props[p.quote]);
  const thought = plainText(props[p.thought]);

  return {
    pageId: page.id,
    bookTitle,
    author: author || null,
    genre: multiSelectFirst(props[p.genre]),
    readDate,
    startPage,
    endPage,
    totalPages: numberOf(props[p.totalPages]),
    completed: checkboxOf(props[p.completed]),
    quote: quote || null,
    thought: thought || null,
  };
}

