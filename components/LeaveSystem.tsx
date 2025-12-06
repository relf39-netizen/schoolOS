import React, { useState, useEffect } from 'react';
import { LeaveRequest, Teacher } from '../types';
import { Clock, CheckCircle, XCircle, FilePlus, AlertTriangle, FileText, Download, UserCheck, Printer, ArrowLeft, Loader, Database, ServerOff } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { MOCK_LEAVE_REQUESTS } from '../constants';

interface LeaveSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
}

const LeaveSystem: React.FC<LeaveSystemProps> = ({ currentUser, allTeachers }) => {
    // State
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // View Modes: LIST | FORM | PDF | REPORT_DASHBOARD
    const [viewMode, setViewMode] = useState<'LIST' | 'FORM' | 'PDF' | 'REPORT_DASHBOARD'>('LIST');
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);

    // Form State
    const [leaveType, setLeaveType] = useState('Sick');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');

    // Warning Modal State
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [offCampusCount, setOffCampusCount] = useState(0);

    // Report State
    const [reportRange, setReportRange] = useState({ start: new Date().getFullYear()+'-05-16', end: (new Date().getFullYear()+1)+'-03-31' }); 
    const [reportType, setReportType] = useState<'OVERVIEW' | 'INDIVIDUAL'>('OVERVIEW');
    const [selectedTeacherForReport, setSelectedTeacherForReport] = useState<string>(allTeachers[0]?.id || 't1');

    // Permissions
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DOCUMENT_OFFICER'); 
    const canApprove = isDirector;

    // --- Data Connection (Hybrid) ---
    useEffect(() => {
        if (isConfigured && db) {
            // 1. Real Mode: Connect to Firestore
            const q = query(collection(db, "leave_requests"), orderBy("createdAt", "desc"));
            const unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
                const fetchedRequests: LeaveRequest[] = [];
                querySnapshot.forEach((doc) => {
                    fetchedRequests.push({ id: doc.id, ...doc.data() } as LeaveRequest);
                });
                setRequests(fetchedRequests);
                setIsLoading(false);
            }, (error) => {
                console.error("Error fetching leave requests:", error);
                // Fallback to mock on permission error or other issues
                setRequests(MOCK_LEAVE_REQUESTS);
                setIsLoading(false);
            });
            return () => unsubscribe();
        } else {
            // 2. Mock Mode: Use local constant data
            console.log("Using Mock Data for Leave System");
            // Simulate network delay for realism
            setTimeout(() => {
                setRequests(MOCK_LEAVE_REQUESTS);
                setIsLoading(false);
            }, 800);
        }
    }, []);

    // --- Helpers ---

    const getLeaveTypeName = (type: string) => {
        const map: {[key:string]: string} = { 
            'Sick': 'ลาป่วย', 
            'Personal': 'ลากิจ', 
            'OffCampus': 'ออกนอกบริเวณ',
            'Late': 'เข้าสาย'
        };
        return map[type] || type;
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'Approved': return <span className="flex items-center gap-1 text-green-600 bg-green-100 px-2 py-1 rounded-full text-xs font-medium"><CheckCircle size={12}/> อนุมัติแล้ว</span>;
            case 'Rejected': return <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-1 rounded-full text-xs font-medium"><XCircle size={12}/> ไม่อนุมัติ</span>;
            default: return <span className="flex items-center gap-1 text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full text-xs font-medium"><Clock size={12}/> รออนุมัติ</span>;
        }
    };

    const countWorkingDays = (startStr: string, endStr: string) => {
        const start = new Date(startStr);
        const end = new Date(endStr);
        let count = 0;
        const cur = new Date(start);
        while (cur <= end) {
            const dayOfWeek = cur.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) count++; 
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    };

    const calculateStats = (tid: string, dateRange?: {start: string, end: string}) => {
        let userRequests = requests.filter(r => r.teacherId === tid && r.status === 'Approved');
        
        if (dateRange) {
            userRequests = userRequests.filter(r => 
                r.startDate >= dateRange.start && r.startDate <= dateRange.end
            );
        }

        const sick = userRequests.filter(r => r.type === 'Sick').length;
        const personal = userRequests.filter(r => r.type === 'Personal').length;
        const offCampus = userRequests.filter(r => r.type === 'OffCampus').length;
        const late = userRequests.filter(r => r.type === 'Late').length;
        
        const totalLeaveDays = userRequests.filter(r => r.type === 'Sick' || r.type === 'Personal').reduce((acc, r) => {
            const d1 = new Date(r.startDate);
            const d2 = new Date(r.endDate);
            const diffTime = Math.abs(d2.getTime() - d1.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
            return acc + diffDays;
        }, 0);

        return { sick, personal, offCampus, late, totalRequests: userRequests.length, totalLeaveDays, rawData: userRequests };
    };

    // --- Handlers ---

    const handleFormInit = () => {
        setViewMode('FORM');
        setLeaveType('Sick');
        setStartDate('');
        setEndDate('');
        setStartTime('');
        setEndTime('');
        setReason('');
    };

    const handleLeaveTypeChange = (type: string) => {
        setLeaveType(type);
        if (type === 'OffCampus' || type === 'Late') {
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            
            setStartDate(dateStr);
            setEndDate(dateStr);
            setStartTime(timeStr);
        } else {
            setStartDate('');
            setEndDate('');
            setStartTime('');
        }
    };

    const handlePreSubmitCheck = (e: React.FormEvent) => {
        e.preventDefault();
        if (leaveType === 'OffCampus') {
            const count = requests.filter(r => r.teacherId === currentUser.id && r.type === 'OffCampus').length;
            setOffCampusCount(count);
            setShowWarningModal(true);
        } else {
            submitRequest();
        }
    };

    const submitRequest = async () => {
        const newReq: any = {
            teacherId: currentUser.id,
            teacherName: currentUser.name,
            type: leaveType,
            startDate,
            endDate,
            startTime: (leaveType === 'OffCampus' || leaveType === 'Late') ? startTime : undefined,
            endTime: leaveType === 'OffCampus' ? endTime : undefined,
            reason,
            status: 'Pending',
            teacherSignature: currentUser.name,
            createdAt: new Date().toISOString()
        };

        const performMockSave = () => {
             const mockReq = { ...newReq, id: `mock_${Date.now()}` };
             setRequests([mockReq, ...requests]);
             alert('ส่งคำขอเรียบร้อยแล้ว (บันทึกข้อมูลแบบออฟไลน์)');
             setViewMode('LIST');
             setShowWarningModal(false);
        };

        if (isConfigured && db) {
            try {
                // Try Real DB
                await addDoc(collection(db, "leave_requests"), newReq);
                alert('ส่งคำขอเรียบร้อยแล้ว (บันทึกฐานข้อมูล)');
                setViewMode('LIST');
                setShowWarningModal(false);
            } catch (e) {
                console.warn("Database Error, falling back to mock:", e);
                // Fallback to Mock if DB fails
                performMockSave();
            }
        } else {
            // Mock DB
            performMockSave();
        }
    };

    const handleDirectorApprove = async (req: LeaveRequest, isApproved: boolean) => {
        const updatedData = {
            status: isApproved ? 'Approved' : 'Rejected',
            directorSignature: isApproved ? 'นายอำนวย การดี' : undefined,
            approvedDate: new Date().toISOString().split('T')[0]
        };

        const performMockUpdate = () => {
            const updatedRequests = requests.map(r => {
                if (r.id === req.id) {
                    return { ...r, ...updatedData } as LeaveRequest;
                }
                return r;
            });
            setRequests(updatedRequests);
            setSelectedRequest(null);
            alert(`บันทึกผลการพิจารณาเรียบร้อย (ออฟไลน์)`);
        };

        if (isConfigured && db) {
            try {
                 // Real DB
                 const reqRef = doc(db, "leave_requests", req.id);
                 await updateDoc(reqRef, updatedData);
                 setSelectedRequest(null);
                 alert(`บันทึกผลการพิจารณาเรียบร้อย`);
            } catch(e) {
                console.warn("Database Error, falling back to mock:", e);
                performMockUpdate();
            }
        } else {
            // Mock DB
            performMockUpdate();
        }
    };

    // --- Renderers ---

    const renderStatsSummary = () => {
        if (!isDirector && !isSystemAdmin) {
            const stats = calculateStats(currentUser.id);
            return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center">
                        <div className="text-slate-500 text-xs mb-1">ลาป่วย (ครั้ง)</div>
                        <div className="text-2xl font-bold text-red-500">{stats.sick}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center">
                        <div className="text-slate-500 text-xs mb-1">ลากิจ (ครั้ง)</div>
                        <div className="text-2xl font-bold text-blue-500">{stats.personal}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center">
                        <div className="text-slate-500 text-xs mb-1">ออกนอกบริเวณ</div>
                        <div className="text-2xl font-bold text-orange-500">{stats.offCampus}</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col items-center">
                        <div className="text-slate-500 text-xs mb-1">เข้าสาย</div>
                        <div className="text-2xl font-bold text-purple-500">{stats.late}</div>
                    </div>
                </div>
            );
        } else {
            return (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <UserCheck size={18} className="text-slate-500"/>
                            <h3 className="font-bold text-slate-700">สรุปสถิติการลาของบุคลากร (ทั้งหมด)</h3>
                        </div>
                        <button onClick={() => setViewMode('REPORT_DASHBOARD')} className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1">
                            <Printer size={12}/> ออกรายงานสรุป
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">ชื่อ-สกุล</th>
                                    <th className="px-4 py-3 text-center text-red-600">ป่วย</th>
                                    <th className="px-4 py-3 text-center text-blue-600">กิจ</th>
                                    <th className="px-4 py-3 text-center text-orange-600">นอกบริเวณ</th>
                                    <th className="px-4 py-3 text-center text-purple-600">สาย</th>
                                    <th className="px-4 py-3 text-center font-bold">รวม(ครั้ง)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {allTeachers.map(t => {
                                    const stats = calculateStats(t.id);
                                    return (
                                        <tr key={t.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 font-medium text-slate-700">{t.name}</td>
                                            <td className="px-4 py-2 text-center">{stats.sick}</td>
                                            <td className="px-4 py-2 text-center">{stats.personal}</td>
                                            <td className="px-4 py-2 text-center">{stats.offCampus}</td>
                                            <td className="px-4 py-2 text-center">{stats.late}</td>
                                            <td className="px-4 py-2 text-center font-bold bg-slate-50">{stats.totalRequests}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }
    };

    const renderPDF = (req: LeaveRequest) => (
        <div className="bg-white border border-slate-300 shadow-lg p-8 min-h-[800px] w-full max-w-[700px] mx-auto relative font-serif text-slate-900 leading-relaxed print:shadow-none print:border-none">
             <div className="text-center mb-8">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Emblem_of_the_Ministry_of_Education_of_Thailand.svg/1200px-Emblem_of_the_Ministry_of_Education_of_Thailand.svg.png" alt="Garuda" className="h-16 mx-auto mb-4" />
                <h2 className="text-xl font-bold">บันทึกข้อความ / แบบขออนุญาตลา</h2>
                <div className="text-sm">โรงเรียนตัวอย่างวิทยา อำเภอเมือง จังหวัดกรุงเทพมหานคร</div>
             </div>
             <div className="flex justify-end mb-4"><div className="text-sm">วันที่ {req.startDate}</div></div>
             <div className="mb-6 space-y-4">
                <div><span className="font-bold">เรื่อง</span> ขออนุญาต {getLeaveTypeName(req.type)}</div>
                <div><span className="font-bold">เรียน</span> ผู้อำนวยการโรงเรียน</div>
             </div>
             <div className="indent-8 text-justify mb-6">
                ข้าพเจ้า <span className="font-bold">{req.teacherName}</span> ตำแหน่ง ครูผู้ช่วย
                มีความประสงค์ขออนุญาต <span className="font-bold underline">{getLeaveTypeName(req.type)}</span>
                เนื่องจาก <span className="underline">{req.reason}</span>
             </div>
             <div className="indent-8 text-justify mb-6">
                 {req.type === 'OffCampus' ? (
                     <>โดยขออนุญาตออกนอกบริเวณโรงเรียน ตั้งแต่เวลา <span className="font-bold">{req.startTime} น.</span> ถึงเวลา <span className="font-bold">{req.endTime || '...........'} น.</span> ในวันที่ {req.startDate}</>
                 ) : req.type === 'Late' ? (
                     <>โดยขออนุญาตเข้าสายและคาดว่าจะมาถึงในเวลา <span className="font-bold">{req.startTime} น.</span> ในวันที่ {req.startDate}</>
                 ) : (
                     <>ตั้งแต่วันที่ <span className="font-bold">{req.startDate}</span> ถึงวันที่ <span className="font-bold">{req.endDate}</span></>
                 )}
                 &nbsp;เมื่อครบกำหนดแล้ว ข้าพเจ้าจะมาปฏิบัติหน้าที่ตามปกติ
             </div>
             <div className="indent-8 mb-12">จึงเรียนมาเพื่อโปรดพิจารณา</div>
             <div className="flex flex-col items-end mb-12 pr-8">
                 <div className="text-center">
                     <div className="font-cursive text-xl mb-1 text-blue-900">{req.teacherSignature}</div>
                     <div>({req.teacherName})</div>
                     <div className="text-sm text-slate-500">ผู้ขออนุญาต</div>
                 </div>
             </div>
             <div className="border-t border-slate-300 my-8 pt-4">
                 <h3 className="font-bold text-center underline mb-4">ความเห็น / คำสั่ง ผู้อำนวยการ</h3>
                 <div className="flex justify-between px-8">
                    <div className="flex items-center gap-2"><div className={`w-4 h-4 border border-black ${req.status === 'Approved' ? 'bg-black' : ''}`}></div> อนุญาต</div>
                    <div className="flex items-center gap-2"><div className={`w-4 h-4 border border-black ${req.status === 'Rejected' ? 'bg-black' : ''}`}></div> ไม่อนุมัติ</div>
                 </div>
                 {req.status === 'Approved' && (
                     <div className="flex flex-col items-center mt-8">
                         <div className="font-cursive text-2xl mb-1 text-blue-900 transform -rotate-3">{req.directorSignature}</div>
                         <div>( นายอำนวย การดี )</div>
                         <div className="text-sm">ผู้อำนวยการโรงเรียน</div>
                         <div className="text-xs text-slate-500">{req.approvedDate}</div>
                     </div>
                 )}
             </div>
        </div>
    );

    // --- REPORT GENERATOR ---
    const renderReportDashboard = () => {
        const workingDays = countWorkingDays(reportRange.start, reportRange.end);
        
        return (
            <div className="animate-fade-in bg-slate-100 min-h-screen p-4 md:p-8">
                <div className="max-w-5xl mx-auto space-y-6">
                    {/* Controls (Hidden on Print) */}
                    <div className="bg-white rounded-xl shadow-sm p-6 print:hidden flex flex-col md:flex-row gap-6 items-end">
                        <div className="flex-1 space-y-4 w-full">
                             <div className="flex items-center gap-2 mb-4 text-slate-800">
                                <button onClick={() => setViewMode('LIST')} className="p-1 hover:bg-slate-100 rounded-full"><ArrowLeft/></button>
                                <h2 className="text-xl font-bold">ออกรายงานสถิติการลา / การปฏิบัติงาน</h2>
                             </div>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-slate-500 mb-1">วันที่เริ่มต้น</label>
                                    <input type="date" value={reportRange.start} onChange={e => setReportRange({...reportRange, start: e.target.value})} className="w-full border rounded-lg px-3 py-2"/>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-500 mb-1">วันที่สิ้นสุด</label>
                                    <input type="date" value={reportRange.end} onChange={e => setReportRange({...reportRange, end: e.target.value})} className="w-full border rounded-lg px-3 py-2"/>
                                </div>
                             </div>

                             <div>
                                <label className="block text-sm text-slate-500 mb-2">ประเภทรายงาน</label>
                                <div className="flex gap-2">
                                    <button onClick={() => setReportType('OVERVIEW')} className={`flex-1 py-2 rounded-lg border text-sm font-bold ${reportType === 'OVERVIEW' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}>
                                        สรุปภาพรวมโรงเรียน
                                    </button>
                                    <button onClick={() => setReportType('INDIVIDUAL')} className={`flex-1 py-2 rounded-lg border text-sm font-bold ${reportType === 'INDIVIDUAL' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600'}`}>
                                        ประวัติรายบุคคล
                                    </button>
                                </div>
                             </div>
                             
                             {reportType === 'INDIVIDUAL' && (
                                 <div>
                                    <label className="block text-sm text-slate-500 mb-1">เลือกบุคลากร</label>
                                    <select value={selectedTeacherForReport} onChange={e => setSelectedTeacherForReport(e.target.value)} className="w-full border rounded-lg px-3 py-2">
                                        {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                 </div>
                             )}
                        </div>
                        <div className="w-full md:w-auto">
                            <button onClick={() => window.print()} className="w-full py-3 px-6 bg-slate-800 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-slate-900 shadow-lg">
                                <Printer size={20}/> พิมพ์เอกสาร
                            </button>
                        </div>
                    </div>

                    {/* Paper Preview */}
                    <div className="bg-white shadow-2xl p-10 min-h-[1000px] font-sarabun text-slate-900 print:shadow-none print:p-0 print:border-none print:w-full">
                        
                        {/* Header */}
                        <div className="text-center mb-8">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Emblem_of_the_Ministry_of_Education_of_Thailand.svg/1200px-Emblem_of_the_Ministry_of_Education_of_Thailand.svg.png" alt="Garuda" className="h-20 mx-auto mb-4 grayscale opacity-80" />
                            <h2 className="text-2xl font-bold mb-2">
                                {reportType === 'OVERVIEW' ? 'แบบสรุปวันลาและสถิติการมาปฏิบัติราชการ' : 'ประวัติการลาและการปฏิบัติราชการรายบุคคล'}
                            </h2>
                            <p className="text-lg">โรงเรียนตัวอย่างวิทยา อำเภอเมือง จังหวัดกรุงเทพมหานคร</p>
                            <p className="text-base text-slate-600 mt-2">
                                ระหว่างวันที่ {new Date(reportRange.start).toLocaleDateString('th-TH', {dateStyle:'long'})} ถึง {new Date(reportRange.end).toLocaleDateString('th-TH', {dateStyle:'long'})}
                            </p>
                            <p className="text-sm text-slate-500 mt-1">
                                (รวมวันทำการทั้งหมด {workingDays} วัน)
                            </p>
                        </div>

                        {/* Content: Overview Table */}
                        {reportType === 'OVERVIEW' && (
                            <table className="w-full border-collapse border border-slate-400 mb-8 text-sm">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th rowSpan={2} className="border border-slate-400 p-2 w-10">ที่</th>
                                        <th rowSpan={2} className="border border-slate-400 p-2">ชื่อ - สกุล</th>
                                        <th rowSpan={2} className="border border-slate-400 p-2 text-center w-20">วันทำการ<br/>(วัน)</th>
                                        <th colSpan={4} className="border border-slate-400 p-2 text-center">จำนวนครั้งการลา</th>
                                        <th rowSpan={2} className="border border-slate-400 p-2 text-center w-20">รวมลา<br/>(วัน)</th>
                                        <th rowSpan={2} className="border border-slate-400 p-2 text-center w-20">มาทำงาน<br/>(วัน)</th>
                                        <th rowSpan={2} className="border border-slate-400 p-2 text-center w-24">หมายเหตุ</th>
                                    </tr>
                                    <tr>
                                        <th className="border border-slate-400 p-1 text-center w-12 text-xs">ป่วย</th>
                                        <th className="border border-slate-400 p-1 text-center w-12 text-xs">กิจ</th>
                                        <th className="border border-slate-400 p-1 text-center w-12 text-xs">นอกฯ</th>
                                        <th className="border border-slate-400 p-1 text-center w-12 text-xs">สาย</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {allTeachers.map((t, index) => {
                                        const stats = calculateStats(t.id, reportRange);
                                        const presentDays = workingDays - stats.totalLeaveDays;
                                        return (
                                            <tr key={t.id}>
                                                <td className="border border-slate-400 p-2 text-center">{index + 1}</td>
                                                <td className="border border-slate-400 p-2">{t.name}</td>
                                                <td className="border border-slate-400 p-2 text-center">{workingDays}</td>
                                                <td className="border border-slate-400 p-2 text-center">{stats.sick || '-'}</td>
                                                <td className="border border-slate-400 p-2 text-center">{stats.personal || '-'}</td>
                                                <td className="border border-slate-400 p-2 text-center">{stats.offCampus || '-'}</td>
                                                <td className="border border-slate-400 p-2 text-center">{stats.late || '-'}</td>
                                                <td className="border border-slate-400 p-2 text-center font-bold">{stats.totalLeaveDays}</td>
                                                <td className="border border-slate-400 p-2 text-center font-bold">{presentDays}</td>
                                                <td className="border border-slate-400 p-2"></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                        {/* Content: Individual History */}
                        {reportType === 'INDIVIDUAL' && (
                            <div>
                                <div className="mb-6 border p-4 rounded bg-slate-50">
                                    {(() => {
                                        const t = allTeachers.find(te => te.id === selectedTeacherForReport);
                                        const s = calculateStats(selectedTeacherForReport, reportRange);
                                        return (
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-lg">{t?.name}</h3>
                                                    <p className="text-slate-600">{t?.position}</p>
                                                </div>
                                                <div className="text-right text-sm">
                                                    <p>มาปฏิบัติงาน: <span className="font-bold">{workingDays - s.totalLeaveDays}</span> / {workingDays} วัน</p>
                                                    <p>ลาป่วย: {s.sick} ครั้ง | ลากิจ: {s.personal} ครั้ง</p>
                                                    <p>สาย: {s.late} ครั้ง</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <table className="w-full border-collapse border border-slate-400 mb-8 text-sm">
                                    <thead className="bg-slate-100">
                                        <tr>
                                            <th className="border border-slate-400 p-2 text-center w-12">ที่</th>
                                            <th className="border border-slate-400 p-2 w-32">วันที่</th>
                                            <th className="border border-slate-400 p-2 w-24">ประเภท</th>
                                            <th className="border border-slate-400 p-2">เหตุผล / รายละเอียด</th>
                                            <th className="border border-slate-400 p-2 text-center w-24">สถานะ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {calculateStats(selectedTeacherForReport, reportRange).rawData.length === 0 ? (
                                             <tr><td colSpan={5} className="border border-slate-400 p-4 text-center text-slate-500">ไม่มีประวัติการลาในช่วงเวลานี้</td></tr>
                                        ) : (
                                            calculateStats(selectedTeacherForReport, reportRange).rawData.map((req, idx) => (
                                                <tr key={req.id}>
                                                    <td className="border border-slate-400 p-2 text-center">{idx + 1}</td>
                                                    <td className="border border-slate-400 p-2 text-center">{req.startDate}</td>
                                                    <td className="border border-slate-400 p-2 text-center">{getLeaveTypeName(req.type)}</td>
                                                    <td className="border border-slate-400 p-2">
                                                        {req.reason}
                                                        {(req.type === 'OffCampus' || req.type === 'Late') && <div className="text-xs text-slate-500">เวลา: {req.startTime} - {req.endTime}</div>}
                                                    </td>
                                                    <td className="border border-slate-400 p-2 text-center">
                                                        {req.status === 'Approved' ? 'อนุมัติ' : req.status === 'Rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Footer Signatures */}
                        <div className="flex justify-between mt-16 px-10 page-break-inside-avoid">
                            <div className="text-center">
                                <p className="mb-8">ลงชื่อ.......................................................ผู้จัดทำ</p>
                                <p>(เจ้าหน้าที่งานบุคลากร)</p>
                                <p className="mt-1">วันที่ ........../........../..........</p>
                            </div>
                            <div className="text-center">
                                <p className="mb-8">ลงชื่อ.......................................................ผู้รับรอง</p>
                                <p>( นายอำนวย การดี )</p>
                                <p>ผู้อำนวยการโรงเรียนตัวอย่างวิทยา</p>
                                <p className="mt-1">วันที่ ........../........../..........</p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        );
    };


    const filteredRequests = (isDirector || isSystemAdmin)
        ? requests // Admin/Director sees all
        : requests.filter(r => r.teacherId === currentUser.id); // Teacher sees own

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400 flex-col gap-2">
                <Loader className="animate-spin" size={32}/>
                <p>กำลังเชื่อมต่อข้อมูล...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            {viewMode !== 'REPORT_DASHBOARD' && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-800 text-white p-4 rounded-xl print:hidden">
                    <div>
                        <h2 className="text-xl font-bold">ระบบการลาอิเล็กทรอนิกส์</h2>
                        <div className="flex items-center gap-2 text-sm text-emerald-100">
                             <span>ผู้ใช้งาน: <span className="font-bold text-yellow-300">{currentUser.name}</span></span>
                             <span className="text-slate-400">|</span>
                             <span className="flex items-center gap-1">
                                {isConfigured ? <Database size={14} className="text-green-400"/> : <ServerOff size={14} className="text-orange-400"/>}
                                {isConfigured ? 'ออนไลน์ (Firebase)' : 'ออฟไลน์ (Mock Data)'}
                             </span>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LIST VIEW --- */}
            {viewMode === 'LIST' && (
                <>
                    {/* NEW: Statistics Summary */}
                    {renderStatsSummary()}

                    <div className="flex justify-between items-center">
                        <div className="text-slate-600">
                            ประวัติการลา {filteredRequests.length} รายการ
                        </div>
                        <button onClick={handleFormInit} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                            <FilePlus size={18} />
                            <span>ยื่นใบลาใหม่</span>
                        </button>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-4 py-3">ผู้ขอ</th>
                                    <th className="px-4 py-3">ประเภท</th>
                                    <th className="px-4 py-3">ช่วงเวลา</th>
                                    <th className="px-4 py-3">เหตุผล</th>
                                    <th className="px-4 py-3 text-center">สถานะ</th>
                                    <th className="px-4 py-3 text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRequests.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">ยังไม่มีรายการคำขอ</td>
                                    </tr>
                                )}
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium">{req.teacherName}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs border ${
                                                req.type === 'OffCampus' ? 'bg-orange-50 border-orange-200 text-orange-700' : 
                                                req.type === 'Late' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                                                'bg-slate-50 border-slate-200 text-slate-600'
                                            }`}>
                                                {getLeaveTypeName(req.type)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {req.type === 'OffCampus' 
                                                ? `${req.startDate} (${req.startTime} - ${req.endTime || '...'})`
                                                : req.type === 'Late'
                                                ? `${req.startDate} (ถึง ${req.startTime})`
                                                : req.startDate === req.endDate ? req.startDate : `${req.startDate} ถึง ${req.endDate}`
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{req.reason}</td>
                                        <td className="px-4 py-3 flex justify-center">
                                            {getStatusBadge(req.status)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {canApprove && req.status === 'Pending' && (
                                                <button onClick={() => setSelectedRequest(req)} className="text-blue-600 hover:text-blue-800 text-xs underline mr-2">
                                                    พิจารณา
                                                </button>
                                            )}
                                            {req.status === 'Approved' && (
                                                <button onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className="text-emerald-600 hover:text-emerald-800 flex items-center gap-1 justify-end w-full">
                                                    <FileText size={14}/> ดูใบลา
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* --- REPORT DASHBOARD VIEW --- */}
            {viewMode === 'REPORT_DASHBOARD' && renderReportDashboard()}

            {/* --- FORM VIEW (TEACHER) --- */}
            {viewMode === 'FORM' && (
                <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-lg border border-emerald-100">
                    <h3 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">แบบฟอร์มขออนุญาต</h3>
                    
                    {/* Warning Alerts based on type */}
                    {(leaveType === 'Sick' || leaveType === 'Personal') && (
                        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-4 flex items-start gap-3">
                            <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                            <p className="text-sm">กรุณายื่นใบลาล่วงหน้าอย่างน้อย 3 วันทำการ (ยกเว้นกรณีฉุกเฉิน)</p>
                        </div>
                    )}
                    {leaveType === 'OffCampus' && (
                         <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg mb-4 flex items-start gap-3">
                            <Clock className="shrink-0 mt-0.5" size={18} />
                            <p className="text-sm">ระบบจะบันทึกเวลาออก <strong>ณ ปัจจุบัน</strong> โดยอัตโนมัติ</p>
                        </div>
                    )}
                    {leaveType === 'Late' && (
                         <div className="bg-purple-50 border border-purple-200 text-purple-800 px-4 py-3 rounded-lg mb-4 flex items-start gap-3">
                            <Clock className="shrink-0 mt-0.5" size={18} />
                            <p className="text-sm">ขออนุญาตเข้าสาย (ฉุกเฉิน) ระบบบันทึกเป็น <strong>วันที่ปัจจุบัน</strong></p>
                        </div>
                    )}

                    <form onSubmit={handlePreSubmitCheck} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">ประเภทการลา</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {['Sick', 'Personal', 'OffCampus', 'Late'].map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleLeaveTypeChange(type)}
                                        className={`py-2 px-2 rounded-lg text-sm font-medium border transition-all ${
                                            leaveType === type 
                                                ? type === 'Late' ? 'bg-purple-600 text-white border-purple-600' : 'bg-emerald-600 text-white border-emerald-600 shadow-md' 
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        {getLeaveTypeName(type)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">วันที่</label>
                                <input 
                                    required 
                                    type="date" 
                                    value={startDate} 
                                    onChange={e => setStartDate(e.target.value)} 
                                    disabled={leaveType === 'OffCampus' || leaveType === 'Late'}
                                    className={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 ${leaveType === 'OffCampus' || leaveType === 'Late' ? 'bg-slate-100 text-slate-500' : ''}`} 
                                />
                            </div>
                            
                            {leaveType === 'OffCampus' ? (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">เวลาออก (ปัจจุบัน)</label>
                                    <input 
                                        type="time" 
                                        value={startTime}
                                        disabled
                                        className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-500" 
                                    />
                                </div>
                            ) : leaveType === 'Late' ? (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">คาดว่าจะมาถึง</label>
                                    <input 
                                        type="time" 
                                        value={startTime}
                                        onChange={e => setStartTime(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-purple-50" 
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">ถึงวันที่</label>
                                    <input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                                </div>
                            )}
                        </div>
                        
                        {leaveType === 'OffCampus' && (
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">เวลากลับ (โดยประมาณ/ถ้ามี)</label>
                                <input 
                                    type="time" 
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" 
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">เหตุผลการลา</label>
                            <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" placeholder="ระบุสาเหตุ..."></textarea>
                        </div>

                        <div className="flex gap-3 pt-4 border-t mt-6">
                            <button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-2 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">ยกเลิก</button>
                            <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 shadow-sm font-bold">บันทึกข้อมูล</button>
                        </div>
                    </form>
                </div>
            )}

            {/* --- PDF / DETAIL VIEW --- */}
            {viewMode === 'PDF' && selectedRequest && (
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 bg-slate-200 rounded-xl p-4 overflow-y-auto shadow-inner custom-scrollbar flex justify-center">
                        {renderPDF(selectedRequest)}
                    </div>
                    <div className="w-full lg:w-64 flex flex-col gap-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-2">การดำเนินการ</h4>
                            <button onClick={() => window.print()} className="w-full mb-2 py-2 bg-slate-800 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-slate-900">
                                <Download size={16}/> ดาวน์โหลด/พิมพ์
                            </button>
                            <button onClick={() => setViewMode('LIST')} className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                                ปิดหน้าต่าง
                            </button>
                        </div>
                        {selectedRequest.status === 'Approved' && (
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                                <p>เอกสารนี้ได้รับการอนุมัติแล้ว สามารถดาวน์โหลดเพื่อจัดเก็บเข้าแฟ้มประวัติได้ทันที</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- MODAL: OFF CAMPUS WARNING --- */}
            {showWarningModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
                        <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <AlertTriangle size={32} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">ยืนยันการออกนอกบริเวณ?</h3>
                        <p className="text-slate-500 mb-4">
                            คุณได้ขออนุญาตออกนอกบริเวณโรงเรียนมาแล้ว <span className="text-orange-600 font-bold text-lg">{offCampusCount}</span> ครั้ง
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowWarningModal(false)} className="flex-1 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-700">ยกเลิก</button>
                            <button onClick={submitRequest} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold">ยืนยัน</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: DIRECTOR APPROVE --- */}
            {canApprove && selectedRequest && viewMode === 'LIST' && selectedRequest.status === 'Pending' && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                        <div className="bg-blue-600 text-white p-4 font-bold text-lg flex items-center gap-2">
                             <UserCheck size={24}/> พิจารณาคำขออนุญาต
                        </div>
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-xl font-bold text-slate-600">
                                    {selectedRequest.teacherName[0]}
                                </div>
                                <div>
                                    <h4 className="font-bold text-lg">{selectedRequest.teacherName}</h4>
                                    <p className="text-slate-500 text-sm">ขออนุญาต: {getLeaveTypeName(selectedRequest.type)}</p>
                                    <p className="text-slate-500 text-sm">เหตุผล: "{selectedRequest.reason}"</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-lg p-3 mb-6 border border-slate-100">
                                <h5 className="text-xs font-bold text-slate-500 uppercase mb-2">สถิติการลาของครูท่านนี้</h5>
                                {(() => {
                                    const s = calculateStats(selectedRequest.teacherId);
                                    return (
                                        <>
                                            <div className="flex justify-between text-sm"><span>ลาป่วย:</span> <span className="font-bold">{s.sick} ครั้ง</span></div>
                                            <div className="flex justify-between text-sm"><span>ลากิจ:</span> <span className="font-bold">{s.personal} ครั้ง</span></div>
                                            <div className="flex justify-between text-sm"><span>ออกนอกบริเวณ:</span> <span className="font-bold text-orange-600">{s.offCampus} ครั้ง</span></div>
                                            <div className="flex justify-between text-sm"><span>เข้าสาย:</span> <span className="font-bold text-purple-600">{s.late} ครั้ง</span></div>
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => handleDirectorApprove(selectedRequest, false)} className="flex-1 py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-bold">ไม่อนุมัติ</button>
                                <button onClick={() => handleDirectorApprove(selectedRequest, true)} className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md">อนุมัติ / ลงนาม</button>
                            </div>
                            <button onClick={() => setSelectedRequest(null)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600">ปิดหน้าต่าง</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeaveSystem;