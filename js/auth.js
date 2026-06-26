const Auth = {
  client: null,
  authStateBound: false,

  isConfigured() {
    return Boolean(
      window.SUPABASE_URL &&
      window.SUPABASE_ANON_KEY &&
      window.SUPABASE_URL !== 'https://ВАШ_ПРОЕКТ.supabase.co' &&
      window.SUPABASE_ANON_KEY !== 'ВАШ_ANON_KEY'
    );
  },

  getClient() {
    if (!this.isConfigured()) return null;
    if (!this.client) {
      this.client = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY,
        {
          auth: {
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }
    return this.client;
  },

  getSiteBaseUrl() {
    const { origin, pathname, hostname } = window.location;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${origin}${pathname.replace(/[^/]*$/, '')}`;
    }

    if (window.SITE_BASE_PATH) {
      let path = window.SITE_BASE_PATH;
      if (!path.startsWith('/')) path = `/${path}`;
      if (!path.endsWith('/')) path = `${path}/`;
      return `${origin}${path}`;
    }

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0 && !segments[0].includes('.')) {
      return `${origin}/${segments[0]}/`;
    }

    return `${origin}${pathname.replace(/[^/]*$/, '')}`;
  },

  getCallbackUrl() {
    if (window.location.protocol === 'file:') {
      throw new Error('Google вход требует запуск через http://localhost. Откройте сайт через локальный сервер.');
    }
    return `${this.getSiteBaseUrl()}auth-callback.html`;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  },

  getAdminEmail() {
    return (window.ADMIN_EMAIL || 'agent47podprikritiem@gmail.com').toLowerCase();
  },

  isAdmin(session) {
    const email = session?.user?.email?.toLowerCase() || '';
    return email === this.getAdminEmail();
  },

  renderAuthSlot(session) {
    const slot = document.getElementById('auth-slot');
    if (!slot) return;

    if (session?.user) {
      const name =
        session.user.user_metadata?.full_name ||
        session.user.user_metadata?.name ||
        session.user.email?.split('@')[0] ||
        'Аккаунт';

      slot.innerHTML = `
        <div class="auth-user">
          ${this.isAdmin(session) ? '<a href="admin.html" class="btn btn--primary btn--sm">Админка</a>' : ''}
          <a href="account.html" class="btn btn--outline btn--sm">${this.escapeHtml(name)}</a>
          <button type="button" class="btn btn--ghost btn--sm" id="logout-btn">Выйти</button>
        </div>
      `;

      slot.querySelector('#logout-btn')?.addEventListener('click', () => this.signOut());
    } else {
      slot.innerHTML = `<a href="login.html" class="btn btn--primary btn--sm">Войти</a>`;
    }
  },

  async init() {
    const client = this.getClient();
    if (!client) {
      this.renderAuthSlot(null);
      return null;
    }

    const { data: { session } } = await client.auth.getSession();
    this.renderAuthSlot(session);

    if (!this.authStateBound) {
      client.auth.onAuthStateChange((_event, session) => {
        this.renderAuthSlot(session);
      });
      this.authStateBound = true;
    }

    return session;
  },

  async signInWithEmail(email, password) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase не настроен. Заполните js/supabase-config.js');

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signUpWithEmail(email, password, fullName) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase не настроен. Заполните js/supabase-config.js');

    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: this.getCallbackUrl()
      }
    });
    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    const client = this.getClient();
    if (!client) throw new Error('Supabase не настроен. Заполните js/supabase-config.js');

    const redirectTo = this.getCallbackUrl();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const client = this.getClient();
    if (!client) return;
    await client.auth.signOut();
    window.location.href = 'index.html';
  },

  async requireAuth(redirectTo = 'login.html') {
    const client = this.getClient();
    if (!client) {
      window.location.href = redirectTo;
      return null;
    }

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      window.location.href = redirectTo + '?redirect=' + encodeURIComponent(window.location.pathname.split('/').pop());
      return null;
    }
    return session;
  },

  async getProfile() {
    const client = this.getClient();
    if (!client) return null;

    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;

    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const profile = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        phone: '',
        avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || ''
      };

      const { data: inserted, error: insertError } = await client
        .from('profiles')
        .upsert(profile)
        .select()
        .single();

      if (insertError) throw insertError;
      return inserted;
    }

    return data;
  },

  async updateProfile(updates) {
    const client = this.getClient();
    if (!client) throw new Error('Supabase не настроен');

    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Не авторизован');

    const { data, error } = await client
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  showError(el, message) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  },

  hideError(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
