
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
    const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
    const [isEditStudentOpen, setIsEditStudentOpen] = useState(false);
    const [isManageClassesOpen, setIsManageClassesOpen] = useState(false);
    const [isManageYearsOpen, setIsManageYearsOpen] = useState(false);
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

    // New Student Form
    const [newStudentName, setNewStudentName] = useState('');
    const [newStudentClass, setNewStudentClass] = useState('');

    // New Class Form
    const [newClassName, setNewClassName] = useState('');

    // New Year Form
    const [newYearName, setNewYearName] = useState('');

    // Promotion Form
    const [promoteFromClass, setPromoteFromClass] = useState('');
    const [promoteToClass, setPromoteToClass] = useState('');

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

    const handleAddStudent = async () => {
        if (!newStudentName || !newStudentClass || !supabase) return;

        try {
            const { data, error } = await supabase
                .from('students')
                .insert([{
                    school_id: currentUser.schoolId,
                    name: newStudentName,
                    current_class: newStudentClass,
                    academic_year: currentAcademicYear,
                    is_active: true
                }])
                .select();

            if (error) throw error;

            if (data) {
                const newStudent: Student = {
                    id: data[0].id,
                    schoolId: data[0].school_id,
                    name: data[0].name,
                    currentClass: data[0].current_class,
                    academicYear: data[0].academic_year,
                    isActive: data[0].is_active,
                    totalSavings: 0
                };
                setStudents([...students, newStudent]);
                setIsAddStudentOpen(false);
                setNewStudentName('');
                setNewStudentClass('');
            }
        } catch (error) {
            console.error('Error adding student:', error);
        }
    };

    const handleAddClass = async () => {
        if (!newClassName || !supabase) return;
        try {
            const { data, error } = await supabase
                .from('class_rooms')
                .insert([{
                    school_id: currentUser.schoolId,
                    name: newClassName,
                    academic_year: currentAcademicYear
                }])
                .select();
            if (error) throw error;
            if (data) {
                setClassRooms([...classRooms, {
                    id: data[0].id,
                    schoolId: data[0].school_id,
                    name: data[0].name,
                    academicYear: data[0].academic_year
                }]);
                setNewClassName('');
            }
        } catch (error) {
            console.error('Error adding class:', error);
        }
    };

    const handleDeleteClass = async (id: string) => {
        if (!confirm('ยืนยันลบห้องเรียนนี้?') || !supabase) return;
        try {
            const { error } = await supabase.from('class_rooms').delete().eq('id', id);
            if (error) throw error;
            setClassRooms(classRooms.filter(c => c.id !== id));
        } catch (error) {
            console.error('Error deleting class:', error);
        }
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !supabase) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws) as any[];

            const studentsToInsert = data.map(row => ({
                school_id: currentUser.schoolId,
                name: row.name || row['ชื่อ-นามสกุล'] || row['ชื่อ'],
                current_class: row.class || row['ชั้น'] || row['ห้อง'],
                academic_year: currentAcademicYear,
                is_active: true
            })).filter(s => s.name && s.current_class);

            if (studentsToInsert.length === 0) {
                alert('ไม่พบข้อมูลนักเรียนในไฟล์ หรือรูปแบบไม่ถูกต้อง (ต้องการคอลัมน์ name และ class)');
                return;
            }

            try {
                if (!supabase) return;
                const { data: insertedData, error } = await supabase
                    .from('students')
                    .insert(studentsToInsert)
                    .select();

                if (error) throw error;
                if (insertedData) {
                    fetchData(); // Reload all
                    alert(`นำเข้าข้อมูลนักเรียน ${insertedData.length} คนเรียบร้อยแล้ว`);
                }
            } catch (error) {
                console.error('Error importing students:', error);
                alert('เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
            }
        };
        reader.readAsBinaryString(file);
    };

    const downloadTemplate = () => {
        const templateData = [
            { 'ชื่อ-นามสกุล': 'เด็กชายตัวอย่าง ดีมาก', 'ชั้น': 'ป.1/1' },
            { 'ชื่อ-นามสกุล': 'เด็กหญิงใจดี เรียนเก่ง', 'ชั้น': 'ป.1/1' }
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Students");
        XLSX.writeFile(wb, "Student_Import_Template.xlsx");
    };

    const handleAddYear = async () => {
        if (!newYearName || !supabase) return;
        try {
            const { data, error } = await supabase
                .from('academic_years')
                .insert([{
                    school_id: currentUser.schoolId,
                    year: newYearName,
                    is_current: academicYears.length === 0
                }])
                .select();
            if (error) throw error;
            if (data) {
                fetchData();
                setNewYearName('');
            }
        } catch (error) {
            console.error('Error adding year:', error);
        }
    };

    const handleSetCurrentYear = async (id: string) => {
        if (!supabase) return;
        try {
            await supabase.from('academic_years').update({ is_current: false }).eq('school_id', currentUser.schoolId);
            await supabase.from('academic_years').update({ is_current: true }).eq('id', id);
            fetchData();
        } catch (error) {
            console.error('Error setting current year:', error);
        }
    };

    const handleDeleteYear = async (id: string) => {
        if (!confirm('ยืนยันลบปีการศึกษานี้?') || !supabase) return;
        try {
            const { error } = await supabase.from('academic_years').delete().eq('id', id);
            if (error) throw error;
            fetchData();
        } catch (error) {
            console.error('Error deleting year:', error);
        }
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

    const handleDeleteStudent = async (studentId: string) => {
        if (!confirm('ยืนยันลบข้อมูลนักเรียนและประวัติการออมทั้งหมด? การดำเนินการนี้ไม่สามารถย้อนกลับได้') || !supabase) return;

        try {
            // Delete savings first
            const { error: savingsError } = await supabase
                .from('student_savings')
                .delete()
                .eq('student_id', studentId);

            if (savingsError) throw savingsError;

            // Delete student
            const { error: studentError } = await supabase
                .from('students')
                .delete()
                .eq('id', studentId);

            if (studentError) throw studentError;

            // Update local state
            setStudents(prev => prev.filter(s => s.id !== studentId));
            setSavings(prev => prev.filter(s => s.studentId !== studentId));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(studentId);
                return next;
            });
            
            if (selectedStudent?.id === studentId) {
                setIsDetailViewOpen(false);
                setSelectedStudent(null);
            }

            alert('ลบข้อมูลนักเรียนเรียบร้อยแล้ว');
        } catch (error) {
            console.error('Error deleting student:', error);
            alert('เกิดข้อผิดพลาดในการลบข้อมูล');
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0 || !supabase) return;
        
        if (!confirm(`ยืนยันลบข้อมูลนักเรียนที่เลือกจำนวน ${selectedIds.size} คน และประวัติการออมทั้งหมด? การดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;

        try {
            const idsArray = Array.from(selectedIds);

            // Delete savings
            const { error: savingsError } = await supabase
                .from('student_savings')
                .delete()
                .in('student_id', idsArray);

            if (savingsError) throw savingsError;

            // Delete students
            const { error: studentError } = await supabase
                .from('students')
                .delete()
                .in('id', idsArray);

            if (studentError) throw studentError;

            // Update local state
            setStudents(prev => prev.filter(s => !selectedIds.has(s.id)));
            setSavings(prev => prev.filter(s => !selectedIds.has(s.studentId)));
            setSelectedIds(new Set());
            setIsSelectionMode(false);
            
            alert(`ลบข้อมูลนักเรียนจำนวน ${idsArray.length} คนเรียบร้อยแล้ว`);
        } catch (error) {
            console.error('Error deleting selected students:', error);
            alert('เกิดข้อผิดพลาดในการลบข้อมูล');
        }
    };

    const handleDeleteAllInClass = async () => {
        if (selectedClass === 'All') {
            alert('กรุณาเลือกชั้นเรียนที่ต้องการลบข้อมูลทั้งหมด');
            return;
        }

        if (!confirm(`ยืนยันลบข้อมูลนักเรียนทั้งหมดในชั้น ${selectedClass} และประวัติการออมทั้งหมด? การดำเนินการนี้ไม่สามารถย้อนกลับได้`) || !supabase) return;

        try {
            const classStudents = students.filter(s => s.currentClass === selectedClass);
            const studentIds = classStudents.map(s => s.id);

            if (studentIds.length === 0) {
                alert('ไม่พบนักเรียนในชั้นเรียนนี้');
                return;
            }

            // Delete savings
            const { error: savingsError } = await supabase
                .from('student_savings')
                .delete()
                .in('student_id', studentIds);

            if (savingsError) throw savingsError;

            // Delete students
            const { error: studentError } = await supabase
                .from('students')
                .delete()
                .in('id', studentIds);

            if (studentError) throw studentError;

            // Update local state
            setStudents(prev => prev.filter(s => !studentIds.includes(s.id)));
            setSavings(prev => prev.filter(s => !studentIds.includes(s.studentId)));
            
            alert(`ลบข้อมูลนักเรียนในชั้น ${selectedClass} จำนวน ${studentIds.length} คนเรียบร้อยแล้ว`);
        } catch (error) {
            console.error('Error deleting class students:', error);
            alert('เกิดข้อผิดพลาดในการลบข้อมูล');
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

    const handlePromoteStudents = async (fromClass: string, toClass: string) => {
        if (!confirm(`ต้องการเลื่อนชั้นนักเรียนจาก ${fromClass} ไปยัง ${toClass} ใช่หรือไม่?`) || !supabase) return;

        try {
            const studentsToPromote = students.filter(s => s.currentClass === fromClass);
            
            for (const student of studentsToPromote) {
                const { error } = await supabase
                    .from('students')
                    .update({ current_class: toClass })
                    .eq('id', student.id);
                
                if (error) throw error;
            }

            setStudents(prev => prev.map(s => s.currentClass === fromClass ? { ...s, currentClass: toClass } : s));
            alert('เลื่อนชั้นนักเรียนเรียบร้อยแล้ว');
        } catch (error) {
            console.error('Error promoting students:', error);
            alert('เกิดข้อผิดพลาดในการเลื่อนชั้น');
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

    const handleEditStudent = async () => {
        if (!selectedStudent || !newStudentName || !newStudentClass || !supabase) return;

        try {
            const { error } = await supabase
                .from('students')
                .update({
                    name: newStudentName,
                    current_class: newStudentClass
                })
                .eq('id', selectedStudent.id);

            if (error) throw error;

            setStudents(prev => prev.map(s => s.id === selectedStudent.id ? {
                ...s,
                name: newStudentName,
                currentClass: newStudentClass
            } : s));

            setIsEditStudentOpen(false);
            setSelectedStudent(null);
            setNewStudentName('');
            setNewStudentClass('');
            alert('แก้ไขข้อมูลนักเรียนเรียบร้อยแล้ว');
        } catch (error) {
            console.error('Error editing student:', error);
            alert('เกิดข้อผิดพลาดในการแก้ไขข้อมูล');
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
                                {isAdmin && (
                                    <button 
                                        onClick={() => setIsManageYearsOpen(true)}
                                        className="p-1 text-slate-400 hover:text-pink-600 transition-colors"
                                    >
                                        <Settings size={16} />
                                    </button>
                                )}
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
                    {isSelectionMode && selectedIds.size > 0 && (
                        <button 
                            onClick={handleDeleteSelected}
                            className="flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-rose-200"
                        >
                            <Trash2 size={20} />
                            <span>ลบที่เลือก ({selectedIds.size})</span>
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
                    {isAdmin && (
                        <button 
                            onClick={() => setIsManageTeachersOpen(true)}
                            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all"
                            title="มอบหมายครูประจำชั้น"
                        >
                            <Settings size={20} />
                        </button>
                    )}
                    {isAdmin && (
                        <button 
                            onClick={() => setIsManageClassesOpen(true)}
                            className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-all"
                            title="จัดการห้องเรียน"
                        >
                            <LayoutGrid size={20} />
                        </button>
                    )}
                    {isAdmin && selectedClass !== 'All' && (
                        <button 
                            onClick={handleDeleteAllInClass}
                            className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl transition-all"
                            title={`ลบนักเรียนทั้งหมดในชั้น ${selectedClass}`}
                        >
                            <Trash2 size={20} />
                        </button>
                    )}
                    {isAdmin && (
                        <button 
                            onClick={() => setIsAddStudentOpen(true)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-6 py-3 rounded-2xl font-black transition-all shadow-lg shadow-pink-200 whitespace-nowrap"
                        >
                            <UserPlus size={20} />
                            <span>เพิ่มนักเรียน</span>
                        </button>
                    )}
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
                            className={`bg-white p-6 rounded-[2.5rem] shadow-sm border transition-all group relative ${isSelectionMode && selectedIds.has(student.id) ? 'border-pink-500 ring-2 ring-pink-200' : 'border-slate-100 hover:shadow-xl'}`}
                        >
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
                                        {isAdmin && (
                                            <button 
                                                onClick={() => {
                                                    setSelectedStudent(student);
                                                    setNewStudentName(student.name);
                                                    setNewStudentClass(student.currentClass);
                                                    setIsEditStudentOpen(true);
                                                }}
                                                className="p-2 text-slate-300 hover:text-blue-500 transition-colors"
                                                title="แก้ไขข้อมูลนักเรียน"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        )}
                                        {isAdmin && (
                                            <button 
                                                onClick={() => handleDeleteStudent(student.id)}
                                                className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                                title="ลบข้อมูลนักเรียน"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
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

            {/* Promotion Section (Admin Only) */}
            {isAdmin && (
                <div className="mt-12 bg-slate-900 p-8 rounded-[3rem] text-white overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 blur-3xl rounded-full -mr-32 -mt-32"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-white/10 rounded-2xl">
                                <TrendingUp size={24} className="text-pink-400" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black">ระบบเลื่อนชั้นนักเรียน</h2>
                                <p className="text-slate-400 font-bold">จัดการย้ายชั้นเรียนเมื่อสิ้นปีการศึกษา</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/10">
                                <h3 className="font-bold mb-4 flex items-center gap-2">
                                    <AlertCircle size={18} className="text-amber-400" />
                                    คำแนะนำการเลื่อนชั้น
                                </h3>
                                <ul className="space-y-3 text-sm text-slate-300 font-medium">
                                    <li className="flex gap-2">
                                        <span className="text-pink-400">•</span>
                                        ยอดเงินออมจะถูกยกยอดไปพร้อมกับตัวนักเรียน
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-pink-400">•</span>
                                        กรุณาตรวจสอบความถูกต้องก่อนดำเนินการ
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="text-pink-400">•</span>
                                        นักเรียนที่จบการศึกษา (เช่น ป.6) สามารถตั้งค่าเป็น "จบการศึกษา"
                                    </li>
                                </ul>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">จากชั้นเรียน</label>
                                    <select 
                                        id="fromClass"
                                        className="bg-white/10 border-white/20 rounded-2xl py-3 px-4 text-white font-bold focus:ring-pink-500"
                                        value={promoteFromClass}
                                        onChange={(e) => setPromoteFromClass(e.target.value)}
                                    >
                                        <option value="" className="text-slate-800">เลือกชั้นเรียน</option>
                                        {classes.filter(c => c !== 'All').map(c => (
                                            <option key={c} value={c} className="text-slate-800">{c}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">ไปที่ชั้นเรียน</label>
                                    <input 
                                        id="toClass"
                                        type="text" 
                                        placeholder="เช่น ป.2/1 หรือ จบการศึกษา"
                                        className="bg-white/10 border-white/20 rounded-2xl py-3 px-4 text-white font-bold focus:ring-pink-500"
                                        value={promoteToClass}
                                        onChange={(e) => setPromoteToClass(e.target.value)}
                                    />
                                </div>
                                <button 
                                    onClick={() => {
                                        if (promoteFromClass && promoteToClass) handlePromoteStudents(promoteFromClass, promoteToClass);
                                    }}
                                    className="w-full bg-pink-600 hover:bg-pink-700 text-white py-4 rounded-2xl font-black transition-all shadow-xl shadow-pink-900/20 flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={20} />
                                    ยืนยันการเลื่อนชั้น
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Student Modal */}
            {isAddStudentOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-2xl font-black text-slate-800">เพิ่มนักเรียนใหม่</h2>
                                <button onClick={() => setIsAddStudentOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>
                            
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">นำเข้าจาก Excel</label>
                                        <label className="cursor-pointer bg-pink-50 text-pink-700 px-4 py-2 rounded-xl font-black text-[10px] hover:bg-pink-100 transition-all flex items-center gap-2">
                                            <FileSpreadsheet size={14} />
                                            เลือกไฟล์
                                            <input 
                                                type="file" 
                                                accept=".xlsx, .xls"
                                                onChange={handleImportExcel}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-300 flex flex-col items-center justify-center gap-2">
                                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">Template</label>
                                        <button 
                                            onClick={downloadTemplate}
                                            className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-black text-[10px] hover:bg-blue-100 transition-all flex items-center gap-2"
                                        >
                                            <Download size={14} />
                                            ดาวน์โหลด
                                        </button>
                                    </div>
                                </div>

                                <div className="relative flex items-center py-2">
                                    <div className="flex-grow border-t border-slate-200"></div>
                                    <span className="flex-shrink mx-4 text-slate-400 text-[10px] font-black uppercase">หรือเพิ่มทีละคน</span>
                                    <div className="flex-grow border-t border-slate-200"></div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ชื่อ-นามสกุล นักเรียน</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
                                        placeholder="ระบุชื่อ-นามสกุล"
                                        value={newStudentName}
                                        onChange={(e) => setNewStudentName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ชั้นเรียน</label>
                                    <select 
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
                                        value={newStudentClass}
                                        onChange={(e) => setNewStudentClass(e.target.value)}
                                    >
                                        <option value="">เลือกชั้นเรียน</option>
                                        {classRooms
                                            .filter(c => isAdmin || (currentUser.assignedClasses || []).includes(c.name))
                                            .map(c => (
                                                <option key={c.id} value={c.name}>{c.name}</option>
                                            ))
                                        }
                                    </select>
                                </div>
                                
                                <button 
                                    onClick={handleAddStudent}
                                    className="w-full bg-pink-600 hover:bg-pink-700 text-white py-5 rounded-2xl font-black text-lg transition-all shadow-lg shadow-pink-200"
                                >
                                    บันทึกข้อมูล
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Manage Classes Modal */}
            {isManageClassesOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-2xl font-black text-slate-800">จัดการห้องเรียน</h2>
                                <button onClick={() => setIsManageClassesOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
                                        placeholder="ชื่อห้อง เช่น ป.1/1"
                                        value={newClassName}
                                        onChange={(e) => setNewClassName(e.target.value)}
                                    />
                                    <button 
                                        onClick={handleAddClass}
                                        className="bg-pink-600 text-white p-3 rounded-2xl hover:bg-pink-700 transition-all"
                                    >
                                        <Plus size={24} />
                                    </button>
                                </div>

                                <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {classRooms.map(c => (
                                        <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                            <span className="font-bold text-slate-700">{c.name}</span>
                                            <button 
                                                onClick={() => handleDeleteClass(c.id)}
                                                className="text-rose-400 hover:text-rose-600 p-1"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    ))}
                                    {classRooms.length === 0 && (
                                        <p className="text-center text-slate-400 text-sm font-bold py-4">ยังไม่มีข้อมูลห้องเรียน</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Manage Years Modal */}
            {isManageYearsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-2xl font-black text-slate-800">จัดการปีการศึกษา</h2>
                                <button onClick={() => setIsManageYearsOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="flex-1 px-4 py-3 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
                                        placeholder="เช่น 2567"
                                        value={newYearName}
                                        onChange={(e) => setNewYearName(e.target.value)}
                                    />
                                    <button 
                                        onClick={handleAddYear}
                                        className="bg-pink-600 text-white p-3 rounded-2xl hover:bg-pink-700 transition-all"
                                    >
                                        <Plus size={24} />
                                    </button>
                                </div>

                                <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                    {academicYears.map(y => (
                                        <div key={y.id} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${y.isCurrent ? 'bg-pink-50 border-pink-200' : 'bg-slate-50 border-slate-100'}`}>
                                            <div className="flex items-center gap-3">
                                                <span className={`font-black ${y.isCurrent ? 'text-pink-700' : 'text-slate-700'}`}>{y.year}</span>
                                                {y.isCurrent && <span className="text-[9px] bg-pink-600 text-white px-2 py-0.5 rounded-full font-black uppercase">ปัจจุบัน</span>}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!y.isCurrent && (
                                                    <button 
                                                        onClick={() => handleSetCurrentYear(y.id)}
                                                        className="text-xs font-bold text-blue-600 hover:underline"
                                                    >
                                                        ตั้งเป็นปัจจุบัน
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => handleDeleteYear(y.id)}
                                                    className="text-rose-400 hover:text-rose-600 p-1"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

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
                                {isAdmin && (
                                    <button 
                                        onClick={() => {
                                            setNewStudentName(selectedStudent.name);
                                            setNewStudentClass(selectedStudent.currentClass);
                                            setIsEditStudentOpen(true);
                                        }}
                                        className="p-3 bg-white hover:bg-blue-50 text-blue-500 rounded-2xl transition-all shadow-sm"
                                        title="แก้ไขข้อมูลนักเรียน"
                                    >
                                        <Edit2 size={20} />
                                    </button>
                                )}
                                {isAdmin && (
                                    <button 
                                        onClick={() => handleDeleteStudent(selectedStudent.id)}
                                        className="p-3 bg-white hover:bg-rose-50 text-rose-500 rounded-2xl transition-all shadow-sm"
                                        title="ลบนักเรียน"
                                    >
                                        <Trash2 size={20} />
                                    </button>
                                )}
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

            {/* Manage Teachers Modal */}
            {isManageTeachersOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-black text-slate-800">มอบหมายครูประจำชั้น</h2>
                                <p className="text-sm font-bold text-slate-400">กำหนดห้องเรียนที่คุณครูแต่ละท่านรับผิดชอบ</p>
                            </div>
                            <button onClick={() => setIsManageTeachersOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X size={24} className="text-slate-400" />
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto space-y-4">
                            {teacherProfiles
                                .filter(t => !t.roles.includes('DIRECTOR')) // Don't need to assign classes to director
                                .map(teacher => (
                                <div key={teacher.id} className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center font-black">
                                                {teacher.name[0]}
                                            </div>
                                            <div>
                                                <h3 className="font-black text-slate-800">{teacher.name}</h3>
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                    {teacher.roles.join(', ')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ห้องเรียนที่รับผิดชอบ</p>
                                        <div className="flex flex-wrap gap-2">
                                            {classRooms.map(room => {
                                                const assignedClasses = teacher.assignedClasses || [];
                                                const isAssigned = assignedClasses.includes(room.name);
                                                return (
                                                    <button
                                                        key={room.id}
                                                        onClick={() => {
                                                            const newAssigned = isAssigned
                                                                ? assignedClasses.filter(c => c !== room.name)
                                                                : [...assignedClasses, room.name];
                                                            handleUpdateTeacherClasses(teacher.id, newAssigned);
                                                        }}
                                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                            isAssigned 
                                                            ? 'bg-pink-600 text-white shadow-md shadow-pink-100' 
                                                            : 'bg-white text-slate-500 border border-slate-200 hover:border-pink-300'
                                                        }`}
                                                    >
                                                        {room.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {classRooms.length === 0 && (
                                            <p className="text-xs text-slate-400 italic">กรุณาเพิ่มห้องเรียนก่อนมอบหมาย</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Edit Student Modal */}
            {isEditStudentOpen && selectedStudent && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-8">
                                <h2 className="text-2xl font-black text-slate-800">แก้ไขข้อมูลนักเรียน</h2>
                                <button onClick={() => setIsEditStudentOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                    <X size={24} className="text-slate-400" />
                                </button>
                            </div>
                            
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ชื่อ-นามสกุล นักเรียน</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
                                        placeholder="ระบุชื่อ-นามสกุล"
                                        value={newStudentName}
                                        onChange={(e) => setNewStudentName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ชั้นเรียน</label>
                                    <select 
                                        className="w-full px-5 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 focus:ring-2 focus:ring-pink-500"
                                        value={newStudentClass}
                                        onChange={(e) => setNewStudentClass(e.target.value)}
                                    >
                                        <option value="">เลือกชั้นเรียน</option>
                                        {classRooms.map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <button 
                                    onClick={handleEditStudent}
                                    className="w-full bg-pink-600 hover:bg-pink-700 text-white py-5 rounded-2xl font-black text-lg transition-all shadow-lg shadow-pink-200"
                                >
                                    บันทึกการแก้ไข
                                </button>
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
