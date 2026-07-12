-- ============================================================
--  iMed HR bot — B faza: Xodim kartasi maydonlari
--  Har xodim uchun boyroq profil: telefon (mavjud), ishga kirgan
--  sana, izoh, tug'ilgan sana, haftalik dam kunlar.
-- ============================================================

alter table public.xodimlar
  add column if not exists ishga_kirgan date,
  add column if not exists izoh        text,
  add column if not exists tug_sana    date,
  add column if not exists dam_kunlar  int[] not null default '{}';

comment on column public.xodimlar.ishga_kirgan is 'Ishga kirgan sana';
comment on column public.xodimlar.izoh        is 'Xodim haqida izoh/eslatma';
comment on column public.xodimlar.tug_sana    is 'Tug''ilgan sana (ixtiyoriy)';
comment on column public.xodimlar.dam_kunlar  is 'Haftalik dam kunlari: 0=Yakshanba ... 6=Shanba (JS getDay)';
