// iMed HR bot — Supabase Edge Function (Telegram webhook)
// Butun bot mantiqi shu faylda. service_role bilan ishlaydi (RLS chetlanadi).
import {
  Bot,
  Context,
  session,
  webhookCallback,
  Keyboard,
  InlineKeyboard,
  InputFile,
  type SessionFlavor,
} from "npm:grammy@1.30.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { davomatPng, maoshPng, type DavomatRow, type MaoshRow } from "./render.ts";
import { davomatXlsx, maoshXlsx, type DavomatXRow, type MaoshXRow } from "./excel.ts";

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
  // Xodim qo'shish oqimi
  xodimStep?: "ism" | "tgid" | "yangirol" | "yangirol_fix" | "yangirol_ovqat";
  yangiIsm?: string;
  yangiTgId?: number;
  yangiRol?: string;
  yangiRolFix?: number;
  // Sinovchi qo'shish oqimi
  sinovStep?: "ism" | "tgid" | "summa";
  sinovIsm?: string;
  sinovTgId?: number;
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
// TEST REJIMI: bu ID'lar uchun cheksiz keldi/ketdi/tushlik, masofa/vaqt cheklovi tekshirilmaydi.
// Production'dan oldin ro'yxatni bo'shatish kerak: const TEST_IDS: number[] = [];
const TEST_IDS = [1318046590];
const testRejimmi = (id: number) => TEST_IDS.includes(id);

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
    .from("xodimlar").select("telegram_id, ism").eq("arxiv", false).eq("hisobga_olinmaydi", false).order("ism") as { data: any[] | null };
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
      const rangi = d.holat === "Kech qoldi" ? "🟠" : d.holat === "Avtomatik" ? "🔵" : "🟢";
      qatorlar.push(`${rangi} <b>${esc(x.ism)}</b> · ${keldi}–${ketdi} · <b>${soat}s</b>`);
    } else {
      qatorlar.push(`⬜ <b>${esc(x.ism)}</b> — kelmadi`);
    }
  }
  qatorlar.push("", `👥 Jami: <b>${kelgan}/${(xlar ?? []).length}</b> keldi`);
  return qatorlar.join("\n");
}

// Bugungi davomat qatorlari (matn hisobot + PNG dashboard uchun umumiy)
async function davomatRows(): Promise<DavomatRow[]> {
  const sana = sanaTashkent();
  // deno-lint-ignore no-explicit-any
  const { data: xlar } = await supabase
    .from("xodimlar").select("telegram_id, ism").eq("arxiv", false).eq("hisobga_olinmaydi", false).order("ism") as { data: any[] | null };
  // deno-lint-ignore no-explicit-any
  const { data: dlar } = await supabase
    .from("davomat").select("*").eq("sana", sana) as { data: any[] | null };
  // deno-lint-ignore no-explicit-any
  const map = new Map<number, any>((dlar ?? []).map((d) => [d.telegram_id, d]));
  return (xlar ?? []).map((x) => {
    const d = map.get(x.telegram_id);
    if (d?.keldi) {
      return {
        ism: x.ism,
        keldi: soatMatn(new Date(d.keldi)),
        ketdi: d.ketdi ? soatMatn(new Date(d.ketdi)) : "—",
        soat: Number((d.sof_min / 60).toFixed(1)),
        holat: d.holat ?? "Vaqtida",
      };
    }
    return { ism: x.ism, keldi: "—", ketdi: "—", soat: null, holat: null };
  });
}

// Faol xodimlar ro'yxati
// Oylik davomat: har xodim necha kun kelgan + jami soat
async function oylikDavomatHisobot(): Promise<string> {
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.rpc("oylik_davomat", { p_oy: oy }) as { data: any[] | null };
  const qatorlar: string[] = [`📆 <b>Oylik davomat</b> — ${oy}`, ""];
  for (const r of data ?? []) {
    qatorlar.push(`• <b>${esc(r.ism)}</b> (${esc(r.rol)}): <b>${r.kelgan_kun}</b> kun · ${r.jami_soat}s`);
  }
  if ((data ?? []).length === 0) qatorlar.push("(ma'lumot yo'q)");
  return qatorlar.join("\n");
}

async function xodimlarRoyxati(): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase
    .from("xodimlar").select("ism, rol").eq("arxiv", false).order("rol").order("ism") as { data: any[] | null };
  const qatorlar: string[] = ["👥 <b>Xodimlar</b>", ""];
  for (const x of data ?? []) qatorlar.push(`• <b>${esc(x.ism)}</b> — ${esc(x.rol)}`);
  qatorlar.push("", `Jami: <b>${(data ?? []).length}</b>`);
  return qatorlar.join("\n");
}

// Rollar (lavozimlar) ro'yxati — tugma menyusi uchun
async function rollarList(): Promise<string[]> {
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.from("rollar").select("nom").order("nom") as { data: any[] | null };
  return (data ?? []).map((r) => String(r.nom));
}
// Rol tugmalari + "yangi rol" (dinamik)
function rolKlaviatura(roles: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  roles.forEach((r, i) => { kb.text(r, `xq_rol_${r}`); if (i % 2 === 1) kb.row(); });
  kb.row().text("➕ Yangi rol (lavozim)", "xq_yangirol");
  return kb;
}
// Xodimni saqlash (rol yangi bo'lsa rollarga ham qo'shiladi — mavjud maosh qoidasi buzilmaydi)
async function xodimSaqla(tgid: number, ism: string, rol: string): Promise<string | null> {
  await supabase.from("rollar").upsert({ nom: rol }, { onConflict: "nom" });
  const { error } = await supabase.from("xodimlar").upsert(
    { telegram_id: tgid, ism, rol, arxiv: false }, { onConflict: "telegram_id" },
  );
  return error?.message ?? null;
}

