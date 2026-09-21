/**
 * Notion 「읽는 하루 — 독서 기록」 DB 연동용 매핑 레이어.
 *
 * 앱은 이 파일 밖에서 Notion 속성 이름을 전혀 알지 못한다.
 * Notion DB 구조가 바뀌면 이 파일만 고치면 된다.
 */

/** 실제 Notion 데이터 소스 ID (「읽는 하루 — 독서 기록」) */
export const NOTION_DATA_SOURCE_ID = "91ea4d8b-094b-8253-a568-07d37ba5382f";

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

  properties[p.pageImage] = {
    files: log.photoUrl
      ? [{ name: "페이지 사진", type: "external", external: { url: log.photoUrl } }]
      : [],
  };

  return properties;
}
