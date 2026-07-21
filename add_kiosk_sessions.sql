CREATE TABLE IF NOT EXISTS public.kiosk_sessions (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT NOT NULL,
    token      TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kiosk_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kiosk_sessions_select ON public.kiosk_sessions;
CREATE POLICY kiosk_sessions_select
    ON public.kiosk_sessions FOR SELECT
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS kiosk_sessions_insert ON public.kiosk_sessions;
CREATE POLICY kiosk_sessions_insert
    ON public.kiosk_sessions FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');
