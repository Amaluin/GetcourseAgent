import dotenv from 'dotenv';
dotenv.config();

export const config = {
  gcUrl: process.env.GC_URL || '',
  gcLogin: process.env.GC_LOGIN || '',
  gcPassword: process.env.GC_PASSWORD || '',
  gcStreamUrl: process.env.GC_STREAM_URL || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  headless: false // Поставьте true, если хотите скрыть браузер
};

if (!config.gcUrl || !config.gcLogin || !config.gcPassword) {
  console.warn("⚠️ Внимание: Не все переменные окружения заданы в .env");
}


