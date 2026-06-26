// Подключено к вашему проекту Supabase.
// Важно: для supabase-js используется корневой URL проекта (без /rest/v1/).
window.SUPABASE_URL = 'https://jsqxpsmhylliaszpwwbq.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzcXhwc21oeWxsaWFzenB3d2JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODQ0NTUsImV4cCI6MjA5Nzg2MDQ1NX0.MGZC_j0u8vOWYPbBakB2LvNC6PaYK5sKzKM3onqajDU';

// amoCRM: токены хранятся в Supabase Secrets (см. CRM_SETUP.md).
// Имя Edge Function для отправки заявок в amoCRM.
// Должно совпадать с именем функции в Supabase → Edge Functions.
window.CRM_EDGE_FUNCTION = 'dynamic-responder';

// Путь сайта на GitHub Pages (обязательно для OAuth).
// Репозиторий Gazon → /Gazon/
// Для localhost оставьте пустым: ''
window.SITE_BASE_PATH = '/Gazon/';

// Имя Edge Function для AI-чата (смотри URL в Supabase → Edge Functions)
window.AI_EDGE_FUNCTION = 'quick-worker';

// Email администратора (доступ к admin.html)
window.ADMIN_EMAIL = 'agent47podprikritiem@gmail.com';

// Edge Function для генерации описания товара (Groq / Llama)
window.GENERATE_DESCRIPTION_FUNCTION = 'generate-product-description';
