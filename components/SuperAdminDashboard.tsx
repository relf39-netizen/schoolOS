
import React, { useState, useEffect } from 'react';
import { School, Teacher, TeacherRole } from '../types';
import { 
    Building, Plus, LogOut, X, Trash2, Database, Upload, CheckCircle2, 
    Loader2, Zap, Info, ShieldCheck, Save, AlertCircle, Shield, 
    AlertTriangle, Search, Users, UserX, UserCheck, Power, PowerOff, 
    ChevronRight, ArrowLeft, Edit, UserCog, Mail, Phone, RefreshCw, HardDrive, Eraser,
    ShieldAlert, UserPlus, ShieldPlus, UserMinus
} from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db, isConfigured as isFirebaseConfigured } from '../firebaseConfig';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';

interface SuperAdminDashboardProps {
    schools: School[];
    teachers: Teacher[];
    onCreateSchool: (school: School) => Promise<void>;
    onUpdateSchool: (school: School) => Promise<void>;
    onDeleteSchool: (schoolId: string) => Promise<void>;
    onUpdateTeacher: (teacher: Teacher) => Promise<void>;
    onDeleteTeacher: (teacherId: string) => Promise<void>;
    onLogout: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ 
    schools, teachers, onCreateSchool, onUpdateSchool, onDeleteSchool, 
    onUpdateTeacher, onDeleteTeacher, onLogout 
}) => {
    const [activeTab, setActiveTab] = useState<'SCHOOLS' | 'IMPORT'>('SCHOOLS');
    const [showForm, setShowForm] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [formData, setFormData] = useState<Partial<School>>({ id: '', name: '' });
    const [isSavingSchool, setIsSavingSchool] = useState(false);
    const [schoolSearch, setSchoolSearch] = useState('');
    const [teacherSearch, setTeacherSearch] = useState('');
    
    // State for viewing staff of a specific school
    const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
    const [isUpdatingTeacher, setIsUpdatingTeacher] = useState<string | null>(null);

    const [targetSchoolId, setTargetSchoolId] = useState<string>('');
    const [isImporting, setIsImporting] = useState(false);
    const [shouldClearData, setShouldClearData] = useState(true);
    const [importLog, setImportLog] = useState<string[]>([]);
    
    const filteredSchools = schools.filter(s => 
        s.name.toLowerCase().includes(schoolSearch.toLowerCase()) || 
        s.id.includes(schoolSearch)
    );

    const currentSchoolObj = schools.find(s => s.id === selectedSchoolId);
    const schoolStaff = teachers.filter(t => t.schoolId === selectedSchoolId)
        .filter(t => t.name.toLowerCase().includes(teacherSearch.toLowerCase()) || t.id.includes(teacherSearch));

    const addLog = (msg: string) => { 
        setImportLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]); 
    };

    const handleSchoolSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.id || !formData.name) return;
        setIsSavingSchool(true);
        try {
            if (isEditMode) await onUpdateSchool(formData as School);
            else await onCreateSchool(formData as School);
            setShowForm(false);
            setFormData({ id: '', name: '' });
        } catch (error) {
            alert("บันทึกไม่สำเร็จ");
        } finally {
            setIsSavingSchool(false);
        }
    };

    const handleToggleTeacherSuspension = async (teacher: Teacher) => {
        if (!isSupabaseConfigured || !supabase) return;
        const newStatus = !teacher.isSuspended;
        setIsUpdatingTeacher(teacher.id);
        
        try {
            const { error } = await supabase.from('profiles').update({ is_suspended: newStatus }).eq('id', teacher.id);
            if (!error) {
                await onUpdateTeacher({ ...teacher, isSuspended: newStatus });
            } else {
                alert("ผิดพลาด: " + error.message);
            }
        } finally {
            setIsUpdatingTeacher(null);
        }
    };

    const handleToggleTeacherAdmin = async (teacher: Teacher) => {
        if (!isSupabaseConfigured || !supabase) return;
        
        const hasAdmin = teacher.roles.includes('SYSTEM_ADMIN');
        let newRoles: TeacherRole[] = [];
        
        if (hasAdmin) {
            newRoles = teacher.roles.filter(r => r !== 'SYSTEM_ADMIN');
            if (!confirm(`ยืนยันการถอนสิทธิ์แอดมินของ: ${teacher.name}?`)) return;
        } else {
            newRoles = [...teacher.roles, 'SYSTEM_ADMIN'];
            if (!confirm(`ยืนยันการแต่งตั้งแอดมินโรงเรียน: ${teacher.name}?`)) return;
        }

        setIsUpdatingTeacher(teacher.id);
        try {
            const { error } = await supabase.from('profiles').update({ roles: newRoles }).eq('id', teacher.id);
            if (!error) {
                await onUpdateTeacher({ ...teacher, roles: newRoles });
            } else {
                alert("ผิดพลาด: " + error.message);
            }
        } finally {
            setIsUpdatingTeacher(null);
        }
    };

    const handleMigrateFromFirebase = async () => {
        if (!isFirebaseConfigured || !db || !isSupabaseConfigured || !supabase) {
            alert("ระบบฐานข้อมูลไม่พร้อมเชื่อมต่อ กรุณาตรวจสอบ API Key");
            return;
        }
        if (!targetSchoolId) {
            alert("กรุณาเลือกโรงเรียนเป้าหมาย");
            return;
        }

        const confirmMsg = shouldClearData 
            ? `⚠️ ยืนยันการล้างและนำเข้าข้อมูลใหม่สำหรับโรงเรียน "${targetSchoolId}"?`
            : "ยืนยันการนำเข้าข้อมูลเพิ่มเติม?";
        
        if (!confirm(confirmMsg)) return;

        setIsImporting(true);
        setImportLog([]);
        addLog("🚀 เริ่มต้นกระบวนการ Migration (Type-Safe Mode)...");

        const entities = [
            { 
                fbCol: 'teachers', spTab: 'profiles', label: 'ข้อมูลบุคลากร', autoId: false,
                allowedFields: ['id', 'school_id', 'name', 'password', 'position', 'roles', 'signature_base_64', 'telegram_chat_id', 'is_suspended']
            },
            { 
                fbCol: 'documents', spTab: 'documents', label: 'งานสารบรรณ', autoId: true,
                allowedFields: ['school_id', 'category', 'book_number', 'title', 'description', 'from', 'date', 'timestamp', 'priority', 'attachments', 'status', 'director_command', 'director_signature_date', 'signed_file_url', 'assigned_vice_director_id', 'vice_director_command', 'vice_director_signature_date', 'target_teachers', 'acknowledged_by']
            },
            { 
                fbCol: 'leave_requests', spTab: 'leave_requests', label: 'การลา', autoId: true,
                allowedFields: ['school_id', 'teacher_id', 'teacher_name', 'teacher_position', 'type', 'start_date', 'end_date', 'start_time', 'end_time', 'substitute_name', 'reason', 'mobile_phone', 'contact_info', 'status', 'director_signature', 'approved_date', 'created_at']
            },
            { 
                fbCol: 'finance_transactions', spTab: 'finance_transactions', label: 'รายการเงิน', autoId: true,
                allowedFields: ['school_id', 'account_id', 'date', 'description', 'amount', 'type']
            },
            { fbCol: 'finance_accounts', spTab: 'finance_accounts', label: 'บัญชีการเงิน', autoId: false, allowedFields: ['id', 'school_id', 'name', 'type'] },
            { fbCol: 'attendance', spTab: 'attendance', label: 'บันทึกเวลาปฏิบัติงาน', autoId: true, allowedFields: ['school_id', 'teacher_id', 'teacher_name', 'date', 'check_in_time', 'check_out_time', 'status', 'coordinate'] },
            { fbCol: 'plan_projects', spTab: 'plan_projects', label: 'แผนปฏิบัติการ', autoId: false, allowedFields: ['id', 'school_id', 'department_name', 'name', 'subsidy_budget', 'learner_dev_budget', 'actual_expense', 'status', 'fiscal_year'] },
            { fbCol: 'budget_settings', spTab: 'budget_settings', label: 'งบประมาณแผน', autoId: false, allowedFields: ['id', 'school_id', 'fiscal_year', 'subsidy', 'learner'] },
            { fbCol: 'academic_enrollments', spTab: 'academic_enrollments', label: 'สถิตินักเรียน', autoId: false, allowedFields: ['id', 'school_id', 'year', 'levels'] },
            { fbCol: 'academic_test_scores', spTab: 'academic_test_scores', label: 'ผลสอบระดับชาติ', autoId: false, allowedFields: ['id', 'school_id', 'year', 'test_type', 'results'] }
        ];

        try {
            if (shouldClearData) {
                addLog(`🧹 กำลังล้างข้อมูลเก่าโรงเรียน ${targetSchoolId}...`);
                for (const entity of [...entities].reverse()) {
                    const { error } = await supabase.from(entity.spTab).delete().eq('school_id', targetSchoolId);
                    if (error) addLog(`⚠️ เคลียร์ตาราง ${entity.spTab} ไม่สำเร็จ: ${error.message}`);
                }
            }

            for (const entity of entities) {
                addLog(`ดึงข้อมูล ${entity.label}...`);
                const snap = await getDocs(collection(db, entity.fbCol));
                const items: any[] = [];
                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    const mapped: any = {};
                    Object.keys(data).forEach(key => {
                        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                        if (entity.allowedFields.includes(snakeKey)) mapped[snakeKey] = data[key];
                    });
                    mapped.school_id = targetSchoolId;
                    if (entity.autoId) delete mapped.id;
                    else if (!mapped.id) mapped.id = docSnap.id;
                    items.push(mapped);
                });

                if (items.length > 0) {
                    addLog(`กำลังนำเข้า ${items.length} รายการ สู่ SQL...`);
                    const chunkSize = 25;
                    for (let i = 0; i < items.length; i += chunkSize) {
                        const chunk = items.slice(i, i + chunkSize);
                        const { error } = entity.autoId 
                            ? await supabase.from(entity.spTab).insert(chunk)
                            : await supabase.from(entity.spTab).upsert(chunk);
                        if (error) {
                            addLog(`🔴 ผิดพลาดที่ ${entity.spTab}: ${error.message}`);
                            throw new Error(`Migration Failed at ${entity.spTab}`);
                        }
                    }
                    addLog(`✅ นำเข้า ${entity.label} สำเร็จ`);
                }
            }
            addLog(`🎊 การย้ายข้อมูลเสร็จสมบูรณ์สำหรับโรงเรียน ${targetSchoolId}`);
            alert("ดำเนินการนำเข้าข้อมูลเสร็จสิ้น");
        } catch (err: any) {
            addLog(`❌ ข้อผิดพลาด: ${err.message}`);
            alert("เกิดข้อผิดพลาดในการนำเข้า");
        } finally {
            setIsImporting(false);
        }
    };

    const handleToggleSchoolSuspension = async (school: School) => {
        if (!isSupabaseConfigured || !supabase) return;
        const newStatus = !school.isSuspended;
        if (!confirm(`ยืนยันการ${newStatus ? 'ระงับ' : 'เปิด'}การใช้งานโรงเรียน: ${school.name}?`)) return;
        
        const { error } = await supabase.from('schools').update({ is_suspended: newStatus }).eq('id', school.id);
        if (!error) await onUpdateSchool({ ...school, isSuspended: newStatus });
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sarabun text-slate-900">
            <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-30">
                <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg shadow-blue-500/20">S</div>
                        <div>
                            <h1 className="text-lg font-bold leading-none">Super Admin</h1>
                            <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Multi-School Management Hub</span>
                        </div>
                    </div>
                    <div className="hidden md:flex bg-slate-800 p-1 rounded-xl">
                        <button onClick={() => { setActiveTab('SCHOOLS'); setSelectedSchoolId(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'SCHOOLS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>จัดการโรงเรียน</button>
                        <button onClick={() => { setActiveTab('IMPORT'); setSelectedSchoolId(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'IMPORT' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>ย้ายฐานข้อมูล</button>
                    </div>
                    <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-400 transition-colors flex items-center gap-2 font-bold">
                        <span className="text-xs hidden sm:inline">ออกจากระบบ</span>
                        <LogOut size={20}/>
                    </button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-6 pb-24">
                {activeTab === 'SCHOOLS' && !selectedSchoolId && (
                    <div className="animate-fade-in space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border shadow-sm">
                            <div className="flex-1 w-full md:max-w-sm relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                <input 
                                    type="text" 
                                    placeholder="ค้นหารหัส หรือชื่อโรงเรียน..." 
                                    value={schoolSearch}
                                    onChange={e => setSchoolSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border-2 border-transparent rounded-xl outline-none focus:border-blue-500 focus:bg-white transition-all font-bold"
                                />
                            </div>
                            <button onClick={() => { setFormData({id:'', name:''}); setIsEditMode(false); setShowForm(true); }} className="bg-blue-600 text-white px-8 py-3 rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 font-black transition-all hover:bg-blue-700 active:scale-95">
                                <Plus size={20}/> เพิ่มโรงเรียนใหม่
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredSchools.map(s => (
                                <div key={s.id} className={`bg-white rounded-3xl border-2 transition-all overflow-hidden flex flex-col relative ${s.isSuspended ? 'border-red-100 bg-red-50/10' : 'border-slate-100 hover:border-blue-200 shadow-sm hover:shadow-xl'}`}>
                                    <div className="p-6 flex-1">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className={`p-4 rounded-2xl ${s.isSuspended ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                <Building size={28}/>
                                            </div>
                                            <span className="text-[10px] font-black font-mono bg-slate-100 p-1.5 rounded px-2 text-slate-500">{s.id}</span>
                                        </div>
                                        <h3 className="font-black text-xl text-slate-800 truncate mb-1">{s.name}</h3>
                                        <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
                                            <Users size={12}/> {teachers.filter(t => t.schoolId === s.id).length} บุคลากร
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 p-4 border-t flex justify-between items-center">
                                        <button 
                                            onClick={() => setSelectedSchoolId(s.id)}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black shadow-md hover:bg-blue-700 transition-all flex items-center gap-2"
                                        >
                                            <Users size={14}/> จัดการบุคลากร
                                        </button>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setFormData(s); setIsEditMode(true); setShowForm(true); }} className="p-2 bg-white border rounded-xl text-slate-500 hover:text-blue-600 transition-all"><Edit size={16}/></button>
                                            <button onClick={() => handleToggleSchoolSuspension(s)} className={`p-2 border rounded-xl transition-all ${s.isSuspended ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 hover:text-red-600'}`} title={s.isSuspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}>{s.isSuspended ? <Power size={16}/> : <PowerOff size={16}/>}</button>
                                            <button onClick={() => { if(confirm("ลบโรงเรียนนี้ถาวร?")) onDeleteSchool(s.id); }} className="p-2 bg-white border rounded-xl text-slate-300 hover:text-red-600 transition-all"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Staff Management for Selected School */}
                {selectedSchoolId && (
                    <div className="animate-slide-up space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <button onClick={() => setSelectedSchoolId(null)} className="flex items-center gap-2 text-slate-500 font-black hover:text-blue-600 transition-colors">
                                <ArrowLeft size={18}/> ย้อนกลับหน้าหลัก
                            </button>
                            <div className="bg-white px-6 py-3 rounded-2xl border-2 border-blue-100 flex items-center gap-4 shadow-sm">
                                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black">
                                    <Building size={20}/>
                                </div>
                                <div>
                                    <h2 className="font-black text-slate-800 leading-tight">{currentSchoolObj?.name}</h2>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">School Staff Directory</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
                            <div className="p-8 bg-slate-50 border-b flex flex-col md:flex-row justify-between items-center gap-6">
                                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                                    <Users className="text-blue-600"/> รายชื่อบุคลากร ({schoolStaff.length})
                                </h3>
                                <div className="relative w-full md:w-80">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type="text" 
                                        placeholder="ค้นหาชื่อ หรือรหัส..." 
                                        value={teacherSearch}
                                        onChange={e => setTeacherSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-white border-2 border-slate-100 rounded-xl outline-none focus:border-blue-500 transition-all font-bold"
                                    />
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                                        <tr>
                                            <th className="p-6">ข้อมูลพื้นฐาน</th>
                                            <th className="p-6">ตำแหน่ง</th>
                                            <th className="p-6">บทบาท/สิทธิ์</th>
                                            <th className="p-6 text-center">สถานะ</th>
                                            <th className="p-6 text-right">การจัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {schoolStaff.length === 0 ? (
                                            <tr><td colSpan={5} className="p-20 text-center text-slate-400 font-bold">ไม่พบรายชื่อบุคลากร</td></tr>
                                        ) : schoolStaff.map(t => (
                                            <tr key={t.id} className={`hover:bg-slate-50/50 transition-colors ${t.isSuspended ? 'bg-red-50/10' : ''}`}>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${t.isSuspended ? 'bg-slate-200 text-slate-400' : 'bg-blue-100 text-blue-600'}`}>
                                                            {t.name[0]}
                                                        </div>
                                                        <div>
                                                            <div className="font-black text-slate-700">{t.name}</div>
                                                            <div className="text-[10px] font-mono text-slate-400 font-bold">ID: {t.id}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6 text-sm font-bold text-slate-500">{t.position}</td>
                                                <td className="p-6">
                                                    <div className="flex flex-wrap gap-1">
                                                        {t.roles.map(r => (
                                                            <span key={r} className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${r === 'SYSTEM_ADMIN' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                                                                {r}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${t.isSuspended ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                        {t.isSuspended ? <UserX size={10}/> : <UserCheck size={10}/>}
                                                        {t.isSuspended ? 'Suspended' : 'Active'}
                                                    </div>
                                                </td>
                                                <td className="p-6 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button 
                                                            disabled={isUpdatingTeacher === t.id}
                                                            onClick={() => handleToggleTeacherAdmin(t)}
                                                            className={`p-2.5 rounded-xl transition-all border-2 flex items-center gap-2 text-[10px] font-black uppercase ${t.roles.includes('SYSTEM_ADMIN') ? 'bg-white text-indigo-600 border-indigo-100 hover:border-red-200 hover:text-red-600' : 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-600 hover:text-white'}`}
                                                            title={t.roles.includes('SYSTEM_ADMIN') ? 'ถอนสิทธิ์แอดมินโรงเรียน' : 'ตั้งเป็นแอดมินโรงเรียน'}
                                                        >
                                                            {isUpdatingTeacher === t.id ? <Loader2 className="animate-spin" size={14}/> : (t.roles.includes('SYSTEM_ADMIN') ? <UserMinus size={14}/> : <ShieldPlus size={14}/>)}
                                                            <span className="hidden xl:inline">{t.roles.includes('SYSTEM_ADMIN') ? 'Remove Admin' : 'Make Admin'}</span>
                                                        </button>
                                                        
                                                        <button 
                                                            disabled={isUpdatingTeacher === t.id}
                                                            onClick={() => handleToggleTeacherSuspension(t)}
                                                            className={`p-2.5 rounded-xl transition-all border-2 ${t.isSuspended ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white'}`}
                                                            title={t.isSuspended ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
                                                        >
                                                            {isUpdatingTeacher === t.id ? <Loader2 className="animate-spin" size={14}/> : (t.isSuspended ? <Power size={14}/> : <PowerOff size={14}/>)}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'IMPORT' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-xl overflow-hidden">
                            <div className="bg-slate-900 p-10 text-white">
                                <h2 className="text-3xl font-black mb-2 flex items-center gap-4">
                                    <RefreshCw className="text-blue-500" size={36}/>
                                    Auto Migration (Secure Mode)
                                </h2>
                                <p className="text-slate-400 font-medium">นำเข้าข้อมูลจาก Firebase สู่ SQL โดยกรองฟิลด์ที่รองรับอัตโนมัติ</p>
                            </div>
                            <div className="p-10">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 p-6 rounded-[2rem] border-2 border-blue-100">
                                            <label className="block text-xs font-black text-blue-400 uppercase tracking-widest mb-3 ml-1">เลือกโรงเรียนเป้าหมายที่ต้องการจัดเก็บ</label>
                                            <select 
                                                value={targetSchoolId}
                                                onChange={(e) => setTargetSchoolId(e.target.value)}
                                                className="w-full px-6 py-4 bg-white border-2 border-blue-200 rounded-2xl outline-none focus:border-blue-500 font-black text-lg transition-all"
                                            >
                                                <option value="">-- กรุณาเลือกโรงเรียน --</option>
                                                {schools.map(s => (
                                                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div onClick={() => setShouldClearData(!shouldClearData)} className={`p-6 rounded-[2rem] border-2 transition-all cursor-pointer flex items-center gap-4 ${shouldClearData ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${shouldClearData ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}>
                                                {shouldClearData ? <Eraser size={20}/> : <RefreshCw size={20}/>}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-black text-sm">ล้างข้อมูลเดิมในโรงเรียนนี้ (Clean Sweep)</h4>
                                                <p className="text-[10px] font-bold opacity-70">ลบข้อมูลเก่าที่มี ID นี้ใน SQL ออกเพื่อป้องกันข้อมูลซ้ำ</p>
                                            </div>
                                            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center ${shouldClearData ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300 bg-white'}`}>
                                                {shouldClearData && <CheckCircle2 size={16}/>}
                                            </div>
                                        </div>

                                        <button 
                                            onClick={handleMigrateFromFirebase}
                                            disabled={isImporting || !targetSchoolId}
                                            className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-50 disabled:grayscale"
                                        >
                                            {isImporting ? <Loader2 className="animate-spin" size={28}/> : <Zap size={28}/>}
                                            เริ่มการ Migration
                                        </button>
                                    </div>

                                    <div className="flex flex-col space-y-4">
                                        <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest px-2">
                                            <HardDrive size={16}/> Console Log
                                        </div>
                                        <div className="bg-slate-950 rounded-[2rem] p-8 shadow-2xl border-4 border-slate-900 flex-1 min-h-[450px]">
                                            <div className="font-mono text-[10px] space-y-1 overflow-y-auto max-h-[400px] custom-scrollbar text-emerald-400">
                                                {importLog.length === 0 ? (
                                                    <div className="h-full flex items-center justify-center text-slate-700 italic">Select a target school to start migration.</div>
                                                ) : (
                                                    importLog.map((log, i) => (
                                                        <div key={i} className={log.includes('✅') || log.includes('🎊') ? 'text-emerald-400 font-bold' : log.includes('🔴') || log.includes('⚠️') ? 'text-rose-400 font-bold' : log.includes('🧹') ? 'text-orange-400' : 'text-slate-400'}>
                                                            {log}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-md">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 animate-scale-up relative overflow-hidden border-4 border-blue-500/20">
                        <div className="flex justify-between items-center mb-8">
                            <div>
                                <h3 className="text-3xl font-black text-slate-800">{isEditMode ? 'แก้ไขข้อมูล' : 'เพิ่มโรงเรียน'}</h3>
                                <p className="text-slate-400 font-bold text-sm">School Information Setup</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><X size={28}/></button>
                        </div>
                        <form onSubmit={handleSchoolSubmit} className="space-y-6">
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">รหัสโรงเรียน (8 หลัก)</label>
                                <input 
                                    type="text" 
                                    disabled={isEditMode} 
                                    value={formData.id} 
                                    onChange={e => setFormData({...formData, id: e.target.value})} 
                                    className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-500 focus:bg-white font-black text-xl transition-all disabled:bg-slate-200 disabled:text-slate-500" 
                                    placeholder="เช่น 31030019"
                                    required 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">ชื่อโรงเรียน / สถานศึกษา</label>
                                <input 
                                    type="text" 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-blue-500 focus:bg-white font-black text-xl transition-all" 
                                    placeholder="ระบุชื่อเต็มสถานศึกษา"
                                    required 
                                />
                            </div>
                            <div className="flex gap-4 pt-6">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-5 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all uppercase tracking-widest">ยกเลิก</button>
                                <button type="submit" disabled={isSavingSchool} className="flex-2 py-5 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95 uppercase tracking-widest">
                                    {isSavingSchool ? <Loader2 className="animate-spin" size={24}/> : <Save size={24}/>} 
                                    บันทึกข้อมูล
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }`}</style>
        </div>
    );
};

export default SuperAdminDashboard;
