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
  // Davomatni qo'lda tuzatish oqimi
  tuzatStep?: "sana" | "keldi" | "ketdi";
  tuzatTgId?: number;
  tuzatIsm?: string;
  tuzatSana?: string;
  tuzatKeldi?: string | null;
  // Xodim kartasi tahrir oqimi
  kartaStep?: "telefon" | "ishga_kirgan" | "izoh" | "tug_sana";
  kartaId?: number;
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
  if (!data) return null;
  // Rol huquqlari (flaglar) biriktiriladi — ruxsatlar data-driven
  // deno-lint-ignore no-explicit-any
  const { data: rl } = await supabase.from("rollar")
    .select("hisobot_koradi, xodim_boshqaradi, maosh_koradi, sinov_boshqaradi, davomat_tuzata_oladi, signal_oladi, sozlama_boshqaradi")
    .eq("nom", data.rol).maybeSingle() as { data: any | null };
  return { ...data, huquq: rl ?? {} };
}
const superAdminmi = (id: number) => SUPER_ADMIN_IDS.includes(id);
// Huquq tekshiruvi — super admin barchasiga ega, qolgani rollar flagidan
// deno-lint-ignore no-explicit-any
function ruxsat(x: any, flag: string): boolean {
  return superAdminmi(x.telegram_id) || Boolean(x?.huquq?.[flag]);
}
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
    } else if (d?.holat === "Kasal") {
      qatorlar.push(`🤒 <b>${esc(x.ism)}</b> — kasal`);
    } else if (d?.holat === "Sababli") {
      qatorlar.push(`📄 <b>${esc(x.ism)}</b> — sababli`);
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
    return { ism: x.ism, keldi: "—", ketdi: "—", soat: null, holat: d?.holat ?? null };
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

// ── Xodim kartasi (B faza) ────────────────────────────────
const KUN_NOM = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
function damKunMatn(arr: number[] | null): string {
  if (!arr || arr.length === 0) return "—";
  return [...arr].sort((a, b) => a - b).map((d) => KUN_NOM[d] ?? String(d)).join(", ");
}

// Xodimlar ro'yxati klaviaturasi (har biri — karta tugmasi)
// deno-lint-ignore no-explicit-any
function xodimlarKb(xl: any[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  xl.forEach((e, i) => { kb.text(`${e.arxiv ? "🗄 " : ""}${e.ism}`, `xk_${e.id}`); if (i % 2 === 1) kb.row(); });
  kb.row().text("➕ Xodim qo'shish", "xq_add").text("🗄 Arxiv", "xk_arxlist");
  return kb;
}

// Bitta xodim kartasi: matn + tahrir klaviaturasi
async function xodimKarta(id: number): Promise<{ text: string; kb: InlineKeyboard } | null> {
  // deno-lint-ignore no-explicit-any
  const { data: x } = await supabase.from("xodimlar").select("*").eq("id", id).maybeSingle() as { data: any | null };
  if (!x) return null;
  const oy = joriyOy();
  // deno-lint-ignore no-explicit-any
  const { data: dv } = await supabase.from("davomat")
    .select("sana, sof_min").eq("telegram_id", x.telegram_id).gte("sana", `${oy}-01`) as { data: any[] | null };
  const kunlar = new Set((dv ?? []).map((r) => r.sana)).size;
  const jamiMin = (dv ?? []).reduce((s, r) => s + (Number(r.sof_min) || 0), 0);
  const soat = (jamiMin / 60).toFixed(1);

  const L: string[] = [
    `👤 <b>${esc(x.ism)}</b>`,
    `💼 Lavozim:  <b>${esc(x.rol)}</b>`,
    `📞 Telefon:  ${x.telefon ? esc(x.telefon) : "—"}`,
    `📅 Ishga kirgan:  ${x.ishga_kirgan ?? "—"}`,
    `🛏 Dam kunlar:  ${damKunMatn(x.dam_kunlar)}`,
  ];
  if (x.tug_sana) L.push(`🎂 Tug'ilgan:  ${x.tug_sana}`);
  L.push(`🆔 ID:  <code>${x.telegram_id}</code>`);
  if (x.hisobga_olinmaydi) L.push("⚪️ <i>Hisobga olinmaydi</i>");
  if (x.izoh) L.push("", `📝 <i>${esc(x.izoh)}</i>`);
  L.push("", `📊 <b>Bu oy</b> (${oy}):  <b>${kunlar}</b> kun · <b>${soat}</b> soat`);
  if (x.arxiv) L.push("", "🗄 <b>ARXIVLANGAN</b>" + (x.arxiv_sana ? ` (${x.arxiv_sana})` : ""));

  const kb = new InlineKeyboard()
    .text("📞 Telefon", `xkt_${id}`).text("📅 Ishga kirgan", `xks_${id}`).row()
    .text("🛏 Dam kunlar", `xkd_${id}`).text("📝 Izoh", `xki_${id}`).row()
    .text("🎂 Tug'ilgan", `xkb_${id}`).text("🔄 Rol", `xkr_${id}`).row()
    .text(x.arxiv ? "♻️ Tiklash" : "🗄 Arxivlash", `xka_${id}`).row()
    .text("« Ro'yxat", "xk_list");
  return { text: L.join("\n"), kb };
}

// Dam kunlar tanlash klaviaturasi (toggle)
function damKunKb(id: number, tanlangan: number[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  const set = new Set(tanlangan ?? []);
  KUN_NOM.forEach((nom, d) => {
    kb.text(`${set.has(d) ? "✅" : "▫️"} ${nom}`, `xkdt_${id}_${d}`);
    if (d % 2 === 1) kb.row();
  });
  kb.row().text("« Karta", `xk_${id}`);
  return kb;
}

// Rol tanlash klaviaturasi mavjud xodim uchun (rolni o'zgartirish)
function rolOzgartirKb(id: number, roles: string[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  roles.forEach((r, i) => { kb.text(r, `xkrs_${id}_${r}`); if (i % 2 === 1) kb.row(); });
  kb.row().text("« Karta", `xk_${id}`);
  return kb;
}

// Ism bo'yicha xodim topish ("X haqida ayt" uchun) — bitta aniq moslik qaytaradi
// deno-lint-ignore no-explicit-any
async function xodimIzla(matn: string): Promise<any | null> {
  const { data } = await supabase.from("xodimlar").select("id, ism, telegram_id").order("ism") as { data: any[] | null };
  const q = matn.toLowerCase();
  const mos = (data ?? []).filter((x) => {
    const ism = String(x.ism).toLowerCase();
    if (q.includes(ism)) return true;
    // ismning birinchi so'zi ham qidiriladi (masalan "Saidaxror haqida")
    const bir = ism.split(/\s+/)[0];
    return bir.length >= 3 && q.includes(bir);
  });
  return mos.length === 1 ? mos[0] : null;
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
// Sana YYYY-MM-DD to'g'riligi
function sanaTogri(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00+05:00`));
}
// "HH:MM" ni berilgan sanaga Asia/Tashkent (UTC+5) ISO vaqtga aylantirish
function vaqtIso(sana: string, hhmm: string): string | null {
  const m = String(hhmm).trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  return new Date(`${sana}T${hh}:${m[2]}:00+05:00`).toISOString();
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
  maosh: "💰 Maosh", sinov: "🧪 Sinov", admin: "⚙️ Sozlamalar",
  tuzat: "✏️ Davomat tuzatish",
};
// Menyu — faqat xodim huquqiga mos tugmalar (CEO ortiqcha tugma ko'rmaydi)
// deno-lint-ignore no-explicit-any
function menuFor(x: any): Keyboard {
  const kb = new Keyboard()
    .text(TUGMA.keldi).text(TUGMA.ketdi).row()
    .text(TUGMA.tushlikka).text(TUGMA.tushlikdan).row();
  const b: string[] = [];
  if (ruxsat(x, "hisobot_koradi")) b.push(TUGMA.hisobot);
  if (ruxsat(x, "xodim_boshqaradi")) b.push(TUGMA.xodimlar);
  if (ruxsat(x, "maosh_koradi")) b.push(TUGMA.maosh);
  if (ruxsat(x, "sinov_boshqaradi")) b.push(TUGMA.sinov);
  if (ruxsat(x, "davomat_tuzata_oladi")) b.push(TUGMA.tuzat);
  if (ruxsat(x, "sozlama_boshqaradi")) b.push(TUGMA.admin);
  for (let i = 0; i < b.length; i += 2) {
    kb.text(b[i]);
    if (b[i + 1]) kb.text(b[i + 1]);
    kb.row();
  }
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

// ── Jurnal (audit log) — har bir muhim harakat shu yerga yoziladi, hech qachon o'chirilmaydi ──
async function jurnalYoz(
  kimTgId: number | undefined,
  kimIsm: string | undefined,
  harakat: string,
  jadval?: string,
  yozuvId?: string | number,
  tafsilot?: string,
  oldingi?: unknown,
  yangi?: unknown,
): Promise<void> {
  try {
    await supabase.from("jurnal").insert({
      kim_tg_id: kimTgId ?? null,
      kim_ism: kimIsm ?? null,
      harakat,
      jadval: jadval ?? null,
      yozuv_id: yozuvId != null ? String(yozuvId) : null,
      tafsilot: tafsilot ?? null,
      oldingi: oldingi ?? null,
      yangi: yangi ?? null,
    });
  } catch (e) {
    console.error("jurnal yozishda xato:", e);
  }
}

// ── Sozlamalar (config) — oson o'zgartiriladigan qiymatlar ──
async function cfgGet(kalit: string, def = ""): Promise<string> {
  const { data } = await supabase.from("config").select("qiymat").eq("kalit", kalit).maybeSingle();
  return (data?.qiymat ?? def) as string;
}
async function cfgSet(kalit: string, qiymat: string): Promise<void> {
  await supabase.from("config").upsert({ kalit, qiymat }, { onConflict: "kalit" });
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
  return menuFor(x);
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
  const rolTavsif = superAdminmi(tgId) ? "Super admin" : x.rol;
  await ctx.reply(
    `👋 <b>Assalomu alaykum, ${esc(x.ism)}!</b>\n\n` +
      `Lavozim:  <b>${esc(rolTavsif)}</b>\n\n` +
      "Quyidagi <b>menyu tugmalari</b> orqali davomat qiling 👇",
    { parse_mode: "HTML", reply_markup: menuFor(x) },
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
  jurnalYoz(x.telegram_id, x.ism, "tushlikka", "davomat", sanaTashkent(), soatMatn(now));
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
  jurnalYoz(x.telegram_id, x.ism, "tushlikdan_qaytdi", "davomat", sanaTashkent(), soatMatn(now));
  await ctx.reply(`↩️ Tushlikdan qaytdingiz: <b>${soatMatn(now)}</b>.`, { parse_mode: "HTML" });
});

bot.hears(TUGMA.hisobot, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  if (!ruxsat(x, "hisobot_koradi")) {
    await ctx.reply("Bu bo'lim uchun ruxsatingiz yo'q.");
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
  if (!x || !ruxsat(x, "hisobot_koradi")) {
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
  if (!x || !ruxsat(x, "hisobot_koradi")) {
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
  if (!x || !ruxsat(x, "xodim_boshqaradi")) {
    await ctx.reply("Bu bo'lim uchun ruxsatingiz yo'q.");
    return;
  }
  // deno-lint-ignore no-explicit-any
  const { data: xl } = await supabase.from("xodimlar")
    .select("id, ism, arxiv").eq("arxiv", false).order("ism") as { data: any[] | null };
  await ctx.reply(
    `👥 <b>Xodimlar</b> — <b>${(xl ?? []).length}</b> ta faol\n\nKartani ochish uchun ismni bosing:`,
    { parse_mode: "HTML", reply_markup: xodimlarKb(xl ?? []) },
  );
});

// Karta: ro'yxatga qaytish
bot.callbackQuery("xk_list", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  // deno-lint-ignore no-explicit-any
  const { data: xl } = await supabase.from("xodimlar")
    .select("id, ism, arxiv").eq("arxiv", false).order("ism") as { data: any[] | null };
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `👥 <b>Xodimlar</b> — <b>${(xl ?? []).length}</b> ta faol\n\nKartani ochish uchun ismni bosing:`,
    { parse_mode: "HTML", reply_markup: xodimlarKb(xl ?? []) },
  ).catch(() => {});
});

// Karta: arxivlanganlar ro'yxati
bot.callbackQuery("xk_arxlist", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  // deno-lint-ignore no-explicit-any
  const { data: xl } = await supabase.from("xodimlar")
    .select("id, ism, arxiv").eq("arxiv", true).order("ism") as { data: any[] | null };
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard();
  (xl ?? []).forEach((e, i) => { kb.text(`🗄 ${e.ism}`, `xk_${e.id}`); if (i % 2 === 1) kb.row(); });
  kb.row().text("« Faol ro'yxat", "xk_list");
  await ctx.editMessageText(
    `🗄 <b>Arxivlangan xodimlar</b> — <b>${(xl ?? []).length}</b> ta`,
    { parse_mode: "HTML", reply_markup: kb },
  ).catch(() => {});
});

// Karta: bitta xodimni ochish
bot.callbackQuery(/^xk_(\d+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const id = Number(ctx.match![1]);
  const k = await xodimKarta(id);
  await ctx.answerCallbackQuery();
  if (!k) { await ctx.reply("Xodim topilmadi."); return; }
  await ctx.editMessageText(k.text, { parse_mode: "HTML", reply_markup: k.kb }).catch(async () => {
    await ctx.reply(k.text, { parse_mode: "HTML", reply_markup: k.kb });
  });
});

// Karta: telefon / ishga_kirgan / izoh / tug_sana — matn so'rash
async function kartaSora(ctx: Ctx, id: number, step: "telefon" | "ishga_kirgan" | "izoh" | "tug_sana", savol: string) {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  ctx.session.kartaStep = step;
  ctx.session.kartaId = id;
  await ctx.answerCallbackQuery();
  await ctx.reply(savol, { parse_mode: "HTML" });
}
bot.callbackQuery(/^xkt_(\d+)$/, (ctx) => kartaSora(ctx, Number(ctx.match![1]), "telefon", "📞 Telefon raqamini kiriting (masalan +998901234567):"));
bot.callbackQuery(/^xks_(\d+)$/, (ctx) => kartaSora(ctx, Number(ctx.match![1]), "ishga_kirgan", "📅 Ishga kirgan sanani kiriting (YYYY-MM-DD, masalan 2025-03-01):"));
bot.callbackQuery(/^xki_(\d+)$/, (ctx) => kartaSora(ctx, Number(ctx.match![1]), "izoh", "📝 Izoh/eslatma kiriting (o'chirish uchun <b>-</b> yozing):"));
bot.callbackQuery(/^xkb_(\d+)$/, (ctx) => kartaSora(ctx, Number(ctx.match![1]), "tug_sana", "🎂 Tug'ilgan sanani kiriting (YYYY-MM-DD):"));

// Karta: dam kunlar — toggle klaviaturasi
bot.callbackQuery(/^xkd_(\d+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const id = Number(ctx.match![1]);
  // deno-lint-ignore no-explicit-any
  const { data: xo } = await supabase.from("xodimlar").select("dam_kunlar").eq("id", id).maybeSingle() as { data: any | null };
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🛏 <b>Dam kunlarni</b> belgilang (bosib yoqiladi/o'chiriladi):", {
    parse_mode: "HTML", reply_markup: damKunKb(id, xo?.dam_kunlar ?? []),
  }).catch(() => {});
});
bot.callbackQuery(/^xkdt_(\d+)_(\d)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const id = Number(ctx.match![1]);
  const d = Number(ctx.match![2]);
  // deno-lint-ignore no-explicit-any
  const { data: xo } = await supabase.from("xodimlar").select("dam_kunlar").eq("id", id).maybeSingle() as { data: any | null };
  const set = new Set<number>(xo?.dam_kunlar ?? []);
  set.has(d) ? set.delete(d) : set.add(d);
  const yangi = [...set].sort((a, b) => a - b);
  await supabase.from("xodimlar").update({ dam_kunlar: yangi }).eq("id", id);
  jurnalYoz(x.telegram_id, x.ism, "dam_kun_ozgardi", "xodimlar", id, `${KUN_NOM[d]} ${set.has(d) ? "yoqildi" : "o'chirildi"}`, { dam_kunlar: xo?.dam_kunlar ?? [] }, { dam_kunlar: yangi });
  await ctx.answerCallbackQuery(KUN_NOM[d] + (set.has(d) ? " ✅" : " ❌"));
  await ctx.editMessageReplyMarkup({ reply_markup: damKunKb(id, yangi) }).catch(() => {});
});

// Karta: rol o'zgartirish
bot.callbackQuery(/^xkr_(\d+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const id = Number(ctx.match![1]);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🔄 <b>Yangi rol (lavozim)</b>ni tanlang:", {
    parse_mode: "HTML", reply_markup: rolOzgartirKb(id, await rollarList()),
  }).catch(() => {});
});
bot.callbackQuery(/^xkrs_(\d+)_(.+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const id = Number(ctx.match![1]);
  const rol = ctx.match![2];
  // deno-lint-ignore no-explicit-any
  const { data: eski } = await supabase.from("xodimlar").select("rol, ism").eq("id", id).maybeSingle() as { data: any | null };
  await supabase.from("xodimlar").update({ rol }).eq("id", id);
  jurnalYoz(x.telegram_id, x.ism, "rol_ozgardi", "xodimlar", id, `${esc(eski?.ism)}: ${eski?.rol} → ${rol}`, { rol: eski?.rol }, { rol });
  await ctx.answerCallbackQuery("✅ Rol: " + rol);
  const k = await xodimKarta(id);
  if (k) await ctx.editMessageText(k.text, { parse_mode: "HTML", reply_markup: k.kb }).catch(() => {});
});

// Karta: arxivlash / tiklash (NO HARD DELETE)
bot.callbackQuery(/^xka_(\d+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const id = Number(ctx.match![1]);
  // deno-lint-ignore no-explicit-any
  const { data: xo } = await supabase.from("xodimlar").select("arxiv, ism").eq("id", id).maybeSingle() as { data: any | null };
  const yangi = !(xo?.arxiv);
  await supabase.from("xodimlar").update({
    arxiv: yangi, arxiv_sana: yangi ? sanaTashkent() : null,
  }).eq("id", id);
  jurnalYoz(x.telegram_id, x.ism, yangi ? "arxivladi" : "tiklandi", "xodimlar", id, esc(xo?.ism));
  await ctx.answerCallbackQuery(yangi ? "🗄 Arxivlandi" : "♻️ Tiklandi");
  const k = await xodimKarta(id);
  if (k) await ctx.editMessageText(k.text, { parse_mode: "HTML", reply_markup: k.kb }).catch(() => {});
});

// Xodim qo'shish — boshlash
bot.callbackQuery("xq_add", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) {
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
  const kim = await xodimByTgId(ctx.from!.id);
  jurnalYoz(kim?.telegram_id, kim?.ism, "xodim_qoshdi", "xodimlar", tgid, `${ism} — ${rol}`, null, { ism, rol, telegram_id: tgid });
  await ctx.reply(`✅ Qo'shildi: <b>${esc(ism)}</b> — ${esc(rol)} (ID ${tgid})`, { parse_mode: "HTML" });
});

// Yangi rol (lavozim) yaratish — nomni so'raydi
bot.callbackQuery("xq_yangirol", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "xodim_boshqaradi")) {
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
  if (!x || !ruxsat(x, "maosh_koradi")) {
    await ctx.reply("Bu bo'lim uchun ruxsatingiz yo'q.");
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
  if (!x || !ruxsat(x, "maosh_koradi")) {
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
  if (!x || !ruxsat(x, "sinov_boshqaradi")) {
    await ctx.reply("Bu bo'lim uchun ruxsatingiz yo'q.");
    return;
  }
  const matn = await sinovRoyxati();
  const kb = new InlineKeyboard().text("➕ Sinovchi qo'shish", "sinov_add");
  await ctx.reply(matn, { parse_mode: "HTML", reply_markup: kb });
});

bot.callbackQuery("sinov_add", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sinov_boshqaradi")) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  ctx.session.sinovStep = "ism";
  ctx.session.sinovIsm = undefined;
  ctx.session.sinovTgId = undefined;
  await ctx.answerCallbackQuery();
  await ctx.reply("Sinovchi ismini kiriting:");
});

// ── Sozlamalar paneli (sozlama_boshqaradi / super admin) ──
async function sozlamaMatn(): Promise<string> {
  const video = await cfgGet("video_guruhga", "yoq");
  const tatil = await cfgGet("tatil_yoq", "yoq");
  const anomaliya = await cfgGet("anomaliya_kun", "3");
  const sig = await cfgGet("signal_qabul", "");
  let sigNom = "Super admin (birlamchi)";
  if (sig) {
    // deno-lint-ignore no-explicit-any
    const { data: xo } = await supabase.from("xodimlar").select("ism").eq("telegram_id", Number(sig)).maybeSingle() as { data: any | null };
    sigNom = xo?.ism ? `${xo.ism} (${sig})` : sig;
  }
  return [
    "⚙️ <b>Sozlamalar</b>",
    "",
    `📹 Dumaloq video guruhga:  <b>${video === "ha" ? "YOQILGAN" : "O'CHIQ"}</b>`,
    `🏖 Ta'til moduli:  <b>${tatil === "ha" ? "YOQILGAN" : "O'CHIQ"}</b>`,
    `🔔 Anomaliya chegarasi:  <b>${anomaliya}</b> kun`,
    `📩 Signal/xulosa qabul qiluvchi:  <b>${esc(sigNom)}</b>`,
    "",
    "O'zgartirish uchun tugmani bosing 👇",
  ].join("\n");
}
function sozlamaKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📹 Video guruhga", "cfg_video").text("🏖 Ta'til moduli", "cfg_tatil").row()
    .text("📩 Signal qabul qiluvchi", "cfg_signal").row()
    .text("🔐 Rol huquqlari", "cfg_rollar").row()
    .text("🧾 Jurnal (oxirgi harakatlar)", "cfg_jurnal|0");
}

// Jurnal (audit log) ko'rish — 15 tadan sahifalab, eng yangisi tepada
const JURNAL_HARAKAT_EMOJI: Record<string, string> = {
  keldi: "🟢", ketdi: "🔴", tushlikka: "🍽", tushlikdan_qaytdi: "↩️",
  xodim_qoshdi: "➕", rol_ozgardi: "🔄", arxivladi: "🗄", tiklandi: "♻️",
  dam_kun_ozgardi: "🛏", karta_tahrir: "✏️", sozlama_ozgardi: "⚙️",
  rol_huquq_ozgardi: "🔐", davomat_tuzatildi: "🛠",
};
async function jurnalMatn(sahifa: number): Promise<{ text: string; bor_keyingi: boolean }> {
  const LIMIT = 15;
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.from("jurnal").select("*")
    .order("vaqt", { ascending: false })
    .range(sahifa * LIMIT, sahifa * LIMIT + LIMIT) as { data: any[] | null };
  const rows = data ?? [];
  const borKeyingi = rows.length > LIMIT;
  const korsat = rows.slice(0, LIMIT);
  if (!korsat.length) return { text: "🧾 <b>Jurnal</b>\n\nHozircha yozuv yo'q.", bor_keyingi: false };
  const qatorlar = ["🧾 <b>Jurnal — oxirgi harakatlar</b>", ""];
  for (const j of korsat) {
    const vaqt = new Date(j.vaqt).toLocaleString("uz-UZ", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const emoji = JURNAL_HARAKAT_EMOJI[j.harakat] ?? "•";
    const kim = esc(j.kim_ism ?? j.kim_tg_id ?? "noma'lum");
    const tafsilot = j.tafsilot ? ` — ${esc(j.tafsilot)}` : "";
    qatorlar.push(`${emoji} <b>${vaqt}</b> · ${kim} · <i>${esc(j.harakat)}</i>${tafsilot}`);
  }
  return { text: qatorlar.join("\n"), bor_keyingi: borKeyingi };
}
function jurnalKb(sahifa: number, borKeyingi: boolean): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (sahifa > 0) kb.text("⬅️ Oldingi", `cfg_jurnal|${sahifa - 1}`);
  if (borKeyingi) kb.text("Keyingi ➡️", `cfg_jurnal|${sahifa + 1}`);
  return kb;
}
bot.callbackQuery(/^cfg_jurnal\|(\d+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const sahifa = Number(ctx.match![1]);
  const { text, bor_keyingi } = await jurnalMatn(sahifa);
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: jurnalKb(sahifa, bor_keyingi) });
  } catch (_e) {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: jurnalKb(sahifa, bor_keyingi) });
  }
});
bot.hears(TUGMA.admin, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.reply("Bu bo'lim uchun ruxsatingiz yo'q."); return; }
  await ctx.reply(await sozlamaMatn(), { parse_mode: "HTML", reply_markup: sozlamaKb() });
});
// Video / Ta'til yoq-o'chir
bot.callbackQuery(/^cfg_(video|tatil)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const kalit = ctx.match![1] === "video" ? "video_guruhga" : "tatil_yoq";
  const hozir = await cfgGet(kalit, "yoq");
  const yangi = hozir === "ha" ? "yoq" : "ha";
  await cfgSet(kalit, yangi);
  jurnalYoz(x.telegram_id, x.ism, "sozlama_ozgardi", "config", kalit, `${kalit}: ${hozir} → ${yangi}`, { qiymat: hozir }, { qiymat: yangi });
  await ctx.answerCallbackQuery("Saqlandi");
  try {
    await ctx.editMessageText(await sozlamaMatn(), { parse_mode: "HTML", reply_markup: sozlamaKb() });
  } catch (_e) { /* o'zgarmagan bo'lsa e'tibor bermaymiz */ }
});
// Signal/xulosa qabul qiluvchini tanlash
bot.callbackQuery("cfg_signal", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.from("xodimlar").select("telegram_id, ism").eq("arxiv", false).order("ism") as { data: any[] | null };
  const kb = new InlineKeyboard();
  (data ?? []).forEach((xo, i) => { kb.text(xo.ism, `sig_${xo.telegram_id}`); if (i % 2 === 1) kb.row(); });
  kb.row().text("↩️ Birlamchi (super admin)", "sig_0");
  await ctx.answerCallbackQuery();
  await ctx.reply("📩 Signal/xulosani kim qabul qilsin?", { reply_markup: kb });
});
bot.callbackQuery(/^sig_(\d+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const tgid = ctx.match![1];
  await cfgSet("signal_qabul", tgid === "0" ? "" : tgid);
  jurnalYoz(x.telegram_id, x.ism, "sozlama_ozgardi", "config", "signal_qabul", `signal_qabul → ${tgid}`);
  await ctx.answerCallbackQuery("Saqlandi");
  await ctx.reply("✅ Signal qabul qiluvchi yangilandi.\n\n" + await sozlamaMatn(), { parse_mode: "HTML", reply_markup: sozlamaKb() });
});
// Rol huquqlari — lavozim tanlash
const HUQUQLAR: [string, string][] = [
  ["hisobot_koradi", "Hisobot ko'radi"],
  ["xodim_boshqaradi", "Xodim boshqaradi"],
  ["maosh_koradi", "Maosh ko'radi"],
  ["sinov_boshqaradi", "Sinov boshqaradi"],
  ["davomat_tuzata_oladi", "Davomat tuzatadi"],
  ["signal_oladi", "Signal/xulosa oladi"],
  ["sozlama_boshqaradi", "Sozlama boshqaradi"],
];
async function rolHuquqKb(rol: string): Promise<InlineKeyboard> {
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.from("rollar").select("*").eq("nom", rol).maybeSingle() as { data: any | null };
  const kb = new InlineKeyboard();
  for (const [flag, nom] of HUQUQLAR) {
    const on = Boolean(data?.[flag]);
    kb.text(`${on ? "✅" : "⬜"} ${nom}`, `rf|${rol}|${flag}`).row();
  }
  return kb;
}
bot.callbackQuery("cfg_rollar", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const roles = await rollarList();
  const kb = new InlineKeyboard();
  roles.forEach((r, i) => { kb.text(r, `rp|${r}`); if (i % 2 === 1) kb.row(); });
  await ctx.answerCallbackQuery();
  await ctx.reply("🔐 Qaysi lavozim huquqlarini o'zgartiramiz?", { reply_markup: kb });
});
bot.callbackQuery(/^rp\|(.+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const rol = ctx.match![1];
  await ctx.answerCallbackQuery();
  await ctx.reply(`🔐 <b>${esc(rol)}</b> — huquqlar (bosib yoq/o'chir):`, { parse_mode: "HTML", reply_markup: await rolHuquqKb(rol) });
});
bot.callbackQuery(/^rf\|(.+)\|([a-z_]+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "sozlama_boshqaradi")) { await ctx.answerCallbackQuery("Ruxsat yo'q"); return; }
  const rol = ctx.match![1];
  const flag = ctx.match![2];
  // deno-lint-ignore no-explicit-any
  const { data } = await supabase.from("rollar").select(flag).eq("nom", rol).maybeSingle() as { data: any | null };
  const yangi = !Boolean(data?.[flag]);
  await supabase.from("rollar").update({ [flag]: yangi }).eq("nom", rol);
  jurnalYoz(x.telegram_id, x.ism, "rol_huquq_ozgardi", "rollar", rol, `${rol}.${flag} → ${yangi}`, { [flag]: !yangi }, { [flag]: yangi });
  await ctx.answerCallbackQuery(yangi ? "Yoqildi" : "O'chirildi");
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: await rolHuquqKb(rol) });
  } catch (_e) { /* skip */ }
});

