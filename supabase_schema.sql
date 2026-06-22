-- ============================================================
-- Attendance & Payroll Management System — Supabase DDL
-- ============================================================
-- Run this entire script in the Supabase SQL Editor.
-- ============================================================

-- 0. EXTENSION (ensure pgcrypto for gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES TABLE (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
    monthly_salary  NUMERIC(12, 2) NOT NULL DEFAULT 450000,
    required_hours  NUMERIC(4, 1)  NOT NULL DEFAULT 8.0,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 2. ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.attendance (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    check_in         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out        TIMESTAMPTZ,
    date             DATE NOT NULL DEFAULT CURRENT_DATE,
    total_hours      NUMERIC(6, 2),
    overtime_minutes NUMERIC(6, 0) NOT NULL DEFAULT 0,
    penalty_minutes  NUMERIC(6, 0) NOT NULL DEFAULT 0,
    status           TEXT NOT NULL CHECK (status IN ('present', 'late', 'early_checkout'))
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
    ON public.attendance(employee_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_checkout_null
    ON public.attendance(employee_id)
    WHERE check_out IS NULL;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- 3a. PROFILES RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read their own profile
CREATE POLICY profiles_select_own
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Admins can read all profiles
CREATE POLICY profiles_select_admin
    ON public.profiles
    FOR SELECT
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

-- Only admins can insert / update / delete profiles
CREATE POLICY profiles_insert_admin
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

CREATE POLICY profiles_update_admin
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

CREATE POLICY profiles_delete_admin
    ON public.profiles
    FOR DELETE
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

-- 3b. ATTENDANCE RLS
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Employees see only their own attendance
CREATE POLICY attendance_select_own
    ON public.attendance
    FOR SELECT
    USING (auth.uid() = employee_id);

-- Admins see all attendance
CREATE POLICY attendance_select_admin
    ON public.attendance
    FOR SELECT
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

-- Admins can insert / update / delete any attendance
CREATE POLICY attendance_insert_admin
    ON public.attendance
    FOR INSERT
    WITH CHECK (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

CREATE POLICY attendance_update_admin
    ON public.attendance
    FOR UPDATE
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

CREATE POLICY attendance_delete_admin
    ON public.attendance
    FOR DELETE
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

-- Allow the SECURITY DEFINER function to bypass RLS by creating
-- a policy that lets authenticated users insert their own scan.
-- The function runs as the owner and is not affected by this policy,
-- but we keep it for direct inserts from the client if ever needed.
CREATE POLICY attendance_insert_self
    ON public.attendance
    FOR INSERT
    WITH CHECK (auth.uid() = employee_id);

-- ============================================================
-- STORED FUNCTION: process_attendance_scan
-- ============================================================
-- Parameters:
--   p_user_id      UUID     – the employee scanning the QR
--   p_lat          NUMERIC  – GPS latitude from the scan
--   p_lng          NUMERIC  – GPS longitude from the scan
--   p_qr_timestamp TIMESTAMPTZ – timestamp embedded in the QR code
--
-- Returns: JSONB   – result payload
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_attendance_scan(
    p_user_id      UUID,
    p_lat          NUMERIC,
    p_lng          NUMERIC,
    p_qr_timestamp TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- office geofence constants
    c_office_lat       CONSTANT NUMERIC := 33.365481;
    c_office_lng       CONSTANT NUMERIC := 44.531729;
    c_allowed_radius   CONSTANT NUMERIC := 4000;      -- meters (4 km)
    c_earth_radius     CONSTANT NUMERIC := 6371000;    -- meters

    -- work-hour constants
    c_shift_start      CONSTANT TIME := '09:00:00';    -- workday start

    -- computed variables
    v_distance          NUMERIC;
    v_profile           RECORD;
    v_attendance        RECORD;
    v_action            TEXT;
    v_status            TEXT;
    v_total_hours       NUMERIC(6, 2);
    v_overtime_min      NUMERIC(6, 0);
    v_penalty_min       NUMERIC(6, 0);
    v_check_in          TIMESTAMPTZ;
    v_check_out         TIMESTAMPTZ;
BEGIN
    -- ============================================================
    -- 1. Validate QR timestamp (must be within last 5 seconds)
    -- ============================================================
    IF p_qr_timestamp IS NULL
       OR p_qr_timestamp < NOW() - INTERVAL '5 seconds'
       OR p_qr_timestamp > NOW() + INTERVAL '1 second'
    THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'QR code expired or invalid timestamp'
        );
    END IF;

    -- ============================================================
    -- 2. Geofencing — Haversine distance check
    -- ============================================================
    v_distance := c_earth_radius * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p_lat - c_office_lat) / 2), 2)
        + COS(RADIANS(c_office_lat))
        * COS(RADIANS(p_lat))
        * POWER(SIN(RADIANS(p_lng - c_office_lng) / 2), 2)
    ));

    IF v_distance > c_allowed_radius THEN
        RETURN jsonb_build_object(
            'success',  false,
            'error',    'Outside geofence — you must be at the office',
            'distance', ROUND(v_distance, 1)
        );
    END IF;

    -- ============================================================
    -- 3. Fetch employee profile
    -- ============================================================
    SELECT id, role, required_hours
      INTO v_profile
      FROM public.profiles
     WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   'Employee profile not found'
        );
    END IF;

    -- ============================================================
    -- 4. Look for an open (check-in without check-out) record today
    -- ============================================================
    SELECT *
      INTO v_attendance
      FROM public.attendance
     WHERE employee_id = p_user_id
       AND date = CURRENT_DATE
       AND check_out IS NULL
     ORDER BY check_in DESC
     LIMIT 1;

    -- ============================================================
    -- 5a. NO open record → CHECK-IN
    -- ============================================================
    IF NOT FOUND THEN
        v_check_in := NOW();

        -- Determine status: 'late' if after shift start, else 'present'
        IF v_check_in::TIME > c_shift_start THEN
            v_status := 'late';
        ELSE
            v_status := 'present';
        END IF;

        INSERT INTO public.attendance
            (employee_id, check_in, date, status)
        VALUES
            (p_user_id, v_check_in, CURRENT_DATE, v_status)
        RETURNING id INTO v_attendance;

        RETURN jsonb_build_object(
            'success',        true,
            'action',         'check_in',
            'attendance_id',  v_attendance.id,
            'status',         v_status,
            'check_in',       v_check_in
        );
    END IF;

    -- ============================================================
    -- 5b. Open record exists → CHECK-OUT
    -- ============================================================
    v_check_in   := v_attendance.check_in;
    v_check_out  := NOW();

    -- Total hours worked (up to 2 decimal places)
    v_total_hours := ROUND(
        EXTRACT(EPOCH FROM (v_check_out - v_check_in)) / 3600.0,
        2
    );

    -- Overtime / penalty calculation
    IF v_total_hours > v_profile.required_hours THEN
        v_overtime_min := ROUND(
            (v_total_hours - v_profile.required_hours) * 60, 0
        )::NUMERIC(6, 0);
        v_penalty_min  := 0;
    ELSIF v_total_hours < v_profile.required_hours THEN
        v_overtime_min := 0;
        v_penalty_min  := ROUND(
            (v_profile.required_hours - v_total_hours) * 60, 0
        )::NUMERIC(6, 0);
    ELSE
        v_overtime_min := 0;
        v_penalty_min  := 0;
    END IF;

    -- Final status:
    --   If left before completing required_hours → 'early_checkout'
    --   Otherwise keep whatever check-in status was ('late' or 'present')
    IF v_penalty_min > 0 THEN
        v_status := 'early_checkout';
    ELSE
        v_status := v_attendance.status;
    END IF;

    -- Update the attendance row
    UPDATE public.attendance
       SET check_out        = v_check_out,
           total_hours      = v_total_hours,
           overtime_minutes = v_overtime_min,
           penalty_minutes  = v_penalty_min,
           status           = v_status
     WHERE id = v_attendance.id;

    RETURN jsonb_build_object(
        'success',          true,
        'action',           'check_out',
        'attendance_id',    v_attendance.id,
        'total_hours',      v_total_hours,
        'overtime_minutes', v_overtime_min,
        'penalty_minutes',  v_penalty_min,
        'status',           v_status,
        'check_in',         v_check_in,
        'check_out',        v_check_out
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success',      false,
            'error',        SQLERRM
        );
END;
$$;
