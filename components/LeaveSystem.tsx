
import React, { useState, useEffect, useMemo } from 'react';
import { LeaveRequest, Teacher, School, SystemConfig } from '../types';
import { Clock, CheckCircle, XCircle, FilePlus, UserCheck, Printer, ArrowLeft, Loader, Database, Calendar, User, ChevronRight, Trash2, AlertCircle, Eye, Filter, X, Calculator, FileText } from 'lucide-react';
import { db, isConfigured as isFirebaseConfigured, doc, getDoc, getDocs, addDoc, collection, updateDoc, deleteDoc, query, where, onSnapshot } from '../firebaseConfig';
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
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dbError, setDbError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'LIST' | 'FORM' | 'PDF' | 'SUMMARY_PREVIEW' | 'STATS'>('LIST');
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string>('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    
    const [leaveType, setLeaveType] = useState('Sick');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [mobilePhone, setMobilePhone] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [isProcessingApproval, setIsProcessingApproval] = useState(false);

    const isDirectorRole = currentUser.roles.includes('DIRECTOR');
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');
    const canViewAll = isDirectorRole || isSystemAdmin || isDocOfficer;

    const checkIfDirector = (teacher: Teacher) => teacher.roles.includes('DIRECTOR') || teacher.position.includes('ผู้อำนวยการ');
    const getThaiDate = (dateStr: string) => dateStr ? new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const getLeaveTypeName = (type: string) => { const map: any = { 'Sick': 'ลาป่วย', 'Personal': 'ลากิจส่วนตัว', 'OffCampus': 'ออกนอกบริเวณ', 'Late': 'เข้าสาย', 'Maternity': 'ลาคลอดบุตร' }; return map[type] || type; };

    useEffect(() => {
        let unsubReqs: () => void;
        let unsubConfig: () => void;
        
        if (isFirebaseConfigured && db) {
            const configRef = doc(db, "schools", currentUser.schoolId, "settings", "config");
            unsubConfig = onSnapshot(configRef, (docSnap) => { if (docSnap.exists()) setSysConfig(docSnap.data() as SystemConfig); });
            const q = query(collection(db, "leave_requests"), where("schoolId", "==", currentUser.schoolId));
            unsubReqs = onSnapshot(q, (snapshot) => {
                const fetched: LeaveRequest[] = [];
                snapshot.forEach((docSnap) => fetched.push({ ...docSnap.data(), id: docSnap.id } as LeaveRequest));
                setRequests(fetched.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
                setIsLoading(false);
            }, (error) => { console.error(error); setDbError("ล้มเหลว"); setIsLoading(false); });
        } else {
            // Mock mode if no firebase
            setIsLoading(false);
        }
        return () => { if (unsubReqs) unsubReqs(); if (unsubConfig) unsubConfig(); };
    }, [currentUser.schoolId]);

    useEffect(() => {
        if (focusRequestId && requests.length > 0) {
            const found = requests.find(r => r.id === focusRequestId);
            if (found) { setSelectedRequest(found); setViewMode('PDF'); setIsHighlighted(true); setTimeout(() => setIsHighlighted(false), 2500); if (onClearFocus) onClearFocus(); }
        }
    }, [focusRequestId, requests]);

    const calculateDays = (s: string, e: string) => (s && e) ? Math.ceil(Math.abs(new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1 : 0;

    useEffect(() => {
        const generatePdf = async () => {
            if (viewMode === 'PDF' && selectedRequest && sysConfig) {
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
                        req: selectedRequest, stats, teacher, schoolName: currentSchool?.name || 'โรงเรียน...', directorName: director?.name || '...',
                        directorSignatureBase64: sysConfig?.directorSignatureBase64, teacherSignatureBase64: teacher.signatureBase64,
                        officialGarudaBase64: sysConfig?.officialGarudaBase64, directorSignatureScale: sysConfig?.directorSignatureScale || 1.0, directorSignatureYOffset: sysConfig?.directorSignatureYOffset || 0
                    });
                    setPdfUrl(base64Pdf);
                } catch (e) { console.error(e); } finally { setIsGeneratingPdf(false); }
            }
        };
        generatePdf();
    }, [viewMode, selectedRequest, sysConfig]);

    const submitRequest = async () => {
        if (!isFirebaseConfigured || !db) {
            alert("ระบบยังไม่พร้อมใช้งานในขณะนี้ (ยังไม่มีการตั้งค่าฐานข้อมูล)");
            return;
        }
        setIsUploading(true);
        const newReq: any = {
            teacherId: currentUser.id, teacherName: currentUser.name, teacherPosition: currentUser.position,
            type: leaveType, startDate, endDate, reason, mobilePhone, status: 'Pending', createdAt: new Date().toISOString(), schoolId: currentUser.schoolId
        };
        try {
            const docRef = await addDoc(collection(db, "leave_requests"), newReq);
            if (sysConfig?.telegramBotToken) {
                const directors = allTeachers.filter(t => checkIfDirector(t));
                const message = `📢 <b>มีใบลาใหม่</b>\nจาก: ${currentUser.name}\nประเภท: ${getLeaveTypeName(leaveType)}\nเหตุผล: ${reason}`;
                directors.forEach(dir => dir.telegramChatId && sendTelegramMessage(sysConfig.telegramBotToken!, dir.telegramChatId, message, `${sysConfig.appBaseUrl}?view=LEAVE&id=${docRef.id}`));
            }
            alert('เสนอใบลาเรียบร้อยแล้ว');
            setViewMode('LIST');
        } catch(e) { alert("ล้มเหลวในการส่งข้อมูล"); } finally { setIsUploading(false); }
    };

    const handleDirectorApprove = async (req: LeaveRequest, isApproved: boolean) => {
        if (!isFirebaseConfigured || !db) return;
        setIsProcessingApproval(true);
        try {
            await updateDoc(doc(db, "leave_requests", req.id), { status: isApproved ? 'Approved' : 'Rejected', directorSignature: isApproved ? currentUser.name : '', approvedDate: new Date().toISOString().split('T')[0] });
            const targetTeacher = allTeachers.find(t => t.id === req.teacherId);
            if (targetTeacher?.telegramChatId && sysConfig?.telegramBotToken) {
                const message = `${isApproved ? '✅' : '❌'} <b>แจ้งผลการลา</b>\nรายการ: ${getLeaveTypeName(req.type)}\nผล: ${isApproved ? 'อนุมัติ' : 'ไม่อนุมัติ'}`;
                sendTelegramMessage(sysConfig.telegramBotToken, targetTeacher.telegramChatId, message, `${sysConfig.appBaseUrl}?view=LEAVE&id=${req.id}`);
            }
            alert('พิจารณาเรียบร้อยแล้ว');
            setViewMode('LIST');
        } catch (e) { alert("ล้มเหลว"); } finally { setIsProcessingApproval(false); }
    };

    const pendingRequests = (canViewAll ? requests : requests.filter(r => r.teacherId === currentUser.id)).filter(r => r.status === 'Pending');
    const historyRequests = (canViewAll ? requests : requests.filter(r => r.teacherId === currentUser.id)).filter(r => r.status !== 'Pending');

    if (isLoading) return <div className="p-10 text-center flex flex-col items-center justify-center gap-4"><Loader className="animate-spin text-blue-600" size={32}/><p>กำลังโหลดข้อมูลการลา...</p></div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className={`p-4 rounded-xl flex items-center justify-between text-white shadow-lg ${!isFirebaseConfigured ? 'bg-amber-600' : 'bg-emerald-800'}`}>
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg"><Calendar size={24}/></div>
                    <div>
                        <h2 className="text-xl font-bold leading-tight">ระบบการลา</h2>
                        <p className="text-[10px] opacity-80 uppercase tracking-wider">{!isFirebaseConfigured ? 'Local Mock Mode' : 'Cloud Connected'}</p>
                    </div>
                </div>
            </div>

            {viewMode === 'LIST' && (
                <>
                    <div className="flex justify-between items-center bg-white p-3 rounded-xl shadow-sm border">
                        <div className="text-slate-600 font-bold">รายการลา ({requests.length})</div>
                        <button onClick={() => setViewMode('FORM')} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 font-bold text-xs"><FilePlus size={18}/> ยื่นใบลาใหม่</button>
                    </div>
                    {pendingRequests.map(req => (
                        <div key={req.id} onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className={`bg-white rounded-xl shadow border-l-4 border-l-yellow-400 p-4 mb-4 cursor-pointer hover:shadow-lg transition-all ${isHighlighted && req.id === focusRequestId ? 'ring-4 ring-yellow-200' : ''}`}>
                            <div className="flex justify-between items-start mb-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><User size={16}/></div><div className="font-bold text-slate-800 text-sm">{req.teacherName}<div className="text-[10px] text-slate-400 font-normal">{req.teacherPosition}</div></div></div></div>
                            <div className="space-y-1 mb-2 text-sm"><div className="flex justify-between border-b pb-1"><span className="text-slate-500">ประเภท:</span><span className="font-bold text-indigo-600">{getLeaveTypeName(req.type)}</span></div></div>
                        </div>
                    ))}
                    <div className="bg-white rounded-xl border overflow-hidden mt-6 shadow-sm">
                        <div className="p-4 bg-slate-50 font-bold border-b text-slate-700">ประวัติล่าสุด</div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">วันที่เริ่ม</th><th className="p-4">ชื่อ</th><th className="p-4">ประเภท</th><th className="p-4 text-center">สถานะ</th><th className="p-4"></th></tr></thead>
                                <tbody className="divide-y">{historyRequests.map(req => (<tr key={req.id} className="hover:bg-slate-50 transition-colors"><td className="p-4">{getThaiDate(req.startDate)}</td><td className="p-4 font-medium">{req.teacherName}</td><td className="p-4">{getLeaveTypeName(req.type)}</td><td className="p-4 text-center">{req.status === 'Approved' ? '✅ อนุมัติ' : '❌ ไม่อนุมัติ'}</td><td className="p-4 text-right"><button onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className="text-blue-500 hover:text-blue-700"><Printer size={18}/></button></td></tr>))}</tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {viewMode === 'FORM' && (
                <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-xl border border-emerald-50 animate-slide-up">
                    <h3 className="text-xl font-bold mb-6 border-b pb-4 text-slate-800 flex items-center gap-2"><FilePlus className="text-emerald-600"/> แบบฟอร์มขออนุญาตลา</h3>
                    <form onSubmit={(e) => { e.preventDefault(); submitRequest(); }} className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{['Sick', 'Personal', 'Maternity', 'OffCampus', 'Late'].map(t => (<button key={t} type="button" onClick={() => setLeaveType(t)} className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all ${leaveType === t ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-slate-600'}`}>{getLeaveTypeName(t)}</button>))}</div>
                        <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-bold text-slate-700">เริ่มวันที่</label><input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl"/></div><div><label className="block text-sm font-bold text-slate-700">ถึงวันที่</label><input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2 border rounded-xl"/></div></div>
                        <div><label className="block text-sm font-bold text-slate-700">เหตุผล</label><textarea required value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full px-4 py-2 border rounded-xl"/></div>
                        <div><label className="block text-sm font-bold text-slate-700">เบอร์โทร</label><input required type="tel" value={mobilePhone} onChange={e => setMobilePhone(e.target.value)} className="w-full px-4 py-2 border rounded-xl"/></div>
                        <div className="flex gap-3 pt-4 border-t"><button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">ยกเลิก</button><button type="submit" disabled={isUploading} className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg">{isUploading ? 'กำลังส่ง...' : 'ยืนยันเสนอใบลา'}</button></div>
                    </form>
                </div>
            )}

            {viewMode === 'PDF' && selectedRequest && (
                <div className="flex flex-col lg:flex-row gap-6 animate-slide-up">
                    <div className="flex-1 bg-slate-500 rounded-2xl overflow-hidden shadow-2xl min-h-[500px] relative border-4 border-white">{isGeneratingPdf ? <div className="absolute inset-0 flex items-center justify-center text-white font-bold bg-slate-800/80">กำลังสร้าง PDF...</div> : <iframe src={pdfUrl} title="Leave Request PDF" className="w-full h-full border-none"/>}</div>
                    <div className="w-full lg:w-80 space-y-4">
                        <button onClick={() => setViewMode('LIST')} className="w-full py-3 bg-white text-slate-600 rounded-xl border font-bold flex items-center justify-center gap-2 hover:bg-slate-50 shadow-sm"><ArrowLeft size={18}/> ย้อนกลับ</button>
                        {isDirectorRole && selectedRequest.status === 'Pending' && (
                            <div className="bg-blue-50 p-5 rounded-2xl border border-blue-200 shadow-sm"><h4 className="font-bold text-blue-800 mb-4 flex items-center gap-2"><UserCheck size={20}/> ส่วนพิจารณา ผอ.</h4><div className="space-y-3"><button onClick={() => handleDirectorApprove(selectedRequest, true)} disabled={isProcessingApproval} className="w-full py-4 bg-green-600 text-white rounded-xl font-bold shadow-md">อนุมัติ</button><button onClick={() => handleDirectorApprove(selectedRequest, false)} disabled={isProcessingApproval} className="w-full py-3 bg-red-100 text-red-700 rounded-xl font-bold">ไม่อนุมัติ</button></div></div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeaveSystem;
