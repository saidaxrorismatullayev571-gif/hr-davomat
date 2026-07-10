# iMed HR / Davomat Bot v2

iMed Team (tibbiy ta'lim biznesi, ~15 xodim) uchun Telegram **HR + davomat + maosh** boti.
Maqsad: eski sekin Google Apps Script tizimini tez, avtomatik **Supabase + grammY** tizimiga ko'chirish.

> **Yagona haqiqat manbai:** [`iMed_HR_Bot_v2_TZ.md`](./iMed_HR_Bot_v2_TZ.md) — to'liq TZ va road map.
> **Baza sxemasi:** [`iMed_HR_Bot_v2_schema.sql`](./iMed_HR_Bot_v2_schema.sql).
> **Build konteksti (Claude Code):** [`CLAUDE.md`](./CLAUDE.md).

## Stack

| Qatlam | Texnologiya |
|---|---|
| Til | TypeScript (strict) |
| Bot | grammY |
| Baza | Supabase (Postgres) |
| Server | DigitalOcean (Node.js) |
| Cron | node-cron (bot ichida) |

## Asosiy tamoyillar

1. **Uzilishsizlik** — eski bot test tugagunча ishlaydi, almashtirish tunda.
2. **NO HARD DELETE** — hech narsa o'chirilmaydi (`arxiv=true`).
3. **Deterministik hisob** — maosh/soat SQL bilan (`imed_sof_min`), AI'ga ishonilmaydi.
4. **Rol asosida menyu** — har kim faqat o'z tugmalarini ko'radi.
5. **Faqat SHAXSIY chat** — guruh xabarlariga javob berilmaydi.

## Fazalar (qisqa)

- **Faza 0 — Poydevor:** TZ + sxema + build konteksti ✅
- **Faza 1 — Asosiy davomat (MVP):** grammY skelet, keldi/tushlik/ketdi + lokatsiya + dumaloq video, xodim boshqaruvi, kunlik hisobot, avtoDavomat
- **Faza 2 — Maosh + hisobotlar:** sinov, KPI, to'liq maosh (6 KPI + ovqat), dashboard, eksport, cron
- **Keyin:** AmoCRM/UTel sync, sotuv bonusi, ta'til, moliya ko'prigi

To'liq road map — [`iMed_HR_Bot_v2_TZ.md`](./iMed_HR_Bot_v2_TZ.md) §13.

## Muhit o'zgaruvchilari

```
BOT_TOKEN=            # @BotFather (avval TEST bot tokeni!)
SUPABASE_URL=
SUPABASE_SERVICE_KEY= # faqat serverda — hech qachon gitga yozma
GROUP_CHAT_ID=-1003966396343
GROUP_CHAT_ID_2=-1003987794980
GROUP_TOPIC_ID_2=3393
```

## Status

**Faza 0** — poydevor hujjatlari joylashtirildi. Keyingi qadam: Supabase sxemasini
qo'llash + grammY skelet (Faza 1).