// ── Davomatni qo'lda tuzatish (HR roli / super admin) ─────
// deno-lint-ignore no-explicit-any
async function tuzatXodimKb(): Promise<InlineKeyboard> {
  const { data } = await supabase.from("xodimlar")
    .select("telegram_id, ism").eq("arxiv", false).order("ism") as { data: any[] | null };
  const kb = new InlineKeyboard();
  (data ?? []).forEach((xo, i) => { kb.text(xo.ism, `tz_pick_${xo.telegram_id}`); if (i % 2 === 1) kb.row(); });
  return kb;
}
bot.hears(TUGMA.tuzat, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { await ctx.reply("Siz ro'yxatda yo'qsiz."); return; }
  if (!ruxsat(x, "davomat_tuzata_oladi")) {
    await ctx.reply("Bu bo'lim faqat davomat mas'uli (HR) uchun.");
    return;
  }
  const kb = await tuzatXodimKb();
  await ctx.reply("✏️ <b>Davomatni tuzatish</b>\n\nQaysi xodimni tuzatamiz?", { parse_mode: "HTML", reply_markup: kb });
});
bot.callbackQuery(/^tz_pick_(\d+)$/, async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "davomat_tuzata_oladi")) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return;
  }
  const tgid = Number(ctx.match![1]);
  // deno-lint-ignore no-explicit-any
  const { data: xo } = await supabase.from("xodimlar").select("ism").eq("telegram_id", tgid).maybeSingle() as { data: any | null };
  ctx.session.tuzatTgId = tgid;
  ctx.session.tuzatIsm = xo?.ism ?? String(tgid);
  ctx.session.tuzatSana = undefined;
  ctx.session.tuzatKeldi = undefined;
  ctx.session.tuzatStep = "sana";
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `👤 <b>${esc(xo?.ism ?? tgid)}</b>\n\nQaysi <b>sana</b>ni tuzatamiz?\nBugun uchun <b>bugun</b> yozing, yoki <b>YYYY-MM-DD</b> (masalan 2026-07-12).`,
    { parse_mode: "HTML" },
  );
});
// Sana'dan keyin holat tanlash tugmalari
function tuzatHolatKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🟢 Keldi (vaqt kiritish)", "tz_h_keldi").row()
    .text("🤒 Kasal", "tz_h_kasal").text("📄 Sababli", "tz_h_sababli").row()
    .text("⬜ Kelmadi", "tz_h_kelmadi");
}
// Ruxsat + sessiya tekshiruvi (tuzatish callbacklari uchun)
async function tuzatRuxsat(ctx: Ctx): Promise<boolean> {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "davomat_tuzata_oladi")) {
    await ctx.answerCallbackQuery("Ruxsat yo'q");
    return false;
  }
  if (!ctx.session.tuzatTgId || !ctx.session.tuzatSana) {
    await ctx.answerCallbackQuery("Ma'lumot yo'q, qaytadan boshlang.");
    return false;
  }
  return true;
}
// "Keldi" tanlansa — vaqt so'raladi
bot.callbackQuery("tz_h_keldi", async (ctx) => {
  if (!(await tuzatRuxsat(ctx))) return;
  ctx.session.tuzatStep = "keldi";
  await ctx.answerCallbackQuery();
  await ctx.reply("🟢 <b>Kelgan vaqti</b>ni kiriting (HH:MM, masalan <b>09:00</b>):", { parse_mode: "HTML" });
});
// Kasal / Sababli / Kelmadi — darhol belgilanadi (keldi/ketdi bo'sh, sof_min=0)
const HOLAT_MAP: Record<string, string> = { kasal: "Kasal", sababli: "Sababli", kelmadi: "Kelmadi" };
bot.callbackQuery(/^tz_h_(kasal|sababli|kelmadi)$/, async (ctx) => {
  if (!(await tuzatRuxsat(ctx))) return;
  const holat = HOLAT_MAP[ctx.match![1]];
  const tgid = ctx.session.tuzatTgId!;
  const sana = ctx.session.tuzatSana!;
  const ism = ctx.session.tuzatIsm ?? String(tgid);
  const { error } = await supabase.from("davomat").upsert(
    { telegram_id: tgid, sana, keldi: null, tushlikka: null, qaytdi: null, ketdi: null, holat },
    { onConflict: "telegram_id,sana" },
  );
  ctx.session.tuzatStep = undefined;
  ctx.session.tuzatTgId = undefined;
  ctx.session.tuzatIsm = undefined;
  ctx.session.tuzatSana = undefined;
  ctx.session.tuzatKeldi = undefined;
  await ctx.answerCallbackQuery();
  if (error) { await ctx.reply("❌ Saqlashda xato: " + error.message); return; }
  const kim = await xodimByTgId(ctx.from!.id);
  jurnalYoz(kim?.telegram_id, kim?.ism, "davomat_tuzatildi", "davomat", `${tgid}_${sana}`, `${ism} — ${sana} — ${holat}`, null, { holat, sana });
  const emoji = holat === "Kasal" ? "🤒" : holat === "Sababli" ? "📄" : "⬜";
  await ctx.reply(
    "✅ <b>Belgilandi</b>\n\n" +
      `👤 <b>${esc(ism)}</b>\n` +
      `📅 Sana:  <b>${sana}</b>\n` +
      `${emoji} Holat:  <b>${esc(holat)}</b>`,
    { parse_mode: "HTML" },
  );
});

