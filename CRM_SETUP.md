## HubSpot + Заказы + Email (Resend)

Сайт уже подключен к CRM-потоку:
- заказ сохраняется в Supabase (`orders`)
- при оформлении делается отправка в HubSpot Form API (если заполнены ID формы)
- в `account.html` показывается история заказов и статусы

### 1) SQL для заказов
Выполните `supabase/orders.sql` в Supabase SQL Editor.

### 2) HubSpot (бесплатно)
1. HubSpot -> Marketing -> Forms -> Create form.
2. Добавьте поля:
   - `email`
   - `firstname`
   - `message`
3. Опубликуйте форму.
4. Возьмите:
   - Portal ID (Settings -> Account Setup -> Account Defaults)
   - Form ID (в форме)
5. Заполните в `js/supabase-config.js`:

```js
window.HUBSPOT_PORTAL_ID = 'ВАШ_PORTAL_ID';
window.HUBSPOT_FORM_ID = 'ВАШ_FORM_ID';
```

### 3) Статусы заказа
Меняйте поле `status` в таблице `orders`:
- `new`
- `processing`
- `paid`
- `shipped`
- `delivered`
- `cancelled`

Пользователь увидит изменения в `account.html`.

### 4) Email уведомления через Resend (опционально)
Чтобы письма отправлялись автоматически при смене статуса:
1. Создайте API key в Resend.
2. Создайте Supabase Edge Function, которая шлет email через Resend.
3. Повесьте DB webhook/trigger на `orders` (изменение `status`) -> вызов функции.

Если хотите, я могу в следующем шаге полностью подготовить файлы Edge Function + SQL webhook под ваш проект.
