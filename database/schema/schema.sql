CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Utility function
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Users and authentication
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email VARCHAR(320) NOT NULL,
  password_hash TEXT NOT NULL,

  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,

  role VARCHAR(30) NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'admin')),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
  ON users (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS users_role_idx
  ON users (role);

-- ============================================================
-- Catalog
-- ============================================================

CREATE TABLE IF NOT EXISTS publishers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  biography TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name VARCHAR(150) NOT NULL,
  slug VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,

  parent_id UUID REFERENCES categories(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS categories_parent_id_idx
  ON categories (parent_id);

CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  isbn VARCHAR(20) UNIQUE,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL UNIQUE,
  description TEXT,

  language VARCHAR(50),
  publication_date DATE,
  page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),

  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  sale_price NUMERIC(12, 2)
    CHECK (
      sale_price IS NULL
      OR (sale_price >= 0 AND sale_price <= price)
    ),

  cover_image_url TEXT,

  publisher_id UUID REFERENCES publishers(id)
    ON DELETE SET NULL,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS books_title_idx
  ON books (title);

CREATE INDEX IF NOT EXISTS books_publisher_id_idx
  ON books (publisher_id);

CREATE INDEX IF NOT EXISTS books_active_idx
  ON books (is_active)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS book_authors (
  book_id UUID NOT NULL REFERENCES books(id)
    ON DELETE CASCADE,

  author_id UUID NOT NULL REFERENCES authors(id)
    ON DELETE CASCADE,

  author_order INTEGER NOT NULL DEFAULT 1
    CHECK (author_order > 0),

  PRIMARY KEY (book_id, author_id)
);

CREATE INDEX IF NOT EXISTS book_authors_author_id_idx
  ON book_authors (author_id);

CREATE TABLE IF NOT EXISTS book_categories (
  book_id UUID NOT NULL REFERENCES books(id)
    ON DELETE CASCADE,

  category_id UUID NOT NULL REFERENCES categories(id)
    ON DELETE CASCADE,

  PRIMARY KEY (book_id, category_id)
);

CREATE INDEX IF NOT EXISTS book_categories_category_id_idx
  ON book_categories (category_id);

CREATE TABLE IF NOT EXISTS inventory (
  book_id UUID PRIMARY KEY REFERENCES books(id)
    ON DELETE CASCADE,

  quantity INTEGER NOT NULL DEFAULT 0
    CHECK (quantity >= 0),

  reserved_quantity INTEGER NOT NULL DEFAULT 0
    CHECK (
      reserved_quantity >= 0
      AND reserved_quantity <= quantity
    ),

  reorder_level INTEGER NOT NULL DEFAULT 0
    CHECK (reorder_level >= 0),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Shopping cart
-- ============================================================

CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id)
    ON DELETE CASCADE,

  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'converted', 'abandoned')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS carts_one_active_cart_per_user_idx
  ON carts (user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  cart_id UUID NOT NULL REFERENCES carts(id)
    ON DELETE CASCADE,

  book_id UUID NOT NULL REFERENCES books(id)
    ON DELETE RESTRICT,

  quantity INTEGER NOT NULL
    CHECK (quantity > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (cart_id, book_id)
);

CREATE INDEX IF NOT EXISTS cart_items_cart_id_idx
  ON cart_items (cart_id);

-- ============================================================
-- Addresses
-- ============================================================

CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id)
    ON DELETE CASCADE,

  address_type VARCHAR(30) NOT NULL DEFAULT 'shipping'
    CHECK (address_type IN ('shipping', 'billing')),

  recipient_name VARCHAR(255) NOT NULL,
  line1 VARCHAR(255) NOT NULL,
  line2 VARCHAR(255),
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120),
  postal_code VARCHAR(30) NOT NULL,
  country_code CHAR(2) NOT NULL,

  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_addresses_user_id_idx
  ON user_addresses (user_id);

-- ============================================================
-- Orders
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_number VARCHAR(40) NOT NULL UNIQUE,

  user_id UUID NOT NULL REFERENCES users(id)
    ON DELETE RESTRICT,

  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
        'refunded'
      )
    ),

  payment_status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (
      payment_status IN (
        'pending',
        'authorized',
        'paid',
        'failed',
        'partially_refunded',
        'refunded'
      )
    ),

  fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'unfulfilled'
    CHECK (
      fulfillment_status IN (
        'unfulfilled',
        'partially_fulfilled',
        'fulfilled',
        'returned'
      )
    ),

  subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
  discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (discount_total >= 0),
  shipping_total NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (shipping_total >= 0),
  tax_total NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (tax_total >= 0),
  total NUMERIC(12, 2) NOT NULL CHECK (total >= 0),

  currency CHAR(3) NOT NULL DEFAULT 'USD',

  shipping_recipient_name VARCHAR(255) NOT NULL,
  shipping_line1 VARCHAR(255) NOT NULL,
  shipping_line2 VARCHAR(255),
  shipping_city VARCHAR(120) NOT NULL,
  shipping_state VARCHAR(120),
  shipping_postal_code VARCHAR(30) NOT NULL,
  shipping_country_code CHAR(2) NOT NULL,

  placed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx
  ON orders (user_id);

CREATE INDEX IF NOT EXISTS orders_status_idx
  ON orders (status);

CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL REFERENCES orders(id)
    ON DELETE CASCADE,

  book_id UUID REFERENCES books(id)
    ON DELETE SET NULL,

  book_title VARCHAR(500) NOT NULL,
  isbn VARCHAR(20),

  quantity INTEGER NOT NULL
    CHECK (quantity > 0),

  unit_price NUMERIC(12, 2) NOT NULL
    CHECK (unit_price >= 0),

  line_total NUMERIC(12, 2) NOT NULL
    CHECK (line_total >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON order_items (order_id);

-- ============================================================
-- Payments
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL REFERENCES orders(id)
    ON DELETE RESTRICT,

  provider VARCHAR(50) NOT NULL,
  provider_payment_id VARCHAR(255),

  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'authorized',
        'captured',
        'failed',
        'cancelled',
        'refunded'
      )
    ),

  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',

  failure_code VARCHAR(100),
  failure_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_unique_idx
  ON payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_order_id_idx
  ON payments (order_id);

-- ============================================================
-- Shipping
-- ============================================================

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL REFERENCES orders(id)
    ON DELETE CASCADE,

  carrier VARCHAR(100),
  service_level VARCHAR(100),
  tracking_number VARCHAR(255),

  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'label_created',
        'shipped',
        'in_transit',
        'delivered',
        'returned',
        'cancelled'
      )
    ),

  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS shipments_order_id_idx
  ON shipments (order_id);

CREATE INDEX IF NOT EXISTS shipments_tracking_number_idx
  ON shipments (tracking_number);

-- ============================================================
-- Reviews
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  book_id UUID NOT NULL REFERENCES books(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL REFERENCES users(id)
    ON DELETE CASCADE,

  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(255),
  body TEXT,

  is_approved BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (book_id, user_id)
);

CREATE INDEX IF NOT EXISTS reviews_book_id_idx
  ON reviews (book_id);

CREATE INDEX IF NOT EXISTS reviews_approved_idx
  ON reviews (is_approved);

-- ============================================================
-- Wishlists
-- ============================================================

CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id)
    ON DELETE CASCADE,

  name VARCHAR(150) NOT NULL DEFAULT 'Default',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  wishlist_id UUID NOT NULL REFERENCES wishlists(id)
    ON DELETE CASCADE,

  book_id UUID NOT NULL REFERENCES books(id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (wishlist_id, book_id)
);

CREATE INDEX IF NOT EXISTS wishlist_items_book_id_idx
  ON wishlist_items (book_id);

-- ============================================================
-- Coupons
-- ============================================================

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  code VARCHAR(100) NOT NULL UNIQUE,

  discount_type VARCHAR(30) NOT NULL
    CHECK (discount_type IN ('percentage', 'fixed')),

  discount_value NUMERIC(12, 2) NOT NULL
    CHECK (discount_value > 0),

  minimum_order_total NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (minimum_order_total >= 0),

  maximum_discount NUMERIC(12, 2)
    CHECK (maximum_discount IS NULL OR maximum_discount > 0),

  usage_limit INTEGER
    CHECK (usage_limit IS NULL OR usage_limit > 0),

  usage_count INTEGER NOT NULL DEFAULT 0
    CHECK (usage_count >= 0),

  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    expires_at IS NULL
    OR starts_at IS NULL
    OR expires_at > starts_at
  ),

  CHECK (
    discount_type <> 'percentage'
    OR discount_value <= 100
  )
);

CREATE INDEX IF NOT EXISTS coupons_active_period_idx
  ON coupons (is_active, starts_at, expires_at);

CREATE TABLE IF NOT EXISTS order_coupons (
  order_id UUID NOT NULL REFERENCES orders(id)
    ON DELETE CASCADE,

  coupon_id UUID NOT NULL REFERENCES coupons(id)
    ON DELETE RESTRICT,

  discount_amount NUMERIC(12, 2) NOT NULL
    CHECK (discount_amount >= 0),

  PRIMARY KEY (order_id, coupon_id)
);

-- ============================================================
-- Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id)
    ON DELETE CASCADE,

  notification_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON notifications (user_id);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications (user_id, is_read)
  WHERE is_read = FALSE;

-- ============================================================
-- Updated-at triggers
-- ============================================================

DROP TRIGGER IF EXISTS users_set_updated_at ON users;

CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS publishers_set_updated_at ON publishers;

CREATE TRIGGER publishers_set_updated_at
BEFORE UPDATE ON publishers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS authors_set_updated_at ON authors;

CREATE TRIGGER authors_set_updated_at
BEFORE UPDATE ON authors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS categories_set_updated_at ON categories;

CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS books_set_updated_at ON books;

CREATE TRIGGER books_set_updated_at
BEFORE UPDATE ON books
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS inventory_set_updated_at ON inventory;

CREATE TRIGGER inventory_set_updated_at
BEFORE UPDATE ON inventory
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS carts_set_updated_at ON carts;

CREATE TRIGGER carts_set_updated_at
BEFORE UPDATE ON carts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS cart_items_set_updated_at ON cart_items;

CREATE TRIGGER cart_items_set_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS user_addresses_set_updated_at ON user_addresses;

CREATE TRIGGER user_addresses_set_updated_at
BEFORE UPDATE ON user_addresses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS payments_set_updated_at ON payments;

CREATE TRIGGER payments_set_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS shipments_set_updated_at ON shipments;

CREATE TRIGGER shipments_set_updated_at
BEFORE UPDATE ON shipments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reviews_set_updated_at ON reviews;

CREATE TRIGGER reviews_set_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS wishlists_set_updated_at ON wishlists;

CREATE TRIGGER wishlists_set_updated_at
BEFORE UPDATE ON wishlists
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS coupons_set_updated_at ON coupons;

CREATE TRIGGER coupons_set_updated_at
BEFORE UPDATE ON coupons
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
