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
    check_in_time   TEXT NOT NULL DEFAULT '16:00',
    check_out_time  TEXT NOT NULL DEFAULT '00:00',
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 2. ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS public.attendance (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    check_in           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out          TIMESTAMPTZ,
    date               DATE NOT NULL DEFAULT CURRENT_DATE,
    accumulated_minutes NUMERIC(8,2) NOT NULL DEFAULT 0,
    total_hours        NUMERIC(6, 2),
    overtime_minutes   NUMERIC(6, 0) NOT NULL DEFAULT 0,
    penalty_minutes    NUMERIC(6, 0) NOT NULL DEFAULT 0,
    penalty_amount     NUMERIC(10, 0) NOT NULL DEFAULT 0,
    overtime_amount    NUMERIC(10, 0) NOT NULL DEFAULT 0,
    status             TEXT NOT NULL CHECK (status IN ('present', 'late', 'early_checkout'))
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
-- Handles multi-session check-in/check-out within a single day.
-- Uses a SINGLE row per employee per day with accumulated minutes.
-- Penalty:  based on total daily minutes worked, capped at daily_rate.
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
    c_allowed_radius   CONSTANT NUMERIC := 4000;
    c_earth_radius     CONSTANT NUMERIC := 6371000;

    -- work-hour constants
    c_shift_start      CONSTANT TIME := '09:00:00';

    -- computed variables
    v_distance           NUMERIC;
    v_profile            RECORD;
    v_attendance         RECORD;
    v_status             TEXT;
    v_session_minutes    NUMERIC(8,2);
    v_accumulated        NUMERIC(8,2);
    v_total_hours        NUMERIC(6, 2);
    v_overtime_min       NUMERIC(6, 0);
    v_penalty_min        NUMERIC(6, 0);
    v_daily_rate         NUMERIC(10, 2);
    v_minutely_rate      NUMERIC(10, 6);
    v_penalty_amount     NUMERIC(10, 0);
    v_overtime_amount    NUMERIC(10, 0);
    v_check_in           TIMESTAMPTZ;
    v_check_out          TIMESTAMPTZ;
    v_is_first_checkin   BOOLEAN;
BEGIN
    -- ============================================================
    -- 1. Validate QR timestamp
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
    SELECT id, role, required_hours, monthly_salary
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
    -- 4. Find today's attendance row (if any)
    -- ============================================================
    SELECT *
      INTO v_attendance
      FROM public.attendance
     WHERE employee_id = p_user_id
       AND date = CURRENT_DATE
     ORDER BY check_in DESC
     LIMIT 1;

    -- ============================================================
    -- 5a. Row does NOT exist → FIRST CHECK-IN today
    -- ============================================================
    IF NOT FOUND THEN
        v_is_first_checkin := true;
        v_check_in := NOW();

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
            'check_in',       v_check_in,
            'session',        1
        );
    END IF;

    -- ============================================================
    -- 5b. Row exists with check_out IS NULL → CHECK-OUT
    -- ============================================================
    IF v_attendance.check_out IS NULL THEN
        v_check_in  := v_attendance.check_in;
        v_check_out := NOW();

        -- Minutes worked in this session
        v_session_minutes := ROUND(
            EXTRACT(EPOCH FROM (v_check_out - v_check_in)) / 60.0,
            2
        );

        -- Accumulated minutes = previous accumulated + this session
        v_accumulated := COALESCE(v_attendance.accumulated_minutes, 0) + v_session_minutes;
        v_total_hours := ROUND(v_accumulated / 60.0, 2);

        -- Financial constants
        v_daily_rate    := COALESCE(v_profile.monthly_salary, 0) / 30.0;
        v_minutely_rate := v_daily_rate / (v_profile.required_hours * 60.0);

        -- Calculate penalty / overtime based on TOTAL accumulated minutes
        IF v_total_hours >= v_profile.required_hours THEN
            -- Employee met or exceeded requirement → overtime only
            v_overtime_min := ROUND((v_total_hours - v_profile.required_hours) * 60, 0)::NUMERIC(6,0);
            v_penalty_min  := 0;
            v_overtime_amount := ROUND(v_overtime_min * v_minutely_rate);
            v_penalty_amount  := 0;
        ELSE
            -- Employee is short → penalty (no overtime)
            v_overtime_min    := 0;
            v_overtime_amount := 0;
            v_penalty_min := ROUND((v_profile.required_hours * 60 - v_accumulated), 0)::NUMERIC(6,0);
            -- Financial penalty = missing_minutes * minutely_rate, capped at daily_rate
            v_penalty_amount := LEAST(
                ROUND(v_penalty_min * v_minutely_rate),
                ROUND(v_daily_rate)
            );
        END IF;

        -- Status: penalty > 0 means early checkout
        IF v_penalty_min > 0 THEN
            v_status := 'early_checkout';
        ELSE
            v_status := v_attendance.status;
        END IF;

        -- Update the existing daily row
        UPDATE public.attendance
           SET check_out           = v_check_out,
               accumulated_minutes = v_accumulated,
               total_hours         = v_total_hours,
               overtime_minutes    = v_overtime_min,
               penalty_minutes     = v_penalty_min,
               penalty_amount      = v_penalty_amount,
               overtime_amount     = v_overtime_amount,
               status              = v_status
         WHERE id = v_attendance.id;

        RETURN jsonb_build_object(
            'success',           true,
            'action',            'check_out',
            'attendance_id',     v_attendance.id,
            'accumulated_min',   v_accumulated,
            'total_hours',       v_total_hours,
            'overtime_minutes',  v_overtime_min,
            'penalty_minutes',   v_penalty_min,
            'penalty_amount',    v_penalty_amount,
            'overtime_amount',   v_overtime_amount,
            'status',            v_status,
            'check_in',          v_check_in,
            'check_out',         v_check_out
        );
    END IF;

    -- ============================================================
    -- 5c. Row exists with check_out IS NOT NULL → RE-CHECK-IN
    -- ============================================================
    -- Start a new session in the same daily row
    v_check_in := NOW();

    -- Keep the original check-in status (don't change to 'late' for re-entries)
    v_status := v_attendance.status;

    UPDATE public.attendance
       SET check_in  = v_check_in,
           check_out = NULL
     WHERE id = v_attendance.id;

    RETURN jsonb_build_object(
        'success',        true,
        'action',         'check_in',
        'attendance_id',  v_attendance.id,
        'status',         v_status,
        'check_in',       v_check_in,
        'session',        2
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success',      false,
            'error',        SQLERRM
        );
END;
$$;
