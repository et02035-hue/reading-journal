import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { PhotoPicker } from "@/components/PhotoPicker";
import {
  createBook,
  createLog,
  getPhotoUrl,
  todayISO,
  uploadPagePhoto,
} from "@/lib/reading/api";
import { syncLogToNotion } from "@/lib/reading/notion.functions";
import { booksQuery } from "@/lib/reading/queries";

export const Route = createFileRoute("/record")({
  head: () => ({
    meta: [
      { title: "기록하기 — 읽는 하루" },
      {
        name: "description",
        content: "책 페이지 사진과 읽은 쪽수, 인상 깊은 문장을 남겨보세요.",
      },
      { property: "og:title", content: "기록하기 — 읽는 하루" },
      {
        property: "og:description",
        content: "책 페이지 사진과 읽은 쪽수, 인상 깊은 문장을 남겨보세요.",
      },
    ],
  }),
  component: RecordPage,
});

const fieldClass =
  "w-full rounded-2xl border border-input bg-card px-4 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring";
type FieldErrors = {
  book?: string;
  date?: string;
  startPage?: string;
  endPage?: string;
};

const labelClass = "mb-2 block text-sm font-semibold text-secondary-foreground";

function RecordPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const books = useQuery(booksQuery());

  const [bookId, setBookId] = useState("");
  const [readDate, setReadDate] = useState(todayISO());
  const [startPage, setStartPage] = useState("");
  const [endPage, setEndPage] = useState("");
  const [quote, setQuote] = useState("");
  const [thought, setThought] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showNewBook, setShowNewBook] = useState(false);

  const syncNotion = useServerFn(syncLogToNotion);

  const saveMutation = useMutation({
    mutationFn: async () => {
      let path: string | null = null;
      if (photo) path = await uploadPagePhoto(photo);
      const log = await createLog({
        book_id: bookId,
        read_date: readDate,
        start_page: Number(startPage),
        end_page: Number(endPage),
        quote,
        thought,
        page_image_url: path,
      });

      const book = books.data?.find((b) => b.id === bookId);
      const photoUrl = path ? await getPhotoUrl(path) : null;
      const total = book?.total_pages ?? 0;
      const notion = await syncNotion({
        data: {
          bookTitle: book?.title ?? "",
          author: book?.author ?? null,
          genre: book?.genre ?? null,
          readDate,
          startPage: log.start_page,
          endPage: log.end_page,
          pagesRead: log.pages_read,
          totalPages: total,
          currentPage: Math.max(book?.current_page ?? 0, log.end_page),
          completed: total > 0 && Math.max(book?.current_page ?? 0, log.end_page) >= total,
          quote: log.quote,
          thought: log.thought,
          photoUrl,
        },
      }).catch(() => ({ synced: false, error: "Notion 동기화에 실패했어요." }));

      return notion;
    },
    onSuccess: async (notion) => {
      await queryClient.invalidateQueries();
      toast.success("오늘의 기록을 저장했어요.");
      if (!notion.synced) {
        toast.error(`${notion.error ?? "Notion 동기화에 실패했어요."} 기록은 앱에 저장됐어요.`);
      }
      navigate({ to: "/" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedBook = books.data?.find((b) => b.id === bookId);

  function validate() {
    const next: FieldErrors = {};
    if (!bookId) next.book = "책을 선택해 주세요.";
    if (!readDate) next.date = "날짜를 선택해 주세요.";
    const s = Number(startPage);
    const e = Number(endPage);
    if (!startPage || Number.isNaN(s) || s < 1) next.startPage = "시작 페이지를 입력해 주세요.";
    if (!endPage || Number.isNaN(e) || e < 1) next.endPage = "끝 페이지를 입력해 주세요.";
    if (!next.startPage && !next.endPage && e < s) {
      next.endPage = "끝 페이지는 시작 페이지보다 크거나 같아야 해요.";
    }
    if (
      !next.endPage &&
      selectedBook &&
      selectedBook.total_pages > 0 &&
      e > selectedBook.total_pages
    ) {
      next.endPage = `이 책은 전체 ${selectedBook.total_pages}쪽이에요.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const pagesRead =
    startPage && endPage && Number(endPage) >= Number(startPage)
      ? Number(endPage) - Number(startPage) + 1
      : null;

  return (
    <AppShell title="기록하기" subtitle="오늘 읽은 한 페이지를 남겨요">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (validate()) saveMutation.mutate();
        }}
      >
        <section>
          <span className={labelClass}>페이지 사진</span>
          <PhotoPicker file={photo} onChange={setPhoto} />
        </section>

        <section>
          <label className={labelClass} htmlFor="book">
            책
          </label>
          {books.isLoading ? (
            <div className="h-12 animate-pulse rounded-2xl bg-muted" />
          ) : (books.data?.length ?? 0) === 0 ? (
            <p className="mb-3 rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              아직 등록된 책이 없어요. 아래에서 먼저 책을 추가해 주세요.
            </p>
          ) : (
            <select
              id="book"
              className={fieldClass}
              value={bookId}
              onChange={(e) => setBookId(e.target.value)}
            >
              <option value="">책을 선택하세요</option>
              {books.data!.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                  {b.author ? ` · ${b.author}` : ""}
                </option>
              ))}
            </select>
          )}
          {errors.book ? (
            <p className="mt-2 text-sm text-destructive">{errors.book}</p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowNewBook((v) => !v)}
            className="mt-3 flex items-center gap-2 text-sm font-medium text-primary"
          >
            <Plus className="size-4" /> 새 책 추가
          </button>

          {showNewBook ? (
            <NewBookForm
              onCreated={(book) => {
                setBookId(book.id);
                setShowNewBook(false);
                setErrors((p) => ({ ...p, book: "" }));
              }}
            />
          ) : null}
        </section>

        <section>
          <label className={labelClass} htmlFor="date">
            읽은 날짜
          </label>
          <input
            id="date"
            type="date"
            className={fieldClass}
            value={readDate}
            onChange={(e) => setReadDate(e.target.value)}
          />
          {errors.date ? (
            <p className="mt-2 text-sm text-destructive">{errors.date}</p>
          ) : null}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="start">
              시작 페이지
            </label>
            <input
              id="start"
              type="number"
              inputMode="numeric"
              min={1}
              className={fieldClass}
              value={startPage}
              placeholder="1"
              onChange={(e) => setStartPage(e.target.value)}
            />
            {errors.startPage ? (
              <p className="mt-2 text-sm text-destructive">{errors.startPage}</p>
            ) : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="end">
              끝 페이지
            </label>
            <input
              id="end"
              type="number"
              inputMode="numeric"
              min={1}
              className={fieldClass}
              value={endPage}
              placeholder="20"
              onChange={(e) => setEndPage(e.target.value)}
            />
            {errors.endPage ? (
              <p className="mt-2 text-sm text-destructive">{errors.endPage}</p>
            ) : null}
          </div>
        </section>

        {pagesRead ? (
          <p className="rounded-2xl bg-accent px-4 py-3 text-sm text-accent-foreground">
            오늘 {pagesRead}쪽을 읽었어요.
          </p>
        ) : null}

        <section>
          <label className={labelClass} htmlFor="quote">
            인상 깊은 문장
          </label>
          <textarea
            id="quote"
            rows={3}
            className={`${fieldClass} font-reading leading-relaxed`}
            value={quote}
            placeholder="마음에 남은 문장을 적어보세요"
            onChange={(e) => setQuote(e.target.value)}
          />
        </section>

        <section>
          <label className={labelClass} htmlFor="thought">
            오늘의 생각
          </label>
          <textarea
            id="thought"
            rows={4}
            className={`${fieldClass} leading-relaxed`}
            value={thought}
            placeholder="읽으면서 떠오른 생각을 남겨요"
            onChange={(e) => setThought(e.target.value)}
          />
        </section>

        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saveMutation.isPending ? <Loader2 className="size-5 animate-spin" /> : null}
          저장하기
        </button>
      </form>
    </AppShell>
  );
}

function NewBookForm({ onCreated }: { onCreated: (book: { id: string }) => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [genre, setGenre] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createBook({
        title,
        author,
        total_pages: totalPages ? Number(totalPages) : 0,
        genre,
      }),
    onSuccess: async (book) => {
      await queryClient.invalidateQueries({ queryKey: ["books"] });
      toast.success("책을 추가했어요.");
      onCreated(book);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="card-soft mt-4 space-y-3 p-4">
      <input
        className={fieldClass}
        placeholder="책 제목 (필수)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className={fieldClass}
        placeholder="저자"
        value={author}
        onChange={(e) => setAuthor(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          className={fieldClass}
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="전체 페이지"
          value={totalPages}
          onChange={(e) => setTotalPages(e.target.value)}
        />
        <input
          className={fieldClass}
          placeholder="장르"
          value={genre}
          onChange={(e) => setGenre(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => {
          if (!title.trim()) {
            setError("책 제목을 입력해 주세요.");
            return;
          }
          setError("");
          mutation.mutate();
        }}
        className="min-h-[48px] w-full rounded-2xl bg-secondary text-sm font-semibold text-secondary-foreground disabled:opacity-60"
      >
        책 추가하기
      </button>
    </div>
  );
}
