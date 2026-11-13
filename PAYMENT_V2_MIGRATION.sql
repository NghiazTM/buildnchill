-- =====================================================================
-- BUILDNCHILL - PAYMENT & DELIVERY MODULE V2
-- ---------------------------------------------------------------------
-- Chạy TOÀN BỘ file này 1 lần trong Supabase > SQL Editor
-- TRƯỚC KHI deploy bản web mới. Có thể chạy lại nhiều lần (idempotent).
--
-- Thay đổi chính:
--   1. Khoá bảo mật: client (anon/authenticated) KHÔNG còn được tự tạo/sửa
--      đơn hàng, sản phẩm, lệnh giao hàng, số dư ví. Mọi thao tác tiền/hàng
--      đi qua Netlify Functions (service role).
--   2. Hàng đợi giao vật phẩm mới: bảng `deliveries` (plugin v2 đọc qua
--      /api/plugin-bridge với PLUGIN_SECRET, không dùng anon key nữa).
--   3. Đối soát giao dịch SePay chống trùng: bảng `payment_transactions`.
--   4. Đơn hàng có mã thanh toán riêng (BNCxxxxxx), kiểm tra số tiền,
--      hỗ trợ thanh toán thiếu (cộng dồn), hết hạn, huỷ, giao lại.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Helpers phân quyền
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.bnc_is_trusted()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- service_role (Netlify Functions), admin đăng nhập, hoặc chạy tay trong SQL Editor
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR public.is_admin()
      OR session_user IN ('postgres', 'supabase_admin');
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Bảng orders/products: thêm cột cho module v2
-- ---------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid BIGINT DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discord_message_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS sepay_transaction_id TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_code ON public.orders(payment_code) WHERE payment_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders(status, created_at DESC);

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'paid', 'delivered', 'cancelled', 'expired', 'underpaid', 'failed'));

-- Trigger cũ tự đẩy lệnh vào pending_commands khi status -> paid: BỎ (v2 dùng deliveries)
DROP TRIGGER IF EXISTS on_order_paid_automation ON public.orders;

-- ---------------------------------------------------------------------
-- 2. Hàng đợi giao vật phẩm
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  mc_username TEXT NOT NULL,
  product_name TEXT,
  commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'delivered', 'failed', 'cancelled')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  claimed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_queue ON public.deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_player ON public.deliveries(lower(mc_username));
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.deliveries(order_id);

-- ---------------------------------------------------------------------
-- 3. Nhật ký giao dịch ngân hàng (chống xử lý trùng webhook)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'sepay',
  provider_txn_id TEXT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  content TEXT,
  match_type TEXT,          -- order | recharge | none
  match_ref TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_txn_id)
);

-- Cột bổ sung cho recharges
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS sepay_transaction_id TEXT;
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS discord_message_id TEXT;
ALTER TABLE public.recharges ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Chuyển các lệnh cũ còn treo trong pending_commands sang hàng đợi mới
DO $$
BEGIN
  IF to_regclass('public.pending_commands') IS NOT NULL THEN
    INSERT INTO public.deliveries (mc_username, product_name, commands, status, created_at)
    SELECT mc_username, 'Lệnh cũ (migrated)', jsonb_build_array(command), 'queued', created_at
    FROM public.pending_commands
    WHERE status = 'pending' AND command NOT ILIKE 'tellraw %';
    UPDATE public.pending_commands SET status = 'completed' WHERE status = 'pending';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 4. RLS: xoá toàn bộ policy cũ (nhiều policy "public insert/update" nguy hiểm)
