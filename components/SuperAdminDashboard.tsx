
import React, { useState, useEffect, useRef } from 'react';
import { School, Teacher } from '../types';
import { Building, Plus, LogOut, X, Trash2, Database, Upload, FileJson, CheckCircle2, Loader2, Zap, Info, ExternalLink, Copy, Check, Terminal, ShieldCheck, Save, AlertCircle, ClipboardList, Shield, AlertTriangle, Link, Search } from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db, isConfigured } from '../firebaseConfig';
import { supabase, isConfigured as isSupabaseConfigured, DATABASE_SQL } from '../supabaseClient';

const AUTO_ID_TABLES = ['documents', 'leave_requests', 'finance_transactions', 'attendance', 'director_events'];

const ALLOWED_COLUMNS: Record<string, string[]> = {
    schools: ['id', 'name', 'district', 'province', 'lat', 'lng', 'radius', 'late_time_threshold', 'academic_year_start', 'academic_year_end', 'logo_base_64'],
    profiles: ['id', 'school_id', 'name', 'password', 'position', 'roles', 'signature_base64', 'telegram_chat_id'],
    documents: ['id', 'school_id', 'category', 'book_number', 'title', 'description', 'from', 'date', 'timestamp', 'priority', 'attachments', 'status', 'director_command', 'target_teachers', 'acknowledged_by'],
    leave_requests: ['id', 'school_id', 'teacher_id', 'teacher_name', 'teacher_position', 'type', 'start_date', 'end_date', 'reason', 'mobile_phone', 'status', 'director_signature', 'approved_date'],
    finance_accounts: ['id', 'school_id', 'name', 'type'],
    finance_transactions: ['id', 'school_id', 'account_id', 'date', 'description', 'amount', 'type'],
    attendance: ['id', 'school_id', 'teacher_id', 'teacher_name', 'date', 'check_in_time', 'check_out_time', 'status', 'coordinate'],
    director_events: ['id', 'school_id', 'title', 'description', 'date', 'start_time', 'end_time', 'location', 'created_by'],
    plan_projects: ['id', 'school_id', 'department_name', 'name', 'subsidy_budget', 'learner_dev_budget', 'actual_expense', 'status', 'fiscal_year'],
    budget_settings: ['id', 'school_id', 'fiscal_year', 'subsidy', 'learner'],
    academic_enrollments: ['id', 'school_id', 'year', 'levels'],
    academic_test_scores: ['id', 'school_id', 'year', 'test_type', 'results']
};

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

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ schools, onCreateSchool, onUpdateSchool, onDeleteSchool, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'SCHOOLS' | 'IMPORT' | 'SQL'>('SCHOOLS');
    const [showForm, setShowForm] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [formData, setFormData] = useState<Partial<School>>({ id: '', name: '' });
    const [copied, setCopied] = useState(false);
    const [logCopied, setLogCopied] = useState(false);
    const [targetSchoolId, setTargetSchoolId] = useState<string>('');

    const [isImporting, setIsImporting] = useState(false);
    const [isSavingSchool, setIsSavingSchool] = useState(false);
    const [importLog, setImportLog] = useState<string[]>([]);
    const [importData, setImportData] = useState<any>(null);

    useEffect(() => {
        if (schools.length > 0 && !targetSchoolId) setTargetSchoolId(schools[0].id);
    }, [schools]);

    const addLog = (msg: string) => {
        setImportLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    };

    const handleCopySQL = () => {
        navigator.clipboard.writeText(DATABASE_SQL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyLogs = () => {
        navigator.clipboard.writeText(importLog.join('\n'));
        setLogCopied(true);
        setTimeout(() => setLogCopied(false), 2000);
    };

    const strictMapper = (item: any, tableName: string) => {
        const raw = { ...item };
        const allowed = ALLOWED_COLUMNS[tableName] || [];
        
        if (AUTO_ID_TABLES.includes(tableName)) delete raw.id;

        const conversions: Record<string, string> = {
            'schoolId': 'school_id',
            'academicYearStart': 'academic_year_start',
            'academicYearEnd': 'academic_year_end',
            'lateTimeThreshold': 'late_time_threshold',
            'logoBase64': 'logo_base_64',
            'signatureBase64': 'signature_base_64',
            'telegramChatId': 'telegram_chat_id',
            'bookNumber': 'book_number',
            'directorCommand': 'director_command',
            'targetTeachers': 'target_teachers',
            'acknowledgedBy': 'acknowledged_by',
            'teacherId': 'teacher_id',
            'teacherName': 'teacher_name',
            'teacherPosition': 'teacher_position',
            'startDate': 'start_date',
            'endDate': 'end_date',
            'approvedDate': 'approved_date',
            'directorSignature': 'director_signature',
            'mobilePhone': 'mobile_phone',
            'accountId': 'account_id',
            'checkInTime': 'check_in_time',
            'checkOutTime': 'check_out_time',
            'checkInCoordinate': 'coordinate',
            'checkOutCoordinate': 'coordinate',
            'startTime': 'start_time',
            'endTime': 'end_time',
            'createdBy': 'created_by',
            'departmentName': 'department_name',
            'subsidyBudget': 'subsidy_budget',
            'learnerDevBudget': 'learner_dev_budget',
            'actualExpense': 'actual_expense',
            'fiscalYear': 'fiscal_year',
            'testType': 'test_type'
        };

        const mapped: any = {};
        Object.keys(raw).forEach(key => {
            let value = raw[key];
            if (value && typeof value === 'object' && value.seconds) {
                value = new Date(value.seconds * 1000).toISOString().split('T')[0];
            }
            const targetKey = conversions[key] || key;
            mapped[targetKey] = value;
        });

        if (allowed.includes('school_id') && targetSchoolId) mapped['school_id'] = targetSchoolId;

        const final: any = {};
        allowed.forEach(col => {
            if (mapped[col] !== undefined) final[col] = mapped[col];
        });
        return final;
    };

    const fetchLiveFromFirebase = async () => {
        if (!isConfigured || !db) { alert("Firebase not configured"); return; }
        setIsImporting(true);
        setImportLog([]);
        addLog("🚀 เริ่มดึงข้อมูลจากระบบ Firebase...");
        
        const tables = [
            { id: 'schools', label: 'โรงเรียน' },
            { id: 'profiles', label: 'บุคลากร/คุณครู' },
            { id: 'documents', label: 'งานสารบรรณ' },
            { id: 'leave_requests', label: 'การลา' },
            { id: 'finance_accounts', label: 'ผังบัญชี' },
            { id: 'finance_transactions', label: 'รายการเงิน' },
            { id: 'attendance', label: 'บันทึกเวลา' },
            { id: 'director_events', label: 'ปฏิทิน ผอ.' },
            { id: 'plan_projects', label: 'โครงการแผนงาน' },
            { id: 'budget_settings', label: 'ตั้งค่างบประมาณ' },
            { id: 'academic_enrollments', label: 'ข้อมูลนักเรียน' },
            { id: 'academic_test_scores', label: 'คะแนนสอบ' }
        ];

        const allData: any = {};
        try {
            for (const t of tables) {
                addLog(`กำลังอ่าน ${t.label}...`);
                let snap = await getDocs(query(collection(db, t.id)));
                if (t.id === 'profiles' && snap.empty) {
                    addLog("💡 ไม่พบ 'profiles' ลองค้นหาใน 'teachers'...");
                    snap = await getDocs(query(collection(db, 'teachers')));
                }
                const items: any[] = [];
                snap.forEach((doc) => { items.push({ ...doc.data(), id: doc.id }); });
                allData[t.id] = items;
                addLog(`✅ พบ ${items.length} รายการ`);
            }
            setImportData(allData);
            addLog("🎊 ดึงข้อมูลครบทุกตารางแล้ว! กรุณากดบันทึกลง SQL");
        } catch (err: any) {
            addLog(`🔴 ข้อผิดพลาด: ${err.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const processImport = async () => {
        if (!importData) return;
        if (!targetSchoolId) { alert("กรุณาเลือกโรงเรียนเป้าหมายก่อน"); return; }
        
        setIsImporting(true);
        addLog(`💾 กำลังย้ายข้อมูลไปยังโรงเรียนรหัส: ${targetSchoolId}`);
        
        const order = [
            'schools', 'profiles', 'documents', 'leave_requests', 
            'finance_accounts', 'finance_transactions', 'attendance',
            'director_events', 'plan_projects', 'budget_settings',
            'academic_enrollments', 'academic_test_scores'
        ];
        
        try {
            for (const table of order) {
                const rawItems = importData[table];
                if (!rawItems || rawItems.length === 0) continue;
                const cleanItems = rawItems.map((item: any) => strictMapper(item, table));
                addLog(`ย้าย ${table} (${cleanItems.length} แถว)...`);

                if (isSupabaseConfigured && supabase) {
                    const { error } = await supabase.from(table).upsert(cleanItems);
                    if (error) {
                        addLog(`❌ [${table}] ล้มเหลว: ${error.message}`);
                    } else {
                        addLog(`✅ [${table}] สำเร็จ`);
                    }
                }
            }
            addLog("🏁 ย้ายข้อมูลทั้งหมดเสร็จสมบูรณ์!");
        } catch (err: any) {
            addLog(`🔴 วิกฤต: ${err.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const handleSchoolSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.id || !formData.name) return;
        
        setIsSavingSchool(true);
        try {
            if (isEditMode) {
                await onUpdateSchool(formData as School);
            } else {
                await onCreateSchool(formData as School);
                if (schools.length === 0) setTargetSchoolId(formData.id!);
            }
            setShowForm(false);
            setIsEditMode(false);
            setFormData({ id: '', name: '' });
            alert("บันทึกโรงเรียนสำเร็จ!");
        } catch (err: any) {
            alert("❌ บันทึกไม่สำเร็จ: " + err.message);
        } finally {
            setIsSavingSchool(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sarabun text-slate-900">
            <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-30 flex justify-between items-center">
                <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg">S</div>
                        <h1 className="text-lg font-bold leading-none">Super Admin <span className="text-[10px] block text-blue-400 font-bold uppercase">Ultimate Migration v4.0</span></h1>
                    </div>
                    <div className="flex bg-slate-800 p-1 rounded-xl">
                        <button onClick={() => setActiveTab('SCHOOLS')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'SCHOOLS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>จัดการโรงเรียน</button>
                        <button onClick={() => setActiveTab('IMPORT')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'IMPORT' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>นำเข้าข้อมูล</button>
                        <button onClick={() => setActiveTab('SQL')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'SQL' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>SQL Setup</button>
                    </div>
                    <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-400 transition-colors"><LogOut size={22}/></button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto p-6">
                {activeTab === 'IMPORT' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-white rounded-[2rem] shadow-2xl border overflow-hidden">
                            <div className="bg-slate-900 p-10 text-white relative">
                                <div className="absolute top-0 right-0 p-10 opacity-10"><Database size={200}/></div>
                                <h2 className="text-3xl font-black relative z-10">Safe Migration Hub</h2>
                                <p className="text-slate-400 mt-2 font-bold relative z-10">ระบบย้ายข้อมูลอัจฉริยะ (รองรับ งานวิชาการ และ แผนงาน แล้ว)</p>
                            </div>
                            
                            <div className="p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
                                <div className="lg:col-span-4 space-y-6">
                                    <div className="p-6 rounded-3xl border-2 bg-blue-50 border-blue-200 shadow-sm">
                                        <label className="block text-xs font-black text-blue-400 uppercase tracking-widest mb-3">1. เลือกโรงเรียนที่ต้องการย้ายเข้า</label>
                                        <select 
                                            value={targetSchoolId}
                                            onChange={(e) => setTargetSchoolId(e.target.value)}
                                            className="w-full px-4 py-3 bg-white border-2 border-blue-100 rounded-2xl font-bold focus:border-blue-500 outline-none cursor-pointer"
                                        >
                                            <option value="">-- เลือกโรงเรียนเป้าหมาย --</option>
                                            {schools.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
                                        </select>
                                    </div>

                                    <div className="bg-slate-900 text-white p-6 rounded-3xl space-y-4">
                                        <h5 className="font-bold flex items-center gap-2 text-emerald-400"><Shield size={18}/> ข้อมูลที่ย้ายเพิ่มรอบนี้</h5>
                                        <ul className="text-[10px] text-slate-400 space-y-1 list-disc pl-4 font-bold">
                                            <li>ปฏิทินปฏิบัติงาน ผอ.</li>
                                            <li>โครงการในแผนปฏิบัติการ (Plan)</li>
                                            <li>งบประมาณตั้งต้นรายปี</li>
                                            <li>จำนวนนักเรียนทุกระดับชั้น</li>
                                            <li>คะแนนสอบระดับชาติ (RT/NT/O-NET)</li>
                                        </ul>
                                    </div>
                                </div>

                                <div className="lg:col-span-8 space-y-6">
                                    <div className="flex flex-col items-center">
                                        <button disabled={isImporting} onClick={fetchLiveFromFirebase} className="px-12 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-2xl hover:scale-105 transition-all flex items-center gap-3 text-lg">
                                            {isImporting ? <Loader2 className="animate-spin" size={24}/> : <Zap size={24}/>} ดึงข้อมูลส่วนที่เหลือจาก Firebase
                                        </button>
                                    </div>

                                    <div className="bg-slate-950 rounded-[2rem] p-8 h-[400px] flex flex-col shadow-2xl border-4 border-slate-800">
                                        <div className="flex justify-between items-center mb-4">
                                            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"><Terminal size={14}/> Migration Console</span>
                                            <button onClick={handleCopyLogs} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-slate-800 text-slate-400 hover:text-white">
                                                {logCopied ? <Check size={14}/> : <ClipboardList size={14}/>} คัดลอก Log
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto font-mono text-[11px] space-y-1 custom-scrollbar pr-4">
                                            {importLog.length === 0 ? <div className="text-slate-700 italic">พร้อมเริ่มงาน...</div> : importLog.map((log, i) => (
                                                <div key={i} className={log.includes('✅') ? 'text-emerald-400' : log.includes('❌') ? 'text-rose-400 font-bold' : log.includes('⚠️') ? 'text-amber-400 italic' : 'text-slate-400'}>{log}</div>
                                            ))}
                                        </div>
                                    </div>

                                    {importData && (
                                        <button disabled={isImporting} onClick={processImport} className="w-full py-6 bg-emerald-600 text-white rounded-3xl font-black text-xl shadow-2xl hover:bg-emerald-700 flex items-center justify-center gap-4 transition-all">
                                            {isImporting ? <Loader2 className="animate-spin" size={32}/> : <Save size={32}/>} ยืนยันบันทึกลง SQL (Supabase)
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'SCHOOLS' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="flex justify-between items-center bg-white p-6 rounded-2xl border shadow-sm">
                            <div><h2 className="text-2xl font-black text-slate-800">จัดการรายชื่อโรงเรียน</h2><p className="text-slate-500">คุณมี {schools.length} โรงเรียนในระบบ Supabase</p></div>
                            <button onClick={() => { setFormData({id:'', name:''}); setIsEditMode(false); setShowForm(true); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-all hover:scale-105"><Plus size={20}/> เพิ่มโรงเรียนใหม่</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {schools.map(s => (
                                <div key={s.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 group hover:shadow-xl transition-all">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all"><Building size={28}/></div>
                                        <div className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">{s.id}</div>
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-800 mb-2 truncate">{s.name}</h3>
                                    <div className="flex gap-2 mt-4">
                                        <button onClick={() => { setFormData(s); setIsEditMode(true); setShowForm(true); }} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs hover:bg-blue-600 hover:text-white transition-colors">แก้ไข</button>
                                        <button onClick={() => onDeleteSchool(s.id)} className="p-2 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={18}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'SQL' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-white rounded-[2rem] shadow-xl border overflow-hidden">
                            <div className="bg-slate-950 p-10 text-white flex justify-between items-center border-b border-white/10">
                                <div><h2 className="text-3xl font-black flex items-center gap-3"><Terminal className="text-emerald-500"/> Supabase SQL Setup</h2><p className="text-slate-400 text-sm mt-2">ชุดคำสั่งสำหรับการเตรียมฐานข้อมูลที่สมบูรณ์</p></div>
                                <button onClick={handleCopySQL} className={`px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${copied ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>{copied ? <Check size={20}/> : <Copy size={20}/>}{copied ? 'คัดลอกสำเร็จ' : 'คัดลอก SQL Code'}</button>
                            </div>
                            <div className="p-10 space-y-6">
                                <div className="bg-blue-50 border-2 border-blue-200 p-8 rounded-[2rem] space-y-4">
                                    <div className="flex items-center gap-3 text-blue-600"><Info size={32}/><h4 className="text-xl font-black">อัปเดตตารางที่เหลือ</h4></div>
                                    <p className="text-slate-700 font-bold italic">หากคุณรันตารางรอบแรกไปแล้ว (บรรทัด 1-80) คุณสามารถก๊อปปี้ส่วนที่ 2 (บรรทัดที่ 82 เป็นต้นไป) ไปรันต่อใน Supabase ได้เลยครับ เพื่อให้รองรับงานวิชาการและแผนงาน</p>
                                </div>
                                <div className="bg-slate-900 rounded-[2rem] p-8 overflow-hidden"><pre className="text-[11px] text-emerald-400 font-mono overflow-auto max-h-[600px] leading-relaxed custom-scrollbar pr-4">{DATABASE_SQL}</pre></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg p-8 animate-scale-up">
                        <h3 className="text-2xl font-black text-slate-800 mb-6">{isEditMode ? 'แก้ไขข้อมูลโรงเรียน' : 'เพิ่มโรงเรียนใหม่'}</h3>
                        <form onSubmit={handleSchoolSubmit} className="space-y-5">
                            <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">รหัสโรงเรียน (8 หลัก)</label><input type="text" disabled={isEditMode} placeholder="เช่น 31030019" value={formData.id} onChange={e => setFormData({...formData, id: e.target.value})} className={`w-full px-5 py-3 border-2 rounded-2xl outline-none focus:border-blue-500 font-bold ${isEditMode ? 'bg-slate-50 text-slate-400' : ''}`} required /></div>
                            <div><label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ชื่อโรงเรียน</label><input type="text" placeholder="ระบุชื่อโรงเรียนเต็ม" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-5 py-3 border-2 rounded-2xl outline-none focus:border-blue-500 font-bold" required /></div>
                            <div className="flex gap-4 pt-4"><button type="button" onClick={() => setShowForm(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-bold">ยกเลิก</button><button type="submit" disabled={isSavingSchool} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2">{isSavingSchool ? <Loader2 className="animate-spin" size={20}/> : <Save size={20}/>} บันทึกข้อมูล</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuperAdminDashboard;
