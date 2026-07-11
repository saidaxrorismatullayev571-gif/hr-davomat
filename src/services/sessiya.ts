import type { StorageAdapter } from "grammy";
import { supabase } from "../db/index.js";
import type { Json } from "../db/types.js";

/**
 * Bot sessiyasi. grammY session ma'lumoti shu obyektда saqlanadi va
 * Supabase `bot_sessiya` jadvaliga yoziladi (server qayta ishga tushsa yo'qolmaydi).
 */
export interface SessionData {
  /** Davomat oqimida joriy qadam. */
  step?: "lokatsiya" | "video";
  /** Qaysi davomat amali: kelish yoki ketish. */
  davomatFlow?: "keldi" | "ketdi";
  /** Tasdiqlangan lokatsiya (video bosqichiga o'tishda saqlanadi). */
  lat?: number;
  lng?: number;
  masofa?: number;
}

export function initialSession(): SessionData {
  return {};
}

/**
 * grammY uchun Supabase storage adapter.
 * Kalit = telegram_id (string). Butun sessiya `data` (jsonb) ustunida,
 * `step` esa qulaylik uchun alohida ustunda ham saqlanadi.
 */
export function supabaseSessionAdapter(): StorageAdapter<SessionData> {
  return {
    async read(key: string): Promise<SessionData | undefined> {
      const { data, error } = await supabase
        .from("bot_sessiya")
        .select("data")
        .eq("telegram_id", Number(key))
        .maybeSingle();

      if (error) throw error;
      if (!data?.data) return undefined;
      return data.data as SessionData;
    },

    async write(key: string, value: SessionData): Promise<void> {
      const step = typeof value.step === "string" ? value.step : null;
      const { error } = await supabase.from("bot_sessiya").upsert({
        telegram_id: Number(key),
        step,
        data: value as unknown as Json,
      });
      if (error) throw error;
    },

    async delete(key: string): Promise<void> {
      const { error } = await supabase
        .from("bot_sessiya")
        .delete()
        .eq("telegram_id", Number(key));
      if (error) throw error;
    },
  };
}
