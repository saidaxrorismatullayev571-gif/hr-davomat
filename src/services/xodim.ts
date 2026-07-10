import { supabase } from "../db/index.js";
import { SUPER_ADMIN_IDS } from "../config/index.js";
import type { Tables } from "../db/types.js";

export type Xodim = Tables<"xodimlar">;

/** Rollar — schema check constraint bilan bir xil. */
export type Rol = "Sotuvchi" | "Nazoratchi" | "Marketolog" | "Director" | "Test";

export const ROLLAR: readonly Rol[] = [
  "Sotuvchi",
  "Nazoratchi",
  "Marketolog",
  "Director",
  "Test",
];

/** Rahbar huquqiga ega rollar (hisobot, xodim boshqaruvi, tasdiqlash). */
export function rahbarmi(rol: string): boolean {
  return rol === "Nazoratchi" || rol === "Director";
}

/** Super admin — to'liq access (barcha rollardan yuqori). */
export function superAdminmi(telegramId: number): boolean {
  return SUPER_ADMIN_IDS.includes(telegramId);
}

/** Xodim rahbar ko'rinishini (hisobot/boshqaruv) ko'ra oladimi? */
export function rahbarAccessmi(xodim: Pick<Xodim, "telegram_id" | "rol">): boolean {
  return superAdminmi(xodim.telegram_id) || rahbarmi(xodim.rol);
}

/**
 * Telegram ID bo'yicha faol (arxivlanmagan) xodimni topadi.
 * Topilmasa null qaytaradi.
 */
export async function xodimByTelegramId(telegramId: number): Promise<Xodim | null> {
  const { data, error } = await supabase
    .from("xodimlar")
    .select("*")
    .eq("telegram_id", telegramId)
    .eq("arxiv", false)
    .maybeSingle();

  if (error) throw error;
  return data;
}
