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
      case
        when x.keldi is not null then
          (case when x.holat = 'Kech qoldi' then '🟠 '
                when x.holat = 'Avtomatik'  then '🔵 '
                else '🟢 ' end)
          || '<b>' || x.ism_esc || '</b> · '
          || to_char(x.keldi at time zone 'Asia/Tashkent','HH24:MI') || '–'
          || coalesce(to_char(x.ketdi at time zone 'Asia/Tashkent','HH24:MI'),'—')
          || ' · <b>' || round(x.sof_min/60.0,1) || 's</b>'
          || (case when x.holat = 'Kech qoldi' then ' <i>(kech)</i>' else '' end)
        when x.holat = 'Kasal'   then '🤒 <b>' || x.ism_esc || '</b> — kasal'
        when x.holat = 'Sababli' then '📄 <b>' || x.ism_esc || '</b> — sababli'
        else '⬜ <b>' || x.ism_esc || '</b> — kelmadi'
      end,
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

-- 3) Anomaliya signal: xodim ketma-ket N ish kuni (dam_kunlar hisobga olinadi,
--    Kasal/Sababli uzrli hisoblanadi) davomat qilmasa — signal_qabul (yoki
--    super admin) ga bir martalik ogohlantirish. Jurnal orqali kunига bitta marta.
create or replace function anomaliya_tekshir() returns void language plpgsql as $$
declare
  d_bugun date := (now() at time zone 'Asia/Tashkent')::date;
  n_chegara int;
  qabul_tg text;
  qabul_id bigint;
  r record;
  chk_sana date;
  streak int;
  safety int;
  dow int;
  matn text;
begin
  select coalesce(qiymat,'3')::int into n_chegara from public.config where kalit = 'anomaliya_kun';
  if n_chegara is null or n_chegara < 1 then n_chegara := 3; end if;

  select qiymat into qabul_tg from public.config where kalit = 'signal_qabul';
  if qabul_tg is null or qabul_tg = '' then
    qabul_id := 1318046590; -- super admin (birlamchi)
  else
    qabul_id := qabul_tg::bigint;
  end if;

  for r in
    select x.telegram_id, x.ism, coalesce(x.dam_kunlar, '{}') as dam_kunlar
    from public.xodimlar x
    where x.arxiv = false and x.hisobga_olinmaydi = false
  loop
    streak := 0;
    chk_sana := d_bugun - 1;
    safety := 0;
    loop
      safety := safety + 1;
      exit when safety > 30;
      dow := extract(dow from chk_sana)::int; -- 0=Yakshanba..6=Shanba
      if dow = 0 or dow = 6 or dow = any(r.dam_kunlar) then
        chk_sana := chk_sana - 1;
        continue;
      end if;
      if exists (
        select 1 from public.davomat d
        where d.telegram_id = r.telegram_id and d.sana = chk_sana
          and (d.keldi is not null or d.holat in ('Kasal', 'Sababli'))
      ) then
        exit; -- kelgan yoki uzrli kun topildi, streak shu yerda tugaydi
      end if;
      streak := streak + 1;
      exit when streak >= n_chegara;
      chk_sana := chk_sana - 1;
    end loop;

    if streak = n_chegara and not exists (
      select 1 from public.jurnal j
      where j.harakat = 'anomaliya_signal' and j.yozuv_id = r.telegram_id::text
        and j.vaqt::date = d_bugun
    ) then
      matn := '⚠️ <b>Anomaliya</b>: ' ||
        replace(replace(replace(r.ism, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
        ' ketma-ket <b>' || n_chegara || '</b> ish kuni kelmadi.';
      perform extensions.http_post(
        'https://api.telegram.org/bot<BOT_TOKEN>/sendMessage',
        jsonb_build_object('chat_id', qabul_id, 'parse_mode', 'HTML', 'text', matn)::text,
        'application/json'
      );
      insert into public.jurnal (kim_tg_id, kim_ism, harakat, jadval, yozuv_id, tafsilot)
      values (null, 'Tizim (avtomatik)', 'anomaliya_signal', 'xodimlar', r.telegram_id::text,
        r.ism || ' — ' || n_chegara || ' kun ketma-ket kelmadi');
    end if;
  end loop;
end $$;

-- ============================================================
--  JADVAL (Toshkent = UTC+5). pg_cron UTC bo'yicha ishlaydi.
-- ============================================================
-- avtoDavomat: har ish kuni 09:05 (Toshkent) = 04:05 UTC
select cron.schedule('avto-davomat',   '5 4 * * 1-5',  'select avto_davomat()');
-- Anomaliya signal: har ish kuni 09:35 (Toshkent) = 04:35 UTC (avtoDavomatdan keyin)
select cron.schedule('anomaliya-signal', '35 4 * * 1-5', 'select anomaliya_tekshir()');
-- Kunlik hisobot: har ish kuni 18:30 (Toshkent) = 13:30 UTC
select cron.schedule('kunlik-hisobot', '30 13 * * 1-5', 'select kunlik_hisobot_yubor()');

-- Keep-warm (edge function cold start bo'lmasin) — har daqiqa
-- select cron.schedule('keep-bot-warm', '* * * * *',
--   $$ select extensions.http_get('https://<ref>.supabase.co/functions/v1/bot') $$);
