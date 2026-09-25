import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Images, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { countUnsyncedLogs, deleteLog, getPhotoUrls } from "@/lib/reading/api";
import { syncPendingLogsToNotion } from "@/lib/reading/notion.functions";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatKoreanDate } from "@/lib/reading/format";
import { logsQuery } from "@/lib/reading/queries";
import type { ReadingLogWithBook } from "@/lib/reading/types";

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [
      { title: "기록 모아보기 — 읽는 하루" },
      { name: "description", content: "날짜별 독서 기록과 페이지 사진을 모아봅니다." },
      { property: "og:title", content: "기록 모아보기 — 읽는 하루" },
      {
        property: "og:description",
        content: "날짜별 독서 기록과 페이지 사진을 모아봅니다.",
      },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const logs = useQuery(logsQuery());
  const queryClient = useQueryClient();

  const paths = (logs.data ?? [])
    .map((l) => l.page_image_url)
    .filter((p): p is string => !!p);

  const photos = useQuery({
    queryKey: ["photo-urls", paths.join(",")],
    queryFn: () => getPhotoUrls(paths),
    enabled: paths.length > 0,
  });

  const remove = useMutation({
    mutationFn: deleteLog,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("기록을 삭제했어요.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unsynced = useQuery({ queryKey: ["unsynced-count"], queryFn: countUnsyncedLogs });
  const syncPending = useServerFn(syncPendingLogsToNotion);
  const [failures, setFailures] = useState<{ label: string; error?: string | undefined }[]>([]);
  const sendPending = useMutation({
    mutationFn: () => syncPending(),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries();
      const failed = r.results.filter((x) => !x.ok);
      setFailures(failed.map((x) => ({ label: x.label, error: x.error })));
      if (failed.length === 0) toast.success(`Notion에 ${r.synced}건을 보냈어요.`);
      else toast.error(`성공 ${r.synced}건 · 실패 ${failed.length}건. 다시 시도할 수 있어요.`);
    },
    onError: (e: Error) => toast.error(`Notion에 보내지 못했어요: ${e.message}`),
  });

  const grouped = groupByDate(logs.data ?? []);

  return (
    <AppShell title="기록 모아보기" subtitle="날짜별로 쌓인 나의 독서">
      {(unsynced.data ?? 0) > 0 || failures.length > 0 ? (
        <div className="card-soft mb-6 px-5 py-4">
          <p className="text-sm font-semibold">
            Notion에 아직 보내지 않은 기록 {unsynced.data ?? 0}건
          </p>
          <button
            type="button"
            disabled={sendPending.isPending || (unsynced.data ?? 0) === 0}
            onClick={() => sendPending.mutate()}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <UploadCloud className="size-4" />
            {sendPending.isPending ? "보내는 중…" : "Notion에 보내기"}
          </button>
          {failures.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-destructive">
              {failures.map((f, i) => (
                <li key={i}>
                  {f.label}: {f.error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {logs.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<Images className="size-8" strokeWidth={1.5} />}
          title="모아볼 기록이 아직 없어요"
          description="첫 기록을 남기면 이곳에 날짜별로 정리돼요."
          action={
            <Link
              to="/record"
              className="mt-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              기록하기
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([date, items]) => (
            <section key={date}>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-secondary-foreground">
                  {formatKoreanDate(date)}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {items.reduce((s, i) => s + i.pages_read, 0)}쪽
                </span>
              </div>
              <ul className="space-y-3">
                {items.map((log) => (
                  <li key={log.id} className="card-soft overflow-hidden">
                    {log.page_image_url && photos.data?.[log.page_image_url] ? (
                      <img
                        src={photos.data[log.page_image_url]}
                        alt={`${log.book?.title ?? "책"} 페이지 사진`}
                        loading="lazy"
                        className="max-h-72 w-full object-cover"
                      />
                    ) : null}
                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-reading text-base font-semibold">
                            {log.book?.title ?? "삭제된 책"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {log.start_page}–{log.end_page}p · {log.pages_read}쪽
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="기록 삭제"
                          onClick={() => {
                            if (confirm("이 기록을 삭제할까요?")) remove.mutate(log.id);
                          }}
                          className="shrink-0 rounded-full p-2 text-muted-foreground active:bg-secondary"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      {log.quote ? (
                        <p className="mt-3 border-l-2 border-primary/40 pl-3 font-reading text-sm leading-relaxed">
                          “{log.quote}”
                        </p>
                      ) : null}
                      {log.thought ? (
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                          {log.thought}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function groupByDate(logs: ReadingLogWithBook[]): [string, ReadingLogWithBook[]][] {
  const map = new Map<string, ReadingLogWithBook[]>();
  for (const log of logs) {
    const list = map.get(log.read_date) ?? [];
    list.push(log);
    map.set(log.read_date, list);
  }
  return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
}
