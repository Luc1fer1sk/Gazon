const Admin = {
  products: [],
  editingId: null,

  getAiFunctionNames() {
    return [...new Set([
      window.AI_EDGE_FUNCTION,
      'ai-chat',
      'quick-worker'
    ].filter(Boolean))];
  },

  async requestAiChat(messages) {
    if (window.location.protocol === 'file:') {
      throw new Error('Откройте сайт через GitHub Pages (https://), не как локальный файл');
    }

    const payload = { messages };
    const errors = [];

    for (const functionName of this.getAiFunctionNames()) {
      const url = `${window.SUPABASE_URL}/functions/v1/${functionName}`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`,
            apikey: window.SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (res.ok && data.reply) return data.reply;
        if (res.status === 404) {
          errors.push(`Функция «${functionName}» не найдена`);
          continue;
        }
        errors.push(data.error || `HTTP ${res.status} (${functionName})`);
      } catch (err) {
        errors.push(err.message || `Сеть (${functionName})`);
      }

      const client = Auth.getClient();
      if (client) {
        try {
          const { data, error } = await client.functions.invoke(functionName, { body: payload });
          if (!error && data?.reply) return data.reply;
          if (data?.error) errors.push(data.error);
          else if (error?.message) errors.push(error.message);
        } catch (err) {
          errors.push(err.message || `invoke (${functionName})`);
        }
      }
    }

    throw new Error(
      errors.find((e) => e && !e.includes('Failed to send')) ||
      errors[0] ||
      'AI недоступен. Проверьте ai-chat в Supabase: JWT выключен, GROQ_API_KEY в Secrets.'
    );
  },

  async requireAdmin() {
    await Auth.init();
    const session = await Auth.requireAuth('login.html?redirect=admin.html');
    if (!session) return null;

    if (!Auth.isAdmin(session)) {
      document.getElementById('admin-denied').hidden = false;
      document.getElementById('admin-app').hidden = true;
      return null;
    }

    document.getElementById('admin-denied').hidden = true;
    document.getElementById('admin-app').hidden = false;
    return session;
  },

  async loadProducts() {
    const client = Auth.getClient();
    const { data, error } = await client
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    this.products = data || [];
    this.renderTable();
  },

  renderTable() {
    const tbody = document.getElementById('admin-products-body');
    if (!tbody) return;

    if (!this.products.length) {
      tbody.innerHTML = '<tr><td colspan="6">Нет товаров</td></tr>';
      return;
    }

    tbody.innerHTML = this.products.map((p) => `
      <tr>
        <td><code>${Auth.escapeHtml(p.id)}</code></td>
        <td>${Auth.escapeHtml(p.title)}</td>
        <td>${Auth.escapeHtml(p.brand)}</td>
        <td>${ProductsStore.formatRub(p.unit_price)}</td>
        <td>${p.is_active ? '✅' : '—'}</td>
        <td class="admin-table__actions">
          <button type="button" class="btn btn--outline btn--sm" data-action="edit" data-id="${Auth.escapeHtml(p.id)}">Изменить</button>
          <button type="button" class="btn btn--ghost btn--sm" data-action="delete" data-id="${Auth.escapeHtml(p.id)}">Удалить</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => this.openForm(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteProduct(btn.dataset.id));
    });
  },

  emptyForm() {
    return {
      id: '',
      title: '',
      brand: '',
      description: '',
      unit_price: 0,
      old_price: '',
      image: 'images/product-npk.jpg',
      url: '',
      category: 'other',
      badge: '',
      rating: 4.8,
      reviews_count: 0,
      is_active: true,
      sort_order: 0
    };
  },

  slugify(text) {
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    return text
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48);
  },

  openForm(id = null) {
    this.editingId = id;
    const titleEl = document.getElementById('admin-form-title');
    const data = id ? this.products.find((p) => p.id === id) : this.emptyForm();

    if (!data) return;

    titleEl.textContent = id ? `Редактирование: ${data.title}` : 'Новый товар';
    document.getElementById('field-id').value = data.id || '';
    document.getElementById('field-id').disabled = Boolean(id);
    document.getElementById('field-title').value = data.title || '';
    document.getElementById('field-brand').value = data.brand || '';
    document.getElementById('field-description').value = data.description || '';
    document.getElementById('field-unit-price').value = data.unit_price ?? 0;
    document.getElementById('field-old-price').value = data.old_price ?? '';
    document.getElementById('field-image').value = data.image || 'images/product-npk.jpg';
    document.getElementById('field-url').value = data.url || '';
    document.getElementById('field-category').value = data.category || 'other';
    document.getElementById('field-badge').value = data.badge || '';
    document.getElementById('field-rating').value = data.rating ?? 4.8;
    document.getElementById('field-reviews-count').value = data.reviews_count ?? 0;
    document.getElementById('field-sort-order').value = data.sort_order ?? 0;
    document.getElementById('field-is-active').checked = data.is_active !== false;

    document.getElementById('admin-form-panel').hidden = false;
    document.getElementById('admin-form-panel').scrollIntoView({ behavior: 'smooth' });
  },

  closeForm() {
    document.getElementById('admin-form-panel').hidden = true;
    this.editingId = null;
  },

  readForm() {
    const id = document.getElementById('field-id').value.trim();
    const title = document.getElementById('field-title').value.trim();

    if (!id || !title) {
      throw new Error('Заполните ID и название');
    }

    return {
      id,
      title,
      brand: document.getElementById('field-brand').value.trim(),
      description: document.getElementById('field-description').value.trim(),
      unit_price: Number(document.getElementById('field-unit-price').value) || 0,
      old_price: document.getElementById('field-old-price').value
        ? Number(document.getElementById('field-old-price').value)
        : null,
      image: document.getElementById('field-image').value.trim() || 'images/product-npk.jpg',
      url: document.getElementById('field-url').value.trim() || `product.html?id=${id}`,
      category: document.getElementById('field-category').value,
      badge: document.getElementById('field-badge').value || null,
      rating: Number(document.getElementById('field-rating').value) || 4.8,
      reviews_count: Number(document.getElementById('field-reviews-count').value) || 0,
      is_active: document.getElementById('field-is-active').checked,
      sort_order: Number(document.getElementById('field-sort-order').value) || 0
    };
  },

  async saveProduct(e) {
    e.preventDefault();
    const errorEl = document.getElementById('admin-error');
    const successEl = document.getElementById('admin-success');
    errorEl.hidden = true;
    successEl.hidden = true;

    try {
      const payload = this.readForm();
      const client = Auth.getClient();

      if (this.editingId) {
        const { error } = await client.from('products').update(payload).eq('id', this.editingId);
        if (error) throw error;
        successEl.textContent = 'Товар обновлён';
      } else {
        const { error } = await client.from('products').insert(payload);
        if (error) throw error;
        successEl.textContent = 'Товар создан';
      }

      successEl.hidden = false;
      this.closeForm();
      await this.loadProducts();
    } catch (err) {
      errorEl.textContent = err.message || 'Ошибка сохранения';
      errorEl.hidden = false;
    }
  },

  async deleteProduct(id) {
    if (!confirm(`Удалить товар «${id}»?`)) return;

    const errorEl = document.getElementById('admin-error');
    errorEl.hidden = true;

    try {
      const client = Auth.getClient();
      const { error } = await client.from('products').delete().eq('id', id);
      if (error) throw error;
      await this.loadProducts();
    } catch (err) {
      errorEl.textContent = err.message || 'Ошибка удаления';
      errorEl.hidden = false;
    }
  },

  async generateDescription() {
    const title = document.getElementById('field-title').value.trim();
    if (!title) {
      alert('Сначала укажите название товара');
      return;
    }

    const btn = document.getElementById('admin-generate-btn');

    btn.disabled = true;
    btn.textContent = 'Генерация...';

    try {
      const brand = document.getElementById('field-brand').value.trim();
      const category = document.getElementById('field-category').value;
      const prompt =
        `Напиши краткое описание товара для карточки интернет-магазина газона и удобрений. ` +
        `2–3 предложения, только текст, без заголовков и списков.\n\n` +
        `Название: ${title}\nБренд: ${brand || 'не указан'}\nКатегория: ${category}`;

      const reply = await this.requestAiChat([{ role: 'user', content: prompt }]);
      document.getElementById('field-description').value = (reply || '').trim();
    } catch (err) {
      alert(err.message || 'Не удалось сгенерировать описание');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Сгенерировать';
    }
  },

  bindEvents() {
    document.getElementById('admin-add-btn')?.addEventListener('click', () => this.openForm());
    document.getElementById('admin-cancel-btn')?.addEventListener('click', () => this.closeForm());
    document.getElementById('admin-product-form')?.addEventListener('submit', (e) => this.saveProduct(e));
    document.getElementById('admin-generate-btn')?.addEventListener('click', () => this.generateDescription());

    document.getElementById('field-title')?.addEventListener('blur', (e) => {
      if (!this.editingId && !document.getElementById('field-id').value.trim()) {
        const slug = this.slugify(e.target.value);
        document.getElementById('field-id').value = slug;
        if (!document.getElementById('field-url').value.trim()) {
          document.getElementById('field-url').value = `product.html?id=${slug}`;
        }
      }
    });
  },

  async init() {
    const session = await this.requireAdmin();
    if (!session) return;

    this.bindEvents();
    try {
      await this.loadProducts();
    } catch (err) {
      const errorEl = document.getElementById('admin-error');
      errorEl.textContent = err.message || 'Не удалось загрузить товары. Выполните supabase/products.sql';
      errorEl.hidden = false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Admin.init();
});
