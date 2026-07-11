import type { Api } from "grammy";
import { config } from "../config/index.js";

/**
 * Davomat xulosasini FAQAT 2 joyga yuboradi (TZ 5.2):
 *   1. Eski guruh: GROUP_CHAT_ID
 *   2. Forum guruh: GROUP_CHAT_ID_2, message_thread_id = GROUP_TOPIC_ID_2 (Davomat bo'limi)
 * Boshqa hech qayerga yuborilmaydi. Xatolar jim yutiladi (bot guruhда bo'lmasligi mumkin).
 */
export async function davomatXulosa(api: Api, matn: string): Promise<void> {
  if (config.groupChatId) {
    try {
      await api.sendMessage(config.groupChatId, matn);
    } catch (e) {
      console.error("Eski guruhga yuborilmadi:", e);
    }
  }

  if (config.groupChatId2) {
    try {
      const threadId = config.groupTopicId2 ? Number(config.groupTopicId2) : undefined;
      await api.sendMessage(config.groupChatId2, matn, {
        message_thread_id: threadId,
      });
    } catch (e) {
      console.error("Forum guruhga yuborilmadi:", e);
    }
  }
}
