/**
 * Notion 연동 매핑 레이어.
 *
 * 「책」 정보와 「독서 기록」을 서로 다른 데이터 소스로 관리한다.
 * 앱의 나머지 코드는 Notion 속성 이름을 직접 알지 않는다.
 */

export const NOTION_BOOK_DATA_SOURCE_ID = "113f8e17-2a8d-40eb-b155-0cd93f6c7535";
export const NOTION_LOG_DATA_SOURCE_ID = "2d09a3ce-a236-47f4-847e-904ba03bb2cf";

/** 하위 호환을 위한 이름. 기존 코드가 사용하더라도 독서 기록 DB를 가리킨다. */
export const NOTION_DATA_SOURCE_ID = NOTION_LOG_DATA_SOURCE_ID;

export const NOTION_BOOK_PROPERTIES = {
  title: "책 이름",
  author: "저자",
  publisher: "출판사",
  isbn13: "ISBN13",
  totalPages: "책 전체 페이지",
  genre: "장르",
  cover: "표지",
  yes24Url: "YES24 URL",
} as const;

export const NOTION_LOG_PROPERTIES = {
  title: "기록",
  readDate: "읽은 날짜",
  book: "책",
  startPage: "시작 페이지",
  endPage: "끝 페이지",
  pagesRead: "오늘 읽은 쪽수",
  totalPages: "책 전체 페이지",
  progress: "진행률",
  quote: "인상 깊은 문장",
  thought: "오늘의 생각",
  pageImage: "페이지 사진",
} as const;

export const NOTION_GENRE_OPTIONS = [
  "소설",
  "에세이",
  "인문",
  "과학",
  "자기계발",
  "역사",
  "기타",
] as const;

export type NotionBookPayload = {
  title: string;
  author?: string | null;
  publisher?: string | null;
  isbn13?: string | null;
  totalPages?: number | null;
  genre?: string | null;
  coverUrl?: string | null;
  yes24Url?: string | null;
};

export type NotionLogPayload = {
  bookTitle: string;
  author?: string | null;
  publisher?: string | null;
  isbn13?: string | null;
  genre?: string | null;
  totalPages?: number | null;
  coverUrl?: string | null;
  yes24Url?: string | null;
  readDate: string;
  startPage: number;
  endPage: number;
  pagesRead: number;
  currentPage?: number | null;
  quote?: string | null;
  thought?: string | null;
  photoUrl?: string | null;
};

function richText(value?: string | null) {
  const content = (value ?? "").slice(0, 2000);
  return content ? { rich_text: [{ text: { content } }] } : { rich_text: [] };
}

function normalizeGenre(value?: string | null): string | null {
  const genre = value?.trim();
  if (!genre) return null;
  return (NOTION_GENRE_OPTIONS as readonly string[]).includes(genre) ? genre : "기타";
}

/** 앱의 책 1건 → Notion 책 DB properties */
export function toNotionBookProperties(book: NotionBookPayload) {
  const p = NOTION_BOOK_PROPERTIES;
  const properties: Record<string, unknown> = {
    [p.title]: {
      title: [{ text: { content: book.title.trim().slice(0, 2000) || "제목 없음" } }],
    },
    [p.author]: richText(book.author),
    [p.publisher]: richText(book.publisher),
    [p.isbn13]: richText(book.isbn13),
    [p.totalPages]: {
      number: book.totalPages && book.totalPages > 0 ? book.totalPages : null,
    },
    [p.genre]: {
      multi_select: (() => {
        const genre = normalizeGenre(book.genre);
        return genre ? [{ name: genre }] : [];
      })(),
    },
  };

  if (book.coverUrl) {
    properties[p.cover] = { url: book.coverUrl };
  }

  if (book.yes24Url) {
    properties[p.yes24Url] = { url: book.yes24Url };
  }

  return properties;
}

/** 앱의 독서 기록 1건 → Notion 독서 기록 DB properties */
export function toNotionLogProperties(
  log: NotionLogPayload,
  notionBookPageId: string | null,
  relationProp: string = NOTION_LOG_PROPERTIES.book,
) {
  const p = NOTION_LOG_PROPERTIES;

  const properties: Record<string, unknown> = {
    [p.title]: {
      title: [
        {
          text: {
            content: `${log.readDate} · ${log.bookTitle || "제목 없음"}`.slice(0, 2000),
          },
        },
      ],
    },
    [p.readDate]: { date: { start: log.readDate } },
    [p.startPage]: { number: log.startPage },
    [p.endPage]: { number: log.endPage },
    [p.quote]: richText(log.quote),
    [p.thought]: richText(log.thought),
  };

  if (notionBookPageId) {
    properties[relationProp] = { relation: [{ id: notionBookPageId }] };
  }

  // 아래 값들은 Notion에서 수식/롤업으로 계산되므로 앱에서 직접 쓰지 않는다.
  // - 오늘 읽은 쪽수
  // - 책 전체 페이지
  // - 진행률

  if (log.photoUrl) {
    properties[p.pageImage] = {
      files: [
        {
          name: "페이지 사진",
          type: "external",
          external: { url: log.photoUrl },
        },
      ],
    };
  }

  return properties;
}

