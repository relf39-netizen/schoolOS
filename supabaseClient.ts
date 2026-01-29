
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://dixmxlukmonjgkphakxc.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpeG14bHVrbW9uamdrcGhha3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzMjgsImV4cCI6MjA4MjA2ODMyOH0.fHdiagrBMaS9NdII13CnSYR96icotrG2syewdSGGV94';

export const isConfigured = supabaseUrl.length > 10 && supabaseAnonKey.length > 10;

export const supabase = isConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export const DATABASE_SQL = `
-- ==========================================
-- 0. ระบบความปลอดภัยสูงสุด
-- ==========================================
CREATE TABLE IF NOT EXISTS super_admins (
  username TEXT PRIMARY KEY,
  password TEXT NOT NULL
);

INSERT INTO super_admins (username, password) 
VALUES ('admin', 'schoolos')
ON CONFLICT (username) DO NOTHING;

-- ==========================================
-- 1. ตารางพื้นฐานระบบ (ข้อมูลโรงเรียนและบุคลากร)
-- ==========================================

-- 1. ตารางโรงเรียน
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT,
  province TEXT,
  lat FLOAT,
  lng FLOAT,
  radius INT DEFAULT 500,
  late_time_threshold TEXT DEFAULT '08:30',
  logo_base_64 TEXT,
  is_suspended BOOLEAN DEFAULT FALSE
);

-- 2. ตารางโปรไฟล์ผู้ใช้งาน
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  password TEXT DEFAULT '123456',
  position TEXT,
  roles TEXT[],
  signature_base_64 TEXT,
  telegram_chat_id TEXT,
  is_suspended BOOLEAN DEFAULT FALSE,
  is_approved BOOLEAN DEFAULT FALSE
);

-- 3. ตารางการตั้งค่าโรงเรียน (API Keys / Config)
CREATE TABLE IF NOT EXISTS school_configs (
  school_id TEXT PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  drive_folder_id TEXT,
  script_url TEXT,
  telegram_bot_token TEXT,
  telegram_bot_username TEXT,
  app_base_url TEXT,
  official_garuda_base_64 TEXT,
  officer_department TEXT,
  internal_departments TEXT[],
  external_agencies TEXT[],
  director_signature_base_64 TEXT,
  director_signature_scale FLOAT DEFAULT 1.0,
  director_signature_y_offset FLOAT DEFAULT 0
);

-- 4. ตารางงานวิชาการ: จำนวนนักเรียน
CREATE TABLE IF NOT EXISTS academic_enrollments (
  id TEXT PRIMARY KEY, -- enroll_{schoolId}_{year}
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  levels JSONB NOT NULL -- เก็บ { "Anuban1": { "m": 0, "f": 0 }, ... }
);

-- 5. ตารางงานวิชาการ: คะแนนสอบเฉลี่ย (RT, NT, O-NET)
CREATE TABLE IF NOT EXISTS academic_test_scores (
  id TEXT PRIMARY KEY, -- score_{schoolId}_{type}_{year}
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  test_type TEXT NOT NULL, -- RT, NT, ONET_P6, ONET_M3
  results JSONB NOT NULL -- เก็บ { "Math": 50.5, ... }
);

-- 6. ตารางงานวิชาการ: ปฏิทินวิชาการ
CREATE TABLE IF NOT EXISTS academic_calendar (
  id BIGSERIAL PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  title TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  description TEXT
);

-- 7. ตารางงานวิชาการ: รายงาน SAR
CREATE TABLE IF NOT EXISTS academic_sar (
  id BIGSERIAL PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  type TEXT NOT NULL, -- BASIC, EARLY_CHILDHOOD
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL
);

-- 8. ตารางงบประมาณรายปี (Action Plan)
CREATE TABLE IF NOT EXISTS budget_settings (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  fiscal_year TEXT,
  subsidy FLOAT DEFAULT 0,
  learner FLOAT DEFAULT 0,
  allow_teacher_proposal BOOLEAN DEFAULT FALSE
);

-- 9. ตารางโครงการในแผนปฏิบัติการ
CREATE TABLE IF NOT EXISTS plan_projects (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  department_name TEXT NOT NULL,
  name TEXT NOT NULL,
  subsidy_budget FLOAT DEFAULT 0,
  learner_dev_budget FLOAT DEFAULT 0,
  actual_expense FLOAT DEFAULT 0,
  status TEXT DEFAULT 'Draft',
  fiscal_year TEXT
);
`;