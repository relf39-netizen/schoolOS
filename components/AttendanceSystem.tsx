
import { useState, useEffect } from 'react';
import { AttendanceRecord, Teacher, School } from '../types';
import { MapPin, Navigation, CheckCircle, LogOut, History, Loader, RefreshCw, AlertTriangle, Clock, Calendar, ShieldCheck, MapPinned } from 'lucide-react';
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

    const isAdminView = currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DIRECTOR');

    // Fetch History and Today's Record
    const fetchData = async () => {
        if (!isConfigured || !supabase) return;
        setIsLoadingData(true);
        setErrorMsg(null);

        try {
            const today = getTodayDateStr();
            
            // 1. Fetch History
            let query = supabase.from('attendance').select('*').order('date', { ascending: false }).order('check_in_time', { ascending: false });
            if (!isAdminView) {
                query = query.eq('teacher_id', currentUser.id);
            } else {
                query = query.eq('school_id', currentUser.schoolId);
            }
            
            const { data, error } = await query.limit(50);
            if (error) throw error;
            
            // Fix: Map data from DB snake_case to camelCase to match AttendanceRecord interface
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

            // 2. Identify Today's Record for current user
            // Fix: Use camelCase property teacherId (was teacher_id)
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
    }, [currentUser.id, currentUser.schoolId]);

    const handleAttendanceAction = async (type: 'IN' | 'OUT') => {
        setIsProcessing(true);
        setErrorMsg(null);
        
        try {
            // 1. Get GPS Location
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
            const dist = calculateDistance(lat, schoolLng, schoolLat, schoolLng);
            
            setGpsStatus({ lat, lng, dist });

            // 2. Check Radius
            if (dist > radius) {
                throw new Error(`คุณอยู่นอกพื้นที่ลงเวลา (${Math.round(dist)} เมตร) กรุณาเคลื่อนตัวเข้าไปในรัศมีโรงเรียน (${radius} เมตร)`);
            }

            const now = new Date();
            const dateStr = getTodayDateStr();
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

            if (type === 'IN') {
                // Check double IN
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
                // Check if already OUT
                // Fix: Changed check_out_time to checkOutTime
                if (todayRecord?.checkOutTime) {
                    throw new Error("ท่านได้ลงเวลากลับเรียบร้อยแล้ว");
                }
                
                // Need today's record to update
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

            fetchData(); // Refresh UI
        } catch (e: any) {
            setErrorMsg(e.message || "เกิดข้อผิดพลาดในการลงเวลา");
            alert(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoadingData) return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
            <Loader className="animate-spin text-blue-600" size={40}/>
            <p className="font-bold text-slate-500">กำลังตรวจสอบข้อมูลการลงเวลา...</p>
        </div>
    );

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
                                {/* Fix: Changed check_in_time to checkInTime */}
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
                    // Fix: Changed check_out_time to checkOutTime
                    todayRecord?.checkOutTime || !todayRecord
                    ? 'bg-slate-50 border-slate-200 opacity-80' 
                    : 'bg-gradient-to-br from-orange-50 to-amber-100 border-orange-200 hover:shadow-2xl hover:shadow-orange-200/50 hover:-translate-y-2'
                }`}>
                    <div className="relative z-10 space-y-6">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                            // Fix: Changed check_out_time to checkOutTime
                            todayRecord?.checkOutTime || !todayRecord ? 'bg-slate-200 text-slate-400' : 'bg-orange-600 text-white shadow-lg'
                        }`}>
                            <LogOut size={32}/>
                        </div>
                        <div>
                            {/* Fix: Changed check_out_time to checkOutTime */}
                            <h3 className={`text-2xl font-black ${todayRecord?.checkOutTime || !todayRecord ? 'text-slate-400' : 'text-orange-800'}`}>ลงเวลากลับ</h3>
                            <p className="text-orange-700/60 text-xs font-bold uppercase tracking-widest">Departure Check-Out</p>
                        </div>

                        {/* Fix: Changed check_out_time to checkOutTime */}
                        {todayRecord?.checkOutTime ? (
                            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-inner">
                                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">บันทึกเวลากลับแล้ว</p>
                                {/* Fix: Changed check_out_time to checkOutTime */}
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
                    {/* Fix: Changed check_out_time to checkOutTime */}
                    {todayRecord && !todayRecord.checkOutTime && <div className="absolute -right-4 -bottom-4 text-orange-600/5 group-hover:scale-125 transition-transform"><LogOut size={150}/></div>}
                </div>
            </div>

            {/* History Table */}
            <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
                    <h3 className="font-black text-xl text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                        <History className="text-blue-600" size={24}/>
                        {isAdminView ? 'ประวัติการลงเวลาบุคลากร' : 'ประวัติการลงเวลาส่วนตัว'}
                    </h3>
                    <button onClick={fetchData} className="p-2 hover:bg-white rounded-full text-slate-400 hover:text-blue-600 transition-all border border-transparent hover:border-blue-100">
                        <RefreshCw size={18}/>
                    </button>
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
                                        {/* Fix: Changed teacher_name to teacherName */}
                                        {isAdminView && <span className="text-[10px] text-blue-600 font-black uppercase tracking-tighter">{r.teacherName}</span>}
                                    </td>
                                    <td className="p-6 text-center">
                                        <div className="inline-flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-600"></div>
                                            {/* Fix: Changed check_in_time to checkInTime */}
                                            <span className="font-black text-green-700">{r.checkInTime} น.</span>
                                        </div>
                                    </td>
                                    <td className="p-6 text-center">
                                        {/* Fix: Changed check_out_time to checkOutTime */}
                                        {r.checkOutTime ? (
                                            <div className="inline-flex items-center gap-2 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-600"></div>
                                                {/* Fix: Changed check_out_time to checkOutTime */}
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
            `}</style>
        </div>
    );
};

export default AttendanceSystem;
