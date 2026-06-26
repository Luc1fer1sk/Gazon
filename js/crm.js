const Crm = {
  getFunctionName() {
    return window.CRM_EDGE_FUNCTION || 'amocrm-submit';
  },

  isConfigured() {
    return typeof Auth !== 'undefined' && Auth.isConfigured();
  },

  async submit(payload) {
    const client = Auth.getClient();
    if (!client) {
      throw new Error('CRM не настроена. Заполните Supabase в js/supabase-config.js');
    }

    const { data: { session } } = await client.auth.getSession();
    const options = { body: payload };

    if (session?.access_token) {
      options.headers = { Authorization: `Bearer ${session.access_token}` };
    } else if (payload.type === 'order') {
      throw new Error('Войдите в аккаунт, чтобы отправить заказ в CRM');
    }

    const { data, error } = await client.functions.invoke(this.getFunctionName(), options);

    if (error) {
      throw new Error(error.message || 'Ошибка отправки в amoCRM');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return true;
  },

  async submitContact({ name, email, topic, message }) {
    return this.submit({
      type: 'contact',
      name,
      email,
      topic,
      message,
      pageName: 'Contacts'
    });
  },

  async submitNewsletter(email) {
    return this.submit({
      type: 'newsletter',
      email,
      name: 'Подписчик',
      message: 'Подписка на рассылку (скидка 10% на первый заказ)',
      pageName: 'Newsletter'
    });
  },

  async submitOrder({ orderId, email, total, itemCount, items }) {
    await this.submit({
      type: 'order',
      orderId,
      email,
      total,
      itemCount,
      items,
      pageName: 'Checkout'
    });
  },

  bindContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const statusEl = document.getElementById('contact-form-status');
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.className = 'form-status';
      }

      const name = form.querySelector('#name')?.value.trim();
      const email = form.querySelector('#email')?.value.trim();
      const topic = form.querySelector('#topic')?.value;
      const message = form.querySelector('#message')?.value.trim();

      if (!email) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем...';
      }

      try {
        await this.submitContact({ name, email, topic, message });
        form.reset();
        if (statusEl) {
          statusEl.textContent = 'Сообщение отправлено. Мы ответим в течение часа.';
          statusEl.className = 'form-status form-status--success';
          statusEl.hidden = false;
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = err.message || 'Не удалось отправить сообщение';
          statusEl.className = 'form-status form-status--error';
          statusEl.hidden = false;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Отправить';
        }
      }
    });
  },

  bindNewsletterForm() {
    const form = document.querySelector('.newsletter__form');
    if (!form) return;

    const input = form.querySelector('.newsletter__input');
    const submitBtn = form.querySelector('button[type="submit"]');
    let statusEl = form.querySelector('.newsletter__status');
    if (!statusEl) {
      statusEl = document.createElement('p');
      statusEl.className = 'newsletter__status';
      statusEl.hidden = true;
      form.appendChild(statusEl);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusEl.hidden = true;

      const email = input?.value.trim();
      if (!email) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправляем...';
      }

      try {
        await this.submitNewsletter(email);
        form.reset();
        statusEl.textContent = 'Промокод скоро придёт на почту!';
        statusEl.className = 'newsletter__status newsletter__status--success';
        statusEl.hidden = false;
      } catch (err) {
        statusEl.textContent = err.message || 'Не удалось подписаться';
        statusEl.className = 'newsletter__status newsletter__status--error';
        statusEl.hidden = false;
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Получить скидку';
        }
      }
    });
  },

  init() {
    this.bindContactForm();
    this.bindNewsletterForm();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Crm.init();
});
