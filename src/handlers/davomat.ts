import { Keyboard } from "grammy";
import type { BotContext } from "../bot.js";
import { xodimByTelegramId, superAdminmi, rahbarmi, type Xodim } from "../services/xodim.js";
import {
  bugungiDavomat,
  keldiYoz,
  ketdiYoz,
  tushlikkaYoz,
  qaytdiYoz,
} from "../services/davomat.js";
import { davomatXulosa } from "../services/xabar.js";
import { ofisdaMi } from "../utils/lokatsiya.js";
import { OFIS } from "../config/index.js";
import { soatMatn, kunMinutlari } from "../utils/vaqt.js";
import { menuForAccess } from "../utils/menu.js";

// ── Yordamchilar ──────────────────────────────────────────

/** Ro'yxatdagi xodimni qaytaradi; bo'lmasa xabar berib null. */
async function talabXodim(ctx: BotContext): Promise<Xodim | null> {
  const tgId = ctx.from?.id;
  if (!tgId) return null;
  const xodim = await xodimByTelegramId(tgId);
  if (!xodim) {
    await ctx.reply("Siz ro'yxatда yo'qsiz. Rahbarga murojaat qiling.");
    return null;
  }
  return xodim;
}

/** Xabar forward qilinganmi (anti-forward himoyasi). */
function forwardMi(ctx: BotContext): boolean {
  const msg = ctx.message as { forward_origin?: unknown; forward_date?: number } | undefined;
  return Boolean(msg?.forward_origin ?? msg?.forward_date);
}

/** Sessiyani tozalaydi (oqim tugadi/bekor). */
function tozala(ctx: BotContext): void {
  ctx.session.step = undefined;
  ctx.session.davomatFlow = undefined;
  ctx.session.lat = undefined;
  ctx.session.lng = undefined;
  ctx.session.masofa = undefined;
}

/** Lokatsiya so'rash klaviaturasi. */
function lokatsiyaKlaviatura(): Keyboard {
  return new Keyboard()
    .requestLocation("📍 Lokatsiyani yuborish")
    .resized()
    .oneTime();
}

/** Xodimga mos asosiy menyu. */
function anaMenu(xodim: Xodim): Keyboard {
  return menuForAccess({
    rahbar: rahbarmi(xodim.rol),
    superAdmin: superAdminmi(xodim.telegram_id),
  });
}

/** Oqimni bekor qilib, asosiy menyuni qaytaradi. */
async function bekor(ctx: BotContext, sabab: string, xodim: Xodim): Promise<void> {
  tozala(ctx);
  await ctx.reply(`❌ ${sabab}`, { reply_markup: anaMenu(xodim) });
}

// ── Tugma handlerlari ─────────────────────────────────────

/** "Keldim" — lokatsiya so'rab oqimni boshlaydi. */
export async function handleKeldi(ctx: BotContext): Promise<void> {
  const xodim = await talabXodim(ctx);
  if (!xodim) return;

  const bugun = await bugungiDavomat(xodim.telegram_id);
  if (bugun?.keldi) {
    await ctx.reply(`Bugun allaqachon "Keldim" qayd etilган (${soatMatn(new Date(bugun.keldi))}).`);
    return;
  }

  ctx.session.davomatFlow = "keldi";
  ctx.session.step = "lokatsiya";
  await ctx.reply(
    "📍 Joriy lokatsiyangizni yuboring (skrepka → Location → Send my current location).\n" +
      "Forward yoki eski lokatsiya qabul qilinmaydi.",
    { reply_markup: lokatsiyaKlaviatura() },
  );
}

/** "Ketdim" — avval keldi bo'lishi shart, keyin lokatsiya so'raydi. */
export async function handleKetdi(ctx: BotContext): Promise<void> {
  const xodim = await talabXodim(ctx);
  if (!xodim) return;

  const bugun = await bugungiDavomat(xodim.telegram_id);
  if (!bugun?.keldi) {
    await ctx.reply('Avval "Keldim" qayd eting.');
    return;
  }
  if (bugun.ketdi) {
    await ctx.reply(`Bugun allaqachon "Ketdim" qayd etilган (${soatMatn(new Date(bugun.ketdi))}).`);
    return;
  }

  ctx.session.davomatFlow = "ketdi";
  ctx.session.step = "lokatsiya";
  await ctx.reply("📍 Joriy lokatsiyangizni yuboring.", {
    reply_markup: lokatsiyaKlaviatura(),
  });
}

