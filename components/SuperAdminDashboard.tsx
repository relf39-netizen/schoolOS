
import React, { useState, useEffect } from 'react';
import { School, Teacher, TeacherRole } from '../types';
import { 
    Building, Plus, LogOut, X, Trash2, Database, Upload, CheckCircle2, 
    Loader2, Zap, Info, ShieldCheck, Save, AlertCircle, Shield, 
    AlertTriangle, Search, Users, UserX, UserCheck, Power, PowerOff, 
    ChevronRight, ArrowLeft, Edit, UserCog, Mail, Phone, RefreshCw, HardDrive
} from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db, isConfigured as isFirebaseConfigured } from '../firebaseConfig';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';

interface SuperAdminDashboardProps {
    schools: School[];
    teachers: Teacher[];
    onCreateSchool: (school) => Promise<void>;
    onUpdateSchool: (school) => Promise<void>;
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
    const [targetSchoolId, setTargetSchoolId] = useState<string>('');
    const [isImporting, setIsImporting] = useState(false);
    const [importLog, setImportLog] = useState<string[]>([]);
    
    // School Detail View State
    const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

    const selectedSchool = schools.find(s => s.id === selectedSchoolId);
    const schoolTeachers = teachers.filter(t => t.schoolId === selectedSchoolId);

