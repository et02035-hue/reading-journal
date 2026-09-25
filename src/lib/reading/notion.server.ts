/**
 * Notion 연동 서버 전용 레이어.
 *
 * Notion REST API를 직접 호출하며 Lovable Gateway/키에는 의존하지 않는다.
 * 게이트웨이 호출과 Supabase 쓰기는 모두 이 파일에서 처리한다.
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import {
  NOTION_BOOK_DATA_SOURCE_ID,
  NOTION_BOOK_PROPERTIES,
  NOTION_GENRE_OPTIONS,
  NOTION_LOG_DATA_SOURCE_ID,
  NOTION_LOG_PROPERTIES,
  parseNotionBookPage,
  parseNotionLogPage,
  toNotionBookProperties,
  toNotionLogProperties,
  type NotionBookPayload,
  type NotionBookRecord,
  type NotionLogPayload,
  type NotionLogRecord,
  type NotionPage,
} from "./notion-mapping";
import { bookMatchKey, logMatchKey } from "./sync-matching";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_GATEWAY_URL = "https://connector-gateway.lovable.dev/notion/v1";

type NotionTransport = {
  baseUrl: string;
  headers: Record<string, string>;
};

function notionTransport(): NotionTransport | null {
  // 별도의 직접 연동 토큰이 있으면 Notion REST API를 바로 사용한다.
  const directKey =
    process.env["NOTION_API_TOKEN"] ||
    process.env["NOTION_DIRECT_TOKEN"];

  if (directKey) {
    return {
      baseUrl: NOTION_API_URL,
      headers: {
        Authorization: "Bearer " + directKey,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
    };
  }

  // 기존 배포 환경이 Lovable Gateway용 키만 갖고 있어도 동작하도록 호환한다.
  // 이 경우 실제 Notion 토큰은 X-Connection-Api-Key로 전달된다.
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey =
    process.env["NOTION_API_KEY"] ||
    process.env["NOTION_TOKEN"] ||
    process.env["NOTION_INTEGRATION_TOKEN"];

  if (lovableKey && connectionKey) {
    return {
      baseUrl: NOTION_GATEWAY_URL,
      headers: {
        Authorization: "Bearer " + lovableKey,
        "X-Connection-Api-Key": connectionKey,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
    };
  }

  // 일반 Node/서버 배포에서 NOTION_API_KEY만 직접 넣은 경우도 지원한다.
  if (connectionKey) {
    return {
      baseUrl: NOTION_API_URL,
      headers: {
        Authorization: "Bearer " + connectionKey,
        "Notion-Version": "2025-09-03",
        "Content-Type": "application/json",
      },
    };
  }

  return null;
}

async function notionRequest<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const transport = notionTransport();
  if (!transport) {
    throw new Error(
      "Notion 연동 키가 없습니다. 배포 환경에 NOTION_API_TOKEN(직접 연동) 또는 기존 Notion 연결 키를 설정해 주세요.",
    );
  }

  const response = await fetch(transport.baseUrl + path, {
    method: init.method,
    headers: transport.headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Notion " + init.method + " " + path + " failed [" + response.status + "]: " + body);

    let detail = "";
    try {
      const parsed = JSON.parse(body) as { message?: string };
      detail = parsed.message ? ": " + parsed.message : "";
    } catch {
      // Notion이 JSON이 아닌 오류를 반환하면 상태 코드만 노출한다.
    }

    throw new Error("Notion 오류 (" + response.status + ")" + detail);
  }

  return (await response.json()) as T;
}

async function queryDataSource(
  dataSourceId: string,
): Promise<{ results: NotionPage[]; skipped: number }> {
  const results: NotionPage[] = [];
  let skipped = 0;
  let cursor: string | undefined;

  do {
    const page = await notionRequest<{
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>("/data_sources/" + dataSourceId + "/query", {
      method: "POST",
      body: cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 },
    });

    for (const item of page.results ?? []) {
      if (item?.id) results.push(item);
      else skipped += 1;
    }

    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return { results, skipped };
}


/* ------------------------------------------------------------------ *
 * 책 DB 연결 대상 확인
 *
 * 설정된 책 DB가 Lovable Notion 연결에 공유되지 않았으면(404),
 * 연결이 접근 가능한 「읽는 하루 — 책(앱)」 DB를 찾거나 만들고
 * 독서 기록 DB에 그 책 DB를 가리키는 관계 속성을 추가한다.
 * ------------------------------------------------------------------ */

