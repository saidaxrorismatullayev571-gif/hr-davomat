import type { BotContext } from "../bot.js";
import { xodimByTelegramId, rahbarmi } from "../services/xodim.js";
import { menuForRole } from "../utils/menu.js";

/**
 * /start — rolni aniqlaydi va rolга mos menyuni ko'rsatadi.
 * Ro'yxatda bo'lmagan foydalanuvchi menyu olmaydi.
 */
export async function handleStart(ctx: BotContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const xodim = await xodimByTelegramId(tgId);

  if (!xodim) {
    await ctx.reply(
      "Assalomu alaykum! 👋\n\n" +
        "Siz hozircha tizimда ro'yxatдан o'tmagansiz. " +
        "Iltimos, rahbarga murojaat qiling — u sizni qo'shadi.",
    );
    return;
  }

  const rolTavsif = rahbarmi(xodim.rol) ? "Rahbar" : xodim.rol;
  await ctx.reply(
    `Assalomu alaykum, ${xodim.ism}! 👋\n\n` +
      `Rol: <b>${rolTavsif}</b>\n\n` +
      `Quyidagi tugmalar orqali davomat qiling.`,
    {
      parse_mode: "HTML",
      reply_markup: menuForRole(xodim.rol),
    },
  );
}