--    và tạo lại policy chặt chẽ cho các bảng liên quan tiền & hàng
-- ---------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('categories', 'products', 'orders', 'pending_commands', 'wallets',
                        'wallet_transactions', 'recharges', 'deliveries', 'payment_transactions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF to_regclass('public.pending_commands') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.pending_commands ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "bnc admin pending_commands" ON public.pending_commands FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
  END IF;
END $$;

-- Danh mục & sản phẩm: ai cũng xem được, chỉ admin sửa
CREATE POLICY "bnc read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "bnc admin categories" ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bnc read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "bnc admin products" ON public.products FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Đơn hàng: người dùng xem đơn của mình, admin toàn quyền. Tạo đơn chỉ qua server.
CREATE POLICY "bnc own orders" ON public.orders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bnc admin orders" ON public.orders FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Ví: chỉ xem của mình, admin toàn quyền (cộng/trừ tiền qua function có kiểm tra quyền)
CREATE POLICY "bnc own wallet" ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bnc admin wallets" ON public.wallets FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "bnc own wallet tx" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = wallet_id AND w.user_id = auth.uid()));
CREATE POLICY "bnc admin wallet tx" ON public.wallet_transactions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Nạp tiền: xem của mình, tạo yêu cầu (chỉ trạng thái pending), admin toàn quyền
CREATE POLICY "bnc own recharges" ON public.recharges FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "bnc create recharge" ON public.recharges FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "bnc admin recharges" ON public.recharges FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Hàng đợi giao & giao dịch ngân hàng: chỉ admin xem (server dùng service role)
CREATE POLICY "bnc admin deliveries" ON public.deliveries FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "bnc admin payment tx" ON public.payment_transactions FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. Chặn người dùng tự nâng quyền admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bnc_guard_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.bnc_is_trusted() THEN
    RAISE EXCEPTION 'Không có quyền thay đổi role';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bnc_guard_profile_role ON public.profiles;
CREATE TRIGGER bnc_guard_profile_role BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.bnc_guard_profile_role();

-- ---------------------------------------------------------------------
-- 6. Các hàm tiền tệ cũ: thêm kiểm tra quyền
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id UUID, p_amount BIGINT, p_type TEXT, p_note TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_old BIGINT;
  v_new BIGINT;
BEGIN
  IF NOT public.bnc_is_trusted() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT id, balance INTO v_wallet_id, v_old FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, balance) VALUES (p_user_id, 0) RETURNING id, balance INTO v_wallet_id, v_old;
  END IF;

  v_new := v_old + p_amount;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE id = v_wallet_id;
  INSERT INTO public.wallet_transactions (wallet_id, amount, balance_before, balance_after, type, note)
  VALUES (v_wallet_id, p_amount, v_old, v_new, p_type, p_note);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_recharge(p_recharge_id UUID, p_admin_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_amount BIGINT;
  v_status TEXT;
BEGIN
  IF NOT public.bnc_is_trusted() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT user_id, amount, status INTO v_user_id, v_amount, v_status
  FROM public.recharges WHERE id = p_recharge_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Recharge is not pending';
  END IF;

  UPDATE public.recharges
  SET status = 'approved', admin_id = coalesce(auth.uid(), p_admin_id), updated_at = now()
  WHERE id = p_recharge_id;

  PERFORM public.admin_adjust_balance(v_user_id, v_amount, 'recharge', 'Approved recharge: ' || p_recharge_id);
END;
$$;

-- Các RPC cũ cho phép client tự mua/tự xác nhận thanh toán: thu hồi quyền
DO $$
BEGIN
  IF to_regprocedure('public.process_wallet_purchase(uuid,uuid,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.process_wallet_purchase(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.process_sepay_webhook(text,bigint,text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.process_sepay_webhook(text, bigint, text) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7. Module v2: các hàm nghiệp vụ (chỉ service_role gọi)
-- ---------------------------------------------------------------------

-- Tách lệnh nhiều dòng + thay placeholder
CREATE OR REPLACE FUNCTION public.bnc_build_commands(p_command TEXT, p_username TEXT)
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(jsonb_agg(regexp_replace(btrim(line), '^/', '')), '[]'::jsonb)
  FROM regexp_split_to_table(
         replace(replace(replace(coalesce(p_command, ''), '{username}', p_username), '{user_name}', p_username), '{player}', p_username),
         E'\\r?\\n') AS line
  WHERE btrim(line) <> '';
$$;

-- Xác nhận thanh toán đơn (cộng dồn nếu chuyển thiếu) và đưa vào hàng đợi giao
CREATE OR REPLACE FUNCTION public.bnc_mark_order_paid(
  p_order_id UUID, p_amount BIGINT, p_txn TEXT, p_force BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  v_total BIGINT;
  v_price BIGINT;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF o.status NOT IN ('pending', 'expired', 'underpaid') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_' || o.status, 'order_id', o.id);
  END IF;

  v_price := round(o.price)::BIGINT;
  v_total := coalesce(o.amount_paid, 0) + coalesce(p_amount, 0);
  IF p_force THEN
    v_total := greatest(v_total, v_price);
  END IF;

  IF v_total < v_price THEN
    UPDATE public.orders
    SET status = 'underpaid', amount_paid = v_total, sepay_transaction_id = p_txn, updated_at = now()
    WHERE id = o.id;
    RETURN jsonb_build_object('success', false, 'reason', 'underpaid', 'order_id', o.id,
      'paid', v_total, 'price', v_price, 'mc_username', o.mc_username, 'product', o.product,
      'user_id', o.user_id, 'payment_code', o.payment_code);
  END IF;

  UPDATE public.orders
  SET status = 'paid', amount_paid = v_total, paid_at = now(),
      sepay_transaction_id = coalesce(p_txn, sepay_transaction_id), updated_at = now()
  WHERE id = o.id;

  INSERT INTO public.deliveries (order_id, mc_username, product_name, commands)
  VALUES (o.id, o.mc_username, o.product, public.bnc_build_commands(o.command, o.mc_username));

  RETURN jsonb_build_object('success', true, 'order_id', o.id, 'mc_username', o.mc_username,
    'product', o.product, 'price', v_price, 'paid', v_total, 'overpaid', v_total - v_price,
    'user_id', o.user_id, 'payment_code', o.payment_code, 'payment_method', o.payment_method);
END;
$$;

-- Mua bằng ví (trừ tiền + tạo đơn + đưa vào hàng đợi giao, tất cả trong 1 giao dịch)
CREATE OR REPLACE FUNCTION public.bnc_wallet_purchase(
  p_user_id UUID, p_product_id UUID, p_mc_username TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.products%ROWTYPE;
  v_wallet_id UUID;
  v_balance BIGINT;
  v_price BIGINT;
  v_order_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO p FROM public.products
  WHERE id = p_product_id AND active = true AND coalesce(is_deleted, false) = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'product_not_found');
  END IF;
  v_price := round(p.price)::BIGINT;

  SELECT id, balance INTO v_wallet_id, v_balance FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wallet_not_found');
  END IF;
  IF v_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'reason', 'insufficient_balance',
      'balance', v_balance, 'price', v_price);
  END IF;

  UPDATE public.wallets SET balance = v_balance - v_price, updated_at = now() WHERE id = v_wallet_id;
  INSERT INTO public.wallet_transactions (wallet_id, amount, balance_before, balance_after, type, note)
  VALUES (v_wallet_id, -v_price, v_balance, v_balance - v_price, 'purchase',
          'Mua ' || p.name || ' cho ' || p_mc_username);

  INSERT INTO public.orders (id, user_id, mc_username, product, product_id, category_id, command,
                             price, amount_paid, status, delivered, payment_method, paid_at, notes)
  VALUES (v_order_id, p_user_id, p_mc_username, p.name, p.id, p.category_id, p.command,
          v_price, v_price, 'paid', false, 'wallet', now(), 'Thanh toán bằng ví');

  INSERT INTO public.deliveries (order_id, mc_username, product_name, commands)
  VALUES (v_order_id, p_mc_username, p.name, public.bnc_build_commands(p.command, p_mc_username));

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id, 'product', p.name,
    'price', v_price, 'new_balance', v_balance - v_price, 'mc_username', p_mc_username);
END;
$$;

-- Nạp ví tự động từ SePay (nội dung: NAP <username>)
CREATE OR REPLACE FUNCTION public.bnc_credit_recharge(p_token TEXT, p_amount BIGINT, p_txn TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_username TEXT;
  v_balance BIGINT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_amount');
  END IF;

  IF EXISTS (SELECT 1 FROM public.recharges WHERE sepay_transaction_id = p_txn) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate');
  END IF;

  -- Ưu tiên khớp chính xác (không phân biệt hoa thường), sau đó khớp khi ngân hàng bỏ dấu "_"
  SELECT id, username INTO v_user_id, v_username FROM public.profiles
  WHERE lower(username) = lower(p_token)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    SELECT id, username INTO v_user_id, v_username FROM public.profiles
    WHERE lower(replace(username, '_', '')) = lower(replace(p_token, '_', ''))
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'user_not_found', 'token', p_token);
  END IF;

  INSERT INTO public.recharges (user_id, amount, payment_method, status, sepay_transaction_id)
  VALUES (v_user_id, p_amount, 'SePay Auto', 'approved', p_txn);

  PERFORM public.admin_adjust_balance(v_user_id, p_amount, 'recharge', 'Nạp tự động SePay #' || p_txn);

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_user_id;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'username', v_username,
    'amount', p_amount, 'new_balance', v_balance);
