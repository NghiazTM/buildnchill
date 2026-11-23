-- =====================================================================
-- BuildnChill — Cộng đồng: dòng hoạt động, mùa giải, thống kê server,
-- thành tựu hiếm, lịch hoạt động, sự kiện, công trình, clan, bản đồ, bình chọn.
-- Chạy trong Supabase SQL Editor (chạy lại nhiều lần không sao).
-- Yêu cầu: đã chạy PLAYTIME_MIGRATION.sql và GAME_STATS_MIGRATION.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Cấu hình công khai (bản đồ, trang bình chọn) — admin sửa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bnc_config (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z_]{2,32}$'),
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bnc_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bnc_config_read ON public.bnc_config;
CREATE POLICY bnc_config_read ON public.bnc_config FOR SELECT USING (true);
DROP POLICY IF EXISTS bnc_config_admin ON public.bnc_config;
CREATE POLICY bnc_config_admin ON public.bnc_config FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.bnc_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bnc_config TO authenticated;

-- ---------------------------------------------------------------------
-- 1. Dòng hoạt động (vào game, thành tựu, danh hiệu, lên top 1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  name_key TEXT NOT NULL,
  mc_username TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- first_join | join | advancement | milestone | top1
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  notified BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS activity_events_ts_idx ON public.activity_events (ts DESC);
CREATE INDEX IF NOT EXISTS activity_events_kind_idx ON public.activity_events (kind, ts DESC);
-- Chống trùng: mỗi thành tựu / mỗi bậc danh hiệu chỉ báo 1 lần
CREATE UNIQUE INDEX IF NOT EXISTS activity_events_adv_uq ON public.activity_events (name_key, (data->>'key')) WHERE kind = 'advancement';
CREATE UNIQUE INDEX IF NOT EXISTS activity_events_ms_uq ON public.activity_events (name_key, (data->>'id'), (data->>'level')) WHERE kind = 'milestone';
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.activity_events FROM anon, authenticated;

-- Bậc danh hiệu: -1 (chưa đạt) .. 4 (Netherite). Mốc phải khớp src/lib/gameStats.js
CREATE OR REPLACE FUNCTION public.bnc_tier(v NUMERIC, steps NUMERIC[])
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce((SELECT max(i) FROM generate_subscripts(steps, 1) AS i WHERE v >= steps[i]), 0) - 1;
$$;

CREATE OR REPLACE FUNCTION public.bnc_game_stats_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  o INT;
  n INT;
  v_tiers TEXT[] := ARRAY['Đồng', 'Bạc', 'Vàng', 'Kim cương', 'Netherite'];
  v_beaten TEXT;
  v_top BOOLEAN;
BEGIN
  -- Chỉ xét số liệu trực tiếp (đang online), bỏ qua lần nhập lịch sử
  IF NEW.live_at IS NOT DISTINCT FROM OLD.live_at THEN RETURN NEW; END IF;

  FOR m IN SELECT * FROM (VALUES
      ('play',    'Cày cuốc',      OLD.play_seconds / 3600.0,   NEW.play_seconds / 3600.0,   ARRAY[10, 50, 100, 250, 500]::numeric[]),
      ('mine',    'Thợ mỏ',        OLD.blocks_mined::numeric,   NEW.blocks_mined::numeric,   ARRAY[1000, 10000, 50000, 100000, 500000]::numeric[]),
      ('hunt',    'Thợ săn',       OLD.mob_kills::numeric,      NEW.mob_kills::numeric,      ARRAY[100, 1000, 5000, 10000, 50000]::numeric[]),
      ('pvp',     'Chiến binh',    OLD.player_kills::numeric,   NEW.player_kills::numeric,   ARRAY[10, 50, 100, 500, 1000]::numeric[]),
      ('walk',    'Lữ khách',      OLD.distance_cm / 100000.0,  NEW.distance_cm / 100000.0,  ARRAY[10, 100, 500, 1000, 5000]::numeric[]),
      ('fish',    'Ngư dân',       OLD.fish_caught::numeric,    NEW.fish_caught::numeric,    ARRAY[10, 100, 500, 1000, 5000]::numeric[]),
      ('farm',    'Nông dân',      OLD.animals_bred::numeric,   NEW.animals_bred::numeric,   ARRAY[10, 100, 500, 1000, 5000]::numeric[]),
      ('trade',   'Thương nhân',   OLD.traded::numeric,         NEW.traded::numeric,         ARRAY[10, 100, 500, 1000, 5000]::numeric[]),
      ('explore', 'Nhà thám hiểm', OLD.adv_done::numeric,       NEW.adv_done::numeric,       ARRAY[10, 25, 50, 80, 110]::numeric[])
    ) AS t(id, name, ov, nv, steps)
  LOOP
    o := bnc_tier(m.ov, m.steps);
    n := bnc_tier(m.nv, m.steps);
    IF n > o AND n >= 0 THEN
      INSERT INTO activity_events (name_key, mc_username, kind, data)
      VALUES (NEW.name_key, NEW.mc_username, 'milestone',
              jsonb_build_object('id', m.id, 'name', m.name, 'level', n, 'tier', v_tiers[n + 1]))
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- Vừa vượt lên top 1 (mỗi mục tối đa 1 lần / 6 giờ để tránh 2 người giành nhau liên tục)
  FOR m IN SELECT * FROM (VALUES
      ('play_seconds', 'Giờ chơi',  OLD.play_seconds::numeric, NEW.play_seconds::numeric),
      ('blocks_mined', 'Đào khối',  OLD.blocks_mined::numeric, NEW.blocks_mined::numeric),
      ('mob_kills',    'Hạ quái',   OLD.mob_kills::numeric,    NEW.mob_kills::numeric),
      ('adv_done',     'Thành tựu', OLD.adv_done::numeric,     NEW.adv_done::numeric)
    ) AS t(stat, label, ov, nv)
  LOOP
    CONTINUE WHEN m.nv <= m.ov OR m.nv <= 0;
    EXECUTE format('SELECT NOT EXISTS (SELECT 1 FROM player_game_stats WHERE name_key <> $1 AND %I >= $2)', m.stat)
      INTO v_top USING NEW.name_key, m.nv;
    CONTINUE WHEN NOT v_top;
    EXECUTE format('SELECT mc_username FROM player_game_stats WHERE name_key <> $1 AND %I >= $2 ORDER BY %I DESC LIMIT 1', m.stat, m.stat)
      INTO v_beaten USING NEW.name_key, m.ov;
    CONTINUE WHEN v_beaten IS NULL;
    CONTINUE WHEN EXISTS (SELECT 1 FROM activity_events e WHERE e.kind = 'top1' AND e.data->>'stat' = m.stat AND e.ts > now() - interval '6 hours');
    INSERT INTO activity_events (name_key, mc_username, kind, data)
    VALUES (NEW.name_key, NEW.mc_username, 'top1', jsonb_build_object('stat', m.stat, 'label', m.label, 'beaten', v_beaten));
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bnc_game_stats_events ON public.player_game_stats;
CREATE TRIGGER bnc_game_stats_events AFTER UPDATE ON public.player_game_stats
  FOR EACH ROW EXECUTE FUNCTION public.bnc_game_stats_events();

CREATE OR REPLACE FUNCTION public.bnc_advancement_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Chỉ báo thành tựu vừa đạt (trong 30 phút), không báo lại thành tựu cũ khi đồng bộ
  IF NEW.done_at IS NOT NULL AND NEW.done_at > now() - interval '30 minutes' AND NEW.done_at < now() + interval '5 minutes'
     AND NEW.adv_key NOT LIKE '%/root' THEN
    INSERT INTO activity_events (name_key, mc_username, kind, data, ts)
    VALUES (NEW.name_key,
            coalesce((SELECT mc_username FROM player_game_stats WHERE name_key = NEW.name_key), NEW.name_key),
            'advancement',
            jsonb_build_object('key', NEW.adv_key, 'title', NEW.title, 'frame', NEW.frame),
            least(NEW.done_at, now()))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bnc_advancement_events ON public.player_advancements;
CREATE TRIGGER bnc_advancement_events AFTER INSERT ON public.player_advancements
  FOR EACH ROW EXECUTE FUNCTION public.bnc_advancement_events();

-- Nhịp tim: thêm sự kiện "vào game" / "người chơi mới"
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
    INSERT INTO public.activity_events (name_key, mc_username, kind)
    SELECT DISTINCT ON (lower(n)) lower(n), n,
           CASE WHEN ps.name_key IS NULL AND coalesce(g.play_seconds, 0) < 600 THEN 'first_join' ELSE 'join' END
      FROM unnest(p_names) AS n
      LEFT JOIN public.player_stats ps ON ps.name_key = lower(n)
      LEFT JOIN public.player_game_stats g ON g.name_key = lower(n)
     WHERE ps.name_key IS NULL OR ps.last_seen < v_now - interval '3 minutes';

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
       WHERE NOT EXISTS (SELECT 1 FROM public.player_game_stats g
                          WHERE g.name_key = lower(n) AND g.live_at > v_now - interval '10 minutes')
      ON CONFLICT (day, name_key) DO UPDATE SET seconds = pd.seconds + EXCLUDED.seconds;
    END IF;
  END IF;

  IF v_last IS NULL OR date_trunc('hour', v_last) <> date_trunc('hour', v_now) THEN
    DELETE FROM public.online_samples WHERE ts < v_now - interval '120 days';
    DELETE FROM public.activity_events WHERE (kind = 'join' AND ts < v_now - interval '7 days') OR ts < v_now - interval '90 days';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_track_playtime(TEXT[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_track_playtime(TEXT[], INT) TO service_role;

-- Dòng hoạt động công khai
CREATE OR REPLACE FUNCTION public.bnc_activity_feed(p_limit INT DEFAULT 30, p_joins BOOLEAN DEFAULT false)
RETURNS TABLE (id BIGINT, ts TIMESTAMPTZ, mc_username TEXT, kind TEXT, data JSONB)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.ts, e.mc_username, e.kind, e.data
    FROM public.activity_events e
   WHERE p_joins OR e.kind <> 'join'
   ORDER BY e.ts DESC, e.id DESC
   LIMIT least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- Sự kiện cần báo lên Discord (Netlify gọi bằng service_role; đánh dấu đã báo)
CREATE OR REPLACE FUNCTION public.bnc_take_discord_events(p_limit INT DEFAULT 10)
RETURNS SETOF public.activity_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.activity_events SET notified = true
   WHERE id IN (
     SELECT id FROM public.activity_events
      WHERE NOT notified AND ts > now() - interval '15 minutes'
        AND (kind IN ('first_join', 'top1')
             OR (kind = 'milestone' AND (data->>'level')::int >= 3)
             OR (kind = 'advancement' AND data->>'frame' = 'challenge'))
      ORDER BY id
      LIMIT least(greatest(coalesce(p_limit, 10), 1), 25)
      FOR UPDATE SKIP LOCKED)
  RETURNING *;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_take_discord_events(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_take_discord_events(INT) TO service_role;

-- ---------------------------------------------------------------------
-- 2. Mùa giải + Đại sảnh danh vọng (theo giờ chơi)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seasons (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  starts_on DATE NOT NULL,
  ends_on DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seasons_read ON public.seasons;
CREATE POLICY seasons_read ON public.seasons FOR SELECT USING (true);
DROP POLICY IF EXISTS seasons_admin ON public.seasons;
CREATE POLICY seasons_admin ON public.seasons FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.seasons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.seasons TO authenticated;
GRANT USAGE ON SEQUENCE public.seasons_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.bnc_season_top(p_season INT, p_limit INT DEFAULT 50)
RETURNS TABLE (mc_username TEXT, seconds BIGINT, last_seen TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (SELECT * FROM public.seasons WHERE id = p_season),
  agg AS (
    SELECT pd.name_key, sum(pd.seconds)::bigint AS secs
      FROM public.player_daily pd, s
     WHERE pd.day >= s.starts_on AND (s.ends_on IS NULL OR pd.day <= s.ends_on)
     GROUP BY pd.name_key)
  SELECT p.mc_username, agg.secs, p.last_seen
    FROM agg JOIN public.bnc_all_players() p USING (name_key)
   WHERE agg.secs > 0
   ORDER BY agg.secs DESC, p.mc_username
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.bnc_hall_of_fame()
RETURNS TABLE (season_id INT, season_name TEXT, starts_on DATE, ends_on DATE, place INT, mc_username TEXT, seconds BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.starts_on, s.ends_on, t.place, t.mc_username, t.secs
    FROM public.seasons s
    CROSS JOIN LATERAL (
      SELECT row_number() OVER (ORDER BY sum(pd.seconds) DESC, max(p.mc_username))::int AS place,
             max(p.mc_username) AS mc_username, sum(pd.seconds)::bigint AS secs
        FROM public.player_daily pd
        JOIN public.bnc_all_players() p ON p.name_key = pd.name_key
       WHERE pd.day BETWEEN s.starts_on AND s.ends_on
       GROUP BY pd.name_key
       ORDER BY sum(pd.seconds) DESC
       LIMIT 3) t
   WHERE s.ends_on IS NOT NULL AND s.ends_on < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
   ORDER BY s.ends_on DESC, t.place;
$$;

-- ---------------------------------------------------------------------
-- 3. Thống kê toàn server, thành tựu hiếm, lịch hoạt động cá nhân
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bnc_server_totals()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d),
  peak AS (SELECT ts, players FROM public.online_samples ORDER BY players DESC, ts DESC LIMIT 1)
  SELECT jsonb_build_object(
    'players', (SELECT count(*) FROM public.bnc_all_players()),
    'play_seconds', (SELECT coalesce(sum(total_seconds), 0) FROM public.bnc_all_players()),
    'blocks_mined', (SELECT coalesce(sum(blocks_mined), 0) FROM public.player_game_stats),
    'mob_kills', (SELECT coalesce(sum(mob_kills), 0) FROM public.player_game_stats),
    'player_kills', (SELECT coalesce(sum(player_kills), 0) FROM public.player_game_stats),
    'deaths', (SELECT coalesce(sum(deaths), 0) FROM public.player_game_stats),
    'distance_cm', (SELECT coalesce(sum(distance_cm), 0) FROM public.player_game_stats),
    'fish_caught', (SELECT coalesce(sum(fish_caught), 0) FROM public.player_game_stats),
    'adv_done', (SELECT coalesce(sum(adv_done), 0) FROM public.player_game_stats),
    'active_today', (SELECT count(DISTINCT name_key) FROM public.player_daily, today WHERE day = today.d),
    'active_week', (SELECT count(DISTINCT name_key) FROM public.player_daily, today WHERE day >= today.d - 6),
    'peak_online', (SELECT players FROM peak),
    'peak_at', (SELECT ts FROM peak),
    'new_players', coalesce((
      SELECT jsonb_agg(jsonb_build_object('day', gd::date, 'count', coalesce(c.n, 0)) ORDER BY gd)
        FROM today CROSS JOIN generate_series(today.d - 29, today.d, interval '1 day') AS gd
        LEFT JOIN (SELECT (ts AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) AS n
                     FROM public.activity_events WHERE kind = 'first_join' GROUP BY 1) c ON c.day = gd::date), '[]'::jsonb),
    'new_players_30d', (SELECT count(*) FROM public.activity_events WHERE kind = 'first_join' AND ts > now() - interval '30 days')
  );
$$;

CREATE OR REPLACE FUNCTION public.bnc_rare_advancements(p_limit INT DEFAULT 30)
RETURNS TABLE (adv_key TEXT, title TEXT, frame TEXT, holders INT, total INT, names TEXT[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (SELECT count(*)::int AS total FROM public.player_game_stats WHERE adv_done > 0)
  SELECT a.adv_key, max(a.title), max(a.frame), count(*)::int, t.total,
         (array_agg(g.mc_username ORDER BY a.done_at NULLS LAST, g.mc_username))[1:5]
    FROM public.player_advancements a
    JOIN public.player_game_stats g ON g.name_key = a.name_key
    CROSS JOIN t
   WHERE a.adv_key NOT LIKE '%/root'
   GROUP BY a.adv_key, t.total
   ORDER BY count(*), (max(a.frame) = 'challenge') DESC, max(a.title)
   LIMIT least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

CREATE OR REPLACE FUNCTION public.bnc_player_calendar(p_name TEXT)
RETURNS TABLE (day DATE, seconds INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pd.day, pd.seconds
    FROM public.player_daily pd
   WHERE pd.name_key = lower(trim(coalesce(p_name, '')))
     AND pd.day > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 371
     AND pd.seconds > 0
   ORDER BY pd.day;
$$;

-- ---------------------------------------------------------------------
-- 4. Lịch sự kiện + đăng ký nhận thông báo trình duyệt
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.server_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 120),
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT,
  image_url TEXT,
  reminded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS server_events_start_idx ON public.server_events (starts_at);
ALTER TABLE public.server_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS server_events_read ON public.server_events;
CREATE POLICY server_events_read ON public.server_events FOR SELECT USING (true);
DROP POLICY IF EXISTS server_events_admin ON public.server_events;
CREATE POLICY server_events_admin ON public.server_events FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.server_events TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.server_events TO authenticated;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok TIMESTAMPTZ
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Thư viện công trình: bài đăng, tim, bình luận
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mc_username TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 80),
  description TEXT CHECK (description IS NULL OR length(description) <= 1500),
  world TEXT CHECK (world IS NULL OR length(world) <= 40),
  x INT, y INT, z INT,
  images TEXT[] NOT NULL CHECK (cardinality(images) BETWEEN 1 AND 6),
  likes_count INT NOT NULL DEFAULT 0,
  comments_count INT NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS builds_created_idx ON public.builds (created_at DESC);
CREATE INDEX IF NOT EXISTS builds_user_idx ON public.builds (lower(mc_username));

CREATE TABLE IF NOT EXISTS public.build_likes (
  build_id UUID NOT NULL REFERENCES public.builds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (build_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.build_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES public.builds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mc_username TEXT NOT NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 500),
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS build_comments_build_idx ON public.build_comments (build_id, created_at);

-- Không tin dữ liệu từ trình duyệt: tự gán chủ bài, tên, chặn spam
CREATE OR REPLACE FUNCTION public.bnc_builds_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin BOOLEAN := public.is_admin();
  v_name TEXT;
  img TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;
    SELECT username INTO v_name FROM profiles WHERE id = auth.uid();
    IF v_name IS NULL THEN RAISE EXCEPTION 'Tài khoản chưa có tên nhân vật'; END IF;
    NEW.user_id := auth.uid();
    NEW.mc_username := v_name;
    NEW.likes_count := 0;
    NEW.comments_count := 0;
    NEW.created_at := now();
    IF NOT v_admin THEN
      NEW.featured := false;
      NEW.hidden := false;
      IF (SELECT count(*) FROM builds WHERE user_id = auth.uid() AND created_at > now() - interval '24 hours') >= 5 THEN
        RAISE EXCEPTION 'Mỗi ngày chỉ đăng tối đa 5 công trình';
      END IF;
    END IF;
  ELSE
    NEW.id := OLD.id;
    NEW.user_id := OLD.user_id;
    NEW.mc_username := OLD.mc_username;
    NEW.created_at := OLD.created_at;
    IF current_setting('bnc.counter', true) IS DISTINCT FROM 'on' THEN
      NEW.likes_count := OLD.likes_count;
      NEW.comments_count := OLD.comments_count;
    END IF;
    IF NOT v_admin THEN
      NEW.featured := OLD.featured;
      NEW.hidden := OLD.hidden;
    END IF;
  END IF;
  -- Ảnh phải nằm trong thư mục riêng của chủ bài trên Supabase Storage
  FOREACH img IN ARRAY NEW.images LOOP
    IF img !~ ('^https://[^/]+/storage/v1/object/public/builds/' || NEW.user_id::text || '/[A-Za-z0-9._-]+$') THEN
      RAISE EXCEPTION 'Ảnh không hợp lệ';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bnc_builds_guard ON public.builds;
CREATE TRIGGER bnc_builds_guard BEFORE INSERT OR UPDATE ON public.builds
  FOR EACH ROW EXECUTE FUNCTION public.bnc_builds_guard();

CREATE OR REPLACE FUNCTION public.bnc_build_comments_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;
    SELECT username INTO v_name FROM profiles WHERE id = auth.uid();
    IF v_name IS NULL THEN RAISE EXCEPTION 'Tài khoản chưa có tên nhân vật'; END IF;
    NEW.user_id := auth.uid();
    NEW.mc_username := v_name;
    NEW.content := trim(NEW.content);
    NEW.created_at := now();
    NEW.hidden := false;
    IF NOT public.is_admin() AND (SELECT count(*) FROM build_comments WHERE user_id = auth.uid() AND created_at > now() - interval '1 hour') >= 20 THEN
      RAISE EXCEPTION 'Bạn bình luận quá nhanh, thử lại sau nhé';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM builds WHERE id = NEW.build_id AND NOT hidden) THEN
      RAISE EXCEPTION 'Không tìm thấy công trình';
    END IF;
  ELSE
    -- Chỉ admin được sửa (ẩn/hiện)
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
    NEW.id := OLD.id; NEW.build_id := OLD.build_id; NEW.user_id := OLD.user_id;
    NEW.mc_username := OLD.mc_username; NEW.content := OLD.content; NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bnc_build_comments_guard ON public.build_comments;
CREATE TRIGGER bnc_build_comments_guard BEFORE INSERT OR UPDATE ON public.build_comments
  FOR EACH ROW EXECUTE FUNCTION public.bnc_build_comments_guard();

-- Bộ đếm tim / bình luận
CREATE OR REPLACE FUNCTION public.bnc_build_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_build UUID := coalesce(NEW.build_id, OLD.build_id);
BEGIN
  PERFORM set_config('bnc.counter', 'on', true);
  IF TG_TABLE_NAME = 'build_likes' THEN
    UPDATE builds SET likes_count = (SELECT count(*) FROM build_likes WHERE build_id = v_build) WHERE id = v_build;
  ELSE
    UPDATE builds SET comments_count = (SELECT count(*) FROM build_comments WHERE build_id = v_build AND NOT hidden) WHERE id = v_build;
  END IF;
  PERFORM set_config('bnc.counter', 'off', true);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS bnc_build_likes_count ON public.build_likes;
CREATE TRIGGER bnc_build_likes_count AFTER INSERT OR DELETE ON public.build_likes
  FOR EACH ROW EXECUTE FUNCTION public.bnc_build_counters();
DROP TRIGGER IF EXISTS bnc_build_comments_count ON public.build_comments;
CREATE TRIGGER bnc_build_comments_count AFTER INSERT OR UPDATE OR DELETE ON public.build_comments
  FOR EACH ROW EXECUTE FUNCTION public.bnc_build_counters();

CREATE OR REPLACE FUNCTION public.bnc_build_likes_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bnc_build_likes_guard ON public.build_likes;
CREATE TRIGGER bnc_build_likes_guard BEFORE INSERT ON public.build_likes
  FOR EACH ROW EXECUTE FUNCTION public.bnc_build_likes_guard();

ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS builds_read ON public.builds;
CREATE POLICY builds_read ON public.builds FOR SELECT USING (NOT hidden OR user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS builds_insert ON public.builds;
CREATE POLICY builds_insert ON public.builds FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS builds_update ON public.builds;
CREATE POLICY builds_update ON public.builds FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS builds_delete ON public.builds;
CREATE POLICY builds_delete ON public.builds FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS build_likes_read ON public.build_likes;
CREATE POLICY build_likes_read ON public.build_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS build_likes_insert ON public.build_likes;
CREATE POLICY build_likes_insert ON public.build_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS build_likes_delete ON public.build_likes;
CREATE POLICY build_likes_delete ON public.build_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS build_comments_read ON public.build_comments;
CREATE POLICY build_comments_read ON public.build_comments FOR SELECT USING (NOT hidden OR public.is_admin());
DROP POLICY IF EXISTS build_comments_insert ON public.build_comments;
CREATE POLICY build_comments_insert ON public.build_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS build_comments_update ON public.build_comments;
CREATE POLICY build_comments_update ON public.build_comments FOR UPDATE TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS build_comments_delete ON public.build_comments;
CREATE POLICY build_comments_delete ON public.build_comments FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_admin());

GRANT SELECT ON public.builds, public.build_likes, public.build_comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.builds, public.build_comments TO authenticated;
GRANT INSERT, DELETE ON public.build_likes TO authenticated;

-- STORAGE BEGIN — kho ảnh công trình (công khai, mỗi người chỉ ghi vào thư mục của mình, tối đa 3MB/ảnh)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('builds', 'builds', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS "bnc builds upload own folder" ON storage.objects;
CREATE POLICY "bnc builds upload own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'builds' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "bnc builds delete own folder" ON storage.objects;
CREATE POLICY "bnc builds delete own folder" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'builds' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
-- STORAGE END

-- ---------------------------------------------------------------------
-- 6. Clan (tạo trên web; thành viên là tài khoản web theo tên nhân vật)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#d4af37',
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clans_name_uq ON public.clans (lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS clans_tag_uq ON public.clans (lower(tag));

CREATE TABLE IF NOT EXISTS public.clan_members (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  clan_id UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  mc_username TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clan_members_clan_idx ON public.clan_members (clan_id);
CREATE INDEX IF NOT EXISTS clan_members_name_idx ON public.clan_members (lower(mc_username));

CREATE TABLE IF NOT EXISTS public.clan_requests (
  clan_id UUID NOT NULL REFERENCES public.clans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mc_username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (clan_id, user_id)
);

ALTER TABLE public.clans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clans_read ON public.clans;
CREATE POLICY clans_read ON public.clans FOR SELECT USING (true);
DROP POLICY IF EXISTS clan_members_read ON public.clan_members;
CREATE POLICY clan_members_read ON public.clan_members FOR SELECT USING (true);
REVOKE ALL ON public.clans, public.clan_members, public.clan_requests FROM anon, authenticated;
GRANT SELECT ON public.clans, public.clan_members TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bnc_me()
RETURNS TABLE (uid UUID, name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, username FROM public.profiles WHERE id = auth.uid() AND username IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_me() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.bnc_clan_create(p_name TEXT, p_tag TEXT, p_description TEXT DEFAULT '', p_color TEXT DEFAULT '#d4af37')
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me RECORD;
  v_id UUID;
  v_name TEXT := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_tag TEXT := upper(trim(coalesce(p_tag, '')));
BEGIN
  SELECT * INTO me FROM bnc_me();
  IF me.uid IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = me.uid) THEN RAISE EXCEPTION 'Bạn đang ở trong một clan'; END IF;
  IF length(v_name) NOT BETWEEN 3 AND 24 OR v_name ~ '[<>{}\[\]\\"`]' THEN RAISE EXCEPTION 'Tên clan dài 3–24 ký tự, không dùng ký tự đặc biệt'; END IF;
  IF v_tag !~ '^[A-Z0-9]{2,5}$' THEN RAISE EXCEPTION 'Tag gồm 2–5 chữ cái hoặc số'; END IF;
  IF coalesce(p_color, '') !~ '^#[0-9a-fA-F]{6}$' THEN p_color := '#d4af37'; END IF;
  IF EXISTS (SELECT 1 FROM clans WHERE lower(name) = lower(v_name)) THEN RAISE EXCEPTION 'Tên clan đã có người dùng'; END IF;
  IF EXISTS (SELECT 1 FROM clans WHERE lower(tag) = lower(v_tag)) THEN RAISE EXCEPTION 'Tag đã có người dùng'; END IF;
  INSERT INTO clans (name, tag, description, color, owner_id)
  VALUES (v_name, v_tag, left(trim(coalesce(p_description, '')), 300), lower(p_color), me.uid)
  RETURNING id INTO v_id;
  INSERT INTO clan_members (user_id, clan_id, mc_username, role) VALUES (me.uid, v_id, me.name, 'owner');
  DELETE FROM clan_requests WHERE user_id = me.uid;
  RETURN v_tag;
END;
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_request(p_clan UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me RECORD;
BEGIN
  SELECT * INTO me FROM bnc_me();
  IF me.uid IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;
  IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = me.uid) THEN RAISE EXCEPTION 'Bạn đang ở trong một clan'; END IF;
  IF NOT EXISTS (SELECT 1 FROM clans WHERE id = p_clan) THEN RAISE EXCEPTION 'Không tìm thấy clan'; END IF;
  IF (SELECT count(*) FROM clan_requests WHERE user_id = me.uid) >= 3 THEN RAISE EXCEPTION 'Chỉ được xin vào tối đa 3 clan cùng lúc'; END IF;
  INSERT INTO clan_requests (clan_id, user_id, mc_username) VALUES (p_clan, me.uid, me.name) ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_cancel(p_clan UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.clan_requests WHERE clan_id = p_clan AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_respond(p_user UUID, p_accept BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clan UUID;
  v_req RECORD;
BEGIN
  SELECT id INTO v_clan FROM clans WHERE owner_id = auth.uid();
  IF v_clan IS NULL THEN RAISE EXCEPTION 'Chỉ chủ clan mới duyệt được'; END IF;
  SELECT * INTO v_req FROM clan_requests WHERE clan_id = v_clan AND user_id = p_user;
  IF v_req.user_id IS NULL THEN RAISE EXCEPTION 'Không có đơn xin vào này'; END IF;
  IF p_accept THEN
    IF EXISTS (SELECT 1 FROM clan_members WHERE user_id = p_user) THEN
      DELETE FROM clan_requests WHERE user_id = p_user;
      RAISE EXCEPTION 'Người này đã vào clan khác';
    END IF;
    IF (SELECT count(*) FROM clan_members WHERE clan_id = v_clan) >= 30 THEN RAISE EXCEPTION 'Clan đã đủ 30 thành viên'; END IF;
    INSERT INTO clan_members (user_id, clan_id, mc_username, role) VALUES (p_user, v_clan, v_req.mc_username, 'member');
    DELETE FROM clan_requests WHERE user_id = p_user;
  ELSE
    DELETE FROM clan_requests WHERE clan_id = v_clan AND user_id = p_user;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_leave()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m RECORD;
  v_next UUID;
BEGIN
  SELECT * INTO v_m FROM clan_members WHERE user_id = auth.uid();
  IF v_m.user_id IS NULL THEN RETURN; END IF;
  DELETE FROM clan_members WHERE user_id = auth.uid();
  IF v_m.role = 'owner' THEN
    SELECT user_id INTO v_next FROM clan_members WHERE clan_id = v_m.clan_id ORDER BY joined_at LIMIT 1;
    IF v_next IS NULL THEN
      DELETE FROM clans WHERE id = v_m.clan_id;
    ELSE
      UPDATE clan_members SET role = 'owner' WHERE user_id = v_next;
      UPDATE clans SET owner_id = v_next WHERE id = v_m.clan_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_kick(p_user UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clan UUID;
BEGIN
  SELECT id INTO v_clan FROM clans WHERE owner_id = auth.uid();
  IF v_clan IS NULL OR p_user = auth.uid() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
  DELETE FROM clan_members WHERE user_id = p_user AND clan_id = v_clan;
END;
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_update(p_description TEXT, p_color TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE clans SET description = left(trim(coalesce(p_description, '')), 300),
                   color = CASE WHEN coalesce(p_color, '') ~ '^#[0-9a-fA-F]{6}$' THEN lower(p_color) ELSE color END
   WHERE owner_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_disband(p_clan UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clans WHERE id = p_clan AND (owner_id = auth.uid() OR public.is_admin())) THEN
    RAISE EXCEPTION 'Không có quyền';
  END IF;
  DELETE FROM clans WHERE id = p_clan;
END;
$$;

-- Thông tin clan của tôi (+ các đơn đang chờ, + đơn xin vào clan mình nếu là chủ)
CREATE OR REPLACE FUNCTION public.bnc_my_clan()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'clan', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'tag', c.tag, 'role', m.role)
               FROM clan_members m JOIN clans c ON c.id = m.clan_id WHERE m.user_id = auth.uid()),
    'pending', coalesce((SELECT jsonb_agg(clan_id) FROM clan_requests WHERE user_id = auth.uid()), '[]'::jsonb),
    'requests', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', r.user_id, 'mc_username', r.mc_username, 'at', r.created_at) ORDER BY r.created_at)
                            FROM clan_requests r JOIN clans c ON c.id = r.clan_id WHERE c.owner_id = auth.uid()), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_list()
RETURNS TABLE (id UUID, name TEXT, tag TEXT, color TEXT, description TEXT, owner TEXT, members INT,
               play_seconds BIGINT, blocks_mined BIGINT, mob_kills BIGINT, adv_done BIGINT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.name, c.tag, c.color, c.description,
         (SELECT mc_username FROM clan_members WHERE user_id = c.owner_id),
         count(m.user_id)::int,
         coalesce(sum(p.total_seconds), 0)::bigint,
         coalesce(sum(g.blocks_mined), 0)::bigint,
         coalesce(sum(g.mob_kills), 0)::bigint,
         coalesce(sum(g.adv_done), 0)::bigint,
         c.created_at
    FROM clans c
    LEFT JOIN clan_members m ON m.clan_id = c.id
    LEFT JOIN bnc_all_players() p ON p.name_key = lower(m.mc_username)
    LEFT JOIN player_game_stats g ON g.name_key = lower(m.mc_username)
   GROUP BY c.id
   ORDER BY 8 DESC, c.created_at;
$$;

CREATE OR REPLACE FUNCTION public.bnc_clan_detail(p_tag TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'name', c.name, 'tag', c.tag, 'color', c.color, 'description', c.description, 'created_at', c.created_at,
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'user_id', m.user_id, 'mc_username', m.mc_username, 'role', m.role, 'joined_at', m.joined_at,
               'play_seconds', coalesce(p.total_seconds, 0), 'blocks_mined', coalesce(g.blocks_mined, 0),
               'mob_kills', coalesce(g.mob_kills, 0), 'adv_done', coalesce(g.adv_done, 0), 'last_seen', p.last_seen)
             ORDER BY (m.role = 'owner') DESC, coalesce(p.total_seconds, 0) DESC)
        FROM clan_members m
        LEFT JOIN bnc_all_players() p ON p.name_key = lower(m.mc_username)
        LEFT JOIN player_game_stats g ON g.name_key = lower(m.mc_username)
       WHERE m.clan_id = c.id), '[]'::jsonb),
    'rank', (SELECT r FROM (SELECT l.id, row_number() OVER (ORDER BY l.play_seconds DESC, l.created_at) AS r FROM bnc_clan_list() l) x WHERE x.id = c.id)
  )
  FROM clans c WHERE lower(c.tag) = lower(trim(coalesce(p_tag, '')));
$$;

CREATE OR REPLACE FUNCTION public.bnc_player_clan(p_name TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('name', c.name, 'tag', c.tag, 'color', c.color, 'role', m.role)
    FROM clan_members m JOIN clans c ON c.id = m.clan_id
   WHERE lower(m.mc_username) = lower(trim(coalesce(p_name, '')))
   LIMIT 1;
$$;

-- ---------------------------------------------------------------------
-- Quyền gọi hàm
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.bnc_activity_feed(INT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_season_top(INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_hall_of_fame() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_server_totals() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_rare_advancements(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_player_calendar(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_clan_list() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_clan_detail(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_player_clan(TEXT) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bnc_clan_create(TEXT, TEXT, TEXT, TEXT), public.bnc_clan_request(UUID), public.bnc_clan_cancel(UUID),
  public.bnc_clan_respond(UUID, BOOLEAN), public.bnc_clan_leave(), public.bnc_clan_kick(UUID), public.bnc_clan_update(TEXT, TEXT),
  public.bnc_clan_disband(UUID), public.bnc_my_clan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bnc_clan_create(TEXT, TEXT, TEXT, TEXT), public.bnc_clan_request(UUID), public.bnc_clan_cancel(UUID),
  public.bnc_clan_respond(UUID, BOOLEAN), public.bnc_clan_leave(), public.bnc_clan_kick(UUID), public.bnc_clan_update(TEXT, TEXT),
  public.bnc_clan_disband(UUID), public.bnc_my_clan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_me() TO authenticated;

NOTIFY pgrst, 'reload schema';
SELECT 'COMMUNITY MIGRATION OK' AS status;
