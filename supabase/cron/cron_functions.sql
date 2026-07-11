-- ============================================================
--  iMed HR bot — CRON funksiyalari (pg_cron)
--  Bularni Supabase SQL editorda ishga tushiring.
--  ⚠️ <BOT_TOKEN> ni haqiqiy token bilan almashtiring (gitga yozmang).
-- ============================================================

-- 1) avtoDavomat: belgilangan xodimlarga (ism bo'yicha moslash) to'liq kun
--    (09:00-18:00, tushlik 13:00-14:00 => 8 soat, holat 'Avtomatik').
--    Bugungi yozuv bo'lsa qayta yozmaydi (qo'lda davomatni buzmaydi).
create or replace function avto_davomat() returns void language plpgsql as $$
declare d_sana date := (now() at time zone 'Asia/Tashkent')::date;
begin
  insert into public.davomat (telegram_id, sana, keldi, tushlikka, qaytdi, ketdi, holat)
  select x.telegram_id, d_sana,
    (d_sana + time '09:00') at time zone 'Asia/Tashkent',
    (d_sana + time '13:00') at time zone 'Asia/Tashkent',
    (d_sana + time '14:00') at time zone 'Asia/Tashkent',
    (d_sana + time '18:00') at time zone 'Asia/Tashkent',
    'Avtomatik'
  from public.xodimlar x
  where x.arxiv = false
    and (x.ism ilike '%Himmatulloh%' or x.ism ilike '%Arabboy%' or x.ism ilike '%Saidaxror%')
    and not exists (
      select 1 from public.davomat d
      where d.telegram_id = x.telegram_id and d.sana = d_sana
    );
end $$;

-- 2) Kunlik hisobotni guruhga yuboradi (config'dagi xulosa_group_id / xulosa_topic_id).
create or replace function kunlik_hisobot_yubor() returns void language plpgsql as $$
declare
  d_sana date := (now() at time zone 'Asia/Tashkent')::date;
  txt text; gid text; topic text; body text;
begin
  select qiymat into gid   from public.config where kalit = 'xulosa_group_id';
  select qiymat into topic from public.config where kalit = 'xulosa_topic_id';
  if gid is null then return; end if;

  -- HTML bold + holatga qarab rang (parse_mode=HTML). Ism xavfsizlangan (&,<,>).
  select '📊 <b>Kunlik davomat</b> — ' || to_char(d_sana, 'YYYY-MM-DD') || E'\n\n' ||
    coalesce(string_agg(
      case when x.keldi is not null then
        (case when x.holat = 'Kech qoldi' then '🟠 '
              when x.holat = 'Avtomatik'  then '🔵 '
              else '🟢 ' end)
        || '<b>' || x.ism_esc || '</b> · '
        || to_char(x.keldi at time zone 'Asia/Tashkent','HH24:MI') || '–'
        || coalesce(to_char(x.ketdi at time zone 'Asia/Tashkent','HH24:MI'),'—')
        || ' · <b>' || round(x.sof_min/60.0,1) || 's</b>'
        || (case when x.holat = 'Kech qoldi' then ' <i>(kech)</i>' else '' end)
      else '⬜ <b>' || x.ism_esc || '</b> — kelmadi' end,
      E'\n' order by x.ism), '')
    || E'\n\n👥 Jami: <b>' || count(*) filter (where x.keldi is not null) || '/' || count(*) || '</b> keldi'
  into txt
  from (
    select xo.ism,
      replace(replace(replace(xo.ism,'&','&amp;'),'<','&lt;'),'>','&gt;') as ism_esc,
      d.keldi, d.ketdi, d.sof_min, d.holat
    from public.xodimlar xo
    left join public.davomat d on d.telegram_id = xo.telegram_id and d.sana = d_sana
    where xo.arxiv = false and xo.hisobga_olinmaydi = false
  ) x;

  body := jsonb_build_object(
    'chat_id', gid,
    'message_thread_id', coalesce(topic::int, null),
    'parse_mode', 'HTML',
    'text', txt
  )::text;

  perform extensions.http_post(
    'https://api.telegram.org/bot<BOT_TOKEN>/sendMessage',
    body, 'application/json'
  );
end $$;

-- ============================================================
--  JADVAL (Toshkent = UTC+5). pg_cron UTC bo'yicha ishlaydi.
-- ============================================================
-- avtoDavomat: har ish kuni 09:05 (Toshkent) = 04:05 UTC
select cron.schedule('avto-davomat',   '5 4 * * 1-5',  'select avto_davomat()');
-- Kunlik hisobot: har ish kuni 18:30 (Toshkent) = 13:30 UTC
select cron.schedule('kunlik-hisobot', '30 13 * * 1-5', 'select kunlik_hisobot_yubor()');

-- Keep-warm (edge function cold start bo'lmasin) — har daqiqa
-- select cron.schedule('keep-bot-warm', '* * * * *',
--   $$ select extensions.http_get('https://<ref>.supabase.co/functions/v1/bot') $$);
