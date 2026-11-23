-- =====================================================================
-- BuildnChill — Thống kê & thành tựu lấy thẳng từ trong game (plugin 2.3+)
-- Chạy trong Supabase SQL Editor (chạy lại nhiều lần không sao).
-- Yêu cầu: đã chạy PLAYTIME_MIGRATION.sql.
--
-- Giờ chơi "mọi lúc" = thống kê play_time của Minecraft (giống "Đã chơi" trên bảng điểm).
-- Giờ chơi theo ngày/tuần/tháng = phần tăng thêm của play_time giữa các lần plugin gửi.
-- Người chưa có thống kê từ game vẫn dùng cách tính cũ (nhịp tim).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.player_game_stats (
  name_key TEXT PRIMARY KEY,
  uuid UUID,
  mc_username TEXT NOT NULL,
  play_seconds BIGINT NOT NULL DEFAULT 0,
  deaths BIGINT NOT NULL DEFAULT 0,
  mob_kills BIGINT NOT NULL DEFAULT 0,
  player_kills BIGINT NOT NULL DEFAULT 0,
  blocks_mined BIGINT NOT NULL DEFAULT 0,
  distance_cm BIGINT NOT NULL DEFAULT 0,
  fish_caught BIGINT NOT NULL DEFAULT 0,
  animals_bred BIGINT NOT NULL DEFAULT 0,
  traded BIGINT NOT NULL DEFAULT 0,
  jumps BIGINT NOT NULL DEFAULT 0,
  level INT,
  adv_done INT NOT NULL DEFAULT 0,
  adv_total INT NOT NULL DEFAULT 0,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,   -- số liệu từ PlaceholderAPI: { key: {label, value} }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  live_at TIMESTAMPTZ                          -- lần cuối nhận số liệu trực tiếp (đang online)
);

CREATE TABLE IF NOT EXISTS public.player_advancements (
  name_key TEXT NOT NULL,
  adv_key TEXT NOT NULL,
  title TEXT NOT NULL,
  frame TEXT NOT NULL DEFAULT 'task',
  done_at TIMESTAMPTZ,
  PRIMARY KEY (name_key, adv_key)
);

ALTER TABLE public.player_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_advancements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_game_stats, public.player_advancements FROM anon, authenticated;

-- Số nguyên an toàn từ JSON
CREATE OR REPLACE FUNCTION public.bnc_jint(j JSONB, k TEXT)
RETURNS BIGINT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN (j->>k) ~ '^\d{1,15}$' THEN (j->>k)::bigint ELSE 0 END;
$$;

