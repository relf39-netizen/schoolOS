
import React, { useState, useEffect } from 'react';
import { DEFAULT_LOCATION, MOCK_ATTENDANCE_HISTORY, MOCK_LEAVE_REQUESTS } from '../constants';
import { AttendanceRecord, Teacher, School, LeaveRequest } from '../types';
import { MapPin, Navigation, CheckCircle, LogOut, History, Printer, ArrowLeft, Database, ServerOff, Loader, RefreshCw, AlertTriangle } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, where, getDocs, updateDoc, doc, limit } from 'firebase/firestore';

// Haversine formula to calculate distance in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

// Thai Date Helpers
const getThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getThaiDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) return '';
    return `วันที่ ${getThaiDate(dateStr)} เวลา ${timeStr} น.`;
};

interface AttendanceSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    currentSchool: School; 
}

const AttendanceSystem: React.FC<AttendanceSystemProps> = ({ currentUser, allTeachers, currentSchool }) => {
    // State
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'REPORT'>('DASHBOARD');
    
    // GPS State
    const [currentPos, setCurrentPos] = useState<{lat: number, lng: number} | null>(null);
    const [distance, setDistance] = useState<number | null>(null);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [isCheckingLocation, setIsCheckingLocation] = useState(false);
    
    // School Location Logic
    const schoolLat = currentSchool.lat || DEFAULT_LOCATION.lat;
    const schoolLng = currentSchool.lng || DEFAULT_LOCATION.lng;
    const allowedRadius = currentSchool.radius || DEFAULT_LOCATION.allowedRadiusMeters;
    const lateThreshold = currentSchool.lateTimeThreshold || '08:30'; // Default late time

    // Check-in state
    const [status, setStatus] = useState<'None' | 'CheckedIn' | 'CheckedOut'>('None');
    const [timeIn, setTimeIn] = useState<string | null>(null);
    const [timeOut, setTimeOut] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Data State
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [leaves, setLeaves] = useState<LeaveRequest[]>([]); // Need to fetch leaves to cross-reference
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]); 

    // Permissions
    const isAdminView = currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DIRECTOR') || currentUser.roles.includes('DOCUMENT_OFFICER');

    // --- Firebase Data Sync ---
    useEffect(() => {
        let unsubscribeAtt: () => void;
        let unsubscribeLeaves: () => void;
        let timeoutId: NodeJS.Timeout;

        if (isConfigured && db) {
             // SAFETY TIMEOUT: Fallback if Firestore takes too long (3s)
             timeoutId = setTimeout(() => {
                if(isLoadingData) {
                    console.warn("Firestore Attendance timeout. Switching to Mock Data.");
                    setHistory(MOCK_ATTENDANCE_HISTORY);
                    setLeaves(MOCK_LEAVE_REQUESTS);
                    setIsLoadingData(false);
                }
            }, 3000);

            // 1. Fetch Attendance
            const qAtt = query(collection(db, "attendance"), orderBy("date", "desc"), limit(200));
            unsubscribeAtt = onSnapshot(qAtt, (snapshot) => {
                const fetched: AttendanceRecord[] = [];
                snapshot.forEach((doc) => {
                    fetched.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
                });
                setHistory(fetched);
                
                // Determine current user status for today
                const today = new Date().toISOString().split('T')[0];
                const todayRecord = fetched.find(r => r.teacherId === currentUser.id && r.date === today);
                
                if (todayRecord) {
                    if (todayRecord.checkOutTime) {
                        setStatus('CheckedOut');
                        setTimeIn(todayRecord.checkInTime);
                        setTimeOut(todayRecord.checkOutTime);
                    } else {
                        setStatus('CheckedIn');
                        setTimeIn(todayRecord.checkInTime);
                        setTimeOut(null);
                    }
                } else {
                    setStatus('None');
                    setTimeIn(null);
                    setTimeOut(null);
                }
            });

            // 2. Fetch Leaves (To check for Absent/Leave status)
            const qLeaves = query(collection(db, "leave_requests"), where("status", "==", "Approved"));
            unsubscribeLeaves = onSnapshot(qLeaves, (snapshot) => {
                const fetchedLeaves: LeaveRequest[] = [];
                snapshot.forEach((doc) => {
                    fetchedLeaves.push({ id: doc.id, ...doc.data() } as LeaveRequest);
                });
                setLeaves(fetchedLeaves);
                clearTimeout(timeoutId);
                setIsLoadingData(false);
            });

        } else {
            // Mock Mode
            setHistory(MOCK_ATTENDANCE_HISTORY);
            setLeaves(MOCK_LEAVE_REQUESTS);
            setIsLoadingData(false);
        }
        
        return () => {
            if(timeoutId) clearTimeout(timeoutId);
            if(unsubscribeAtt) unsubscribeAtt();
            if(unsubscribeLeaves) unsubscribeLeaves();
        };
    }, [currentUser.id]);


    // --- GPS Logic (Initial passive check) ---
    useEffect(() => {
        // Initial quick check (low accuracy is fine for UI update)
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    setCurrentPos({ lat, lng });
                    const dist = calculateDistance(lat, lng, schoolLat, schoolLng);
                    setDistance(dist);
                },
                (err) => console.warn("Initial GPS check failed", err),
                { enableHighAccuracy: false, timeout: 5000 }
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Helper: Promisified Geolocation (High Accuracy)
    const getCurrentPosition = (): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Browser does not support geolocation"));
                return;
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true, // IMPORTANT: Force GPS on mobile
                timeout: 10000,
                maximumAge: 0 // Do not use cached position
            });
        });
    };

    const handleAction = async (type: 'In' | 'Out') => {
        setIsProcessing(true);
        setIsCheckingLocation(true);
        setGpsError(null);

        try {
            // 1. Force get current GPS location (REAL TIME CHECK)
            const position = await getCurrentPosition();
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            // Update state for UI
            setCurrentPos({ lat, lng });
            const dist = calculateDistance(lat, lng, schoolLat, schoolLng);
            setDistance(dist);

            // 2. Validate Distance
            if (dist > allowedRadius) {
                throw new Error(`คุณอยู่นอกพื้นที่โรงเรียน (${dist.toFixed(0)} เมตร) กรุณาขยับเข้าใกล้จุดเช็คอิน`);
            }

            // 3. Process Check-In/Out
            const now = new Date();
            const timeString = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            const dateString = now.toISOString().split('T')[0];
            
            // Check Late Status
            let checkStatus: 'OnTime' | 'Late' = 'OnTime';
            if (type === 'In' && timeString > lateThreshold) {
                checkStatus = 'Late';
            }

            if (isConfigured && db) {
                // ONLINE MODE
                if (type === 'In') {
                    if (status !== 'None') return; // Double check

                    const newRecord = {
                        teacherId: currentUser.id,
                        teacherName: currentUser.name,
                        date: dateString,
                        checkInTime: timeString,
                        checkOutTime: null,
                        status: checkStatus, 
                        coordinate: { lat, lng } // Save GPS data
                    };
                    await addDoc(collection(db, "attendance"), newRecord);
                    alert(`ลงเวลามาสำเร็จ: ${timeString} ${checkStatus === 'Late' ? '(สาย)' : ''}`);
                } else {
                    const q = query(
                        collection(db, "attendance"), 
                        where("teacherId", "==", currentUser.id),
                        where("date", "==", dateString)
                    );
                    const querySnapshot = await getDocs(q);
                    
                    if (!querySnapshot.empty) {
                        const docRef = doc(db, "attendance", querySnapshot.docs[0].id);
                        await updateDoc(docRef, {
                            checkOutTime: timeString,
                            checkOutCoordinate: { lat, lng } // Save Out GPS data (optional schema update)
                        });
                        alert(`ลงเวลากลับสำเร็จ: ${timeString}`);
                    } else {
                        throw new Error("ไม่พบข้อมูลการลงเวลามา (กรุณาติดต่อ Admin)");
                    }
                }
            } else {
                // OFFLINE MOCK MODE
                if (type === 'In') {
                    setStatus('CheckedIn');
                    setTimeIn(timeString);
                    setHistory([{
                        id: `new_${Date.now()}`,
                        teacherId: currentUser.id,
                        teacherName: currentUser.name,
                        date: dateString,
                        checkInTime: timeString,
                        checkOutTime: null,
                        status: checkStatus,
                        coordinate: { lat, lng }
                    }, ...history]);
                    alert(`(Offline) ลงเวลามาสำเร็จ: ${timeString}`);
                } else {
                    setStatus('CheckedOut');
                    setTimeOut(timeString);
                    setHistory(history.map(h => 
                        h.date === dateString && h.teacherId === currentUser.id 
                            ? { ...h, checkOutTime: timeString } 
                            : h
                    ));
                    alert(`(Offline) ลงเวลากลับสำเร็จ: ${timeString}`);
                }
            }

        } catch (err: any) {
            console.error(err);
            setGpsError(err.message || "ไม่สามารถระบุตำแหน่งได้");
            alert(err.message || "เกิดข้อผิดพลาดในการระบุตำแหน่ง GPS");
        } finally {
            setIsProcessing(false);
            setIsCheckingLocation(false);
        }
    };

    const isWithinRange = distance !== null && distance <= allowedRadius;

    // --- Helpers ---
    const getDisplayCheckOut = (record: AttendanceRecord) => {
        if (record.checkOutTime) return record.checkOutTime + " น.";
        const today = new Date().toISOString().split('T')[0];
        if (record.date !== today) return <span className="text-slate-400 italic">17:00 น. (อัตโนมัติ)</span>;
        return <span className="text-slate-300">-</span>;
    };

    // Helper: Determine status for a specific teacher on a specific date
    const getTeacherStatusForDate = (teacherId: string, dateStr: string) => {
        // 1. Check Attendance Record
        const record = history.find(h => h.teacherId === teacherId && h.date === dateStr);
        if (record) {
            return {
                status: record.status, // OnTime, Late
                checkIn: record.checkInTime + " น.",
                checkOut: record.checkOutTime ? record.checkOutTime + " น." : '-',
                note: record.status === 'Late' ? 'มาสาย' : ''
            };
        }

        // 2. Check Leave Requests (Approved)
        const leave = leaves.find(l => 
            l.teacherId === teacherId && 
            l.status === 'Approved' && 
            l.startDate <= dateStr && 
            l.endDate >= dateStr
        );

        if (leave) {
            const leaveTypeMap: {[key: string]: string} = { 'Sick': 'ลาป่วย', 'Personal': 'ลากิจ', 'OffCampus': 'ราชการ/นอกสถานที่', 'Late': 'ขอเข้าสาย' };
            return {
                status: 'Leave',
                checkIn: '-',
                checkOut: '-',
                note: leaveTypeMap[leave.type] || 'ลา'
            };
        }

        // 3. Absent (Only if date is today or past, and no record)
        // Note: For future dates, it's just blank.
        const today = new Date().toISOString().split('T')[0];
        if (dateStr <= today) {
            // Need to calculate Thai Date for Absent Display
            const thaiDateTime = getThaiDateTime(dateStr, '08:00'); // Default start time
            return {
                status: 'Absent',
                checkIn: '-',
                checkOut: '-',
                note: 'ขาดงาน',
                absentDetail: thaiDateTime
            };
        }

        return { status: 'None', checkIn: '-', checkOut: '-', note: '' };
    };

    if (isLoadingData) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400 flex-col gap-2">
                <Loader className="animate-spin" size={32}/>
                <p>กำลังโหลดข้อมูลการลงเวลา...</p>
            </div>
        );
    }

    // --- VIEW 1: DASHBOARD ---
    const renderDashboard = () => (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Control Panel (GPS & Buttons) */}
            <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-2 bg-gradient-to-r ${isWithinRange ? 'from-green-400 to-emerald-500' : 'from-orange-400 to-red-500'}`}></div>
                
                <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
                    {/* Location Status */}
                    <div className="flex flex-col items-center flex-1 text-center">
                        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3 transition-colors duration-500 border-4 ${
                            isCheckingLocation ? 'bg-blue-50 border-blue-100 animate-pulse' :
                            gpsError ? 'bg-red-50 border-red-100 text-red-500' :
                            isWithinRange ? 'bg-green-50 border-green-100 text-green-600 shadow-lg' :
                            'bg-orange-50 border-orange-100 text-orange-500'
                        }`}>
                            {isCheckingLocation ? <RefreshCw className="animate-spin text-blue-500" size={32} /> : 
                             gpsError ? <AlertTriangle size={32}/> :
                             <MapPin size={36} className={isWithinRange ? 'animate-bounce' : ''} />
                            }
                        </div>
                        
                        <h3 className={`font-bold text-lg ${isWithinRange ? 'text-green-700' : 'text-slate-700'}`}>
                            {isCheckingLocation ? 'กำลังระบุพิกัด...' : 
                             gpsError ? 'เกิดข้อผิดพลาด GPS' :
                             isWithinRange ? 'อยู่ในพื้นที่โรงเรียน' : 'อยู่นอกพื้นที่โรงเรียน'}
                        </h3>
                        
                        {!isCheckingLocation && !gpsError && (
                            <div className="space-y-1">
                                <p className="text-sm text-slate-500">
                                    {distance ? `ระยะห่าง ${distance.toFixed(0)} ม. (รัศมี ${allowedRadius} ม.)` : 'รอการตรวจสอบตำแหน่ง'}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    พิกัดของคุณ: {currentPos ? `${currentPos.lat.toFixed(6)}, ${currentPos.lng.toFixed(6)}` : '-'}
                                </p>
                            </div>
                        )}
                        
                        {gpsError && (
                            <p className="text-xs text-red-500 mt-1 max-w-xs">{gpsError}</p>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-3 flex-1 w-full md:w-auto">
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-700 mb-2 flex items-start gap-2">
                             <Navigation size={16} className="shrink-0 mt-0.5"/>
                             <div>
                                 <p>ระบบจะดึงพิกัด GPS อัตโนมัติเมื่อกดปุ่มลงเวลา</p>
                                 <p className="font-bold mt-1">เวลาเข้าสาย: หลัง {lateThreshold} น.</p>
                             </div>
                        </div>

                        <div className="flex gap-4">
                            <button 
                                disabled={status !== 'None' || isProcessing}
                                onClick={() => handleAction('In')}
                                className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all relative overflow-hidden ${
                                    status === 'CheckedIn' || status === 'CheckedOut' ? 'bg-slate-50 opacity-50 cursor-not-allowed' : 
                                    'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 hover:shadow-md'
                                }`}
                            >
                                {isProcessing && status === 'None' && <div className="absolute inset-0 bg-white/50 flex items-center justify-center"><Loader className="animate-spin"/></div>}
                                <CheckCircle size={28} className="mb-1" />
                                <span className="font-bold">ลงเวลามา</span>
                                {timeIn && <span className="text-xs bg-white px-2 rounded border mt-1 border-green-200 text-green-800 font-mono">{timeIn} น.</span>}
                            </button>

                            <button 
                                disabled={status !== 'CheckedIn' || isProcessing}
                                onClick={() => handleAction('Out')}
                                className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all relative overflow-hidden ${
                                    status === 'CheckedOut' || status === 'None' ? 'bg-slate-50 opacity-50 cursor-not-allowed' : 
                                    'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:shadow-md'
                                }`}
                            >
                                {isProcessing && status === 'CheckedIn' && <div className="absolute inset-0 bg-white/50 flex items-center justify-center"><Loader className="animate-spin"/></div>}
                                <LogOut size={28} className="mb-1" />
                                <span className="font-bold">ลงเวลากลับ</span>
                                {timeOut && <span className="text-xs bg-white px-2 rounded border mt-1 border-orange-200 text-orange-800 font-mono">{timeOut} น.</span>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* History Header & Print Button */}
            <div className="flex justify-between items-end">
                <div className="flex items-center gap-2 text-slate-700">
                    <History size={20} />
                    <h3 className="font-bold text-lg">ประวัติการลงเวลา</h3>
                </div>
                <button 
                    onClick={() => setViewMode('REPORT')}
                    className="bg-slate-800 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-slate-900 transition-colors flex items-center gap-2 text-sm"
                >
                    <Printer size={16} /> 
                    {isAdminView ? 'พิมพ์ใบลงเวลาประจำวัน' : 'พิมพ์ประวัติการลงเวลา'}
                </button>
            </div>

            {/* History Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500">
                        <tr>
                            <th className="px-6 py-3">วันที่</th>
                            <th className="px-6 py-3">เวลามา</th>
                            <th className="px-6 py-3">เวลากลับ</th>
                            <th className="px-6 py-3 text-center">สถานะ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {/* If Admin, show everyone. If Teacher, show only self */}
                        {history
                            .filter(h => isAdminView ? true : h.teacherId === currentUser.id)
                            .map((record, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-6 py-3 font-medium text-slate-700">
                                        {getThaiDate(record.date)} 
                                        {isAdminView && <div className="text-xs text-slate-400">{record.teacherName}</div>}
                                    </td>
                                    <td className="px-6 py-3 text-green-700 font-mono">
                                        {record.checkInTime} น.
                                        {record.coordinate && isAdminView && (
                                            <a 
                                                href={`https://www.google.com/maps?q=${record.coordinate.lat},${record.coordinate.lng}`} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="ml-2 text-[10px] text-blue-500 underline"
                                            >
                                                GPS
                                            </a>
                                        )}
                                    </td>
                                    <td className="px-6 py-3 text-orange-700 font-mono">{getDisplayCheckOut(record)}</td>
                                    <td className="px-6 py-3 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                            record.status === 'OnTime' ? 'bg-green-100 text-green-700' : 
                                            record.status === 'Late' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {record.status === 'OnTime' ? 'ปกติ' : record.status === 'Late' ? 'มาสาย' : record.status}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        }
                        {history.length === 0 && (
                             <tr><td colSpan={4} className="text-center py-6 text-slate-400">ไม่พบประวัติการลงเวลา</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    // --- VIEW 2: REPORT ---
    const renderReport = () => (
        <div className="animate-fade-in bg-slate-100 min-h-screen">
            {/* Toolbar (Hidden on Print) */}
            <div className="bg-white p-4 shadow-sm mb-6 print:hidden">
                <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button onClick={() => setViewMode('DASHBOARD')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                            <ArrowLeft size={20}/>
                        </button>
                        <div>
                            <h2 className="font-bold text-slate-800 text-lg">
                                {isAdminView ? 'ใบลงเวลาประจำวัน (สำหรับเสนอ ผอ.)' : 'ประวัติการปฏิบัติงาน (ส่วนตัว)'}
                            </h2>
                            {isAdminView && (
                                <div className="flex items-center gap-2 mt-1">
                                    <label className="text-xs text-slate-500">เลือกวันที่:</label>
                                    <input 
                                        type="date" 
                                        value={reportDate} 
                                        onChange={(e) => setReportDate(e.target.value)}
                                        className="text-sm border rounded px-2 py-0.5"
                                    />
                                    <span className="text-sm text-blue-600 font-bold ml-2">
                                        {getThaiDate(reportDate)}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                    <button onClick={() => window.print()} className="w-full md:w-auto bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 shadow-sm">
                        <Printer size={18} /> สั่งพิมพ์เอกสาร
                    </button>
                </div>
            </div>

            {/* Paper Preview */}
            <div className="bg-white shadow-lg p-10 mx-auto max-w-[800px] min-h-[1000px] font-sarabun text-slate-900 print:shadow-none print:border-none print:p-0 print:w-full">
                {/* Document Header */}
                <div className="text-center mb-8">
                     <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Emblem_of_the_Ministry_of_Education_of_Thailand.svg/1200px-Emblem_of_the_Ministry_of_Education_of_Thailand.svg.png" alt="Garuda" className="h-20 mx-auto mb-4 grayscale opacity-80" />
                     <h2 className="text-xl font-bold mb-1">
                        {isAdminView ? 'บัญชีลงเวลาปฏิบัติราชการ' : 'รายงานประวัติการปฏิบัติราชการ'}
                     </h2>
                     <p className="text-base">{currentSchool.name} อำเภอ{currentSchool.district} จังหวัด{currentSchool.province}</p>
                     <p className="text-sm text-slate-600 mt-2">
                         {isAdminView 
                            ? `ประจำวันที่ ${getThaiDate(reportDate)}`
                            : `ข้อมูลของ: ${currentUser.name}`
                         }
                     </p>
                </div>

                {/* Report Content */}
                {isAdminView ? (
                    // ADMIN REPORT TABLE
                    <table className="w-full border-collapse border border-black mb-8 text-sm">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="border border-black p-2 text-center w-10">ที่</th>
                                <th className="border border-black p-2 text-left">ชื่อ - สกุล</th>
                                <th className="border border-black p-2 text-left w-24">ตำแหน่ง</th>
                                <th className="border border-black p-2 text-center w-20">เวลามา</th>
                                <th className="border border-black p-2 text-center w-20">ลายมือชื่อ</th>
                                <th className="border border-black p-2 text-center w-20">เวลากลับ</th>
                                <th className="border border-black p-2 text-center w-20">ลายมือชื่อ</th>
                                <th className="border border-black p-2 text-center w-28">หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Iterate teachers to show status (Present/Late/Leave/Absent) */}
                            {/* FILTER: Exclude DIRECTOR from this list */}
                            {allTeachers
                                .filter(t => !t.roles.includes('DIRECTOR'))
                                .map((teacher, index) => {
                                    const { status, checkIn, checkOut, note, absentDetail } = getTeacherStatusForDate(teacher.id, reportDate);
                                    return (
                                        <tr key={teacher.id}>
                                            <td className="border border-black p-2 text-center">{index + 1}</td>
                                            <td className="border border-black p-2">{teacher.name}</td>
                                            <td className="border border-black p-2 text-xs">{teacher.position}</td>
                                            
                                            {/* Logic for Absent Display */}
                                            {status === 'Absent' ? (
                                                <td colSpan={5} className="border border-black p-2 text-center font-bold text-red-600 bg-red-50">
                                                    {absentDetail}
                                                </td>
                                            ) : status === 'Leave' ? (
                                                <td colSpan={5} className="border border-black p-2 text-center font-bold text-blue-600 bg-blue-50">
                                                    {note} (ลา)
                                                </td>
                                            ) : (
                                                <>
                                                    <td className={`border border-black p-2 text-center ${status === 'Late' ? 'text-red-600 font-bold' : ''}`}>
                                                        {checkIn}
                                                    </td>
                                                    <td className="border border-black p-2 text-center text-xs text-slate-400">...................</td>
                                                    <td className="border border-black p-2 text-center">{checkOut}</td>
                                                    <td className="border border-black p-2 text-center text-xs text-slate-400">...................</td>
                                                    <td className="border border-black p-2 text-center text-xs">
                                                        {status === 'Late' ? 'มาสาย' : ''}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                            })}
                        </tbody>
                    </table>
                ) : (
                    // TEACHER PERSONAL REPORT TABLE
                    <table className="w-full border-collapse border border-black mb-8 text-sm">
                        <thead>
                            <tr className="bg-slate-100">
                                <th className="border border-black p-2 text-center w-12">ที่</th>
                                <th className="border border-black p-2 text-center w-32">วันที่</th>
                                <th className="border border-black p-2 text-center">เวลามา</th>
                                <th className="border border-black p-2 text-center">เวลากลับ</th>
                                <th className="border border-black p-2 text-center w-24">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.filter(h => h.teacherId === currentUser.id).map((record, index) => (
                                <tr key={record.id}>
                                    <td className="border border-black p-2 text-center">{index + 1}</td>
                                    <td className="border border-black p-2 text-center">{getThaiDate(record.date)}</td>
                                    <td className="border border-black p-2 text-center">{record.checkInTime} น.</td>
                                    <td className="border border-black p-2 text-center">{getDisplayCheckOut(record)}</td>
                                    <td className="border border-black p-2 text-center">
                                        {record.status === 'OnTime' ? 'ปกติ' : 
                                         record.status === 'Late' ? 'สาย' : record.status}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Footer Signature */}
                <div className="flex flex-col items-center justify-center mt-16 page-break-inside-avoid">
                    {isAdminView ? (
                        <div className="flex flex-col items-end w-full px-10">
                            <div className="text-center">
                                <p className="mb-8">ขอรับรองว่าข้าราชการครูและบุคลากรทางการศึกษาได้มาปฏิบัติราชการจริง</p>
                                <div className="text-center relative mt-8">
                                    <div className="border-b border-black w-64 mb-2 border-dotted mx-auto"></div>
                                    <p className="font-bold mb-1">( ผู้อำนวยการสถานศึกษา )</p>
                                    <p>ผู้อำนวยการ {currentSchool.name}</p>
                                    <p className="text-sm mt-1">ผู้ตรวจสอบ / ผู้รับรอง</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center w-full flex justify-end px-10">
                            <div className="text-center">
                                <p className="mb-8">ลงชื่อ.......................................................ผู้ปฏิบัติงาน</p>
                                <p>({currentUser.name})</p>
                                <p>ตำแหน่ง {currentUser.position}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in pb-10">
            {viewMode === 'DASHBOARD' && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-orange-100 text-orange-900 p-4 rounded-xl mb-6 print:hidden">
                    <div>
                        <h2 className="text-xl font-bold">ระบบลงเวลาปฏิบัติงาน (GPS)</h2>
                         <div className="flex items-center gap-2 text-sm text-orange-800/70">
                             <span>ผู้ใช้งาน: <span className="font-bold">{currentUser.name}</span></span>
                             <span className="text-orange-300">|</span>
                             <span className="flex items-center gap-1">
                                {isConfigured ? <Database size={14} className="text-orange-600"/> : <ServerOff size={14} className="text-red-500"/>}
                                {isConfigured ? 'ออนไลน์ (Firebase)' : 'ออฟไลน์ (Mock Data)'}
                             </span>
                        </div>
                    </div>
                </div>
            )}
            
            {viewMode === 'DASHBOARD' ? renderDashboard() : renderReport()}
        </div>
    );
};

export default AttendanceSystem;