const FALLBACK_BOOK_DB_TITLE = "읽는 하루 — 책(앱)";
const FALLBACK_RELATION_PROP = "책(앱)";

type BookSetup = { bookDataSourceId: string; relationProp: string };
let cachedSetup: BookSetup | null = null;

function isNotFound(error: unknown) {
  return error instanceof Error && error.message.includes("(404)");
}

async function findFallbackBookDataSource(): Promise<string | null> {
  const res = await notionRequest<{
    results?: { id: string; title?: { plain_text?: string }[] }[];
  }>("/search", {
    method: "POST",
    body: {
      query: FALLBACK_BOOK_DB_TITLE,
      filter: { property: "object", value: "data_source" },
      page_size: 20,
    },
  });
  const hit = (res.results ?? []).find(
    (ds) => (ds.title ?? []).map((t) => t.plain_text ?? "").join("").trim() === FALLBACK_BOOK_DB_TITLE,
  );
  return hit?.id ?? null;
}

async function createFallbackBookDataSource(): Promise<string> {
  const genreOptions = NOTION_GENRE_OPTIONS.map((name) => ({ name }));
  const db = await notionRequest<{ data_sources?: { id: string }[] }>("/databases", {
    method: "POST",
    body: {
      parent: { type: "workspace", workspace: true },
      title: [{ text: { content: FALLBACK_BOOK_DB_TITLE } }],
      initial_data_source: {
        properties: {
          [NOTION_BOOK_PROPERTIES.title]: { title: {} },
          [NOTION_BOOK_PROPERTIES.author]: { rich_text: {} },
          [NOTION_BOOK_PROPERTIES.publisher]: { rich_text: {} },
          [NOTION_BOOK_PROPERTIES.isbn13]: { rich_text: {} },
          [NOTION_BOOK_PROPERTIES.totalPages]: { number: { format: "number" } },
          [NOTION_BOOK_PROPERTIES.genre]: { multi_select: { options: genreOptions } },
          [NOTION_BOOK_PROPERTIES.cover]: { url: {} },
          [NOTION_BOOK_PROPERTIES.yes24Url]: { url: {} },
        },
      },
    },
  });
  const id = db.data_sources?.[0]?.id;
  if (!id) throw new Error("Notion 책 DB를 만들지 못했습니다.");
  return id;
}

async function ensureRelationProperty(bookDataSourceId: string) {
  const logDs = await notionRequest<{
    properties?: Record<string, { type?: string; relation?: { data_source_id?: string } }>;
  }>("/data_sources/" + NOTION_LOG_DATA_SOURCE_ID, { method: "GET" });
  const existing = logDs.properties?.[FALLBACK_RELATION_PROP];
  if (existing?.type === "relation" && existing.relation?.data_source_id === bookDataSourceId) return;

  await notionRequest("/data_sources/" + NOTION_LOG_DATA_SOURCE_ID, {
    method: "PATCH",
    body: {
      properties: {
        [FALLBACK_RELATION_PROP]: {
          relation: { data_source_id: bookDataSourceId, single_property: {} },
        },
      },
    },
  });
}