// Yangi lavozim (rol) yaratish — fix maosh + ovqat/kun bilan
async function rolSaqla(nom: string, fix: number, ovqat: number): Promise<string | null> {
  const { error } = await supabase.from("rollar").upsert(
    { nom, maosh_turi: "fix", fix_summa: fix, ovqat_kun: ovqat },
    { onConflict: "nom" },
  );
  return error?.message ?? null;
}
// Matndan raqam ajratish ("1 500 000" / "1.500.000" / "40000" -> son)
function raqamOl(t: string): number {
  const n = parseInt(String(t).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
}

// Joriy oy (YYYY-MM, Asia/Tashkent)
function joriyOy(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit",
  }).format(new Date()).slice(0, 7);
}

// Oylik maosh hisoboti
async function maoshHisobot(): Promise<string> {
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.rpc("maosh_oylik", { p_oy: oy }) as { data: any[] | null };
  const qatorlar: string[] = [`💰 <b>Oylik maosh</b> — ${oy}`, ""];
  let jami = 0;
  for (const r of data ?? []) {
    jami += Number(r.yakuniy);
    const p: string[] = [];
    if (Number(r.ovqat) > 0) p.push(`+${fmtSum(Number(r.ovqat))} ovqat`);
    if (Number(r.bonus) > 0) p.push(`+${fmtSum(Number(r.bonus))} bonus`);
    const bonus = p.length ? ` (${p.join(", ")})` : "";
    qatorlar.push(`• <b>${esc(r.ism)}</b> — <b>${fmtSum(Number(r.yakuniy))}</b> so'm${bonus} · ${r.jami_soat}s`);
  }
  qatorlar.push("", `Jami to'lov: <b>${fmtSum(jami)}</b> so'm`);
  return qatorlar.join("\n");
}

// Oylik maosh CSV (Excel'da ochiladi)
async function maoshCsv(): Promise<{ nom: string; matn: string }> {
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.rpc("maosh_oylik", { p_oy: oy }) as { data: any[] | null };
  let csv = "﻿" + "Ism,Rol,Soat,Baza,Ovqat,Bonus,Yakuniy\n";
  for (const r of data ?? []) {
    csv += `"${String(r.ism).replace(/"/g, '""')}",${r.rol},${r.jami_soat},${r.baza},${r.ovqat ?? 0},${r.bonus},${r.yakuniy}\n`;
  }
  return { nom: `maosh_${oy}.csv`, matn: csv };
}

// Faol sinovchilar ro'yxati
async function sinovRoyxati(): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase
    .from("sinov").select("*").eq("arxiv", false).order("boshlanish", { ascending: false }) as { data: any[] | null };
  const qatorlar: string[] = ["🧪 <b>Sinovchilar</b>", ""];
  for (const s of data ?? []) {
    const natija = s.natija ?? "Kutilmoqda";
    qatorlar.push(`• <b>${esc(s.ism)}</b> — ${fmtSum(Number(s.summa_umumiy))} so'm · ${esc(s.bosqich)} · ${esc(natija)}`);
  }
  if ((data ?? []).length === 0) qatorlar.push("(hozircha yo'q)");
  return qatorlar.join("\n");
}

// ── Menyu ─────────────────────────────────────────────────
const TUGMA = {
  keldi: "🟢 Keldim", ketdi: "🔴 Ketdim",
  tushlikka: "🍽 Tushlikka", tushlikdan: "↩️ Tushlikdan keldim",
  hisobot: "📊 Hisobotlar", xodimlar: "👥 Xodimlar",
  maosh: "💰 Maosh", sinov: "🧪 Sinov", admin: "⚙️ Super admin",
};
function menuForAccess(rahbar: boolean, superAdmin: boolean): Keyboard {
  const kb = new Keyboard()
    .text(TUGMA.keldi).text(TUGMA.ketdi).row()
    .text(TUGMA.tushlikka).text(TUGMA.tushlikdan).row();
  if (rahbar || superAdmin) {
    kb.text(TUGMA.hisobot).text(TUGMA.xodimlar).row();
    kb.text(TUGMA.maosh).text(TUGMA.sinov).row();
  }
  if (superAdmin) kb.text(TUGMA.admin).row();
  return kb.resized().persistent();
}

// Raqamni ming ajratgichli formatlash: 1500000 -> "1 500 000"
function fmtSum(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// HTML parse_mode uchun xavfsizlash (ism/matnda &, <, > bo'lsa xabar buzilmasin)
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// QuickChart orqali grafik rasm URL (bepul, kalitsiz)
// deno-lint-ignore no-explicit-any
async function chartUrl(config: any): Promise<string | null> {
  try {
    const resp = await fetch("https://quickchart.io/chart/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: config, width: 700, height: 420,
        backgroundColor: "white", version: "2",
      }),
    });
    const j = await resp.json();
    return typeof j.url === "string" ? j.url : null;
  } catch (e) {
    console.error("chart:", e);
    return null;
  }
}
async function openaiKalit(): Promise<string | null> {
  const { data } = await supabase.from("config").select("qiymat").eq("kalit", "openai_key").maybeSingle();
  return data?.qiymat ?? null;
}

