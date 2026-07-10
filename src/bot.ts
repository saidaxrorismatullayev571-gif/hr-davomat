import { Bot, Context, session, type SessionFlavor } from "grammy";
import { config } from "./config/index.js";
import {
  supabaseSessionAdapter,
  initialSession,
  type SessionData,
} from "./services/sessiya.js";
import { handleStart } from "./handlers/start.js";
import { DAVOMAT_HANDLERLAR } from "./handlers/davomat.js";
import { TUGMA } from "./utils/menu.js";

export type BotContext = Context & SessionFlavor<SessionData>;

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  // ── 5.1 FAQAT SHAXSIY CHAT ────────────────────────────────
  // Guruh / superguruh / forum ichidagi xabarlarга UMUMAN javob berilmaydi.
  // Guruhга faqat davomat xulosalari dastur tomonidan yuboriladi.
  bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private") return;
    await next();
  });

  // ── Sessiya (Supabase bot_sessiya jadvalida) ──────────────
  bot.use(
    session({
      initial: initialSession,
      storage: supabaseSessionAdapter(),
      getSessionKey: (ctx) => ctx.from?.id.toString(),
    }),
  );

  // ── /start — rol aniqlash + rol menyu ─────────────────────
  bot.command("start", handleStart);

  // ── Davomat tugmalari ─────────────────────────────────────
  for (const [matn, handler] of DAVOMAT_HANDLERLAR) {
    bot.hears(matn, handler);
  }

  // ── Rahbar tugmalari (SKELET — FAZA 2 da to'ldiriladi) ────
  bot.hears(TUGMA.hisobot, async (ctx) => {
    await ctx.reply("📊 Hisobotlar — FAZA 2 da qo'shiladi.");
  });
  bot.hears(TUGMA.xodimlar, async (ctx) => {
    await ctx.reply("👥 Xodim boshqaruvi — FAZA 1 keyingi bosqichда qo'shiladi.");
  });

  // ── Boshqa har qanday xabar ───────────────────────────────
  bot.on("message", async (ctx) => {
    await ctx.reply("Menyudan tugmani tanlang yoki /start bosing.");
  });

  // ── Global xato ushlash ───────────────────────────────────
  bot.catch((err) => {
    console.error("Bot xatosi:", err.error);
  });

  return bot;
}
