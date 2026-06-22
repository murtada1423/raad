-- ============================================================
-- MIGRATION: Enforce ONE attendance row per employee per day
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor.
-- 0. Creates office_settings table for dynamic geofencing
-- 1. Removes duplicate rows (keeps latest check_in per date)
-- 2. Adds UNIQUE (employee_id, date) constraint
-- 3. Recreates the stored function with race-condition protection
--    + business-day offset for late-night shifts (00:00-04:00)
--    + dynamic geofence from office_settings table
-- ============================================================

-- STEP 0: Create office_settings table (single-row config)
CREATE TABLE IF NOT EXISTS public.office_settings (
    id                    INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    latitude              NUMERIC NOT NULL DEFAULT 33.365481,
    longitude             NUMERIC NOT NULL DEFAULT 44.531729,
    allowed_radius_meters INT NOT NULL DEFAULT 50,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.office_settings (id, latitude, longitude, allowed_radius_meters)
VALUES (1, 33.365481, 44.531729, 50)
ON CONFLICT (id) DO NOTHING;

-- STEP 1: Clean old duplicate rows — keep the one with the latest check_in
DELETE FROM public.attendance a
WHERE a.id IN (
    SELECT a1.id FROM public.attendance a1
    INNER JOIN public.attendance a2
        ON  a2.employee_id = a1.employee_id
        AND a2.date        = a1.date
        AND a2.check_in    > a1.check_in
);

-- STEP 2: Add unique constraint (safe now that duplicates are gone)
ALTER TABLE public.attendance
    DROP CONSTRAINT IF EXISTS attendance_employee_date_unique;

ALTER TABLE public.attendance
    ADD CONSTRAINT attendance_employee_date_unique
    UNIQUE (employee_id, date);

-- STEP 3: Recreate the function with business-day offset + dynamic geofence
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
    -- (0) Advisory lock serializes concurrent scans
    PERFORM pg_advisory_xact_lock(hashtext('att_scan_' || p_user_id::text));

    -- (1) Validate QR timestamp
    IF p_qr_timestamp IS NULL
       OR p_qr_timestamp < NOW() - INTERVAL '5 seconds'
       OR p_qr_timestamp > NOW() + INTERVAL '1 second'
    THEN
        RETURN jsonb_build_object('success', false, 'error', 'QR code expired or invalid timestamp');
    END IF;

    -- (2) Fetch office geofence settings dynamically
    SELECT latitude, longitude, allowed_radius_meters
      INTO v_office_lat, v_office_lng, v_allowed_radius
      FROM public.office_settings
     WHERE id = 1;

    IF NOT FOUND THEN
        v_office_lat     := 33.365481;
        v_office_lng     := 44.531729;
        v_allowed_radius := 50;
    END IF;

    -- (3) Geofencing — Haversine distance check
    v_distance := c_earth_radius * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(p_lat - v_office_lat) / 2), 2)
        + COS(RADIANS(v_office_lat))
        * COS(RADIANS(p_lat))
        * POWER(SIN(RADIANS(p_lng - v_office_lng) / 2), 2)
    ));

    IF v_distance > v_allowed_radius THEN
        RETURN jsonb_build_object('success', false, 'error', 'Outside geofence — you must be at the office', 'distance', ROUND(v_distance, 1));
    END IF;

    -- (4) Fetch employee profile
    SELECT id, role, required_hours, monthly_salary INTO v_profile
      FROM public.profiles WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Employee profile not found');
    END IF;

    -- (5) Compute effective business date
    IF NOW()::TIME < '04:00:00'::TIME THEN
        v_effective_date := CURRENT_DATE - 1;
    ELSE
        v_effective_date := CURRENT_DATE;
    END IF;

    -- (6) Find row for effective business date (max 1 per employee+date)
    SELECT * INTO v_attendance
      FROM public.attendance
     WHERE employee_id = p_user_id AND date = v_effective_date;

    v_is_new_row := NOT FOUND;

    -- (7a) FIRST CHECK-IN for this business day
    IF v_is_new_row THEN
        v_check_in := NOW();
        v_status := CASE WHEN v_check_in::TIME > c_shift_start THEN 'late' ELSE 'present' END;

        INSERT INTO public.attendance (employee_id, check_in, date, status)
        VALUES (p_user_id, v_check_in, v_effective_date, v_status)
        ON CONFLICT (employee_id, date) DO NOTHING
        RETURNING * INTO v_attendance;

        IF v_attendance.id IS NULL THEN
            SELECT * INTO v_attendance
              FROM public.attendance
             WHERE employee_id = p_user_id AND date = v_effective_date;
        END IF;

        RETURN jsonb_build_object(
            'success', true, 'action', 'check_in',
            'attendance_id', v_attendance.id,
            'status', v_attendance.status,
            'check_in', v_attendance.check_in
        );
    END IF;

    -- (7b) CHECK-OUT — calculates session duration (handles midnight crossing)
    IF v_attendance.check_out IS NULL THEN
        v_check_in  := v_attendance.check_in;
        v_check_out := NOW();

        v_session_minutes := ROUND(EXTRACT(EPOCH FROM (v_check_out - v_check_in)) / 60.0, 2);
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
            v_penalty_amount := LEAST(ROUND(v_penalty_min * v_minutely_rate), ROUND(v_daily_rate));
        END IF;

        v_status := CASE WHEN v_penalty_min > 0 THEN 'early_checkout' ELSE v_attendance.status END;

        UPDATE public.attendance
           SET check_out = v_check_out,
               accumulated_minutes = v_accumulated,
               total_hours = v_total_hours,
               overtime_minutes = v_overtime_min,
               penalty_minutes = v_penalty_min,
               penalty_amount = v_penalty_amount,
               overtime_amount = v_overtime_amount,
               status = v_status
         WHERE id = v_attendance.id;

        RETURN jsonb_build_object(
            'success', true, 'action', 'check_out',
            'attendance_id', v_attendance.id,
            'accumulated_min', v_accumulated,
            'total_hours', v_total_hours,
            'overtime_minutes', v_overtime_min,
            'penalty_minutes', v_penalty_min,
            'penalty_amount', v_penalty_amount,
            'overtime_amount', v_overtime_amount,
            'status', v_status,
            'check_in', v_check_in,
            'check_out', v_check_out
        );
    END IF;

    -- (7c) RE-CHECK-IN
    v_check_in := NOW();
    v_status   := v_attendance.status;

    UPDATE public.attendance
       SET check_in = v_check_in, check_out = NULL
     WHERE id = v_attendance.id;

    RETURN jsonb_build_object(
        'success', true, 'action', 'check_in',
        'attendance_id', v_attendance.id,
        'status', v_status,
        'check_in', v_check_in
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
