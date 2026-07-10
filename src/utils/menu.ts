import { Keyboard } from "grammy";
import { rahbarmi } from "../services/xodim.js";

/** Davomat tugmalari (barcha rollar uchun) — TZ 5.3. */
export const TUGMA = {
  keldi: "🟢 Keldim",
  tushlikka: "🍽 Tushlikka",
  tushlikdan: "↩️ Tushlikdan keldim",
  ketdi: "🔴 Ketdim",
  // Rahbar
  hisobot: "📊 Hisobotlar",
  xodimlar: "👥 Xodimlar",
} as const;

/**
 * Rolга mos menyu. Har kim faqat o'z tugmalarini ko'radi (TZ 1.4).
 * Sotuvchi/Marketolog/Test → faqat davomat.
 * Nazoratchi/Director → davomat + rahbar tugmalari.
 */
export function menuForRole(rol: string): Keyboard {
  const kb = new Keyboard()
    .text(TUGMA.keldi)
    .text(TUGMA.ketdi)
    .row()
    .text(TUGMA.tushlikka)
    .text(TUGMA.tushlikdan)
    .row();

  if (rahbarmi(rol)) {
    kb.text(TUGMA.hisobot).text(TUGMA.xodimlar).row();
  }

  return kb.resized().persistent();
}
