const Orders = {
  formatRub(value) {
    return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  },

  normalizeStatus(status) {
    const map = {
      new: 'Новый',
      processing: 'В обработке',
      paid: 'Оплачен',
      shipped: 'Отправлен',
      delivered: 'Доставлен',
      cancelled: 'Отменен'
    };
    return map[status] || status || 'Новый';
  },

  statusClass(status) {
    if (status === 'delivered') return 'order-status order-status--ok';
    if (status === 'cancelled') return 'order-status order-status--bad';
    return 'order-status';
  },

  collectCartItems() {
    const items = typeof Cart !== 'undefined' ? Cart.getItems() : [];
    return items.map((item) => ({
      title: item.title,
      qty: item.qty,
      unit_price: item.unitPrice,
      line_total: item.unitPrice * item.qty
    }));
  },

  calculateSummary(items) {
    const subtotal = items.reduce((acc, it) => acc + it.line_total, 0);
    const discount = subtotal >= 5000 ? 200 : 0;
    const total = Math.max(0, subtotal - discount);
    return { subtotal, discount, total };
  },

  async createOrderFromCart() {
    const client = Auth.getClient();
    if (!client) throw new Error('Supabase не настроен');

    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Нужно войти в аккаунт');

    const items = this.collectCartItems();
    if (!items.length) throw new Error('Корзина пустая');

    const summary = this.calculateSummary(items);
    const { data, error } = await client
      .from('orders')
      .insert({
        user_id: user.id,
        user_email: user.email,
        status: 'new',
        items,
        subtotal_amount: summary.subtotal,
        discount_amount: summary.discount,
        total_amount: summary.total
      })
      .select()
      .single();

    if (error) throw error;

    if (typeof Cart !== 'undefined') {
      Cart.clear();
    }

    if (typeof Crm !== 'undefined') {
      await Crm.submitOrder({
        orderId: data.id,
        email: user.email,
        total: summary.total,
        itemCount: items.reduce((acc, it) => acc + it.qty, 0),
        items
      });
    }

    await this.sendOrderEmail({
      orderId: data.id,
      email: user.email,
      items,
      subtotal: summary.subtotal,
      discount: summary.discount,
      total: summary.total
    });

    return data;
  },

  async sendOrderEmail(payload) {
    const client = Auth.getClient();
    if (!client) return;

    try {
      const { data, error } = await client.functions.invoke('send-order-email', {
        body: payload
      });

      if (error) {
        console.warn('Email не отправлен:', error.message);
        return;
      }

      if (data?.error) {
        console.warn('Email не отправлен:', data.error);
      }
    } catch (err) {
      console.warn('Email не отправлен:', err);
    }
  },

  async loadMyOrders() {
    const client = Auth.getClient();
    if (!client) throw new Error('Supabase не настроен');

    const { data: { user } } = await client.auth.getUser();
    if (!user) return [];

    const { data, error } = await client
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  renderOrdersList(container, orders) {
    if (!container) return;
    if (!orders.length) {
      container.innerHTML = '<p class="order-empty">Пока нет заказов. Оформите первый заказ в корзине.</p>';
      return;
    }

    container.innerHTML = orders.map((order) => {
      const date = new Date(order.created_at).toLocaleString('ru-RU');
      const lines = (order.items || []).map((item) => `${item.title} x${item.qty}`).join(', ');
      return `
        <article class="order-card">
          <div class="order-card__row">
            <strong>Заказ #${order.id}</strong>
            <span class="${this.statusClass(order.status)}">${this.normalizeStatus(order.status)}</span>
          </div>
          <p class="order-card__meta">${date}</p>
          <p class="order-card__items">${lines || 'Состав заказа не указан'}</p>
          <div class="order-card__row">
            <span>Сумма</span>
            <strong>${this.formatRub(order.total_amount || 0)}</strong>
          </div>
        </article>
      `;
    }).join('');
  }
};