// Qayta ishlatiladigan grafik URL'lari (tugma + ovozli savol uchun)
async function bugunDoughnutUrl(): Promise<string | null> {
  // deno-lint-ignore no-explicit-any
  const { data: xl } = await supabase.from("xodimlar").select("telegram_id").eq("arxiv", false).eq("hisobga_olinmaydi", false) as { data: any[] | null };
  // deno-lint-ignore no-explicit-any
  const { data: dl } = await supabase.from("davomat").select("telegram_id, keldi").eq("sana", sanaTashkent()) as { data: any[] | null };
  const kelganSet = new Set((dl ?? []).filter((d) => d.keldi).map((d) => d.telegram_id));
  const kelgan = (xl ?? []).filter((x2) => kelganSet.has(x2.telegram_id)).length;
  const kelmagan = (xl ?? []).length - kelgan;
  return await chartUrl({
    type: "doughnut",
    data: { labels: ["Keldi", "Kelmadi"], datasets: [{ data: [kelgan, kelmagan], backgroundColor: ["#59a14f", "#e15759"] }] },
    options: { title: { display: true, text: `Bugungi davomat — ${sanaTashkent()}`, fontSize: 18 } },
  });
}
async function oylikBarUrl(): Promise<string | null> {
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.rpc("oylik_davomat", { p_oy: oy }) as { data: any[] | null };
  return await chartUrl({
    type: "horizontalBar",
    data: { labels: (data ?? []).map((r) => r.ism), datasets: [{ label: "Ish soati", data: (data ?? []).map((r) => Number(r.jami_soat)), backgroundColor: "#4e79a7" }] },
    options: { title: { display: true, text: `Oylik ish soati — ${oy}`, fontSize: 18 }, legend: { display: false } },
  });
}
async function maoshBarUrl(): Promise<string | null> {
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.rpc("maosh_oylik", { p_oy: oy }) as { data: any[] | null };
  return await chartUrl({
    type: "horizontalBar",
    data: { labels: (data ?? []).map((r) => r.ism), datasets: [{ label: "Maosh", data: (data ?? []).map((r) => Number(r.yakuniy)), backgroundColor: "#59a14f" }] },
    options: { title: { display: true, text: `Oylik maosh — ${oy}`, fontSize: 18 }, legend: { display: false } },
  });
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
  // Manzil config jadvalidan (test uchun oson o'zgartirish). Bo'lmasa production 2 guruh.
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.from("config").select("kalit, qiymat")
    .in("kalit", ["xulosa_group_id", "xulosa_topic_id"]) as { data: any[] | null };
  const cfg = new Map<string, string>((data ?? []).map((r) => [r.kalit, r.qiymat]));
  const gid = cfg.get("xulosa_group_id");
  if (gid) {
    const topic = cfg.get("xulosa_topic_id");
    try {
      await bot.api.sendMessage(gid, matn, {
        parse_mode: "HTML",
        ...(topic ? { message_thread_id: Number(topic) } : {}),
      });
    } catch (e) { console.error("xulosa guruh:", e); }
    return;
  }
  try {
    await bot.api.sendMessage(GROUP_CHAT_ID, matn, { parse_mode: "HTML" });
  } catch (e) { console.error("g1:", e); }
  try {
    await bot.api.sendMessage(GROUP_CHAT_ID_2, matn, {
      parse_mode: "HTML", message_thread_id: GROUP_TOPIC_ID_2,
    });
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
    await ctx.reply(
      "Assalomu alaykum! 👋\nSiz hozircha ro'yxatda yo'qsiz.\n\n" +
        `Sizning Telegram ID: <b>${tgId}</b>\n` +
        "Ushbu ID ni rahbaringizga bering — u sizni tizimga qo'shadi.",
      { parse_mode: "HTML" },
    );
    return;
  }
  const superAdmin = superAdminmi(tgId);
  const rahbar = rahbarmi(x.rol);
  const rolTavsif = superAdmin ? "Super admin — to'liq access" : rahbar ? `${x.rol} (rahbar)` : x.rol;
  await ctx.reply(
    `👋 <b>Assalomu alaykum, ${esc(x.ism)}!</b>\n\n` +
      `Lavozim:  <b>${esc(rolTavsif)}</b>\n\n` +
      "Quyidagi <b>menyu tugmalari</b> orqali davomat qiling 👇",
    { parse_mode: "HTML", reply_markup: menuForAccess(rahbar, superAdmin) },
  );
});

