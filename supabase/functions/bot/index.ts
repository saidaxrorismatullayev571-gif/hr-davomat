// iMed HR bot — Supabase Edge Function (Telegram webhook)
// Butun bot mantiqi shu faylda. service_role bilan ishlaydi (RLS chetlanadi).
import {
  Bot,
  Context,
  session,
  webhookCallback,
  Keyboard,
  type SessionFlavor,
} from "npm:grammy@1.30.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

// ── Konfiguratsiya ────────────────────────────────────────
const BOT_TOKEN = Deno.env.get("BOT_TOKEN") ??
  "8890390011:AAE3Yk2SGz_mfJiAlSxE4LhsUWq1JWjwnv4";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = "imedhr_webhook_2026";

const OFIS = { lat: 40.385907, lng: 71.786778, radiusM: 100, maxYoshSek: 90 };
const SUPER_ADMIN_IDS = [1318046590];
const GROUP_CHAT_ID = "-1003966396343";
const GROUP_CHAT_ID_2 = "-1003987794980";
const GROUP_TOPIC_ID_2 = 3393;
const TZ = "Asia/Tashkent";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Sessiya ───────────────────────────────────────────────
interface SessionData {
  step?: "lokatsiya" | "video";
  davomatFlow?: "keldi" | "ketdi";
  lat?: number;
  lng?: number;
  masofa?: number;
}
type Ctx = Context & SessionFlavor<SessionData>;

function supaAdapter() {
  return {
    read: async (key: string) => {
      const { data, error } = await supabase
        .from("bot_sessiya").select("data").eq("telegram_id", Number(key)).maybeSingle();
      if (error) throw error;
      return (data?.data as SessionData) ?? undefined;
    },
    write: async (key: string, value: SessionData) => {
      const { error } = await supabase.from("bot_sessiya").upsert({
        telegram_id: Number(key),
        step: typeof value.step === "string" ? value.step : null,
        data: value,
      });
      if (error) throw error;
    },
    delete: async (key: string) => {
      const { error } = await supabase.from("bot_sessiya").delete().eq("telegram_id", Number(key));
      if (error) throw error;
    },
  };
}

