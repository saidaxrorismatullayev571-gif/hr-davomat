const TZ = "Asia/Tashkent";

/** Asia/Tashkent bo'yicha sana (YYYY-MM-DD). */
export function sanaTashkent(d: Date = new Date()): string {
  // en-CA locale → YYYY-MM-DD formati
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Asia/Tashkent bo'yicha soat va daqiqa. */
export function soatMinTashkent(d: Date = new Date()): { soat: number; min: number } {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [soatStr, minStr] = s.split(":");
  return { soat: Number(soatStr), min: Number(minStr) };
}

/** "HH:MM" ko'rinishida (Asia/Tashkent). */
export function soatMatn(d: Date = new Date()): string {
  const { soat, min } = soatMinTashkent(d);
  return `${String(soat).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Kunning boshidan hisoblangan daqiqa (Asia/Tashkent). */
export function kunMinutlari(d: Date = new Date()): number {
  const { soat, min } = soatMinTashkent(d);
  return soat * 60 + min;
}
