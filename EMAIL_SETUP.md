# Настройка email при заказе (Resend + Supabase)

После оформления заказа клиенту на email из аккаунта уходит письмо со списком товаров и суммой.

## Шаг 1. Resend (бесплатно)

1. Зарегистрируйтесь на [resend.com](https://resend.com)
2. **API Keys** → создайте ключ → скопируйте (`re_...`)
3. Для теста можно использовать отправителя: `onboarding@resend.dev`  
   (письма придут только на email, с которым зарегистрировались в Resend)

## Шаг 2. Деплой Edge Function в Supabase

### Вариант A — через Dashboard (проще)

1. Supabase → **Edge Functions** → **Create a new function**
2. Имя: `send-order-email`
3. Вставьте код из файла `supabase/functions/send-order-email/index.ts`
4. **Deploy**

### Вариант B — через CLI

```bash
npm install -g supabase
supabase login
supabase link --project-ref jsqxpsmhylliaszpwwbq
supabase secrets set RESEND_API_KEY=re_ВАШ_КЛЮЧ
supabase secrets set FROM_EMAIL="ЗелёныйДвор <onboarding@resend.dev>"
supabase functions deploy send-order-email
```

## Шаг 3. Secrets в Supabase

Dashboard → **Project Settings** → **Edge Functions** → **Secrets**:

| Имя | Значение |
|-----|----------|
| `RESEND_API_KEY` | ваш ключ Resend |
| `FROM_EMAIL` | `ЗелёныйДвор <onboarding@resend.dev>` (для теста) |

`SUPABASE_URL` и `SUPABASE_ANON_KEY` Supabase подставляет автоматически.

## Шаг 4. Проверка

1. Войдите в аккаунт на сайте
2. Оформите заказ в корзине
3. Проверьте почту, указанную в аккаунте

Если письмо не пришло — откройте DevTools (F12) → Console и посмотрите предупреждение `Email не отправлен`.

## Продакшен

Для реальной отправки всем клиентам:
1. В Resend добавьте и верифицируйте свой домен
2. Замените `FROM_EMAIL` на `ЗелёныйДвор <noreply@ваш-домен.ru>`
