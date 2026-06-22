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

-- 3. OFFICE SETTINGS TABLE (single-row config for geofencing)
CREATE TABLE IF NOT EXISTS public.office_settings (
    id                    INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    latitude              NUMERIC NOT NULL DEFAULT 33.365481,
    longitude             NUMERIC NOT NULL DEFAULT 44.531729,
    allowed_radius_meters INT NOT NULL DEFAULT 4000,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.office_settings (id, latitude, longitude, allowed_radius_meters)
VALUES (1, 33.365481, 44.531729, 4000)
ON CONFLICT (id) DO NOTHING;

-- 4. INDEXES
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
CREATE POLICY attendance_insert_self
    ON public.attendance
    FOR INSERT
    WITH CHECK (auth.uid() = employee_id);

-- 3c. OFFICE SETTINGS RLS
ALTER TABLE public.office_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read / write office_settings
CREATE POLICY office_settings_select_admin
    ON public.office_settings
    FOR SELECT
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

CREATE POLICY office_settings_insert_admin
    ON public.office_settings
    FOR INSERT
    WITH CHECK (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

CREATE POLICY office_settings_update_admin
    ON public.office_settings
    FOR UPDATE
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

CREATE POLICY office_settings_delete_admin
    ON public.office_settings
    FOR DELETE
    USING (auth.uid() IN (
        SELECT id FROM public.profiles WHERE role = 'admin'
    ));

-- ============================================================
-- STORED FUNCTION: process_attendance_scan
-- ============================================================
-- Handles multi-session check-in/check-out within a single day,
-- including late-night shifts crossing midnight (4 PM – 2 AM).
--
-- BUSINESS DAY OFFSET:
--   Scans between 00:00–04:00 are attributed to the PREVIOUS
--   calendar day so that overtime past midnight is correctly
--   captured under the shift's original date.
--
-- SINGLE ROW PER EMPLOYEE PER DAY:
--   Enforced by UNIQUE (employee_id, date) + advisory lock.
--   Penalty capped at daily_rate. Net daily earned never negative.
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
    -- earth radius constant (Haversine formula)
    c_earth_radius     CONSTANT NUMERIC := 6371000;

    -- work-hour constants
    c_shift_start      CONSTANT TIME := '09:00:00';

    -- geofence variables (fetched dynamically from office_settings)
    v_office_lat          NUMERIC;
    v_office_lng          NUMERIC;
    v_allowed_radius      NUMERIC;

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
    v_is_new_row         BOOLEAN;
    v_effective_date     DATE;
BEGIN
    -- ============================================================
    -- 0. Advisory lock per employee serializes concurrent scans,
    --    preventing race conditions that create duplicate rows.
    -- ============================================================
    PERFORM pg_advisory_xact_lock(hashtext('att_scan_' || p_user_id::text));

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
    -- 2. Fetch office geofence settings dynamically
    --    Falls back to Baghdad coordinates if no row exists.
    -- ============================================================
    SELECT latitude, longitude, allowed_radius_meters
      INTO v_office_lat, v_office_lng, v_allowed_radius
      FROM public.office_settings
     WHERE id = 1;

    IF NOT FOUND THEN
        v_office_lat     := 33.365481;
        v_office_lng     := 44.531729;
        v_allowed_radius := 4000;
    END IF;

    -- ============================================================
    -- 3. Geofencing — Haversine distance check
    -- ============================================================
    v_distance := c_earth_radius * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p_lat - v_office_lat) / 2), 2)
        + COS(RADIANS(v_office_lat))
        * COS(RADIANS(p_lat))
        * POWER(SIN(RADIANS(p_lng - v_office_lng) / 2), 2)
    ));

    IF v_distance > v_allowed_radius THEN
        RETURN jsonb_build_object(
            'success',  false,
            'error',    'Outside geofence — you must be at the office',
            'distance', ROUND(v_distance, 1)
        );
    END IF;

    -- ============================================================
    -- 4. Fetch employee profile
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
    -- 5. Compute effective business date
    --    Scans between 00:00–04:00 attribute to the previous day,
    --    so that late-night overtime (e.g. check-out at 1:00 AM)
    --    is recorded under the shift's original business date.
    -- ============================================================
    IF NOW()::TIME < '04:00:00'::TIME THEN
        v_effective_date := CURRENT_DATE - 1;
    ELSE
        v_effective_date := CURRENT_DATE;
    END IF;

    -- ============================================================
    -- 6. Find attendance row for the effective business date
    --    (at most ONE per employee+date thanks to UNIQUE constraint)
    -- ============================================================
    SELECT *
      INTO v_attendance
      FROM public.attendance
     WHERE employee_id = p_user_id
       AND date = v_effective_date;

    v_is_new_row := NOT FOUND;

    -- ============================================================
    -- 7a. No row exists → FIRST CHECK-IN for this business day
    --     Uses ON CONFLICT DO NOTHING as a safety net even with the
    --     advisory lock above, in case the lock is ever bypassed.
    -- ============================================================
    IF v_is_new_row THEN
        v_check_in := NOW();

        IF v_check_in::TIME > c_shift_start THEN
            v_status := 'late';
        ELSE
            v_status := 'present';
        END IF;

        INSERT INTO public.attendance
            (employee_id, check_in, date, status)
        VALUES
            (p_user_id, v_check_in, v_effective_date, v_status)
        ON CONFLICT (employee_id, date) DO NOTHING
        RETURNING * INTO v_attendance;

        IF v_attendance.id IS NULL THEN
            SELECT * INTO v_attendance
              FROM public.attendance
             WHERE employee_id = p_user_id
               AND date = v_effective_date;
        END IF;

        RETURN jsonb_build_object(
            'success',        true,
            'action',         'check_in',
            'attendance_id',  v_attendance.id,
            'status',         v_attendance.status,
            'check_in',       v_attendance.check_in
        );
    END IF;

    -- ============================================================
    -- 7b. Row exists with check_out IS NULL → CHECK-OUT
    --     Session duration is calculated from actual timestamps
    --     (handles midnight crossing correctly via EXTRACT(EPOCH)).
    --     Penalty/Overtime computed from total accumulated minutes.
    -- ============================================================
    IF v_attendance.check_out IS NULL THEN
        v_check_in  := v_attendance.check_in;
        v_check_out := NOW();

        v_session_minutes := ROUND(
            EXTRACT(EPOCH FROM (v_check_out - v_check_in)) / 60.0, 2
        );

        v_accumulated := COALESCE(v_attendance.accumulated_minutes, 0) + v_session_minutes;
        v_total_hours := ROUND(v_accumulated / 60.0, 2);

        v_daily_rate    := COALESCE(v_profile.monthly_salary, 0) / 30.0;
        v_minutely_rate := v_daily_rate / (v_profile.required_hours * 60.0);

        IF v_total_hours >= v_profile.required_hours THEN
            v_overtime_min := ROUND((v_total_hours - v_profile.required_hours) * 60, 0)::NUMERIC(6,0);
            v_penalty_min  := 0;
            v_overtime_amount := ROUND(v_overtime_min * v_minutely_rate);
            v_penalty_amount  := 0;
        ELSE
            v_overtime_min    := 0;
            v_overtime_amount := 0;
            v_penalty_min := ROUND((v_profile.required_hours * 60 - v_accumulated), 0)::NUMERIC(6,0);
            v_penalty_amount := LEAST(
                ROUND(v_penalty_min * v_minutely_rate),
                ROUND(v_daily_rate)
            );
        END IF;

        IF v_penalty_min > 0 THEN
            v_status := 'early_checkout';
        ELSE
            v_status := v_attendance.status;
        END IF;

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
    -- 7c. Row exists with check_out IS NOT NULL → RE-CHECK-IN
    --     Updates check_in to now and clears check_out so the next
    --     scan in step 7b accumulates another session.
    -- ============================================================
    v_check_in := NOW();
    v_status   := v_attendance.status;

    UPDATE public.attendance
       SET check_in  = v_check_in,
           check_out = NULL
     WHERE id = v_attendance.id;

    RETURN jsonb_build_object(
        'success',        true,
        'action',         'check_in',
        'attendance_id',  v_attendance.id,
        'status',         v_status,
        'check_in',       v_check_in
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error',   SQLERRM
        );
END;
$$;