async function getBookSetup(): Promise<BookSetup> {
  if (cachedSetup) return cachedSetup;

  try {
    await notionRequest("/data_sources/" + NOTION_BOOK_DATA_SOURCE_ID, { method: "GET" });
    cachedSetup = { bookDataSourceId: NOTION_BOOK_DATA_SOURCE_ID, relationProp: NOTION_LOG_PROPERTIES.book };
    return cachedSetup;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const bookDataSourceId =
    (await findFallbackBookDataSource()) ?? (await createFallbackBookDataSource());
  await ensureRelationProperty(bookDataSourceId);
  cachedSetup = { bookDataSourceId, relationProp: FALLBACK_RELATION_PROP };
  return cachedSetup;
}

/* ------------------------------------------------------------------ *
 * Notion 책 DB
 * ------------------------------------------------------------------ */

export async function listNotionBookRecords(): Promise<{
  records: NotionBookRecord[];
  skipped: number;
}> {
  const { bookDataSourceId } = await getBookSetup();
  const { results, skipped: initialSkipped } = await queryDataSource(bookDataSourceId);

  const records: NotionBookRecord[] = [];
  let skipped = initialSkipped;

  for (const raw of results) {
    const parsed = parseNotionBookPage(raw);
    if (parsed) records.push(parsed);
    else skipped += 1;
  }

  return { records, skipped };
}

async function createNotionBookPage(payload: NotionBookPayload) {
  const { bookDataSourceId } = await getBookSetup();
  return notionRequest<{ id: string; url?: string }>("/pages", {
    method: "POST",
    body: {
      parent: { type: "data_source_id", data_source_id: bookDataSourceId },
      properties: toNotionBookProperties(payload),
    },
  });
}

async function updateNotionBookPage(pageId: string, payload: NotionBookPayload) {
  return notionRequest<{ id: string; url?: string }>("/pages/" + pageId, {
    method: "PATCH",
    body: { properties: toNotionBookProperties(payload) },
  });
}

function bookPayloadFromLog(payload: NotionLogPayload): NotionBookPayload {
  return {
    title: payload.bookTitle,
    author: payload.author ?? null,
    publisher: payload.publisher ?? null,
    isbn13: payload.isbn13 ?? null,
    totalPages: payload.totalPages ?? null,
    genre: payload.genre ?? null,
    coverUrl: payload.coverUrl ?? null,
    yes24Url: payload.yes24Url ?? null,
  };
}

/**
 * 같은 ISBN13 또는 제목+저자가 있는 기존 책을 재사용한다.
 * 기존 책의 비어 있는 정보는 앱에서 알고 있는 값으로 보완한다.
 */
async function resolveNotionBook(payload: NotionLogPayload) {
  const { records } = await listNotionBookRecords();
  const normalizedIsbn = payload.isbn13?.trim() || "";

  const existing =
    (normalizedIsbn
      ? records.find((book) => book.isbn13?.trim() === normalizedIsbn)
      : undefined) ??
    records.find(
      (book) =>
        bookMatchKey(book.title, book.author) ===
        bookMatchKey(payload.bookTitle, payload.author),
    ) ??
    records.find(
      (book) =>
        bookMatchKey(book.title, null) === bookMatchKey(payload.bookTitle, null),
    );

  if (!existing) {
    return createNotionBookPage(bookPayloadFromLog(payload));
  }

  const incoming = bookPayloadFromLog(payload);
  const shouldFill =
    (!existing.author && incoming.author) ||
    (!existing.publisher && incoming.publisher) ||
    (!existing.isbn13 && incoming.isbn13) ||
    ((!existing.totalPages || existing.totalPages <= 0) &&
      incoming.totalPages &&
      incoming.totalPages > 0) ||
    (!existing.genre && incoming.genre) ||
    (!existing.coverUrl && incoming.coverUrl) ||
    (!existing.yes24Url && incoming.yes24Url);

  if (!shouldFill) return { id: existing.pageId, url: undefined };

  return updateNotionBookPage(existing.pageId, {
    title: existing.title,
    author: existing.author || incoming.author,
    publisher: existing.publisher || incoming.publisher,
    isbn13: existing.isbn13 || incoming.isbn13,
    totalPages:
      existing.totalPages && existing.totalPages > 0
        ? existing.totalPages
        : incoming.totalPages,
    genre: existing.genre || incoming.genre,
    coverUrl: existing.coverUrl || incoming.coverUrl,
    yes24Url: existing.yes24Url || incoming.yes24Url,
  });
}

/* ------------------------------------------------------------------ *
 * Notion 독서 기록 DB
 * ------------------------------------------------------------------ */

/** 새 Notion 독서 기록 페이지 생성 */
export async function createNotionLogPage(payload: NotionLogPayload) {
  const bookPage = await resolveNotionBook(payload);
  const { relationProp } = await getBookSetup();

  return notionRequest<{ id: string; url?: string }>("/pages", {
    method: "POST",
    body: {
      parent: { type: "data_source_id", data_source_id: NOTION_LOG_DATA_SOURCE_ID },
      properties: toNotionLogProperties(payload, bookPage.id, relationProp),
    },
  });
}

/** 기존 Notion 독서 기록 페이지 갱신 */
export async function updateNotionLogPage(
  pageId: string,
  payload: NotionLogPayload,
) {
  const bookPage = await resolveNotionBook(payload);
  const { relationProp } = await getBookSetup();

  return notionRequest<{ id: string; url?: string }>("/pages/" + pageId, {
    method: "PATCH",
    body: { properties: toNotionLogProperties(payload, bookPage.id, relationProp) },
  });
}

/** Notion 독서 기록 DB의 모든 페이지를 앱 도메인 값으로 변환 */
export async function listNotionLogRecords(): Promise<{
  records: NotionLogRecord[];
  skipped: number;
}> {
  const { relationProp } = await getBookSetup();
  const [{ records: books, skipped: bookSkipped }, logQuery] = await Promise.all([
    listNotionBookRecords(),
    queryDataSource(NOTION_LOG_DATA_SOURCE_ID),
  ]);

  const bookByPageId = new Map(books.map((book) => [book.pageId, book]));
  const records: NotionLogRecord[] = [];
  let skipped = bookSkipped + logQuery.skipped;

  for (const raw of logQuery.results) {
    const parsed = parseNotionLogPage(raw, relationProp);
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const book = bookByPageId.get(parsed.bookPageId);
    if (!book) {
      skipped += 1;
      continue;
    }

    records.push({
      ...parsed,
      bookTitle: book.title,
      author: book.author,
      publisher: book.publisher,
      isbn13: book.isbn13,
      genre: book.genre,
      totalPages: book.totalPages,
      coverUrl: book.coverUrl,
      yes24Url: book.yes24Url,
    });
  }

  return { records, skipped };
}

/* ------------------------------------------------------------------ *
 * Supabase (서버측)
 * ------------------------------------------------------------------ */

function serverSupabase() {
  const url = process.env["SUPABASE_URL"] || "https://izzfqgytbouqrklcqivy.supabase.co";
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_ANON_KEY"] ||
    "sb_publishable_dYsJaw5GxtBqTLJTGWzwEg_xL_XTg8X";

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (
          key.startsWith("sb_") &&
          headers.get("Authorization") === "Bearer " + key
        ) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export async function saveNotionPageId(logId: string, pageId: string) {
  const supabase = serverSupabase();
  const { error } = await supabase
    .from("reading_logs")
    .update({ notion_page_id: pageId })
    .eq("id", logId);

  if (error) console.error("notion_page_id 저장 실패", error.message);
}

export type ImportSummary = {
  created: number;
  updated: number;
  matched: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type BookRow = Database["public"]["Tables"]["books"]["Row"];
type LogRow = Database["public"]["Tables"]["reading_logs"]["Row"];

/** Notion → Supabase 가져오기 */
export async function importNotionLogs(): Promise<ImportSummary> {
  const supabase = serverSupabase();
  const summary: ImportSummary = {
    created: 0,
    updated: 0,
    matched: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const { records, skipped } = await listNotionLogRecords();
  summary.skipped = skipped;

  const [booksRes, logsRes] = await Promise.all([
    supabase.from("books").select("*"),
    supabase.from("reading_logs").select("*"),
  ]);

  if (booksRes.error) throw new Error("책 목록을 불러오지 못했어요.");
  if (logsRes.error) throw new Error("독서 기록을 불러오지 못했어요.");

  const books: BookRow[] = booksRes.data ?? [];
  const logs: LogRow[] = logsRes.data ?? [];

  const bookById = new Map(books.map((b) => [b.id, b] as const));
  const bookByKey = new Map<string, BookRow>();

  for (const book of books) {
    bookByKey.set(bookMatchKey(book.title, book.author), book);
    if (!bookByKey.has(bookMatchKey(book.title, null))) {
      bookByKey.set(bookMatchKey(book.title, null), book);
    }
  }

  const logByPageId = new Map<string, LogRow>();
  const logByMatchKey = new Map<string, LogRow>();

  for (const log of logs) {
    if (log.notion_page_id) logByPageId.set(log.notion_page_id, log);

    const book = bookById.get(log.book_id);
    const key = logMatchKey({
      readDate: log.read_date,
      bookTitle: book?.title ?? "",
      startPage: log.start_page,
      endPage: log.end_page,
    });

    if (!logByMatchKey.has(key)) logByMatchKey.set(key, log);
  }

  async function resolveBook(record: NotionLogRecord): Promise<BookRow> {
    const existing =
      bookByKey.get(bookMatchKey(record.bookTitle, record.author)) ??
      bookByKey.get(bookMatchKey(record.bookTitle, null));

    if (existing) {
      const patch: Partial<BookRow> = {};

      if (!existing.author && record.author) patch.author = record.author;
      if (!existing.publisher && record.publisher) patch.publisher = record.publisher;
      if (!existing.isbn13 && record.isbn13) patch.isbn13 = record.isbn13;
      if (!existing.genre && record.genre) patch.genre = record.genre;
      if (!existing.cover_image && record.coverUrl) patch.cover_image = record.coverUrl;
      if (!existing.yes24_url && record.yes24Url) patch.yes24_url = record.yes24Url;
      if (existing.total_pages <= 0 && record.totalPages && record.totalPages > 0) {
        patch.total_pages = record.totalPages;
      }

      if (Object.keys(patch).length > 0) {
        const { data } = await supabase
          .from("books")
          .update(patch)
          .eq("id", existing.id)
          .select("*")
          .single();

        if (data) {
          bookById.set(data.id, data);
          bookByKey.set(bookMatchKey(data.title, data.author), data);
          return data;
        }
      }

      return existing;
    }

    const { data, error } = await supabase
      .from("books")
      .insert({
        title: record.bookTitle,
        author: record.author,
        genre: record.genre,
        total_pages: record.totalPages && record.totalPages > 0 ? record.totalPages : 0,
        cover_image: record.coverUrl,
        publisher: record.publisher,
        isbn13: record.isbn13,
        yes24_url: record.yes24Url,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "책을 만들지 못했어요.");
    }

    bookById.set(data.id, data);
    bookByKey.set(bookMatchKey(data.title, data.author), data);
    bookByKey.set(bookMatchKey(data.title, null), data);
    return data;
  }

  for (const record of records) {
    try {
      const linked = logByPageId.get(record.pageId);

      const fields = {
        read_date: record.readDate,
        start_page: record.startPage,
        end_page: record.endPage,
        quote: record.quote,
        thought: record.thought,
      };

      if (linked) {
        const { error } = await supabase
          .from("reading_logs")
          .update(fields)
          .eq("id", linked.id);

        if (error) throw new Error(error.message);

        summary.updated += 1;
        await applyCompleted(supabase, bookById.get(linked.book_id), record);
        continue;
      }

      const key = logMatchKey({
        readDate: record.readDate,
        bookTitle: record.bookTitle,
        startPage: record.startPage,
        endPage: record.endPage,
      });
      const candidate = logByMatchKey.get(key);

      if (candidate && !candidate.notion_page_id) {
        const { error } = await supabase
          .from("reading_logs")
          .update({ ...fields, notion_page_id: record.pageId })
          .eq("id", candidate.id);

        if (error) throw new Error(error.message);

        logByPageId.set(record.pageId, candidate);
        summary.matched += 1;
        await applyCompleted(supabase, bookById.get(candidate.book_id), record);
        continue;
      }

      if (candidate) {
        summary.skipped += 1;
        continue;
      }

      const book = await resolveBook(record);
      const { data, error } = await supabase
        .from("reading_logs")
        .insert({
          ...fields,
          book_id: book.id,
          notion_page_id: record.pageId,
        })
        .select("*")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "기록을 만들지 못했어요.");
      }

      logByPageId.set(record.pageId, data);
      logByMatchKey.set(key, data);
      summary.created += 1;
      await applyCompleted(supabase, book, record);
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      if (summary.errors.length < 3) summary.errors.push(message);
      console.error("Notion import item failed", record.pageId, message);
    }
  }

  return summary;
}

async function applyCompleted(
  supabase: ReturnType<typeof serverSupabase>,
  book: BookRow | undefined,
  record: NotionLogRecord,
) {
  if (!book || book.completed) return;
  if (!book.total_pages || book.total_pages <= 0 || record.endPage < book.total_pages) return;

  await supabase.from("books").update({ completed: true }).eq("id", book.id);
}

/* ------------------------------------------------------------------ *
 * 미동기화 기록 일괄 전송 (앱 → Notion)
 * ------------------------------------------------------------------ */

export type PendingSyncItem = {
  logId: string;
  label: string;
  ok: boolean;
  pageId?: string | undefined;
  error?: string | undefined;
};

export type PendingSyncSummary = {
  total: number;
  synced: number;
  failed: number;
  results: PendingSyncItem[];
};

/** notion_page_id가 비어 있는 기록만 Notion에 새로 만들고 page id를 저장한다. */
export async function syncPendingLogs(): Promise<PendingSyncSummary> {
  const supabase = serverSupabase();
  const { data, error } = await supabase
    .from("reading_logs")
    .select(
      "id, read_date, start_page, end_page, pages_read, quote, thought, page_image_url, book:books(title, author, publisher, isbn13, genre, total_pages, current_page, cover_image, yes24_url)",
    )
    .is("notion_page_id", null)
    .order("read_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("동기화할 기록을 불러오지 못했어요: " + error.message);

  const results: PendingSyncItem[] = [];
  for (const log of data ?? []) {
    const book = (log as unknown as { book: Record<string, unknown> | null }).book;
    const title = (book?.["title"] as string | undefined) ?? "";
    const label = `${log.read_date} · ${title || "책 없음"} ${log.start_page}–${log.end_page}p`;
    try {
      if (!book) throw new Error("연결된 책이 없어요.");

      // 직전에 다른 요청이 연결했는지 다시 확인 (중복 페이지 방지)
      const { data: fresh } = await supabase
        .from("reading_logs")
        .select("notion_page_id")
        .eq("id", log.id)
        .maybeSingle();
      if (fresh?.notion_page_id) {
        results.push({ logId: log.id, label, ok: true, pageId: fresh.notion_page_id });
        continue;
      }

      let photoUrl: string | null = null;
      const path = log.page_image_url;
      if (path) {
        if (path.startsWith("http")) photoUrl = path;
        else {
          const signed = await supabase.storage
            .from("page-photos")
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          photoUrl = signed.data?.signedUrl ?? null;
        }
      }

      const payload: NotionLogPayload = {
        bookTitle: title,
        author: book["author"] as string | null,
        publisher: book["publisher"] as string | null,
        isbn13: book["isbn13"] as string | null,
        genre: book["genre"] as string | null,
        totalPages: book["total_pages"] as number | null,
        coverUrl: book["cover_image"] as string | null,
        yes24Url: book["yes24_url"] as string | null,
        readDate: log.read_date,
        startPage: log.start_page,
        endPage: log.end_page,
        pagesRead: log.pages_read ?? Math.max(0, log.end_page - log.start_page + 1),
        currentPage: book["current_page"] as number | null,
        quote: log.quote,
        thought: log.thought,
        photoUrl,
      };

      const page = await createNotionLogPage(payload);
      const { error: saveError } = await supabase
        .from("reading_logs")
        .update({ notion_page_id: page.id })
        .eq("id", log.id)
        .is("notion_page_id", null);
      if (saveError) {
        throw new Error(
          `Notion 페이지는 만들었지만 연결 저장에 실패했어요 (${page.id}): ${saveError.message}`,
        );
      }
      results.push({ logId: log.id, label, ok: true, pageId: page.id });
    } catch (e) {
      console.error("pending Notion sync failed", log.id, e);
      results.push({
        logId: log.id,
        label,
        ok: false,
        error: e instanceof Error ? e.message : "Notion에 보내지 못했어요.",
      });
    }
  }

  const synced = results.filter((r) => r.ok).length;
  return { total: results.length, synced, failed: results.length - synced, results };
}
