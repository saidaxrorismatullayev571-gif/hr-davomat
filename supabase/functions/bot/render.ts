// iMed HR bot — vizual dashboard PNG (Satori + resvg-wasm, edge ichida)
// Tashqi xizmatsiz: wasm va fontlar CDN'dan cold-startda bir marta olinadi va keshlanadi.
import satori from "npm:satori@0.10.13";
import { html } from "npm:satori-html@0.3.2";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";

const WASM_URL = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
const FONT_REG = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff";
const FONT_BOLD = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff";

let fontReg: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let readyPromise: Promise<void> | null = null;

async function _init() {
  const [wasm, fr, fb] = await Promise.all([
    fetch(WASM_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_REG).then((r) => r.arrayBuffer()),
    fetch(FONT_BOLD).then((r) => r.arrayBuffer()),
  ]);
  await initWasm(wasm);
  fontReg = fr;
  fontBold = fb;
}
function ensureReady(): Promise<void> {
  if (!readyPromise) readyPromise = _init().catch((e) => { readyPromise = null; throw e; });
  return readyPromise;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function toPng(markup: string, width: number, height: number): Promise<Uint8Array> {
  await ensureReady();
  const svg = await satori(html(markup), {
    width, height,
    fonts: [
      { name: "Noto Sans", data: fontReg!, weight: 400, style: "normal" },
      { name: "Noto Sans", data: fontBold!, weight: 700, style: "normal" },
    ],
  });
  // 1x render (edge CPU/xotira chegarasi uchun) — Telegram'da baribir tiniq
  const png = new Resvg(svg, {
    background: "#E7EFF8",
    fitTo: { mode: "width", value: width },
  }).render().asPng();
  return png;
}

const PCT: Record<string, [string, string]> = {
  ok: ["#E4F5EA", "#2E9E5B"], warn: ["#FDF0DE", "#E6902A"],
  bad: ["#FBE7EB", "#D5556A"], auto: ["#E7F0FB", "#2E86D6"],
};
function holatKey(h: string | null): string {
  if (!h) return "bad";
  if (h === "Kech qoldi") return "warn";
  if (h === "Avtomatik") return "auto";
  return "ok";
}
function gauge(pct: number): string {
  const r = 64, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
    <circle cx="75" cy="75" r="64" fill="none" stroke="#E8EEF5" stroke-width="16"/>
    <circle cx="75" cy="75" r="64" fill="none" stroke="#2AA84F" stroke-width="16" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 75 75)"/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
const CARD = "background:white;border-radius:18px;box-shadow:0 6px 20px rgba(20,60,110,0.10);padding:22px 24px;display:flex;";

export interface DavomatRow { ism: string; keldi: string; ketdi: string; soat: number | null; holat: string | null; }

export async function davomatPng(sana: string, rows: DavomatRow[]): Promise<Uint8Array> {
  const present = rows.filter((r) => r.holat && r.soat !== null);
  const kelgan = present.length;
  const jami = rows.length;
  const pct = jami ? Math.round((kelgan / jami) * 100) : 0;
  const jamiSoat = present.reduce((s, r) => s + (r.soat || 0), 0);
  const ort = kelgan ? (jamiSoat / kelgan).toFixed(1) : "0";
  const kech = rows.filter((r) => r.holat === "Kech qoldi").length;
  const vaqtida = rows.filter((r) => r.holat === "Vaqtida").length;
  const maxSoat = Math.max(1, ...present.map((r) => r.soat || 0));
  const bars = [...present].sort((a, b) => (b.soat || 0) - (a.soat || 0)).slice(0, 10);

  const th = (t: string, w: string, al = "flex-start") =>
    `<div style="display:flex;width:${w};justify-content:${al};font-size:14px;font-weight:700;color:white;">${t}</div>`;
  const tr = (r: DavomatRow, i: number) => {
    const [bg, fg] = PCT[holatKey(r.holat)];
    const label = r.holat ?? "Kelmadi";
    const soat = r.soat === null ? "—" : r.soat.toFixed(1);
    return `<div style="display:flex;align-items:center;padding:12px 14px;background:${i % 2 ? "#F7FAFD" : "#FFFFFF"};border-bottom:1px solid #E5EBF2;">
      <div style="display:flex;width:210px;font-size:15px;font-weight:700;color:#0E2A47;">${esc(r.ism)}</div>
      <div style="display:flex;width:85px;font-size:15px;color:#1B2B41;">${esc(r.keldi)}</div>
      <div style="display:flex;width:85px;font-size:15px;color:#1B2B41;">${esc(r.ketdi)}</div>
      <div style="display:flex;width:64px;font-size:15px;font-weight:700;color:#1B2B41;justify-content:flex-end;">${soat}</div>
      <div style="display:flex;flex:1;justify-content:flex-end;"><div style="display:flex;background:${bg};color:${fg};font-size:13px;font-weight:700;padding:4px 12px;border-radius:20px;">${esc(label)}</div></div>
    </div>`;
  };
  const bar = (r: DavomatRow) => {
    const w = Math.round(((r.soat || 0) / maxSoat) * 100);
    return `<div style="display:flex;align-items:center;">
      <div style="display:flex;width:170px;justify-content:flex-end;font-size:15px;font-weight:600;color:#1B2B41;padding-right:12px;">${esc(r.ism)}</div>
      <div style="display:flex;flex:1;height:22px;background:#EEF3F8;border-radius:8px;"><div style="display:flex;width:${w}%;height:22px;background:linear-gradient(90deg,#2E86D6,#1466B8);border-radius:8px;"></div></div>
      <div style="display:flex;width:56px;justify-content:flex-end;font-size:15px;font-weight:700;color:#0E2A47;">${(r.soat || 0).toFixed(1)}</div>
    </div>`;
  };

  const markup = `<div style="display:flex;flex-direction:column;width:1400px;background:#E7EFF8;padding:26px;font-family:'Noto Sans';">
    <div style="display:flex;align-items:center;justify-content:space-between;border-radius:20px;padding:26px 34px;background:linear-gradient(100deg,#0F5FB0,#1E79C4,#2AA84F);">
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;font-size:38px;font-weight:700;color:white;">BUGUNGI DAVOMAT DASHBOARDI</div>
        <div style="display:flex;font-size:16px;color:#EAF4FF;margin-top:4px;">iMed Team · davomat nazorati</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);padding:12px 20px;border-radius:14px;">
        <div style="display:flex;font-size:12px;color:#EAF4FF;">SANA</div>
        <div style="display:flex;font-size:18px;font-weight:700;color:white;">${esc(sana)}</div>
      </div>
    </div>
    <div style="display:flex;gap:20px;margin-top:20px;">
      <div style="${CARD}flex:1;align-items:center;gap:24px;">
        <div style="display:flex;position:relative;width:150px;height:150px;align-items:center;justify-content:center;">
          <img src="${gauge(pct)}" width="150" height="150" style="position:absolute;top:0;left:0;" />
          <div style="display:flex;flex-direction:column;align-items:center;">
            <div style="display:flex;font-size:30px;font-weight:700;color:#0E2A47;">${kelgan}/${jami}</div>
            <div style="display:flex;font-size:13px;color:#6B7A90;">keldi</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;">
          <div style="display:flex;font-size:19px;font-weight:600;color:#6B7A90;">KELGANLAR</div>
          <div style="display:flex;font-size:50px;font-weight:700;color:#0E2A47;">${kelgan}</div>
          <div style="display:flex;background:#E4F5EA;color:#2E9E5B;font-size:14px;font-weight:700;padding:5px 12px;border-radius:20px;margin-top:8px;">${pct}% davomat</div>
        </div>
      </div>
      <div style="${CARD}flex:1;align-items:center;">
        <div style="display:flex;flex-direction:column;">
          <div style="display:flex;font-size:19px;font-weight:600;color:#6B7A90;">O‘RTACHA ISH SOATI</div>
          <div style="display:flex;font-size:50px;font-weight:700;color:#0E2A47;">${ort}</div>
          <div style="display:flex;background:#E7F0FB;color:#2E86D6;font-size:14px;font-weight:700;padding:5px 12px;border-radius:20px;margin-top:8px;">soat / xodim</div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:20px;margin-top:20px;align-items:flex-start;">
      <div style="${CARD}flex-direction:column;flex:1;">
        <div style="display:flex;font-size:22px;font-weight:700;color:#0E2A47;margin-bottom:14px;">Davomat jadvali</div>
        <div style="display:flex;align-items:center;padding:12px 14px;border-radius:10px;background:linear-gradient(90deg,#1E79C4,#2E86D6);">
          ${th("Xodim", "210px")}${th("Keldi", "85px")}${th("Ketdi", "85px")}${th("Soat", "64px", "flex-end")}
          <div style="display:flex;flex:1;justify-content:flex-end;font-size:14px;font-weight:700;color:white;">Holat</div>
        </div>
        ${rows.map(tr).join("")}
        <div style="display:flex;align-items:center;padding:13px 14px;background:#EAF3FC;border-top:2px solid #2E86D6;">
          <div style="display:flex;width:210px;font-size:16px;font-weight:700;color:#0E2A47;">JAMI</div>
          <div style="display:flex;flex:1;font-size:16px;font-weight:700;color:#0E2A47;">${kelgan}/${jami} keldi · ${(jamiSoat).toFixed(1)} soat</div>
        </div>
      </div>
      <div style="${CARD}flex-direction:column;flex:1;">
        <div style="display:flex;font-size:22px;font-weight:700;color:#0E2A47;margin-bottom:14px;">Ish soati — xodimlar</div>
        <div style="display:flex;flex-direction:column;gap:14px;">${bars.map(bar).join("") || '<div style="display:flex;color:#6B7A90;">Bugun hali hech kim kelmadi</div>'}</div>
        <div style="display:flex;gap:14px;margin-top:18px;">
          <div style="display:flex;flex-direction:column;flex:1;background:linear-gradient(120deg,#1E79C4,#1466B8);border-radius:14px;padding:14px 16px;">
            <div style="display:flex;font-size:13px;color:white;">Kech qolganlar</div>
            <div style="display:flex;font-size:30px;font-weight:700;color:white;">${kech}</div>
          </div>
          <div style="display:flex;flex-direction:column;flex:1;background:linear-gradient(120deg,#2FAe57,#2AA84F);border-radius:14px;padding:14px 16px;">
            <div style="display:flex;font-size:13px;color:white;">Vaqtida kelganlar</div>
            <div style="display:flex;font-size:30px;font-weight:700;color:white;">${vaqtida}</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  return await toPng(markup, 1452, 1180);
}
