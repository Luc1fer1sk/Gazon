import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CrmType = "contact" | "newsletter" | "order";

type CrmPayload = {
  type: CrmType;
  name?: string;
  email?: string;
  topic?: string;
  message?: string;
  orderId?: number;
  total?: number;
  itemCount?: number;
  items?: Array<{ title: string; qty: number }>;
  pageName?: string;
};

function formatRub(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "Клиент", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function buildLeadName(payload: CrmPayload) {
  if (payload.type === "order") {
    return `Заказ #${payload.orderId} — ${formatRub(payload.total || 0)}`;
  }
  if (payload.type === "newsletter") {
    return `Подписка на рассылку — ${payload.email}`;
  }
  const topic = payload.topic || "Обращение с сайта";
  const name = payload.name || "Клиент";
  return `Контакты: ${topic} — ${name}`;
}

function buildNoteText(payload: CrmPayload) {
  const lines: string[] = [
    `Источник: ${payload.pageName || "Сайт"}`,
    `Тип: ${payload.type}`,
  ];

  if (payload.email) lines.push(`Email: ${payload.email}`);
  if (payload.name) lines.push(`Имя: ${payload.name}`);
  if (payload.topic) lines.push(`Тема: ${payload.topic}`);
  if (payload.message) lines.push(`\n${payload.message}`);

  if (payload.type === "order") {
    lines.push(`\nЗаказ #${payload.orderId}`);
    lines.push(`Сумма: ${formatRub(payload.total || 0)}`);
    lines.push(`Товаров: ${payload.itemCount || 0}`);
    if (payload.items?.length) {
      lines.push(
        "Состав: " + payload.items.map((item) => `${item.title} x${item.qty}`).join("; ")
      );
    }
  }

  return lines.join("\n");
}

async function refreshAccessToken(subdomain: string) {
  const clientId = Deno.env.get("AMOCRM_CLIENT_ID");
  const clientSecret = Deno.env.get("AMOCRM_CLIENT_SECRET");
  const refreshToken = Deno.env.get("AMOCRM_REFRESH_TOKEN");
  const redirectUri = Deno.env.get("AMOCRM_REDIRECT_URI") ?? "https://localhost";

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Токен amoCRM истёк. Обновите AMOCRM_ACCESS_TOKEN в Supabase Secrets");
  }

  const res = await fetch(`https://${subdomain}.amocrm.ru/oauth2/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || data.error_description || "Не удалось обновить токен amoCRM");
  }

  return data.access_token as string;
}

async function amoFetch(
  subdomain: string,
  accessToken: string,
  path: string,
  options: RequestInit
) {
  const url = `https://${subdomain}.amocrm.ru/api/v4${path}`;
  let token = accessToken;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (res.status === 401 && attempt === 0) {
      token = await refreshAccessToken(subdomain);
      continue;
    }

    return res;
  }

  throw new Error("Ошибка авторизации amoCRM");
}

async function createAmoLead(payload: CrmPayload) {
  const subdomain = Deno.env.get("AMOCRM_SUBDOMAIN");
  const accessToken = Deno.env.get("AMOCRM_ACCESS_TOKEN");

  if (!subdomain || !accessToken) {
    throw new Error("amoCRM не настроена: добавьте AMOCRM_SUBDOMAIN и AMOCRM_ACCESS_TOKEN в Supabase Secrets");
  }

  const displayName = payload.name || (payload.type === "newsletter" ? "Подписчик" : "Клиент");
  const { first_name, last_name } = splitName(displayName);

  const lead: Record<string, unknown> = {
    name: buildLeadName(payload),
    price: payload.type === "order" ? payload.total || 0 : 0,
    tags: [{ name: "ЗелёныйДвор" }, { name: payload.pageName || "Сайт" }],
    _embedded: {
      contacts: [
        {
          first_name,
          last_name,
          custom_fields_values: payload.email
            ? [
                {
                  field_code: "EMAIL",
                  values: [{ value: payload.email, enum_code: "WORK" }],
                },
              ]
            : [],
        },
      ],
    },
  };

  const pipelineId = Deno.env.get("AMOCRM_PIPELINE_ID");
  const statusId = Deno.env.get("AMOCRM_STATUS_ID");
  if (pipelineId) lead.pipeline_id = Number(pipelineId);
  if (statusId) lead.status_id = Number(statusId);

  const res = await amoFetch(subdomain, accessToken, "/leads/complex", {
    method: "POST",
    body: JSON.stringify([lead]),
  });

  const data = await res.json();
  if (!res.ok) {
    const detail =
      data["validation-errors"]?.[0]?.errors?.[0]?.detail ||
      data.detail ||
      data.title ||
      "Ошибка создания сделки в amoCRM";
    throw new Error(detail);
  }

  const leadId = data?._embedded?.leads?.[0]?.id;
  const noteText = buildNoteText(payload);

  if (leadId && noteText) {
    const noteRes = await amoFetch(subdomain, accessToken, `/leads/${leadId}/notes`, {
      method: "POST",
      body: JSON.stringify([
        {
          note_type: "common",
          params: { text: noteText },
        },
      ]),
    });

    if (!noteRes.ok) {
      console.warn("Сделка создана, но примечание не добавлено");
    }
  }

  return { leadId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as CrmPayload;
    const { type, email } = body;

    if (!type || !["contact", "newsletter", "order"].includes(type)) {
      throw new Error("Некорректный тип заявки");
    }

    if (!email?.trim()) {
      throw new Error("Укажите email");
    }

    if (type === "order") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        throw new Error("Требуется авторизация для заказа");
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("Пользователь не авторизован");
      }

      if (email !== user.email) {
        throw new Error("Email не совпадает с аккаунтом");
      }

      if (!body.orderId) {
        throw new Error("Некорректные данные заказа");
      }
    }

    const result = await createAmoLead({ ...body, email: email.trim() });

    return new Response(JSON.stringify({ ok: true, ...result }), {
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
