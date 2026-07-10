import { createBot } from "./bot.js";

/**
 * Kirish nuqtasi. Hozircha long-polling (test bot uchun qulay).
 * Production'да webhook'ga o'tkaziladi (FAZA 2, ishga tushirish bosqichi).
 */
async function main(): Promise<void> {
  const bot = createBot();

  // To'xtatish signali (SIGINT/SIGTERM) — DigitalOcean qayta ishga tushirsa
  const stop = () => {
    console.log("To'xtatilmoqda...");
    void bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("iMed HR bot ishga tushdi (polling) — Asia/Tashkent");
  await bot.start({
    onStart: (me) => console.log(`Ulandi: @${me.username}`),
  });
}

main().catch((err) => {
  console.error("Ishga tushirishда xato:", err);
  process.exit(1);
});
