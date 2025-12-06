

// Data Models

export enum SystemView {
  DASHBOARD = 'DASHBOARD',
  DOCUMENTS = 'DOCUMENTS',
  LEAVE = 'LEAVE',
  FINANCE = 'FINANCE',
  ATTENDANCE = 'ATTENDANCE',
  PLAN = 'PLAN',
  ADMIN_USERS = 'ADMIN_USERS'
}

export type TeacherRole = 
  | 'SYSTEM_ADMIN'      // ผู้ดูแลระบบ (จัดการข้อมูลครู)
  | 'DIRECTOR'          // ผู้อำนวยการ
  | 'DOCUMENT_OFFICER'  // ธุรการ (รับหนังสือ)
  | 'FINANCE_BUDGET'    // การเงิน (งบประมาณ)
  | 'FINANCE_NONBUDGET' // การเงิน (นอกงบ)
  | 'PLAN_OFFICER'      // งานแผน (สร้างโครงการ)
  | 'TEACHER';          // ครูทั่วไป

export interface School {
  id: string;      // รหัสโรงเรียน 8 หลัก เช่น 31030019
  name: string;    // ชื่อโรงเรียน
  district?: string;
  province?: string;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'FILE' | 'LINK'; // FILE = Base64/Storage, LINK = External URL
  url: string; // This holds Base64 for FILE or URL for LINK
  fileType?: string; // MIME type e.g. 'image/png', 'application/pdf'
}

export interface DocumentItem {
  id: string;
  schoolId?: string; // Filter by school
  bookNumber: string; // เลขที่รับหนังสือ เช่น 001/2567
  title: string;
  description: string;
  from: string; // หน่วยงานต้นเรื่อง
  date: string;
  timestamp: string; // เวลาที่รับ
  priority: 'Normal' | 'Urgent' | 'Critical';
  
  // Updated Attachments System
  attachments: Attachment[];

  // Status Tracking
  status: 'PendingDirector' | 'Distributed'; // รอเกษียณ | สั่งการแล้ว
  
  // Director Actions
  directorCommand?: string; // ข้อความเกษียณหนังสือ
  directorSignatureDate?: string;
  signedFileUrl?: string; // URL of the captured image after signing
  targetTeachers: string[]; // IDs of teachers assigned
  
  // Teacher Actions
  acknowledgedBy: string[]; // IDs of teachers who clicked 'Read'
}

export interface LeaveRequest {
  id: string;
  schoolId?: string;
  teacherId: string;
  teacherName: string;
  type: 'Sick' | 'Personal' | 'OffCampus' | 'Late';
  startDate: string;
  endDate: string;
  // For OffCampus or Late
  startTime?: string;
  endTime?: string;
  
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  
  // Approval Data
  approvedDate?: string;
  directorSignature?: string; // Director Name
  teacherSignature?: string; // Teacher Name
}

export interface FinanceAccount {
  id: string;
  schoolId?: string;
  name: string;
  type: 'Budget' | 'NonBudget';
  description?: string;
}

export interface Transaction {
  id: string;
  schoolId?: string;
  accountId: string; // Links to FinanceAccount
  date: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  refDoc?: string; // Optional reference document
}

export interface AttendanceRecord {
  id: string;
  schoolId?: string;
  teacherId: string;
  teacherName: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'OnTime' | 'Late' | 'Absent';
  isAutoCheckout?: boolean; // True if system auto-filled 17:00
  coordinate?: { lat: number; lng: number };
}

export interface Teacher {
  id: string;             // เลขบัตรประชาชน (Username)
  schoolId: string;       // รหัสโรงเรียน
  name: string;
  password?: string;      // Password (hashed or plain for mock)
  position: string;
  roles: TeacherRole[];
  isFirstLogin?: boolean; // True = ต้องเปลี่ยนรหัสผ่าน
}

// --- Action Plan Types ---

export type ProjectStatus = 'Draft' | 'Approved' | 'Completed';

export interface Project {
  id: string;
  name: string;
  budget: number;
  status: ProjectStatus;
  rationale?: string;
}

export interface PlanDepartment {
  id: string;
  schoolId?: string;
  name: string; // e.g., กลุ่มบริหารวิชาการ
  allocatedBudget: number; // เงินที่ได้รับจัดสรร
  projects: Project[];
}

// --- System Configuration ---
export interface SystemConfig {
  driveFolderId: string; // Google Drive Folder ID for uploads
  scriptUrl: string;     // Google Apps Script Web App URL for handling uploads
  schoolName?: string;   // School Name for Headers
  directorSignatureBase64?: string; // Base64 PNG of Director Signature
  
  // Signature Customization
  directorSignatureScale?: number;    // Scale factor (default 1.0)
  directorSignatureYOffset?: number;  // Vertical offset in pixels (default 0)
}