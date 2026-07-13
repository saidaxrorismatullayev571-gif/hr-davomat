-- ============================================================
--  iMed HR bot — Jurnal (audit log)
--  Har bir muhim harakat: kim, nima, qachon, qaysi yozuvga,
--  eski/yangi qiymat bilan qayd etiladi. Hech narsa o'chirilmaydi.
-- ============================================================

create table if not exists public.jurnal (
  id           bigint generated always as identity primary key,
  kim_tg_id    bigint,
  kim_ism      text,
  harakat      text not null,          -- masalan: 'keldi', 'ketdi', 'xodim_qoshdi', 'rol_ozgardi', 'arxivladi', 'sozlama_ozgardi'
  jadval       text,                   -- 'davomat' | 'xodimlar' | 'config' | 'rollar' | 'sinov' ...
  yozuv_id     text,                   -- nishonlangan yozuv id (xodim id, sana, kalit va h.k.)
  tafsilot     text,                   -- qisqa inson-o'qiladigan izoh
  oldingi      jsonb,
  yangi        jsonb,
  vaqt         timestamptz not null default now()
);

create index if not exists jurnal_vaqt_idx on public.jurnal (vaqt desc);
create index if not exists jurnal_kim_idx on public.jurnal (kim_tg_id);
create index if not exists jurnal_harakat_idx on public.jurnal (harakat);

-- Boshqa jadvallar kabi: RLS yoqilgan, policy yo'q — faqat bot (service_role) yoza/o'qiy oladi.
alter table public.jurnal enable row level security;

comment on table public.jurnal is 'Audit log — barcha muhim harakatlar (tugma bosish, o''zgartirish) shu yerga yoziladi. Hech qachon o''chirilmaydi.';
