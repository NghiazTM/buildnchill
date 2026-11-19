-- =====================================================================
-- BuildnChill — Thời gian chơi, bảng xếp hạng, biểu đồ online, hồ sơ người chơi
-- Chạy trong Supabase SQL Editor (chạy lại nhiều lần không sao).
-- Yêu cầu: đã chạy ONLINE_PLAYERS_MIGRATION.sql.
--
-- Cách tính: mỗi nhịp tim (~10 giây) cộng khoảng thời gian kể từ nhịp trước
-- cho từng người đang online. Mất nhịp > 120 giây (server tắt) thì không cộng.
-- Ngày tính theo giờ Việt Nam.
-- =====================================================================

-- ---------- Bảng ----------
CREATE TABLE IF NOT EXISTS public.player_stats (
  name_key TEXT PRIMARY KEY,                 -- lower(tên)
  mc_username TEXT NOT NULL,                 -- tên hiển thị (viết hoa đúng như trong game)
  total_seconds BIGINT NOT NULL DEFAULT 0,
  sessions INT NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.player_daily (
  day DATE NOT NULL,
  name_key TEXT NOT NULL,
  seconds INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, name_key)
);
CREATE INDEX IF NOT EXISTS player_daily_name_idx ON public.player_daily (name_key, day);

-- Số người online theo từng mốc 10 phút (lấy giá trị cao nhất trong mốc)
CREATE TABLE IF NOT EXISTS public.online_samples (
  ts TIMESTAMPTZ PRIMARY KEY,
  players INT NOT NULL DEFAULT 0
);

-- Trạng thái nội bộ (không bật realtime để tránh spam)
CREATE TABLE IF NOT EXISTS public.server_tick (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_tick TIMESTAMPTZ
);
INSERT INTO public.server_tick (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Chỉ đọc qua các hàm bên dưới
ALTER TABLE public.player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_tick ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_stats, public.player_daily, public.online_samples, public.server_tick FROM anon, authenticated;

-- ---------- Ghi nhận mỗi nhịp tim ----------
CREATE OR REPLACE FUNCTION public.bnc_track_playtime(p_names TEXT[], p_players INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_last TIMESTAMPTZ;
  v_gap NUMERIC;
  v_add INT := 0;
  v_day DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_bucket TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM now()) / 600) * 600);
