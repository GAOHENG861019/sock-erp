import { createClient } from "@supabase/supabase-js";

// Supabase 配置 - 可通过环境变量覆盖
const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) ||
  "https://naocybheyicuilbvjpbw.supabase.co";

const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string) ||
  "sb_publishable_Os7rBHTmi4zJiUudIwFSeA_uG-uN-YE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export const SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  enabled: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
};
