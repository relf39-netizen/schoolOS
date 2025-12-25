
import React, { useState, useEffect } from 'react';
import { AttendanceRecord, Teacher, School, LeaveRequest } from '../types';
import { MapPin, Navigation, CheckCircle, LogOut, History, Loader, RefreshCw, AlertTriangle, Clock, MapPinned, Printer, ArrowLeft, Users } from 'lucide-react';
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
            let queryBuilder = supabase!.from('attendance').select('*').order('date', { ascending: false }).order('check_in_time', { ascending: false });
            
            if (viewMode === 'MAIN') {
                if (!isAdminView) {
                    queryBuilder = queryBuilder.eq('teacher_id', currentUser.id);
                } else {
                    queryBuilder = queryBuilder.eq('school_id', currentUser.schoolId);
                }
            } else if (viewMode === 'PRINT_MONTHLY') {
                queryBuilder = queryBuilder.eq('teacher_id', selectedTeacherId)
                             .gte('date', `${reportMonth}-01`)
                             .lte('date', `${reportMonth}-31`);
            } else if (viewMode === 'PRINT_DAILY') {
                queryBuilder = queryBuilder.eq('school_id', currentUser.schoolId)
                             .eq('date', reportDate);
            }
            
            const { data, error } = await queryBuilder.limit(isAdminView ? 500 : 100);
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
                const { data: leaves } = await supabase!.from('leave_requests')
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
        if (!supabase) return;
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

            const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

            if (type === 'IN') {
                const status = timeStr > (currentSchool.lateTimeThreshold || '08:30') ? 'Late' : 'OnTime';
                const { error } = await supabase!.from('attendance').insert([{
                    school_id: currentUser.schoolId,
                    teacher_id: currentUser.id,
                    teacher_name: currentUser.name,
                    date: getTodayDateStr(),
                    check_in_time: timeStr,
                    status: status,
                    coordinate: { lat, lng }
                }]);
                if (error) throw error;
            } else {
                const { error } = await supabase!.from('attendance')
                    .update({ check_out_time: timeStr })
                    .eq('teacher_id', currentUser.id)
                    .eq('date', getTodayDateStr());
                if (error) throw error;
            }
            fetchData(); 
        } catch (e: any) {
            setErrorMsg(e.message || "เกิดข้อผิดพลาดในการลงเวลา");
            alert(e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoadingData) return <div className="p-20 text-center flex flex-col items-center gap-4"><Loader className="animate-spin text-blue-600" size={40}/><p className="font-bold text-slate-500">กำลังดึงข้อมูล...</p></div>;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
            {/* เนื้อหา UI คงเดิม */}
        </div>
    );
};

export default AttendanceSystem;