BEGIN
  SELECT last_tick INTO v_last FROM public.server_tick WHERE id = 1 FOR UPDATE;
  IF v_last IS NOT NULL THEN
    v_gap := extract(epoch FROM v_now - v_last);
    IF v_gap > 0 AND v_gap <= 120 THEN v_add := round(v_gap)::int; END IF;
  END IF;
  UPDATE public.server_tick SET last_tick = v_now WHERE id = 1;

  INSERT INTO public.online_samples (ts, players)
  VALUES (v_bucket, greatest(coalesce(p_players, 0), 0))
  ON CONFLICT (ts) DO UPDATE SET players = greatest(public.online_samples.players, EXCLUDED.players);

  IF coalesce(array_length(p_names, 1), 0) > 0 THEN
    INSERT INTO public.player_stats AS ps (name_key, mc_username, total_seconds, sessions, first_seen, last_seen)
    SELECT lower(n), n, v_add, 1, v_now, v_now FROM unnest(p_names) AS n
    ON CONFLICT (name_key) DO UPDATE
      SET mc_username = EXCLUDED.mc_username,
          total_seconds = ps.total_seconds + v_add,
          sessions = ps.sessions + CASE WHEN ps.last_seen < v_now - interval '3 minutes' THEN 1 ELSE 0 END,
          last_seen = v_now;

    IF v_add > 0 THEN
      INSERT INTO public.player_daily AS pd (day, name_key, seconds)
      SELECT v_day, lower(n), v_add FROM unnest(p_names) AS n
      ON CONFLICT (day, name_key) DO UPDATE SET seconds = pd.seconds + EXCLUDED.seconds;
    END IF;
  END IF;

  -- Dọn mẫu biểu đồ cũ mỗi giờ một lần
  IF v_last IS NULL OR date_trunc('hour', v_last) <> date_trunc('hour', v_now) THEN
    DELETE FROM public.online_samples WHERE ts < v_now - interval '120 days';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_track_playtime(TEXT[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_track_playtime(TEXT[], INT) TO service_role;

-- Nhịp tim (bản 4 tham số) — giống ONLINE_PLAYERS_MIGRATION.sql + ghi thời gian chơi
CREATE OR REPLACE FUNCTION public.bnc_server_heartbeat(p_players INT, p_max INT, p_version TEXT, p_names TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_names TEXT[];
BEGIN
  SELECT coalesce(array_agg(n ORDER BY lower(n)), '{}')
    INTO v_names
    FROM (
      SELECT DISTINCT left(trim(x), 32) AS n
        FROM unnest(coalesce(p_names, '{}')) AS x
       WHERE trim(x) ~ '^[.*]?[A-Za-z0-9_]{1,16}$'
       LIMIT 300
    ) s;

  PERFORM public.bnc_track_playtime(v_names, greatest(coalesce(p_players, 0), coalesce(array_length(v_names, 1), 0)));

  UPDATE public.server_status
     SET status = 'Online',
         players = greatest(coalesce(p_players, 0), 0)::text,
         max_players = coalesce(p_max::text, max_players),
         version = coalesce(nullif(trim(p_version), ''), version),
         online_players = v_names,
         last_seen = now(),
         updated_at = now()
   WHERE id = 1
     AND (
       last_seen IS NULL
       OR last_seen < now() - interval '50 seconds'
       OR status IS DISTINCT FROM 'Online'
       OR players IS DISTINCT FROM greatest(coalesce(p_players, 0), 0)::text
       OR online_players IS DISTINCT FROM v_names
       OR (p_max IS NOT NULL AND max_players IS DISTINCT FROM p_max::text)
       OR (nullif(trim(p_version), '') IS NOT NULL AND version IS DISTINCT FROM trim(p_version))
     );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_server_heartbeat(INT, INT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_server_heartbeat(INT, INT, TEXT, TEXT[]) TO service_role;

-- ---------- Đọc công khai ----------
-- p_period: 'day' | 'week' | 'month' | 'all'
CREATE OR REPLACE FUNCTION public.bnc_playtime_top(p_period TEXT DEFAULT 'week', p_limit INT DEFAULT 50)
RETURNS TABLE (mc_username TEXT, seconds BIGINT, last_seen TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d),
  agg AS (
    SELECT pd.name_key, sum(pd.seconds)::bigint AS secs
      FROM public.player_daily pd, today
     WHERE p_period <> 'all'
       AND pd.day >= CASE p_period
                       WHEN 'day' THEN today.d
                       WHEN 'week' THEN date_trunc('week', today.d)::date
                       WHEN 'month' THEN date_trunc('month', today.d)::date
                       ELSE today.d END
     GROUP BY pd.name_key
    UNION ALL
    SELECT name_key, total_seconds FROM public.player_stats WHERE p_period = 'all'
  )
  SELECT ps.mc_username, agg.secs, ps.last_seen
    FROM agg JOIN public.player_stats ps USING (name_key)
   WHERE agg.secs > 0
   ORDER BY agg.secs DESC, ps.mc_username
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- Số người online theo thời gian (mốc 10 phút; gộp theo giờ khi xem > 2 ngày)
CREATE OR REPLACE FUNCTION public.bnc_online_history(p_hours INT DEFAULT 24)
RETURNS TABLE (ts TIMESTAMPTZ, players INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN p_hours > 48 THEN date_trunc('hour', s.ts) ELSE s.ts END AS ts,
         max(s.players)::int AS players
    FROM public.online_samples s
   WHERE s.ts >= now() - make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 24 * 31))
   GROUP BY 1
   ORDER BY 1;
$$;

-- Giờ cao điểm: trung bình số người online theo từng giờ trong ngày (giờ VN)
CREATE OR REPLACE FUNCTION public.bnc_online_by_hour(p_days INT DEFAULT 14)
RETURNS TABLE (hour INT, avg_players NUMERIC, max_players INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT extract(hour FROM s.ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS hour,
         round(avg(s.players), 1) AS avg_players,
         max(s.players)::int AS max_players
    FROM public.online_samples s
   WHERE s.ts >= now() - make_interval(days => least(greatest(coalesce(p_days, 14), 1), 90))
   GROUP BY 1
   ORDER BY 1;
$$;

-- Hồ sơ công khai một người chơi
CREATE OR REPLACE FUNCTION public.bnc_player_profile(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := lower(trim(coalesce(p_name, '')));
  v_ps public.player_stats;
  v_today DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_result JSONB;
BEGIN
  SELECT * INTO v_ps FROM public.player_stats WHERE name_key = v_key;

  SELECT jsonb_build_object(
    'mc_username', coalesce(v_ps.mc_username, (SELECT o.mc_username FROM public.orders o WHERE lower(o.mc_username) = v_key ORDER BY o.created_at DESC LIMIT 1)),
    'tracked', v_ps.name_key IS NOT NULL,
    'first_seen', v_ps.first_seen,
    'last_seen', v_ps.last_seen,
    'sessions', coalesce(v_ps.sessions, 0),
    'total_seconds', coalesce(v_ps.total_seconds, 0),
    'today_seconds', coalesce((SELECT sum(seconds) FROM public.player_daily WHERE name_key = v_key AND day = v_today), 0),
    'week_seconds', coalesce((SELECT sum(seconds) FROM public.player_daily WHERE name_key = v_key AND day >= date_trunc('week', v_today)::date), 0),
    'month_seconds', coalesce((SELECT sum(seconds) FROM public.player_daily WHERE name_key = v_key AND day >= date_trunc('month', v_today)::date), 0),
    'rank_all', CASE WHEN v_ps.name_key IS NULL THEN NULL
                     ELSE (SELECT count(*) + 1 FROM public.player_stats x WHERE x.total_seconds > v_ps.total_seconds) END,
    'players_tracked', (SELECT count(*) FROM public.player_stats),
    'rank_week', (SELECT r FROM (
                    SELECT name_key, rank() OVER (ORDER BY sum(seconds) DESC) AS r
                      FROM public.player_daily WHERE day >= date_trunc('week', v_today)::date
                     GROUP BY name_key) t WHERE t.name_key = v_key),
    'donate_rank', (SELECT r FROM (
                    SELECT lower(mc_username) AS k, rank() OVER (ORDER BY sum(round(price)) DESC) AS r
                      FROM public.orders
                     WHERE status IN ('paid', 'delivered') AND coalesce(is_deleted, false) = false
                     GROUP BY lower(mc_username)) t WHERE t.k = v_key),
    'purchases', (SELECT count(*) FROM public.orders
                   WHERE lower(mc_username) = v_key AND status IN ('paid', 'delivered') AND coalesce(is_deleted, false) = false),
    'recent_purchases', coalesce((SELECT jsonb_agg(jsonb_build_object('product', product, 'at', at) ORDER BY at DESC) FROM (
                    SELECT product, coalesce(paid_at, created_at) AS at FROM public.orders
                     WHERE lower(mc_username) = v_key AND status IN ('paid', 'delivered') AND coalesce(is_deleted, false) = false
                     ORDER BY coalesce(paid_at, created_at) DESC LIMIT 5) r), '[]'::jsonb),
    'daily', coalesce((SELECT jsonb_agg(jsonb_build_object('day', d::date, 'seconds', coalesce(pd.seconds, 0)) ORDER BY d) FROM
                    generate_series(v_today - 13, v_today, interval '1 day') AS d
                    LEFT JOIN public.player_daily pd ON pd.day = d::date AND pd.name_key = v_key), '[]'::jsonb)
  ) INTO v_result;

  IF v_result->>'mc_username' IS NULL THEN RETURN NULL; END IF;
  RETURN v_result;
END;
$$;

-- Tìm nhanh tên người chơi (gợi ý khi gõ)
CREATE OR REPLACE FUNCTION public.bnc_player_search(p_query TEXT, p_limit INT DEFAULT 8)
RETURNS TABLE (mc_username TEXT, last_seen TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mc_username, last_seen FROM public.player_stats
   WHERE length(trim(coalesce(p_query, ''))) >= 2
     AND name_key LIKE replace(replace(lower(trim(p_query)), '%', ''), '_', '\_') || '%'
   ORDER BY total_seconds DESC
   LIMIT least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.bnc_playtime_top(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_online_history(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_online_by_hour(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_player_profile(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_player_search(TEXT, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
SELECT 'PLAYTIME MIGRATION OK' AS status;
