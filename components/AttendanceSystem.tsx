import React, { useState, useEffect } from 'react';
import { SCHOOL_LOCATION, MOCK_ATTENDANCE_HISTORY, MOCK_TEACHERS } from '../constants';
import { AttendanceRecord, Teacher } from '../types';
import { MapPin, Navigation, CheckCircle, LogOut, History, Printer, ArrowLeft, Database, ServerOff, Loader } from 'lucide-react';
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

interface AttendanceSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
}

const AttendanceSystem: React.FC<AttendanceSystemProps> = ({ currentUser, allTeachers }) => {
    // State
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'REPORT'>('DASHBOARD');
    
    // GPS State
    const [currentPos, setCurrentPos] = useState<{lat: number, lng: number} | null>(null);
    const [distance, setDistance] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingGPS, setLoadingGPS] = useState(false);
    
    // Check-in state
    const [status, setStatus] = useState<'None' | 'CheckedIn' | 'CheckedOut'>('None');
    const [timeIn, setTimeIn] = useState<string | null>(null);
    const [timeOut, setTimeOut] = useState<string | null>(null);

    // Data State
    const [history, setHistory] = useState<AttendanceRecord[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]); // Default to today for Admin Report

    // Permissions
    const isAdminView = currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DIRECTOR') || currentUser.roles.includes('DOCUMENT_OFFICER');

    // --- Firebase Data Sync ---
    useEffect(() => {
        if (isConfigured && db) {
            // Real Mode: Listen to attendance collection
            // Note: For production, you might want to limit this query to recent records
            const q = query(collection(db, "attendance"), orderBy("date", "desc"), limit(100));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetched: AttendanceRecord[] = [];
                snapshot.forEach((doc) => {
                    fetched.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
                });
                setHistory(fetched);
                setIsLoadingData(false);
                
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

            }, (error) => {
                console.error("Error fetching attendance:", error);
                setHistory(MOCK_ATTENDANCE_HISTORY);
                setIsLoadingData(false);
            });
            return () => unsubscribe();
        } else {
            // Mock Mode
            setHistory(MOCK_ATTENDANCE_HISTORY);
            setIsLoadingData(false);
        }
    }, [currentUser.id]);


    // --- GPS Logic ---
    const refreshLocation = () => {
        setLoadingGPS(true);
        setError(null);
        
        if (!navigator.geolocation) {
            setError('Browser does not support geolocation');
            setLoadingGPS(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setCurrentPos({ lat, lng });
                
                const dist = calculateDistance(lat, lng, SCHOOL_LOCATION.lat, SCHOOL_LOCATION.lng);
                setDistance(dist);
                setLoadingGPS(false);
            },
            (err) => {
                setError('ไม่สามารถระบุตำแหน่งได้ กรุณาเปิด GPS');
                setLoadingGPS(false);
            }
        );
    };

    useEffect(() => {
        refreshLocation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAction = async (type: 'In' | 'Out') => {
        if (!distance || distance > SCHOOL_LOCATION.allowedRadiusMeters) {
            alert('คุณอยู่นอกพื้นที่โรงเรียน ไม่สามารถลงเวลาได้');
            return;
        }

        const now = new Date();
        const timeString = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const dateString = now.toISOString().split('T')[0];
        
        // --- OFFLINE/MOCK FALLBACK ---
        const performMockAction = () => {
            if (type === 'In') {
                setStatus('CheckedIn');
                setTimeIn(timeString);
                const newRecord: AttendanceRecord = {
                    id: `new_${Date.now()}`,
                    teacherId: currentUser.id,
                    teacherName: currentUser.name,
                    date: dateString,
                    checkInTime: timeString,
                    checkOutTime: null,
                    status: 'OnTime'
                };
                setHistory([newRecord, ...history]);
                alert(`บันทึกเวลามาปฏิบัติงานสำเร็จ (Offline): ${timeString}`);
            } else {
                setStatus('CheckedOut');
                setTimeOut(timeString);
                const updated = history.map(h => {
                    if (h.date === dateString && h.teacherId === currentUser.id) {
                        return { ...h, checkOutTime: timeString };
                    }
                    return h;
                });
                setHistory(updated);
                alert(`บันทึกเวลากลับสำเร็จ (Offline): ${timeString}`);
            }
        };

        // --- ONLINE FIREBASE ACTION ---
        if (isConfigured && db) {
            try {
                if (type === 'In') {
                    // Check duplicate check-in
                    if (status !== 'None') return;

                    const newRecord = {
                        teacherId: currentUser.id,
                        teacherName: currentUser.name,
                        date: dateString,
                        checkInTime: timeString,
                        checkOutTime: null,
                        status: 'OnTime', // Logic to check 'Late' could be added here comparing with 08:30
                        coordinate: currentPos
                    };
                    await addDoc(collection(db, "attendance"), newRecord);
                    alert(`บันทึกเวลามาปฏิบัติงานสำเร็จ: ${timeString}`);
                } else {
                    // Check-out: Update existing document
                    const q = query(
                        collection(db, "attendance"), 
                        where("teacherId", "==", currentUser.id),
                        where("date", "==", dateString)
                    );
                    const querySnapshot = await getDocs(q);
                    
                    if (!querySnapshot.empty) {
                        const docRef = doc(db, "attendance", querySnapshot.docs[0].id);
                        await updateDoc(docRef, {
                            checkOutTime: timeString
                        });
                        alert(`บันทึกเวลากลับสำเร็จ: ${timeString}`);
                    } else {
                        alert("ไม่พบข้อมูลการลงเวลามา (กรุณาติดต่อผู้ดูแลระบบ)");
                    }
                }
            } catch (e) {
                console.error("Firebase Error:", e);
                performMockAction();
            }
        } else {
            performMockAction();
        }
    };

    const isWithinRange = distance !== null && distance <= SCHOOL_LOCATION.allowedRadiusMeters;

    // --- Helpers ---
    const getDisplayCheckOut = (record: AttendanceRecord) => {
        if (record.checkOutTime) return record.checkOutTime;
        const today = new Date().toISOString().split('T')[0];
        if (record.date !== today) return <span className="text-slate-400 italic">17:00 (อัตโนมัติ)</span>;
        return <span className="text-slate-300">-</span>;
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
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 to-red-500"></div>
                
                <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
                    {/* Location Status */}
                    <div className="flex flex-col items-center flex-1">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 transition-colors duration-500 ${
                            loadingGPS ? 'bg-slate-100 text-slate-400 animate-pulse' :
                            error ? 'bg-red-100 text-red-500' :
                            isWithinRange ? 'bg-green-100 text-green-600 shadow-green-200 shadow-lg' :
                            'bg-orange-100 text-orange-500'
                        }`}>
                            {loadingGPS ? <Navigation className="animate-spin" size={24} /> : 
                             isWithinRange ? <MapPin size={32} /> : <MapPin size={32} />
                            }
                        </div>
                        <h3 className="font-bold text-slate-700">
                            {isWithinRange ? 'อยู่ในพื้นที่โรงเรียน' : 'อยู่นอกพื้นที่โรงเรียน'}
                        </h3>
                        <p className="text-xs text-slate-500">
                            {distance ? `ห่างจากจุดเช็คอิน ${distance.toFixed(0)} เมตร` : 'กำลังระบุตำแหน่ง...'}
                        </p>
                         <button onClick={refreshLocation} className="mt-2 text-xs text-blue-600 underline">อัปเดตตำแหน่ง</button>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 flex-1 w-full md:w-auto">
                        <button 
                            disabled={!isWithinRange || status !== 'None'}
                            onClick={() => handleAction('In')}
                            className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                status === 'CheckedIn' || status === 'CheckedOut' ? 'bg-slate-50 opacity-50' : 
                                isWithinRange ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-slate-50 text-slate-400'
                            }`}
                        >
                            <CheckCircle size={28} className="mb-1" />
                            <span className="font-bold">ลงเวลามา</span>
                            {timeIn && <span className="text-xs bg-white px-2 rounded border mt-1">{timeIn}</span>}
                        </button>
                        <button 
                            disabled={!isWithinRange || status !== 'CheckedIn'}
                            onClick={() => handleAction('Out')}
                            className={`flex-1 flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                status === 'CheckedOut' ? 'bg-slate-50 opacity-50' : 
                                (isWithinRange && status === 'CheckedIn') ? 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' : 'bg-slate-50 text-slate-400'
                            }`}
                        >
                            <LogOut size={28} className="mb-1" />
                            <span className="font-bold">ลงเวลากลับ</span>
                            {timeOut && <span className="text-xs bg-white px-2 rounded border mt-1">{timeOut}</span>}
                        </button>
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
                    {isAdminView ? 'ออกรายงานสรุปประจำวัน' : 'พิมพ์ประวัติการลงเวลา'}
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
                                        {record.date} 
                                        {isAdminView && <div className="text-xs text-slate-400">{record.teacherName}</div>}
                                    </td>
                                    <td className="px-6 py-3 text-green-700 font-mono">{record.checkInTime}</td>
                                    <td className="px-6 py-3 text-orange-700 font-mono">{getDisplayCheckOut(record)}</td>
                                    <td className="px-6 py-3 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                            record.status === 'OnTime' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {record.status === 'OnTime' ? 'ปกติ' : 'สาย'}
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
                                {isAdminView ? 'รายงานสรุปประจำวัน (สำหรับ ผอ.)' : 'ประวัติการปฏิบัติงาน (ส่วนตัว)'}
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
                     <p className="text-base">โรงเรียนตัวอย่างวิทยา อำเภอเมือง จังหวัดกรุงเทพมหานคร</p>
                     <p className="text-sm text-slate-600 mt-2">
                         {isAdminView 
                            ? `ประจำวันที่ ${new Date(reportDate).toLocaleDateString('th-TH', {dateStyle:'long'})}`
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
                                <th className="border border-black p-2 text-center w-20">เวลามา</th>
                                <th className="border border-black p-2 text-center w-24">ลายมือชื่อ</th>
                                <th className="border border-black p-2 text-center w-20">เวลากลับ</th>
                                <th className="border border-black p-2 text-center w-24">ลายมือชื่อ</th>
                                <th className="border border-black p-2 text-center w-24">หมายเหตุ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Filter history by selected date */}
                            {history.filter(h => h.date === reportDate).length > 0 ? (
                                history.filter(h => h.date === reportDate).map((record, index) => (
                                    <tr key={record.id}>
                                        <td className="border border-black p-2 text-center">{index + 1}</td>
                                        <td className="border border-black p-2">{record.teacherName}</td>
                                        <td className="border border-black p-2 text-center">{record.checkInTime}</td>
                                        <td className="border border-black p-2 text-center text-xs text-slate-400">...................</td>
                                        <td className="border border-black p-2 text-center">{record.checkOutTime || '-'}</td>
                                        <td className="border border-black p-2 text-center text-xs text-slate-400">...................</td>
                                        <td className="border border-black p-2 text-center text-xs">{record.status === 'Late' ? 'มาสาย' : ''}</td>
                                    </tr>
                                ))
                            ) : (
                                // If no records for date, show placeholder rows for manual signing
                                allTeachers.map((t, i) => (
                                    <tr key={t.id}>
                                        <td className="border border-black p-2 text-center">{i+1}</td>
                                        <td className="border border-black p-2">{t.name}</td>
                                        <td className="border border-black p-2"></td>
                                        <td className="border border-black p-2"></td>
                                        <td className="border border-black p-2"></td>
                                        <td className="border border-black p-2"></td>
                                        <td className="border border-black p-2"></td>
                                    </tr>
                                ))
                            )}
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
                                    <td className="border border-black p-2 text-center">{record.date}</td>
                                    <td className="border border-black p-2 text-center">{record.checkInTime}</td>
                                    <td className="border border-black p-2 text-center">{getDisplayCheckOut(record)}</td>
                                    <td className="border border-black p-2 text-center">{record.status === 'OnTime' ? 'ปกติ' : 'สาย'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {/* Footer Signature */}
                <div className="flex flex-col items-center justify-center mt-16 page-break-inside-avoid">
                    {isAdminView ? (
                        <>
                            <p className="mb-8">ขอรับรองว่าข้าราชการครูและบุคลากรทางการศึกษาได้มาปฏิบัติราชการจริง</p>
                            <div className="text-center relative">
                                <div className="border-b border-black w-64 mb-2 border-dotted"></div>
                                <p className="font-bold mb-1">( นายอำนวย การดี )</p>
                                <p>ผู้อำนวยการโรงเรียนตัวอย่างวิทยา</p>
                            </div>
                        </>
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