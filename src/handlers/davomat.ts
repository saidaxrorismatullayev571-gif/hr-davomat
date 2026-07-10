import type { BotContext } from "../bot.js";
import { xodimByTelegramId } from "../services/xodim.js";
import { TUGMA } from "../utils/menu.js";

/**
 * Davomat tugmalari uchun vaqtinchalik ishlov beruvchi (SKELET).
 *
 * TODO (FAZA 1 keyingi bosqich): to'liq oqim —
 *   1. Lokatsiya so'rash (ofis 40.385907, 71.786778, radius 100 m)
 *   2. Forward / 90 s+ eski lokatsiya → rad
 *   3. Dumaloq video (video_note) so'rash — majburiy isbot
 *   4. davomat jadvaliga yozish (imed_sof_min avtomatik hisoblanadi)
 */
export async function handleKeldi(ctx: BotContext): Promise<void> {
  await talabTekshirVaJavob(
    ctx,
    "🟢 Keldi qayd etish — keyingi bosqichда lokatsiya + dumaloq video so'raladi.",
  );
}

export async function handleTushlikka(ctx: BotContext): Promise<void> {
  await talabTekshirVaJavob(
    ctx,
    "🍽 Tushlik (12:00–14:00) — keyingi bosqichда yoqiladi.",
  );
}

export async function handleTushlikdan(ctx: BotContext): Promise<void> {
  await talabTekshirVaJavob(
    ctx,
    "↩️ Tushlikдан qaytish — keyingi bosqichда yoqiladi.",
  );
}

export async function handleKetdi(ctx: BotContext): Promise<void> {
  await talabTekshirVaJavob(
    ctx,
    "🔴 Ketdi qayd etish — keyingi bosqichда lokatsiya + dumaloq video so'raladi.",
  );
}

/** Faqat ro'yxatdagi xodim davomat qila oladi. */
async function talabTekshirVaJavob(ctx: BotContext, xabar: string): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const xodim = await xodimByTelegramId(tgId);
  if (!xodim) {
    await ctx.reply("Siz ro'yxatда yo'qsiz. Rahbarga murojaat qiling.");
    return;
  }

  await ctx.reply(xabar);
}

/** Tugma matni → handler. bot.ts shu asosda hears() ulaydi. */
export const DAVOMAT_HANDLERLAR: ReadonlyArray<readonly [string, (ctx: BotContext) => Promise<void>]> = [
  [TUGMA.keldi, handleKeldi],
  [TUGMA.tushlikka, handleTushlikka],
  [TUGMA.tushlikdan, handleTushlikdan],
  [TUGMA.ketdi, handleKetdi],
];