// Lokatsiya bosqichi
bot.on("message:location", async (ctx) => {
  if (ctx.session.step !== "lokatsiya" || !ctx.session.davomatFlow) return;
  const x = await xodimByTgId(ctx.from!.id);
  if (!x) { tozala(ctx); return; }
  if (forwardMi(ctx)) {
    tozala(ctx);
    await ctx.reply("❌ Forward qilingan lokatsiya qabul qilinmaydi.", { reply_markup: await anaMenu(x) });
    return;
  }
  const test = testRejimmi(x.telegram_id);
  const yosh = Math.floor(Date.now() / 1000) - (ctx.message?.date ?? 0);
  if (yosh > OFIS.maxYoshSek && !test) {
    tozala(ctx);
    await ctx.reply("❌ Eski lokatsiya. Joriy lokatsiyani yuboring.", { reply_markup: await anaMenu(x) });
    return;
  }
  const loc = ctx.message?.location;
  if (!loc) return;
  const { ok, masofa, radius } = await ofisdaMi(loc.latitude, loc.longitude);
  if (!ok && !test) {
    tozala(ctx);
    await ctx.reply(`❌ Siz ofisdan ${masofa} m uzoqdasiz (ruxsat: ${radius} m).`, { reply_markup: await anaMenu(x) });
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
    await ctx.reply("❌ Forward qilingan video qabul qilinmaydi.", { reply_markup: await anaMenu(x) });
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
      await ctx.reply("❌ Saqlashda xato. Qayta urinib ko'ring.", { reply_markup: await anaMenu(x) });
      return;
    }
    const holat = data?.holat ?? keldiHolat(now);
    jurnalYoz(x.telegram_id, x.ism, "keldi", "davomat", data?.id, `${soatMatn(now)} — ${holat}`, null, {
      keldi: now.toISOString(), holat, masofa_m: data?.masofa_m,
    });
    await ctx.reply(
      `✅ Keldi qayd etildi: <b>${soatMatn(now)}</b> — ${esc(holat)}`,
      { parse_mode: "HTML", reply_markup: await anaMenu(x) },
    );
    const emoji = holat === "Kech qoldi" ? "🟠" : "🟢";
    const izoh = holat === "Kech qoldi" ? " — <i>kech qoldi</i>" : "";
    await davomatXulosa(`${emoji} <b>${esc(x.ism)}</b> keldi · <b>${soatMatn(now)}</b>${izoh}`);
    // Dumaloq video guruhga (config bilan yoqiladi)
    if ((await cfgGet("video_guruhga", "yoq")) === "ha") {
      // deno-lint-ignore no-explicit-any
      const { data: cf } = await supabase.from("config").select("kalit, qiymat").in("kalit", ["xulosa_group_id", "xulosa_topic_id"]) as { data: any[] | null };
      const cmap = new Map<string, string>((cf ?? []).map((r) => [r.kalit, r.qiymat]));
      const g = cmap.get("xulosa_group_id");
      const tp = cmap.get("xulosa_topic_id");
      try {
        if (g) {
          await bot.api.sendVideoNote(g, vn.file_id, tp ? { message_thread_id: Number(tp) } : {});
        } else {
          await bot.api.sendVideoNote(GROUP_CHAT_ID_2, vn.file_id, { message_thread_id: GROUP_TOPIC_ID_2 });
        }
      } catch (e) { console.error("video guruh:", e); }
    }
  } else {
    const { data, error } = await supabase.from("davomat").update({
      ketdi: now.toISOString(), video_file_id: vn.file_id,
    }).eq("telegram_id", x.telegram_id).eq("sana", sanaTashkent(now)).select().maybeSingle();
    tozala(ctx);
    if (error) {
      console.error("ketdi update:", error);
      await ctx.reply("❌ Saqlashda xato. Qayta urinib ko'ring.", { reply_markup: await anaMenu(x) });
      return;
    }
    const soat = ((data?.sof_min ?? 0) / 60).toFixed(1);
    jurnalYoz(x.telegram_id, x.ism, "ketdi", "davomat", data?.id, `${soatMatn(now)} — ${soat} soat`, null, {
      ketdi: now.toISOString(), sof_min: data?.sof_min,
    });
    await ctx.reply(
      `✅ Ketdi qayd etildi: <b>${soatMatn(now)}</b>. Bugungi ish: <b>${soat} soat</b>.`,
      { parse_mode: "HTML", reply_markup: await anaMenu(x) },
    );
    await davomatXulosa(`🔴 <b>${esc(x.ism)}</b> ketdi · <b>${soatMatn(now)}</b> — bugun <b>${soat} soat</b>`);
  }
});

