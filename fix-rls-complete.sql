-- ============================================================
-- Fix RLS: Complete policy reset (profiles + attendance + audit_log)
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor.
-- Drops ALL existing policies and recreates them correctly.
-- ============================================================

-- 1. Recreate the SECURITY DEFINER helper function
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

-- ============================================================
-- PROFILES RLS
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own  ON public.profiles;
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;

-- Non-admin users can only read their own profile
CREATE POLICY profiles_select_own
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Admins can read all profiles (bypasses RLS via is_admin())
CREATE POLICY profiles_select_admin
    ON public.profiles
    FOR SELECT
    USING (public.is_admin());

-- Only admins can insert
CREATE POLICY profiles_insert_admin
    ON public.profiles
    FOR INSERT
    WITH CHECK (public.is_admin());

-- Only admins can update
CREATE POLICY profiles_update_admin
    ON public.profiles
    FOR UPDATE
    USING (public.is_admin());

-- Only admins can delete
CREATE POLICY profiles_delete_admin
    ON public.profiles
    FOR DELETE
    USING (public.is_admin());

-- ============================================================
-- ATTENDANCE RLS
-- ============================================================
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_select_own      ON public.attendance;
DROP POLICY IF EXISTS attendance_select_admin     ON public.attendance;
DROP POLICY IF EXISTS attendance_insert_admin     ON public.attendance;
DROP POLICY IF EXISTS attendance_update_admin     ON public.attendance;
DROP POLICY IF EXISTS attendance_delete_admin     ON public.attendance;
DROP POLICY IF EXISTS attendance_insert_self      ON public.attendance;

-- Employees see only their own attendance
CREATE POLICY attendance_select_own
    ON public.attendance
    FOR SELECT
    USING (auth.uid() = employee_id);

-- Admins see all attendance
CREATE POLICY attendance_select_admin
    ON public.attendance
    FOR SELECT
    USING (public.is_admin());

-- Admins can insert attendance
CREATE POLICY attendance_insert_admin
    ON public.attendance
    FOR INSERT
    WITH CHECK (public.is_admin());

-- Employees can insert their own scan (via RPC which bypasses RLS anyway)
CREATE POLICY attendance_insert_self
    ON public.attendance
    FOR INSERT
    WITH CHECK (auth.uid() = employee_id);

-- Admins can update attendance
CREATE POLICY attendance_update_admin
    ON public.attendance
    FOR UPDATE
    USING (public.is_admin());

-- Admins can delete attendance
CREATE POLICY attendance_delete_admin
    ON public.attendance
    FOR DELETE
    USING (public.is_admin());

-- ============================================================
-- AUDIT_LOG RLS
-- ============================================================
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select_admin ON public.audit_log;
DROP POLICY IF EXISTS audit_log_select_own   ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert_admin ON public.audit_log;

-- Admins can read all audit logs
CREATE POLICY audit_log_select_admin
    ON public.audit_log
    FOR SELECT
    USING (public.is_admin());

-- Employees can read only their own audit logs
CREATE POLICY audit_log_select_own
    ON public.audit_log
    FOR SELECT
    USING (auth.uid() = employee_id);

-- Only admins can insert audit logs
CREATE POLICY audit_log_insert_admin
    ON public.audit_log
    FOR INSERT
    WITH CHECK (public.is_admin());
