
import React, { useState, useEffect } from 'react';
import { LeaveRequest, Teacher, School, SystemConfig } from '../types';
import { 
    Clock, CheckCircle, FilePlus, UserCheck, Printer, 
    ArrowLeft, Loader, Database, Search, Trash2, 
    BarChart, ChevronRight, RefreshCw, MapPin
} from 'lucide-react';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';
import { generateOfficialLeavePdf, generateLeaveSummaryPdf, toThaiDigits } from '../utils/pdfStamper';
import { sendTelegramMessage } from '../utils/telegram';
import { ACADEMIC_POSITIONS } from '../constants';

interface LeaveSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    currentSchool: School;
    focusRequestId?: string | null;
    onClearFocus?: () => void;
}

const LeaveSystem: React.FC<LeaveSystemProps> = ({ currentUser, allTeachers, currentSchool, focusRequestId, onClearFocus }) => {
    // --- State ---
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'LIST' | 'FORM' | 'PDF' | 'STATS' | 'SUMMARY_PREVIEW'>('LIST');
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string>('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    
    // Form State
    const [leaveType, setLeaveType] = useState<'Sick' | 'Personal' | 'OffCampus' | 'Late' | 'Maternity'>('Sick');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [startTime, setStartTime] = useState('08:30');
    const [endTime, setEndTime] = useState('16:30');
    const [substituteName, setSubstituteName] = useState('');
    const [reason, setReason] = useState('');
    const [mobilePhone, setMobilePhone] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isProcessingApproval, setIsProcessingApproval] = useState(false);

    // Statistics States
    const [statTeacher, setStatTeacher] = useState<Teacher | null>(null);
    const [statStartDate, setStatStartDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-01-01`; 
    });
    const [statEndDate, setStatEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [summaryPdfUrl, setSummaryPdfUrl] = useState<string>('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

    const isDirectorRole = currentUser.roles.includes('DIRECTOR');
    const canViewAll = isDirectorRole || currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DOCUMENT_OFFICER');

    // --- Helpers ---
    const getThaiDate = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const getLeaveTypeName = (type: string) => { 
        const map: any = { 'Sick': 'ลาป่วย', 'Personal': 'ลากิจส่วนตัว', 'OffCampus': 'ขอออกนอกบริเวณ', 'Late': 'เข้าสาย', 'Maternity': 'ลาคลอดบุตร' }; 
        return map[type] || type; 
    };
    const calculateDays = (s: string, e: string) => (s && e) ? Math.ceil(Math.abs(new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1 : 0;

    // --- Data Fetching ---
    const fetchRequests = async () => {
        if (!isSupabaseConfigured || !supabase) return;
        
        let query = supabase!.from('leave_requests').select('*').eq('school_id', currentUser.schoolId);
        if (!canViewAll) { query = query.eq('teacher_id', currentUser.id); }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (!error && data) {
            const mapped = data.map(r => ({
                id: r.id.toString(),
                schoolId: r.school_id,
                teacherId: r.teacher_id,
                teacherName: r.teacher_name,
                teacherPosition: r.teacher_position,
                type: r.type,
                startDate: r.start_date,
                endDate: r.end_date,
                startTime: r.start_time,
                endTime: r.end_time,
                substituteName: r.substitute_name,
                reason: r.reason,
                mobilePhone: r.mobile_phone,
                contactInfo: r.contact_info,
                status: r.status,
                directorSignature: r.director_signature,
                approvedDate: r.approved_date,
                createdAt: r.created_at
            } as LeaveRequest));
            setRequests(mapped);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchRequests();
    }, [currentUser.schoolId]);

    const handleDirectorAction = async (isApproved: boolean) => {
        if (!selectedRequest || !supabase) return;
        setIsProcessingApproval(true);
        const now = new Date().toISOString().split('T')[0];
        const { error } = await supabase!.from('leave_requests').update({ 
            status: isApproved ? 'Approved' : 'Rejected', 
            director_signature: currentUser.name,
            approved_date: now
        }).eq('id', parseInt(selectedRequest.id));

        if (!error) {
            alert("บันทึกการพิจารณาเรียบร้อยแล้ว");
            setViewMode('LIST');
            fetchRequests();
        }
        setIsProcessingApproval(false);
    };

    if (isLoading) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader className="animate-spin text-emerald-600" size={48}/><p className="font-bold text-slate-500">กำลังเชื่อมต่อฐานข้อมูล...</p></div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* UI Implementation logic... */}
        </div>
    );
};

export default LeaveSystem;
