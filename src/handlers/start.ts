import type { BotContext } from "../bot.js";
import { xodimByTelegramId, rahbarmi, superAdminmi } from "../services/xodim.js";
import { menuForAccess } from "../utils/menu.js";

/**
 * /start — rolni aniqlaydi va access darajasiga mos menyuni ko'rsatadi.
 * Ro'yxatda bo'lmagan foydalanuvchi menyu olmaydi.
 */
export async function handleStart(ctx: BotContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const xodim = await xodimByTelegramId(tgId);

  if (!xodim) {
    await ctx.reply(
      "Assalomu alaykum! 👋\n\n" +
        "Siz hozircha tizimда ro'yxатдан o'tmagansiz. " +
        "Iltimos, rahbarga murojaat qiling — u sizni qo'shadi.",
    );
    return;
  }

  const superAdmin = superAdminmi(tgId);
  const rahbar = rahbarmi(xodim.rol);

  const rolTavsif = superAdmin
    ? "Super admin — to'liq access"
    : rahbar
      ? `${xodim.rol} (rahbar)`
      : xodim.rol;

  await ctx.reply(
    `Assalomu alaykum, ${xodim.ism}! 👋\n\n` +
      `Rol: <b>${rolTavsif}</b>\n\n` +
      `Quyidagi tugmalar orqali davomat qiling.`,
    {
      parse_mode: "HTML",
      reply_markup: menuForAccess({ rahbar, superAdmin }),
    },
  );
}