END;
$$;

-- Plugin lấy các đơn cần giao cho người chơi đang online (khoá dòng, không trùng)
CREATE OR REPLACE FUNCTION public.bnc_claim_deliveries(p_names TEXT[], p_limit INT DEFAULT 25)
RETURNS SETOF public.deliveries
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Trả lại hàng đợi những đơn bị "giữ" quá 3 phút mà plugin chưa báo kết quả
  UPDATE public.deliveries SET status = 'queued'
  WHERE status = 'processing' AND claimed_at < now() - interval '3 minutes';

  RETURN QUERY
  WITH picked AS (
    SELECT q.id FROM public.deliveries q
    WHERE q.status = 'queued'
      AND lower(q.mc_username) = ANY (SELECT lower(n) FROM unnest(p_names) AS n)
    ORDER BY q.created_at
    LIMIT greatest(1, least(p_limit, 50))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.deliveries d
    SET status = 'processing', claimed_at = now(), attempts = d.attempts + 1
    FROM picked
    WHERE d.id = picked.id
    RETURNING d.*
  )
  SELECT * FROM claimed;
END;
$$;

-- Plugin báo kết quả giao
CREATE OR REPLACE FUNCTION public.bnc_complete_delivery(p_id UUID, p_success BOOLEAN, p_message TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.deliveries%ROWTYPE;
  o public.orders%ROWTYPE;
  v_remaining INT;
BEGIN
  SELECT * INTO d FROM public.deliveries WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  IF d.status = 'delivered' THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  IF p_success THEN
    UPDATE public.deliveries SET status = 'delivered', delivered_at = now(), last_error = NULL WHERE id = d.id;

    IF d.order_id IS NOT NULL THEN
      SELECT count(*) INTO v_remaining FROM public.deliveries
      WHERE order_id = d.order_id AND status NOT IN ('delivered', 'cancelled');
      IF v_remaining = 0 THEN
        UPDATE public.orders SET status = 'delivered', delivered = true, delivered_at = now(), updated_at = now()
        WHERE id = d.order_id AND status IN ('paid', 'failed', 'delivered')
        RETURNING * INTO o;
      END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'event', 'delivered', 'delivery_id', d.id,
      'order_id', d.order_id, 'mc_username', d.mc_username, 'product', d.product_name,
      'order_done', o.id IS NOT NULL, 'price', o.price, 'payment_method', o.payment_method,
      'payment_code', o.payment_code, 'discord_message_id', o.discord_message_id);
  ELSE
    IF d.attempts >= 3 THEN
      UPDATE public.deliveries SET status = 'failed', last_error = p_message WHERE id = d.id;
      IF d.order_id IS NOT NULL THEN
        UPDATE public.orders SET status = 'failed', updated_at = now() WHERE id = d.order_id AND status = 'paid';
      END IF;
      RETURN jsonb_build_object('success', true, 'event', 'failed', 'delivery_id', d.id,
        'order_id', d.order_id, 'mc_username', d.mc_username, 'product', d.product_name, 'error', p_message);
    ELSE
      UPDATE public.deliveries SET status = 'queued', last_error = p_message WHERE id = d.id;
      RETURN jsonb_build_object('success', true, 'event', 'retry', 'delivery_id', d.id);
    END IF;
  END IF;