-- ---------- Nhận số liệu từ plugin ----------
CREATE OR REPLACE FUNCTION public.bnc_ingest_stats(p_rows JSONB, p_backfill BOOLEAN DEFAULT false)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r JSONB;
  v_name TEXT;
  v_key TEXT;
  v_old public.player_game_stats;
  v_play BIGINT;
  v_delta BIGINT;
  v_extra JSONB;
  v_count INT := 0;
  v_day DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' THEN RETURN 0; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LIMIT 300 LOOP
    v_name := trim(coalesce(r->>'name', ''));
    CONTINUE WHEN v_name !~ '^[.*]?[A-Za-z0-9_]{2,16}$';
    v_key := lower(v_name);
    v_play := bnc_jint(r, 'play_seconds');

    -- Chỉ giữ số liệu PlaceholderAPI dạng { key: {label, value} }
    SELECT coalesce(jsonb_object_agg(e.key, jsonb_build_object('label', left(e.value->>'label', 32), 'value', left(e.value->>'value', 40))), '{}'::jsonb)
      INTO v_extra
      FROM jsonb_each(CASE WHEN jsonb_typeof(r->'extra') = 'object' THEN r->'extra' ELSE '{}'::jsonb END) e
     WHERE e.key ~ '^[a-z0-9_]{1,24}$' AND jsonb_typeof(e.value) = 'object' AND coalesce(e.value->>'value', '') <> '';

    SELECT * INTO v_old FROM public.player_game_stats WHERE name_key = v_key FOR UPDATE;

    -- Giờ chơi theo ngày: phần tăng thêm kể từ lần gửi trước (bỏ qua lần đầu & nhập lịch sử)
    IF NOT p_backfill AND v_old.name_key IS NOT NULL THEN
      v_delta := v_play - v_old.play_seconds;
      IF v_delta > 0 AND v_delta <= 6 * 3600 THEN
        INSERT INTO public.player_daily AS pd (day, name_key, seconds)
        VALUES (v_day, v_key, v_delta)
        ON CONFLICT (day, name_key) DO UPDATE SET seconds = pd.seconds + EXCLUDED.seconds;
      END IF;
    END IF;

    INSERT INTO public.player_game_stats AS g (
      name_key, uuid, mc_username, play_seconds, deaths, mob_kills, player_kills, blocks_mined, distance_cm,
      fish_caught, animals_bred, traded, jumps, level, adv_done, adv_total, extra, updated_at, live_at)
    VALUES (
      v_key,
      CASE WHEN (r->>'uuid') ~* '^[0-9a-f-]{36}$' THEN (r->>'uuid')::uuid END,
      v_name, v_play, bnc_jint(r, 'deaths'), bnc_jint(r, 'mob_kills'), bnc_jint(r, 'player_kills'),
      bnc_jint(r, 'blocks_mined'), bnc_jint(r, 'distance_cm'), bnc_jint(r, 'fish_caught'),
      bnc_jint(r, 'animals_bred'), bnc_jint(r, 'traded'), bnc_jint(r, 'jumps'),
      CASE WHEN r ? 'level' THEN least(bnc_jint(r, 'level'), 100000)::int END,
      least(bnc_jint(r, 'adv_done'), 10000)::int, least(bnc_jint(r, 'adv_total'), 10000)::int,
      v_extra, now(), CASE WHEN p_backfill THEN NULL ELSE now() END)
    ON CONFLICT (name_key) DO UPDATE SET
      uuid = coalesce(EXCLUDED.uuid, g.uuid),
      mc_username = EXCLUDED.mc_username,
      -- Nhập lịch sử: không bao giờ làm giảm số liệu đang có (file có thể cũ hơn)
      play_seconds = CASE WHEN p_backfill THEN greatest(g.play_seconds, EXCLUDED.play_seconds) ELSE EXCLUDED.play_seconds END,
      deaths       = CASE WHEN p_backfill THEN greatest(g.deaths, EXCLUDED.deaths) ELSE EXCLUDED.deaths END,
      mob_kills    = CASE WHEN p_backfill THEN greatest(g.mob_kills, EXCLUDED.mob_kills) ELSE EXCLUDED.mob_kills END,
      player_kills = CASE WHEN p_backfill THEN greatest(g.player_kills, EXCLUDED.player_kills) ELSE EXCLUDED.player_kills END,
      blocks_mined = CASE WHEN p_backfill THEN greatest(g.blocks_mined, EXCLUDED.blocks_mined) ELSE EXCLUDED.blocks_mined END,
      distance_cm  = CASE WHEN p_backfill THEN greatest(g.distance_cm, EXCLUDED.distance_cm) ELSE EXCLUDED.distance_cm END,
      fish_caught  = CASE WHEN p_backfill THEN greatest(g.fish_caught, EXCLUDED.fish_caught) ELSE EXCLUDED.fish_caught END,
      animals_bred = CASE WHEN p_backfill THEN greatest(g.animals_bred, EXCLUDED.animals_bred) ELSE EXCLUDED.animals_bred END,
      traded       = CASE WHEN p_backfill THEN greatest(g.traded, EXCLUDED.traded) ELSE EXCLUDED.traded END,
      jumps        = CASE WHEN p_backfill THEN greatest(g.jumps, EXCLUDED.jumps) ELSE EXCLUDED.jumps END,
      level        = coalesce(EXCLUDED.level, g.level),
      adv_done     = CASE WHEN p_backfill THEN greatest(g.adv_done, EXCLUDED.adv_done) ELSE EXCLUDED.adv_done END,
      adv_total    = greatest(g.adv_total, EXCLUDED.adv_total),
      extra        = CASE WHEN EXCLUDED.extra = '{}'::jsonb THEN g.extra ELSE EXCLUDED.extra END,
      updated_at   = now(),
      live_at      = CASE WHEN p_backfill THEN g.live_at ELSE now() END;

    IF jsonb_typeof(r->'advancements') = 'array' THEN
      IF NOT p_backfill THEN
        DELETE FROM public.player_advancements WHERE name_key = v_key;
      END IF;
      INSERT INTO public.player_advancements (name_key, adv_key, title, frame, done_at)
      SELECT v_key, left(a->>'key', 120), left(coalesce(nullif(a->>'title', ''), a->>'key'), 120),
             CASE WHEN a->>'frame' IN ('task', 'goal', 'challenge') THEN a->>'frame' ELSE 'task' END,
             CASE WHEN (a->>'at') ~ '^\d{10,14}$' THEN to_timestamp((a->>'at')::bigint / 1000.0) END
        FROM jsonb_array_elements(r->'advancements') AS a
       WHERE coalesce(a->>'key', '') <> ''
       LIMIT 500
      ON CONFLICT (name_key, adv_key) DO UPDATE SET title = EXCLUDED.title, frame = EXCLUDED.frame,
        done_at = coalesce(EXCLUDED.done_at, public.player_advancements.done_at);
    END IF;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_ingest_stats(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_ingest_stats(JSONB, BOOLEAN) TO service_role;

-- Nhịp tim không cộng giờ theo ngày cho người đã có số liệu trực tiếp từ game (tránh cộng 2 lần)
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
       WHERE NOT EXISTS (SELECT 1 FROM public.player_game_stats g
                          WHERE g.name_key = lower(n) AND g.live_at > v_now - interval '10 minutes')
      ON CONFLICT (day, name_key) DO UPDATE SET seconds = pd.seconds + EXCLUDED.seconds;
    END IF;
  END IF;

  IF v_last IS NULL OR date_trunc('hour', v_last) <> date_trunc('hour', v_now) THEN
    DELETE FROM public.online_samples WHERE ts < v_now - interval '120 days';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_track_playtime(TEXT[], INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_track_playtime(TEXT[], INT) TO service_role;

-- ---------- Danh sách người chơi gộp (nhịp tim + thống kê game) ----------
CREATE OR REPLACE FUNCTION public.bnc_all_players()
RETURNS TABLE (name_key TEXT, mc_username TEXT, total_seconds BIGINT, last_seen TIMESTAMPTZ, first_seen TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(g.name_key, ps.name_key),
         coalesce(g.mc_username, ps.mc_username),
         CASE WHEN g.name_key IS NOT NULL THEN g.play_seconds ELSE ps.total_seconds END,
         ps.last_seen,
         ps.first_seen
    FROM public.player_game_stats g
    FULL JOIN public.player_stats ps ON ps.name_key = g.name_key;
$$;
REVOKE EXECUTE ON FUNCTION public.bnc_all_players() FROM PUBLIC, anon, authenticated;

-- Top giờ chơi: 'all' lấy theo thống kê game
CREATE OR REPLACE FUNCTION public.bnc_playtime_top(p_period TEXT DEFAULT 'week', p_limit INT DEFAULT 50)
RETURNS TABLE (mc_username TEXT, seconds BIGINT, last_seen TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d),
  players AS (SELECT * FROM public.bnc_all_players()),
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
    SELECT name_key, total_seconds FROM players WHERE p_period = 'all'
  )
  SELECT p.mc_username, agg.secs, p.last_seen
    FROM agg JOIN players p USING (name_key)
   WHERE agg.secs > 0
   ORDER BY agg.secs DESC, p.mc_username
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- Top theo một chỉ số trong game
CREATE OR REPLACE FUNCTION public.bnc_stat_top(p_stat TEXT, p_limit INT DEFAULT 50)
RETURNS TABLE (mc_username TEXT, value NUMERIC, display TEXT, last_seen TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (
  SELECT g.mc_username,
         CASE p_stat
           WHEN 'blocks_mined' THEN g.blocks_mined
           WHEN 'mob_kills' THEN g.mob_kills
           WHEN 'player_kills' THEN g.player_kills
           WHEN 'deaths' THEN g.deaths
           WHEN 'distance_cm' THEN g.distance_cm
           WHEN 'fish_caught' THEN g.fish_caught
           WHEN 'animals_bred' THEN g.animals_bred
           WHEN 'traded' THEN g.traded
           WHEN 'adv_done' THEN g.adv_done
           WHEN 'level' THEN coalesce(g.level, 0)
           ELSE CASE WHEN replace(replace(g.extra->(substr(p_stat, 7))->>'value', ',', ''), ' ', '') ~ '^-?\d+(\.\d+)?$'
                     THEN replace(replace(g.extra->(substr(p_stat, 7))->>'value', ',', ''), ' ', '')::numeric END
         END::numeric AS value,
         CASE WHEN p_stat LIKE 'extra:%' THEN g.extra->(substr(p_stat, 7))->>'value' END,
         ps.last_seen
    FROM public.player_game_stats g
    LEFT JOIN public.player_stats ps ON ps.name_key = g.name_key
   WHERE (p_stat IN ('blocks_mined','mob_kills','player_kills','deaths','distance_cm','fish_caught','animals_bred','traded','adv_done','level')
          OR p_stat ~ '^extra:[a-z0-9_]{1,24}$')
  ) t
  WHERE t.value > 0
  ORDER BY t.value DESC, t.mc_username
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

-- Các số liệu PlaceholderAPI đang có (để web hiện thành mục xếp hạng)
CREATE OR REPLACE FUNCTION public.bnc_stat_extras()
RETURNS TABLE (key TEXT, label TEXT, players INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.key, max(e.value->>'label'), count(*)::int
    FROM public.player_game_stats g, jsonb_each(g.extra) e
   GROUP BY e.key
   ORDER BY e.key;
$$;

-- Hồ sơ công khai (bổ sung thống kê game + thành tựu)
CREATE OR REPLACE FUNCTION public.bnc_player_profile(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := lower(trim(coalesce(p_name, '')));
  v_ps public.player_stats;
  v_g public.player_game_stats;
  v_today DATE := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  v_total BIGINT;
  v_name TEXT;
  v_result JSONB;
BEGIN
  SELECT * INTO v_ps FROM public.player_stats WHERE name_key = v_key;
  SELECT * INTO v_g FROM public.player_game_stats WHERE name_key = v_key;
  v_name := coalesce(v_g.mc_username, v_ps.mc_username,
            (SELECT o.mc_username FROM public.orders o WHERE lower(o.mc_username) = v_key ORDER BY o.created_at DESC LIMIT 1));
  IF v_name IS NULL THEN RETURN NULL; END IF;
  v_total := CASE WHEN v_g.name_key IS NOT NULL THEN v_g.play_seconds ELSE coalesce(v_ps.total_seconds, 0) END;

  SELECT jsonb_build_object(
    'mc_username', v_name,
    'tracked', v_ps.name_key IS NOT NULL OR v_g.name_key IS NOT NULL,
    'first_seen', v_ps.first_seen,
    'last_seen', v_ps.last_seen,
    'sessions', coalesce(v_ps.sessions, 0),
    'total_seconds', v_total,
    'today_seconds', coalesce((SELECT sum(seconds) FROM public.player_daily WHERE name_key = v_key AND day = v_today), 0),
    'week_seconds', coalesce((SELECT sum(seconds) FROM public.player_daily WHERE name_key = v_key AND day >= date_trunc('week', v_today)::date), 0),
    'month_seconds', coalesce((SELECT sum(seconds) FROM public.player_daily WHERE name_key = v_key AND day >= date_trunc('month', v_today)::date), 0),
    'rank_all', CASE WHEN v_total > 0 THEN (SELECT count(*) + 1 FROM public.bnc_all_players() x WHERE x.total_seconds > v_total) END,
    'players_tracked', (SELECT count(*) FROM public.bnc_all_players()),
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
                    LEFT JOIN public.player_daily pd ON pd.day = d::date AND pd.name_key = v_key), '[]'::jsonb),
    'game', CASE WHEN v_g.name_key IS NULL THEN NULL ELSE jsonb_build_object(
                    'play_seconds', v_g.play_seconds, 'deaths', v_g.deaths, 'mob_kills', v_g.mob_kills,
                    'player_kills', v_g.player_kills, 'blocks_mined', v_g.blocks_mined, 'distance_cm', v_g.distance_cm,
                    'fish_caught', v_g.fish_caught, 'animals_bred', v_g.animals_bred, 'traded', v_g.traded,
                    'jumps', v_g.jumps, 'level', v_g.level, 'adv_done', v_g.adv_done, 'adv_total', v_g.adv_total,
                    'extra', v_g.extra, 'updated_at', v_g.updated_at) END,
    'stat_ranks', CASE WHEN v_g.name_key IS NULL THEN NULL ELSE jsonb_build_object(
                    'blocks_mined', (SELECT count(*) + 1 FROM public.player_game_stats x WHERE x.blocks_mined > v_g.blocks_mined),
                    'mob_kills', (SELECT count(*) + 1 FROM public.player_game_stats x WHERE x.mob_kills > v_g.mob_kills),
                    'player_kills', (SELECT count(*) + 1 FROM public.player_game_stats x WHERE x.player_kills > v_g.player_kills),
                    'adv_done', (SELECT count(*) + 1 FROM public.player_game_stats x WHERE x.adv_done > v_g.adv_done),
                    'distance_cm', (SELECT count(*) + 1 FROM public.player_game_stats x WHERE x.distance_cm > v_g.distance_cm)) END,
    'advancements', coalesce((SELECT jsonb_agg(jsonb_build_object('key', adv_key, 'title', title, 'frame', frame, 'at', done_at)
                                ORDER BY done_at DESC NULLS LAST, title)
                                FROM public.player_advancements WHERE name_key = v_key), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.bnc_player_search(p_query TEXT, p_limit INT DEFAULT 8)
RETURNS TABLE (mc_username TEXT, last_seen TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mc_username, last_seen FROM public.bnc_all_players()
   WHERE length(trim(coalesce(p_query, ''))) >= 2
     AND name_key LIKE replace(replace(lower(trim(p_query)), '%', ''), '_', '\_') || '%'
   ORDER BY total_seconds DESC NULLS LAST
   LIMIT least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.bnc_playtime_top(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_stat_top(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_stat_extras() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_player_profile(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bnc_player_search(TEXT, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
SELECT 'GAME STATS MIGRATION OK' AS status;
