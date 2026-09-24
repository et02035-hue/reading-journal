/**
 * 앱 데이터용 브라우저 DB 클라이언트.
 * 배포 빌드에 VITE_SUPABASE_* 값이 주입되지 않아도 동작하도록 공개(publishable) 값으로 대체한다.
 * (publishable 키는 공개용이라 코드에 있어도 안전하다. service-role 키는 절대 쓰지 않는다.)
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const PUBLIC_SUPABASE_URL = "https://izzfqgytbouqrklcqivy.supabase.co";
export const PUBLIC_SUPABASE_KEY = "sb_publishable_dYsJaw5GxtBqTLJTGWzwEg_xL_XTg8X";

function make() {
  const url = (import.meta.env["VITE_SUPABASE_URL"] as string | undefined) || PUBLIC_SUPABASE_URL;
  const key =
    (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) || PUBLIC_SUPABASE_KEY;
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

let _db: ReturnType<typeof make> | undefined;
export const supabase = new Proxy({} as ReturnType<typeof make>, {
  get(_, prop) {
    if (!_db) _db = make();
    const v = Reflect.get(_db, prop, _db);
    return typeof v === "function" ? v.bind(_db) : v;
  },
});
