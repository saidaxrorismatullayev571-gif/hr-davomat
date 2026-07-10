import "dotenv/config";

function talab(nom: string): string {
  const v = process.env[nom];
  if (!v || v.trim() === "") {
    throw new Error(`Muhit o'zgaruvchisi ko'rsatilmagan: ${nom} (.env faylni tekshiring)`);
  }
  return v.trim();
}

/**
 * Loyiha konfiguratsiyasi. service_role kalit FAQAT shu yerda (env) o'qiladi —
 * hech qachon kodga/gitga yozilmaydi.
 */
export const config = {
  botToken: talab("BOT_TOKEN"),
  supabaseUrl: talab("SUPABASE_URL"),
  supabaseServiceKey: talab("SUPABASE_SERVICE_KEY"),

  // Davomat xulosalari shu joylarga yuboriladi (boshqa hech qayerga emas)
  groupChatId: process.env.GROUP_CHAT_ID ?? "",
  groupChatId2: process.env.GROUP_CHAT_ID_2 ?? "",
  groupTopicId2: process.env.GROUP_TOPIC_ID_2 ?? "",

  // Vaqt zonasi — barcha sana/soat hisobi shu bo'yicha
  tz: "Asia/Tashkent",
} as const;

/** Ofis lokatsiyasi va davomat qoidalari (TZ 4.1–4.2). */
export const OFIS = {
  lat: 40.385907,
  lng: 71.786778,
  radiusM: 100,
  // Lokatsiya/video 90 soniyadan eski bo'lsa — rad etiladi (forward himoyasi)
  maxYoshSek: 90,
} as const;

/** Avtomatik davomat qilinadigan xodimlar (ism bo'yicha moslash) — TZ 5.5. */
export const AVTO_DAVOMAT_ISMLAR = ["Himmatulloh", "Arabboy", "Saidaxror"] as const;

/**
 * Super admin — to'liq access (rol/CEO'дан ham yuqori). Har qanday funksiyaga
 * kirish huquqiga ega. Bu ro'yxatдаgi telegram_id barcha tekshiruvlardan o'tadi.
 */
export const SUPER_ADMIN_IDS: readonly number[] = [
  1318046590, // Saidaxror — loyiha egasi
];
