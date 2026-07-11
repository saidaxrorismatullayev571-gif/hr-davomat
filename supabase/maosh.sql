-- ============================================================
--  iMed HR bot — OYLIK MAOSH (soddalashtirilgan)
--  Faqat: ish vaqti (Sotuvchi) / fix (rahbar) + bonus.
--  CRM, ovqat puli, qo'lda KPI'lar — HOZIRCHA YO'Q (keyin qo'shiladi).
--  Sotuv bonusi (tushum %) — keyin (AmoCRM bilan).
-- ============================================================

create or replace function maosh_oylik(p_oy text)
returns table(
  telegram_id bigint, ism text, rol text,
  jami_soat numeric, baza bigint, bonus bigint, yakuniy bigint
) language sql stable as $$
  select x.telegram_id, x.ism, x.rol,
    round(coalesce(s.jami_min,0)/60.0, 1) as jami_soat,
    (case
      when x.rol = 'Sotuvchi'
        then round(least(coalesce(s.jami_min,0)/60.0/176.0, 1) * 1500000)::bigint
      when x.rol in ('Nazoratchi','Director','Marketolog')
        then 1000000::bigint
      else 0::bigint end) as baza,
    coalesce(b.bonus,0)::bigint as bonus,
    ((case
      when x.rol = 'Sotuvchi'
        then round(least(coalesce(s.jami_min,0)/60.0/176.0, 1) * 1500000)::bigint
      when x.rol in ('Nazoratchi','Director','Marketolog')
        then 1000000::bigint
      else 0::bigint end) + coalesce(b.bonus,0))::bigint as yakuniy
  from xodimlar x
  left join (
    select telegram_id, sum(sof_min) as jami_min from davomat
    where to_char(sana,'YYYY-MM') = p_oy group by telegram_id
  ) s on s.telegram_id = x.telegram_id
  left join (
    select telegram_id, sum(summa) as bonus from bonus
    where oy = p_oy group by telegram_id
  ) b on b.telegram_id = x.telegram_id
  where x.arxiv = false and x.hisobga_olinmaydi = false
  order by x.ism;
$$;

-- Ishlatish: select * from maosh_oylik('2026-07');
