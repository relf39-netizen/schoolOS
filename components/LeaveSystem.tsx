
import React, { useState, useEffect, useMemo } from 'react';
import { LeaveRequest, Teacher, School, SystemConfig } from '../types';
import { Clock, CheckCircle, XCircle, FilePlus, UserCheck, Printer, ArrowLeft, Loader, Database, Calendar, User, ChevronRight, Trash2, AlertCircle, Eye, Filter, X, Calculator, FileText } from 'lucide-react';
import { db, isConfigured, doc, getDoc, getDocs, addDoc, collection, updateDoc, deleteDoc, query, where, onSnapshot, QuerySnapshot, DocumentData } from '../firebaseConfig';
import { generateOfficialLeavePdf, generateLeaveSummaryPdf, toThaiDigits } from '../utils/pdfStamper';
import { sendTelegramMessage } from '../utils/telegram';
import { ACADEMIC_POSITIONS } from '../constants';

interface LeaveSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    currentSchool?: School;
    focusRequestId?: string | null;
    onClearFocus?: () => void;
}

const LeaveSystem: React.FC<LeaveSystemProps> = ({ currentUser, allTeachers, currentSchool, focusRequestId, onClearFocus }) => {
    // State
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dbError, setDbError] = useState<string | null>(null);
    
    // View Modes: LIST | FORM | PDF | SUMMARY_PREVIEW | STATS
    const [viewMode, setViewMode] = useState<'LIST' | 'FORM' | 'PDF' | 'SUMMARY_PREVIEW' | 'STATS'>('LIST');
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);

    // Statistics States (Full Page View)
    const [statTeacher, setStatTeacher] = useState<Teacher | null>(null);
    const [statStartDate, setStatStartDate] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-01-01`; 
    });
    const [statEndDate, setStatEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Summary PDF State
    const [summaryPdfUrl, setSummaryPdfUrl] = useState<string>('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

    // Form State
    const [leaveType, setLeaveType] = useState('Sick');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndDateManual] = useState('');
    const [reason, setReason] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [mobilePhone, setMobilePhone] = useState('');
    
    // Processing State
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessingApproval, setIsProcessingApproval] = useState(false);
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [offCampusCount, setOffCampusCount] = useState(0);
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string>('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Permissions & Helpers
    const isDirectorRole = currentUser.roles.includes('DIRECTOR');
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');
    const canApprove = isDirectorRole;
    const canViewAll = isDirectorRole || isSystemAdmin || isDocOfficer;

    // ฟังก์ชันตรวจสอบว่าบุคคลนั้นเป็นผู้อำนวยการหรือไม่ (เช็คจาก Role หรือ ตำแหน่ง)
    const checkIfDirector = (teacher: Teacher) => {
        return teacher.roles.includes('DIRECTOR') || 
               teacher.position.includes('ผู้อำนวยการ');
    };

    // Helper: Convert Date String to Thai Format with BE Year and Thai Digits
    const getThaiFullDateUI = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const day = d.getDate();
        const month = months[d.getMonth()];
        const year = d.getFullYear() + 543;
        return toThaiDigits(`${day} ${month} ${year}`);
    };

    // Helper: Get BE Year from date string
    const getBEYear = (dateStr: string) => {
        if (!dateStr) return '';
        return toThaiDigits(new Date(dateStr).getFullYear() + 543);
    };

    // --- Real-time Data Subscription ---
    useEffect(() => {
        let unsubscribe: () => void;

        const fetchConfig = async () => {
             if (isConfigured && db) {
                 try {
                     const docRef = doc(db, "system_config", "settings");
                     const docSnap = await getDoc(docRef);
                     if (docSnap.exists()) setSysConfig(docSnap.data() as SystemConfig);
                 } catch (e) { console.error("Config fetch error", e); }
             }
        };
        fetchConfig();

        if (isConfigured && db) {
            const q = query(
                collection(db, "leave_requests"),
                where("schoolId", "==", currentUser.schoolId)
            );

            unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
                const fetched: LeaveRequest[] = [];
                snapshot.forEach((docSnap) => {
                    fetched.push({ ...docSnap.data(), id: docSnap.id } as LeaveRequest);
                });
                
                const sorted = fetched.sort((a, b) => {
                    const dateA = new Date(a.createdAt || 0).getTime();
                    const dateB = new Date(b.createdAt || 0).getTime();
                    return dateB - dateA;
                });

                setRequests(sorted);
                setIsLoading(false);
                setDbError(null);
            }, (error) => {
                console.error("Firestore Error:", error);
                setDbError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
                setIsLoading(false);
            });
        } else {
            setDbError("ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล");
            setIsLoading(false);
        }

        return () => { if (unsubscribe) unsubscribe(); };
    }, [currentUser.schoolId]);

    // --- Deep Link Effect ---
    useEffect(() => {
        if (focusRequestId && requests.length > 0) {
            const found = requests.find(r => r.id === focusRequestId);
            if (found) {
                setSelectedRequest(found);
                setViewMode('PDF');
                setIsHighlighted(true);
                setTimeout(() => setIsHighlighted(false), 2500);
                if (onClearFocus) onClearFocus();
            }
        }
    }, [focusRequestId, requests]);

    // --- PDF Effect ---
    useEffect(() => {
        const generatePdf = async () => {
            if (viewMode === 'PDF' && selectedRequest) {
                setIsGeneratingPdf(true);
                try {
                    const approvedReqs = requests.filter(r => r.teacherId === selectedRequest.teacherId && r.status === 'Approved' && r.id !== selectedRequest.id);
                    const stats = {
                        currentDays: calculateDays(selectedRequest.startDate, selectedRequest.endDate),
                        prevSick: approvedReqs.filter(r => r.type === 'Sick').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevPersonal: approvedReqs.filter(r => r.type === 'Personal').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevMaternity: approvedReqs.filter(r => r.type === 'Maternity').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevLate: approvedReqs.filter(r => r.type === 'Late').length,
                        prevOffCampus: approvedReqs.filter(r => r.type === 'OffCampus').length
                    };

                    const teacher = allTeachers.find(t => t.id === selectedRequest.teacherId) || currentUser;
                    const director = allTeachers.find(t => checkIfDirector(t));

                    const base64Pdf = await generateOfficialLeavePdf({
                        req: selectedRequest, stats, teacher,
                        schoolName: currentSchool?.name || 'โรงเรียน...',
                        directorName: director?.name || '...',
                        directorSignatureBase64: sysConfig?.directorSignatureBase64,
                        teacherSignatureBase64: teacher.signatureBase64,
                        officialGarudaBase64: sysConfig?.officialGarudaBase64,
                        directorSignatureScale: sysConfig?.directorSignatureScale || 1.0,
                        directorSignatureYOffset: sysConfig?.directorSignatureYOffset || 0
                    });
                    setPdfUrl(base64Pdf);
                } catch (e) { console.error(e); } finally { setIsGeneratingPdf(false); }
            }
        };
        generatePdf();
    }, [viewMode, selectedRequest, requests, allTeachers, currentSchool, sysConfig]);

    const calculateDays = (start: string, end: string) => {
        if (!start || !end) return 0;
        const s = new Date(start);
        const e = new Date(end);
        return Math.ceil(Math.abs(e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    };

    const getLeaveTypeName = (type: string) => {
        const map: any = { 'Sick': 'ลาป่วย', 'Personal': 'ลากิจส่วนตัว', 'OffCampus': 'ออกนอกบริเวณ', 'Late': 'เข้าสาย', 'Maternity': 'ลาคลอดบุตร' };
        return map[type] || type;
    };

    const getThaiDate = (dateStr: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'Approved': return <span className="text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle size={12}/> อนุมัติ</span>;
            case 'Rejected': return <span className="text-red-600 bg-red-100 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1"><XCircle size={12}/> ไม่อนุมัติ</span>;
            default: return <span className="text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Clock size={12}/> รอพิจารณา</span>;
        }
    };

    const handleFormInit = () => {
        setViewMode('FORM');
        setLeaveType('Sick');
        setStartDate('');
        setEndDate('');
        setStartTime('');
        setEndDateManual('');
        setReason('');
        setContactInfo('');
        setMobilePhone('');
    };

    const submitRequest = async () => {
        setIsUploading(true);
        const reqId = `leave_${Date.now()}`;
        const newReq: any = {
            id: reqId, teacherId: currentUser.id, teacherName: currentUser.name, teacherPosition: currentUser.position || 'ครู',
            type: leaveType, startDate, endDate, reason, contactInfo: contactInfo || '', mobilePhone: mobilePhone || '',
            status: 'Pending', createdAt: new Date().toISOString(), schoolId: currentUser.schoolId
        };
        if (leaveType === 'OffCampus' || leaveType === 'Late') newReq.startTime = startTime;
        if (leaveType === 'OffCampus') newReq.endTime = endTime;
        
        try {
            await addDoc(collection(db, "leave_requests"), newReq);
            if (sysConfig?.telegramBotToken) {
                const directors = allTeachers.filter(t => checkIfDirector(t));
                const message = `📢 <b>มีใบลาใหม่รอการอนุมัติ</b>\nจาก: ${currentUser.name}\nประเภท: ${getLeaveTypeName(leaveType)}\nเหตุผล: ${reason}`;
                directors.forEach(dir => dir.telegramChatId && sendTelegramMessage(sysConfig.telegramBotToken!, dir.telegramChatId, message, `${sysConfig.appBaseUrl}?view=LEAVE&id=${reqId}`));
            }
            alert('เสนอใบลาเรียบร้อยแล้ว');
            setViewMode('LIST');
        } catch(e) { alert("บันทึกล้มเหลว"); } finally { setIsUploading(false); setShowWarningModal(false); }
    };

    const handleDelete = async (e: React.MouseEvent, docId: string) => {
        e.stopPropagation();
        if (!confirm("คุณต้องการลบรายการนี้ใช่หรือไม่?")) return;
        try {
            await deleteDoc(doc(db, "leave_requests", docId));
        } catch (e) { console.error(e); }
    };

    const handleDirectorApprove = async (req: LeaveRequest, isApproved: boolean) => {
        setIsProcessingApproval(true);
        const updateData = { 
            status: isApproved ? 'Approved' : 'Rejected', 
            directorSignature: isApproved ? currentUser.name : '', 
            approvedDate: new Date().toISOString().split('T')[0] 
        };
        try {
            const docRef = doc(db, "leave_requests", req.id);
            await updateDoc(docRef, updateData);

            const targetTeacher = allTeachers.find(t => t.id === req.teacherId);
            if (targetTeacher?.telegramChatId && sysConfig?.telegramBotToken) {
                const statusText = isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ';
                const statusIcon = isApproved ? '✅' : '❌';
                const message = `${statusIcon} <b>แจ้งผลการพิจารณาใบลา</b>\nรายการ: ${getLeaveTypeName(req.type)}\nผลการพิจารณา: <b>${statusText}</b>\nโดย: ผู้อำนวยการ`;
                sendTelegramMessage(sysConfig.telegramBotToken, targetTeacher.telegramChatId, message, `${sysConfig.appBaseUrl}?view=LEAVE&id=${req.id}`);
            }

            alert('พิจารณาเรียบร้อยแล้ว');
            setSelectedRequest(null);
            setViewMode('LIST');
        } catch (e) { 
            console.error(e);
            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
        } finally { setIsProcessingApproval(false); }
    };

    // --- Statistics Logic ---
    const getTeacherStats = (teacherId: string, start: string, end: string) => {
        const filtered = requests.filter(r => 
            r.teacherId === teacherId && 
            r.status === 'Approved' && 
            r.startDate >= start && 
            r.startDate <= end
        );

        return {
            sick: filtered.filter(r => r.type === 'Sick').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
            personal: filtered.filter(r => r.type === 'Personal').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
            maternity: filtered.filter(r => r.type === 'Maternity').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
            late: filtered.filter(r => r.type === 'Late').length,
            offCampus: filtered.filter(r => r.type === 'OffCampus').length,
            totalRecords: filtered.length
        };
    };

    // --- Generate Summary PDF ---
    const handleGenerateSummaryReport = async () => {
        setIsGeneratingSummary(true);
        try {
            const director = allTeachers.find(t => checkIfDirector(t));
            
            // กรองผู้อำนวยการออกก่อนส่งให้ฟังก์ชันทำ PDF
            const schoolTeachers = allTeachers
                .filter(t => t.schoolId === currentUser.schoolId && !checkIfDirector(t))
                .sort((a, b) => {
                    const indexA = ACADEMIC_POSITIONS.indexOf(a.position);
                    const indexB = ACADEMIC_POSITIONS.indexOf(b.position);
                    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                });
            
            const base64Pdf = await generateLeaveSummaryPdf({
                schoolName: currentSchool?.name || sysConfig?.schoolName || '...',
                startDate: statStartDate,
                endDate: statEndDate,
                teachers: schoolTeachers,
                getStatsFn: getTeacherStats,
                directorName: director?.name || '...',
                officialGarudaBase64: sysConfig?.officialGarudaBase64,
                directorSignatureBase64: sysConfig?.directorSignatureBase64,
                directorSignatureScale: sysConfig?.directorSignatureScale || 1.0,
                directorSignatureYOffset: sysConfig?.directorSignatureYOffset || 0
            });
            
            setSummaryPdfUrl(base64Pdf);
            setViewMode('SUMMARY_PREVIEW');
        } catch (e) {
            console.error(e);
            alert("เกิดข้อผิดพลาดในการสร้างรายงาน");
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const filteredRequests = canViewAll ? requests : requests.filter(r => r.teacherId === currentUser.id);
    const pendingRequests = filteredRequests.filter(r => r.status === 'Pending');
    const historyRequests = filteredRequests.filter(r => r.status !== 'Pending');

    if (isLoading) return <div className="p-10 text-center"><Loader className="animate-spin inline mr-2"/> กำลังโหลดข้อมูล...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className={`p-4 rounded-xl flex items-center justify-between text-white shadow-lg ${dbError ? 'bg-red-600' : 'bg-emerald-800'}`}>
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg"><Calendar size={24}/></div>
                    <div>
                        <h2 className="text-xl font-bold leading-tight">ระบบการลาอิเล็กทรอนิกส์</h2>
                        <p className="text-[10px] opacity-80 flex items-center gap-1 uppercase tracking-wider">
                            {dbError ? <AlertCircle size={10}/> : <Database size={10}/>}
                            {dbError ? dbError : `SchoolID: ${currentUser.schoolId}`}
                        </p>
                    </div>
                </div>
            </div>

            {viewMode === 'LIST' && (
                <>
                    <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border border-slate-200">
                        <div className="text-slate-600 font-bold flex items-center gap-2">รายการลา ({filteredRequests.length})</div>
                        <div className="flex gap-2">
                             {canViewAll && (
                                <button 
                                    onClick={() => { setStatTeacher(null); setViewMode('STATS'); }}
                                    className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg text-xs font-bold border border-indigo-100 flex items-center gap-2 hover:bg-indigo-600 hover:text-white transition-all"
                                >
                                    <Calculator size={16}/> สรุปยอดวันลา
                                </button>
                             )}
                            <button onClick={handleFormInit} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-transform active:scale-95 text-xs font-bold">
                                <FilePlus size={18} /> ยื่นใบลาใหม่
                            </button>
                        </div>
                    </div>

                    {pendingRequests.length > 0 && (
                        <div>
                             <h3 className="text-orange-600 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-widest">
                                <Clock size={16} className="animate-pulse"/> รอพิจารณา ({pendingRequests.length})
                             </h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {pendingRequests.map(req => (
                                    <div key={req.id} onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className={`bg-white rounded-xl shadow-md border-l-4 border-l-yellow-400 p-4 cursor-pointer hover:shadow-lg transition-all ${isHighlighted && req.id === focusRequestId ? 'ring-4 ring-yellow-200' : ''}`}>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"><User size={16}/></div>
                                                <div className="font-bold text-slate-800 text-sm leading-tight">
                                                    {req.teacherName}
                                                    <div className="text-[10px] text-slate-400 font-normal">{req.teacherPosition}</div>
                                                </div>
                                            </div>
                                            {(isDirectorRole || isSystemAdmin) && <button onClick={(e) => handleDelete(e, req.id)} className="text-red-300 hover:text-red-600 p-1"><Trash2 size={16}/></button>}
                                        </div>
                                        <div className="space-y-1 mb-4 text-sm">
                                            <div className="flex justify-between border-b border-dashed border-slate-100 pb-1"><span className="text-slate-500">ประเภท:</span><span className="font-bold text-indigo-600">{getLeaveTypeName(req.type)}</span></div>
                                            <div className="flex justify-between border-b border-dashed border-slate-100 pb-1"><span className="text-slate-500">วันที่:</span><span className="font-bold text-xs">{getThaiDate(req.startDate)} - {getThaiDate(req.endDate)}</span></div>
                                        </div>
                                        <div className="text-[10px] text-blue-600 font-bold flex justify-end items-center gap-1">คลิกตรวจสอบเพื่อพิจารณา <ChevronRight size={12}/></div>
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}

                    <div className="mt-8">
                         <h3 className="text-slate-600 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-widest"><Database size={16}/> ประวัติการลาล่าสุด</h3>
                         <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                             {historyRequests.length === 0 ? <div className="p-12 text-center text-slate-400">ไม่พบข้อมูลประวัติ</div> : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 border-b">
                                        <tr>
                                            <th className="px-4 py-3">วันที่เริ่ม</th>
                                            <th className="px-4 py-3">ชื่อครู</th>
                                            <th className="px-4 py-3">ประเภท</th>
                                            <th className="px-4 py-3 text-center">สถานะ</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {historyRequests.map(req => (
                                            <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 text-xs">{getThaiDate(req.startDate)}</td>
                                                <td className="px-4 py-3 font-medium text-slate-800">{req.teacherName}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-600">{getLeaveTypeName(req.type)}</td>
                                                <td className="px-4 py-3 text-center">{getStatusBadge(req.status)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <button onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="ดูเอกสาร">
                                                            <Printer size={16}/>
                                                        </button>
                                                        {canViewAll && (
                                                            <button 
                                                                onClick={() => { 
                                                                    const teacher = allTeachers.find(t => t.id === req.teacherId);
                                                                    // กรองผู้อำนวยการออกตรงนี้ด้วย
                                                                    if (teacher && checkIfDirector(teacher)) return;
                                                                    setStatTeacher(teacher || { id: req.teacherId, name: req.teacherName, position: req.teacherPosition } as any); 
                                                                    setViewMode('STATS'); 
                                                                }} 
                                                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-20" 
                                                                title="ดูสถิติบุคคล"
                                                            >
                                                                <Eye size={16}/>
                                                            </button>
                                                        )}
                                                        {(isDirectorRole || isSystemAdmin) && <button onClick={(e) => handleDelete(e, req.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="ลบ"><Trash2 size={16}/></button>}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                             )}
                        </div>
                    </div>
                </>
            )}

            {viewMode === 'FORM' && (
                 <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl border border-emerald-50 relative animate-slide-up">
                     <h3 className="text-xl font-bold mb-6 border-b pb-4 text-slate-800 flex items-center gap-2"><FilePlus className="text-emerald-600"/> แบบฟอร์มขออนุญาตลา</h3>
                     <form onSubmit={(e) => { 
                         e.preventDefault(); 
                         if (leaveType === 'OffCampus') {
                             const count = requests.filter(r => r.teacherId === currentUser.id && r.type === 'OffCampus' && r.status === 'Approved').length;
                             setOffCampusCount(count);
                             setShowWarningModal(true);
                         } else {
                             submitRequest();
                         }
                     }} className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {['Sick', 'Personal', 'Maternity', 'OffCampus', 'Late'].map(t => (
                                <button key={t} type="button" onClick={() => setLeaveType(t)} className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all ${leaveType === t ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{getLeaveTypeName(t)}</button>
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-sm font-bold text-slate-700 mb-1">วันที่เริ่มต้น</label><input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 border-slate-200"/></div>
                            <div><label className="block text-sm font-bold text-slate-700 mb-1">ถึงวันที่</label><input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 border-slate-200"/></div>
                        </div>
                        {(leaveType === 'OffCampus' || leaveType === 'Late') && (
                            <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">เวลาเริ่ม</label><input required type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 border-slate-200"/></div>
                                {leaveType === 'OffCampus' && <div><label className="block text-sm font-bold text-slate-700 mb-1">ถึงเวลา</label><input required type="time" value={endTime} onChange={e => setEndDateManual(e.target.value)} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 border-slate-200"/></div>}
                            </div>
                        )}
                        <div><label className="block text-sm font-bold text-slate-700 mb-1">เหตุผลการลา</label><textarea required value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 border-slate-200" placeholder="ระบุเหตุผล..."/></div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-1">เบอร์โทรศัพท์ (ติดต่อได้ขณะลา)</label><input required type="tel" value={mobilePhone} onChange={e => setMobilePhone(e.target.value)} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 border-slate-200" placeholder="0XX-XXX-XXXX"/></div>
                        <div><label className="block text-sm font-bold text-slate-700 mb-1">ที่อยู่ที่ติดต่อได้</label><textarea required value={contactInfo} onChange={e => setContactInfo(e.target.value)} rows={2} className="w-full px-4 py-2 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 border-slate-200"/></div>
                        <div className="flex gap-3 pt-4 border-t border-slate-100">
                            <button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-3 text-slate-600 bg-slate-100 rounded-xl font-bold hover:bg-slate-200 transition-colors">ยกเลิก</button>
                            <button type="submit" disabled={isUploading} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg disabled:opacity-50 hover:bg-emerald-700 transition-all">{isUploading ? 'กำลังส่ง...' : 'ยืนยันเสนอใบลา'}</button>
                        </div>
                     </form>
                 </div>
            )}

            {viewMode === 'PDF' && selectedRequest && (
                <div className="flex flex-col lg:flex-row gap-6 animate-slide-up">
                    <div className="flex-1 bg-slate-500 rounded-2xl overflow-hidden shadow-2xl min-h-[500px] lg:min-h-[700px] relative border-4 border-white">
                         {isGeneratingPdf ? <div className="absolute inset-0 flex items-center justify-center text-white flex-col gap-3 font-bold bg-slate-800/80"><Loader className="animate-spin" size={40}/><span className="tracking-widest">กำลังสร้างเอกสาร PDF...</span></div> : <iframe src={pdfUrl} className="w-full h-full border-none" title="Leave PDF Preview"/>}
                    </div>
                    <div className="w-full lg:w-80 space-y-4">
                        <button onClick={() => setViewMode('LIST')} className="w-full py-3 bg-white text-slate-600 rounded-xl border font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><ArrowLeft size={18}/> ย้อนกลับ</button>
                        
                        {canApprove && selectedRequest.status === 'Pending' && (
                            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200 shadow-sm animate-slide-up">
                                <h4 className="font-bold text-blue-800 mb-4 flex items-center gap-2 border-b border-blue-100 pb-2"><UserCheck size={20}/> ส่วนพิจารณา ผอ.</h4>
                                <div className="space-y-3">
                                    <button onClick={() => handleDirectorApprove(selectedRequest, true)} disabled={isProcessingApproval} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:bg-green-700 shadow-md">
                                        {isProcessingApproval ? <Loader className="animate-spin" size={20}/> : <CheckCircle size={20}/>} อนุมัติ / อนุญาต
                                    </button>
                                    <button onClick={() => handleDirectorApprove(selectedRequest, false)} disabled={isProcessingApproval} className="w-full py-3 bg-red-100 text-red-700 rounded-xl font-bold hover:bg-red-200 flex items-center justify-center gap-2">
                                        <XCircle size={18}/> ไม่อนุมัติ
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-3 text-sm flex items-center gap-2"><Clock size={16}/> รายละเอียดเบื้องต้น</h4>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between border-b border-dashed border-slate-100 pb-1"><span className="text-slate-500">ผู้ลา:</span><span className="font-bold text-slate-800">{selectedRequest.teacherName}</span></div>
                                <div className="flex justify-between border-b border-dashed border-slate-100 pb-1"><span className="text-slate-500">ประเภท:</span><span className="font-bold text-emerald-600">{getLeaveTypeName(selectedRequest.type)}</span></div>
                                <div className="flex justify-between border-b border-dashed border-slate-100 pb-1"><span className="text-slate-500">สถานะ:</span>{getStatusBadge(selectedRequest.status)}</div>
                                <div className="flex justify-between border-b border-dashed border-slate-100 pb-1"><span className="text-slate-500">วันที่เสนอ:</span><span>{getThaiDate(selectedRequest.createdAt || '')}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'SUMMARY_PREVIEW' && (
                <div className="flex flex-col lg:flex-row gap-6 animate-slide-up">
                    <div className="flex-1 bg-slate-500 rounded-2xl overflow-hidden shadow-2xl min-h-[500px] lg:min-h-[700px] relative border-4 border-white">
                         <iframe src={summaryPdfUrl} className="w-full h-full border-none" title="Summary Report PDF"/>
                    </div>
                    <div className="w-full lg:w-80 space-y-4">
                        <button onClick={() => setViewMode('STATS')} className="w-full py-3 bg-white text-slate-600 rounded-xl border font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><ArrowLeft size={18}/> ย้อนกลับ</button>
                        <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200 shadow-sm">
                            <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2 text-sm"><FileText size={16}/> บันทึกข้อความสรุปการลา</h4>
                            <p className="text-xs text-blue-600 leading-relaxed mb-4">
                                เอกสารประกอบด้วยรายชื่อบุคลากรทุกคนพร้อมสถิติการลาในช่วงเวลาที่ท่านกำหนด สามารถพิมพ์เพื่อลงนาม และให้ครูลงชื่อรับทราบได้ทันที
                            </p>
                            <button onClick={() => window.print()} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:bg-black transition-all">
                                <Printer size={18}/> พิมพ์รายงาน
                            </button>
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
                            <p className="text-xs text-slate-500">{statTeacher ? `ตำแหน่ง: ${statTeacher.position}` : 'ภาพรวมทั้งโรงเรียน'}</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 items-center justify-between">
                        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                            <div className="flex items-center gap-2 text-slate-400">
                                <Filter size={20}/>
                                <span className="text-sm font-bold text-slate-500 whitespace-nowrap">เลือกช่วงวันลา:</span>
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-blue-600 ml-1 mb-0.5 uppercase tracking-wider">เริ่ม (พ.ศ. {getBEYear(statStartDate)})</span>
                                    <input 
                                        type="date" 
                                        value={statStartDate} 
                                        onChange={(e) => setStatStartDate(e.target.value)} 
                                        className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                </div>
                                <div className="flex flex-col self-end pb-2">
                                    <span className="text-slate-300">-</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-blue-600 ml-1 mb-0.5 uppercase tracking-wider">สิ้นสุด (พ.ศ. {getBEYear(statEndDate)})</span>
                                    <input 
                                        type="date" 
                                        value={statEndDate} 
                                        onChange={(e) => setStatEndDate(e.target.value)} 
                                        className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-auto">
                            <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                กำลังเลือกช่วงวันที่: {getThaiFullDateUI(statStartDate)} ถึง {getThaiFullDateUI(statEndDate)}
                            </div>
                            {!statTeacher && (
                                <button 
                                    onClick={handleGenerateSummaryReport}
                                    disabled={isGeneratingSummary}
                                    className="bg-slate-800 text-white w-full md:w-auto px-6 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md disabled:opacity-50"
                                >
                                    {isGeneratingSummary ? <Loader className="animate-spin" size={18}/> : <FileText size={18}/>}
                                    พิมพ์บันทึกสรุปการลา (ตัวเลขไทย)
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

                                <div className="border rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 border-b whitespace-nowrap">
                                            <tr>
                                                <th className="px-6 py-3">วันที่เริ่มลา</th>
                                                <th className="px-6 py-3">ประเภท</th>
                                                <th className="px-6 py-3">เหตุผลการลา</th>
                                                <th className="px-6 py-3 text-center">จำนวนวัน</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {(() => {
                                                const filtered = requests.filter(r => 
                                                    r.teacherId === statTeacher.id && 
                                                    r.status === 'Approved' && 
                                                    r.startDate >= statStartDate && 
                                                    r.startDate <= statEndDate
                                                ).sort((a,b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

                                                return filtered.length === 0 ? (
                                                    <tr><td colSpan={4} className="text-center py-12 text-slate-400">ไม่พบรายการในช่วงเวลานี้</td></tr>
                                                ) : filtered.map(r => (
                                                    <tr key={r.id} className="hover:bg-slate-50">
                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                            <div className="font-bold text-slate-800">{getThaiDate(r.startDate)}</div>
                                                            <div className="text-[10px] text-slate-400">ถึง {getThaiDate(r.endDate)}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                                r.type === 'Sick' ? 'bg-red-50 text-red-600 border-red-100' : 
                                                                r.type === 'Personal' ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                                                                'bg-blue-50 text-blue-600 border-blue-100'
                                                            }`}>
                                                                {getLeaveTypeName(r.type)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-slate-500 italic min-w-[200px]">{r.reason}</td>
                                                        <td className="px-6 py-4 text-center font-bold text-slate-700">{toThaiDigits(calculateDays(r.startDate, r.endDate))}</td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
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
                                        {(() => {
                                            const sortedTeachers = allTeachers
                                                .filter(t => t.schoolId === currentUser.schoolId && !checkIfDirector(t)) // กรองผู้อำนวยการออกโดยใช้ตำแหน่งและสิทธิ์
                                                .sort((a, b) => {
                                                    const idxA = ACADEMIC_POSITIONS.indexOf(a.position);
                                                    const idxB = ACADEMIC_POSITIONS.indexOf(b.position);
                                                    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                                                });

                                            return sortedTeachers.map(t => {
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
                                                                className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-2 md:py-1.5 rounded-lg font-bold hover:bg-blue-600 hover:text-white transition-all text-xs whitespace-nowrap"
                                                            >
                                                                <Eye size={14}/> ตรวจสอบ
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            });
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showWarningModal && (
                 <div className="fixed inset-0 z-[1100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                     <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-scale-up text-center">
                         <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-yellow-200"><Clock size={32}/></div>
                         <h3 className="text-xl font-bold text-slate-800">แจ้งเตือนออกนอกบริเวณ</h3>
                         <p className="text-slate-500 mt-2 text-sm">เดือนนี้ท่านได้ขออนุญาตออกนอกสถานศึกษาไปแล้ว <span className="text-red-600 font-bold text-lg">{toThaiDigits(offCampusCount)}</span> ครั้ง</p>
                         <div className="flex gap-3 mt-8">
                             <button onClick={() => setShowWarningModal(false)} className="flex-1 py-3 text-slate-600 bg-slate-100 rounded-xl font-bold hover:bg-slate-200 transition-colors">ยกเลิก</button>
                             <button onClick={submitRequest} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700">ยืนยันส่งใบลา</button>
                         </div>
                     </div>
                 </div>
            )}
        </div>
    );
};

export default LeaveSystem;
