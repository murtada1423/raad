-- ============================================================
-- Fix: Infinite recursion in RLS policies
-- ============================================================
-- The original policies used:
--   auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
-- This causes infinite recursion because querying profiles
-- inside a profiles policy triggers itself.
--
-- Fix: Use a SECURITY DEFINER helper function that bypasses RLS.
-- ============================================================

-- 1. Create a helper function (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Drop all problematic policies that cause recursion
DROP POLICY IF EXISTS profiles_select_admin  ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_admin  ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin  ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin  ON public.profiles;

DROP POLICY IF EXISTS attendance_select_admin ON public.attendance;
DROP POLICY IF EXISTS attendance_insert_admin ON public.attendance;
DROP POLICY IF EXISTS attendance_update_admin ON public.attendance;
DROP POLICY IF EXISTS attendance_delete_admin ON public.attendance;

-- 3. Re-create policies using the SECURITY DEFINER helper
CREATE POLICY profiles_select_admin
    ON public.profiles
    FOR SELECT
    USING (public.is_admin());

CREATE POLICY profiles_insert_admin
    ON public.profiles
    FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY profiles_update_admin
    ON public.profiles
    FOR UPDATE
    USING (public.is_admin());

CREATE POLICY profiles_delete_admin
    ON public.profiles
    FOR DELETE
    USING (public.is_admin());

CREATE POLICY attendance_select_admin
    ON public.attendance
    FOR SELECT
    USING (public.is_admin());

CREATE POLICY attendance_insert_admin
    ON public.attendance
    FOR INSERT
    WITH CHECK (public.is_admin());

CREATE POLICY attendance_update_admin
    ON public.attendance
    FOR UPDATE
    USING (public.is_admin());

CREATE POLICY attendance_delete_admin
    ON public.attendance
    FOR DELETE
    USING (public.is_admin());