bot.hears(TUGMA.keldi, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  const bugun = await bugungiDavomat(x.telegram_id);
  if (bugun?.keldi && !testRejimmi(x.telegram_id)) {
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
  if (!bugun?.keldi && !testRejimmi(x.telegram_id)) { await ctx.reply('Avval "Keldim" qayd eting.'); return; }
  if (bugun?.ketdi && !testRejimmi(x.telegram_id)) {
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
  if ((min < 12 * 60 || min >= 14 * 60) && !testRejimmi(x.telegram_id)) {
    await ctx.reply("🍽 Tushlik faqat 12:00–14:00 orasida qayd etiladi.");
    return;
  }
  const bugun = await bugungiDavomat(x.telegram_id);
  if (!bugun?.keldi && !testRejimmi(x.telegram_id)) { await ctx.reply('Avval "Keldim" qayd eting.'); return; }
  if (bugun?.tushlikka && !testRejimmi(x.telegram_id)) { await ctx.reply("Tushlik allaqachon boshlangan."); return; }
  const now = new Date();
  await supabase.from("davomat").update({ tushlikka: now.toISOString() })
    .eq("telegram_id", x.telegram_id).eq("sana", sanaTashkent());
  await ctx.reply(`🍽 Tushlik boshlandi: <b>${soatMatn(now)}</b>. Qaytganda "Tushlikdan keldim" bosing.`, { parse_mode: "HTML" });
});

bot.hears(TUGMA.tushlikdan, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  const bugun = await bugungiDavomat(x.telegram_id);
  if (!bugun?.tushlikka && !testRejimmi(x.telegram_id)) { await ctx.reply('Avval "Tushlikka" bosing.'); return; }
  if (bugun?.qaytdi && !testRejimmi(x.telegram_id)) { await ctx.reply("Tushlikdan allaqachon qaytilgan."); return; }
  const now = new Date();
  await supabase.from("davomat").update({ qaytdi: now.toISOString() })
    .eq("telegram_id", x.telegram_id).eq("sana", sanaTashkent());
  await ctx.reply(`↩️ Tushlikdan qaytdingiz: <b>${soatMatn(now)}</b>.`, { parse_mode: "HTML" });
});

bot.hears(TUGMA.hisobot, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  if (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id)) {
    await ctx.reply("Bu bo'lim faqat rahbarlar uchun.");
    return;
  }
  const matn = await bugungiHisobot();
  const kb = new InlineKeyboard().text("📆 Oylik davomat", "hisobot_oy").text("📥 Excel", "davomat_export");
  await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
  try {
    const png = await davomatPng(sanaTashkent(), await davomatRows());
    await ctx.replyWithPhoto(new InputFile(png, "davomat.png"));
  } catch (e) {
    console.error("davomat png:", e);
    const u = await bugunDoughnutUrl();
    if (u) await ctx.replyWithPhoto(u);
  }
});

// Oylik davomat (har xodim necha kun ishladi)
bot.callbackQuery("hisobot_oy", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  await ctx.answerCallbackQuery();
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.rpc("oylik_davomat", { p_oy: oy }) as { data: any[] | null };
  const qatorlar: string[] = [`📆 <b>Oylik davomat</b> — ${oy}`, ""];
  for (const r of data ?? []) {
    qatorlar.push(`• ${esc(r.ism)} (${esc(r.rol)}): <b>${r.kelgan_kun}</b> kun · ${r.jami_soat}s`);
  }
  await ctx.reply(qatorlar.join("\n"), { parse_mode: "HTML" });
  const url = await chartUrl({
    type: "horizontalBar",
    data: {
      labels: (data ?? []).map((r) => r.ism),
      datasets: [{ label: "Ish soati", data: (data ?? []).map((r) => Number(r.jami_soat)), backgroundColor: "#4e79a7" }],
    },
    options: { title: { display: true, text: `Oylik ish soati — ${oy}`, fontSize: 18 }, legend: { display: false } },
  });
  if (url) await ctx.replyWithPhoto(url);
});

// Davomat — Excel eksport
bot.callbackQuery("davomat_export", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  await ctx.answerCallbackQuery("Tayyorlanmoqda...");
  try {
    const sana = sanaTashkent();
    const xlsx = await davomatXlsx(sana, (await davomatRows()) as DavomatXRow[]);
    await ctx.replyWithDocument(new InputFile(xlsx, `davomat_${sana}.xlsx`), { caption: "📊 Bugungi davomat (Excel)" });
  } catch (e) {
    console.error("davomat xlsx:", e);
    await ctx.reply("❌ Excel yaratishda xato.");
  }
});

bot.hears(TUGMA.xodimlar, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.reply("Bu bo'lim faqat rahbarlar uchun.");
    return;
  }
  const matn = await xodimlarRoyxati();
  const kb = new InlineKeyboard().text("➕ Xodim qo'shish", "xq_add");
  await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
});

// Xodim qo'shish — boshlash
bot.callbackQuery("xq_add", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  ctx.session.xodimStep = "ism";
  ctx.session.yangiIsm = undefined;
  ctx.session.yangiTgId = undefined;
  await ctx.answerCallbackQuery();
  await ctx.reply("Yangi xodim ismini kiriting:");
});

