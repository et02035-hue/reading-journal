/**
 * 저장소 접근 레이어 (Lovable Cloud / PostgreSQL).
 * UI는 이 파일의 함수만 사용하고, 쿼리 세부사항은 여기 안에 가둔다.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Book,
  NewBookInput,
  NewReadingLogInput,
  ReadingLog,
  ReadingLogWithBook,
} from "./types";

const PHOTO_BUCKET = "page-photos";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function listBooks(): Promise<Book[]> {
  return unwrap(
    await supabase
      .from("books")
      .select("*")
      .order("completed", { ascending: true })
      .order("updated_at", { ascending: false }),
  ) as Book[];
}

export async function createBook(input: NewBookInput): Promise<Book> {
  const title = input.title.trim();
  if (!title) throw new Error("책 제목을 입력해 주세요.");
  return unwrap(
    await supabase
      .from("books")
      .insert({
        title,
        author: input.author?.trim() || null,
        total_pages: input.total_pages && input.total_pages > 0 ? input.total_pages : 0,
        genre: input.genre?.trim() || null,
      })
      .select("*")
      .single(),
  ) as Book;
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await supabase.from("books").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const LOG_SELECT = "*, book:books(id, title, author)";

export async function listLogs(limit?: number): Promise<ReadingLogWithBook[]> {
  let query = supabase
    .from("reading_logs")
    .select(LOG_SELECT)
    .order("read_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (limit) query = query.limit(limit);
  return unwrap(await query) as unknown as ReadingLogWithBook[];
}

export async function createLog(input: NewReadingLogInput): Promise<ReadingLog> {
  if (!input.book_id) throw new Error("책을 선택해 주세요.");
  if (input.end_page < input.start_page) {
    throw new Error("끝 페이지는 시작 페이지보다 크거나 같아야 해요.");
  }
  return unwrap(
    await supabase
      .from("reading_logs")
      .insert({
        book_id: input.book_id,
        read_date: input.read_date,
        start_page: input.start_page,
        end_page: input.end_page,
        quote: input.quote?.trim() || null,
        thought: input.thought?.trim() || null,
        page_image_url: input.page_image_url || null,
      })
      .select("*")
      .single(),
  ) as ReadingLog;
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from("reading_logs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** 사진 업로드 → 저장 경로 반환 (page_image_url 컬럼에 경로를 보관) */
export async function uploadPagePhoto(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** 저장 경로 → 조회 가능한 서명 URL */
export async function getPhotoUrl(path: string): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function getPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (p) => [p, await getPhotoUrl(p)] as const),
  );
  return Object.fromEntries(entries.filter(([, url]) => !!url) as [string, string][]);
}

export type MonthlyStats = {
  pages: number;
  days: number;
  completedBooks: number;
  logCount: number;
};

export async function getMonthlyStats(reference = new Date()): Promise<MonthlyStats> {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const logs = unwrap(
    await supabase
      .from("reading_logs")
      .select("read_date, pages_read")
      .gte("read_date", iso(start))
      .lte("read_date", iso(end)),
  ) as { read_date: string; pages_read: number }[];

  const books = unwrap(
    await supabase.from("books").select("id").eq("completed", true),
  ) as { id: string }[];

  return {
    pages: logs.reduce((sum, l) => sum + (l.pages_read ?? 0), 0),
    days: new Set(logs.map((l) => l.read_date)).size,
    completedBooks: books.length,
    logCount: logs.length,
  };
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getTodayPages(): Promise<number> {
  const logs = unwrap(
    await supabase.from("reading_logs").select("pages_read").eq("read_date", todayISO()),
  ) as { pages_read: number }[];
  return logs.reduce((sum, l) => sum + (l.pages_read ?? 0), 0);
}
