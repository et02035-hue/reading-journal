/**
 * Notion 연동 서버 전용 레이어.
 * 게이트웨이 호출과 Supabase 쓰기는 모두 여기에서만 일어난다.
 * (이 파일은 클라이언트 번들에 포함되지 않는다.)
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import {
  NOTION_DATA_SOURCE_ID,
  parseNotionLogPage,
  toNotionLogProperties,
  type NotionLogPayload,
  type NotionLogRecord,
  type NotionPage,
} from "./notion-mapping";
import { bookMatchKey, logMatchKey } from "./sync-matching";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/notion/v1";

function notionHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const notionKey = process.env["NOTION_API_KEY"];
  if (!lovableKey || !notionKey) return null;
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": notionKey,
    "Notion-Version": "2025-09-03",
    "Content-Type": "application/json",
  };
}

async function notionRequest<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const headers = notionHeaders();
  if (!headers) throw new Error("Notion 연결이 설정되지 않았습니다.");

  const response = await fetch(`${GATEWAY_URL}${path}`, {
    method: init.method,
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`Notion ${init.method} ${path} failed [${response.status}]: ${body}`);
    throw new Error(`Notion 오류 (${response.status})`);
  }

  return (await response.json()) as T;
}

/** 새 Notion 페이지 생성 */
export async function createNotionLogPage(payload: NotionLogPayload) {
  return notionRequest<{ id: string; url?: string }>("/pages", {
    method: "POST",
    body: {
      parent: { type: "data_source_id", data_source_id: NOTION_DATA_SOURCE_ID },
      properties: toNotionLogProperties(payload),
    },
  });
}

/** 기존 Notion 페이지 갱신 */
export async function updateNotionLogPage(pageId: string, payload: NotionLogPayload) {
  return notionRequest<{ id: string; url?: string }>(`/pages/${pageId}`, {
    method: "PATCH",
    body: { properties: toNotionLogProperties(payload) },
  });
}

/** 데이터 소스의 모든 기록 페이지를 읽어 앱 도메인 값으로 변환 */
export async function listNotionLogRecords(): Promise<{
  records: NotionLogRecord[];
  skipped: number;
}> {
  const records: NotionLogRecord[] = [];
  let skipped = 0;
  let cursor: string | undefined;

  do {
    const page = await notionRequest<{
      results: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    }>(`/data_sources/${NOTION_DATA_SOURCE_ID}/query`, {
      method: "POST",
      body: cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 },
    });

    for (const raw of page.results ?? []) {
      const parsed = parseNotionLogPage(raw);
      if (parsed) records.push(parsed);
      else skipped += 1;
    }

    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
  } while (cursor);

  return { records, skipped };
}

/* ------------------------------------------------------------------ *
 * Supabase (서버측, RLS는 anon 정책 그대로 적용)
 * ------------------------------------------------------------------ */

function serverSupabase() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("데이터베이스 설정을 찾지 못했어요.");

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

/** 기록에 연결된 Notion 페이지 ID 저장 */
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

/** Notion → Supabase 가져오기. 실패한 건은 건너뛰고 나머지는 그대로 유지한다. */
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

  const booksRes = await supabase.from("books").select("*");
  if (booksRes.error) throw new Error("책 목록을 불러오지 못했어요.");
  const logsRes = await supabase.from("reading_logs").select("*");
  if (logsRes.error) throw new Error("독서 기록을 불러오지 못했어요.");

  const books: BookRow[] = booksRes.data ?? [];
  const logs: LogRow[] = logsRes.data ?? [];

  const bookById = new Map(books.map((b) => [b.id, b]));
  const bookByKey = new Map<string, BookRow>();
  for (const b of books) {
    bookByKey.set(bookMatchKey(b.title, b.author), b);
    if (!bookByKey.has(bookMatchKey(b.title, null))) {
      bookByKey.set(bookMatchKey(b.title, null), b);
    }
  }

  const logByPageId = new Map<string, LogRow>();
  const logByMatchKey = new Map<string, LogRow>();
  for (const l of logs) {
    if (l.notion_page_id) logByPageId.set(l.notion_page_id, l);
    const book = bookById.get(l.book_id);
    const key = logMatchKey({
      readDate: l.read_date,
      bookTitle: book?.title ?? "",
      startPage: l.start_page,
      endPage: l.end_page,
    });
    if (!logByMatchKey.has(key)) logByMatchKey.set(key, l);
  }

  async function resolveBook(record: NotionLogRecord): Promise<BookRow> {
    const existing =
      bookByKey.get(bookMatchKey(record.bookTitle, record.author)) ??
      bookByKey.get(bookMatchKey(record.bookTitle, null));
    if (existing) {
      // Notion이 알려준 부가 정보만 보완한다 (기존 값은 덮어쓰지 않음).
      const patch: Partial<BookRow> = {};
      if (!existing.author && record.author) patch.author = record.author;
      if (!existing.genre && record.genre) patch.genre = record.genre;
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
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "책을 만들지 못했어요.");

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
        // 이미 다른 Notion 페이지와 연결된 동일 기록 → 중복 생성하지 않는다.
        summary.skipped += 1;
        continue;
      }

      const book = await resolveBook(record);
      const { data, error } = await supabase
        .from("reading_logs")
        .insert({ ...fields, book_id: book.id, notion_page_id: record.pageId })
        .select("*")
        .single();
      if (error || !data) throw new Error(error?.message ?? "기록을 만들지 못했어요.");

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

/** Notion 완독 체크가 켜져 있으면 책에 반영 (계산값과 모순되지 않는 범위에서) */
async function applyCompleted(
  supabase: ReturnType<typeof serverSupabase>,
  book: BookRow | undefined,
  record: NotionLogRecord,
) {
  if (!book || record.completed !== true || book.completed) return;
  await supabase.from("books").update({ completed: true }).eq("id", book.id);
}
