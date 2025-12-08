

import { DocumentItem, LeaveRequest, Transaction, Teacher, FinanceAccount, AttendanceRecord, PlanDepartment, School } from './types';

// Configuration
// Default location if school setting is missing
export const DEFAULT_LOCATION = {
    lat: 13.736717, 
    lng: 100.523186,
    allowedRadiusMeters: 500
};

// Calculate Current Thai Year Dynamically (YYYY + 543)
export const CURRENT_SCHOOL_YEAR = String(new Date().getFullYear() + 543);

// Positions List (Updated as requested)
export const ACADEMIC_POSITIONS = [
    "เจ้าหน้าที่ธุรการ",
    "นักการภารโรง",
    "พนักงานราชการ",
    "ครูผู้ช่วย",
    "ครู",
    "ครูชำนาญการ",
    "ครูชำนาญการพิเศษ",
    "ครูเชี่ยวชาญ",
    "ครูเชี่ยวชาญพิเศษ",
    "รองผู้อำนวยการโรงเรียน",
    "ผู้อำนวยการโรงเรียน"
];

// Mock Schools
export const MOCK_SCHOOLS: School[] = [
    { 
        id: '31030019', 
        name: 'โรงเรียนบ้านโคกหลวงพ่อ', 
        district: 'เมือง', 
        province: 'กรุงเทพฯ',
        lat: 13.736717,
        lng: 100.523186,
        radius: 500
    },
    { 
        id: '10000001', 
        name: 'โรงเรียนตัวอย่างวิทยา', 
        district: 'เมือง', 
        province: 'เชียงใหม่',
        lat: 18.7883,
        lng: 98.9853,
        radius: 300
    }
];

// Mock Teachers (Updated with schoolId and password)
// Password '123456'
export const MOCK_TEACHERS: Teacher[] = [
    { 
        id: '1111111111111', 
        schoolId: '31030019',
        name: 'ครูสมชาย ใจดี', 
        position: 'ครูชำนาญการ',
        roles: ['TEACHER', 'SYSTEM_ADMIN'],
        password: 'password', // Already changed
        isFirstLogin: false
    },
    { 
        id: 'dir_001', 
        schoolId: '31030019',
        name: 'นายอำนวย การดี', 
        position: 'ผู้อำนวยการโรงเรียน',
        roles: ['DIRECTOR'],
        password: 'password',
        isFirstLogin: false
    },
    { 
        id: 'admin_001', 
        schoolId: '99999999', // Super Admin ID
        name: 'Super Admin', 
        position: 'System Administrator',
        roles: ['SYSTEM_ADMIN'],
        password: 'admin',
        isFirstLogin: false
    },
];

export const MOCK_DOCUMENTS: DocumentItem[] = [
    { 
        id: '1', 
        schoolId: '31030019',
        bookNumber: '045/2567',
        title: 'แจ้งกำหนดการประชุมครูประจำเดือน', 
        description: 'ขอเรียนเชิญคณะครูเข้าร่วมประชุมเพื่อเตรียมความพร้อม...', 
        from: 'สพฐ.', 
        date: '2023-10-25', 
        timestamp: '09:30',
        priority: 'Normal',
        attachments: [
            { id: 'a1', name: 'กำหนดการประชุม.pdf', type: 'FILE', url: '', fileType: 'application/pdf' }
        ],
        status: 'PendingDirector',
        targetTeachers: [],
        acknowledgedBy: []
    },
    { 
        id: '2', 
        schoolId: '31030019',
        bookNumber: '046/2567',
        title: 'มาตรการป้องกันโรคระบาดในโรงเรียน', 
        description: 'แนวทางปฏิบัติสำหรับครูและนักเรียนในช่วงระบาด...', 
        from: 'กระทรวงสาธารณสุข', 
        date: '2023-10-24', 
        timestamp: '10:15',
        priority: 'Critical',
        attachments: [
             { id: 'a2', name: 'คู่มือแนวทางปฏิบัติ.pdf', type: 'FILE', url: '', fileType: 'application/pdf' },
             { id: 'a3', name: 'โปสเตอร์ประชาสัมพันธ์.jpg', type: 'FILE', url: 'https://via.placeholder.com/800x1100.png?text=Cover+Image+Example', fileType: 'image/jpeg' }
        ],
        status: 'Distributed',
        directorCommand: 'ทราบ แจ้งครูทุกท่านปฏิบัติตามอย่างเคร่งครัด',
        directorSignatureDate: '2023-10-24 10:30',
        targetTeachers: ['1111111111111', 't2', 't_plan'],
        acknowledgedBy: ['t2'] 
    },
];

export const MOCK_LEAVE_REQUESTS: LeaveRequest[] = [
    { 
        id: '1', 
        schoolId: '31030019',
        teacherId: '1111111111111',
        teacherName: 'ครูสมชาย ใจดี',
        type: 'Sick', 
        startDate: '2023-09-15', 
        endDate: '2023-09-16', 
        reason: 'ไข้หวัดใหญ่', 
        status: 'Approved',
        teacherSignature: 'สมชาย ใจดี',
        directorSignature: 'นายอำนวย การดี',
        approvedDate: '2023-09-15'
    }
];

// Finance Mocks
export const MOCK_ACCOUNTS: FinanceAccount[] = [
    { id: 'acc_1', schoolId: '31030019', name: 'เงินอุดหนุนรายหัว', type: 'Budget' },
    { id: 'acc_2', schoolId: '31030019', name: 'เงินอาหารกลางวัน', type: 'Budget' },
    { id: 'acc_non_1', schoolId: '31030019', name: 'เงินรายได้สถานศึกษา (ทั่วไป)', type: 'NonBudget' },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
    // Budget
    { id: '1', schoolId: '31030019', accountId: 'acc_1', date: '2023-10-01', description: 'รับจัดสรรงบประมาณ งวดที่ 1', amount: 500000, type: 'Income' },
    { id: '2', schoolId: '31030019', accountId: 'acc_2', date: '2023-10-02', description: 'รับเงินค่าอาหารกลางวัน', amount: 150000, type: 'Income' },
];

export const MOCK_ATTENDANCE_HISTORY: AttendanceRecord[] = [
    { id: 'a1', schoolId: '31030019', teacherId: '1111111111111', teacherName: 'ครูสมชาย ใจดี', date: '2023-10-24', checkInTime: '07:45', checkOutTime: '16:40', status: 'OnTime' },
];

// Plan Mocks
export const MOCK_PLAN_DATA: PlanDepartment[] = [
    {
        id: 'dept_1',
        schoolId: '31030019',
        name: 'กลุ่มบริหารวิชาการ',
        allocatedBudget: 150000,
        projects: [
            { id: 'p1', name: 'โครงการพัฒนาหลักสูตร', budget: 50000, status: 'Approved' }
        ]
    }
];