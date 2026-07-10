import { createClient } from "@supabase/supabase-js";
import { config } from "../config/index.js";
import type { Database } from "./types.js";

/**
 * Yagona Supabase klient (service_role). Barcha DB kirish shu orqali —
 * to'g'ridan-to'g'ri query handlerlarga tarqatilmaydi.
 *
 * service_role kaliti RLS'ni chetlab o'tadi, shuning uchun bot barcha
 * jadvallarga to'liq kirish huquqiga ega.
 */
export const supabase = createClient<Database>(
  config.supabaseUrl,
  config.supabaseServiceKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
