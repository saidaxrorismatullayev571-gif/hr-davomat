-- ============================================================
--  iMed HR bot — OYLIK MAOSH (data-driven, rollar jadvalidan)
--  Har rolning qoidasi `rollar` jadvalida:
--    maosh_turi: 'kpi' (Sotuvchi — ish soatiga bog'liq pool)
--                'fix' (rahbar/marketolog/omborchi... — belgilangan summa)
--                'yoq' (hisoblanmaydi — masalan Test)
--    fix_summa : oylik fix maosh (fix turi uchun)
--    kpi_baza  : KPI pool bazasi (kpi turi uchun, min(soat/176,1) × baza)
--    ovqat_kun : bir kun uchun ovqat puli (× kelgan kun)
--  Yakuniy = baza + ovqat + bonus.
--  CRM/qo'ng'iroq KPI'lari va sotuv bonusi — keyin (AmoCRM bilan).
-- ============================================================

-- rollar jadvaliga qoida ustunlari (bir marta)
alter table public.rollar
  add column if not exists maosh_turi text not null default 'fix',
  add column if not exists fix_summa bigint not null default 0,
  add column if not exists kpi_baza  bigint not null default 1500000,
  add column if not exists ovqat_kun bigint not null default 0;

alter table public.rollar drop constraint if exists rollar_maosh_turi_chk;
alter table public.rollar add constraint rollar_maosh_turi_chk
  check (maosh_turi in ('kpi','fix','yoq'));

-- Standart rollar qoidasi (CLAUDE.md 5.6)
update public.rollar set maosh_turi='kpi', kpi_baza=1500000, ovqat_kun=0      where nom='Sotuvchi';
update public.rollar set maosh_turi='fix', fix_summa=1000000, ovqat_kun=0     where nom='Nazoratchi';
update public.rollar set maosh_turi='fix', fix_summa=1000000, ovqat_kun=40000 where nom='Director';
update public.rollar set maosh_turi='fix', fix_summa=1000000, ovqat_kun=40000 where nom='Marketolog';
update public.rollar set maosh_turi='yoq', fix_summa=0,       ovqat_kun=0     where nom='Test';

drop function if exists public.maosh_oylik(text);
create function public.maosh_oylik(p_oy text)
returns table(
  telegram_id bigint, ism text, rol text,
  jami_soat numeric, baza bigint, ovqat bigint, bonus bigint, yakuniy bigint
) language sql stable set search_path = public as $$
  with r as (
    select x.telegram_id, x.ism, x.rol,
      coalesce(s.jami_min,0)::numeric as jami_min,
      coalesce(s.kunlar,0)::int       as kunlar,
      coalesce(rl.maosh_turi,'fix')   as maosh_turi,
      coalesce(rl.fix_summa,0)::bigint as fix_summa,
      coalesce(rl.kpi_baza,1500000)::bigint as kpi_baza,
      coalesce(rl.ovqat_kun,0)::bigint as ovqat_kun,
      coalesce(b.bonus,0)::bigint     as bonus
    from public.xodimlar x
    left join public.rollar rl on rl.nom = x.rol
    left join (
      select telegram_id,
        sum(sof_min) as jami_min,
        count(*) filter (where keldi is not null) as kunlar
      from public.davomat
      where to_char(sana,'YYYY-MM') = p_oy
      group by telegram_id
    ) s on s.telegram_id = x.telegram_id
    left join (
      select telegram_id, sum(summa) as bonus from public.bonus
      where oy = p_oy group by telegram_id
    ) b on b.telegram_id = x.telegram_id
    where x.arxiv = false and x.hisobga_olinmaydi = false
  )
  select r.telegram_id, r.ism, r.rol,
    round(r.jami_min/60.0, 1) as jami_soat,
    (case
      when r.maosh_turi='kpi' then round(least(r.jami_min/60.0/176.0, 1) * r.kpi_baza)::bigint
      when r.maosh_turi='fix' then r.fix_summa
      else 0::bigint end) as baza,
    (r.ovqat_kun * r.kunlar)::bigint as ovqat,
    r.bonus as bonus,
    ((case
      when r.maosh_turi='kpi' then round(least(r.jami_min/60.0/176.0, 1) * r.kpi_baza)::bigint
      when r.maosh_turi='fix' then r.fix_summa
      else 0::bigint end) + (r.ovqat_kun * r.kunlar) + r.bonus)::bigint as yakuniy
  from r
  order by r.ism;
$$;

-- Ishlatish: select * from maosh_oylik('2026-07');
