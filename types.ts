
// Data Models

export enum SystemView {
  DASHBOARD = 'DASHBOARD',
  DOCUMENTS = 'DOCUMENTS',
  LEAVE = 'LEAVE',
  FINANCE = 'FINANCE',
  ATTENDANCE = 'ATTENDANCE',
  PLAN = 'PLAN',
  ACADEMIC = 'ACADEMIC',
  ADMIN_USERS = 'ADMIN_USERS',
  PROFILE = 'PROFILE',
  DIRECTOR_CALENDAR = 'DIRECTOR_CALENDAR'
}

export type TeacherRole = 
  | 'SYSTEM_ADMIN'      
  | 'DIRECTOR'          
  | 'VICE_DIRECTOR'      
  | 'DOCUMENT_OFFICER'  
  | 'FINANCE_BUDGET'    
  | 'FINANCE_NONBUDGET' 
  | 'FINANCE_COOP'      // เพิ่มบทบาทเจ้าหน้าที่สหกรณ์
  | 'PLAN_OFFICER'      
  | 'ACADEMIC_OFFICER'  
  | 'TEACHER';          

export interface School {
  id: string;      
  name: string;    
  district?: string;
  province?: string;
  logoBase64?: string; 
  lat?: number;        
  lng?: number;        
  radius?: number;     
  lateTimeThreshold?: string; 
  academicYearStart?: string; 
  academic_year_end?: string;
  isSuspended?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  type: 'FILE' | 'LINK'; 
  url: string; 
  fileType?: string; 
}

export interface DocumentItem {
  id: string;
  schoolId?: string; 
  category?: 'INCOMING' | 'ORDER'; 
  bookNumber: string; 
  title: string;
  description: string;
  from: string; 
  date: string;
  timestamp: string; 
  priority: 'Normal' | 'Urgent' | 'Critical';
  attachments: Attachment[];
  status: 'PendingDirector' | 'PendingViceDirector' | 'Distributed'; 
  directorCommand?: string; 
  directorSignatureDate?: string;
  signedFileUrl?: string; 
  targetTeachers: string[]; 
  assignedViceDirectorId?: string; 
  viceDirectorCommand?: string;
  viceDirectorSignatureDate?: string;
  acknowledgedBy: string[]; 
}

export interface LeaveRequest {
  id: string;
  schoolId: string;
  teacherId: string;
  teacherName: string;
  teacherPosition?: string; 
  type: 'Sick' | 'Personal' | 'OffCampus' | 'Late' | 'Maternity';
  startDate: string;
  endDate: string;
  startTime?: string; 
  endTime?: string;   
  substituteName?: string; 
  reason: string;
  contactInfo?: string; 
  mobilePhone?: string; 
  status: 'Pending' | 'Approved' | 'Rejected';
  approvedDate?: string;
  directorSignature?: string; 
  teacherSignature?: string; 
  createdAt?: string; 
  evidenceUrl?: string; 
  approvedPdfUrl?: string; 
  attachedFileUrl?: string; 
}

export interface DirectorEvent {
  id: string;
  schoolId: string;
  title: string;
  description?: string;
  date: string; 
  startTime: string; 
  endTime?: string;
  location: string;
  createdBy: string; 
  notifiedOneDayBefore?: boolean;
  notifiedOnDay?: boolean;
}

export interface FinanceAccount {
  id: string;
  schoolId?: string;
  name: string;
  type: 'Budget' | 'NonBudget' | 'Coop'; // เพิ่มประเภท Coop (สหกรณ์)
  description?: string;
}

export interface Transaction {
  id: string;
  schoolId?: string;
  accountId: string; 
  date: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  refDoc?: string; 
}

export interface FinanceAuditLog {
  id: string;
  schoolId?: string;
  timestamp: string;
  actorName: string; 
  actionType: 'EDIT' | 'DELETE';
  transactionDescription: string;
  details: string; 
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
  leaveType?: string; 
  isAutoCheckout?: boolean; 
  coordinate?: { lat: number; lng: number };
}

export interface Teacher {
  id: string;             
  schoolId: string;       
  name: string;
  password?: string;      
  position: string;
  roles: TeacherRole[];
  isFirstLogin?: boolean; 
  signatureBase64?: string; 
  telegramChatId?: string; 
  isSuspended?: boolean;
}

export type ProjectStatus = 'Draft' | 'Approved' | 'Completed';

export interface Project {
  id: string;
  name: string;
  subsidyBudget: number; 
  learnerDevBudget: number; 
  actualExpense?: number; 
  status: ProjectStatus;
  rationale?: string;
  fiscalYear?: string; 
}

export interface PlanDepartment {
  id: string;
  schoolId?: string;
  name: string; 
  projects: Project[];
}

export interface EnrollmentData {
  id: string; 
  schoolId: string;
  year: string; 
  levels: {
      [key: string]: { m: number; f: number }; 
  };
}

export type TestType = 'RT' | 'NT' | 'ONET';

export interface TestScoreData {
  id: string; 
  schoolId: string;
  year: string;
  testType: TestType;
  results: {
      [subject: string]: number; 
  };
}

export interface SystemConfig {
  driveFolderId: string; 
  scriptUrl: string;     
  schoolName?: string;   
  directorSignatureBase64?: string; 
  schoolLogoBase64?: string; 
  officialGarudaBase64?: string;
  directorSignatureScale?: number;    
  directorSignatureYOffset?: number;  
  telegramBotToken?: string; 
  appBaseUrl?: string; 
}