END;
$$;

-- Admin: giao lại một đơn (tạo lượt giao mới)
CREATE OR REPLACE FUNCTION public.bnc_redeliver_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;
  IF o.status NOT IN ('paid', 'delivered', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_paid');
  END IF;

  UPDATE public.deliveries SET status = 'cancelled' WHERE order_id = o.id AND status IN ('queued', 'processing', 'failed');
  INSERT INTO public.deliveries (order_id, mc_username, product_name, commands)
  VALUES (o.id, o.mc_username, o.product, public.bnc_build_commands(o.command, o.mc_username));
  UPDATE public.orders SET status = 'paid', delivered = false, updated_at = now() WHERE id = o.id;

  RETURN jsonb_build_object('success', true, 'order_id', o.id);
END;
$$;

-- Công khai: Top ủng hộ & giao dịch gần đây (không lộ lệnh/console)
CREATE OR REPLACE FUNCTION public.bnc_top_donators(p_limit INT DEFAULT 5)
RETURNS TABLE (name TEXT, total BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mc_username AS name, sum(round(price))::BIGINT AS total
  FROM public.orders
  WHERE status IN ('paid', 'delivered') AND coalesce(is_deleted, false) = false
  GROUP BY mc_username
  ORDER BY total DESC
  LIMIT least(greatest(p_limit, 1), 20);
$$;

CREATE OR REPLACE FUNCTION public.bnc_recent_purchases(p_limit INT DEFAULT 8)
RETURNS TABLE (mc_username TEXT, product TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mc_username, product, coalesce(paid_at, created_at)
  FROM public.orders
  WHERE status IN ('paid', 'delivered') AND coalesce(is_deleted, false) = false
  ORDER BY coalesce(paid_at, created_at) DESC
  LIMIT least(greatest(p_limit, 1), 20);
$$;

-- Quyền thực thi
REVOKE EXECUTE ON FUNCTION public.bnc_mark_order_paid(UUID, BIGINT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bnc_wallet_purchase(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bnc_credit_recharge(TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bnc_claim_deliveries(TEXT[], INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bnc_complete_delivery(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bnc_redeliver_order(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_mark_order_paid(UUID, BIGINT, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.bnc_wallet_purchase(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bnc_credit_recharge(TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bnc_claim_deliveries(TEXT[], INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bnc_complete_delivery(UUID, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bnc_redeliver_order(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.bnc_top_donators(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_recent_purchases(INT) TO anon, authenticated;

-- Realtime cho đơn hàng & ví (bỏ qua lỗi nếu đã có)
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- Bảng ảnh carousel trang chủ (production đang thiếu -> lỗi PGRST205)
CREATE TABLE IF NOT EXISTS public.carousel_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE public.carousel_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can see active carousel images" ON public.carousel_images;
DROP POLICY IF EXISTS "Admin can manage all carousel images" ON public.carousel_images;
DROP POLICY IF EXISTS "bnc carousel public read" ON public.carousel_images;
DROP POLICY IF EXISTS "bnc carousel admin write" ON public.carousel_images;
CREATE POLICY "bnc carousel public read" ON public.carousel_images FOR SELECT USING (is_active = true OR public.is_admin());
CREATE POLICY "bnc carousel admin write" ON public.carousel_images FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.carousel_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.carousel_images TO authenticated;
NOTIFY pgrst, 'reload schema';

SELECT 'PAYMENT V2 MIGRATION OK' AS status;