    const addLog = (msg: string) => { setImportLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]); };

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

    const handleMigrateFromFirebase = async () => {
        if (!isFirebaseConfigured || !db || !isSupabaseConfigured || !supabase) {
            alert("ระบบฐานข้อมูลไม่พร้อมเชื่อมต่อ");
            return;
        }
        if (!targetSchoolId) {
            alert("กรุณาเลือกโรงเรียนที่ต้องการนำเข้าข้อมูล");
            return;
        }

        setIsImporting(true);
        setImportLog([]);
        addLog("🚀 เริ่มต้นกระบวนการย้ายข้อมูล (Migration)...");

        const collections = [
            { id: 'teachers', table: 'profiles', label: 'บุคลากร' },
            { id: 'documents', table: 'documents', label: 'งานสารบรรณ' },
            { id: 'leave_requests', table: 'leave_requests', label: 'การลา' },
            { id: 'finance_transactions', table: 'finance_transactions', label: 'รายการเงิน' },
            { id: 'attendance', table: 'attendance', label: 'บันทึกเวลา' }
        ];

        try {
            for (const col of collections) {
                addLog(`กำลังดึงข้อมูล ${col.label}...`);
                const snap = await getDocs(query(collection(db, col.id)));
                const items: any[] = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.schoolId === targetSchoolId) {
                        items.push({ ...data, firebase_id: doc.id });
                    }
                });
                
                if (items.length > 0) {
                    addLog(`พบ ${items.length} รายการ. กำลังบันทึกลง SQL...`);
                    // Map items to match SQL structure if needed, then upsert
                    // Simple example of mapping:
                    const mappedItems = items.map(item => {
                        const base: any = { school_id: targetSchoolId };
                        // Add mapping logic based on col.table
                        return { ...item, ...base }; 
                    });

                    const { error } = await supabase.from(col.table).upsert(mappedItems);
                    if (error) throw error;
                    addLog(`✅ นำเข้า ${col.label} สำเร็จ`);
                } else {
                    addLog(`ℹ️ ไม่พบข้อมูล ${col.label} ในโรงเรียนนี้`);
                }
            }
            addLog("🎊 การย้ายข้อมูลเสร็จสมบูรณ์ 100%");
        } catch (err: any) {
            addLog(`🔴 ข้อผิดพลาด: ${err.message}`);
            alert("เกิดข้อผิดพลาดในการนำเข้าข้อมูล");
        } finally {
            setIsImporting(false);
        }
    };

    const handleToggleSchoolSuspension = async (school: School) => {
        if (!isSupabaseConfigured || !supabase) return;
        const newStatus = !school.isSuspended;
        if (!confirm(`ยืนยันการ${newStatus ? 'ระงับ' : 'เปิด'}การใช้งานโรงเรียน: ${school.name}?\n*เมื่อระงับ ครูทุกคนในโรงเรียนนี้จะเข้าระบบไม่ได้`)) return;
        
        const { error } = await supabase.from('schools').update({ is_suspended: newStatus }).eq('id', school.id);
        if (!error) {
            await onUpdateSchool({ ...school, isSuspended: newStatus });
        } else {
            alert("เกิดข้อผิดพลาด: " + error.message);
        }
    };

    const handleToggleTeacherSuspension = async (teacher: Teacher) => {
        if (!isSupabaseConfigured || !supabase) return;
        const newStatus = !teacher.isSuspended;
        if (!confirm(`ยืนยันการ${newStatus ? 'ระงับ' : 'เปิด'}การใช้งานของคุณ: ${teacher.name}?`)) return;

        const { error } = await supabase.from('profiles').update({ is_suspended: newStatus }).eq('id', teacher.id);
        if (!error) {
            await onUpdateTeacher({ ...teacher, isSuspended: newStatus });
        } else {
            alert("เกิดข้อผิดพลาด: " + error.message);
        }
    };

    const filteredSchools = schools.filter(s => 
        s.name.toLowerCase().includes(schoolSearch.toLowerCase()) || 
        s.id.includes(schoolSearch)
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sarabun text-slate-900">
            <header className="bg-slate-900 text-white p-4 shadow-lg sticky top-0 z-30">
                <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg shadow-blue-500/20">S</div>
                        <div>
                            <h1 className="text-lg font-bold leading-none">Super Admin</h1>
                            <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Master Management Center</span>
                        </div>
                    </div>
                    <div className="hidden md:flex bg-slate-800 p-1 rounded-xl">
                        <button onClick={() => { setActiveTab('SCHOOLS'); setSelectedSchoolId(null); }} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'SCHOOLS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>จัดการโรงเรียน</button>
                        <button onClick={() => setActiveTab('IMPORT')} className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'IMPORT' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Migration Hub</button>
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
                                <div 
                                    key={s.id} 
                                    onClick={() => setSelectedSchoolId(s.id)}
                                    className={`bg-white rounded-3xl border-2 group hover:shadow-2xl transition-all cursor-pointer overflow-hidden flex flex-col relative ${s.isSuspended ? 'border-red-100 bg-red-50/10 grayscale' : 'border-slate-100 hover:border-blue-200'}`}
                                >
                                    <div className="p-6 flex-1">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className={`p-4 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all ${s.isSuspended ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                <Building size={28}/>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] font-black font-mono bg-slate-100 p-1.5 rounded px-2 text-slate-500 block mb-1">{s.id}</span>
                                                {s.isSuspended && <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">Suspended</span>}
                                            </div>
                                        </div>
                                        <h3 className="font-black text-xl text-slate-800 group-hover:text-blue-600 truncate mb-1">{s.name}</h3>
                                        <p className="text-xs text-slate-400 font-bold flex items-center gap-1">
                                            <Users size={12}/> {teachers.filter(t => t.schoolId === s.id).length} บุคลากรในสังกัด
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 p-4 border-t flex justify-between items-center group-hover:bg-blue-50 transition-colors">
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setFormData(s); setIsEditMode(true); setShowForm(true); }}
                                                className="p-2 bg-white border rounded-xl text-slate-500 hover:text-blue-600 hover:shadow-md transition-all"
                                            >
                                                <Edit size={16}/>
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleToggleSchoolSuspension(s); }}
                                                className={`p-2 border rounded-xl transition-all hover:shadow-md ${s.isSuspended ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 hover:text-red-600'}`}
                                                title={s.isSuspended ? 'เปิดการใช้งาน' : 'ระงับการใช้งาน'}
                                            >
                                                {s.isSuspended ? <Power size={16}/> : <PowerOff size={16}/>}
                                            </button>
                                        </div>
                                        <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-600 translate-x-0 group-hover:translate-x-1 transition-all"/>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'IMPORT' && (
                    <div className="animate-fade-in space-y-6">
                        <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-xl overflow-hidden">
                            <div className="bg-slate-900 p-10 text-white">
                                <h2 className="text-3xl font-black mb-2 flex items-center gap-4">
                                    <RefreshCw className="text-blue-500" size={36}/>
                                    Migration Hub
                                </h2>
                                <p className="text-slate-400 font-medium">ย้ายข้อมูลจากระบบ Firebase สู่ฐานข้อมูล Cloud SQL (Supabase)</p>
                            </div>
                            <div className="p-10">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    <div className="space-y-6">
                                        <div className="bg-blue-50 p-6 rounded-[2rem] border-2 border-blue-100">
                                            <label className="block text-xs font-black text-blue-400 uppercase tracking-widest mb-3 ml-1">เลือกโรงเรียนเป้าหมายในการนำเข้า</label>
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

                                        <div className="bg-slate-50 p-6 rounded-[2rem] border-2 border-slate-100 space-y-4">
                                            <h4 className="font-black text-slate-800 flex items-center gap-2">
                                                <Info size={18} className="text-blue-600"/> คำแนะนำการย้ายข้อมูล
                                            </h4>
                                            <ul className="text-xs text-slate-500 font-bold space-y-2 list-disc pl-4">
                                                <li>ระบบจะดึงข้อมูล บุคลากร, เอกสาร, การลา, การเงิน และการลงเวลา</li>
                                                <li>ข้อมูลจะถูกคัดลอกเฉพาะของโรงเรียนที่ระบุรหัสไว้เท่านั้น</li>
                                                <li>กระบวนการนี้อาจใช้เวลาครู่หนึ่ง ขึ้นอยู่กับปริมาณข้อมูล</li>
                                                <li>กรุณาอย่าปิดหน้าต่างนี้จนกว่าระบบจะแจ้งว่าเสร็จสมบูรณ์</li>
                                            </ul>
                                        </div>

                                        <button 
                                            onClick={handleMigrateFromFirebase}
                                            disabled={isImporting || !targetSchoolId}
                                            className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-50 disabled:grayscale"
                                        >
                                            {isImporting ? <RefreshCw className="animate-spin" size={28}/> : <Zap size={28}/>}
                                            เริ่มต้นนำเข้าข้อมูลทันที
                                        </button>
                                    </div>

                                    <div className="flex flex-col space-y-4">
                                        <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest px-2">
                                            <HardDrive size={16}/> Migration Console Log
                                        </div>
                                        <div className="bg-slate-950 rounded-[2rem] p-8 shadow-2xl border-4 border-slate-900 flex-1 min-h-[400px]">
                                            <div className="font-mono text-[10px] space-y-1 overflow-y-auto max-h-[350px] custom-scrollbar text-emerald-400">
                                                {importLog.length === 0 ? (
                                                    <div className="h-full flex items-center justify-center text-slate-700 italic">No activity detected... Ready for migration.</div>
                                                ) : (
                                                    importLog.map((log, i) => (
                                                        <div key={i} className={log.includes('✅') ? 'text-emerald-400' : log.includes('🔴') ? 'text-rose-400 font-bold' : 'text-slate-400'}>
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