// Ovozli savol (rahbar/super admin) — Whisper + AI niyat + vizual javob
bot.on("message:voice", async (ctx) => {
  const x = await xodimByTgId(ctx.from!.id);
  if (!x || !ruxsat(x, "hisobot_koradi")) {
    await ctx.reply("Ovozli savol faqat boshqaruv uchun.");
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

    // Aniq bir xodim nomi aytilgan bo'lsa — kartani chiqar
    const nomMos = await xodimIzla(savol);
    if (nomMos) {
      const k = await xodimKarta(nomMos.id);
      if (k) { await ctx.reply(k.text, { parse_mode: "HTML" }); return; }
    }

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

  // Xodim kartasi tahrir oqimi — matn kiritish
  if (ctx.session.kartaStep && t) {
    const id = ctx.session.kartaId!;
    const step = ctx.session.kartaStep;
    if (step === "telefon") {
      await supabase.from("xodimlar").update({ telefon: t === "-" ? null : t.slice(0, 40) }).eq("id", id);
    } else if (step === "izoh") {
      await supabase.from("xodimlar").update({ izoh: t === "-" ? null : t.slice(0, 500) }).eq("id", id);
    } else if (step === "ishga_kirgan" || step === "tug_sana") {
      if (t !== "-" && !sanaTogri(t)) {
        await ctx.reply("❌ Sana formati: YYYY-MM-DD (masalan 2025-03-01), yoki - (o'chirish).");
        return;
      }
      await supabase.from("xodimlar").update({ [step]: t === "-" ? null : t }).eq("id", id);
    }
    ctx.session.kartaStep = undefined;
    ctx.session.kartaId = undefined;
    const kim = await xodimByTgId(ctx.from!.id);
    jurnalYoz(kim?.telegram_id, kim?.ism, "karta_tahrir", "xodimlar", id, `${step}: ${t}`, null, { [step]: t === "-" ? null : t });
    const k = await xodimKarta(id);
    if (k) await ctx.reply(k.text, { parse_mode: "HTML", reply_markup: k.kb });
    return;
  }

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

  // Davomatni qo'lda tuzatish oqimi (sana -> keldi -> ketdi)
  if (ctx.session.tuzatStep && t) {
    if (ctx.session.tuzatStep === "sana") {
      const s = t.toLowerCase() === "bugun" ? sanaTashkent() : t;
      if (!sanaTogri(s)) { await ctx.reply("❌ Sana formati noto'g'ri. YYYY-MM-DD (masalan 2026-07-12) yoki 'bugun' yozing."); return; }
      ctx.session.tuzatSana = s;
      ctx.session.tuzatStep = undefined;
      await ctx.reply(
        `Sana:  <b>${s}</b>\n\n<b>Holatni tanlang:</b>`,
        { parse_mode: "HTML", reply_markup: tuzatHolatKb() },
      );
      return;
    }
    if (ctx.session.tuzatStep === "keldi") {
      const iso = vaqtIso(ctx.session.tuzatSana!, t);
      if (!iso) { await ctx.reply("❌ Vaqt formati: HH:MM (masalan 09:00)."); return; }
      ctx.session.tuzatKeldi = iso;
      ctx.session.tuzatStep = "ketdi";
      await ctx.reply("🔴 <b>Ketgan vaqti</b>ni kiriting (HH:MM, masalan <b>18:00</b>) yoki <b>-</b> (hali ketmagan bo'lsa):", { parse_mode: "HTML" });
      return;
    }
    if (ctx.session.tuzatStep === "ketdi") {
      const sana = ctx.session.tuzatSana!;
      const keldiIso = ctx.session.tuzatKeldi!;
      const tgid = ctx.session.tuzatTgId!;
      const ism = ctx.session.tuzatIsm ?? String(tgid);
      let ketdiIso: string | null = null;
      if (t !== "-") {
        ketdiIso = vaqtIso(sana, t);
        if (!ketdiIso) { await ctx.reply("❌ Vaqt formati: HH:MM (masalan 18:00) yoki - kiriting."); return; }
      }
      const holat = keldiHolat(new Date(keldiIso));
      // deno-lint-ignore no-explicit-any
      const { data, error } = await supabase.from("davomat").upsert(
        { telegram_id: tgid, sana, keldi: keldiIso, ketdi: ketdiIso, holat },
        { onConflict: "telegram_id,sana" },
      ).select().maybeSingle() as { data: any | null; error: any };
      ctx.session.tuzatStep = undefined;
      ctx.session.tuzatTgId = undefined;
      ctx.session.tuzatIsm = undefined;
      ctx.session.tuzatSana = undefined;
      ctx.session.tuzatKeldi = undefined;
      if (error) { await ctx.reply("❌ Saqlashda xato: " + error.message); return; }
      const soat = ((data?.sof_min ?? 0) / 60).toFixed(1);
      const kim = await xodimByTgId(ctx.from!.id);
      jurnalYoz(
        kim?.telegram_id, kim?.ism, "davomat_tuzatildi", "davomat", `${tgid}_${sana}`,
        `${ism} — ${sana} — ${soatMatn(new Date(keldiIso))}–${ketdiIso ? soatMatn(new Date(ketdiIso)) : "—"}`,
        null, { keldi: keldiIso, ketdi: ketdiIso, holat },
      );
      await ctx.reply(
        "✅ <b>Davomat tuzatildi</b>\n\n" +
          `👤 <b>${esc(ism)}</b>\n` +
          `📅 Sana:  <b>${sana}</b>\n` +
          `🟢 Keldi:  <b>${soatMatn(new Date(keldiIso))}</b>\n` +
          `🔴 Ketdi:  <b>${ketdiIso ? soatMatn(new Date(ketdiIso)) : "—"}</b>\n` +
          `⏱ Ish vaqti:  <b>${soat} soat</b>  ·  ${esc(holat)}`,
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
  // "X haqida ayt" — ism bo'yicha karta (faqat boshqaruv huquqi bo'lsa)
  if (t && (ruxsat(xu, "xodim_boshqaradi") || ruxsat(xu, "hisobot_koradi"))) {
    const topilgan = await xodimIzla(t);
    if (topilgan) {
      const k = await xodimKarta(topilgan.id);
      if (k) {
        const kb = ruxsat(xu, "xodim_boshqaradi")
          ? k.kb
          : new InlineKeyboard(); // hisobot huquqi bo'lsa faqat ko'radi
        await ctx.reply(k.text, { parse_mode: "HTML", reply_markup: kb });
        return;
      }
    }
  }

  const satr = [
    `👋 <b>Assalomu alaykum, ${esc(xu.ism)}!</b>`,
    "",
    "Men — <b>iMed HR yordamchisi</b>. Quyidagi tugmalar orqali ishlaymiz:",
    "",
    "🟢 <b>Keldim</b>   /   🔴 <b>Ketdim</b>",
    "🍽 <b>Tushlikka</b>   /   ↩️ <b>Tushlikdan keldim</b>",
  ];
  if (ruxsat(xu, "hisobot_koradi") || ruxsat(xu, "xodim_boshqaradi") || ruxsat(xu, "maosh_koradi") || ruxsat(xu, "sinov_boshqaradi")) {
    satr.push("");
    satr.push("Boshqaruv bo'limlari ham menyuдa 👇");
  }
  satr.push("");
  satr.push("Kerakli tugmani bosing yoki <b>/start</b> yuboring 👇");
  await ctx.reply(satr.join("\n"), {
    parse_mode: "HTML",
    reply_markup: menuFor(xu),
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