type NotionProperty = Record<string, unknown>;

function richTextValue(prop: unknown): string {
  const value = prop as
    | {
        rich_text?: { plain_text?: string; text?: { content?: string } }[];
        title?: { plain_text?: string; text?: { content?: string } }[];
      }
    | undefined;

  const list = Array.isArray(value?.rich_text)
    ? value.rich_text
    : Array.isArray(value?.title)
      ? value.title
      : [];

  return list
    .map((item) => item.plain_text ?? item.text?.content ?? "")
    .join("")
    .trim();
}

function numberOf(prop: unknown): number | null {
  const value = (prop as { number?: number | null } | undefined)?.number;
  return typeof value === "number" ? value : null;
}

function dateOf(prop: unknown): string | null {
  const start = (prop as { date?: { start?: string } | null } | undefined)?.date?.start;
  return start ? start.slice(0, 10) : null;
}

function urlOf(prop: unknown): string | null {
  const value = (prop as { url?: string | null } | undefined)?.url;
  return typeof value === "string" && value ? value : null;
}

function relationIdOf(prop: unknown): string | null {
  const list = (prop as { relation?: { id?: string }[] } | undefined)?.relation;
  const id = Array.isArray(list) ? list[0]?.id : undefined;
  return typeof id === "string" && id ? id : null;
}

function multiSelectFirst(prop: unknown): string | null {
  const list = (prop as { multi_select?: { name?: string }[] } | undefined)?.multi_select;
  return Array.isArray(list) && list[0]?.name ? list[0].name : null;
}

export type NotionBookRecord = {
  pageId: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn13: string | null;
  totalPages: number | null;
  genre: string | null;
  coverUrl: string | null;
  yes24Url: string | null;
};

export type NotionLogRecord = {
  pageId: string;
  bookPageId: string;
  bookTitle: string;
  author: string | null;
  publisher: string | null;
  isbn13: string | null;
  genre: string | null;
  readDate: string;
  startPage: number;
  endPage: number;
  totalPages: number | null;
  coverUrl: string | null;
  yes24Url: string | null;
  quote: string | null;
  thought: string | null;
};

export type NotionPage = { id: string; properties?: NotionProperty };

export function parseNotionBookPage(page: NotionPage): NotionBookRecord | null {
  const p = NOTION_BOOK_PROPERTIES;
  const props = (page.properties ?? {}) as NotionProperty;
  const title = richTextValue(props[p.title]);

  if (!title) return null;

  return {
    pageId: page.id,
    title,
    author: richTextValue(props[p.author]) || null,
    publisher: richTextValue(props[p.publisher]) || null,
    isbn13: richTextValue(props[p.isbn13]) || null,
    totalPages: numberOf(props[p.totalPages]),
    genre: multiSelectFirst(props[p.genre]),
    coverUrl: urlOf(props[p.cover]),
    yes24Url: urlOf(props[p.yes24Url]),
  };
}

/** 필수 값(날짜·책 관계·시작/끝 페이지)이 없으면 null */
export function parseNotionLogPage(
  page: NotionPage,
  relationProp: string = NOTION_LOG_PROPERTIES.book,
): NotionLogRecord | null {
  const p = NOTION_LOG_PROPERTIES;
  const props = (page.properties ?? {}) as NotionProperty;

  const readDate = dateOf(props[p.readDate]);
  const bookPageId = relationIdOf(props[relationProp]);
  const startPage = numberOf(props[p.startPage]);
  const endPage = numberOf(props[p.endPage]);

  if (!readDate || !bookPageId || startPage === null || endPage === null) return null;
  if (endPage < startPage) return null;

  return {
    pageId: page.id,
    bookPageId,
    bookTitle: "",
    author: null,
    publisher: null,
    isbn13: null,
    genre: null,
    readDate,
    startPage,
    endPage,
    totalPages: null,
    coverUrl: null,
    yes24Url: null,
    quote: richTextValue(props[p.quote]) || null,
    thought: richTextValue(props[p.thought]) || null,
  };
}
