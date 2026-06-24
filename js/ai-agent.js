const AiAgent = {
  isOpen: false,
  messages: [],
  isTyping: false,
  cloudMode: 'checking',
  lastCloudError: null,
  STORAGE_KEY: 'zelenydvor_ai_chat_v1',

  init() {
    if (document.getElementById('ai-agent-root')) return;
    this.loadHistory();
    this.renderWidget();
    this.bindEvents();
    if (!this.messages.length) {
      this.addBotMessage(this.getWelcomeMessage());
    } else {
      this.renderMessages();
    }
    this.checkCloudAI();
  },

  loadHistory() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) this.messages = JSON.parse(raw);
    } catch {
      this.messages = [];
    }
  },

  saveHistory() {
    const trimmed = this.messages.slice(-30);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(trimmed));
  },

  getWelcomeMessage() {
    const page = this.getCurrentPage();
    const cart = this.getCartContext();
    let extra = '';
    if (cart.items.length) {
      extra = `\n\nВижу у вас в корзине ${cart.totalQty} ${this.pluralItems(cart.totalQty)} на ${this.formatRub(cart.summary.total)}. Могу помочь оформить заказ.`;
    }
    return `Привет! Я AI-консультант **ЗелёныйДвор** 🌿\n\nПомогу подобрать газон или таблетки, рассчитать количество, оформить заказ и ответить на вопросы о доставке.\n\nСейчас вы на странице: **${page.title}**.${extra}\n\nЧем могу помочь?`;
  },

  getCurrentPage() {
    const file = window.location.pathname.split('/').pop() || 'index.html';
    const known = SITE_KNOWLEDGE.pages[file];
    return {
      file,
      title: known?.title || document.title.replace(/ — ЗелёныйДвор$/, ''),
      desc: known?.desc || ''
    };
  },

  getCartContext() {
    const items = typeof Cart !== 'undefined' ? Cart.getItems() : [];
    const summary = typeof Cart !== 'undefined'
      ? Cart.calculateSummary(items)
      : { subtotal: 0, discount: 0, delivery: 0, total: 0, deliveryFree: false, totalQty: 0 };
    return { items, summary };
  },

  async getUserContext() {
    let loggedIn = false;
    let email = null;
    if (typeof Auth !== 'undefined' && Auth.getClient()) {
      try {
        const { data: { user } } = await Auth.getClient().auth.getUser();
        loggedIn = Boolean(user);
        email = user?.email || null;
      } catch {
        loggedIn = false;
      }
    }
    return { loggedIn, email };
  },

  buildContext() {
    const page = this.getCurrentPage();
    const cart = this.getCartContext();
    const productOnPage = this.detectProductOnPage();

    return {
      store: SITE_KNOWLEDGE.store,
      contacts: SITE_KNOWLEDGE.contacts,
      delivery: SITE_KNOWLEDGE.delivery,
      discounts: SITE_KNOWLEDGE.discounts,
      checkout: SITE_KNOWLEDGE.checkout,
      currentPage: page,
      productOnPage,
      cart: {
        items: cart.items.map((i) => ({
          id: i.id,
          title: i.title,
          qty: i.qty,
          unitPrice: i.unitPrice,
          lineTotal: i.unitPrice * i.qty
        })),
        summary: cart.summary
      },
      products: SITE_KNOWLEDGE.products,
      categories: SITE_KNOWLEDGE.categories,
      faq: SITE_KNOWLEDGE.faq
    };
  },

  detectProductOnPage() {
    const btn = document.querySelector('.btn-add-cart[data-product-id]');
    if (!btn) return null;
    const id = btn.dataset.productId;
    const p = SITE_KNOWLEDGE.products[id];
    if (!p) return null;
    return { id, ...p };
  },

  renderWidget() {
    const root = document.createElement('div');
    root.id = 'ai-agent-root';
    root.innerHTML = `
      <button type="button" class="ai-agent__toggle" id="ai-agent-toggle" aria-label="Открыть AI-консультанта">
        <span class="ai-agent__toggle-icon">🌿</span>
        <span class="ai-agent__toggle-label">AI помощник</span>
      </button>
      <div class="ai-agent__panel" id="ai-agent-panel" hidden>
        <div class="ai-agent__header">
          <div class="ai-agent__header-info">
            <strong>Зелёный AI</strong>
            <span id="ai-agent-status">Проверка подключения...</span>
          </div>
          <div class="ai-agent__header-actions">
            <button type="button" class="ai-agent__clear" id="ai-agent-clear" title="Очистить чат">↺</button>
            <button type="button" class="ai-agent__close" id="ai-agent-close" aria-label="Закрыть">✕</button>
          </div>
        </div>
        <div class="ai-agent__messages" id="ai-agent-messages"></div>
        <div class="ai-agent__quick" id="ai-agent-quick">
          <button type="button" data-q="Подбери газон для дачи">🌱 Подбор газона</button>
          <button type="button" data-q="Что в моей корзине?">🛒 Корзина</button>
          <button type="button" data-q="Как оформить заказ?">📦 Заказ</button>
          <button type="button" data-q="Условия доставки">🚚 Доставка</button>
        </div>
        <form class="ai-agent__input-row" id="ai-agent-form">
          <input type="text" id="ai-agent-input" placeholder="Спросите о газоне, таблетках, заказе..." autocomplete="off" maxlength="500">
          <button type="submit" class="ai-agent__send" aria-label="Отправить">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg>
          </button>
        </form>
      </div>
    `;
    document.body.appendChild(root);
  },

  bindEvents() {
    const toggle = document.getElementById('ai-agent-toggle');
    const panel = document.getElementById('ai-agent-panel');
    const close = document.getElementById('ai-agent-close');
    const clear = document.getElementById('ai-agent-clear');
    const form = document.getElementById('ai-agent-form');
    const input = document.getElementById('ai-agent-input');
    const quick = document.getElementById('ai-agent-quick');

    toggle?.addEventListener('click', () => this.togglePanel());
    close?.addEventListener('click', () => this.closePanel());
    clear?.addEventListener('click', () => {
      this.messages = [];
      this.saveHistory();
      this.addBotMessage(this.getWelcomeMessage());
    });

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || this.isTyping) return;
      input.value = '';
      this.handleUserMessage(text);
    });

    quick?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-q]');
      if (!btn || this.isTyping) return;
      this.handleUserMessage(btn.dataset.q);
    });

    document.getElementById('ai-agent-messages')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.ai-agent__cart-btn');
      if (!btn || typeof Cart === 'undefined') return;
      const id = btn.dataset.productId;
      const qty = parseInt(btn.dataset.qty, 10) || 1;
      if (!id) return;
      Cart.addItem(id, qty);
      btn.textContent = '✓ Добавлено';
      btn.disabled = true;
    });
  },

  togglePanel() {
    this.isOpen = !this.isOpen;
    const panel = document.getElementById('ai-agent-panel');
    const toggle = document.getElementById('ai-agent-toggle');
    if (panel) panel.hidden = !this.isOpen;
    if (toggle) toggle.classList.toggle('ai-agent__toggle--open', this.isOpen);
    if (this.isOpen) {
      document.getElementById('ai-agent-input')?.focus();
      this.scrollToBottom();
    }
  },

  closePanel() {
    this.isOpen = false;
    const panel = document.getElementById('ai-agent-panel');
    const toggle = document.getElementById('ai-agent-toggle');
    if (panel) panel.hidden = true;
    if (toggle) toggle.classList.remove('ai-agent__toggle--open');
  },

  addUserMessage(text) {
    this.messages.push({ role: 'user', content: text });
    this.saveHistory();
    this.renderMessages();
  },

  addBotMessage(text) {
    this.messages.push({ role: 'assistant', content: text });
    this.saveHistory();
    this.renderMessages();
  },

  renderCartButton(productId, qty) {
    const p = SITE_KNOWLEDGE.products[productId];
    const label = p ? `🛒 ${p.title.split(' ').slice(0, 3).join(' ')}` : '🛒 В корзину';
    const price = p ? ` · ${this.formatRub(p.price)}` : '';
    return `<button type="button" class="ai-agent__cart-btn" data-product-id="${productId}" data-qty="${qty}">${label}${price}</button>`;
  },

  formatMessage(text) {
    const cartButtons = [];

    let html = text.replace(/\[\[ADD[_\s]?TO[_\s]?CART:([^:\]]+)(?::(\d+))?\]\]/gi, (_, id, qty) => {
      const btn = this.renderCartButton(id.trim(), parseInt(qty, 10) || 1);
      cartButtons.push(btn);
      return `%%CART${cartButtons.length - 1}%%`;
    });

    html = html.replace(/\[\[GO:([^\]]+)\]\]/gi, (_, url) => {
      const safe = url.trim().replace(/[^a-zA-Z0-9._\-/?#=&]/g, '');
      return `%%GO:${safe}%%`;
    });

    html = html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    cartButtons.forEach((btn, i) => {
      html = html.replace(`%%CART${i}%%`, btn);
    });

    html = html.replace(/%%GO:([^%]+)%%/g, '<a href="$1" class="ai-agent__link">Перейти →</a>');

    return html;
  },

  renderMessages() {
    const container = document.getElementById('ai-agent-messages');
    if (!container) return;

    container.innerHTML = this.messages.map((msg) => {
      const cls = msg.role === 'user' ? 'ai-agent__msg ai-agent__msg--user' : 'ai-agent__msg ai-agent__msg--bot';
      return `<div class="${cls}">${this.formatMessage(msg.content)}</div>`;
    }).join('');

    if (this.isTyping) {
      container.innerHTML += `<div class="ai-agent__msg ai-agent__msg--bot ai-agent__msg--typing"><span></span><span></span><span></span></div>`;
    }

    this.scrollToBottom();
  },

  scrollToBottom() {
    const container = document.getElementById('ai-agent-messages');
    if (container) container.scrollTop = container.scrollHeight;
  },

  setTyping(on) {
    this.isTyping = on;
    this.renderMessages();
    const input = document.getElementById('ai-agent-input');
    const send = document.querySelector('.ai-agent__send');
    if (input) input.disabled = on;
    if (send) send.disabled = on;
  },

  async handleUserMessage(text) {
    this.addUserMessage(text);
    this.setTyping(true);

    try {
      const userCtx = await this.getUserContext();
      const context = { ...this.buildContext(), user: userCtx };
      let reply = await this.callCloudAI(text, context);
      if (!reply) {
        reply = this.localRespond(text, context);
        if (this.lastCloudError && !this._cloudErrorShown) {
          this._cloudErrorShown = true;
          reply += `\n\n_⚠️ Groq AI недоступен: ${this.lastCloudError}. ${this.getCloudHint()} Работаю в локальном режиме._`;
        }
      }
      this.setTyping(false);
      this.addBotMessage(reply);
    } catch (err) {
      this.setTyping(false);
      const context = this.buildContext();
      const reply = this.localRespond(text, context);
      this.addBotMessage(reply);
    }
  },

  isSupabaseConfigured() {
    return Boolean(
      window.SUPABASE_URL &&
      window.SUPABASE_ANON_KEY &&
      !window.SUPABASE_URL.includes('ВАШ_ПРОЕКТ') &&
      window.SUPABASE_ANON_KEY !== 'ВАШ_ANON_KEY'
    );
  },

  getApiMessages() {
    return this.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
  },

  updateStatusLabel() {
    const el = document.getElementById('ai-agent-status');
    if (!el) return;
    if (this.cloudMode === 'groq') {
      el.textContent = '● Groq AI (Llama 3.3)';
      el.className = 'ai-agent__status ai-agent__status--online';
    } else if (this.cloudMode === 'checking') {
      el.textContent = 'Проверка подключения...';
      el.className = 'ai-agent__status';
    } else {
      el.textContent = '● Локальный режим';
      el.className = 'ai-agent__status ai-agent__status--local';
    }
  },

  async checkCloudAI() {
    if (!this.isSupabaseConfigured()) {
      this.cloudMode = 'local';
      this.lastCloudError = 'Supabase не настроен';
      this.updateStatusLabel();
      return;
    }

    try {
      const reply = await this.requestCloudAI(
        [{ role: 'user', content: 'ping' }],
        { ping: true }
      );
      if (reply) {
        this.cloudMode = 'groq';
        this.lastCloudError = null;
      } else {
        this.cloudMode = 'local';
      }
    } catch (err) {
      this.cloudMode = 'local';
      this.lastCloudError = err.message || 'Неизвестная ошибка';
      console.warn('[AI] Облачный режим недоступен:', this.lastCloudError);
    }
    this.updateStatusLabel();
  },

  getEdgeFunctionName() {
    return window.AI_EDGE_FUNCTION || 'ai-chat';
  },

  getCloudHint() {
    if (window.location.protocol === 'file:') {
      return 'Откройте сайт через Live Server или GitHub Pages (не file://).';
    }
    return `Проверьте в Supabase: Edge Functions → ${this.getEdgeFunctionName()}, секрет GROQ_API_KEY, JWT выключен.`;
  },

  async requestCloudAI(messages, context) {
    if (window.location.protocol === 'file:') {
      throw new Error('Сайт открыт как файл (file://). ' + this.getCloudHint());
    }

    const payload = { messages, context };
    const fn = this.getEdgeFunctionName();
    const url = `${window.SUPABASE_URL}/functions/v1/${fn}`;
    const errors = [];

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
        errors.push(`Функция ${fn} не найдена (404). Задеплойте её в Supabase.`);
      } else if (data.error) {
        errors.push(data.error);
      } else {
        errors.push(`HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(err.message || 'Сеть недоступна');
    }

    const client = typeof Auth !== 'undefined' ? Auth.getClient() : null;
    if (client) {
      try {
        const { data, error } = await client.functions.invoke(fn, { body: payload });
        if (!error && data?.reply) return data.reply;
        if (error?.message) errors.push(error.message);
        else if (data?.error) errors.push(data.error);
      } catch (err) {
        errors.push(err.message || 'invoke failed');
      }
    }

    const unique = [...new Set(errors.filter(Boolean))];
    throw new Error(unique[0] || 'Не удалось связаться с Edge Function');
  },

  async callCloudAI(_userText, context) {
    if (!this.isSupabaseConfigured()) return null;

    try {
      const reply = await this.requestCloudAI(this.getApiMessages(), context);
      if (reply) {
        this.cloudMode = 'groq';
        this.lastCloudError = null;
        this.updateStatusLabel();
        return reply;
      }
    } catch (err) {
      this.cloudMode = 'local';
      this.lastCloudError = err.message || 'Ошибка облачного AI';
      this.updateStatusLabel();
      console.warn('[AI] Fallback на локальный режим:', this.lastCloudError);
    }
    return null;
  },

  localRespond(text, context) {
    const q = text.toLowerCase().trim();

    if (this.matchAny(q, ['корзин', 'в корзине', 'что заказал'])) {
      return this.responseCart(context);
    }

    if (this.matchAny(q, ['оформ', 'заказ', 'купить', 'checkout', 'оплат'])) {
      return this.responseCheckout(context);
    }

    if (this.matchAny(q, ['доставк', 'привез', 'курьер', 'срок'])) {
      return this.responseDelivery(context);
    }

    if (this.matchAny(q, ['контакт', 'телефон', 'позвон', 'email', 'почт', 'адрес', 'самовывоз'])) {
      return this.responseContacts();
    }

    if (this.matchAny(q, ['скидк', 'бесплатн', '5000', 'акци'])) {
      return `**Акции и доставка:**\n\n• Скидка **200 ₽** при заказе от **5 000 ₽**\n• **Бесплатная доставка** при заказе от 5 000 ₽\n• Иначе доставка — **490 ₽**\n\n${this.cartHint(context)}`;
    }

    if (this.matchAny(q, ['добав', 'полож', 'в корзину']) && this.matchProduct(q)) {
      return this.responseAddToCart(q);
    }

    if (this.matchAny(q, ['тень', 'тенев', 'затенён', 'под дерев'])) {
      return this.responseRecommend(['shadow', 'bio'], 'Для затенённых участков рекомендую:');
    }

    if (this.matchAny(q, ['солн', 'светл', 'открыт'])) {
      return this.responseRecommend(['lawn-premium', 'npk'], 'Для солнечных участков отлично подойдут:');
    }

    if (this.matchAny(q, ['спорт', 'футбол', 'детск', 'площадк'])) {
      return this.responseRecommend(['sport', 'npk'], 'Для активного использования:');
    }

    if (this.matchAny(q, ['сорняк', 'weed', 'бурьян'])) {
      return this.responseRecommend(['weed', 'npk'], 'От сорняков и для подкормки:');
    }

    if (this.matchAny(q, ['семен', 'посев', 'посадить с нуля'])) {
      return this.responseRecommend(['seeds', 'root', 'npk'], 'Для посева газона с нуля:');
    }

    if (this.matchAny(q, ['газон', 'рулон', 'трав', 'дач', 'участок', 'подбер'])) {
      return this.responseLawnAdvice(q);
    }

    if (this.matchAny(q, ['таблетк', 'удобр', 'npk', 'подкорм'])) {
      return this.responseTabletsAdvice(q);
    }

    if (this.matchAny(q, ['цена', 'стоим', 'сколько стоит', 'прайс'])) {
      return this.responsePrices();
    }

    if (this.matchAny(q, ['привет', 'здравств', 'добрый', 'хай', 'hello'])) {
      return this.getWelcomeMessage();
    }

    const product = this.findProductByQuery(q);
    if (product) {
      return this.responseProductInfo(product);
    }

    return `Я могу помочь с:\n\n• **Подбором газона** (солнце, тень, спорт)\n• **Таблетками** (удобрения, сорняки, корни)\n• **Корзиной и заказом**\n• **Доставкой и контактами**\n\nНапишите, например: «Подбери газон для дачи 50 м²» или «Добавь NPK в корзину».\n\nТелефон: **${SITE_KNOWLEDGE.contacts.phone}**`;
  },

  matchAny(q, keywords) {
    return keywords.some((k) => q.includes(k));
  },

  matchProduct(q) {
    return Boolean(this.findProductByQuery(q));
  },

  findProductByQuery(q) {
    for (const [id, p] of Object.entries(SITE_KNOWLEDGE.products)) {
      if (q.includes(id)) return { id, ...p };
      if (p.title.toLowerCase().split(' ').some((w) => w.length > 3 && q.includes(w))) return { id, ...p };
      if (p.tags?.some((t) => q.includes(t))) return { id, ...p };
      if (p.brand.toLowerCase() && q.includes(p.brand.toLowerCase())) return { id, ...p };
    }
    if (q.includes('премиум') || q.includes('premium')) return { id: 'lawn-premium', ...SITE_KNOWLEDGE.products['lawn-premium'] };
    if (q.includes('npk')) return { id: 'npk', ...SITE_KNOWLEDGE.products.npk };
    if (q.includes('weed') || q.includes('сорняк')) return { id: 'weed', ...SITE_KNOWLEDGE.products.weed };
    return null;
  },

  extractQty(q) {
    const m = q.match(/(\d+)\s*(м²|м2|кв|шт|упак|штук)?/);
    return m ? Math.max(1, parseInt(m[1], 10)) : 1;
  },

  responseCart(context) {
    const { items, summary } = context.cart;
    if (!items.length) {
      return 'Корзина пуста. Загляните в [[GO:catalog.html]] — помогу подобрать газон или таблетки!';
    }
    const lines = items.map((i) => `• ${i.title} × ${i.qty} = ${this.formatRub(i.lineTotal)}`).join('\n');
    const delivery = summary.deliveryFree ? 'бесплатно' : this.formatRub(summary.delivery);
    return `**Ваша корзина:**\n\n${lines}\n\n**Итого:** ${this.formatRub(summary.total)}\nДоставка: ${delivery}\n\nОформить заказ → [[GO:cart.html]]`;
  },

  responseCheckout(context) {
    const { items } = context.cart;
    if (!items.length) {
      return 'Сначала добавьте товары в корзину. Могу порекомендовать — напишите про ваш участок!';
    }
    return `**Как оформить заказ:**\n\n1. Перейдите в [[GO:cart.html]]\n2. Войдите в [[GO:login.html]] (нужен аккаунт)\n3. Нажмите **«Оформить заказ»**\n4. Статус заказа — в [[GO:account.html]]\n\n${this.cartHint(context)}`;
  },

  responseDelivery(context) {
    const { summary } = context.cart;
    let hint = '';
    if (summary.subtotal > 0 && !summary.deliveryFree) {
      const need = SITE_KNOWLEDGE.delivery.freeFrom - summary.subtotal;
      hint = `\n\nДо бесплатной доставки осталось **${this.formatRub(need)}**.`;
    }
    return `**Доставка:**\n\n• Москва — **${SITE_KNOWLEDGE.delivery.moscow}**\n• По России — **${SITE_KNOWLEDGE.delivery.russia}**\n• Бесплатно от **5 000 ₽**, иначе **490 ₽**\n• Самовывоз: ${SITE_KNOWLEDGE.contacts.address}, ${SITE_KNOWLEDGE.contacts.pickupHours}${hint}`;
  },

  responseContacts() {
    const c = SITE_KNOWLEDGE.contacts;
    return `**Контакты:**\n\n📞 ${c.phone} (${c.supportHours})\n✉️ ${c.email}\n📍 ${c.address}\n🕐 Самовывоз: ${c.pickupHours}\n\n[[GO:contacts.html]]`;
  },

  responseRecommend(ids, intro) {
    const lines = ids.map((id) => {
      const p = SITE_KNOWLEDGE.products[id];
      return `• **${p.title}** — ${this.formatRub(p.price)}/${p.unit}\n  ${p.desc}\n  [[GO:${p.url}]]`;
    });
    const first = ids[0];
    return `${intro}\n\n${lines.join('\n\n')}\n\nДобавить в корзину? Напишите «добавь ${SITE_KNOWLEDGE.products[first].title.split(' ').slice(0, 2).join(' ')}».`;
  },

  responseLawnAdvice(q) {
    const sqm = this.extractSqm(q);
    if (q.includes('тень') || q.includes('тенев')) {
      const qty = sqm || 10;
      const cost = SITE_KNOWLEDGE.products.shadow.price * qty;
      return `Для тени — **Теневыносливый газон** (520 ₽/м²).\n\n${sqm ? `На **${sqm} м²** ≈ **${this.formatRub(cost)}** + таблетки Bio-Active для подкормки.` : 'Укажите площадь — рассчитаю стоимость.'}\n\n[[GO:product-shadow.html]]\n\nДобавить в корзину? Напишите «добавь теневой ${qty}».`;
    }
    const qty = sqm || 10;
    const cost = SITE_KNOWLEDGE.products['lawn-premium'].price * qty;
    return `**Рулонный газон «Премиум»** — хит продаж (450 ₽/м²).\n\n${sqm ? `На **${sqm} м²** ≈ **${this.formatRub(cost)}**.` : 'Для расчёта укажите площадь, например «50 м²».'}\n\n+ таблетки NPK для подкормки (790 ₽).\n\n[[GO:product-lawn.html]]\n\nДобавить? «добавь премиум ${qty}»`;
  },

  responseTabletsAdvice() {
    return `**Таблетки в каталоге:**\n\n• **NPK 12-6-8** — 790 ₽ (универсальное удобрение)\n• **WeedStop** — 1 250 ₽ (от сорняков)\n• **Root+** — 650 ₽ (корнеобразование)\n• **Bio-Active** — 1 100 ₽ (органика)\n\n[[GO:tablets.html]]\n\nЧто добавить в корзину?`;
  },

  responsePrices() {
    const lines = Object.entries(SITE_KNOWLEDGE.products).map(([, p]) => {
      return `• ${p.title} — **${this.formatRub(p.price)}**/${p.unit}`;
    });
    return `**Цены:**\n\n${lines.join('\n')}\n\n[[GO:catalog.html]]`;
  },

  responseProductInfo(product) {
    return `**${product.title}**\nБренд: ${product.brand}\nЦена: **${this.formatRub(product.price)}**/${product.unit}\n\n${product.desc}\n\n[[GO:${product.url}]]\n\nДобавить в корзину? Напишите «добавь ${product.id}».`;
  },

  responseAddToCart(q) {
    const product = this.findProductByQuery(q);
    if (!product) return 'Не нашёл товар. Уточните название — премиум, NPK, спортивный, теневой...';
    const qty = this.extractQty(q);
    if (typeof Cart !== 'undefined') {
      Cart.addItem(product.id, qty);
      return `✅ Добавил **${product.title}** × ${qty} в корзину!\n\n[[GO:cart.html]]`;
    }
    return `Добавьте **${product.title}** (${this.formatRub(product.price)}) на [[GO:${product.url}]].`;
  },

  extractSqm(q) {
    const m = q.match(/(\d+)\s*(м²|м2|кв\.?\s*м|квадрат)/i);
    return m ? parseInt(m[1], 10) : null;
  },

  cartHint(context) {
    const { summary } = context.cart;
    if (!summary.subtotal) return '';
    if (summary.deliveryFree) return 'У вас уже бесплатная доставка! 🎉';
    const need = SITE_KNOWLEDGE.delivery.freeFrom - summary.subtotal;
    return `До бесплатной доставки: **${this.formatRub(need)}**.`;
  },

  formatRub(value) {
    return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  },

  pluralItems(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'товаров';
    if (mod10 === 1) return 'товар';
    if (mod10 >= 2 && mod10 <= 4) return 'товара';
    return 'товаров';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof SITE_KNOWLEDGE !== 'undefined') {
    AiAgent.init();
  }
});
