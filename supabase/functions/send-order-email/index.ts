import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatRub(value: number) {
  return `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
}

function buildEmailHtml(payload: {
  orderId: number;
  items: Array<{ title: string; qty: number; line_total: number }>;
  subtotal: number;
  discount: number;
  total: number;
}) {
  const rows = payload.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e8e8e8;">${item.title}</td>
          <td style="padding:10px;border-bottom:1px solid #e8e8e8;text-align:center;">${item.qty}</td>
          <td style="padding:10px;border-bottom:1px solid #e8e8e8;text-align:right;">${formatRub(item.line_total)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a2e1a;">
      <h2 style="color:#2d6a4f;">Спасибо за заказ в ЗелёныйДвор!</h2>
      <p>Ваш заказ <strong>#${payload.orderId}</strong> успешно оформлен.</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0;">
        <thead>
          <tr style="background:#edf5ef;">
            <th style="padding:10px;text-align:left;">Товар</th>
            <th style="padding:10px;text-align:center;">Кол-во</th>
            <th style="padding:10px;text-align:right;">Сумма</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p><strong>Итого:</strong> ${formatRub(payload.subtotal)}</p>
      ${payload.discount > 0 ? `<p><strong>Скидка:</strong> −${formatRub(payload.discount)}</p>` : ""}
      <p style="font-size:18px;"><strong>К оплате:</strong> ${formatRub(payload.total)}</p>
      <p style="color:#5a6e5a;">Статус заказа можно отслеживать в личном кабинете на сайте.</p>
      <hr style="border:none;border-top:1px solid #e8e8e8;margin:24px 0;">
      <p style="font-size:12px;color:#888;">ЗелёныйДвор — маркетплейс таблеток и газона</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Требуется авторизация");
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

    const body = await req.json();
    const { orderId, email, items, subtotal, discount, total } = body;

    if (!orderId || !email || !Array.isArray(items) || !items.length) {
      throw new Error("Некорректные данные заказа");
    }

    if (email !== user.email) {
      throw new Error("Email не совпадает с аккаунтом");
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      throw new Error("RESEND_API_KEY не настроен в Supabase Secrets");
    }

    const fromEmail = Deno.env.get("FROM_EMAIL") ?? "ЗелёныйДвор <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: `Заказ #${orderId} оформлен — ЗелёныйДвор`,
        html: buildEmailHtml({ orderId, items, subtotal, discount, total }),
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.message || "Ошибка отправки письма");
    }

    return new Response(JSON.stringify({ ok: true, id: result.id }), {
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
