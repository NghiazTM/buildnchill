-- =====================================================================
-- BuildnChill — Danh sách người chơi đang online (hiển thị trên trang chủ)
-- Chạy trong Supabase SQL Editor (chạy lại nhiều lần không sao).
-- Yêu cầu: đã chạy STATUS_AND_BANKS_MIGRATION.sql.
-- =====================================================================

ALTER TABLE public.server_status ADD COLUMN IF NOT EXISTS online_players TEXT[] NOT NULL DEFAULT '{}';

-- Nhịp tim kèm danh sách tên (đã loại người đang vanish ở phía server).
-- Bản 3 tham số cũ vẫn giữ để tương thích.
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

NOTIFY pgrst, 'reload schema';
SELECT 'ONLINE PLAYERS MIGRATION OK' AS status;
