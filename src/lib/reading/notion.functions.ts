/**
 * Notion 동기화 서버 함수.
 * Notion 토큰과 게이트웨이 키는 서버에서만 사용되며 클라이언트로 노출되지 않는다.
 */
import { createServerFn } from "@tanstack/react-start";

import {
  NOTION_DATA_SOURCE_ID,
  toNotionLogProperties,
  type NotionLogPayload,
} from "./notion-mapping";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/notion/v1";

export type NotionSyncResult = {
  synced: boolean;
  url?: string | undefined;
  error?: string | undefined;
};

export const syncLogToNotion = createServerFn({ method: "POST" })
  .inputValidator((data: NotionLogPayload) => data)
  .handler(async ({ data }): Promise<NotionSyncResult> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const notionKey = process.env["NOTION_API_KEY"];
    if (!lovableKey || !notionKey) {
      return { synced: false, error: "Notion 연결이 설정되지 않았습니다." };
    }

    try {
      const response = await fetch(`${GATEWAY_URL}/pages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": notionKey,
          "Notion-Version": "2025-09-03",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: NOTION_DATA_SOURCE_ID },
          properties: toNotionLogProperties(data),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`Notion page create failed [${response.status}]: ${body}`);
        return { synced: false, error: `Notion 오류 (${response.status})` };
      }

      const page = (await response.json()) as { url?: string };
      return { synced: true, url: page.url };
    } catch (error) {
      console.error("Notion sync error", error);
      return { synced: false, error: "Notion에 연결하지 못했습니다." };
    }
  });
