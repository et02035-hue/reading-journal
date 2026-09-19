import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BookMarked, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { deleteBook } from "@/lib/reading/api";
import { booksQuery } from "@/lib/reading/queries";
import { progressOf } from "@/lib/reading/types";

export const Route = createFileRoute("/books")({
  head: () => ({
    meta: [
      { title: "내 책 — 읽는 하루" },
      { name: "description", content: "읽고 있는 책의 진행률과 완독 여부를 확인하세요." },
      { property: "og:title", content: "내 책 — 읽는 하루" },
      {
        property: "og:description",
        content: "읽고 있는 책의 진행률과 완독 여부를 확인하세요.",
      },
    ],
  }),
  component: BooksPage,
});

function BooksPage() {
  const books = useQuery(booksQuery());
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: deleteBook,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("책을 삭제했어요.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="내 책" subtitle="책장에 담긴 책들">
      {books.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (books.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<BookMarked className="size-8" strokeWidth={1.5} />}
          title="책장이 비어 있어요"
          description="기록하기 화면에서 첫 책을 추가할 수 있어요."
          action={
            <Link
              to="/record"
              className="mt-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              책 추가하러 가기
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {books.data!.map((book) => {
            const percent = progressOf(book);
            return (
              <li key={book.id} className="card-soft px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-reading text-base font-semibold">
                      {book.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {book.author || "저자 미상"}
                      {book.genre ? ` · ${book.genre}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="책 삭제"
                    onClick={() => {
                      if (confirm(`「${book.title}」과 관련 기록을 모두 삭제할까요?`)) {
                        remove.mutate(book.id);
                      }
                    }}
                    className="shrink-0 rounded-full p-2 text-muted-foreground active:bg-secondary"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-4">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {book.current_page} / {book.total_pages > 0 ? book.total_pages : "?"} 쪽
                    </span>
                    {book.completed ? (
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <CheckCircle2 className="size-3.5" /> 완독
                      </span>
                    ) : (
                      <span>{percent}%</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