/** "Tushlikka" — 12:00–14:00, keldi bo'lgan bo'lsa. */
export async function handleTushlikka(ctx: BotContext): Promise<void> {
  const xodim = await talabXodim(ctx);
  if (!xodim) return;

  const now = new Date();
  const min = kunMinutlari(now);
  if (min < 12 * 60 || min >= 14 * 60) {
    await ctx.reply("🍽 Tushlik faqat 12:00–14:00 orasида qayd etiladi.");
    return;
  }

  const bugun = await bugungiDavomat(xodim.telegram_id);
  if (!bugun?.keldi) {
    await ctx.reply('Avval "Keldim" qayd eting.');
    return;
  }
  if (bugun.tushlikka) {
    await ctx.reply("Tushlik allaqachon boshlangan.");
    return;
  }

  await tushlikkaYoz(xodim.telegram_id, now);
  await ctx.reply(`🍽 Tushlik boshlanди: ${soatMatn(now)}. Qaytганда "Tushlikdan keldim" bosing.`);
}

/** "Tushlikdan keldim" — tushlik boshlangan bo'lsa. */
export async function handleTushlikdan(ctx: BotContext): Promise<void> {
  const xodim = await talabXodim(ctx);
  if (!xodim) return;

  const bugun = await bugungiDavomat(xodim.telegram_id);
  if (!bugun?.tushlikka) {
    await ctx.reply('Avval "Tushlikka" bosing.');
    return;
  }
  if (bugun.qaytdi) {
    await ctx.reply("Tushlikdan allaqachon qaytilган.");
    return;
  }

  const now = new Date();
  await qaytdiYoz(xodim.telegram_id, now);
  await ctx.reply(`↩️ Tushlikdan qaytдingiz: ${soatMatn(now)}.`);
}

// ── Oqim handlerlari (lokatsiya, video) ───────────────────

/** Lokatsiya qabul qilish — oqimning 1-bosqichi. */
export async function handleLocation(ctx: BotContext): Promise<void> {
  if (ctx.session.step !== "lokatsiya" || !ctx.session.davomatFlow) return;

  const xodim = await talabXodim(ctx);
  if (!xodim) {
    tozala(ctx);
    return;
  }

  if (forwardMi(ctx)) {
    await bekor(ctx, "Forward qilingan lokatsiya qabul qilinmaydi.", xodim);
    return;
  }

  const msg = ctx.message;
  const yoshSek = Math.floor(Date.now() / 1000) - (msg?.date ?? 0);
  if (yoshSek > OFIS.maxYoshSek) {
    await bekor(ctx, "Eski lokatsiya. Joriy lokatsiyani yuboring.", xodim);
    return;
  }

  const loc = msg?.location;
  if (!loc) return;

  const { ok, masofa } = ofisdaMi(loc.latitude, loc.longitude);
  if (!ok) {
    await bekor(ctx, `Siz ofisдан ${masofa} m uzoqдasiz (ruxsat: ${OFIS.radiusM} m).`, xodim);
    return;
  }

  ctx.session.lat = loc.latitude;
  ctx.session.lng = loc.longitude;
  ctx.session.masofa = masofa;
  ctx.session.step = "video";
  await ctx.reply(
    `✅ Lokatsiya tasdiqlanди (${masofa} m).\n` +
      "Endi DUMALOQ VIDEO (video note) yuboring — isbot uchun. Forward qabul qilinmaydi.",
  );
}

/** Dumaloq video qabul qilish — oqimning 2-bosqichi, yozuvni yakunlaydi. */
export async function handleVideoNote(ctx: BotContext): Promise<void> {
  if (ctx.session.step !== "video" || !ctx.session.davomatFlow) return;

  const xodim = await talabXodim(ctx);
  if (!xodim) {
    tozala(ctx);
    return;
  }

  if (forwardMi(ctx)) {
    await bekor(ctx, "Forward qilingan video qabul qilinmaydi.", xodim);
    return;
  }

  const vn = ctx.message?.video_note;
  if (!vn) return;

  const now = new Date();
  const flow = ctx.session.davomatFlow;

  if (flow === "keldi") {
    const row = await keldiYoz({
      telegramId: xodim.telegram_id,
      vaqt: now,
      lat: ctx.session.lat ?? 0,
      lng: ctx.session.lng ?? 0,
      masofa: ctx.session.masofa ?? 0,
      videoFileId: vn.file_id,
    });
    tozala(ctx);
    await ctx.reply(`✅ Keldi qayd etilди: ${soatMatn(now)} — ${row.holat ?? ""}`, {
      reply_markup: anaMenu(xodim),
    });
    await davomatXulosa(ctx.api, `🟢 ${xodim.ism} — Keldi: ${soatMatn(now)} (${row.holat ?? ""})`);
  } else {
    const row = await ketdiYoz({
      telegramId: xodim.telegram_id,
      vaqt: now,
      videoFileId: vn.file_id,
    });
    tozala(ctx);
    const soat = (row.sof_min / 60).toFixed(1);
    await ctx.reply(`✅ Ketdi qayd etilди: ${soatMatn(now)}. Bugungi ish: ${soat} soat.`, {
      reply_markup: anaMenu(xodim),
    });
    await davomatXulosa(ctx.api, `🔴 ${xodim.ism} — Ketdi: ${soatMatn(now)} (${soat} soat)`);
  }
}
