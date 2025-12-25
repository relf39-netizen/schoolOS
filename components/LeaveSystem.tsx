
import React, { useState, useEffect } from 'react';
import { LeaveRequest, Teacher, School, SystemConfig } from '../types';
import { 
    Clock, CheckCircle, FilePlus, UserCheck, Printer, 
    ArrowLeft, Loader, Database, Search, Trash2, 
    BarChart, ChevronRight, RefreshCw, MapPin, 
    CalendarDays, Timer, UserPlus, Download, 
    Filter, Eye, Calculator, FileText, Info
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
    const getThaiFullDateUI = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
    };

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
                contact_info: r.contact_info,
                status: r.status,
                directorSignature: r.director_signature,
                approvedDate: r.approved_date,
                createdAt: r.created_at
            } as any));
            setRequests(mapped);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        const loadInitial = async () => {
            await fetchRequests();
            if (isSupabaseConfigured && supabase) {
                const { data } = await supabase!.from('school_configs').select('*').eq('school_id', currentUser.schoolId).single();
                if (data) {
                    setSysConfig({
                        driveFolderId: data.drive_folder_id,
                        scriptUrl: data.script_url,
                        telegramBotToken: data.telegram_bot_token,
                        appBaseUrl: data.app_base_url,
                        officialGarudaBase64: data.official_garuda_base_64,
                        directorSignatureBase64: data.director_signature_base_64,
                        directorSignatureScale: data.director_signature_scale,
                        directorSignatureYOffset: data.director_signature_y_offset
                    });
                }
            }
        };
        loadInitial();

        const channel = supabase?.channel('leave_list_changes').on('postgres_changes', {
            event: '*', schema: 'public', table: 'leave_requests', filter: `school_id=eq.${currentUser.schoolId}`
        }, () => fetchRequests()).subscribe();

        return () => { if (channel) supabase?.removeChannel(channel); };
    }, [currentUser.schoolId]);

    useEffect(() => {
        if (focusRequestId && requests.length > 0) {
            const found = requests.find(r => r.id === focusRequestId);
            if (found) {
                setSelectedRequest(found);
                setViewMode('PDF');
                if (onClearFocus) onClearFocus();
            }
        }
    }, [focusRequestId, requests]);

    useEffect(() => {
        const generatePdf = async () => {
            if (viewMode === 'PDF' && selectedRequest) {
                setIsGeneratingPdf(true);
                try {
                    const currentReq = requests.find(r => r.id === selectedRequest.id) || selectedRequest;
                    const approvedReqs = requests.filter(r => r.teacherId === currentReq.teacherId && r.status === 'Approved' && r.id !== currentReq.id);
                    const stats = {
                        currentDays: calculateDays(currentReq.startDate, currentReq.endDate),
                        prevSick: approvedReqs.filter(r => r.type === 'Sick').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevPersonal: approvedReqs.filter(r => r.type === 'Personal').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevMaternity: approvedReqs.filter(r => r.type === 'Maternity').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevLate: approvedReqs.filter(r => r.type === 'Late').length,
                        prevOffCampus: approvedReqs.filter(r => r.type === 'OffCampus').length
                    };

                    const teacher = allTeachers.find(t => t.id === currentReq.teacherId) || currentUser;
                    const director = allTeachers.find(t => t.roles.includes('DIRECTOR')) || { name: '....................', position: 'ผู้อำนวยการโรงเรียน' };

                    const base64Pdf = await generateOfficialLeavePdf({
                        req: currentReq,
                        stats,
                        teacher,
                        schoolName: currentSchool.name,
                        directorName: director.name,
                        directorSignatureBase64: currentReq.status === 'Approved' ? sysConfig?.directorSignatureBase64 : '',
                        teacherSignatureBase64: teacher.signatureBase64,
                        officialGarudaBase64: sysConfig?.officialGarudaBase64,
                        directorSignatureScale: sysConfig?.directorSignatureScale,
                        directorSignatureYOffset: sysConfig?.directorSignatureYOffset
                    });
                    setPdfUrl(base64Pdf);
                } catch (e) { console.error(e); } finally { setIsGeneratingPdf(false); }
            }
        };
        generatePdf();
    }, [viewMode, selectedRequest, requests, sysConfig]);

    const submitRequest = async () => {
        if (!isSupabaseConfigured || !supabase) return;
        setIsSubmitting(true);

        const payload = {
            school_id: currentUser.schoolId,
            teacher_id: currentUser.id,
            teacher_name: currentUser.name,
            teacher_position: currentUser.position,
            type: leaveType,
            start_date: leaveType === 'OffCampus' ? new Date().toISOString().split('T')[0] : startDate,
            end_date: leaveType === 'OffCampus' ? new Date().toISOString().split('T')[0] : endDate,
            start_time: (leaveType === 'OffCampus' || leaveType === 'Late') ? startTime : null,
            end_time: leaveType === 'OffCampus' ? endTime : null,
            substitute_name: leaveType === 'OffCampus' ? substituteName : null,
            reason: reason,
            mobile_phone: mobilePhone,
            contact_info: leaveType === 'OffCampus' ? null : contactInfo,
            status: 'Pending'
        };

        const { data, error } = await supabase!.from('leave_requests').insert([payload]).select();

        if (!error && data) {
            const newReqId = data[0].id;
            if (sysConfig?.telegramBotToken) {
                const directors = allTeachers.filter(t => t.schoolId === currentUser.schoolId && t.roles.includes('DIRECTOR'));
                let message = leaveType === 'OffCampus' 
                    ? `🏃‍♂️ <b>แจ้งเตือน: ขออนุญาตออกนอกบริเวณ</b>\nจาก: <b>${currentUser.name}</b>\nวันที่: <b>${getThaiDate(payload.start_date)}</b>\nเวลา: <b>${startTime} - ${endTime} น.</b>\nครูสอนแทน: ${substituteName || '-'}\nเหตุผล: ${reason}`
                    : `📂 <b>แจ้งเตือน: มีใบเสนอลาใหม่</b>\nจาก: <b>${currentUser.name}</b>\nประเภท: ${getLeaveTypeName(leaveType)}\nเหตุผล: ${reason}\nช่วงวันที่: ${getThaiDate(payload.start_date)} - ${getThaiDate(payload.end_date)}`;
                
                const link = `${sysConfig.appBaseUrl || window.location.origin}?view=LEAVE&id=${newReqId}`;
                directors.forEach(dir => { if (dir.telegramChatId) sendTelegramMessage(sysConfig.telegramBotToken!, dir.telegramChatId, message, link); });
            }
            alert("ส่งใบลาเรียบร้อยแล้ว ระบบได้แจ้งเตือนผู้อำนวยการทาง Telegram แล้ว"); 
            setViewMode('LIST'); fetchRequests();
        } else { alert("บันทึกล้มเหลว: " + error?.message); }
        setIsSubmitting(false);
    };

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
            const teacher = allTeachers.find(t => t.id === selectedRequest.teacherId);
            if (teacher?.telegramChatId && sysConfig?.telegramBotToken) {
                const icon = isApproved ? '✅' : '❌';
                const statusText = isApproved ? 'อนุมัติ / อนุญาต' : 'ไม่อนุมัติ';
                const message = `${icon} <b>แจ้งผลการพิจารณาใบลา</b>\nรายการ: ${getLeaveTypeName(selectedRequest.type)}\nวันที่: ${getThaiDate(selectedRequest.startDate)}\nผลการพิจารณา: <b>${statusText}</b>\nโดย: ผู้อำนวยการโรงเรียน`;
                sendTelegramMessage(sysConfig.telegramBotToken, teacher.telegramChatId, message);
            }
            alert("บันทึกการพิจารณาเรียบร้อยแล้ว"); setViewMode('LIST'); fetchRequests();
        } else { alert("ผิดพลาด: " + error.message); }
        setIsProcessingApproval(false);
    };

    const handleDelete = async (docId: string) => {
        if (!confirm("ยืนยันการลบข้อมูลใบลาชิ้นนี้?")) return;
        const { error } = await supabase!.from('leave_requests').delete().eq('id', parseInt(docId));
        if (!error) {
            alert("ลบข้อมูลสำเร็จ");
            fetchRequests();
            setViewMode('LIST');
        } else {
            alert("ลบไม่สำเร็จ: " + error.message);
        }
    };

    const getTeacherStats = (teacherId: string, start: string, end: string) => {
        const filtered = requests.filter(r => r.teacherId === teacherId && r.status === 'Approved' && r.startDate >= start && r.startDate <= end);
        return {
            sick: filtered.filter(r => r.type === 'Sick').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
            personal: filtered.filter(r => r.type === 'Personal').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
            maternity: filtered.filter(r => r.type === 'Maternity').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
            late: filtered.filter(r => r.type === 'Late').length,
            offCampus: filtered.filter(r => r.type === 'OffCampus').length,
            totalRecords: filtered.length
        };
    };

    const handleGenerateSummaryReport = async () => {
        setIsGeneratingSummary(true);
        try {
            const director = allTeachers.find(t => t.roles.includes('DIRECTOR'));
            const schoolTeachers = allTeachers
                .filter(t => t.schoolId === currentUser.schoolId && !t.roles.includes('DIRECTOR'))
                .sort((a, b) => {
                    const indexA = ACADEMIC_POSITIONS.indexOf(a.position);
                    const indexB = ACADEMIC_POSITIONS.indexOf(b.position);
                    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                });
            
            const base64Pdf = await generateLeaveSummaryPdf({
                schoolName: currentSchool.name,
                startDate: statStartDate,
                endDate: statEndDate,
                teachers: schoolTeachers,
                getStatsFn: getTeacherStats,
                directorName: director?.name || '....................',
                officialGarudaBase64: sysConfig?.officialGarudaBase64,
                directorSignatureBase64: sysConfig?.directorSignatureBase64,
                directorSignatureScale: sysConfig?.directorSignatureScale || 1.0,
                directorSignatureYOffset: sysConfig?.directorSignatureYOffset || 0
            });
            
            setSummaryPdfUrl(base64Pdf); setViewMode('SUMMARY_PREVIEW');
        } catch (e) { console.error(e); alert("เกิดข้อผิดพลาดในการสร้างรายงาน"); } finally { setIsGeneratingSummary(false); }
    };

    const pendingRequests = requests.filter(r => r.status === 'Pending');
    const historyRequests = requests.filter(r => r.status !== 'Pending');

    if (isLoading) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader className="animate-spin text-emerald-600" size={48}/><p className="font-bold text-slate-500">กำลังเชื่อมต่อฐานข้อมูล SQL...</p></div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header Banner */}
            <div className="bg-emerald-800 text-white p-6 rounded-[2rem] shadow-xl flex flex-col md:flex-row justify-between items-center gap-4 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:scale-110 transition-transform"><CalendarDays size={120}/></div>
                <div className="flex items-center gap-6 relative z-10">
                    <div className="p-4 bg-white/20 rounded-3xl backdrop-blur-md shadow-inner"><UserCheck size={32}/></div>
                    <div>
                        <h2 className="text-3xl font-black tracking-tight">ระบบการลา (Cloud SQL)</h2>
                        <p className="text-emerald-200 font-bold flex items-center gap-1 uppercase tracking-widest text-xs mt-1"><Database size={12}/> {currentSchool.name}</p>
                    </div>
                </div>
                <div className="flex gap-2 relative z-10">
                    {canViewAll && (
                        <button onClick={() => setViewMode('STATS')} className="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-2xl font-bold flex items-center gap-2 transition-all border border-white/10">
                            <BarChart size={20}/> สรุปยอดวันลา
                        </button>
                    )}
                    <button onClick={() => { setLeaveType('Sick'); setViewMode('FORM'); }} className="px-6 py-3 bg-white text-emerald-800 rounded-2xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2">
                        <FilePlus size={20}/> ยื่นใบลาใหม่
                    </button>
                </div>
            </div>

            {viewMode === 'LIST' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Pending Queue */}
                    <div className="lg:col-span-4 space-y-4">
                        <h3 className="font-black text-xl text-slate-800 flex items-center gap-2 px-2"><Clock className="text-amber-500"/> งานรอพิจารณา {pendingRequests.length > 0 && <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingRequests.length}</span>}</h3>
                        {pendingRequests.length === 0 ? (<div className="bg-slate-50 border-2 border-dashed border-slate-200 p-10 rounded-3xl text-center text-slate-400 font-bold">ไม่มีรายการค้างพิจารณา</div>) : (
                            pendingRequests.map(req => (
                                <div key={req.id} onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className="bg-white p-5 rounded-3xl shadow-sm border-2 border-slate-100 hover:border-emerald-500 cursor-pointer transition-all hover:shadow-xl group relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black">{req.teacherName[0]}</div>
                                            <div>
                                                <p className="font-black text-slate-800 leading-none mb-1">{req.teacherName}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">{req.teacherPosition}</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="text-slate-200 group-hover:text-emerald-500 transition-colors"/>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-2xl space-y-1">
                                        <div className="flex justify-between items-center text-[11px] font-black"><span className="text-slate-400">ประเภท:</span><span className="text-indigo-600">{getLeaveTypeName(req.type)}</span></div>
                                        <div className="flex justify-between items-center text-[11px] font-black"><span className="text-slate-400">วันที่:</span><span className="text-slate-700">{getThaiDate(req.startDate)}</span></div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* History */}
                    <div className="lg:col-span-8 bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden flex flex-col">
                        <div className="p-6 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-center gap-4">
                            <h3 className="font-black text-xl text-slate-800 flex items-center gap-2"><Search className="text-emerald-600"/> ประวัติย้อนหลัง</h3>
                            <div className="relative w-full md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <input type="text" placeholder="ค้นหาชื่อ..." className="w-full pl-10 pr-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 ring-emerald-500/20"/>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                                    <tr><th className="p-6">บุคลากร</th><th className="p-6">การลา</th><th className="p-6 text-center">วันที่</th><th className="p-6 text-center">สถานะ</th><th className="p-6 text-right">PDF</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {historyRequests.map(req => (
                                        <tr key={req.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="p-6 font-black text-slate-700">{req.teacherName}</td>
                                            <td className="p-6 font-bold text-slate-500">{getLeaveTypeName(req.type)}</td>
                                            <td className="p-6 text-center font-bold text-slate-400 text-xs">{getThaiDate(req.startDate)}</td>
                                            <td className="p-6 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${req.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                    {req.status === 'Approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}
                                                </span>
                                            </td>
                                            <td className="p-6 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"><Printer size={16}/></button>
                                                    {canViewAll && (
                                                        <button onClick={() => handleDelete(req.id)} className="p-2.5 bg-slate-100 text-slate-300 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={16}/></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'FORM' && (
                <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
                    <button onClick={() => setViewMode('LIST')} className="flex items-center gap-2 text-slate-500 font-black hover:text-emerald-600"><ArrowLeft size={18}/> ย้อนกลับ</button>
                    <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100">
                        <h3 className="text-3xl font-black text-slate-800 mb-8 flex items-center gap-3"><FilePlus className="text-emerald-600" size={36}/> แบบฟอร์มขออนุญาตลา</h3>
                        <form onSubmit={e => { e.preventDefault(); submitRequest(); }} className="space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {['Sick', 'Personal', 'Maternity', 'OffCampus'].map(t => (
                                    <button key={t} type="button" onClick={() => { setLeaveType(t as any); if(t==='OffCampus') { setStartDate(new Date().toISOString().split('T')[0]); setEndDate(new Date().toISOString().split('T')[0]); } }} className={`py-4 rounded-2xl text-[11px] font-black transition-all border-2 ${leaveType === t ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-white text-slate-500 border-slate-100 hover:border-emerald-200'}`}>{getLeaveTypeName(t)}</button>
                                ))}
                            </div>

                            {leaveType === 'OffCampus' ? (
                                <div className="space-y-6 animate-fade-in bg-blue-50 p-6 rounded-[2rem] border-2 border-blue-100">
                                    <div className="flex items-center gap-2 text-blue-800 font-black mb-2"><Timer size={20}/> ระบุเวลาออกนอกบริเวณ (วันนี้: {getThaiDate(new Date().toISOString())})</div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2"><label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">เวลาที่ไป</label><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} className="w-full px-5 py-4 border-2 border-white rounded-2xl font-bold outline-none focus:border-blue-500" required/></div>
                                        <div className="space-y-2"><label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">เวลาที่กลับ</label><input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} className="w-full px-5 py-4 border-2 border-white rounded-2xl font-bold outline-none focus:border-blue-500" required/></div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1 flex items-center gap-1"><UserPlus size={12}/> ครูผู้ดูแลนักเรียนแทน (ครูสอนแทน)</label>
                                        <input type="text" placeholder="ระบุชื่อครูที่ฝากห้อง/ฝากสอนแทน..." value={substituteName} onChange={e=>setSubstituteName(e.target.value)} className="w-full px-5 py-4 border-2 border-white rounded-2xl font-bold outline-none focus:border-blue-500" required/>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
                                    <div className="space-y-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">เริ่มวันที่</label><input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-500 bg-slate-50" required/></div>
                                    <div className="space-y-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ถึงวันที่</label><input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl font-bold outline-none focus:border-emerald-500 bg-slate-50" required/></div>
                                </div>
                            )}

                            <div className="space-y-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">เหตุผล {leaveType==='OffCampus'?'ที่ต้องออกนอกบริเวณ':'การลา'}</label><textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3} className="w-full px-6 py-4 border-2 border-slate-100 rounded-3xl outline-none focus:border-emerald-500 font-bold bg-slate-50" placeholder="ระบุความจำเป็น..." required/></div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2"><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">เบอร์โทรศัพท์ที่ติดต่อได้</label><input type="tel" value={mobilePhone} onChange={e=>setMobilePhone(e.target.value)} className="w-full px-6 py-4 border-2 border-slate-100 rounded-2xl font-bold bg-slate-50 outline-none focus:border-emerald-500" placeholder="08X-XXX-XXXX" required/></div>
                                <div className="hidden md:block"></div>
                                
                                {leaveType !== 'OffCampus' && (
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-2">
                                            <MapPin size={12}/> ที่อยู่ที่ติดต่อได้ระหว่างลา (ระบุบ้านเลขที่ ตำบล อำเภอ จังหวัด)
                                        </label>
                                        <textarea 
                                            required 
                                            value={contactInfo} 
                                            onChange={e => setContactInfo(e.target.value)} 
                                            rows={4} 
                                            className="w-full px-6 py-4 border-2 border-slate-100 rounded-[1.5rem] bg-slate-50 outline-none focus:border-emerald-500 font-bold text-sm leading-relaxed shadow-inner" 
                                            placeholder="ตัวอย่าง: บ้านโคกหลวงพ่อ ตำบลนางรอง อำเภอนางรอง จังหวัดบุรีรัมย์ 31110"
                                        />
                                        <p className="text-[9px] text-slate-400 font-bold mt-1 ml-1 italic">
                                            * กรุณากรอกที่อยู่ให้ครบถ้วนเพื่อความถูกต้องของเอกสารทางราชการ
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="pt-6 flex gap-4">
                                <button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-5 bg-slate-100 text-slate-500 rounded-[2rem] font-black uppercase tracking-widest transition-all hover:bg-slate-200">ยกเลิก</button>
                                <button type="submit" disabled={isSubmitting} className="flex-[2] py-5 bg-emerald-600 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95">
                                    {isSubmitting ? <RefreshCw className="animate-spin" size={24}/> : <CheckCircle size={24}/>} ยืนยันการเสนอใบลา
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {viewMode === 'PDF' && selectedRequest && (
                <div className="flex flex-col lg:flex-row gap-8 animate-slide-up">
                    <div className="flex-1 bg-slate-900 rounded-[3rem] overflow-hidden shadow-2xl h-[750px] relative border-8 border-white group">
                        {isGeneratingPdf ? (<div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-900/80 z-20"><Loader className="animate-spin mb-4" size={48}/><p className="text-xl font-black uppercase tracking-widest">Building PDF...</p></div>) : (<iframe src={pdfUrl} className="w-full h-full border-none"/>)}
                        <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity"><a href={pdfUrl} download="Leave_Request.pdf" className="p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center gap-2 font-black"><Download size={20}/></a></div>
                    </div>
                    <div className="w-full lg:w-96 space-y-6">
                        <button onClick={() => setViewMode('LIST')} className="w-full py-5 bg-white text-slate-600 rounded-[2rem] border-2 border-slate-100 font-black flex items-center justify-center gap-3 hover:bg-slate-50 transition-all active:scale-95"><ArrowLeft size={20}/> ย้อนกลับ</button>
                        {isDirectorRole && selectedRequest.status === 'Pending' && (
                            <div className="bg-white p-8 rounded-[2.5rem] border-2 border-emerald-100 shadow-xl space-y-6 animate-slide-up">
                                <div className="flex items-center gap-3 border-b border-emerald-50 pb-4"><UserCheck className="text-emerald-600" size={28}/><div><h4 className="font-black text-slate-800 uppercase tracking-tight">พิจารณาใบลา</h4><p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Director Signature Control</p></div></div>
                                <div className="space-y-3">
                                    <button onClick={() => handleDirectorAction(true)} disabled={isProcessingApproval} className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-3 active:scale-95">{isProcessingApproval ? <RefreshCw className="animate-spin" size={24}/> : <CheckCircle size={24}/>} อนุญาต (ประทับตรา)</button>
                                    <button onClick={() => handleDirectorAction(false)} disabled={isProcessingApproval} className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black border-2 border-rose-100 hover:bg-rose-100 transition-all active:scale-95">ไม่อนุญาต</button>
                                </div>
                            </div>
                        )}
                        <div className="bg-slate-800 p-8 rounded-[2.5rem] text-white shadow-xl">
                            <h4 className="font-black flex items-center gap-2 border-b border-white/10 pb-4"><Calculator className="text-blue-400"/> ข้อมูลระบบ SQL</h4>
                            <div className="text-[11px] space-y-3 opacity-80 mt-4">
                                <div className="flex justify-between"><span>รหัสเอกสาร:</span><span className="font-mono">{selectedRequest.id}</span></div>
                                <div className="flex justify-between"><span>ผู้ยื่นเสนอ:</span><span>{selectedRequest.teacherName}</span></div>
                                <div className="flex justify-between"><span>สถานะ:</span><span className="text-blue-400 font-black uppercase">{selectedRequest.status}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'STATS' && (
                <div className="space-y-6 animate-slide-up">
                    <div className="flex items-center gap-4 mb-4">
                        <button onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
                            <ArrowLeft size={24}/>
                        </button>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">{statTeacher ? statTeacher.name : 'สรุปสถิติการลาบุคลากร'}</h2>
                            <p className="text-xs text-slate-500">{statTeacher ? `ตำแหน่ง: ${statTeacher.position}` : 'ภาพรวมทั้งโรงเรียน (Cloud SQL)'}</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-center justify-between">
                        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Filter size={20}/>
                                <span className="text-sm font-bold text-slate-500 whitespace-nowrap">เลือกช่วงวันลา:</span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                                <input 
                                    type="date" 
                                    value={statStartDate} 
                                    onChange={(e) => setStatStartDate(e.target.value)} 
                                    className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                                <span className="text-slate-300">-</span>
                                <input 
                                    type="date" 
                                    value={statEndDate} 
                                    onChange={(e) => setStatEndDate(e.target.value)} 
                                    className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-auto">
                            <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                {getThaiFullDateUI(statStartDate)} ถึง {getThaiFullDateUI(statEndDate)}
                            </div>
                            {!statTeacher && (
                                <button 
                                    onClick={handleGenerateSummaryReport}
                                    disabled={isGeneratingSummary}
                                    className="bg-slate-800 text-white w-full md:w-auto px-6 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md disabled:opacity-50"
                                >
                                    {isGeneratingSummary ? <Loader className="animate-spin" size={18}/> : <FileText size={18}/>}
                                    พิมพ์บันทึกสรุปการลา (PDF)
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {statTeacher ? (
                            <div className="p-6 space-y-6">
                                {(() => {
                                    const s = getTeacherStats(statTeacher.id, statStartDate, statEndDate);
                                    return (
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                            <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-red-400 uppercase mb-1">ลาป่วย (วัน)</div>
                                                <div className="text-2xl font-black text-red-600">{toThaiDigits(s.sick)}</div>
                                            </div>
                                            <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-orange-400 uppercase mb-1">ลากิจ (วัน)</div>
                                                <div className="text-2xl font-black text-orange-600">{toThaiDigits(s.personal)}</div>
                                            </div>
                                            <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-purple-400 uppercase mb-1">ลาคลอด (วัน)</div>
                                                <div className="text-2xl font-black text-purple-600">{toThaiDigits(s.maternity)}</div>
                                            </div>
                                            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1">มาสาย (ครั้ง)</div>
                                                <div className="text-2xl font-black text-indigo-600">{toThaiDigits(s.late)}</div>
                                            </div>
                                            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center shadow-sm">
                                                <div className="text-[10px] font-bold text-emerald-400 uppercase mb-1">ออกนอก (ครั้ง)</div>
                                                <div className="text-2xl font-black text-emerald-600">{toThaiDigits(s.offCampus)}</div>
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className="flex justify-end">
                                    <button onClick={() => setStatTeacher(null)} className="px-6 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors">
                                        กลับไปดูรวมทั้งหมด
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-bold border-b whitespace-nowrap">
                                        <tr>
                                            <th className="px-6 py-4">ชื่อ - นามสกุล</th>
                                            <th className="px-6 py-4 text-center">ป่วย (วัน)</th>
                                            <th className="px-6 py-4 text-center">กิจ (วัน)</th>
                                            <th className="px-6 py-4 text-center">สาย (ครั้ง)</th>
                                            <th className="px-6 py-4 text-right">สถิติละเอียด</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {allTeachers.filter(t => t.schoolId === currentUser.schoolId && !t.roles.includes('DIRECTOR')).map(t => {
                                            const s = getTeacherStats(t.id, statStartDate, statEndDate);
                                            return (
                                                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-bold text-slate-800 whitespace-nowrap">{t.name}</div>
                                                        <div className="text-[10px] text-slate-400">{t.position}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-red-600">{toThaiDigits(s.sick)}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-orange-600">{toThaiDigits(s.personal)}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-indigo-600">{toThaiDigits(s.late)}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button 
                                                            onClick={() => setStatTeacher(t)}
                                                            className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-600 hover:text-white transition-all text-xs"
                                                        >
                                                            <Eye size={14}/> ตรวจสอบ
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {viewMode === 'SUMMARY_PREVIEW' && (
                <div className="flex flex-col lg:flex-row gap-6 animate-slide-up">
                    <div className="flex-1 bg-slate-500 rounded-2xl overflow-hidden shadow-2xl min-h-[700px] relative border-4 border-white">
                         <iframe src={summaryPdfUrl} className="w-full h-full border-none" title="Summary Report PDF"/>
                    </div>
                    <div className="w-full lg:w-80 space-y-4">
                        <button onClick={() => setViewMode('STATS')} className="w-full py-3 bg-white text-slate-600 rounded-xl border font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><ArrowLeft size={18}/> ย้อนกลับ</button>
                        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200 shadow-sm">
                            <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2 text-sm"><FileText size={16}/> รายงานสรุปการลา</h4>
                            <p className="text-xs text-blue-600 leading-relaxed mb-4">พิมพ์บันทึกข้อความสรุปสถิติการลาสำหรับเสนอผู้บริหาร</p>
                            <button onClick={() => window.print()} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:bg-black transition-all">
                                <Printer size={18}/> สั่งพิมพ์
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeaveSystem;
