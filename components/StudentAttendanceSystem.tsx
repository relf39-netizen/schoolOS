
import React, { useState, useEffect, useMemo } from 'react';
import { 
    Calendar, CheckCircle2, XCircle, Clock, AlertCircle, 
    Users, Search, Filter, TrendingUp, Download, 
    Printer, ChevronRight, GraduationCap, Save, 
    ArrowLeft, LayoutDashboard, History, UserCheck
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Teacher, Student, StudentAttendance, StudentAttendanceStatus, ClassRoom, AcademicYear } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

const THAI_MONTHS = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const formatToISODate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatToThaiDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const d = date.getDate();
    const m = THAI_MONTHS[date.getMonth()];
    const y = date.getFullYear() + 543;
    return `${d} ${m} ${y}`;
};

interface StudentAttendanceSystemProps {
    currentUser: Teacher;
}

const StudentAttendanceSystem: React.FC<StudentAttendanceSystemProps> = ({ currentUser }) => {
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'RECORD' | 'HISTORY' | 'ALUMNI'>('DASHBOARD');
    const [students, setStudents] = useState<Student[]>([]);
    const [attendance, setAttendance] = useState<StudentAttendance[]>([]);
    const [classRooms, setClassRooms] = useState<ClassRoom[]>([]);
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedDate, setSelectedDate] = useState<string>(formatToISODate(new Date()));
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [currentAcademicYear, setCurrentAcademicYear] = useState<string>('');
    
    // Attendance Recording State
    const [tempAttendance, setTempAttendance] = useState<Record<string, StudentAttendanceStatus>>({});
    
    // Statistics State
    const [statsDate, setStatsDate] = useState<string>(formatToISODate(new Date()));
    const [individualStudent, setIndividualStudent] = useState<Student | null>(null);

    // Alumni State
    const [graduationYear, setGraduationYear] = useState<string>((new Date().getFullYear() + 543).toString());
    const [batchNumber, setBatchNumber] = useState<string>('');

    const isAdmin = currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DIRECTOR') || currentUser.roles.includes('VICE_DIRECTOR');
    const isDirector = currentUser.roles.includes('DIRECTOR') || currentUser.roles.includes('VICE_DIRECTOR');

    const filteredClassRooms = useMemo(() => {
        if (isAdmin) return classRooms;
        if (!currentUser.assignedClasses || currentUser.assignedClasses.length === 0) return [];
        return classRooms.filter(c => currentUser.assignedClasses?.includes(c.name));
    }, [classRooms, isAdmin, currentUser.assignedClasses]);

    useEffect(() => {
        fetchInitialData();
    }, [currentUser.schoolId]);

    useEffect(() => {
        if (filteredClassRooms.length > 0 && !selectedClass) {
            setSelectedClass(filteredClassRooms[0].name);
        }
    }, [filteredClassRooms]);

    const fetchInitialData = async () => {
        if (!supabase) return;
        setIsLoading(true);
        try {
            // 1. Fetch Academic Years
            const { data: yearsData } = await supabase
                .from('academic_years')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .order('year', { ascending: false });
            
            if (yearsData) {
                const mappedYears = yearsData.map(y => ({
                    id: y.id,
                    schoolId: y.school_id,
                    year: y.year,
                    isCurrent: y.is_current
                }));
                setAcademicYears(mappedYears);
                const current = mappedYears.find(y => y.isCurrent);
                if (current) setCurrentAcademicYear(current.year);
            }

            // 2. Fetch Classrooms
            const { data: classesData } = await supabase
                .from('class_rooms')
                .select('*')
                .eq('school_id', currentUser.schoolId);
            
            if (classesData) {
                const mappedClasses = classesData.map(c => ({
                    id: c.id,
                    schoolId: c.school_id,
                    name: c.name,
                    academicYear: c.academic_year
                }));
                setClassRooms(mappedClasses);
                
                // Auto-select class if teacher has assigned classes
                if (currentUser.assignedClasses && currentUser.assignedClasses.length > 0) {
                    setSelectedClass(currentUser.assignedClasses[0]);
                } else if (mappedClasses.length > 0) {
                    setSelectedClass(mappedClasses[0].name);
                }
            }

            // 3. Fetch Students
            const { data: studentsData } = await supabase
                .from('students')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .eq('is_active', true)
                .eq('is_alumni', false);
            
            if (studentsData) {
                setStudents(studentsData.map(s => ({
                    id: s.id,
                    schoolId: s.school_id,
                    name: s.name,
                    currentClass: s.current_class,
                    academicYear: s.academic_year,
                    isActive: s.is_active,
                    isAlumni: s.is_alumni,
                    graduationYear: s.graduation_year,
                    batchNumber: s.batch_number
                })));
            }

            // 4. Fetch Today's Attendance
            fetchAttendance(formatToISODate(new Date()));

        } catch (error) {
            console.error('Error fetching initial attendance data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAttendance = async (date: string) => {
        if (!supabase) return;
        try {
            const { data, error } = await supabase
                .from('student_attendance')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .eq('date', date);
            
            if (error) throw error;
            if (data) {
                setAttendance(data.map(a => ({
                    id: a.id,
                    schoolId: a.school_id,
                    studentId: a.student_id,
                    date: a.date,
                    status: a.status as StudentAttendanceStatus,
                    academicYear: a.academic_year,
                    createdBy: a.created_by,
                    createdAt: a.created_at
                })));
            }
        } catch (error) {
            console.error('Error fetching attendance:', error);
        }
    };

    const handleDateChange = (date: string) => {
        setSelectedDate(date);
        fetchAttendance(date);
    };

    const initRecordMode = () => {
        // Initialize temp attendance with existing data or default 'Present'
        const initial: Record<string, StudentAttendanceStatus> = {};
        const classStudents = students.filter(s => s.currentClass === selectedClass);
        
        classStudents.forEach(s => {
            const existing = attendance.find(a => a.studentId === s.id && a.date === selectedDate);
            initial[s.id] = existing ? existing.status : 'Present';
        });
        
        setTempAttendance(initial);
        setViewMode('RECORD');
    };

    const saveAttendance = async () => {
        if (!supabase) return;
        setIsSaving(true);
        try {
            const records = Object.entries(tempAttendance).map(([studentId, status]) => ({
                school_id: currentUser.schoolId,
                student_id: studentId,
                date: selectedDate,
                status: status,
                academic_year: currentAcademicYear,
                created_by: currentUser.id
            }));

            // Use upsert to handle updates
            const { error } = await supabase
                .from('student_attendance')
                .upsert(records, { onConflict: 'student_id, date' });

            if (error) throw error;
            
            alert('บันทึกข้อมูลการมาเรียนเรียบร้อยแล้ว');
            await fetchAttendance(selectedDate);
            setViewMode('DASHBOARD');
        } catch (error) {
            console.error('Error saving attendance:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        } finally {
            setIsSaving(false);
        }
    };

    const handleGraduate = async () => {
        if (!selectedClass || !graduationYear || !supabase) return;
        if (!confirm(`ยืนยันการบันทึกนักเรียนชั้น ${selectedClass} เป็นศิษย์เก่ารุ่นที่ ${batchNumber || '-'} ปีที่จบ ${graduationYear}?`)) return;
        
        setIsSaving(true);
        try {
            const classStudents = students.filter(s => s.currentClass === selectedClass);
            const studentIds = classStudents.map(s => s.id);

            const { error } = await supabase
                .from('students')
                .update({
                    is_active: false,
                    is_alumni: true,
                    graduation_year: graduationYear,
                    batch_number: batchNumber
                })
                .in('id', studentIds);

            if (error) throw error;
            
            alert('บันทึกข้อมูลศิษย์เก่าเรียบร้อยแล้ว');
            await fetchInitialData();
            setViewMode('DASHBOARD');
        } catch (error) {
            console.error('Error graduating students:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลศิษย์เก่า');
        } finally {
            setIsSaving(false);
        }
    };

    const dailyStats = useMemo(() => {
        const classStudents = students.filter(s => s.currentClass === selectedClass);
        const classAttendance = attendance.filter(a => a.date === selectedDate && classStudents.some(s => s.id === a.studentId));
        
        const stats = {
            present: classAttendance.filter(a => a.status === 'Present').length,
            late: classAttendance.filter(a => a.status === 'Late').length,
            sick: classAttendance.filter(a => a.status === 'Sick').length,
            absent: classAttendance.filter(a => a.status === 'Absent').length,
            total: classStudents.length,
            recorded: classAttendance.length
        };
        
        return stats;
    }, [students, attendance, selectedClass, selectedDate]);

    const studentHistory = useMemo(() => {
        if (!individualStudent) return [];
        // This would ideally fetch from DB for all dates, but for now we use what's loaded
        // In a real app, we'd fetch specific history for the student
        return attendance.filter(a => a.studentId === individualStudent.id).sort((a,b) => b.date.localeCompare(a.date));
    }, [individualStudent, attendance]);

    const getStatusColor = (status: StudentAttendanceStatus) => {
        switch(status) {
            case 'Present': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Late': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Sick': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'Absent': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const getStatusIcon = (status: StudentAttendanceStatus) => {
        switch(status) {
            case 'Present': return <CheckCircle2 size={16} />;
            case 'Late': return <Clock size={16} />;
            case 'Sick': return <AlertCircle size={16} />;
            case 'Absent': return <XCircle size={16} />;
        }
    };

    const getStatusLabel = (status: StudentAttendanceStatus) => {
        switch(status) {
            case 'Present': return 'มาเรียน';
            case 'Late': return 'สาย';
            case 'Sick': return 'ลาป่วย/ธุระ';
            case 'Absent': return 'ขาดเรียน';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <TrendingUp className="animate-bounce text-indigo-500" size={48} />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 font-sarabun">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-2xl shadow-lg shadow-indigo-100">
                        <UserCheck size={32} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">ระบบบันทึกการมาเรียน</h2>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Student Attendance Management System</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                    <Calendar className="text-indigo-500 ml-2" size={20} />
                    <input 
                        type="date" 
                        className="bg-transparent border-none focus:ring-0 font-black text-slate-700"
                        value={selectedDate}
                        onChange={(e) => handleDateChange(e.target.value)}
                    />
                </div>
            </div>

            {viewMode === 'DASHBOARD' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl text-white shadow-lg shadow-emerald-100">
                            <p className="text-emerald-100 text-xs font-black uppercase tracking-widest">มาเรียน</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.present} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-3xl text-white shadow-lg shadow-amber-100">
                            <p className="text-amber-100 text-xs font-black uppercase tracking-widest">สาย</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.late} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-3xl text-white shadow-lg shadow-blue-100">
                            <p className="text-blue-100 text-xs font-black uppercase tracking-widest">ลา</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.sick} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                        <div className="bg-gradient-to-br from-rose-500 to-pink-600 p-6 rounded-3xl text-white shadow-lg shadow-rose-100">
                            <p className="text-rose-100 text-xs font-black uppercase tracking-widest">ขาด</p>
                            <h3 className="text-3xl font-black mt-1">{dailyStats.absent} <span className="text-sm font-normal">คน</span></h3>
                        </div>
                    </div>

                    {/* Main Actions */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-black text-xl text-slate-800 flex items-center gap-2">
                                    <Users className="text-indigo-500" /> รายชื่อนักเรียนชั้น {selectedClass}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <select 
                                        className="bg-slate-50 border-none rounded-xl font-bold text-slate-600 text-sm"
                                        value={selectedClass}
                                        onChange={(e) => setSelectedClass(e.target.value)}
                                    >
                                        <option value="">-- เลือกชั้นเรียน --</option>
                                        {filteredClassRooms.map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={initRecordMode}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-black transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                                    >
                                        <Save size={18} /> บันทึกการมาเรียน
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {students.filter(s => s.currentClass === selectedClass).length === 0 ? (
                                    <div className="text-center py-12 text-slate-400 italic">ไม่พบรายชื่อนักเรียนในชั้นนี้</div>
                                ) : (
                                    students.filter(s => s.currentClass === selectedClass).map((student, idx) => {
                                        const record = attendance.find(a => a.studentId === student.id && a.date === selectedDate);
                                        return (
                                            <div key={student.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                                                <div className="flex items-center gap-4">
                                                    <span className="text-xs font-black text-slate-300 w-6">{idx + 1}</span>
                                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center font-black text-indigo-500 shadow-sm border border-slate-100">
                                                        {student.name[0]}
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-slate-700">{student.name}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {student.id.slice(0,8)}</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    {record ? (
                                                        <div className={`px-4 py-1 rounded-full text-[10px] font-black border flex items-center gap-1 ${getStatusColor(record.status)}`}>
                                                            {getStatusIcon(record.status)}
                                                            {getStatusLabel(record.status)}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-300 italic">ยังไม่ได้บันทึก</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* Quick Stats Card */}
                            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
                                <h3 className="font-black text-lg text-slate-800 mb-6 flex items-center gap-2">
                                    <TrendingUp className="text-indigo-500" /> สรุปภาพรวมวันนี้
                                </h3>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-500">นักเรียนทั้งหมด</span>
                                        <span className="font-black text-slate-800">{dailyStats.total} คน</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-bold text-slate-500">บันทึกแล้ว</span>
                                        <span className="font-black text-indigo-600">{dailyStats.recorded} / {dailyStats.total}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-indigo-500 h-full transition-all duration-500" 
                                            style={{ width: `${(dailyStats.recorded / dailyStats.total) * 100}%` }}
                                        ></div>
                                    </div>
                                    <div className="pt-4 border-t border-slate-50">
                                        <button 
                                            onClick={() => setViewMode('ALUMNI')}
                                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                        >
                                            <GraduationCap size={18} /> จัดการศิษย์เก่า
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Info Card */}
                            <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100">
                                <div className="flex items-center gap-3 mb-4">
                                    <AlertCircle className="text-indigo-500" />
                                    <h4 className="font-black text-indigo-900">คำแนะนำ</h4>
                                </div>
                                <p className="text-sm text-indigo-700 leading-relaxed font-medium">
                                    คุณครูประจำชั้นควรบันทึกข้อมูลการมาเรียนก่อนเวลา 08:30 น. เพื่อให้ระบบสรุปสถิติภาพรวมของโรงเรียนได้อย่างถูกต้อง
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'RECORD' && (
                <div className="space-y-6 animate-slide-up">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-8 border-b pb-6 border-slate-50">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setViewMode('DASHBOARD')} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-all">
                                    <ArrowLeft size={24} />
                                </button>
                                <div>
                                    <h3 className="font-black text-xl text-slate-800">บันทึกการมาเรียน: ชั้น {selectedClass}</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">วันที่ {formatToThaiDate(selectedDate)}</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setViewMode('DASHBOARD')}
                                    className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl font-black text-sm hover:bg-slate-200 transition-all"
                                >
                                    ยกเลิก
                                </button>
                                <button 
                                    onClick={saveAttendance}
                                    disabled={isSaving}
                                    className="px-8 py-2 bg-indigo-600 text-white rounded-xl font-black text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
                                >
                                    {isSaving ? <TrendingUp className="animate-spin" size={18} /> : <Save size={18} />}
                                    บันทึกทั้งหมด
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {students.filter(s => s.currentClass === selectedClass).map((student, idx) => (
                                <div key={student.id} className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 gap-4">
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-black text-slate-300 w-8">{idx + 1}</span>
                                        <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center font-black text-indigo-500 shadow-sm border border-slate-100 text-xl">
                                            {student.name[0]}
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-800 text-lg">{student.name}</p>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ID: {student.id.slice(0,8)}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(['Present', 'Late', 'Sick', 'Absent'] as StudentAttendanceStatus[]).map(status => (
                                            <button
                                                key={status}
                                                onClick={() => setTempAttendance(prev => ({ ...prev, [student.id]: status }))}
                                                className={`flex-1 md:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 ${
                                                    tempAttendance[student.id] === status 
                                                        ? getStatusColor(status).replace('bg-', 'bg-').replace('text-', 'text-') + ' border-current shadow-md'
                                                        : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'
                                                }`}
                                            >
                                                {getStatusIcon(status)}
                                                {getStatusLabel(status)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {viewMode === 'ALUMNI' && (
                <div className="space-y-6 animate-slide-up">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
                        <div className="flex justify-between items-center mb-8 border-b pb-6 border-slate-50">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setViewMode('DASHBOARD')} className="p-2 hover:bg-slate-50 rounded-full text-slate-400 transition-all">
                                    <ArrowLeft size={24} />
                                </button>
                                <div>
                                    <h3 className="font-black text-xl text-slate-800">จัดการข้อมูลศิษย์เก่า</h3>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">บันทึกนักเรียนที่จบการศึกษา</p>
                                </div>
                            </div>
                        </div>

                        <div className="max-w-2xl mx-auto space-y-8 py-8">
                            <div className="bg-indigo-50 p-8 rounded-[2.5rem] border border-indigo-100 text-center">
                                <div className="w-20 h-20 bg-white text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-4 border-indigo-200">
                                    <GraduationCap size={40} />
                                </div>
                                <h4 className="font-black text-xl text-indigo-900 mb-2">บันทึกจบการศึกษา</h4>
                                <p className="text-sm text-indigo-700 font-medium">เลือกชั้นเรียนที่ต้องการบันทึกเป็นศิษย์เก่า ระบบจะเปลี่ยนสถานะนักเรียนทุกคนในชั้นนี้เป็นศิษย์เก่าและหยุดการนับสถิติการมาเรียน</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">เลือกชั้นเรียน</label>
                                    <select 
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-700 outline-none focus:border-indigo-500 transition-all"
                                        value={selectedClass}
                                        onChange={(e) => setSelectedClass(e.target.value)}
                                    >
                                        <option value="">-- เลือกชั้นเรียน --</option>
                                        {filteredClassRooms.map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">ปีที่จบ (พ.ศ.)</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-700 outline-none focus:border-indigo-500 transition-all"
                                        value={graduationYear}
                                        onChange={(e) => setGraduationYear(e.target.value)}
                                        placeholder="เช่น 2567"
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">รุ่นที่จบ (ถ้ามี)</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-700 outline-none focus:border-indigo-500 transition-all"
                                        value={batchNumber}
                                        onChange={(e) => setBatchNumber(e.target.value)}
                                        placeholder="เช่น รุ่นที่ 50"
                                    />
                                </div>
                            </div>

                            <div className="pt-6">
                                <button 
                                    onClick={handleGraduate}
                                    disabled={!selectedClass || isSaving}
                                    className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-xl hover:bg-black transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {isSaving ? <TrendingUp className="animate-spin" size={24} /> : <CheckCircle2 size={24} />}
                                    ยืนยันบันทึกศิษย์เก่า
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentAttendanceSystem;
