import { OFIS } from "../config/index.js";

/** Ikki nuqta orasidagi masofa (metr) — Haversine formulasi. */
export function masofaMetr(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Yer radiusi (metr)
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/** Lokatsiya ofis radiusi ichidami? */
export function ofisdaMi(lat: number, lng: number): { ok: boolean; masofa: number } {
  const masofa = masofaMetr(OFIS.lat, OFIS.lng, lat, lng);
  return { ok: masofa <= OFIS.radiusM, masofa };
}
