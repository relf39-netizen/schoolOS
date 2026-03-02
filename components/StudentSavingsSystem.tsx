
import React, { useState, useEffect, useMemo } from 'react';
import { 
    PiggyBank, Plus, Search, History, TrendingUp, 
    UserPlus, ArrowUpRight, ArrowDownRight, Trash2, 
    ChevronRight, Filter, GraduationCap, Calendar,
    Save, X, Edit2, CheckCircle2, AlertCircle, Settings,
    Download, Printer, FileSpreadsheet, ChevronDown, LayoutGrid
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Teacher, Student, StudentSaving, SavingTransactionType, ClassRoom, AcademicYear } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';

interface StudentSavingsSystemProps {
    currentUser: Teacher;
}

const StudentSavingsSystem: React.FC<StudentSavingsSystemProps> = ({ currentUser }) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [savings, setSavings] = useState<StudentSaving[]>([]);
    const [classRooms, setClassRooms] = useState<ClassRoom[]>([]);
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedClass, setSelectedClass] = useState<string>('All');
    const [currentAcademicYear, setCurrentAcademicYear] = useState<string>(new Date().getFullYear() + 543 + '');
    
    // Modals
    const [isTransactionOpen, setIsTransactionOpen] = useState(false);
    const [isDetailViewOpen, setIsDetailViewOpen] = useState(false);
    const [isEditTransactionOpen, setIsEditTransactionOpen] = useState(false);
    const [isPrintReportOpen, setIsPrintReportOpen] = useState(false);
    
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [transactionType, setTransactionType] = useState<SavingTransactionType>('DEPOSIT');
    const [amount, setAmount] = useState<string>('');
    
    const [editingTransaction, setEditingTransaction] = useState<StudentSaving | null>(null);
    const [editReason, setEditReason] = useState('');
    const [teachers, setTeachers] = useState<Record<string, string>>({});
    const [teacherProfiles, setTeacherProfiles] = useState<Teacher[]>([]);
    
    // Selection Mode
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Modals
    const [isManageTeachersOpen, setIsManageTeachersOpen] = useState(false);
    const [selectedTeacherForEdit, setSelectedTeacherForEdit] = useState<Teacher | null>(null);

    const isAdmin = currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DIRECTOR') || currentUser.roles.includes('VICE_DIRECTOR') || currentUser.roles.includes('ACTING_DIRECTOR');
    const isDirector = currentUser.roles.includes('DIRECTOR') || currentUser.roles.includes('VICE_DIRECTOR') || currentUser.roles.includes('ACTING_DIRECTOR');

    useEffect(() => {
        fetchData();
    }, [currentUser.schoolId]);

    const fetchData = async () => {
        if (!supabase) return;
        setIsLoading(true);
        try {
            // Fetch Academic Years
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

            // Fetch Classrooms
            const { data: classesData } = await supabase
                .from('class_rooms')
                .select('*')
                .eq('school_id', currentUser.schoolId);
            
            if (classesData) {
                setClassRooms(classesData.map(c => ({
                    id: c.id,
                    schoolId: c.school_id,
                    name: c.name,
                    academicYear: c.academic_year
                })));
            }

            // Fetch Students
            const { data: studentsData, error: studentError } = await supabase
                .from('students')
                .select('*')
                .eq('school_id', currentUser.schoolId)
                .eq('is_active', true);

            if (studentError) throw studentError;

            // Fetch Savings
            const { data: savingsData, error: savingsError } = await supabase
                .from('student_savings')
                .select('*')
                .eq('school_id', currentUser.schoolId);

            if (savingsError) throw savingsError;

            // Fetch Teachers to map names and for management
            const { data: teachersData } = await supabase
                .from('profiles')
                .select('id, name, roles, assigned_classes, position')
                .eq('school_id', currentUser.schoolId);
            
            if (teachersData) {
                const teacherMap: Record<string, string> = {};
                const profiles: Teacher[] = [];
                teachersData.forEach(t => {
                    teacherMap[t.id] = t.name;
                    profiles.push({
                        id: t.id,
                        name: t.name,
                        schoolId: currentUser.schoolId,
                        roles: t.roles || [],
                        assignedClasses: t.assigned_classes || [],
                        position: t.position || 'ครู'
                    });
                });
                setTeachers(teacherMap);
                setTeacherProfiles(profiles);
            }

            const mappedStudents: Student[] = (studentsData || []).map(s => {
                const studentSavings = (savingsData || []).filter(sv => sv.student_id === s.id);
                const total = studentSavings.reduce((acc, curr) => {
                    return curr.type === 'DEPOSIT' ? acc + curr.amount : acc - curr.amount;
                }, 0);

                return {
                    id: s.id,
                    schoolId: s.school_id,
                    name: s.name,
                    currentClass: s.current_class,
                    academicYear: s.academic_year,
                    isActive: s.is_active,
                    totalSavings: total
                };
            });

            setStudents(mappedStudents);
            setSavings((savingsData || []).map(s => ({
                id: s.id,
                studentId: s.student_id,
                schoolId: s.school_id,
                amount: s.amount,
                type: s.type as SavingTransactionType,
                academicYear: s.academic_year,
                createdAt: s.created_at,
                createdBy: s.created_by,
                editedAt: s.edited_at,
                editedBy: s.edited_by,
                editReason: s.edit_reason
            })));
        } catch (error) {
            console.error('Error fetching savings data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSelectStudent = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };
    const printIndividualReport = (student: Student) => {
        const studentTransactions = savings
            .filter(s => s.studentId === student.id)
            .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
        
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const formatThaiDate = (dateStr: string) => {
            const date = new Date(dateStr);
            const months = [
                'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
            ];
            return `วันที่ ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
        };

        const html = `
            <html>
                <head>
                    <title>รายงานการออมทรัพย์ - ${student.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                        body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #333; }
                        .header { text-align: center; margin-bottom: 30px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #000; padding: 10px; text-align: left; font-size: 14px; }
                        th { background-color: #f2f2f2; }
                        .total { margin-top: 20px; text-align: right; font-size: 1.2em; font-weight: bold; }
                        .edit-note { font-size: 11px; color: #666; font-style: italic; margin-top: 4px; display: block; }
                        .signature-section { margin-top: 50px; display: flex; justify-content: flex-end; }
                        .signature-box { text-align: center; width: 250px; }
                        .sig-line { border-bottom: 1px solid #000; margin-bottom: 10px; height: 40px; }
                        @media print { .no-print { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2 style="margin: 0;">รายงานสรุปการออมทรัพย์รายบุคคล</h2>
                        <p style="margin: 5px 0;">นักเรียน: ${student.name} | ชั้น: ${student.currentClass}</p>
                        <p style="margin: 5px 0;">ปีการศึกษา: ${currentAcademicYear}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 25%;">วันที่</th>
                                <th style="width: 15%;">ประเภท</th>
                                <th style="width: 20%;">จำนวนเงิน (บาท)</th>
                                <th style="width: 40%;">หมายเหตุ/ผู้บันทึก</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${studentTransactions.map(t => `
                                <tr>
                                    <td>${formatThaiDate(t.createdAt!)}</td>
                                    <td>${t.type === 'DEPOSIT' ? 'ฝาก' : 'ถอน'}</td>
                                    <td>${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td>
                                        <div>บันทึกโดย: ${teachers[t.createdBy!] || 'ไม่ระบุ'}</div>
                                        ${t.editReason ? `
                                            <div class="edit-note">
                                                * แก้ไขเมื่อ: ${formatThaiDate(t.editedAt!)} <br/>
                                                เหตุผล: ${t.editReason} <br/>
                                                โดย: ${teachers[t.editedBy!] || 'ไม่ระบุ'}
                                            </div>
                                        ` : ''}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="total">ยอดเงินออมคงเหลือ: ฿${student.totalSavings?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    
                    <div class="signature-section">
                        <div class="signature-box">
                            <p>(ลงชื่อ)............................................................</p>
                            <p>(${currentUser.name})</p>
                            <p>ครูประจำชั้น</p>
                        </div>
                    </div>

                    <div class="no-print" style="margin-top: 30px; text-align: center;">
                        <button onclick="window.print()" style="padding: 10px 20px; cursor: pointer;">พิมพ์รายงาน</button>
                    </div>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const printClassReport = () => {
        const classStudents = students.filter(s => s.currentClass === selectedClass || selectedClass === 'All');
        const classTotal = classStudents.reduce((acc, curr) => acc + (curr.totalSavings || 0), 0);
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
            <html>
                <head>
                    <title>รายงานสรุปชั้นเรียน - ${selectedClass === 'All' ? 'ทุกชั้นเรียน' : selectedClass}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap');
                        body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #333; }
                        .header { text-align: center; margin-bottom: 30px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #000; padding: 10px; text-align: left; font-size: 14px; }
                        th { background-color: #f2f2f2; }
                        .summary { margin-top: 30px; border-top: 2px solid #000; padding-top: 10px; text-align: right; }
                        .signature-section { margin-top: 50px; display: flex; justify-content: flex-end; }
                        .signature-box { text-align: center; width: 250px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h2 style="margin: 0;">รายงานสรุปการออมทรัพย์รายชั้นเรียน</h2>
                        <p style="margin: 5px 0;">ชั้นเรียน: ${selectedClass === 'All' ? 'ทุกชั้นเรียน' : selectedClass}</p>
                        <p style="margin: 5px 0;">ปีการศึกษา: ${currentAcademicYear}</p>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 10%;">ลำดับ</th>
                                <th style="width: 50%;">ชื่อ-นามสกุล</th>
                                <th style="width: 20%;">ชั้นเรียน</th>
                                <th style="width: 20%;">ยอดเงินออม (บาท)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${classStudents.map((s, i) => `
                                <tr>
                                    <td>${i + 1}</td>
                                    <td>${s.name}</td>
                                    <td>${s.currentClass}</td>
                                    <td>${s.totalSavings?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="summary">
                        <h3>ยอดรวมทั้งสิ้น: ฿${classTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
                        <p>จำนวนนักเรียน: ${classStudents.length} คน</p>
                    </div>

                    <div class="signature-section">
                        <div class="signature-box">
                            <p>(ลงชื่อ)............................................................</p>
                            <p>(${currentUser.name})</p>
                            <p>ครูประจำชั้น</p>
                        </div>
                    </div>
                    <script>window.onload = () => window.print();</script>
                </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
    };

    const formatThaiDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        const months = [
            'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];
        return `วันที่ ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
    };

    const handleAddTransaction = async () => {
        if (!selectedStudent || !amount || parseFloat(amount) <= 0 || !supabase) return;

        try {
            const { data, error } = await supabase
                .from('student_savings')
                .insert([{
                    student_id: selectedStudent.id,
                    school_id: currentUser.schoolId,
                    amount: parseFloat(amount),
                    type: transactionType,
                    academic_year: currentAcademicYear,
                    created_by: currentUser.id
                }])
                .select();

            if (error) throw error;

            if (data) {
                const newSaving: StudentSaving = {
                    id: data[0].id,
                    studentId: data[0].student_id,
                    schoolId: data[0].school_id,
                    amount: data[0].amount,
                    type: data[0].type as SavingTransactionType,
                    academicYear: data[0].academic_year,
                    createdAt: data[0].created_at,
                    createdBy: data[0].created_by
                };

                setSavings([...savings, newSaving]);
                
                // Update student total locally
                setStudents(prev => prev.map(s => {
                    if (s.id === selectedStudent.id) {
                        const change = transactionType === 'DEPOSIT' ? parseFloat(amount) : -parseFloat(amount);
                        return { ...s, totalSavings: (s.totalSavings || 0) + change };
                    }
                    return s;
                }));

                setIsTransactionOpen(false);
                setAmount('');
                setSelectedStudent(null);
            }
        } catch (error) {
            console.error('Error adding transaction:', error);
        }
    };

    const handleEditTransaction = async () => {
        if (!editingTransaction || !amount || parseFloat(amount) <= 0 || !editReason || !supabase) return;

        try {
            const { data, error } = await supabase
                .from('student_savings')
                .update({
                    amount: parseFloat(amount),
                    edit_reason: editReason,
                    edited_at: new Date().toISOString(),
                    edited_by: currentUser.id
                })
                .eq('id', editingTransaction.id)
                .select();

            if (error) throw error;

            if (data) {
                // Update local state
                setSavings(prev => prev.map(s => s.id === editingTransaction.id ? {
                    ...s,
                    amount: data[0].amount,
                    editReason: data[0].edit_reason,
                    editedAt: data[0].edited_at,
                    editedBy: data[0].edited_by
                } : s));

                // Recalculate student totals
                fetchData(); 

                setIsEditTransactionOpen(false);
                setEditingTransaction(null);
                setAmount('');
                setEditReason('');
            }
        } catch (error) {
            console.error('Error editing transaction:', error);
            alert('เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
        }
    };

    const handleUpdateTeacherClasses = async (teacherId: string, assignedClasses: string[]) => {
        if (!supabase) return;
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ assigned_classes: assignedClasses })
                .eq('id', teacherId);
            
            if (error) throw error;
            
            setTeacherProfiles(prev => prev.map(t => t.id === teacherId ? { ...t, assignedClasses } : t));
            alert('บันทึกการมอบหมายห้องเรียนเรียบร้อยแล้ว');
        } catch (error) {
            console.error('Error updating teacher classes:', error);
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        }
    };

    const selectAllFiltered = () => {
        const allIds = filteredStudents.map(s => s.id);
        setSelectedIds(new Set(allIds));
    };

    const totalSchoolSavings = useMemo(() => {
        return students.reduce((acc, curr) => acc + (curr.totalSavings || 0), 0);
    }, [students]);

    const classes = useMemo(() => {
        const uniqueClasses = Array.from(new Set(students.map(s => s.currentClass)));
        if (isDirector) return ['All', ...uniqueClasses.sort()];
        
        // For teachers, only show classes they are assigned to
        const assigned = currentUser.assignedClasses || [];
        return assigned.length > 0 ? assigned.sort() : ['None'];
    }, [students, isDirector, currentUser.assignedClasses]);

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase());
            
            if (isDirector) {
                const matchesClass = selectedClass === 'All' || s.currentClass === selectedClass;
                return matchesSearch && matchesClass;
            } else {
                // Teacher visibility
                const assigned = currentUser.assignedClasses || [];
                const isAssignedClass = assigned.includes(s.currentClass);
                const matchesClass = selectedClass === 'All' || s.currentClass === selectedClass;
                return matchesSearch && isAssignedClass && matchesClass;
            }
        });
    }, [students, searchTerm, selectedClass, isDirector, currentUser.assignedClasses]);

    const totalSavingsToDisplay = useMemo(() => {
        if (isDirector) {
            // Director sees total for school or selected class
            if (selectedClass === 'All') return totalSchoolSavings;
            return filteredStudents.reduce((acc, curr) => acc + (curr.totalSavings || 0), 0);
        } else {
            // Teacher sees total for their assigned classes
            return filteredStudents.reduce((acc, curr) => acc + (curr.totalSavings || 0), 0);
        }
    }, [isDirector, selectedClass, totalSchoolSavings, filteredStudents]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <TrendingUp className="animate-bounce text-pink-500" size={48} />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20">
            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-pink-500 to-rose-600 p-6 rounded-3xl text-white shadow-lg shadow-pink-200">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-pink-100 text-sm font-bold uppercase tracking-wider">
                                {isDirector ? (selectedClass === 'All' ? 'ยอดออมทรัพย์รวมทั้งโรงเรียน' : `ยอดออมทรัพย์ชั้น ${selectedClass}`) : 'ยอดออมทรัพย์ห้องเรียนที่รับผิดชอบ'}
                            </p>
                            <h2 className="text-3xl font-black mt-1">฿{totalSavingsToDisplay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
                        </div>
                        <div className="bg-white/20 p-3 rounded-2xl">
                            <PiggyBank size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">
                                {isDirector ? (selectedClass === 'All' ? 'จำนวนนักเรียนทั้งหมด' : `นักเรียนชั้น ${selectedClass}`) : 'จำนวนนักเรียนในความดูแล'}
                            </p>
                            <h2 className="text-3xl font-black text-slate-800 mt-1">{filteredStudents.length} คน</h2>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-2xl text-blue-600">
                            <GraduationCap size={24} />
                        </div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-slate-400 text-sm font-bold uppercase tracking-wider">ปีการศึกษาปัจจุบัน</p>
                            <div className="flex items-center gap-2 mt-1">
                                <h2 className="text-3xl font-black text-slate-800">{currentAcademicYear}</h2>
                            </div>
                        </div>
                        <div className="bg-purple-50 p-3 rounded-2xl text-purple-600">
                            <Calendar size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto items-center">
                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="ค้นหาชื่อนักเรียน..."
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-pink-500 transition-all font-bold text-slate-700"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100 w-full md:w-auto">
                        <Filter size={16} className="text-slate-400" />
                        <select 
                            className="bg-transparent border-none focus:ring-0 font-bold text-slate-600 text-sm w-full"
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                        >
                            {isDirector && <option value="All">ทุกชั้นเรียน</option>}
                            {classes.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                    <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                        {isAdmin && (
                            <button 
                                onClick={() => {
                                    setIsSelectionMode(!isSelectionMode);
                                    if (isSelectionMode) setSelectedIds(new Set());
                                }}
                                className={`p-3 rounded-2xl transition-all flex items-center gap-2 font-bold ${isSelectionMode ? 'bg-pink-600 text-white shadow-lg shadow-pink-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                                title="เลือกหลายรายการ"
                            >
                                <CheckCircle2 size={20} />
                                <span className="hidden md:inline">{isSelectionMode ? 'ยกเลิกการเลือก' : 'เลือกหลายคน'}</span>
                            </button>
                        )}
                        {isSelectionMode && (
                            <button 
                                onClick={selectAllFiltered}
                                className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all font-bold flex items-center gap-2"
                                title="เลือกทั้งหมดที่แสดงอยู่"
                            >
                                <LayoutGrid size={20} />
                                <span className="hidden md:inline">เลือกทั้งหมด</span>
                            </button>
                        )}
                        <button 
                            onClick={printClassReport}
                            className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-3 rounded-2xl font-bold transition-all"
                            title="พิมพ์รายงานสรุปชั้นเรียน"
                        >
                            <Printer size={20} />
                            <span className="hidden md:inline">พิมพ์รายงาน</span>
                        </button>
                    </div>
            </div>

            {/* Student List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                    {filteredStudents.map((student) => (
                        <motion.div 
                            layout
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            key={student.id}
                            className={`p-6 rounded-[2.5rem] shadow-sm border transition-all group relative overflow-hidden ${isSelectionMode && selectedIds.has(student.id) ? 'bg-pink-50 border-pink-500 ring-2 ring-pink-200' : 'bg-white border-slate-100 hover:shadow-xl hover:bg-gradient-to-br hover:from-white hover:to-slate-50'}`}
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700"></div>
                            {isSelectionMode && (
                                <div 
                                    className="absolute top-4 right-4 z-10"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectStudent(student.id);
                                    }}
                                >
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.has(student.id) ? 'bg-pink-600 border-pink-600 text-white' : 'bg-white border-slate-300'}`}>
                                        {selectedIds.has(student.id) && <CheckCircle2 size={14} />}
                                    </div>
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-pink-50 text-pink-600 flex items-center justify-center font-black text-xl">
                                        {student.name[0]}
                                    </div>
                                    <div 
                                        className="cursor-pointer"
                                        onClick={() => {
                                            setSelectedStudent(student);
                                            setIsDetailViewOpen(true);
                                        }}
                                    >
                                        <h3 className="font-black text-slate-800 group-hover:text-pink-600 transition-colors">{student.name}</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{student.currentClass}</p>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => printIndividualReport(student)}
                                            className="p-2 text-slate-300 hover:text-slate-600 transition-colors"
                                            title="พิมพ์รายงานรายบุคคล"
                                        >
                                            <Printer size={16} />
                                        </button>
                                    </div>
                                    <div className="text-right mt-1">
                                        <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">ยอดออมสะสม</p>
                                        <p className="text-xl font-black text-slate-800">฿{student.totalSavings?.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => {
                                        setSelectedStudent(student);
                                        setTransactionType('DEPOSIT');
                                        setIsTransactionOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 py-3 rounded-2xl font-bold text-sm transition-all"
                                >
                                    <ArrowUpRight size={16} />
                                    ฝากเงิน
                                </button>
                                <button 
                                    onClick={() => {
                                        setSelectedStudent(student);
                                        setTransactionType('WITHDRAWAL');
                                        setIsTransactionOpen(true);
                                    }}
                                    className="flex items-center justify-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 py-3 rounded-2xl font-bold text-sm transition-all"
                                >
                                    <ArrowDownRight size={16} />
                                    ถอนเงิน
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Student List */}
            {/* Transaction Modal */}
            {isTransactionOpen && selectedStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        <div className={`p-8 ${transactionType === 'DEPOSIT' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-2xl ${transactionType === 'DEPOSIT' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                                        {transactionType === 'DEPOSIT' ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                                    </div>
                                    <h2 className={`text-2xl font-black ${transactionType === 'DEPOSIT' ? 'text-emerald-800' : 'text-rose-800'}`}>
                                        {transactionType === 'DEPOSIT' ? 'ฝากเงินออม' : 'ถอนเงินออม'}
                                    </h2>
                                </div>
                                <button onClick={() => setIsTransactionOpen(false)} className="p-2 hover:bg-white/50 rounded-xl transition-colors">
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>
                            
                            <div className="bg-white/60 backdrop-blur-md p-4 rounded-2xl border border-white">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">นักเรียน</p>
                                <p className="text-lg font-black text-slate-800">{selectedStudent.name}</p>
                                <p className="text-sm font-bold text-slate-500">{selectedStudent.currentClass}</p>
                            </div>
                        </div>
                        
                        <div className="p-8 space-y-6">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">จำนวนเงิน (บาท)</label>
                                <div className="relative">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-2xl text-slate-300">฿</span>
                                    <input 
                                        type="number" 
                                        className="w-full pl-12 pr-5 py-5 bg-slate-50 border-none rounded-2xl font-black text-3xl text-slate-800 focus:ring-2 focus:ring-pink-500"
                                        placeholder="0.00"
                                        autoFocus
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                    />
                                </div>
                                {transactionType === 'WITHDRAWAL' && (selectedStudent.totalSavings || 0) < parseFloat(amount || '0') && (
                                    <p className="text-rose-500 text-xs font-bold mt-2 flex items-center gap-1">
                                        <AlertCircle size={14} /> ยอดเงินไม่เพียงพอ (คงเหลือ ฿{selectedStudent.totalSavings})
                                    </p>
                                )}
                            </div>
                            
                            <button 
                                onClick={handleAddTransaction}
                                disabled={transactionType === 'WITHDRAWAL' && (selectedStudent.totalSavings || 0) < parseFloat(amount || '0')}
                                className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-lg disabled:opacity-50 disabled:shadow-none ${
                                    transactionType === 'DEPOSIT' 
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200' 
                                    : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                                }`}
                            >
                                ยืนยันรายการ
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Detail View Modal */}
            {isDetailViewOpen && selectedStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        <div className="p-8 bg-pink-50 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-3xl bg-white text-pink-600 flex items-center justify-center font-black text-2xl shadow-sm">
                                    {selectedStudent.name[0]}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800">{selectedStudent.name}</h2>
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedStudent.currentClass} | ปีการศึกษา {currentAcademicYear}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => printIndividualReport(selectedStudent)}
                                    className="p-3 bg-white hover:bg-slate-50 text-slate-600 rounded-2xl transition-all shadow-sm"
                                    title="พิมพ์รายงาน"
                                >
                                    <Printer size={20} />
                                </button>
                                <button onClick={() => setIsDetailViewOpen(false)} className="p-3 bg-white hover:bg-slate-50 text-slate-400 rounded-2xl transition-all shadow-sm">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        <div className="p-8 flex-1 overflow-y-auto">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    <History size={20} className="text-pink-500" />
                                    ประวัติการทำรายการ
                                </h3>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ยอดเงินออมคงเหลือ</p>
                                    <p className="text-2xl font-black text-pink-600">฿{selectedStudent.totalSavings?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {savings
                                    .filter(s => s.studentId === selectedStudent.id)
                                    .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
                                    .map((t) => (
                                        <div key={t.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 group">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-xl ${t.type === 'DEPOSIT' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                                        {t.type === 'DEPOSIT' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-slate-800">{t.type === 'DEPOSIT' ? 'ฝากเงิน' : 'ถอนเงิน'}</p>
                                                        <p className="text-xs font-bold text-slate-400">{formatThaiDate(t.createdAt!)}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <p className={`font-black text-lg ${t.type === 'DEPOSIT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {t.type === 'DEPOSIT' ? '+' : '-'}฿{t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </p>
                                                    <button 
                                                        onClick={() => {
                                                            setEditingTransaction(t);
                                                            setAmount(t.amount.toString());
                                                            setEditReason(t.editReason || '');
                                                            setIsEditTransactionOpen(true);
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-pink-600 transition-all"
                                                        title="แก้ไขรายการ"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap gap-x-4 gap-y-1">
                                                <p className="text-[10px] font-bold text-slate-400">
                                                    ผู้บันทึก: <span className="text-slate-600">{teachers[t.createdBy!] || 'ไม่ระบุ'}</span>
                                                </p>
                                                {t.editReason && (
                                                    <p className="text-[10px] font-bold text-rose-500">
                                                        * แก้ไขเมื่อ: {formatThaiDate(t.editedAt!)} (เหตุผล: {t.editReason}) โดย: {teachers[t.editedBy!] || 'ไม่ระบุ'}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Edit Transaction Modal */}
            {isEditTransactionOpen && editingTransaction && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        <div className="p-8 bg-slate-50">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-2xl bg-pink-500 text-white">
                                        <Edit2 size={24} />
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-800">แก้ไขรายการ</h2>
                                </div>
                                <button onClick={() => setIsEditTransactionOpen(false)} className="p-2 hover:bg-white/50 rounded-xl transition-colors">
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>
                            <p className="text-sm font-bold text-slate-500">
                                กำลังแก้ไขรายการ {editingTransaction.type === 'DEPOSIT' ? 'ฝาก' : 'ถอน'} ของ {selectedStudent?.name}
                            </p>
                        </div>

                        <div className="p-8 space-y-6">
                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">จำนวนเงินใหม่ (บาท)</label>
                                <div className="relative">
                                    <span className="absolute left-5 top-1/2 -translate-y-1/2 font-black text-2xl text-slate-300">฿</span>
                                    <input 
                                        type="number" 
                                        className="w-full pl-12 pr-5 py-4 bg-slate-50 border-none rounded-2xl font-black text-2xl text-slate-800 focus:ring-2 focus:ring-pink-500"
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">เหตุผลการแก้ไข</label>
                                <textarea 
                                    className="w-full p-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-pink-500 min-h-[100px]"
                                    placeholder="ระบุเหตุผลที่ต้องแก้ไขข้อมูล..."
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                />
                            </div>

                            <button 
                                onClick={handleEditTransaction}
                                disabled={!amount || !editReason}
                                className="w-full py-5 bg-pink-600 hover:bg-pink-700 text-white rounded-2xl font-black text-lg transition-all shadow-lg shadow-pink-200 disabled:opacity-50 disabled:shadow-none"
                            >
                                ยืนยันการแก้ไข
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default StudentSavingsSystem;
