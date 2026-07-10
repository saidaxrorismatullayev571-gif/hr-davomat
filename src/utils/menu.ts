import { Keyboard } from "grammy";

/** Davomat tugmalari (barcha rollar uchun) — TZ 5.3. */
export const TUGMA = {
  keldi: "🟢 Keldim",
  tushlikka: "🍽 Tushlikka",
  tushlikdan: "↩️ Tushlikdan keldim",
  ketdi: "🔴 Ketdim",
  // Rahbar
  hisobot: "📊 Hisobotlar",
  xodimlar: "👥 Xodimlar",
  // Super admin
  admin: "⚙️ Super admin",
} as const;

export interface MenuAccess {
  /** Rahbar tugmalari (hisobot, xodim boshqaruvi). */
  rahbar: boolean;
  /** Super admin tugmasi (to'liq access). */
  superAdmin: boolean;
}

/**
 * Access darajasiga mos menyu. Har kim faqat o'z tugmalarini ko'radi (TZ 1.4).
 *  - Barcha xodim → davomat tugmalari.
 *  - Rahbar/super admin → + hisobot, xodimlar.
 *  - Super admin → + super admin paneli.
 */
export function menuForAccess(access: MenuAccess): Keyboard {
  const kb = new Keyboard()
    .text(TUGMA.keldi)
    .text(TUGMA.ketdi)
    .row()
    .text(TUGMA.tushlikka)
    .text(TUGMA.tushlikdan)
    .row();

  if (access.rahbar || access.superAdmin) {
    kb.text(TUGMA.hisobot).text(TUGMA.xodimlar).row();
  }

  if (access.superAdmin) {
    kb.text(TUGMA.admin).row();
  }

  return kb.resized().persistent();
}
