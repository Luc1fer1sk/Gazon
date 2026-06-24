// Скопируйте этот файл как supabase-config.js и вставьте свои ключи из Supabase Dashboard
// Project Settings → API → Project URL и anon public key

window.SUPABASE_URL = 'https://ВАШ_ПРОЕКТ.supabase.co';
window.SUPABASE_ANON_KEY = 'ВАШ_ANON_KEY';

// Настройка Google OAuth в Supabase:
// 1. Authentication → Providers → Google → Enable
// 2. Создайте OAuth Client в Google Cloud Console
// 3. Redirect URI в Google: https://ВАШ_ПРОЕКТ.supabase.co/auth/v1/callback
// 4. Authentication → URL Configuration → Site URL: http://localhost:5500 (или ваш домен)
// 5. Redirect URLs: http://localhost:5500/auth-callback.html
