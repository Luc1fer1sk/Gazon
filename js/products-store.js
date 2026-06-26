const ProductsStore = {
  list: [],
  ready: Promise.resolve(),

  formatRub(value) {
    return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  },

  mapRow(row) {
    return {
      id: row.id,
      title: row.title,
      brand: row.brand,
      description: row.description || '',
      unitPrice: row.unit_price,
      oldPrice: row.old_price,
      image: row.image,
      url: row.url || `product.html?id=${row.id}`,
      category: row.category,
      badge: row.badge,
      rating: Number(row.rating) || 4.8,
      reviewsCount: row.reviews_count || 0,
      isActive: row.is_active !== false,
      sortOrder: row.sort_order || 0
    };
  },

  syncToProductsMap() {
    if (typeof PRODUCTS === 'undefined') return;
    for (const product of this.list) {
      if (!product.isActive) continue;
      PRODUCTS[product.id] = {
        id: product.id,
        title: product.title,
        brand: product.brand,
        unitPrice: product.unitPrice,
        image: product.image,
        url: product.url,
        description: product.description
      };
    }
  },

  getById(id) {
    const fromList = this.list.find((p) => p.id === id);
    if (fromList) return fromList;

    if (typeof PRODUCTS !== 'undefined' && PRODUCTS[id]) {
      const p = PRODUCTS[id];
      return {
        id: p.id,
        title: p.title,
        brand: p.brand,
        description: p.description || '',
        unitPrice: p.unitPrice,
        oldPrice: null,
        image: p.image,
        url: p.url,
        category: 'other',
        badge: null,
        rating: 4.8,
        reviewsCount: 0,
        isActive: true,
        sortOrder: 0
      };
    }

    return null;
  },

  getByCategory(category) {
    return this.list.filter((p) => p.isActive && (!category || category === 'all' || p.category === category));
  },

  async loadFromDatabase() {
    const client = Auth.getClient();
    if (!client) return;

    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error || !data?.length) return;

    this.list = data.map((row) => this.mapRow(row));
    this.syncToProductsMap();
  },

  renderBadge(badge) {
    if (badge === 'sale') return '<div class="product-card__badge product-card__badge--sale">Акция</div>';
    if (badge === 'hit') return '<div class="product-card__badge product-card__badge--hit">Хит</div>';
    if (badge === 'new') return '<div class="product-card__badge product-card__badge--new">Новинка</div>';
    return '';
  },

  renderStars(rating) {
    const full = Math.round(rating);
    return `${'★'.repeat(full)}${'☆'.repeat(5 - full)}`;
  },

  renderPrice(product) {
    if (product.oldPrice && product.oldPrice > product.unitPrice) {
      return `<span class="price-old">${this.formatRub(product.oldPrice)}</span><span class="price-current">${this.formatRub(product.unitPrice)}</span>`;
    }
    return `<span class="price-current">${this.formatRub(product.unitPrice)}</span>`;
  },

  renderCard(product) {
    const url = Auth.escapeHtml(product.url);
    const title = Auth.escapeHtml(product.title);
    const brand = Auth.escapeHtml(product.brand);
    const image = Auth.escapeHtml(product.image);

    return `
      <article class="product-card">
        ${this.renderBadge(product.badge)}
        <a href="${url}" class="product-card__link">
          <div class="product-card__img"><img src="${image}" alt="${title}"></div>
        </a>
        <div class="product-card__body">
          <span class="product-card__brand">${brand}</span>
          <h3 class="product-card__title"><a href="${url}">${title}</a></h3>
          <div class="product-card__rating">${this.renderStars(product.rating)} <span>${product.rating}</span></div>
          <div class="product-card__footer">
            <div class="product-card__price">${this.renderPrice(product)}</div>
            <button type="button" class="btn btn--primary btn--sm btn-add-cart" data-product-id="${Auth.escapeHtml(product.id)}">В корзину</button>
          </div>
        </div>
      </article>
    `;
  },

  renderDynamicGrids() {
    document.querySelectorAll('[data-products-grid]').forEach((grid) => {
      const category = grid.dataset.productsGrid || 'all';
      const limit = Number(grid.dataset.productsLimit) || 0;
      let items = this.getByCategory(category);
      if (limit > 0) items = items.slice(0, limit);
      grid.innerHTML = items.length
        ? items.map((p) => this.renderCard(p)).join('')
        : '<p class="order-empty">Товары скоро появятся в каталоге.</p>';
    });

    const countEl = document.querySelector('[data-products-count]');
    if (countEl) {
      const category = countEl.dataset.productsCount || 'all';
      countEl.textContent = `${this.getByCategory(category).length} товаров`;
    }
  },

  async renderProductPage() {
    const root = document.getElementById('product-dynamic');
    if (!root) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      root.innerHTML = '<p class="order-empty">Товар не найден.</p>';
      return;
    }

    const product = this.getById(id);
    if (!product) {
      root.innerHTML = '<p class="order-empty">Товар не найден.</p>';
      return;
    }

    document.title = `${product.title} — ЗелёныйДвор`;

    root.innerHTML = `
      <nav class="breadcrumbs" style="margin-bottom: 32px; color: var(--color-text-muted);">
        <a href="index.html">Главная</a> <span>/</span>
        <a href="catalog.html">Каталог</a> <span>/</span>
        <span>${Auth.escapeHtml(product.title)}</span>
      </nav>
      <div class="product-detail">
        <div class="product-detail__gallery">
          <div class="product-detail__main-img">
            <img src="${Auth.escapeHtml(product.image)}" alt="${Auth.escapeHtml(product.title)}">
          </div>
        </div>
        <div class="product-detail__info">
          <span class="product-detail__brand">${Auth.escapeHtml(product.brand)}</span>
          <h1 class="product-detail__title">${Auth.escapeHtml(product.title)}</h1>
          <div class="product-detail__rating">${this.renderStars(product.rating)} <span>${product.rating} (${product.reviewsCount} отзывов)</span></div>
          <div class="product-detail__price-block">
            <span class="product-detail__price">${this.formatRub(product.unitPrice)}</span>
          </div>
          <p class="product-detail__desc">${Auth.escapeHtml(product.description || 'Описание скоро появится.')}</p>
          <div class="product-detail__actions">
            <div class="qty-input">
              <button type="button" data-action="minus" aria-label="Уменьшить">−</button>
              <input type="number" value="1" min="1" aria-label="Количество">
              <button type="button" data-action="plus" aria-label="Увеличить">+</button>
            </div>
            <button type="button" class="btn btn--primary btn--lg btn-add-cart" data-product-id="${Auth.escapeHtml(product.id)}">В корзину</button>
            <a href="contacts.html" class="btn btn--outline btn--lg">Консультация</a>
          </div>
        </div>
      </div>
    `;

    const qtyInput = root.querySelector('.qty-input input');
    root.querySelector('[data-action="minus"]')?.addEventListener('click', () => {
      qtyInput.value = String(Math.max(1, Number(qtyInput.value) - 1));
    });
    root.querySelector('[data-action="plus"]')?.addEventListener('click', () => {
      qtyInput.value = String(Number(qtyInput.value) + 1);
    });
    root.querySelector('.btn-add-cart')?.addEventListener('click', () => {
      Cart.addItem(product.id, Number(qtyInput.value) || 1);
    });
  },

  init() {
    this.ready = this.loadFromDatabase()
      .then(() => {
        this.renderDynamicGrids();
        return this.renderProductPage();
      })
      .catch(() => {});
    return this.ready;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof Auth !== 'undefined' && Auth.isConfigured()) {
    ProductsStore.init();
  }
});
