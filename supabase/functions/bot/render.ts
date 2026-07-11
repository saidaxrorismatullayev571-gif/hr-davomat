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
function fmtSum(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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

export interface MaoshRow { ism: string; rol: string; jami_soat: number; baza: number; bonus: number; yakuniy: number; }

export async function maoshPng(oy: string, rows: MaoshRow[]): Promise<Uint8Array> {
  const jamiY = rows.reduce((s, r) => s + Number(r.yakuniy), 0);
  const jamiB = rows.reduce((s, r) => s + Number(r.baza), 0);
  const jamiBon = rows.reduce((s, r) => s + Number(r.bonus), 0);
  const jamiS = rows.reduce((s, r) => s + Number(r.jami_soat), 0);
  const ort = rows.length ? (jamiY / rows.length / 1e6).toFixed(2) : "0";
  const maxY = Math.max(1, ...rows.map((r) => Number(r.yakuniy)));
  const barsData = [...rows].sort((a, b) => Number(b.yakuniy) - Number(a.yakuniy));

  const th = (t: string, w: string, al = "flex-start") =>
    `<div style="display:flex;width:${w};justify-content:${al};font-size:14px;font-weight:700;color:white;">${t}</div>`;
  const tr = (r: MaoshRow, i: number) =>
    `<div style="display:flex;align-items:center;padding:13px 16px;background:${i % 2 ? "#F7FAFD" : "#FFFFFF"};border-bottom:1px solid #E5EBF2;">
      <div style="display:flex;width:250px;font-size:16px;font-weight:700;color:#0E2A47;">${esc(r.ism)}</div>
      <div style="display:flex;width:130px;"><div style="display:flex;font-size:13px;font-weight:600;color:#2E86D6;background:#E7F0FB;padding:3px 10px;border-radius:8px;">${esc(r.rol)}</div></div>
      <div style="display:flex;width:110px;justify-content:flex-end;font-size:15px;font-weight:600;color:#1B2B41;">${r.jami_soat}</div>
      <div style="display:flex;width:170px;justify-content:flex-end;font-size:15px;font-weight:600;color:#1B2B41;">${fmtSum(Number(r.baza))}</div>
      <div style="display:flex;width:150px;justify-content:flex-end;font-size:15px;font-weight:600;color:#1B2B41;">${Number(r.bonus) > 0 ? fmtSum(Number(r.bonus)) : "—"}</div>
      <div style="display:flex;flex:1;justify-content:flex-end;"><div style="display:flex;background:#FCEBD6;color:#D98324;font-size:15px;font-weight:700;padding:5px 12px;border-radius:10px;">${fmtSum(Number(r.yakuniy))}</div></div>
    </div>`;
  const bar = (r: MaoshRow) => {
    const w = Math.round((Number(r.yakuniy) / maxY) * 100);
    return `<div style="display:flex;align-items:center;">
      <div style="display:flex;width:210px;justify-content:flex-end;font-size:15px;font-weight:600;color:#1B2B41;padding-right:12px;">${esc(r.ism)}</div>
      <div style="display:flex;flex:1;height:24px;background:#EEF3F8;border-radius:8px;"><div style="display:flex;width:${w}%;height:24px;background:linear-gradient(90deg,#2AA84F,#1E8E45);border-radius:8px;"></div></div>
      <div style="display:flex;width:150px;justify-content:flex-end;font-size:15px;font-weight:800;color:#0E2A47;">${fmtSum(Number(r.yakuniy))}</div>
    </div>`;
  };

  const markup = `<div style="display:flex;flex-direction:column;width:1400px;background:#E7EFF8;padding:26px;font-family:'Noto Sans';">
    <div style="display:flex;align-items:center;justify-content:space-between;border-radius:20px;padding:26px 34px;background:linear-gradient(100deg,#0F5FB0,#1E79C4,#2AA84F);">
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;font-size:38px;font-weight:700;color:white;">OYLIK MAOSH DASHBOARDI</div>
        <div style="display:flex;font-size:16px;color:#EAF4FF;margin-top:4px;">iMed Team · maosh varaqasi</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);padding:12px 20px;border-radius:14px;">
        <div style="display:flex;font-size:12px;color:#EAF4FF;">DAVR</div>
        <div style="display:flex;font-size:18px;font-weight:700;color:white;">${esc(oy)}</div>
      </div>
    </div>
    <div style="display:flex;gap:20px;margin-top:20px;">
      <div style="background:linear-gradient(120deg,#0E2A47,#14345A);border-radius:18px;box-shadow:0 6px 20px rgba(20,60,110,0.10);padding:22px 24px;display:flex;flex-direction:column;align-items:flex-start;flex:1.4;">
        <div style="display:flex;font-size:16px;font-weight:600;color:#B9C9DE;">JAMI TO‘LOV (UZS)</div>
        <div style="display:flex;font-size:44px;font-weight:700;color:white;margin-top:6px;">${fmtSum(jamiY)}</div>
        <div style="display:flex;background:#E4F5EA;color:#2E9E5B;font-size:14px;font-weight:700;padding:5px 14px;border-radius:20px;margin-top:12px;">so‘m</div>
      </div>
      <div style="${CARD}flex-direction:column;flex:1;">
        <div style="display:flex;font-size:16px;font-weight:600;color:#6B7A90;">XODIMLAR</div>
        <div style="display:flex;font-size:44px;font-weight:700;color:#0E2A47;margin-top:6px;">${rows.length}</div>
      </div>
      <div style="${CARD}flex-direction:column;flex:1;">
        <div style="display:flex;font-size:16px;font-weight:600;color:#6B7A90;">O‘RTACHA</div>
        <div style="display:flex;align-items:flex-end;margin-top:6px;">
          <div style="display:flex;font-size:44px;font-weight:700;color:#0E2A47;">${ort}</div>
          <div style="display:flex;font-size:20px;color:#6B7A90;font-weight:600;margin-left:6px;margin-bottom:8px;">mln</div>
        </div>
      </div>
    </div>
    <div style="${CARD}flex-direction:column;margin-top:20px;">
      <div style="display:flex;font-size:22px;font-weight:700;color:#0E2A47;margin-bottom:14px;">Maosh varaqasi</div>
      <div style="display:flex;align-items:center;padding:13px 16px;border-radius:10px;background:linear-gradient(90deg,#0E2A47,#1C3E68);">
        ${th("Xodim", "250px")}${th("Rol", "130px")}${th("Ish soati", "110px", "flex-end")}${th("Baza", "170px", "flex-end")}${th("Bonus", "150px", "flex-end")}
        <div style="display:flex;flex:1;justify-content:flex-end;font-size:14px;font-weight:700;color:white;">Umumiy maosh</div>
      </div>
      ${rows.map(tr).join("")}
      <div style="display:flex;align-items:center;padding:14px 16px;background:#EAF3FC;border-top:2px solid #0E2A47;">
        <div style="display:flex;width:250px;font-size:16px;font-weight:800;color:#0E2A47;">JAMI</div>
        <div style="display:flex;width:130px;"></div>
        <div style="display:flex;width:110px;justify-content:flex-end;font-size:15px;font-weight:800;color:#0E2A47;">${jamiS}</div>
        <div style="display:flex;width:170px;justify-content:flex-end;font-size:15px;font-weight:800;color:#0E2A47;">${fmtSum(jamiB)}</div>
        <div style="display:flex;width:150px;justify-content:flex-end;font-size:15px;font-weight:800;color:#0E2A47;">${fmtSum(jamiBon)}</div>
        <div style="display:flex;flex:1;justify-content:flex-end;"><div style="display:flex;background:#0E2A47;color:white;font-size:16px;font-weight:800;padding:6px 14px;border-radius:10px;">${fmtSum(jamiY)}</div></div>
      </div>
    </div>
    <div style="${CARD}flex-direction:column;margin-top:20px;">
      <div style="display:flex;font-size:22px;font-weight:700;color:#0E2A47;margin-bottom:14px;">Umumiy maosh — xodimlar bo‘yicha</div>
      <div style="display:flex;flex-direction:column;gap:14px;">${barsData.map(bar).join("") || '<div style="display:flex;color:#6B7A90;">Ma’lumot yo’q</div>'}</div>
    </div>
  </div>`;

  return await toPng(markup, 1452, 1320);
}
