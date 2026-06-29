-- ============================================================
-- Fix: Create missing profiles for all existing auth users
-- ============================================================
-- Run this ONCE in the Supabase SQL Editor.
-- Creates a profile row for every auth.users entry that
-- doesn't already have one, assigning role='employee' by
-- default. After running, log in as the admin/owner, then
-- promote yourself to admin via the profiles table.
-- ============================================================

INSERT INTO public.profiles (id, full_name, role, monthly_salary, required_hours, check_in_time, check_out_time)
SELECT
    au.id,
    COALESCE(au.raw_user_meta_data->>'full_name', 'مستخدم ' || substring(au.id::text, 1, 8)) AS full_name,
    'employee' AS role,
    450000 AS monthly_salary,
    8 AS required_hours,
    '16:00' AS check_in_time,
    '00:00' AS check_out_time
FROM auth.users au
WHERE au.id NOT IN (SELECT id FROM public.profiles);

-- ============================================================
-- OPTIONAL: If you know the admin's email, uncomment and run:
-- ============================================================
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
