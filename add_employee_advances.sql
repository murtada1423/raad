-- Create monthly advance tracking table
CREATE TABLE IF NOT EXISTS public.employee_advances (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount       NUMERIC(12, 0) NOT NULL DEFAULT 0,
    month        INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    year         INT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, month, year)
);

ALTER TABLE public.employee_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_advances_select ON public.employee_advances;
CREATE POLICY employee_advances_select
    ON public.employee_advances FOR SELECT
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
           OR auth.uid() = employee_id);

DROP POLICY IF EXISTS employee_advances_insert ON public.employee_advances;
CREATE POLICY employee_advances_insert
    ON public.employee_advances FOR INSERT
    WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

DROP POLICY IF EXISTS employee_advances_update ON public.employee_advances;
CREATE POLICY employee_advances_update
    ON public.employee_advances FOR UPDATE
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Remove old profiles column if it exists (moved to separate table)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS advance_amount;
