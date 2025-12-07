

// Data Models

export enum SystemView {
  DASHBOARD = 'DASHBOARD',
  DOCUMENTS = 'DOCUMENTS',
  LEAVE = 'LEAVE',
  FINANCE = 'FINANCE',
  ATTENDANCE = 'ATTENDANCE',
  PLAN = 'PLAN',
  ADMIN_USERS = 'ADMIN_USERS',
  PROFILE = 'PROFILE' // New View
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
  
  // School Settings
  logoBase64?: string; // Logo specific to this school
  lat?: number;        // Latitude for Attendance
  lng?: number;        // Longitude for Attendance
  radius?: number;     // Allowed radius in meters
  lateTimeThreshold?: string; // Time string e.g., "08:15"
  
  // Academic Year Settings (MM-DD)
  academicYearStart?: string; // e.g. "05-16"
  academicYearEnd?: string;   // e.g. "03-31" or next year "05-15"
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
  teacherPosition?: string; // Snapshot of position at time of request
  type: 'Sick' | 'Personal' | 'OffCampus' | 'Late' | 'Maternity';
  startDate: string;
  endDate: string;
  // For OffCampus or Late
  startTime?: string;
  endTime?: string;
  
  reason: string;
  contactInfo?: string; // Address/Contact info during leave
  mobilePhone?: string; // New: Mobile Phone Number
  status: 'Pending' | 'Approved' | 'Rejected';
  
  // Approval Data
  approvedDate?: string;
  directorSignature?: string; // Director Name
  teacherSignature?: string; // Teacher Name
  createdAt?: string; // ISO String
  
  // Cloud Storage
  evidenceUrl?: string; // URL to the uploaded evidence (e.g. Medical Cert) - User uploaded
  approvedPdfUrl?: string; // URL to the generated PDF with Director Signature - System generated
  attachedFileUrl?: string; // Legacy field, keeping for compatibility
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

// New Interface for Secret Audit Logs
export interface FinanceAuditLog {
  id: string;
  schoolId?: string;
  timestamp: string;
  actorName: string; // Who performed the action
  actionType: 'EDIT' | 'DELETE';
  transactionDescription: string;
  details: string; // Text description of what changed (e.g. "Changed amount from 500 to 1000")
  amountInvolved: number;
}

export interface AttendanceRecord {
  id: string;
  schoolId?: string;
  teacherId: string;
  teacherName: string;
  date: string;
  checkInTime: string;
  checkOutTime: string | null;
  status: 'OnTime' | 'Late' | 'Absent' | 'Leave';
  leaveType?: string; // If status is Leave
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
  signatureBase64?: string; // User's signature for forms
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
  schoolLogoBase64?: string; // Base64 PNG of School Logo / Garuda
  
  // Official Document Logo (Garuda) - New
  officialGarudaBase64?: string;

  // Signature Customization
  directorSignatureScale?: number;    // Scale factor (default 1.0)
  directorSignatureYOffset?: number;  // Vertical offset in pixels (default 0)
}