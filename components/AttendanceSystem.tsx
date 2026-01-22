import React, { useState, useEffect, useMemo } from 'react';
import { AttendanceRecord, Teacher, School, LeaveRequest } from '../types';
import { 
    MapPin, Navigation, CheckCircle, LogOut, History, Loader, 
    RefreshCw, AlertTriangle, Clock, Calendar, ShieldCheck, 
    MapPinned, Printer, ArrowLeft, ChevronLeft, ChevronRight, 
    FileText, UserCheck, Users, FileSpreadsheet, CalendarDays, Search
} from 'lucide-react';
import { supabase, isConfigured } from '../supabaseClient';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getThaiMonthYear = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
};

const getTodayDateStr = () => new Date().toISOString().split('T')[0];

interface AttendanceSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    currentSchool: School; 
}

const AttendanceSystem: React.FC<AttendanceSystemProps> = ({ currentUser, allTeachers, currentSchool }) => {
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [gpsStatus, setGpsStatus] = useState<{ lat: number, lng: number, dist: number } | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    
    const [viewMode, setViewMode] = useState<'MAIN' | 'PRINT_DAILY'>('MAIN');
    const [selectedDate, setSelectedDate] = useState(getTodayDateStr());
    const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);

    const isAdminView = currentUser.roles.some(role => 
        ['SYSTEM_ADMIN', 'DIRECTOR', 'VICE_DIRECTOR', 'DOCUMENT_OFFICER'].includes(role)
    );

    const fetchData = async () => {
        const client = supabase;
        if (!isConfigured || !client) return;
        setIsLoadingData(true);
        setErrorMsg(null);

        try {
            let queryBuilder = client.from('attendance').select('*').eq('school_id', currentUser.schoolId);
            if (isAdminView) {
                queryBuilder = queryBuilder.eq('date', selectedDate);
            } else {
                queryBuilder = queryBuilder.eq('teacher_id', currentUser.id).order('date', { ascending: false });
            }
            const { data, error } = await queryBuilder;
            if (error) throw error;
            const mappedData: AttendanceRecord[] = (data || []).map((r: any) => ({
                id: r.id.toString(),
                schoolId: r.school_id,
                teacherId: r.teacher_id,
                teacherName: r.teacher_name,
                date: r.date,
                checkInTime: r.check_in_time,
                checkOutTime: r.check_out_time,
                status: r.status,
                coordinate: r.coordinate
            }));
            setHistory(mappedData);

            const { data: leaves } = await client.from('leave_requests')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .eq('status', 'Approved')
                .lte('start_date', selectedDate)
                .gte('end_date', selectedDate);
            if (leaves) {
                setApprovedLeaves(leaves.map(l => ({
                    id: l.id.toString(),
                    teacherId: l.teacher_id,
                    teacherName: l.teacher_name,
                    type: l.type,
                    startDate: l.start_date,
                    endDate: l.end_date,
                    status: l.status,
                    reason: l.reason
                } as any)));
            }

            const today = getTodayDateStr();
            const { data: todayData } = await client.from('attendance')
                .select('*')
                .eq('teacher_id', currentUser.id)
                .eq('date', today)
                .maybeSingle();

            if (todayData) setTodayRecord({
                id: todayData.id.toString(),
                teacherId: todayData.teacher_id,
                teacherName: todayData.teacher_name,
                date: todayData.date,
                checkInTime: todayData.check_in_time,
                checkOutTime: todayData.check_out_time,
                status: todayData.status
            } as any);
            else setTodayRecord(null);
        } catch (e: any) {
            console.error("Fetch Error:", e.message);
            setErrorMsg("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentUser.id, currentUser.schoolId, selectedDate, isAdminView]);

    const handleAttendanceAction = async (type: 'IN' | 'OUT') => {
        const client = supabase;
        if (!client) return;
        setIsProcessing(true);
        setErrorMsg(null);
        try {
            const pos: any = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej, { 
                    enableHighAccuracy: true,
                    timeout: 10000 
                });
            });
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const schoolLat = currentSchool.lat || 13.7563;
            const schoolLng = currentSchool.lng || 100.5018;
            const radius = currentSchool.radius || 500;
            const dist = calculateDistance(lat, lng, schoolLat, schoolLng);
            setGpsStatus({ lat, lng, dist });
            if (dist > radius) {
                throw new Error(`ไม่อนุญาตให้ลงเวลา: ท่านอยู่นอกพื้นที่โรงเรียน (${Math.round(dist)} ม.)`);
            }
            const now = new Date();
            const dateStr = getTodayDateStr();
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
            if (type === 'IN') {
                const status = timeStr > (currentSchool.lateTimeThreshold || '08:30') ? 'Late' : 'OnTime';
                const { error } = await client.from('attendance').insert([{
                    school_id: currentUser.schoolId,
                    teacher_id: currentUser.id,
                    teacher_name: currentUser.name,
                    date: dateStr,
                    check_in_time: timeStr,
                    status: status,
                    coordinate: { lat, lng }
                }]);
                if (error) throw error;
                alert(`ลงเวลาเข้างานสำเร็จ: ${timeStr} น.`);
            } else {
                const { error } = await client.from('attendance')
                    .update({ check_out_time: timeStr })
                    .eq('teacher_id', currentUser.id)
                    .eq('date', dateStr);
                if (error) throw error;
                alert(`ลงเวลากลับสำเร็จ: ${timeStr} น.`);
            }
            fetchData(); 
        } catch (e: any) {
            setErrorMsg(e.message || "การลงเวลาขัดข้อง");
            alert(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const getLeaveTypeName = (type: string) => {
        const map: any = { 'Sick': 'ลาป่วย', 'Personal': 'ลากิจ', 'OffCampus': 'ออกนอกฯ', 'Late': 'เข้าสาย', 'Maternity': 'ลาคลอด' };
        return map[type] || 'ลา';
    };

    const groupedHistory = useMemo(() => {
        if (isAdminView && viewMode === 'MAIN') return {};
        const groups: { [key: string]: AttendanceRecord[] } = {};
        history.forEach(rec => {
            const monthYear = getThaiMonthYear(rec.date);
            if (!groups[monthYear]) groups[monthYear] = [];
            groups[monthYear].push(rec);
        });
        return groups;
    }, [history, isAdminView, viewMode]);

    const sortedTeachersForReport = useMemo(() => {
        return allTeachers
            .filter(t => t.schoolId === currentUser.schoolId && !t.isSuspended)
            .filter(t => !t.roles.includes('DIRECTOR')) 
            .sort((a, b) => {
                const recA = history.find(h => h.teacherId === a.id);
                const recB = history.find(h => h.teacherId === b.id);
                if (recA?.checkInTime && recB?.checkInTime) return recA.checkInTime.localeCompare(recB.checkInTime);
                if (recA?.checkInTime) return -1;
                if (recB?.checkInTime) return 1;
                const leaveA = approvedLeaves.find(l => l.teacherId === a.id);
                const leaveB = approvedLeaves.find(l => l.teacherId === b.id);
                if (leaveA && !leaveB) return -1;
                if (!leaveA && leaveB) return 1;
                return a.name.localeCompare(b.name, 'th');
            });
    }, [allTeachers, history, approvedLeaves, currentUser.schoolId]);

    if (isLoadingData) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4 font-sarabun text-slate-400">
            <Loader className="animate-spin text-blue-600" size={48}/>
            <p className="font-black uppercase tracking-widest text-xs">Synchronizing Records...</p>
        </div>
    );

    // --- FORMAL DAILY PRINT VIEW (A4 CLEAN LOOK) ---
    if (viewMode === 'PRINT_DAILY') {
        const teachersToDisplay = sortedTeachersForReport;
        const presentCount = history.filter(h => teachersToDisplay.some(t => t.id === h.teacherId)).length;
        const leaveCount = approvedLeaves.filter(l => teachersToDisplay.some(t => t.id === l.teacherId)).length;
        const absentCount = Math.max(0, teachersToDisplay.length - (presentCount + leaveCount));

        return (
            <div className="absolute inset-0 z-50 bg-[#f1f5f9] min-h-screen font-sarabun text-slate-900 print:bg-white overflow-y-auto no-scrollbar-container">
                {/* Control Header (Floating on top, hidden during print) */}
                <div className="bg-slate-900/95 backdrop-blur-md p-4 shadow-xl print:hidden sticky top-0 z-50 flex justify-between items-center px-10 border-b border-white/10">
                    <button onClick={() => setViewMode('MAIN')} className="flex items-center gap-2 text-white font-bold bg-white/10 px-4 py-2 rounded-xl hover:bg-white/20 transition-all active:scale-95">
                        <ArrowLeft size={20}/> ย้อนกลับ
                    </button>
                    <div className="flex items-center gap-4">
                        <span className="text-white font-bold text-sm hidden md:block">รายงานประจำวันที่: {getThaiDate(selectedDate)}</span>
                        <button onClick={() => window.print()} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95">
                            <Printer size={20}/> พิมพ์สรุปผล (A4)
                        </button>
                    </div>
                </div>

                {/* A4 Sheet Container */}
                <div className="mx-auto bg-white my-0 print:my-0 min-h-[297mm] w-[210mm] print:w-full box-border p-[2.5cm_2cm_2cm_2.5cm] print:p-0 no-scrollbar overflow-visible print:overflow-visible">
                    <div className="flex flex-col h-full bg-white print:p-0 border-none outline-none">
                        {/* Header Section */}
                        <div className="text-center mb-8 border-b-2 border-slate-900 pb-4">
                            {currentSchool.logoBase64 && <img src={currentSchool.logoBase64} className="h-16 mx-auto mb-3 object-contain"/>}
                            <h2 className="text-xl font-black uppercase tracking-tight">สรุปการลงเวลาปฏิบัติราชการรายวัน</h2>
                            <h3 className="text-md font-bold">{currentSchool.name}</h3>
                            <p className="text-sm font-bold text-blue-800 underline underline-offset-4">ประจำวันที่ {getThaiDate(selectedDate)}</p>
                        </div>

                        {/* Attendance Table */}
                        <table className="w-full border-collapse border border-black mb-8 text-[11px]">
                            <thead className="bg-slate-50/50">
                                <tr className="font-bold text-center">
                                    <th className="border border-black p-2 w-10">ที่</th>
                                    <th className="border border-black p-2 text-left">ชื่อ-นามสกุล</th>
                                    <th className="border border-black p-2 text-left w-40">ตำแหน่ง</th>
                                    <th className="border border-black p-2 w-20">เวลามา</th>
                                    <th className="border border-black p-2 w-20">เวลากลับ</th>
                                    <th className="border border-black p-2 w-32">สถานะ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {teachersToDisplay.map((t, i) => {
                                    const record = history.find(h => h.teacherId === t.id);
                                    const leave = approvedLeaves.find(l => l.teacherId === t.id);
                                    
                                    let statusText = 'ขาด / ยังไม่ลงเวลา';
                                    let statusColor = 'text-red-600';
                                    
                                    if (record) {
                                        statusText = record.status === 'OnTime' ? 'มาปกติ' : 'มาสาย';
                                        statusColor = record.status === 'OnTime' ? 'text-green-600' : 'text-orange-600';
                                    } else if (leave) {
                                        statusText = getLeaveTypeName(leave.type);
                                        statusColor = 'text-blue-600';
                                    }

                                    return (
                                        <tr key={t.id} className="text-center font-medium">
                                            <td className="border border-black p-2">{i + 1}</td>
                                            <td className="border border-black p-2 text-left">{t.name}</td>
                                            <td className="border border-black p-2 text-left">{t.position}</td>
                                            <td className="border border-black p-2">{record?.checkInTime || '-'}</td>
                                            <td className="border border-black p-2">{record?.checkOutTime || '-'}</td>
                                            <td className={`border border-black p-2 font-bold ${statusColor}`}>{statusText}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Footer / Summary */}
                        <div className="mt-auto grid grid-cols-3 gap-4 text-center text-sm font-bold pt-8">
                            <div className="p-4 border border-black bg-slate-50">
                                <p>มาปฏิบัติราชการ</p>
                                <p className="text-2xl font-black mt-2">{presentCount} ท่าน</p>
                            </div>
                            <div className="p-4 border border-black bg-slate-50">
                                <p>ลา / ไปราชการ</p>
                                <p className="text-2xl font-black mt-2">{leaveCount} ท่าน</p>
                            </div>
                            <div className="p-4 border border-black bg-slate-50">
                                <p>ขาด / ไม่ลงเวลา</p>
                                <p className="text-2xl font-black mt-2">{absentCount} ท่าน</p>
                            </div>
                        </div>

                        <div className="mt-20 flex justify-between px-10">
                            <div className="text-center">
                                <div className="mb-16">ลงชื่อ......................................................ผู้ตรวจ</div>
                                <div>( {isAdminView ? currentUser.name : '......................................................'} )</div>
                                <div className="mt-2">ตำแหน่ง......................................................</div>
                            </div>
                            <div className="text-center">
                                <div className="mb-16">ลงชื่อ......................................................ผู้อำนวยการ</div>
                                <div>( {allTeachers.find(t => t.roles.includes('DIRECTOR'))?.name || '......................................................'} )</div>
                                <div className="mt-2">ผู้อำนวยการโรงเรียน{currentSchool.name}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <style>{`
                    .no-scrollbar-container::-webkit-scrollbar { display: none !important; width: 0 !important; }
                    .no-scrollbar::-webkit-scrollbar { display: none !important; width: 0 !important; }
                    @media print {
                        @page { size: A4 portrait; margin: 0; }
                        body { background: white !important; -webkit-print-color-adjust: exact; }
                        div.mx-auto { width: 100% !important; height: 100% !important; margin: 0 !important; padding: 2.5cm 2cm 2cm 2.5cm !important; box-shadow: none !important; border: none !important; outline: none !important; page-break-after: always; }
                    }
                `}</style>
            </div>
        );
    }

    // --- MAIN DASHBOARD UI ---
    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20 font-sarabun">
            <div className="bg-slate-800 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border-b-4 border-slate-900">
                <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl group-hover:scale-110 transition-transform"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                        <div className="p-5 bg-blue-600 rounded-3xl shadow-xl shadow-blue-500/20"><MapPinned size={32}/></div>
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">ลงเวลาปฏิบัติราชการ</h2>
                            <p className="text-blue-400 font-bold flex items-center gap-2 uppercase tracking-widest text-xs mt-1"><ShieldCheck size={14}/> {currentSchool.name}</p>
                        </div>
                    </div>
                    <div className="text-center md:text-right bg-white/5 p-4 px-8 rounded-3xl border border-white/10 backdrop-blur-md">
                        <p className="text-blue-200 font-black text-2xl">{new Date().toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'})} น.</p>
                        <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-tighter">{getThaiDate(getTodayDateStr())}</p>
                    </div>
                </div>
            </div>

            {errorMsg && (
                <div className="bg-red-50 border-2 border-red-100 p-5 rounded-3xl flex items-start gap-4 animate-shake">
                    <div className="p-2 bg-red-600 text-white rounded-xl"><AlertTriangle size={20}/></div>
                    <div><h4 className="font-black text-red-600 uppercase text-xs tracking-widest mb-1">การลงเวลาผิดพลาด</h4><p className="text-red-700 font-bold text-sm leading-relaxed">{errorMsg}</p></div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className={`relative overflow-hidden p-8 rounded-[2.5rem] border-2 transition-all group ${todayRecord ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-gradient-to-br from-emerald-50 to-green-100 border-green-200 hover:shadow-2xl hover:shadow-green-200/50 hover:-translate-y-1'}`}>
                    <div className="relative z-10 space-y-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${todayRecord ? 'bg-slate-200 text-slate-400' : 'bg-green-600 text-white shadow-lg'}`}><CheckCircle size={32}/></div>
                        <div><h3 className={`text-2xl font-black ${todayRecord ? 'text-slate-400' : 'text-green-800'}`}>ลงเวลามาปฏิบัติงาน</h3><p className="text-green-700/60 text-xs font-bold uppercase tracking-widest">School Entry Check-In</p></div>
                        {todayRecord ? (
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">บันทึกเวลามาแล้ว</p><p className="text-2xl font-black text-green-600">{todayRecord.checkInTime} น.</p><p className="text-[10px] font-bold text-slate-400 mt-1">สถานะ: {todayRecord.status === 'OnTime' ? 'ปกติ' : 'มาสาย'}</p></div>
                        ) : (
                            <button onClick={() => handleAttendanceAction('IN')} disabled={isProcessing} className="w-full py-5 bg-green-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-green-200 hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-3">{isProcessing ? <RefreshCw className="animate-spin" size={24}/> : <Navigation size={24}/>} ยืนยันพิกัดลงเวลาเข้า</button>
                        )}
                    </div>
                </div>

                <div className={`relative overflow-hidden p-8 rounded-[2.5rem] border-2 transition-all group ${todayRecord?.checkOutTime || !todayRecord ? 'bg-slate-50 border-slate-200 opacity-80' : 'bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200 hover:shadow-2xl hover:shadow-orange-200/50 hover:-translate-y-1'}`}>
                    <div className="relative z-10 space-y-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${todayRecord?.checkOutTime || !todayRecord ? 'bg-slate-200 text-slate-400' : 'bg-orange-600 text-white shadow-lg'}`}><LogOut size={32}/></div>
                        <div><h3 className={`text-2xl font-black ${todayRecord?.checkOutTime || !todayRecord ? 'text-slate-400' : 'text-orange-800'}`}>ลงเวลากลับบ้าน</h3><p className="text-orange-700/60 text-xs font-bold uppercase tracking-widest">Work Departure Check-Out</p></div>
                        {todayRecord?.checkOutTime ? (
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner"><p className="text-[10px] font-black text-slate-400 uppercase mb-1">บันทึกเวลากลับแล้ว</p><p className="text-2xl font-black text-orange-600">{todayRecord.checkOutTime} น.</p><p className="text-[10px] font-bold text-slate-400 mt-1">ขอบคุณที่ปฏิบัติหน้าที่ในวันนี้</p></div>
                        ) : !todayRecord ? (
                             <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 border-dashed text-center"><p className="text-xs font-bold text-slate-400 italic">กรุณาลงเวลามาปฏิบัติงานก่อน</p></div>
                        ) : (
                            <button onClick={() => handleAttendanceAction('OUT')} disabled={isProcessing} className="w-full py-5 bg-orange-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-orange-200 hover:bg-orange-700 active:scale-95 transition-all flex items-center justify-center gap-3">{isProcessing ? <RefreshCw className="animate-spin" size={24}/> : <Navigation size={24}/>} ยืนยันพิกัดลงเวลากลับ</button>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-8 bg-slate-50 border-b flex flex-col sm:flex-row justify-between items-center gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
                        <h3 className="font-black text-xl text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                            <History className="text-blue-600" size={24}/>
                            {isAdminView ? 'ข้อมูลการปฏิบัติราชการ' : 'ประวัติการลงเวลา'}
                        </h3>
                        {isAdminView && (
                            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border-2 border-slate-100 shadow-inner">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เลือกวันที่:</span>
                                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="font-bold text-slate-700 outline-none cursor-pointer bg-transparent"/>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        {isAdminView && (
                            <button onClick={() => setViewMode('PRINT_DAILY')} className="flex-1 sm:flex-none p-3 px-6 bg-slate-800 text-white rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 font-black text-xs shadow-lg active:scale-95">
                                <Printer size={16}/> พิมพ์ใบสรุปประจำวัน
                            </button>
                        )}
                        <button onClick={fetchData} className="p-3 bg-white border-2 border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all shadow-sm">
                            <RefreshCw size={20}/>
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {!isAdminView ? (
                        <div className="p-8 space-y-10">
                            {Object.keys(groupedHistory).length === 0 ? (
                                <div className="text-center py-20 text-slate-300 italic font-bold">ไม่พบประวัติในระบบ</div>
                            ) : Object.keys(groupedHistory).map(monthYear => (
                                <div key={monthYear} className="space-y-4 animate-fade-in">
                                    <h4 className="font-black text-lg text-blue-600 flex items-center gap-2 border-b-2 border-blue-50 pb-2">
                                        <CalendarDays size={20}/> ประจำเดือน {monthYear}
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {groupedHistory[monthYear].map(rec => (
                                            <div key={rec.id} className="bg-white border-2 border-slate-100 p-5 rounded-[2rem] hover:shadow-lg transition-all group">
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{getThaiDate(rec.date)}</p>
                                                        <p className={`text-xs font-black uppercase mt-1 ${rec.status === 'OnTime' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {rec.status === 'OnTime' ? 'มาปกติ' : 'มาสาย'}
                                                        </p>
                                                    </div>
                                                    <div className="p-2 bg-slate-50 rounded-xl text-slate-300 group-hover:text-blue-600 transition-colors"><Clock size={16}/></div>
                                                </div>
                                                <div className="flex justify-between items-end border-t pt-3 mt-3 border-slate-50">
                                                    <div><p className="text-[9px] font-bold text-slate-400 uppercase">มา / กลับ</p><p className="font-black text-slate-700">{rec.checkInTime} / {rec.checkOutTime || '--:--'}</p></div>
                                                    {rec.coordinate && (
                                                        <a href={`https://www.google.com/maps?q=${rec.coordinate.lat},${rec.coordinate.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-[10px] font-bold flex items-center gap-1">พิกัด <Navigation size={10}/></a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                                <tr>
                                    <th className="p-6">รายชื่อบุคลากร (เรียงตามเวลาที่มา)</th>
                                    <th className="p-6 text-center">เวลามา</th>
                                    <th className="p-6 text-center">เวลากลับ</th>
                                    <th className="p-6 text-center">สถานะ</th>
                                    <th className="p-6 text-center">GPS</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {sortedTeachersForReport.map((t, idx) => {
                                    const record = history.find(h => h.teacherId === t.id);
                                    const leave = approvedLeaves.find(l => l.teacherId === t.id);
                                    let statusText = 'ยังไม่ลงชื่อ / ขาด';
                                    let statusClass = 'bg-slate-100 text-slate-400';
                                    if (record) {
                                        statusText = record.status === 'OnTime' ? 'มาปกติ' : 'มาสาย';
                                        statusClass = record.status === 'OnTime' ? 'bg-emerald-600 text-white shadow-emerald-100' : 'bg-rose-600 text-white shadow-rose-100';
                                    } else if (leave) {
                                        statusText = `ลา (${getLeaveTypeName(leave.type)})`;
                                        statusClass = 'bg-blue-600 text-white shadow-blue-100';
                                    }
                                    return (
                                        <tr key={t.id} className="hover:bg-blue-50/50 transition-colors group">
                                            <td className="p-6">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl bg-white border-2 border-slate-100 flex items-center justify-center font-black text-slate-400 shadow-sm transition-all group-hover:border-blue-200`}>{idx + 1}</div>
                                                    <div>
                                                        <div className="font-black text-slate-700">{t.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{t.position}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-6 text-center font-black text-slate-600">{record?.checkInTime || '-'}</td>
                                            <td className="p-6 text-center font-black text-slate-600">{record?.checkOutTime || '-'}</td>
                                            <td className="p-6 text-center"><span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg border-2 border-white ${statusClass}`}>{statusText}</span></td>
                                            <td className="p-6 text-center">{record?.coordinate && (<a href={`https://www.google.com/maps?q=${record.coordinate.lat},${record.coordinate.lng}`} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-300 hover:text-blue-600 inline-block transition-colors"><Navigation size={18}/></a>)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            <style>{`
                @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } } .animate-shake { animation: shake 0.3s ease-in-out; }
            `}</style>
        </div>
    );
};

export default AttendanceSystem;