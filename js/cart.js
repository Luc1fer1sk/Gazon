const Cart = {
  STORAGE_KEY: 'zelenydvor_cart_v2',

  getItems() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return [];
    try {
      const items = JSON.parse(raw);
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  },

  saveItems(items) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(items));
    this.updateBadge();
  },

  clear() {
    this.saveItems([]);
  },

  getProduct(id) {
    return typeof PRODUCTS !== 'undefined' ? PRODUCTS[id] : null;
  },

  addItem(productId, qty = 1) {
    const product = this.getProduct(productId);
    if (!product) return false;

    const amount = Math.max(1, Number(qty) || 1);
    const items = this.getItems();
    const existing = items.find((i) => i.id === productId);

    if (existing) {
      existing.qty += amount;
    } else {
      items.push({
        id: product.id,
        title: product.title,
        brand: product.brand,
        unitPrice: product.unitPrice,
        image: product.image,
        url: product.url,
        qty: amount
      });
    }

    this.saveItems(items);
    this.showToast(`«${product.title}» добавлен в корзину`);
    return true;
  },

  removeItem(id) {
    this.saveItems(this.getItems().filter((i) => i.id !== id));
  },

  setItemQty(id, qty) {
    const nextQty = Number(qty);
    if (!nextQty || nextQty < 1) {
      this.removeItem(id);
      return;
    }

    const items = this.getItems();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.qty = nextQty;
    this.saveItems(items);
  },

  getTotalQty() {
    return this.getItems().reduce((sum, item) => sum + item.qty, 0);
  },

  updateBadge() {
    const count = this.getTotalQty();
    document.querySelectorAll('.cart-btn__badge').forEach((badge) => {
      badge.textContent = String(count);
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  },

  formatRub(value) {
    return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  },

  calculateSummary(items) {
    const subtotal = items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
    const discount = subtotal >= 5000 ? 200 : 0;
    const deliveryFree = subtotal >= 5000;
    const delivery = items.length && !deliveryFree ? 490 : 0;
    const total = Math.max(0, subtotal - discount + delivery);
    const totalQty = items.reduce((a, i) => a + i.qty, 0);
    return { subtotal, discount, delivery, total, deliveryFree, totalQty };
  },

  showToast(message) {
    let toast = document.getElementById('cart-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cart-toast';
      toast.className = 'cart-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('cart-toast--visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('cart-toast--visible');
    }, 2200);
  },

  renderCartPage() {
    const container = document.getElementById('cart-items');
    const bannerText = document.getElementById('cart-banner-text');
    if (!container) return;

    const items = this.getItems();
    const checkoutBtn = document.getElementById('checkout-btn');

    if (!items.length) {
      container.innerHTML = `
        <div class="cart-empty">
          <p>Корзина пуста</p>
          <a href="catalog.html" class="btn btn--primary">Перейти в каталог</a>
        </div>
      `;
      if (bannerText) bannerText.textContent = 'Корзина пуста';
      this.updateSummaryUI({ subtotal: 0, discount: 0, delivery: 0, total: 0, deliveryFree: false, totalQty: 0 });
      if (checkoutBtn) checkoutBtn.disabled = true;
      return;
    }

    if (checkoutBtn) checkoutBtn.disabled = false;

    container.innerHTML = items.map((item) => `
      <div class="cart-item" data-id="${item.id}">
        <a href="${item.url}" class="cart-item__img"><img src="${item.image}" alt="${item.title}"></a>
        <div class="cart-item__info">
          <div class="cart-item__top">
            <a href="${item.url}" class="cart-item__title">${item.title}</a>
            <button type="button" class="cart-item__remove" data-action="remove" aria-label="Удалить">✕</button>
          </div>
          <div class="cart-item__brand">${item.brand}</div>
          <div class="cart-item__bottom">
            <div class="qty-input">
              <button type="button" data-action="minus" aria-label="Уменьшить">−</button>
              <input type="number" value="${item.qty}" min="1" aria-label="Количество">
              <button type="button" data-action="plus" aria-label="Увеличить">+</button>
            </div>
            <span class="cart-item__price">${this.formatRub(item.unitPrice * item.qty)}</span>
          </div>
        </div>
      </div>
    `).join('');

    const summary = this.calculateSummary(items);
    if (bannerText) {
      bannerText.textContent = `${summary.totalQty} ${this.pluralItems(summary.totalQty)} в корзине`;
    }
    this.updateSummaryUI(summary);

    container.querySelectorAll('.cart-item').forEach((row) => {
      const id = row.dataset.id;
      const input = row.querySelector('input');
      const minus = row.querySelector('[data-action="minus"]');
      const plus = row.querySelector('[data-action="plus"]');
      const remove = row.querySelector('[data-action="remove"]');

      minus?.addEventListener('click', () => {
        const current = Number(input.value) || 1;
        this.setItemQty(id, current - 1);
        this.renderCartPage();
      });

      plus?.addEventListener('click', () => {
        const current = Number(input.value) || 1;
        this.setItemQty(id, current + 1);
        this.renderCartPage();
      });

      input?.addEventListener('change', () => {
        this.setItemQty(id, Number(input.value) || 0);
        this.renderCartPage();
      });

      remove?.addEventListener('click', () => {
        this.removeItem(id);
        this.renderCartPage();
      });
    });
  },

  updateSummaryUI({ subtotal, discount, delivery, total, deliveryFree, totalQty }) {
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    set('items-count-label', `Товары (${totalQty})`);
    set('subtotal-value', this.formatRub(subtotal));
    set('discount-value', discount ? `−${this.formatRub(discount)}` : '0 ₽');
    set('total-value', this.formatRub(total));

    const deliveryEl = document.getElementById('delivery-value');
    if (deliveryEl) {
      if (!totalQty) {
        deliveryEl.textContent = '—';
      } else if (deliveryFree) {
        deliveryEl.textContent = 'Бесплатно';
        deliveryEl.style.color = 'var(--color-primary)';
      } else {
        deliveryEl.textContent = this.formatRub(delivery);
        deliveryEl.style.color = 'var(--color-text-muted)';
      }
    }
  },

  pluralItems(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'товаров';
    if (mod10 === 1) return 'товар';
    if (mod10 >= 2 && mod10 <= 4) return 'товара';
    return 'товаров';
  },

  bindAddButtons() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-add-cart');
      if (!btn) return;

      e.preventDefault();
      const productId = btn.dataset.productId;
      if (!productId) return;

      let qty = 1;
      const actions = btn.closest('.product-detail__actions');
      if (actions) {
        qty = Number(actions.querySelector('.qty-input input')?.value || 1);
      }

      this.addItem(productId, qty);
    });
  },

  init() {
    this.updateBadge();
    this.bindAddButtons();
    if (document.getElementById('cart-items')) {
      this.renderCartPage();
    }
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof ProductsStore !== 'undefined') {
    await ProductsStore.ready;
  }
  Cart.init();
});
