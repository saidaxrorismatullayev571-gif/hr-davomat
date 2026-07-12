-- ============================================================
--  iMed HR bot — A faza: rol huquqlari + config sozlamalar
--  Ruxsatlar endi data-driven (rollar flaglari). Hech narsa
--  qattiq kodga bog'lanmagan — bot "⚙️ Sozlamalar"dan o'zgartiriladi.
-- ============================================================

-- Rol huquqlari (flaglar)
alter table public.rollar
  add column if not exists hisobot_koradi    boolean not null default false,
  add column if not exists xodim_boshqaradi  boolean not null default false,
  add column if not exists maosh_koradi       boolean not null default false,
  add column if not exists sinov_boshqaradi   boolean not null default false,
  add column if not exists signal_oladi       boolean not null default false,
  add column if not exists sozlama_boshqaradi boolean not null default false;
-- davomat_tuzata_oladi allaqachon bor (HR)

-- Standart: Director/Nazoratchi to'liq huquq (mavjud xatti-harakat saqlansin)
update public.rollar
  set hisobot_koradi=true, xodim_boshqaradi=true, maosh_koradi=true,
      sinov_boshqaradi=true, signal_oladi=true, sozlama_boshqaradi=true
  where nom in ('Director','Nazoratchi');

-- config.kalit noyob (upsert uchun)
create unique index if not exists config_kalit_uniq on public.config (kalit);

-- Sozlama qiymatlari — bot orqali o'zgartiriladi
insert into public.config (kalit, qiymat)
select v.k, v.q
from (values
  ('signal_qabul', ''),      -- signal/xulosa qabul qiluvchi telegram_id. Bo'sh => super admin
  ('anomaliya_kun', '3'),    -- ketma-ket necha ish kuni kelmasa signal
  ('video_guruhga', 'yoq'),  -- dumaloq video guruhga yuborilsinmi (ha/yoq)
  ('tatil_yoq', 'yoq')       -- ta'til moduli yoqilganmi (ha/yoq)
) as v(k, q)
where not exists (select 1 from public.config c where c.kalit = v.k);