// Xodim qo'shish — rol tanlash (yakuniy)
bot.callbackQuery(/^xq_rol_(.+)$/, async (ctx) => {
  const rol = ctx.match![1];
  const ism = ctx.session.yangiIsm;
  const tgid = ctx.session.yangiTgId;
  if (!ism || !tgid) {
    await ctx.answerCallbackQuery("Ma'lumot yo'q, qaytadan boshlang.");
    return;
  }
  const err = await xodimSaqla(tgid, ism, rol);
  ctx.session.xodimStep = undefined;
  ctx.session.yangiIsm = undefined;
  ctx.session.yangiTgId = undefined;
  await ctx.answerCallbackQuery();
  if (err) { await ctx.reply("❌ Xato: " + err); return; }
  await ctx.reply(`✅ Qo'shildi: <b>${esc(ism)}</b> — ${esc(rol)} (ID ${tgid})`, { parse_mode: "HTML" });
});

// Yangi rol (lavozim) yaratish — nomni so'raydi
bot.callbackQuery("xq_yangirol", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  if (!ctx.session.yangiIsm || !ctx.session.yangiTgId) {
    await ctx.answerCallbackQuery("Ma'lumot yo'q, qaytadan boshlang.");
    return;
  }
  ctx.session.xodimStep = "yangirol";
  await ctx.answerCallbackQuery();
  await ctx.reply("Yangi rol (lavozim) nomini kiriting (masalan: Omborchi):");
});
// Maosh — oylik hisobot
bot.hears(TUGMA.maosh, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.reply("Bu bo'lim faqat rahbarlar uchun.");
    return;
  }
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.rpc("maosh_oylik", { p_oy: oy }) as { data: any[] | null };
  const qatorlar: string[] = [`💰 <b>Oylik maosh</b> — ${oy}`, ""];
  let jami = 0;
  for (const r of data ?? []) {
    jami += Number(r.yakuniy);
    const p: string[] = [];
    if (Number(r.ovqat) > 0) p.push(`+${fmtSum(Number(r.ovqat))} ovqat`);
    if (Number(r.bonus) > 0) p.push(`+${fmtSum(Number(r.bonus))} bonus`);
    const bonus = p.length ? ` (${p.join(", ")})` : "";
    qatorlar.push(`• ${esc(r.ism)} — <b>${fmtSum(Number(r.yakuniy))}</b> so'm${bonus} · ${r.jami_soat}s`);
  }
  qatorlar.push("", `Jami to'lov: <b>${fmtSum(jami)}</b> so'm`);
  const kb = new InlineKeyboard().text("📥 Eksport (CSV)", "maosh_export");
  await ctx.reply(qatorlar.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  try {
    const png = await maoshPng(oy, (data ?? []) as MaoshRow[]);
    await ctx.replyWithPhoto(new InputFile(png, "maosh.png"));
  } catch (e) {
    console.error("maosh png:", e);
    const u = await maoshBarUrl();
    if (u) await ctx.replyWithPhoto(u);
  }
});

// Maosh — CSV eksport
bot.callbackQuery("maosh_export", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  await ctx.answerCallbackQuery("Tayyorlanmoqda...");
  try {
    const oy = joriyOy();
    // deno-lint-ignore no-explicit-any
    const { data } = await supabase.rpc("maosh_oylik", { p_oy: oy }) as { data: any[] | null };
    const xlsx = await maoshXlsx(oy, (data ?? []) as MaoshXRow[]);
    await ctx.replyWithDocument(new InputFile(xlsx, `maosh_${oy}.xlsx`), { caption: "💰 Oylik maosh varaqasi (Excel)" });
  } catch (e) {
    console.error("maosh xlsx:", e);
    const { nom, matn } = await maoshCsv();
    await ctx.replyWithDocument(new InputFile(new TextEncoder().encode(matn), nom), { caption: "💰 Oylik maosh (CSV)" });
  }
});

// Sinov — ro'yxat + qo'shish
bot.hears(TUGMA.sinov, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.reply("Bu bo'lim faqat rahbarlar uchun.");
    return;
  }
  const matn = await sinovRoyxati();
  const kb = new InlineKeyboard().text("➕ Sinovchi qo'shish", "sinov_add");
  await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
});

