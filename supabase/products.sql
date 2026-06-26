-- Выполните в Supabase SQL Editor

create table if not exists public.products (
  id text primary key,
  title text not null,
  brand text not null default '',
  description text not null default '',
  unit_price integer not null default 0,
  old_price integer,
  image text not null default 'images/product-npk.jpg',
  url text not null default '',
  category text not null default 'other' check (category in ('tablets', 'lawn', 'other')),
  badge text check (badge is null or badge in ('sale', 'hit', 'new')),
  rating numeric(2,1) not null default 4.8,
  reviews_count integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists products_category_idx on public.products(category);
create index if not exists products_active_idx on public.products(is_active);
create index if not exists products_sort_idx on public.products(sort_order);

alter table public.products enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(email) = lower('agent47podprikritiem@gmail.com')
  );
$$;

drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
  on public.products for select
  using (is_active = true or public.is_admin());

drop policy if exists "products_insert_admin" on public.products;
create policy "products_insert_admin"
  on public.products for insert
  with check (public.is_admin());

drop policy if exists "products_update_admin" on public.products;
create policy "products_update_admin"
  on public.products for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "products_delete_admin" on public.products;
create policy "products_delete_admin"
  on public.products for delete
  using (public.is_admin());

create or replace function public.set_products_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute procedure public.set_products_updated_at();

insert into public.products (id, title, brand, description, unit_price, old_price, image, url, category, badge, rating, reviews_count, sort_order)
values
  ('npk', 'Таблетки удобрения NPK 12-6-8', 'BioGrow', 'Сбалансированное удобрение в таблетках для активного роста газона и насыщения почвы питательными веществами.', 790, 990, 'images/product-npk.jpg', 'product-npk.html', 'tablets', 'sale', 4.9, 128, 10),
  ('weed', 'Таблетки от сорняков WeedStop', 'GreenMax', 'Эффективная защита газона от сорняков в удобной таблетированной форме.', 1250, null, 'images/product-weed.jpg', 'product-weed.html', 'tablets', 'hit', 4.7, 94, 20),
  ('root', 'Стимулятор корнеобразования Root+', 'TerraVita', 'Ускоряет развитие корневой системы и помогает газону быстрее приживаться после посадки.', 650, null, 'images/product-root.jpg', 'product-root.html', 'tablets', null, 5.0, 67, 30),
  ('bio', 'Органические таблетки Bio-Active', 'EcoLawn', 'Натуральный состав для здоровья почвы и устойчивого роста газона без агрессивной химии.', 1100, null, 'images/product-bio.jpg', 'product-bio.html', 'tablets', 'new', 4.6, 41, 40),
  ('lawn-premium', 'Рулонный газон «Премиум» 1 м²', 'LawnPro', 'Плотный рулонный газон премиум-класса. Густая зелёная трава без проплешин, готов к укладке сразу после доставки.', 450, null, 'images/product-lawn-premium.jpg', 'product-lawn.html', 'lawn', 'hit', 4.9, 312, 50),
  ('sport', 'Спортивный газон рулонный 1 м²', 'SportGrass', 'Износостойкий газон для активной нагрузки: детские площадки, спортивные зоны и участки с высокой проходимостью.', 580, null, 'images/product-lawn-sport.jpg', 'product-sport.html', 'lawn', null, 4.8, 156, 60),
  ('seeds', 'Семена газона «Универсал» 1 кг', 'SeedMaster', 'Универсальная смесь семян для ровного и густого газона на солнечных и полутенистых участках.', 1260, 1400, 'images/product-seeds.jpg', 'product-seeds.html', 'lawn', 'sale', 4.5, 88, 70),
  ('shadow', 'Теневыносливый газон рулонный 1 м²', 'ShadowLawn', 'Специальная смесь для затенённых участков: сохраняет насыщенный зелёный цвет даже при недостатке солнца.', 520, null, 'images/product-lawn-shadow.jpg', 'product-shadow.html', 'lawn', null, 4.6, 43, 80)
on conflict (id) do nothing;
