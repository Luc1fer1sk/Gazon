import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "agent47podprikritiem@gmail.com";

async function assertAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Требуется авторизация");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Пользователь не авторизован");
  if (user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error("Доступ только для администратора");
  }
}

async function callGroq(title: string, brand: string, category: string, apiKey: string) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "Ты копирайтер магазина газона и удобрений «ЗелёныйДвор». Пиши на русском, 2–3 коротких предложения, без заголовков и списков. Тон: экспертный, дружелюбный, без воды.",
        },
        {
          role: "user",
          content: `Напиши краткое описание товара для карточки на сайте.\nНазвание: ${title}\nБренд: ${brand || "не указан"}\nКатегория: ${category || "товар"}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Ошибка Groq API");
  }

  return (data.choices?.[0]?.message?.content || "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await assertAdmin(req);

    const body = await req.json();
    const { title, brand, category } = body;

    if (!title?.trim()) {
      throw new Error("Укажите название товара");
    }

    const groqKey = Deno.env.get("GROQ_API_KEY");
    if (!groqKey) {
      throw new Error("GROQ_API_KEY не настроен в Supabase Secrets");
    }

    const description = await callGroq(title.trim(), brand?.trim() || "", category || "");

    return new Response(JSON.stringify({ description }), {
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