bot.callbackQuery("sinov_add", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  ctx.session.sinovStep = "ism";
  ctx.session.sinovIsm = undefined;
  ctx.session.sinovTgId = undefined;
  await ctx.answerCallbackQuery();
  await ctx.reply("Sinovchi ismini kiriting:");
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
  const test = testRejimmi(x.telegram_id);
  const yosh = Math.floor(Date.now() / 1000) - (ctx.message?.date ?? 0);
  if (yosh > OFIS.maxYoshSek && !test) {
    tozala(ctx);
    await ctx.reply("❌ Eski lokatsiya. Joriy lokatsiyani yuboring.", { reply_markup: anaMenu(x) });
    return;
  }
  const loc = ctx.message?.location;
  if (!loc) return;
  const { ok, masofa, radius } = await ofisdaMi(loc.latitude, loc.longitude);
  if (!ok && !test) {
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
    const { data, error } = await supabase.from("davomat").upsert({
      telegram_id: x.telegram_id, sana: sanaTashkent(now), keldi: now.toISOString(),
      lat: ctx.session.lat, lng: ctx.session.lng, masofa_m: ctx.session.masofa,
      video_file_id: vn.file_id, holat: keldiHolat(now),
    }, { onConflict: "telegram_id,sana" }).select().maybeSingle();
    tozala(ctx);
    if (error) {
      console.error("keldi upsert:", error);
      await ctx.reply("❌ Saqlashda xato. Qayta urinib ko'ring.", { reply_markup: anaMenu(x) });
      return;
    }
    const holat = data?.holat ?? keldiHolat(now);
    await ctx.reply(
      `✅ Keldi qayd etildi: <b>${soatMatn(now)}</b> — ${esc(holat)}`,
      { parse_mode: "HTML", reply_markup: anaMenu(x) },
    );
    const emoji = holat === "Kech qoldi" ? "🟠" : "🟢";
    const izoh = holat === "Kech qoldi" ? " — <i>kech qoldi</i>" : "";
    await davomatXulosa(`${emoji} <b>${esc(x.ism)}</b> keldi · <b>${soatMatn(now)}</b>${izoh}`);
  } else {
    const { data, error } = await supabase.from("davomat").update({
      ketdi: now.toISOString(), video_file_id: vn.file_id,
    }).eq("telegram_id", x.telegram_id).eq("sana", sanaTashkent(now)).select().maybeSingle();
    tozala(ctx);
    if (error) {
      console.error("ketdi update:", error);
      await ctx.reply("❌ Saqlashda xato. Qayta urinib ko'ring.", { reply_markup: anaMenu(x) });
      return;
    }
    const soat = ((data?.sof_min ?? 0) / 60).toFixed(1);
    await ctx.reply(
      `✅ Ketdi qayd etildi: <b>${soatMatn(now)}</b>. Bugungi ish: <b>${soat} soat</b>.`,
      { parse_mode: "HTML", reply_markup: anaMenu(x) },
    );
    await davomatXulosa(`🔴 <b>${esc(x.ism)}</b> ketdi · <b>${soatMatn(now)}</b> — bugun <b>${soat} soat</b>`);
  }
});

// Ovozli savol (rahbar/super admin) — Whisper + AI niyat + vizual javob
bot.on("message:voice", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || (!rahbarmi(x.rol) && !superAdminmi(x.telegram_id))) {
    await ctx.reply("Ovozli savol faqat rahbarlar uchun.");
    return;
  }
  const key = await openaiKalit();
  if (!key) { await ctx.reply("OpenAI kaliti sozlanmagan."); return; }

  await ctx.reply("🎤 Eshitilmoqda...");
  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
    const audioBlob = await (await fetch(fileUrl)).blob();

    const form = new FormData();
    form.append("file", audioBlob, "voice.oga");
    form.append("model", "whisper-1");
    form.append("language", "uz");
    const wResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    // deno-lint-ignore no-explicit-any
    const wJson = await wResp.json() as any;
    const savol = String(wJson.text ?? "").trim();
    if (!savol) { await ctx.reply("Ovozni tushunolmadim. Qayta urinib ko'ring."); return; }
    await ctx.reply(`🗣 Savol: <i>${esc(savol)}</i>`, { parse_mode: "HTML" });

    const cResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "Foydalanuvchining HR/davomat savolini quyidagi turlardan biriga ajrat. FAQAT bitta so'z qaytar: bugun, oylik, maosh, xodimlar, boshqa. Ma'nolar: 'bugun'=bugungi davomat, kim keldi yoki kelmadi. 'oylik'=bu oyda kim necha kun yoki necha soat ishladi. 'maosh'=oylik maosh, kim qancha pul oladi. 'xodimlar'=xodimlar ro'yxati." },
          { role: "user", content: savol },
        ],
      }),
    });
    // deno-lint-ignore no-explicit-any
    const cJson = await cResp.json() as any;
    const kat = String(cJson.choices?.[0]?.message?.content ?? "boshqa").toLowerCase();

    if (kat.includes("bugun")) {
      await ctx.reply(await bugungiHisobot(), { parse_mode: "HTML" });
      try { const png = await davomatPng(sanaTashkent(), await davomatRows()); await ctx.replyWithPhoto(new InputFile(png, "davomat.png")); }
      catch (e) { console.error("voice png:", e); const u = await bugunDoughnutUrl(); if (u) await ctx.replyWithPhoto(u); }
    } else if (kat.includes("oylik")) {
      await ctx.reply(await oylikDavomatHisobot(), { parse_mode: "HTML" });
      const u = await oylikBarUrl();
      if (u) await ctx.replyWithPhoto(u);
    } else if (kat.includes("maosh")) {
      await ctx.reply(await maoshHisobot(), { parse_mode: "HTML" });
      try {
        const oy = joriyOy();
        // deno-lint-ignore no-explicit-any
        const { data: md } = await supabase.rpc("maosh_oylik", { p_oy: oy }) as { data: any[] | null };
        const png = await maoshPng(oy, (md ?? []) as MaoshRow[]);
        await ctx.replyWithPhoto(new InputFile(png, "maosh.png"));
      } catch (e) { console.error("voice maosh png:", e); const u = await maoshBarUrl(); if (u) await ctx.replyWithPhoto(u); }
    } else if (kat.includes("xodim")) {
      await ctx.reply(await xodimlarRoyxati(), { parse_mode: "HTML" });
    } else {
      await ctx.reply(
        "Savolni aniq tushunmadim. Masalan:\n• \"Bugun kim kelmadi?\"\n• \"Bu oy kim necha kun ishladi?\"\n• \"Maosh qancha?\"",
      );
    }
  } catch (e) {
    console.error("voice:", e);
    await ctx.reply("❌ Ovozli savolni qayta ishlashda xato yuz berdi.");
  }
});

