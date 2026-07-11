import { supabase } from "../db/index.js";
import type { Tables } from "../db/types.js";
import { sanaTashkent, kunMinutlari } from "../utils/vaqt.js";

export type Davomat = Tables<"davomat">;

/** Bugungi (Asia/Tashkent) davomat qatori — bo'lmasa null. */
export async function bugungiDavomat(telegramId: number): Promise<Davomat | null> {
  const { data, error } = await supabase
    .from("davomat")
    .select("*")
    .eq("telegram_id", telegramId)
    .eq("sana", sanaTashkent())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Keldi vaqti bo'yicha holat: 09:00 gacha — Vaqtida, keyin — Kech qoldi. */
function keldiHolat(vaqt: Date): string {
  return kunMinutlari(vaqt) <= 9 * 60 ? "Vaqtida" : "Kech qoldi";
}

/** "Keldim" — bugungi qatorga keldi + lokatsiya + video yozadi. */
export async function keldiYoz(params: {
  telegramId: number;
  vaqt: Date;
  lat: number;
  lng: number;
  masofa: number;
  videoFileId: string;
}): Promise<Davomat> {
  const { data, error } = await supabase
    .from("davomat")
    .upsert(
      {
        telegram_id: params.telegramId,
        sana: sanaTashkent(params.vaqt),
        keldi: params.vaqt.toISOString(),
        lat: params.lat,
        lng: params.lng,
        masofa_m: params.masofa,
        video_file_id: params.videoFileId,
        holat: keldiHolat(params.vaqt),
      },
      { onConflict: "telegram_id,sana" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** "Ketdim" — bugungi qatorga ketdi + video yozadi. */
export async function ketdiYoz(params: {
  telegramId: number;
  vaqt: Date;
  videoFileId: string;
}): Promise<Davomat> {
  const { data, error } = await supabase
    .from("davomat")
    .update({
      ketdi: params.vaqt.toISOString(),
      video_file_id: params.videoFileId,
    })
    .eq("telegram_id", params.telegramId)
    .eq("sana", sanaTashkent(params.vaqt))
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** "Tushlikka" — tushlik boshlanish vaqti. */
export async function tushlikkaYoz(telegramId: number, vaqt: Date): Promise<Davomat> {
  const { data, error } = await supabase
    .from("davomat")
    .update({ tushlikka: vaqt.toISOString() })
    .eq("telegram_id", telegramId)
    .eq("sana", sanaTashkent(vaqt))
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** "Tushlikdan keldim" — tushlikdan qaytish vaqti. */
export async function qaytdiYoz(telegramId: number, vaqt: Date): Promise<Davomat> {
  const { data, error } = await supabase
    .from("davomat")
    .update({ qaytdi: vaqt.toISOString() })
    .eq("telegram_id", telegramId)
    .eq("sana", sanaTashkent(vaqt))
    .select()
    .single();
  if (error) throw error;
  return data;
}
