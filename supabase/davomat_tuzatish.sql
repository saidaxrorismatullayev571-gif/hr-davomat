-- ============================================================
--  iMed HR bot — Davomatni qo'lda tuzatish ruxsati
--  Rahbardan ALOHIDA: maxsus rol (masalan "HR") davomatni to'g'rilaydi.
--  Botда: ✏️ "Davomat tuzatish" tugmasi shu rol (va super admin) uchun.
-- ============================================================

-- Rolga tuzatish ruxsati flagi
alter table public.rollar
  add column if not exists davomat_tuzata_oladi boolean not null default false;

-- HR roli — davomatni tuzatadi (maosh keyin sozlanadi: fix 0)
insert into public.rollar (nom, maosh_turi, fix_summa, ovqat_kun, davomat_tuzata_oladi)
values ('HR', 'fix', 0, 0, true)
on conflict (nom) do update set davomat_tuzata_oladi = true;

-- Boshqa rolga ham ruxsat berish kerak bo'lsa:
--   update public.rollar set davomat_tuzata_oladi = true where nom = '<ROL_NOMI>';
