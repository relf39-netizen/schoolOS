
import { useState, useEffect } from 'react';
import { AttendanceRecord, Teacher, School, LeaveRequest } from '../types';
import { MapPin, Navigation, CheckCircle, LogOut, History, Loader, RefreshCw, AlertTriangle, Clock, Calendar, ShieldCheck, MapPinned, Printer, ArrowLeft, ChevronLeft, ChevronRight, FileText, UserCheck, Users, FileSpreadsheet } from 'lucide-react';
import { supabase, isConfigured } from '../supabaseClient';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
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

const getThaiMonthYear = (ymStr: string) => {
    if (!ymStr) return '';
    const [y, m] = ymStr.split('-');
    const date = new Date(parseInt(y), parseInt(m) - 1, 1);
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
    
    // View Mode for Printing
    const [viewMode, setViewMode] = useState<'MAIN' | 'PRINT_MONTHLY' | 'PRINT_DAILY'>('MAIN');
    const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [reportDate, setReportDate] = useState(getTodayDateStr()); // YYYY-MM-DD
    const [selectedTeacherId, setSelectedTeacherId] = useState(currentUser.id);
    const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);

    const isAdminView = currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DIRECTOR');

    // Fetch History and Related Data
    const fetchData = async () => {
        if (!isConfigured || !supabase) return;
        setIsLoadingData(true);
        setErrorMsg(null);

        try {
            const today = getTodayDateStr();
            
            // 1. Fetch Attendance Records
            let query = supabase.from('attendance').select('*').order('date', { ascending: false }).order('check_in_time', { ascending: false });
            
            if (viewMode === 'MAIN') {
                if (!isAdminView) {
                    query = query.eq('teacher_id', currentUser.id);
                } else {
                    query = query.eq('school_id', currentUser.schoolId);
                }
            } else if (viewMode === 'PRINT_MONTHLY') {
                query = query.eq('teacher_id', selectedTeacherId)
                             .gte('date', `${reportMonth}-01`)
                             .lte('date', `${reportMonth}-31`);
            } else if (viewMode === 'PRINT_DAILY') {
                query = query.eq('school_id', currentUser.schoolId)
                             .eq('date', reportDate);
            }
            
            const { data, error } = await query.limit(isAdminView ? 500 : 100);
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

            // 2. Fetch Leaves for the selected period if in print mode
            if (viewMode === 'PRINT_DAILY') {
                const { data: leaves } = await supabase.from('leave_requests')
                    .select('*')
                    .eq('school_id', currentUser.schoolId)
                    .eq('status', 'Approved')
                    .lte('start_date', reportDate)
                    .gte('end_date', reportDate);
                
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
                    } as LeaveRequest)));
                }
            }

            const mineToday = mappedData.find(r => r.teacherId === currentUser.id && r.date === today);
            setTodayRecord(mineToday || null);

        } catch (e: any) {
            console.error("Fetch Error:", e.message);
            setErrorMsg("ไม่สามารถโหลดข้อมูลจากฐานข้อมูลได้");
        } finally {
            setIsLoadingData(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [currentUser.id, currentUser.schoolId, viewMode, reportMonth, reportDate, selectedTeacherId]);

    const handleAttendanceAction = async (type: 'IN' | 'OUT') => {
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
                throw new Error(`คุณอยู่นอกพื้นที่ลงเวลา (${Math.round(dist)} เมตร) กรุณาเคลื่อนตัวเข้าไปในรัศมีโรงเรียน (${radius} เมตร)`);
            }

            const now = new Date();
            const dateStr = getTodayDateStr();
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

            if (type === 'IN') {
                if (todayRecord) {
                    throw new Error("ท่านได้ลงเวลามาปฏิบัติงานของวันนี้เรียบร้อยแล้ว");
                }

                const status = timeStr > (currentSchool.lateTimeThreshold || '08:30') ? 'Late' : 'OnTime';
                
                const { error } = await supabase.from('attendance').insert([{
                    school_id: currentUser.schoolId,
                    teacher_id: currentUser.id,
                    teacher_name: currentUser.name,
                    date: dateStr,
                    check_in_time: timeStr,
                    status: status,
                    coordinate: { lat, lng }
                }]);

                if (error) throw error;
                alert(`ลงเวลาเข้างานสำเร็จ (${timeStr} น.)`);
            } else {
                if (todayRecord?.checkOutTime) {
                    throw new Error("ท่านได้ลงเวลากลับเรียบร้อยแล้ว");
                }
                
                if (!todayRecord) {
                    throw new Error("ไม่พบข้อมูลการเข้างานของวันนี้ กรุณาลงเวลาเข้างานก่อน");
                }

                const { error } = await supabase.from('attendance')
                    .update({ check_out_time: timeStr })
                    .eq('teacher_id', currentUser.id)
                    .eq('date', dateStr);

                if (error) throw error;
                alert(`ลงเวลากลับสำเร็จ (${timeStr} น.)`);
            }

            fetchData(); 
        } catch (e: any) {
            setErrorMsg(e.message || "เกิดข้อผิดพลาดในการลงเวลา");
            alert(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    const getLeaveTypeName = (type: string) => {
        const map: any = { 'Sick': 'ลาป่วย', 'Personal': 'ลากิจ', 'OffCampus': 'ออกนอกฯ', 'Late': 'เข้าสาย', 'Maternity': 'ลาคลอด' };
        return map[type] || 'ลา';
    };

    if (isLoadingData) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader className="animate-spin text-blue-600" size={40}/>
            <p className="font-bold text-slate-500">กำลังดึงข้อมูลและตรวจสอบสถานะการลา...</p>
        </div>
    );

    // --- PRINT DAILY VIEW ---
    if (viewMode === 'PRINT_DAILY') {
        const teachersInSchool = allTeachers.filter(t => t.schoolId === currentUser.schoolId && !t.isSuspended);
        const presentCount = history.length;
        const leaveCount = approvedLeaves.length;
        const absentCount = teachersInSchool.length - (presentCount + leaveCount);

        return (
            <div className="absolute inset-0 z-50 bg-slate-100 min-h-screen animate-fade-in font-sarabun">
                <div className="bg-white p-4 shadow-sm mb-6 print:hidden sticky top-0 z-40 border-b">
                    <div className="max-w-4xl mx-auto flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setViewMode('MAIN')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-all">
                                <ArrowLeft size={24}/>
                            </button>
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-500 text-sm">ระบุวันที่:</span>
                                <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="border rounded-lg px-3 py-1.5 font-bold text-slate-700 outline-none focus:ring-2 ring-blue-500"/>
                            </div>
                        </div>
                        <button onClick={() => window.print()} className="bg-slate-800 text-white px-8 py-2 rounded-xl font-black shadow-lg hover:bg-black transition-all flex items-center gap-2">
                            <Printer size={20}/> พิมพ์ใบสรุปรายวัน
                        </button>
                    </div>
                </div>

                <div className="bg-white shadow-lg p-12 mx-auto max-w-[210mm] min-h-[297mm] print:shadow-none print:w-full print:p-0 text-slate-900">
                    <div className="text-center mb-10 border-b-2 border-slate-900 pb-8">
                        {currentSchool.logoBase64 && <img src={currentSchool.logoBase64} className="h-20 mx-auto mb-4 object-contain"/>}
                        <h2 className="text-2xl font-black mb-1 uppercase tracking-tight">สรุปรายชื่อการลงเวลาปฏิบัติงานรายวัน</h2>
                        <h3 className="text-lg font-bold text-slate-700">{currentSchool.name}</h3>
                        <p className="text-md font-bold mt-2">ประจำ{getThaiDate(reportDate)}</p>
                    </div>

                    <table className="w-full border-collapse border-2 border-slate-800 mb-8 text-xs">
                        <thead className="bg-slate-50 font-bold">
                            <tr>
                                <th className="border-2 border-slate-800 p-2 w-10 text-center">ที่</th>
                                <th className="border-2 border-slate-800 p-2 text-center">ชื่อ-นามสกุล</th>
                                <th className="border-2 border-slate-800 p-2 text-center w-32">ตำแหน่ง</th>
                                <th className="border-2 border-slate-800 p-2 text-center w-20">เวลามา</th>
                                <th className="border-2 border-slate-800 p-2 text-center w-20">เวลากลับ</th>
                                <th className="border-2 border-slate-800 p-2 text-center w-20">สถานะ</th>
                                <th className="border-2 border-slate-800 p-2 text-center">หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {teachersInSchool.map((t, i) => {
                                const record = history.find(h => h.teacherId === t.id);
                                const leave = approvedLeaves.find(l => l.teacherId === t.id);
                                
                                let statusText = '-';
                                let statusClass = 'text-slate-400';
                                
                                if (record) {
                                    statusText = record.status === 'OnTime' ? 'มาปกติ' : 'มาสาย';
                                    statusClass = record.status === 'OnTime' ? 'text-green-700 font-bold' : 'text-orange-600 font-bold';
                                } else if (leave) {
                                    statusText = `ลา (${getLeaveTypeName(leave.type)})`;
                                    statusClass = 'text-blue-700 font-bold';
                                } else {
                                    statusText = 'ขาด/ยังไม่ลงเวลา';
                                    statusClass = 'text-red-600';
                                }

                                return (
                                    <tr key={t.id}>
                                        <td className="border border-slate-800 p-2 text-center font-mono">{i + 1}</td>
                                        <td className="border border-slate-800 p-2 font-bold">{t.name}</td>
                                        <td className="border border-slate-800 p-2">{t.position}</td>
                                        <td className="border border-slate-800 p-2 text-center">{record?.checkInTime ? `${record.checkInTime} น.` : '-'}</td>
                                        <td className="border border-slate-800 p-2 text-center">{record?.checkOutTime ? `${record.checkOutTime} น.` : '-'}</td>
                                        <td className={`border border-slate-800 p-2 text-center ${statusClass}`}>
                                            {statusText}
                                        </td>
                                        <td className="border border-slate-800 p-2 text-[10px] italic">
                                            {leave ? leave.reason : ''}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                    <div className="grid grid-cols-2 gap-10 mb-12">
                        <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-200">
                            <h4 className="font-black text-slate-800 mb-3 border-b border-slate-300 pb-2">สรุปสถิติรายวัน</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span>มาปฏิบัติงานปกติ/สาย:</span><span className="font-black text-green-700">{presentCount} ท่าน</span></div>
                                <div className="flex justify-between"><span>ลา (ตรวจสอบจากระบบลา):</span><span className="font-black text-blue-600">{leaveCount} ท่าน</span></div>
                                <div className="flex justify-between"><span>ขาด/ยังไม่ลงชื่อ:</span><span className="font-black text-red-600">{absentCount} ท่าน</span></div>
                                <div className="flex justify-between border-t border-slate-300 pt-2 font-black text-lg"><span>บุคลากรทั้งหมด:</span><span>{teachersInSchool.length} ท่าน</span></div>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center items-center gap-6">
                            <div className="text-center w-full">
                                <p className="mb-10 text-sm">ลงชื่อ..........................................................ผู้ตรวจสอบ</p>
                                <p className="font-black">({currentUser.name})</p>
                                <p className="text-xs">ตำแหน่ง {currentUser.position}</p>
                            </div>
                        </div>
                    </div>

                    <div className="text-center mt-10">
                        <p className="mb-10 text-sm">ลงชื่อ......................................................ผู้อำนวยการโรงเรียน</p>
                        <p className="font-black underline underline-offset-4">( {allTeachers.find(t => t.roles.includes('DIRECTOR'))?.name || '......................................................'} )</p>
                        <p className="text-xs mt-2 text-slate-500 italic">ผู้มีอำนาจสั่งการและรับรองเวลาปฏิบัติราชการ</p>
                    </div>
                </div>
            </div>
        );
    }

    // --- PRINT MONTHLY VIEW ---
    if (viewMode === 'PRINT_MONTHLY') {
        const targetTeacher = allTeachers.find(t => t.id === selectedTeacherId) || currentUser;
        const totalOnTime = history.filter(r => r.status === 'OnTime').length;
        const totalLate = history.filter(r => r.status === 'Late').length;

        return (
            <div className="absolute inset-0 z-50 bg-slate-100 min-h-screen animate-fade-in font-sarabun">
                <div className="bg-white p-4 shadow-sm mb-6 print:hidden sticky top-0 z-40 border-b">
                    <div className="max-w-4xl mx-auto flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setViewMode('MAIN')} className="p-2 hover:bg-slate-100 rounded-full text-slate-600 transition-all">
                                <ArrowLeft size={24}/>
                            </button>
                            <div className="flex items-center gap-2">
                                <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="border rounded-lg px-3 py-1.5 font-bold text-slate-700 outline-none focus:ring-2 ring-blue-500"/>
                                {isAdminView && (
                                    <select value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} className="border rounded-lg px-3 py-1.5 font-bold text-slate-700 outline-none focus:ring-2 ring-blue-500">
                                        {allTeachers.filter(t => t.schoolId === currentUser.schoolId).map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>
                        <button onClick={() => window.print()} className="bg-blue-600 text-white px-8 py-2 rounded-xl font-black shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2">
                            <Printer size={20}/> พิมพ์ใบลงเวลารายบุคคล
                        </button>
                    </div>
                </div>

                <div className="bg-white shadow-lg p-10 mx-auto max-w-[210mm] min-h-[297mm] print:shadow-none print:w-full print:p-0 text-slate-900">
                    <div className="text-center mb-8 border-b-2 border-slate-900 pb-6">
                        {currentSchool.logoBase64 && <img src={currentSchool.logoBase64} className="h-20 mx-auto mb-4 object-contain"/>}
                        <h2 className="text-2xl font-black mb-1">รายงานการลงเวลาปฏิบัติงาน</h2>
                        <h3 className="text-lg font-bold text-slate-700">{currentSchool.name}</h3>
                        <p className="text-md font-bold mt-2">ประจำเดือน {getThaiMonthYear(reportMonth)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                        <div>
                            <p className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">ข้อมูลบุคลากร</p>
                            <p className="text-lg font-black text-slate-800">{targetTeacher.name}</p>
                            <p className="font-bold text-slate-600">{targetTeacher.position}</p>
                        </div>
                        <div className="text-right">
                            <p className="font-bold text-slate-500 uppercase text-[10px] tracking-widest">รหัสประจำตัว</p>
                            <p className="text-lg font-black text-slate-800 font-mono">{targetTeacher.id}</p>
                        </div>
                    </div>

                    <table className="w-full border-collapse border-2 border-slate-800 mb-8 text-sm">
                        <thead className="bg-slate-50 font-bold">
                            <tr>
                                <th className="border-2 border-slate-800 p-2 w-12 text-center">ที่</th>
                                <th className="border-2 border-slate-800 p-2 text-center">วันที่ปฏิบัติงาน</th>
                                <th className="border-2 border-slate-800 p-2 text-center">เวลามา</th>
                                <th className="border-2 border-slate-800 p-2 text-center">เวลากลับ</th>
                                <th className="border-2 border-slate-800 p-2 text-center">สถานะ</th>
                                <th className="border-2 border-slate-800 p-2 text-center">หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic font-bold">ไม่พบข้อมูลการลงเวลาในช่วงเดือนที่เลือก</td></tr>
                            ) : history.sort((a,b) => a.date.localeCompare(b.date)).map((r, i) => (
                                <tr key={r.id}>
                                    <td className="border border-slate-800 p-2 text-center font-mono">{i + 1}</td>
                                    <td className="border border-slate-800 p-2">{getThaiDate(r.date)}</td>
                                    <td className="border border-slate-800 p-2 text-center font-bold">{r.checkInTime} น.</td>
                                    <td className="border border-slate-800 p-2 text-center">{r.checkOutTime ? `${r.checkOutTime} น.` : '-'}</td>
                                    <td className={`border border-slate-800 p-2 text-center font-bold ${r.status === 'Late' ? 'text-red-600' : 'text-green-700'}`}>
                                        {r.status === 'OnTime' ? 'ปกติ' : 'มาสาย'}
                                    </td>
                                    <td className="border border-slate-800 p-2"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="grid grid-cols-2 gap-10 mb-12">
                        <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-200">
                            <h4 className="font-black text-slate-800 mb-3 border-b border-slate-300 pb-2">สรุปสถิติประจำเดือน</h4>
                            <div className="space-y-2">
                                <div className="flex justify-between"><span>มาปฏิบัติงานปกติ:</span><span className="font-black text-green-700">{totalOnTime} วัน</span></div>
                                <div className="flex justify-between"><span>มาปฏิบัติงานสาย:</span><span className="font-black text-red-600">{totalLate} วัน</span></div>
                                <div className="flex justify-between border-t border-slate-300 pt-2 font-black text-lg"><span>รวมทั้งสิ้น:</span><span>{totalOnTime + totalLate} วัน</span></div>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center items-center gap-6">
                            <div className="text-center w-full">
                                <p className="mb-8">ลงชื่อ......................................................ผู้ขอรับรอง</p>
                                <p className="font-black">({targetTeacher.name})</p>
                                <p className="text-sm">ตำแหน่ง {targetTeacher.position}</p>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <p className="mb-8 font-bold italic">ความเห็นของผู้อำนวยการโรงเรียน: ....................................................................................................................................................</p>
                        <p className="mb-8">ลงชื่อ......................................................ผู้อำนวยการโรงเรียน</p>
                        <p className="font-black">( {allTeachers.find(t => t.roles.includes('DIRECTOR'))?.name || '......................................................'} )</p>
                    </div>
                </div>
            </div>
        );
    }

    // --- MAIN DASHBOARD VIEW ---
    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
            {/* Header Card */}
            <div className="bg-slate-800 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border-b-4 border-slate-900">
                <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl transition-all group-hover:scale-110"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-6">
                        <div className="p-5 bg-blue-600 rounded-3xl shadow-xl shadow-blue-500/20">
                            <MapPinned size={32}/>
                        </div>
                        <div>
                            <h2 className="text-3xl font-black tracking-tight">ลงเวลาปฏิบัติงาน</h2>
                            <p className="text-blue-400 font-bold flex items-center gap-1 uppercase tracking-widest text-xs mt-1">
                                <ShieldCheck size={14}/> {currentSchool.name}
                            </p>
                        </div>
                    </div>
                    <div className="text-center md:text-right bg-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-md">
                        <p className="text-blue-200 font-black text-lg">{getThaiDate(getTodayDateStr())}</p>
                        <div className="flex items-center justify-center md:justify-end gap-2 text-slate-400 font-bold text-xs mt-1">
                            <Clock size={14}/> รหัสโรงเรียน: {currentSchool.id}
                        </div>
                    </div>
                </div>
            </div>

            {/* Error Notification */}
            {errorMsg && (
                <div className="bg-red-50 border-2 border-red-100 p-5 rounded-3xl flex items-start gap-4 animate-shake">
                    <div className="p-2 bg-red-600 text-white rounded-xl">
                        <AlertTriangle size={20}/>
                    </div>
                    <div>
                        <h4 className="font-black text-red-600 uppercase text-xs tracking-widest mb-1">การลงเวลาไม่สำเร็จ</h4>
                        <p className="text-red-700 font-bold text-sm leading-relaxed">{errorMsg}</p>
                    </div>
                </div>
            )}

            {/* Main Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* CHECK-IN CARD */}
                <div className={`relative overflow-hidden p-8 rounded-[2.5rem] border-2 transition-all group ${
                    todayRecord 
                    ? 'bg-slate-50 border-slate-200 opacity-80' 
                    : 'bg-gradient-to-br from-emerald-50 to-green-100 border-green-200 hover:shadow-2xl hover:shadow-green-200/50 hover:-translate-y-2'
                }`}>
                    <div className="relative z-10 space-y-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                            todayRecord ? 'bg-slate-200 text-slate-400' : 'bg-green-600 text-white shadow-lg'
                        }`}>
                            <CheckCircle size={32}/>
                        </div>
                        <div>
                            <h3 className={`text-2xl font-black ${todayRecord ? 'text-slate-400' : 'text-green-800'}`}>ลงเวลามา</h3>
                            <p className="text-green-700/60 text-xs font-bold uppercase tracking-widest">Entry Check-In</p>
                        </div>
                        
                        {todayRecord ? (
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">บันทึกเวลาแล้ว</p>
                                <p className="text-2xl font-black text-green-600">{todayRecord.checkInTime} น.</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-1">สถานะ: {todayRecord.status === 'OnTime' ? 'มาปกติ' : 'มาสาย'}</p>
                            </div>
                        ) : (
                            <button 
                                onClick={() => handleAttendanceAction('IN')}
                                disabled={isProcessing}
                                className="w-full py-5 bg-green-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-green-200 hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-3"
                            >
                                {isProcessing ? <RefreshCw className="animate-spin" size={24}/> : <Navigation size={24}/>}
                                ยืนยันพิกัดเข้างาน
                            </button>
                        )}
                    </div>
                    {!todayRecord && <div className="absolute -right-4 -bottom-4 text-green-600/5 group-hover:scale-125 transition-transform"><CheckCircle size={150}/></div>}
                </div>

                {/* CHECK-OUT CARD */}
                <div className={`relative overflow-hidden p-8 rounded-[2.5rem] border-2 transition-all group ${
                    todayRecord?.checkOutTime || !todayRecord
                    ? 'bg-slate-50 border-slate-200 opacity-80' 
                    : 'bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200 hover:shadow-2xl hover:shadow-orange-200/50 hover:-translate-y-2'
                }`}>
                    <div className="relative z-10 space-y-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                            todayRecord?.checkOutTime || !todayRecord ? 'bg-slate-200 text-slate-400' : 'bg-orange-600 text-white shadow-lg'
                        }`}>
                            <LogOut size={32}/>
                        </div>
                        <div>
                            <h3 className={`text-2xl font-black ${todayRecord?.checkOutTime || !todayRecord ? 'text-slate-400' : 'text-orange-800'}`}>ลงเวลากลับ</h3>
                            <p className="text-orange-700/60 text-xs font-bold uppercase tracking-widest">Departure Check-Out</p>
                        </div>

                        {todayRecord?.checkOutTime ? (
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">บันทึกเวลากลับแล้ว</p>
                                <p className="text-2xl font-black text-orange-600">{todayRecord.checkOutTime} น.</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-1">ขอบคุณที่ปฏิบัติหน้าที่ในวันนี้</p>
                            </div>
                        ) : !todayRecord ? (
                             <div className="bg-slate-100 p-4 rounded-2xl border border-slate-200 border-dashed text-center">
                                <p className="text-xs font-bold text-slate-400 italic">กรุณาลงเวลามาปฏิบัติงานก่อน</p>
                            </div>
                        ) : (
                            <button 
                                onClick={() => handleAttendanceAction('OUT')}
                                disabled={isProcessing}
                                className="w-full py-5 bg-orange-600 text-white rounded-3xl font-black text-lg shadow-xl shadow-orange-200 hover:bg-orange-700 active:scale-95 transition-all flex items-center justify-center gap-3"
                            >
                                {isProcessing ? <RefreshCw className="animate-spin" size={24}/> : <Navigation size={24}/>}
                                ยืนยันพิกัดกลับบ้าน
                            </button>
                        )}
                    </div>
                    {todayRecord && !todayRecord.checkOutTime && <div className="absolute -right-4 -bottom-4 text-orange-600/5 group-hover:scale-125 transition-transform"><LogOut size={150}/></div>}
                </div>
            </div>

            {/* History & Print Table */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 bg-slate-50 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="font-black text-xl text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                        <History className="text-blue-600" size={24}/>
                        {isAdminView ? 'ประวัติการลงเวลาและรายงานสรุป' : 'ประวัติการลงเวลาส่วนตัว'}
                    </h3>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {isAdminView && (
                            <button onClick={() => setViewMode('PRINT_DAILY')} className="flex-1 sm:flex-none p-2.5 bg-slate-800 text-white rounded-xl hover:bg-black transition-all flex items-center justify-center gap-2 font-bold text-xs shadow-md">
                                <Users size={16}/> สรุปรายวัน
                            </button>
                        )}
                        <button onClick={() => setViewMode('PRINT_MONTHLY')} className="flex-1 sm:flex-none p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 font-bold text-xs shadow-md">
                            <Printer size={16}/> สรุปรายเดือน
                        </button>
                        <button onClick={fetchData} className="p-2.5 hover:bg-white rounded-xl text-slate-400 hover:text-blue-600 transition-all border border-transparent hover:border-blue-100 bg-slate-100">
                            <RefreshCw size={18}/>
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                            <tr>
                                <th className="p-6">วันที่ปฏิบัติงาน</th>
                                <th className="p-6 text-center">เวลามา</th>
                                <th className="p-6 text-center">เวลากลับ</th>
                                <th className="p-6 text-center">สถานะ</th>
                                <th className="p-6 text-center">พิกัด</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {history.length === 0 ? (
                                <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold">ไม่พบประวัติการลงเวลา</td></tr>
                            ) : history.map((r, i) => (
                                <tr key={i} className="hover:bg-blue-50/50 transition-colors group">
                                    <td className="p-6">
                                        <div className="font-black text-slate-700">{getThaiDate(r.date)}</div>
                                        {isAdminView && <span className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">{r.teacherName}</span>}
                                    </td>
                                    <td className="p-6 text-center">
                                        <div className="inline-flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-600"></div>
                                            <span className="font-black text-green-700">{r.checkInTime} น.</span>
                                        </div>
                                    </td>
                                    <td className="p-6 text-center">
                                        {r.checkOutTime ? (
                                            <div className="inline-flex items-center gap-2 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-600"></div>
                                                <span className="font-black text-orange-700">{r.checkOutTime} น.</span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-300 font-bold italic text-xs">ยังไม่ลงเวลากลับ</span>
                                        )}
                                    </td>
                                    <td className="p-6 text-center">
                                        <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm border ${
                                            r.status === 'OnTime' 
                                            ? 'bg-emerald-600 text-white border-emerald-500' 
                                            : 'bg-rose-600 text-white border-rose-500'
                                        }`}>
                                            {r.status === 'OnTime' ? 'ปกติ' : 'มาสาย'}
                                        </span>
                                    </td>
                                    <td className="p-6 text-center">
                                        {r.coordinate && (
                                            <a 
                                                href={`https://www.google.com/maps?q=${r.coordinate.lat},${r.coordinate.lng}`} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="p-2 text-slate-400 hover:text-blue-600 inline-block transition-colors"
                                                title="ดูพิกัดบนแผนที่"
                                            >
                                                <Navigation size={18}/>
                                            </a>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* GPS Helper Card */}
            <div className="bg-blue-50 p-6 rounded-[2rem] border-2 border-blue-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-2xl shadow-sm text-blue-600">
                        <Navigation size={24}/>
                    </div>
                    <div>
                        <h4 className="font-black text-blue-900">พื้นที่ลงเวลาปฏิบัติงาน</h4>
                        <p className="text-blue-700/70 text-xs font-bold">พิกัดโรงเรียน: {currentSchool.lat || '-'}, {currentSchool.lng || '-'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">รัศมีที่อนุญาต</p>
                        <p className="text-xl font-black text-blue-900">{currentSchool.radius || 500} เมตร</p>
                    </div>
                    {gpsStatus && (
                         <div className="text-center border-l border-blue-200 pl-6">
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">ระยะห่างปัจจุบัน</p>
                            <p className={`text-xl font-black ${gpsStatus.dist <= (currentSchool.radius || 500) ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {Math.round(gpsStatus.dist)} ม.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake { animation: shake 0.3s ease-in-out; }
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    @page { size: portrait; margin: 1cm; }
                }
            `}</style>
        </div>
    );
};

export default AttendanceSystem;
