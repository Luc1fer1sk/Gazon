import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "agent47podprikritiem@gmail.com";

const SYSTEM_PROMPT = `Ты — AI-консультант магазина «ЗелёныйДвор» (маркетплейс таблеток и газона).
Отвечай на русском языке, дружелюбно и по делу. Ты эксперт по газонам и уходу за участком.

ПРАВИЛА:
- Используй только информацию из контекста сайта и корзины пользователя.
- Если не знаешь ответа — предложи позвонить 8 (800) 123-45-67 или написать info@zelenydvor.ru.
- Можешь рекомендовать конкретные товары из каталога.
- Для кнопки «в корзину» используй ТОЛЬКО маркер: [[ADD_TO_CART:product_id:количество]]
  Пример: [[ADD_TO_CART:lawn-premium:10]]
  Не пиши ADDTOCART без подчёркиваний. Маркер превратится в кнопку для пользователя.
  Доступные id: lawn-premium, sport, shadow, seeds, npk, weed, root, bio
- Для ссылки на страницу: [[GO:путь.html]]
- Не выдумывай цены и товары — только из контекста.
- Ответы краткие (2–5 предложений), со списками если уместно.
- Помогай с выбором газона (солнце/тень/спорт), таблеток, расчётом площади, оформлением заказа.`;

async function callGroq(messages: Array<{ role: string; content: string }>, apiKey: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.6,
      max_tokens: 800,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Ошибка Groq API");
  }
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(messages: Array<{ role: string; content: string }>, apiKey: string) {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemMsg }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Ошибка Gemini API");
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function decodeJwtEmail(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const base64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!base64) return null;
    const payload = JSON.parse(atob(base64));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

async function assertAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Требуется авторизация");

  let email = decodeJwtEmail(authHeader);

  if (!email) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      throw new Error("Сессия истекла. Выйдите и войдите снова под admin-email.");
    }
    email = user.email ?? null;
  }

  if (email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error(`Доступ только для ${ADMIN_EMAIL} (сейчас: ${email || "неизвестно"})`);
  }
}

async function generateProductDescription(title: string, brand: string, category: string) {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  const messages = [
    {
      role: "system",
      content:
        "Ты копирайтер магазина газона и удобрений «ЗелёныйДвор». Пиши на русском, 2–3 коротких предложения, без заголовков и списков. Тон: экспертный, дружелюбный, без воды.",
    },
    {
      role: "user",
      content: `Напиши краткое описание товара для карточки на сайте.\nНазвание: ${title}\nБренд: ${brand || "не указан"}\nКатегория: ${category || "товар"}`,
    },
  ];

  if (groqKey) {
    return await callGroq(messages, groqKey);
  }
  if (geminiKey) {
    return await callGemini(messages, geminiKey);
  }
  throw new Error("AI не настроен: добавьте GROQ_API_KEY в Supabase Secrets");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (body.mode === "product_description") {
      await assertAdmin(req);

      const title = body.title?.trim();
      if (!title) throw new Error("Укажите название товара");

      const description = await generateProductDescription(
        title,
        body.brand?.trim() || "",
        body.category || ""
      );

      return new Response(JSON.stringify({ description }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, context } = body;

    if (!Array.isArray(messages) || !messages.length) {
      throw new Error("Некорректные сообщения");
    }

    const contextBlock = context
      ? `\n\nКОНТЕКСТ САЙТА (актуальные данные пользователя):\n${JSON.stringify(context, null, 2)}`
      : "";

    const fullMessages = [
      { role: "system", content: SYSTEM_PROMPT + contextBlock },
      ...messages.filter((m: { role: string }) => m.role === "user" || m.role === "assistant"),
    ];

    const groqKey = Deno.env.get("GROQ_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    let reply = "";

    if (groqKey) {
      reply = await callGroq(fullMessages, groqKey);
    } else if (geminiKey) {
      reply = await callGemini(fullMessages, geminiKey);
    } else {
      throw new Error("AI не настроен: добавьте GROQ_API_KEY или GEMINI_API_KEY в Supabase Secrets");
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
