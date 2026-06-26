## amoCRM + Заказы + Email (Resend)

Сайт подключен к CRM через amoCRM:
- заказ сохраняется в Supabase (`orders`)
- формы и заказы отправляются в amoCRM через Edge Function `amocrm-submit`
- в `account.html` показывается история заказов и статусы

### 1) SQL для заказов
Выполните `supabase/orders.sql` в Supabase SQL Editor.

### 2) Данные из amoCRM (вкладка «Ключи» интеграции)

| Что видите в amoCRM | Куда кладём | Нужно? |
|---------------------|-------------|--------|
| **Долгосрочный токен** | `AMOCRM_ACCESS_TOKEN` | ✅ Да |
| **ID интеграции** | не нужен для API-запросов | — |
| **Код авторизации (20 мин)** | никуда | ❌ Не нужен |

Долгосрочный токен копируется **один раз** — сразу сохраните его в Supabase Secrets.

Поддомен аккаунта — часть URL при входе в amoCRM:
`https://ВАШ_ПОДДОМЕН.amocrm.ru` → в Secrets как `AMOCRM_SUBDOMAIN` = `ВАШ_ПОДДОМЕН`.

### 3) Secrets в Supabase

Откройте **Supabase → Project Settings → Edge Functions → Secrets** и добавьте:

```
AMOCRM_SUBDOMAIN=ваш_поддомен
AMOCRM_ACCESS_TOKEN=долгосрочный_токен_из_amoCRM
```

Опционально — воронка и этап для новых сделок (ID из URL воронки в amoCRM):
```
AMOCRM_PIPELINE_ID=123456
AMOCRM_STATUS_ID=789012
```

> Refresh token, Client ID и Client Secret **не нужны**, если используете долгосрочный токен.

### 4) Деплой Edge Function

```bash
supabase functions deploy amocrm-submit
```

Или в Supabase Dashboard: **Edge Functions → Deploy** (загрузите папку `supabase/functions/amocrm-submit`).

### 5) Что создаётся в amoCRM

| Источник | Сделка в amoCRM |
|----------|-----------------|
| Форма «Контакты» | Сделка + контакт с email + примечание |
| Подписка на рассылку | «Подписка на рассылку» |
| Оформление заказа | Сделка с суммой и составом, тег «ЗелёныйДвор» |

### 6) Статусы заказа на сайте

Меняйте поле `status` в таблице `orders`:
`new` → `processing` → `paid` → `shipped` → `delivered` / `cancelled`

Пользователь видит статус в `account.html`.

### 7) Email через Resend (опционально)

1. API key в Resend → `RESEND_API_KEY` в Secrets.
2. `FROM_EMAIL` — адрес отправителя.
3. `supabase functions deploy send-order-email`