// ── Vaqt (Asia/Tashkent) ──────────────────────────────────
function sanaTashkent(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function soatMin(d = new Date()): { soat: number; min: number } {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  const [h, m] = s.split(":");
  return { soat: Number(h), min: Number(m) };
}
function soatMatn(d = new Date()): string {
  const { soat, min } = soatMin(d);
  return `${String(soat).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function kunMin(d = new Date()): number {
  const { soat, min } = soatMin(d);
  return soat * 60 + min;
}

// ── Lokatsiya ─────────────────────────────────────────────
function masofaMetr(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
// Ofis radiusi config jadvalidan o'qiladi (qayta deploy qilmasdan o'zgartirish uchun)
async function ofisRadiusM(): Promise<number> {
  const { data } = await supabase
    .from("config").select("qiymat").eq("kalit", "ofis_radius_m").maybeSingle();
  const v = data?.qiymat ? Number(data.qiymat) : NaN;
  return Number.isFinite(v) && v > 0 ? v : OFIS.radiusM;
}
async function ofisdaMi(lat: number, lng: number): Promise<{ ok: boolean; masofa: number; radius: number }> {
  const masofa = masofaMetr(OFIS.lat, OFIS.lng, lat, lng);
  const radius = await ofisRadiusM();
  return { ok: masofa <= radius, masofa, radius };
}

// ── Xodim / rollar ────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function xodimByTgId(tgId: number): Promise<any | null> {
  const { data, error } = await supabase
    .from("xodimlar").select("*").eq("telegram_id", tgId).eq("arxiv", false).maybeSingle();
  if (error) throw error;
  return data;
}
const rahbarmi = (rol: string) => rol === "Nazoratchi" || rol === "Director";
const superAdminmi = (id: number) => SUPER_ADMIN_IDS.includes(id);

// ── Davomat DB ────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
async function bugungiDavomat(tgId: number): Promise<any | null> {
  const { data, error } = await supabase
    .from("davomat").select("*").eq("telegram_id", tgId).eq("sana", sanaTashkent()).maybeSingle();
  if (error) throw error;
  return data;
}
function keldiHolat(d: Date): string {
  return kunMin(d) <= 9 * 60 ? "Vaqtida" : "Kech qoldi";
}

// Bugungi davomat hisoboti (barcha faol xodimlar bo'yicha)
async function bugungiHisobot(): Promise<string> {
  const sana = sanaTashkent();
  // deno-lint-ignore no-explicit-any
  const { data: xlar } = await supabase
    .from("xodimlar").select("telegram_id, ism").eq("arxiv", false).order("ism") as { data: any[] | null };
  // deno-lint-ignore no-explicit-any
  const { data: dlar } = await supabase
    .from("davomat").select("*").eq("sana", sana) as { data: any[] | null };
  // deno-lint-ignore no-explicit-any
  const map = new Map<number, any>((dlar ?? []).map((d) => [d.telegram_id, d]));
  const qatorlar: string[] = [`📊 <b>Bugungi davomat</b> — ${sana}`, ""];
  let kelgan = 0;
  for (const x of xlar ?? []) {
    const d = map.get(x.telegram_id);
    if (d?.keldi) {
      kelgan++;
      const keldi = soatMatn(new Date(d.keldi));
      const ketdi = d.ketdi ? soatMatn(new Date(d.ketdi)) : "—";
      const soat = (d.sof_min / 60).toFixed(1);
      qatorlar.push(`✅ ${x.ism}: ${keldi}–${ketdi} · ${soat}s · ${d.holat ?? ""}`);
    } else {
      qatorlar.push(`⬜ ${x.ism}: kelmadi`);
    }
  }
  qatorlar.push("", `Jami: <b>${kelgan}/${(xlar ?? []).length}</b> keldi`);
  return qatorlar.join("\n");
}

// ── Menyu ─────────────────────────────────────────────────
const TUGMA = {
  keldi: "🟢 Keldim", ketdi: "🔴 Ketdim",
  tushlikka: "🍽 Tushlikka", tushlikdan: "↩️ Tushlikdan keldim",
  hisobot: "📊 Hisobotlar", xodimlar: "👥 Xodimlar", admin: "⚙️ Super admin",
};
function menuForAccess(rahbar: boolean, superAdmin: boolean): Keyboard {
  const kb = new Keyboard()
    .text(TUGMA.keldi).text(TUGMA.ketdi).row()
    .text(TUGMA.tushlikka).text(TUGMA.tushlikdan).row();
  if (rahbar || superAdmin) kb.text(TUGMA.hisobot).text(TUGMA.xodimlar).row();
  if (superAdmin) kb.text(TUGMA.admin).row();
  return kb.resized().persistent();
}
// deno-lint-ignore no-explicit-any
function anaMenu(x: any): Keyboard {
  return menuForAccess(rahbarmi(x.rol), superAdminmi(x.telegram_id));
}
function lokatsiyaKlaviatura(): Keyboard {
  return new Keyboard().requestLocation("📍 Lokatsiyani yuborish").resized().oneTime();
}

// ── Guruhga xulosa ────────────────────────────────────────
async function davomatXulosa(matn: string): Promise<void> {
  try { await bot.api.sendMessage(GROUP_CHAT_ID, matn); } catch (e) { console.error("g1:", e); }
  try {
    await bot.api.sendMessage(GROUP_CHAT_ID_2, matn, { message_thread_id: GROUP_TOPIC_ID_2 });
  } catch (e) { console.error("g2:", e); }
}

function forwardMi(ctx: Ctx): boolean {
  const m = ctx.message as { forward_origin?: unknown; forward_date?: number } | undefined;
  return Boolean(m?.forward_origin ?? m?.forward_date);
}
function tozala(ctx: Ctx): void {
  ctx.session.step = undefined;
  ctx.session.davomatFlow = undefined;
  ctx.session.lat = undefined;
  ctx.session.lng = undefined;
  ctx.session.masofa = undefined;
}

// ── Bot ───────────────────────────────────────────────────
const bot = new Bot<Ctx>(BOT_TOKEN);

// Faqat shaxsiy chat
bot.use(async (ctx, next) => {
  if (ctx.chat && ctx.chat.type !== "private") return;
  await next();
});

bot.use(session({
  initial: (): SessionData => ({}),
  storage: supaAdapter(),
  getSessionKey: (ctx) => ctx.from?.id.toString(),
}));

bot.command("start", async (ctx) => {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  const x = await xodimByTgId(tgId);
  if (!x) {
    await ctx.reply("Assalomu alaykum! 👋\nSiz ro'yxatda yo'qsiz. Rahbarga murojaat qiling.");
    return;
  }
  const superAdmin = superAdminmi(tgId);
  const rahbar = rahbarmi(x.rol);
  const rolTavsif = superAdmin ? "Super admin — to'liq access" : rahbar ? `${x.rol} (rahbar)` : x.rol;
  await ctx.reply(
    `Assalomu alaykum, ${x.ism}! 👋\n\nRol: <b>${rolTavsif}</b>\n\nQuyidagi tugmalar orqali davomat qiling.`,
    { parse_mode: "HTML", reply_markup: menuForAccess(rahbar, superAdmin) },
  );
});

bot.hears(TUGMA.keldi, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  const bugun = await bugungiDavomat(x.telegram_id);
  if (bugun?.keldi) {
    await ctx.reply(`Bugun allaqachon "Keldim" qayd etilgan (${soatMatn(new Date(bugun.keldi))}).`);
    return;
  }
  ctx.session.davomatFlow = "keldi";
  ctx.session.step = "lokatsiya";
  await ctx.reply(
    "📍 Joriy lokatsiyangizni yuboring.\nForward yoki eski lokatsiya qabul qilinmaydi.",
    { reply_markup: lokatsiyaKlaviatura() },
  );
});

bot.hears(TUGMA.ketdi, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  const bugun = await bugungiDavomat(x.telegram_id);
  if (!bugun?.keldi) { await ctx.reply('Avval "Keldim" qayd eting.'); return; }
  if (bugun.ketdi) {
    await ctx.reply(`Bugun allaqachon "Ketdim" qayd etilgan (${soatMatn(new Date(bugun.ketdi))}).`);
    return;
  }
  ctx.session.davomatFlow = "ketdi";
  ctx.session.step = "lokatsiya";
  await ctx.reply("📍 Joriy lokatsiyangizni yuboring.", { reply_markup: lokatsiyaKlaviatura() });
});

bot.hears(TUGMA.tushlikka, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  const min = kunMin();
  if (min < 12 * 60 || min >= 14 * 60) {
    await ctx.reply("🍽 Tushlik faqat 12:00–14:00 orasida qayd etiladi.");
    return;
  }
  const bugun = await bugungiDavomat(x.telegram_id);
  if (!bugun?.keldi) { await ctx.reply('Avval "Keldim" qayd eting.'); return; }
  if (bugun.tushlikka) { await ctx.reply("Tushlik allaqachon boshlangan."); return; }
  const now = new Date();
  await supabase.from("davomat").update({ tushlikka: now.toISOString() })
    .eq("telegram_id", x.telegram_id).eq("sana", sanaTashkent());
  await ctx.reply(`🍽 Tushlik boshlandi: ${soatMatn(now)}. Qaytganda "Tushlikdan keldim" bosing.`);
});

bot.hears(TUGMA.tushlikdan, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  const bugun = await bugungiDavomat(x.telegram_id);
  if (!bugun?.tushlikka) { await ctx.reply('Avval "Tushlikka" bosing.'); return; }
  if (bugun.qaytdi) { await ctx.reply("Tushlikdan allaqachon qaytilgan."); return; }
  const now = new Date();
  await supabase.from("davomat").update({ qaytdi: now.toISOString() })
    .eq("telegram_id", x.telegram_id).eq("sana", sanaTashkent());
  await ctx.reply(`↩️ Tushlikdan qaytdingiz: ${soatMatn(now)}.`);
});

bot.hears(TUGMA.hisobot, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  if (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id)) {
    await ctx.reply("Bu bo'lim faqat rahbarlar uchun.");
    return;
  }
  const matn = await bugungiHisobot();
  await ctx.reply(matn, { parse_mode: "HTML" });
});
bot.hears(TUGMA.xodimlar, async (ctx) => {
  await ctx.reply("👥 Xodim boshqaruvi — keyingi bosqichda qo'shiladi.");
});
bot.hears(TUGMA.admin, async (ctx) => {
  if (!superAdminmi(ctx.from!.id)) return;
  await ctx.reply("⚙️ Super admin panel — to'liq access. Funksiyalar keyingi bosqichda.");
});

// Lokatsiya bosqichi
bot.on("message:location", async (ctx) => {
  if (ctx.session.step !== "lokatsiya" || !ctx.session.davomatFlow) return;
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { tozala(ctx); return; }
  if (forwardMi(ctx)) {
    tozala(ctx);
    await ctx.reply("❌ Forward qilingan lokatsiya qabul qilinmaydi.", { reply_markup: anaMenu(x) });
    return;
  }
  const yosh = Math.floor(Date.now() / 1000) - (ctx.message?.date ?? 0);
  if (yosh > OFIS.maxYoshSek) {
    tozala(ctx);
    await ctx.reply("❌ Eski lokatsiya. Joriy lokatsiyani yuboring.", { reply_markup: anaMenu(x) });
    return;
  }
  const loc = ctx.message?.location;
  if (!loc) return;
  const { ok, masofa, radius } = await ofisdaMi(loc.latitude, loc.longitude);
  if (!ok) {
    tozala(ctx);
    await ctx.reply(`❌ Siz ofisdan ${masofa} m uzoqdasiz (ruxsat: ${radius} m).`, { reply_markup: anaMenu(x) });
    return;
  }
  ctx.session.lat = loc.latitude;
  ctx.session.lng = loc.longitude;
  ctx.session.masofa = masofa;
  ctx.session.step = "video";
  await ctx.reply(`✅ Lokatsiya tasdiqlandi (${masofa} m).\nEndi DUMALOQ VIDEO yuboring — isbot uchun.`);
});

// Video bosqichi — yozuvni yakunlaydi
bot.on("message:video_note", async (ctx) => {
  if (ctx.session.step !== "video" || !ctx.session.davomatFlow) return;
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { tozala(ctx); return; }
  if (forwardMi(ctx)) {
    tozala(ctx);
    await ctx.reply("❌ Forward qilingan video qabul qilinmaydi.", { reply_markup: anaMenu(x) });
    return;
  }
  const vn = ctx.message?.video_note;
  if (!vn) return;
  const now = new Date();
  const flow = ctx.session.davomatFlow;
  if (flow === "keldi") {
    const { data } = await supabase.from("davomat").upsert({
      telegram_id: x.telegram_id, sana: sanaTashkent(now), keldi: now.toISOString(),
      lat: ctx.session.lat, lng: ctx.session.lng, masofa_m: ctx.session.masofa,
      video_file_id: vn.file_id, holat: keldiHolat(now),
    }, { onConflict: "telegram_id,sana" }).select().single();
    tozala(ctx);
    const holat = data?.holat ?? "";
    await ctx.reply(`✅ Keldi qayd etildi: ${soatMatn(now)} — ${holat}`, { reply_markup: anaMenu(x) });
    await davomatXulosa(`🟢 ${x.ism} — Keldi: ${soatMatn(now)} (${holat})`);
  } else {
    const { data } = await supabase.from("davomat").update({
      ketdi: now.toISOString(), video_file_id: vn.file_id,
    }).eq("telegram_id", x.telegram_id).eq("sana", sanaTashkent(now)).select().single();
    tozala(ctx);
    const soat = ((data?.sof_min ?? 0) / 60).toFixed(1);
    await ctx.reply(`✅ Ketdi qayd etildi: ${soatMatn(now)}. Bugungi ish: ${soat} soat.`, { reply_markup: anaMenu(x) });
    await davomatXulosa(`🔴 ${x.ism} — Ketdi: ${soatMatn(now)} (${soat} soat)`);
  }
});

bot.on("message", async (ctx) => {
  await ctx.reply("Menyudan tugmani tanlang yoki /start bosing.");
});

bot.catch((err) => console.error("Bot xatosi:", err.error));

// ── Webhook server ────────────────────────────────────────
const handleUpdate = webhookCallback(bot, "std/http", { secretToken: WEBHOOK_SECRET });

Deno.serve(async (req) => {
  if (req.method === "POST") {
    try {
      return await handleUpdate(req);
    } catch (e) {
      console.error("handleUpdate:", e);
      return new Response("ok", { status: 200 });
    }
  }
  return new Response("iMed HR bot webhook ishlayapti", { status: 200 });
});
