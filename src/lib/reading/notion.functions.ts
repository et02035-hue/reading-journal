/**
 * Notion 동기화 서버 함수.
 * Notion 토큰과 게이트웨이 키는 서버에서만 사용되며 클라이언트로 노출되지 않는다.
 */
import { createServerFn } from "@tanstack/react-start";

import type { NotionLogPayload } from "./notion-mapping";

export type NotionSyncResult = {
  synced: boolean;
  pageId?: string | undefined;
  url?: string | undefined;
  error?: string | undefined;
};

export type SyncLogInput = {
  /** Supabase reading_logs.id (있으면 생성된 Notion page id를 저장한다) */
  logId?: string | undefined;
  /** 이미 연결된 Notion page id (있으면 새로 만들지 않고 갱신한다) */
  notionPageId?: string | null | undefined;
  payload: NotionLogPayload;
};

export const syncLogToNotion = createServerFn({ method: "POST" })
  .inputValidator((data: SyncLogInput) => data)
  .handler(async ({ data }): Promise<NotionSyncResult> => {
    const { createNotionLogPage, updateNotionLogPage, saveNotionPageId } = await import(
      "./notion.server"
    );

    try {
      if (data.notionPageId) {
        const page = await updateNotionLogPage(data.notionPageId, data.payload);
        return { synced: true, pageId: data.notionPageId, url: page.url };
      }

      const page = await createNotionLogPage(data.payload);
      if (data.logId && page.id) await saveNotionPageId(data.logId, page.id);
      return { synced: true, pageId: page.id, url: page.url };
    } catch (error) {
      console.error("Notion sync error", error);
      const message =
        error instanceof Error ? error.message : "Notion에 연결하지 못했습니다.";
      return { synced: false, error: message };
    }
  });

export const importLogsFromNotion = createServerFn({ method: "POST" }).handler(async () => {
  const { importNotionLogs } = await import("./notion.server");
  return importNotionLogs();
});