bot.on("message", async (ctx) => {
  // Xodim qo'shish oqimi — matn kiritish
  const t = ctx.message?.text?.trim();
  if (ctx.session.xodimStep && t) {
    if (ctx.session.xodimStep === "ism") {
      ctx.session.yangiIsm = t;
      ctx.session.xodimStep = "tgid";
      await ctx.reply(
        `Ism: <b>${esc(t)}</b>\nEndi xodimning Telegram ID (raqam) ni kiriting.\n\n` +
          "(Xodim botga /start yozsa, o'z ID sini ko'radi — o'shani so'rang.)",
        { parse_mode: "HTML" },
      );
      return;
    }
    if (ctx.session.xodimStep === "tgid") {
      const id = Number(t);
      if (!Number.isInteger(id) || id <= 0) {
        await ctx.reply("❌ Noto'g'ri ID. Faqat raqam kiriting (masalan 123456789).");
        return;
      }
      ctx.session.yangiTgId = id;
      ctx.session.xodimStep = undefined;
      const kb = rolKlaviatura(await rollarList());
      await ctx.reply(`ID: <b>${id}</b>\nRolni (lavozimni) tanlang yoki yangisini qo'shing:`, { parse_mode: "HTML", reply_markup: kb });
      return;
    }
    if (ctx.session.xodimStep === "yangirol") {
      const rol = t.slice(0, 40).trim();
      if (!rol) { await ctx.reply("Rol (lavozim) nomini kiriting."); return; }
      ctx.session.yangiRol = rol;
      ctx.session.xodimStep = "yangirol_fix";
      await ctx.reply(
        `🆕 Yangi lavozim:  <b>${esc(rol)}</b>\n\n` +
          "Endi shu lavozimning oylik <b>fix maoshi</b>ni (so'm) kiriting.\n" +
          "Masalan:  <b>2 000 000</b>\n\n" +
          "(Fix maosh bo'lmasa <b>0</b> yozing.)",
        { parse_mode: "HTML" },
      );
      return;
    }
    if (ctx.session.xodimStep === "yangirol_fix") {
      const fix = raqamOl(t);
      if (!Number.isFinite(fix) || fix < 0) {
        await ctx.reply("❌ Noto'g'ri summa. Faqat raqam kiriting (masalan 2000000).");
        return;
      }
      ctx.session.yangiRolFix = fix;
      ctx.session.xodimStep = "yangirol_ovqat";
      await ctx.reply(
        `Fix maosh:  <b>${fmtSum(fix)}</b> so'm\n\n` +
          "Endi <b>ovqat puli</b>ni — <b>bir kun</b> uchun (so'm) kiriting.\n" +
          "Masalan:  <b>40 000</b>\n\n" +
          "(Ovqat bo'lmasa <b>0</b> yozing. Jami ovqat = shu summa × kelgan kun.)",
        { parse_mode: "HTML" },
      );
      return;
    }
    if (ctx.session.xodimStep === "yangirol_ovqat") {
      const ovqat = raqamOl(t);
      const rol = ctx.session.yangiRol;
      const fix = ctx.session.yangiRolFix ?? 0;
      const ism = ctx.session.yangiIsm;
      const tgid = ctx.session.yangiTgId;
      if (!Number.isFinite(ovqat) || ovqat < 0) {
        await ctx.reply("❌ Noto'g'ri summa. Faqat raqam kiriting (masalan 40000).");
        return;
      }
      ctx.session.xodimStep = undefined;
      ctx.session.yangiIsm = undefined;
      ctx.session.yangiTgId = undefined;
      ctx.session.yangiRol = undefined;
      ctx.session.yangiRolFix = undefined;
      if (!rol || !ism || !tgid) { await ctx.reply("Ma'lumot yo'q, qaytadan boshlang."); return; }
      const rerr = await rolSaqla(rol, fix, ovqat);
      if (rerr) { await ctx.reply("❌ Rol saqlashda xato: " + rerr); return; }
      const err = await xodimSaqla(tgid, ism, rol);
      if (err) { await ctx.reply("❌ Xato: " + err); return; }
      await ctx.reply(
        "✅ <b>Qo'shildi</b>\n\n" +
          `👤 Xodim:  <b>${esc(ism)}</b>\n` +
          `💼 Lavozim:  <b>${esc(rol)}</b>  (yangi)\n` +
          `🆔 ID:  <b>${tgid}</b>\n\n` +
          "💰 <b>Maosh qoidasi:</b>\n" +
          `• Fix maosh:  <b>${fmtSum(fix)}</b> so'm\n` +
          `• Ovqat:  <b>${fmtSum(ovqat)}</b> so'm / kun\n\n` +
          "Umumiy = fix + (ovqat × kelgan kun) + bonus.",
        { parse_mode: "HTML" },
      );
      return;
    }
  }

  // Sinovchi qo'shish oqimi
  if (ctx.session.sinovStep && t) {
    if (ctx.session.sinovStep === "ism") {
      ctx.session.sinovIsm = t;
      ctx.session.sinovStep = "tgid";
      await ctx.reply(`Ism: <b>${esc(t)}</b>\nEndi sinovchining Telegram ID (raqam) ni kiriting.`, { parse_mode: "HTML" });
      return;
    }
    if (ctx.session.sinovStep === "tgid") {
      const id = Number(t);
      if (!Number.isInteger(id) || id <= 0) {
        await ctx.reply("❌ Noto'g'ri ID. Faqat raqam kiriting.");
        return;
      }
      ctx.session.sinovTgId = id;
      ctx.session.sinovStep = "summa";
      await ctx.reply("Butun sinov davri uchun umumiy summa (so'm) ni kiriting (masalan 400000):");
      return;
    }
    if (ctx.session.sinovStep === "summa") {
      const summa = Number(t.replace(/\s/g, ""));
      if (!Number.isInteger(summa) || summa < 0) {
        await ctx.reply("❌ Noto'g'ri summa. Faqat raqam kiriting (masalan 400000).");
        return;
      }
      const boshlanish = sanaTashkent();
      const tm = new Date();
      tm.setDate(tm.getDate() + 18); // Adaptatsiya (3) + Sinov+Imtihon (15)
      const tugashMax = sanaTashkent(tm);
      const { error } = await supabase.from("sinov").insert({
        telegram_id: ctx.session.sinovTgId,
        ism: ctx.session.sinovIsm,
        boshlanish,
        tugash_max: tugashMax,
        summa_umumiy: summa,
        bosqich: "Adaptatsiya",
      });
      const ism = ctx.session.sinovIsm;
      ctx.session.sinovStep = undefined;
      ctx.session.sinovIsm = undefined;
      ctx.session.sinovTgId = undefined;
      if (error) {
        await ctx.reply("❌ Xato: " + error.message);
        return;
      }
      await ctx.reply(
        `✅ Sinovchi qo'shildi: <b>${esc(ism)}</b>\nSumma: ${fmtSum(summa)} so'm\nMuddat: ${boshlanish} → ${tugashMax}\nBosqich: Adaptatsiya`,
        { parse_mode: "HTML" },
      );
      return;
    }
  }

  // Tanilmagan matn — iliq javob + menyuni qayta ko'rsatish (bold, ochiq)
  const uid = ctx.from?.id;
  const xu = uid ? await xodimByTgId(uid) : null;
  if (!xu) {
    await ctx.reply(
      "👋 <b>Assalomu alaykum!</b>\n\n" +
        "Siz hozircha tizimda ro'yxatda yo'qsiz.\n\n" +
        `Sizning Telegram ID:  <b>${uid ?? "—"}</b>\n\n` +
        "Ushbu ID ni rahbaringizga bering — u sizni tizimga qo'shadi.",
      { parse_mode: "HTML" },
    );
    return;
  }
  const fbSuper = superAdminmi(xu.telegram_id);
  const fbRahbar = rahbarmi(xu.rol);
  const satr = [
    `👋 <b>Assalomu alaykum, ${esc(xu.ism)}!</b>`,
    "",
    "Men — <b>iMed HR yordamchisi</b>. Quyidagi tugmalar orqali ishlaymiz:",
    "",
    "🟢 <b>Keldim</b>   /   🔴 <b>Ketdim</b>",
    "🍽 <b>Tushlikka</b>   /   ↩️ <b>Tushlikdan keldim</b>",
  ];
  if (fbRahbar || fbSuper) {
    satr.push("");
    satr.push("📊 <b>Hisobotlar</b>   ·   👥 <b>Xodimlar</b>");
    satr.push("💰 <b>Maosh</b>   ·   🧪 <b>Sinov</b>");
  }
  satr.push("");
  satr.push("Kerakli tugmani bosing yoki <b>/start</b> yuboring 👇");
  await ctx.reply(satr.join("\n"), {
    parse_mode: "HTML",
    reply_markup: menuForAccess(fbRahbar, fbSuper),
  });
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
  // Debug: render testi (Telegram'siz tekshirish uchun) — Storage'ga yuklaydi
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("test") === "davomat") {
    try {
      const png = await davomatPng(sanaTashkent(), await davomatRows());
      const { error } = await supabase.storage.from("debug")
        .upload("davomat.png", png, { contentType: "image/png", upsert: true });
      return new Response(JSON.stringify({ ok: !error, bytes: png.length, err: error?.message ?? null }),
        { headers: { "content-type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, err: String(e) }),
        { status: 500, headers: { "content-type": "application/json" } });
    }
  }
  if (req.method === "GET" && url.searchParams.get("test") === "maosh") {
    try {
      const oy = joriyOy();
      // deno-lint-ignore no-explicit-any
      const { data } = await supabase.rpc("maosh_oylik", { p_oy: oy }) as { data: any[] | null };
      const png = await maoshPng(oy, (data ?? []) as MaoshRow[]);
      const { error } = await supabase.storage.from("debug")
        .upload("maosh.png", png, { contentType: "image/png", upsert: true });
      return new Response(JSON.stringify({ ok: !error, bytes: png.length, err: error?.message ?? null }),
        { headers: { "content-type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, err: String(e) }),
        { status: 500, headers: { "content-type": "application/json" } });
    }
  }
  return new Response("iMed HR bot webhook ishlayapti", { status: 200 });
});
