import React, { useState, useEffect } from 'react';
import { Teacher, TeacherRole, SystemConfig, School } from '../types';
import { 
    Users, UserPlus, Edit, Trash2, CheckSquare, Square, Save, X, Settings, 
    Link as LinkIcon, UploadCloud, ImageIcon, 
    MapPin, Crosshair, RefreshCw, UserCheck, UserX, Send, Globe, Power, PowerOff,
    Cloud, Terminal, FileSignature, LayoutGrid, ArrowLeft, ShieldPlus, UserMinus
} from 'lucide-react';
import { supabase, isConfigured } from '../supabaseClient';
import { ACADEMIC_POSITIONS } from '../constants';

interface AdminUserManagementProps {
    teachers: Teacher[];
    onAddTeacher: (teacher: Teacher) => void;
    onEditTeacher: (teacher: Teacher) => void;
    onDeleteTeacher: (id: string) => void;
    currentSchool: School;
    onUpdateSchool: (school: School) => void;
}

const AVAILABLE_ROLES: { id: TeacherRole, label: string }[] = [
    { id: 'SYSTEM_ADMIN', label: 'ผู้ดูแลระบบ (Admin)' },
    { id: 'DIRECTOR', label: 'ผู้อำนวยการ (Director)' },
    { id: 'VICE_DIRECTOR', label: 'รองผู้อำนวยการ (Vice Director)' },
    { id: 'DOCUMENT_OFFICER', label: 'เจ้าหน้าที่ธุรการ' },
    { id: 'FINANCE_BUDGET', label: 'การเงิน (งบประมาณ)' },
    { id: 'FINANCE_NONBUDGET', label: 'การเงิน (นอกงบประมาณ)' },
    { id: 'PLAN_OFFICER', label: 'เจ้าหน้าที่งานแผน' },
    { id: 'TEACHER', label: 'ครูผู้สอน' },
];

const AdminUserManagement: React.FC<AdminUserManagementProps> = ({ teachers, onAddTeacher, onEditTeacher, onDeleteTeacher, currentSchool, onUpdateSchool }) => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'SETTINGS' | 'SCHOOL_SETTINGS' | 'CLOUD_SETUP' | 'USER_FORM'>('USERS');
    const [editForm, setEditForm] = useState<Partial<Teacher>>({});
    const [isAdding, setIsAdding] = useState(false);
    const [config, setConfig] = useState<SystemConfig>({ 
        driveFolderId: '', scriptUrl: '', schoolName: '', 
        directorSignatureBase64: '', directorSignatureScale: 1, directorSignatureYOffset: 0, 
        schoolLogoBase64: '', officialGarudaBase64: '', telegramBotToken: '', appBaseUrl: '' 
    });
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    const [schoolForm, setSchoolForm] = useState<Partial<School>>({});
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [copied, setCopied] = useState(false);

    const gasCode = `/**
 * SchoolOS - Cloud Storage & Private Proxy v8.2 (Master Stable)
 * แก้ปัญหา Failed to Fetch และ CORS สำหรับการจัดการ PDF
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000); 
    if (!e.postData || !e.postData.contents) { throw new Error("No data received"); }
    var data = JSON.parse(e.postData.contents);
    
    // --- ACTION: READ ---
    if (data.action === 'read') {
       if (!data.fileId) throw new Error("Missing fileId");
       var file = DriveApp.getFileById(data.fileId);
       var blob = file.getBlob();
       return ContentService.createTextOutput(JSON.stringify({
         'status': 'success',
         'fileData': Utilities.base64Encode(blob.getBytes()),
         'mimeType': blob.getContentType(),
         'fileName': file.getName()
       })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- ACTION: UPLOAD ---
    var folderId = data.folderId;
    var base64Data = data.fileData;
    var fileName = (data.fileName || "file_" + new Date().getTime()).replace(/[^a-zA-Z0-9.\\-_ก-ฮะ-าำิ-ูเ-์ ]/g, "_");
    var mimeType = data.mimeType || "application/octet-stream";
    
    if (!base64Data || !folderId) { throw new Error("Missing fileData or folderId"); }
    
    var cleanBase64 = base64Data.toString().replace(/[\\s\\n\\r]/g, "");
    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return ContentService.createTextOutput(JSON.stringify({ 
      'status': 'success', 
      'url': file.getUrl(), 
      'id': file.getId(),
      'viewUrl': "https://drive.google.com/uc?export=view&id=" + file.getId() 
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ 
      'status': 'error', 
      'message': error.toString() 
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;

    useEffect(() => { if (currentSchool) setSchoolForm(currentSchool); }, [currentSchool]);

    useEffect(() => {
        const fetchConfig = async () => {
             if (isConfigured && supabase && currentSchool?.id) {
                 const { data } = await supabase.from('school_configs').select('*').eq('school_id', currentSchool.id).maybeSingle();
                 if (data) {
                     setConfig({
                         driveFolderId: data.drive_folder_id || '', 
                         scriptUrl: data.script_url || '', 
                         schoolName: currentSchool.name,
                         directorSignatureBase64: data.director_signature_base_64 || '', 
                         directorSignatureScale: data.director_signature_scale || 1,
                         directorSignatureYOffset: data.director_signature_y_offset || 0, 
                         schoolLogoBase64: currentSchool.logoBase64 || '',
                         officialGarudaBase64: data.official_garuda_base_64 || '', 
                         telegramBotToken: data.telegram_bot_token || '',
                         appBaseUrl: data.app_base_url || ''
                     });
                 }
             }
        };
        fetchConfig();
    }, [currentSchool?.id]);

    const resizeImage = (file: File, maxWidth: number = 300): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width, height = img.height;
                    if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) { ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/png', 0.8)); }
                    else reject(new Error("Canvas error"));
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: keyof SystemConfig) => {
        if (e.target.files?.[0]) {
            try { 
                const base64 = await resizeImage(e.target.files[0], 400); 
                setConfig(prev => ({ ...prev, [field]: base64 })); 
            }
            catch (error) { alert("Error processing image"); }
        }
    };

    const handleToggleSuspended = async (teacher: Teacher) => {
        if (!isConfigured || !supabase) return;
        const newStatus = !teacher.isSuspended;
        if (!confirm(`ยืนยันการ${newStatus ? 'ระงับ' : 'เปิด'}การใช้งานของ: ${teacher.name}?\n*เมื่อระงับ ครูท่านนี้จะเข้าใช้งานระบบไม่ได้ชั่วคราว`)) return;
        
        const { error } = await supabase.from('profiles').update({ is_suspended: newStatus }).eq('id', teacher.id);
        if (!error) {
            onEditTeacher({ ...teacher, isSuspended: newStatus });
        } else {
            alert("ผิดพลาด: " + error.message);
        }
    };

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.id || !editForm.name) {
            alert("กรุณาระบุข้อมูลให้ครบถ้วน");
            return;
        }
        const tData = editForm as Teacher;
        setIsLoadingConfig(true);
        if (isConfigured && supabase) {
            const payload = {
                id: tData.id, 
                school_id: currentSchool.id, 
                name: tData.name, 
                password: tData.password || '123456',
                position: tData.position, 
                roles: tData.roles, 
                signature_base_64: tData.signatureBase64,
                telegram_chat_id: tData.telegramChatId, 
                is_suspended: tData.isSuspended || false
            };
            const { error } = await supabase.from('profiles').upsert([payload]);
            if (error) { 
                alert("บันทึกไม่สำเร็จ: " + error.message); 
                setIsLoadingConfig(false);
                return; 
            }
        }
        if (isAdding) onAddTeacher(tData); else onEditTeacher(tData);
        setIsLoadingConfig(false);
        setIsAdding(false); 
        setActiveTab('USERS'); 
        setEditForm({});
    };

    const handleSaveConfig = async () => {
        if (!currentSchool?.id) return;
        setIsLoadingConfig(true);
        const payload = {
            school_id: currentSchool.id, 
            drive_folder_id: config.driveFolderId?.trim(), 
            script_url: config.scriptUrl?.trim(),
            telegram_bot_token: config.telegramBotToken?.trim(), 
            app_base_url: config.appBaseUrl?.trim(),
            official_garuda_base_64: config.officialGarudaBase64, 
            director_signature_base_64: config.directorSignatureBase64,
            director_signature_scale: config.directorSignatureScale, 
            director_signature_y_offset: config.directorSignatureYOffset
        };
        try {
            if (isConfigured && supabase) {
                if (config.schoolLogoBase64) {
                    await supabase.from('schools').update({ logo_base_64: config.schoolLogoBase64 }).eq('id', currentSchool.id);
                    onUpdateSchool({ ...currentSchool, logoBase64: config.schoolLogoBase64 });
                }
                const { error } = await supabase.from('school_configs').upsert([payload]);
                if (error) throw error;
                alert("บันทึกการตั้งค่าทั้งหมดสำเร็จ");
            }
        } catch (error: any) { alert("บันทึกล้มเหลว: " + error.message); }
        finally { setIsLoadingConfig(false); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("ยืนยันการลบข้อมูลบุคลากรรายนี้? การลบจะมีผลทันทีและไม่สามารถกู้คืนได้")) return;
        if (isConfigured && supabase) {
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) { alert("ลบไม่สำเร็จ: " + error.message); return; }
        }
        onDeleteTeacher(id);
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-slate-800 text-white rounded-2xl shadow-xl shadow-slate-200">
                        <Settings size={24}/>
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">ผู้ดูแลระบบโรงเรียน</h2>
                        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{currentSchool.name}</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto w-full md:w-auto border shadow-inner">
                    <button onClick={() => setActiveTab('USERS')} className={`px-5 py-2 rounded-lg text-sm font-black shrink-0 transition-all ${activeTab === 'USERS' || activeTab === 'USER_FORM' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>บุคลากร</button>
                    <button onClick={() => setActiveTab('SCHOOL_SETTINGS')} className={`px-5 py-2 rounded-lg text-sm font-black shrink-0 transition-all ${activeTab === 'SCHOOL_SETTINGS' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>พิกัดโรงเรียน</button>
                    <button onClick={() => setActiveTab('SETTINGS')} className={`px-5 py-2 rounded-lg text-sm font-black shrink-0 transition-all ${activeTab === 'SETTINGS' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>ตั้งค่าระบบ</button>
                    <button onClick={() => setActiveTab('CLOUD_SETUP')} className={`px-5 py-2 rounded-lg text-sm font-black shrink-0 transition-all ${activeTab === 'CLOUD_SETUP' ? 'bg-white text-orange-600 shadow-md' : 'text-slate-500 hover:text-slate-800'}`}>คลาวด์ (Drive)</button>
                </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-8 min-h-[600px]">
                {activeTab === 'USERS' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h3 className="font-black text-2xl flex items-center gap-3 text-slate-800">
                                <Users className="text-blue-600" size={28}/> 
                                รายชื่อบุคลากร ({teachers.length})
                            </h3>
                            <button onClick={() => { setIsAdding(true); setEditForm({id:'', name:'', position:'ครู', roles:['TEACHER'], password:'123456', schoolId: currentSchool.id}); setActiveTab('USER_FORM'); }} className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700 font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-100 transition-all active:scale-95">
                                <UserPlus size={20}/> เพิ่มบุคลากรใหม่
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto rounded-[1.5rem] border border-slate-100">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-400 font-black text-[10px] uppercase tracking-widest border-b">
                                    <tr>
                                        <th className="p-5">บุคลากร</th>
                                        <th className="p-5">ตำแหน่ง / สิทธิ์</th>
                                        <th className="p-5 text-center">สถานะ</th>
                                        <th className="p-5 text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {teachers.map(t => (
                                        <tr key={t.id} className={`group hover:bg-slate-50 transition-colors ${t.isSuspended ? 'bg-red-50/20 opacity-75' : ''}`}>
                                            <td className="p-5">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shadow-sm ${t.isSuspended ? 'bg-slate-200 text-slate-400' : 'bg-blue-100 text-blue-600'}`}>
                                                        {t.name[0]}
                                                    </div>
                                                    <div>
                                                        <div className="font-black text-slate-700 group-hover:text-blue-600 transition-colors">{t.name}</div>
                                                        <div className="text-[10px] text-slate-400 font-bold font-mono uppercase tracking-tighter">ID: {t.id}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-5">
                                                <div className="font-bold text-slate-600 text-sm mb-1">{t.position}</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {t.roles.map(r => <span key={r} className="px-2 py-0.5 bg-white text-slate-500 rounded-md text-[9px] font-black border border-slate-200 uppercase">{AVAILABLE_ROLES.find(ar=>ar.id===r)?.label || r}</span>)}
                                                </div>
                                            </td>
                                            <td className="p-5 text-center">
                                                <button 
                                                    onClick={() => handleToggleSuspended(t)}
                                                    className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shadow-sm ${t.isSuspended ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-emerald-100 text-emerald-700 hover:bg-red-50 hover:text-red-600'}`}
                                                >
                                                    {t.isSuspended ? 'Suspended' : 'Normal'}
                                                </button>
                                            </td>
                                            <td className="p-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => { setEditForm({...t}); setIsAdding(false); setActiveTab('USER_FORM'); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all"><Edit size={18}/></button>
                                                    <button onClick={() => handleDelete(t.id)} className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'USER_FORM' && (
                    <div className="animate-slide-up space-y-8 max-w-4xl mx-auto">
                        <div className="flex justify-between items-center border-b pb-6">
                            <div>
                                <h3 className="text-3xl font-black text-slate-800">{isAdding ? 'ลงทะเบียนบุคลากรใหม่' : 'แก้ไขข้อมูลบุคลากร'}</h3>
                                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mt-1">Management View - {currentSchool.name}</p>
                            </div>
                            <button onClick={() => setActiveTab('USERS')} className="p-4 bg-slate-100 hover:bg-slate-200 rounded-2xl text-slate-500 font-bold flex items-center gap-2 transition-all">
                                <ArrowLeft size={20}/> ย้อนกลับ
                            </button>
                        </div>

                        <form onSubmit={handleUserSubmit} className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-100 shadow-inner">
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">เลขบัตรประชาชน (ใช้สำหรับ Login)</label>
                                    <input type="text" required disabled={!isAdding} value={editForm.id || ''} onChange={e => setEditForm({...editForm, id: e.target.value})} className="w-full px-6 py-4 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-black text-xl disabled:bg-slate-200 disabled:text-slate-500 shadow-sm" placeholder="ระบุเลข 13 หลัก"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">ชื่อ - นามสกุล</label>
                                    <input type="text" required value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-6 py-4 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-black text-xl shadow-sm"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">ตำแหน่งทางราชการ</label>
                                    <select value={editForm.position || ''} onChange={e => setEditForm({...editForm, position: e.target.value})} className="w-full px-6 py-4 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold bg-white shadow-sm">
                                        {ACADEMIC_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">รหัสผ่านสำหรับเข้าใช้งาน</label>
                                    <input type="text" value={editForm.password || ''} onChange={e => setEditForm({...editForm, password: e.target.value})} className="w-full px-6 py-4 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-black text-xl font-mono shadow-sm" placeholder="123456"/>
                                </div>
                                <div className="md:col-span-2 space-y-1">
                                    <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Telegram Chat ID (ส่วนตัว สำหรับแจ้งเตือน)</label>
                                    <input type="text" value={editForm.telegramChatId || ''} onChange={e => setEditForm({...editForm, telegramChatId: e.target.value})} className="w-full px-6 py-4 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-mono text-sm shadow-sm" placeholder="เช่น 123456789"/>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest ml-1">กำหนดสิทธิ์การเข้าใช้งานฟังก์ชันต่างๆ (Roles)</label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-white p-8 rounded-[2.5rem] border-2 border-slate-50 shadow-sm">
                                    {AVAILABLE_ROLES.map(role => (
                                        <label key={role.id} className={`flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border-2 ${editForm.roles?.includes(role.id) ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-100' : 'bg-slate-50 text-slate-500 border-slate-100 hover:border-blue-200'}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={editForm.roles?.includes(role.id)} 
                                                onChange={() => {
                                                    const roles = editForm.roles || [];
                                                    setEditForm({...editForm, roles: roles.includes(role.id) ? roles.filter(r => r !== role.id) : [...roles, role.id]});
                                                }}
                                                className="hidden"
                                            />
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center border-2 ${editForm.roles?.includes(role.id) ? 'bg-white text-blue-600 border-white' : 'bg-white border-slate-200'}`}>
                                                {editForm.roles?.includes(role.id) && <CheckSquare size={16}/>}
                                            </div>
                                            <span className="text-[11px] font-black uppercase tracking-tight leading-none">{role.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 pt-10 border-t">
                                <button type="button" onClick={() => setActiveTab('USERS')} className="flex-1 py-6 bg-slate-100 text-slate-600 rounded-[2rem] font-black hover:bg-slate-200 transition-all uppercase tracking-widest text-lg">ยกเลิกและย้อนกลับ</button>
                                <button type="submit" disabled={isLoadingConfig} className="flex-[2] py-6 bg-blue-600 text-white rounded-[2rem] font-black shadow-2xl shadow-blue-100 flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95 uppercase tracking-widest text-xl">
                                    {isLoadingConfig ? <RefreshCw className="animate-spin" size={28}/> : <Save size={28}/>}
                                    ยืนยันบันทึกข้อมูลบุคลากร
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {activeTab === 'SCHOOL_SETTINGS' && (
                    <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
                        <div className="flex items-center gap-3 border-b pb-4"><MapPin className="text-orange-500" size={28}/><h3 className="font-black text-2xl text-slate-800">ขอบเขตพื้นที่ลงเวลา (GPS)</h3></div>
                        <form onSubmit={(e) => { e.preventDefault(); onUpdateSchool(schoolForm as School); alert("บันทึกพิกัดสำเร็จ"); }} className="space-y-6">
                             <div className="bg-orange-50 p-8 rounded-[2rem] border-2 border-orange-100 space-y-6 shadow-inner">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-2"><label className="block text-xs font-black text-orange-700 uppercase tracking-widest ml-1">ละติจูด (Lat)</label><input type="number" step="any" value={schoolForm.lat || ''} onChange={e => setSchoolForm({...schoolForm, lat: parseFloat(e.target.value)})} className="w-full px-5 py-3 border-2 border-orange-200 rounded-2xl outline-none focus:border-orange-500 font-bold bg-white"/></div>
                                    <div className="space-y-2"><label className="block text-xs font-black text-orange-700 uppercase tracking-widest ml-1">ลองจิจูด (Lng)</label><input type="number" step="any" value={schoolForm.lng || ''} onChange={e => setSchoolForm({...schoolForm, lng: parseFloat(e.target.value)})} className="w-full px-5 py-3 border-2 border-orange-200 rounded-2xl outline-none focus:border-orange-500 font-bold bg-white"/></div>
                                    <div className="flex items-end"><button type="button" onClick={() => { setIsGettingLocation(true); navigator.geolocation.getCurrentPosition(p => { setSchoolForm({...schoolForm, lat: p.coords.latitude, lng: p.coords.longitude}); setIsGettingLocation(false); }, () => { alert("กรุณาเปิด GPS"); setIsGettingLocation(false); }); }} disabled={isGettingLocation} className="w-full py-4 bg-orange-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all active:scale-95">{isGettingLocation ? <RefreshCw className="animate-spin"/> : <Crosshair size={20}/>} ดึงพิกัดปัจจุบัน</button></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2"><label className="block text-xs font-black text-slate-500 uppercase tracking-widest ml-1">รัศมีที่อนุญาต (เมตร)</label><input type="number" value={schoolForm.radius || 500} onChange={e => setSchoolForm({...schoolForm, radius: parseInt(e.target.value)})} className="w-full px-5 py-3 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold bg-white" placeholder="ค่าเริ่มต้น 500"/></div>
                                    <div className="space-y-2"><label className="block text-xs font-black text-slate-500 uppercase tracking-widest ml-1">เวลาที่ถือว่ามาสาย (HH:MM)</label><input type="time" value={schoolForm.lateTimeThreshold || '08:30'} onChange={e => setSchoolForm({...schoolForm, lateTimeThreshold: e.target.value})} className="w-full px-5 py-3 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 font-bold bg-white"/></div>
                                </div>
                             </div>
                             <div className="flex justify-end"><button type="submit" className="bg-blue-600 text-white px-12 py-5 rounded-[2rem] font-black shadow-2xl shadow-blue-100 flex items-center gap-2 hover:bg-blue-700 transition-all active:scale-95 uppercase tracking-widest text-lg"><Save size={24}/> บันทึกการตั้งค่าพิกัด</button></div>
                        </form>
                    </div>
                )}

                {activeTab === 'SETTINGS' && (
                    <div className="space-y-10 animate-fade-in max-w-5xl mx-auto">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            <div className="space-y-6">
                                <div className="bg-indigo-50 p-8 rounded-[2.5rem] border-2 border-indigo-100 shadow-sm space-y-6 shadow-inner">
                                    <h4 className="font-black text-indigo-900 text-xl flex items-center gap-3"><Send size={24}/> การแจ้งเตือน & URL</h4>
                                    <div className="space-y-4">
                                        <div><label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 ml-1">Telegram Bot Token</label><input type="text" value={config.telegramBotToken || ''} onChange={e => setConfig({...config, telegramBotToken: e.target.value})} className="w-full px-5 py-3 border-2 border-white rounded-2xl font-mono text-xs focus:border-indigo-500 outline-none bg-white/60 shadow-inner" placeholder="0000000000:AA..."/></div>
                                        <div><label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5 ml-1">App Base URL</label><input type="text" value={config.appBaseUrl || ''} onChange={e => setConfig({...config, appBaseUrl: e.target.value})} className="w-full px-5 py-3 border-2 border-white rounded-2xl font-mono text-xs focus:border-indigo-500 outline-none bg-white/60 shadow-inner" placeholder="https://your-app.vercel.app"/></div>
                                    </div>
                                    <div className="p-4 bg-white/80 rounded-xl border border-indigo-100 text-[10px] text-indigo-800 leading-relaxed font-bold">
                                        💡 แจ้งเตือนงานสารบรรณและการลา จะถูกส่งไปที่ Telegram ผ่าน Token ชุดนี้
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 space-y-6 shadow-inner">
                                <h4 className="font-black text-slate-800 text-xl flex items-center gap-3"><ImageIcon size={24}/> ตราโรงเรียน & เอกสาร</h4>
                                <div className="flex flex-col sm:flex-row items-center gap-8">
                                    <div className="w-40 h-40 border-4 border-white rounded-[2rem] flex items-center justify-center bg-white overflow-hidden shrink-0 shadow-xl relative group">
                                        {config.schoolLogoBase64 ? <img src={config.schoolLogoBase64} className="w-full h-full object-contain p-2"/> : <ImageIcon className="text-slate-200" size={64}/>}
                                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"><UploadCloud className="text-white" size={32}/><input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'schoolLogoBase64')} className="hidden"/></label>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <h5 className="font-black text-slate-700 uppercase text-xs tracking-widest">Logo โรงเรียน</h5>
                                        <p className="text-xs text-slate-500 leading-relaxed font-bold">ใช้สำหรับหัวจดหมาย รายงาน และสลิปการเงิน</p>
                                        <p className="text-blue-600 text-xs font-black hover:underline uppercase tracking-tighter cursor-pointer" onClick={() => setConfig({...config, schoolLogoBase64: ''})}>Remove Logo</p>
                                    </div>
                                </div>
                                <hr className="border-slate-200"/>
                                <div className="flex flex-col sm:flex-row items-center gap-8">
                                    <div className="w-40 h-40 border-4 border-white rounded-[2rem] flex items-center justify-center bg-white overflow-hidden shrink-0 shadow-xl relative group">
                                        {config.officialGarudaBase64 ? <img src={config.officialGarudaBase64} className="w-full h-full object-contain p-2"/> : <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Emblem_of_the_Ministry_of_Education_of_Thailand.svg/1200px-Emblem_of_the_Ministry_of_Education_of_Thailand.svg.png" className="w-full h-full object-contain p-2 opacity-20"/>}
                                        <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer"><UploadCloud className="text-white" size={32}/><input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'officialGarudaBase64')} className="hidden"/></label>
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <h5 className="font-black text-slate-700 uppercase text-xs tracking-widest">ตราครุฑมาตรฐาน</h5>
                                        <p className="text-xs text-slate-500 leading-relaxed font-bold">ตราครุฑสำหรับหนังสือราชการ (เวียน/คำสั่ง)</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-purple-50 rounded-[3rem] border-2 border-purple-100 p-10 space-y-8 shadow-inner">
                            <h4 className="font-black text-purple-900 text-2xl flex items-center gap-4 border-b border-purple-200 pb-6">
                                <FileSignature className="text-purple-600" size={32}/> 
                                ลายเซ็นผู้อำนวยการ (Digital Signature)
                            </h4>
                            <div className="flex flex-col xl:flex-row gap-12">
                                <div className="w-full xl:w-96 h-48 border-4 border-dashed border-purple-200 rounded-[2.5rem] flex items-center justify-center bg-white/50 overflow-hidden shadow-inner relative">
                                    {config.directorSignatureBase64 ? (
                                        <img 
                                            src={config.directorSignatureBase64} 
                                            className="object-contain" 
                                            style={{ transform: `scale(${config.directorSignatureScale}) translateY(${config.directorSignatureYOffset}px)` }}
                                        />
                                    ) : (
                                        <div className="text-center space-y-2"><FileSignature className="mx-auto text-purple-200" size={48}/><p className="text-xs font-black text-purple-300 uppercase tracking-widest">No Signature</p></div>
                                    )}
                                </div>
                                <div className="flex-1 space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-purple-100 space-y-4 shadow-inner">
                                            <div className="flex justify-between items-center"><label className="text-[11px] font-black text-purple-400 uppercase tracking-widest">ขนาด (Scale)</label><span className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-1 rounded-lg">{config.directorSignatureScale}x</span></div>
                                            <input type="range" min="0.5" max="2" step="0.1" value={config.directorSignatureScale} onChange={e => setConfig({...config, directorSignatureScale: parseFloat(e.target.value)})} className="w-full accent-purple-600 cursor-pointer"/>
                                        </div>
                                        <div className="bg-white p-6 rounded-3xl shadow-sm border border-purple-100 space-y-4 shadow-inner">
                                            <div className="flex justify-between items-center"><label className="text-[11px] font-black text-purple-400 uppercase tracking-widest">แนวตั้ง (Offset)</label><span className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-1 rounded-lg">{config.directorSignatureYOffset}px</span></div>
                                            <input type="range" min="-50" max="50" step="1" value={config.directorSignatureYOffset} onChange={e => setConfig({...config, directorSignatureYOffset: parseInt(e.target.value)})} className="w-full accent-purple-600 cursor-pointer"/>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <label className="flex-1 cursor-pointer bg-purple-600 text-white py-5 rounded-2xl font-black shadow-xl shadow-purple-100 flex items-center justify-center gap-3 hover:bg-purple-700 transition-all active:scale-95 uppercase tracking-widest text-sm">
                                            <UploadCloud size={20}/> เลือกไฟล์ภาพลายเซ็น
                                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'directorSignatureBase64')} className="hidden"/>
                                        </label>
                                        <button onClick={() => setConfig({...config, directorSignatureBase64: ''})} className="px-8 bg-white text-red-500 rounded-2xl font-black border-2 border-red-50 hover:bg-red-50 transition-all uppercase tracking-widest text-xs">Clear</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-10 border-t sticky bottom-4 z-10">
                            <button onClick={handleSaveConfig} disabled={isLoadingConfig} className="bg-slate-900 text-white px-16 py-6 rounded-[2rem] font-black shadow-2xl shadow-slate-300 flex items-center gap-4 disabled:opacity-50 hover:bg-black transition-all active:scale-95 uppercase tracking-widest text-xl">
                                {isLoadingConfig ? <RefreshCw className="animate-spin" size={28}/> : <Save size={28}/>} 
                                ยืนยันบันทึกการตั้งค่าระบบ
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'CLOUD_SETUP' && (
                    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
                        <div className="bg-orange-50 border-2 border-orange-100 rounded-[2.5rem] p-10 space-y-8 relative overflow-hidden shadow-inner">
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-orange-100 rounded-full blur-3xl opacity-50"></div>
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div>
                                    <h3 className="text-3xl font-black text-orange-900 flex items-center gap-4">
                                        <Cloud className="text-orange-600" size={36}/>
                                        Google Drive API Setup (v8.2 Master)
                                    </h3>
                                    <p className="text-orange-700 font-bold mt-2">เชื่อมต่อพื้นที่เก็บข้อมูลถาวรสำหรับอัปโหลดไฟล์ และ Private Proxy เพื่อแก้ปัญหา Failed to fetch</p>
                                </div>
                                <div className="bg-orange-600 text-white px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest animate-pulse shadow-lg">Required for Reliability</div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                                <div className="lg:col-span-5 space-y-6">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black text-orange-800 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            <Globe size={14}/> GAS Web App URL
                                        </label>
                                        <input type="text" value={config.scriptUrl} onChange={e => setConfig({...config, scriptUrl: e.target.value})} className="w-full px-6 py-4 border-2 border-white rounded-2xl font-mono text-xs focus:border-orange-500 outline-none bg-white shadow-sm" placeholder="https://script.google.com/macros/s/.../exec"/>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black text-orange-800 uppercase tracking-widest ml-1 flex items-center gap-2">
                                            <LinkIcon size={14}/> Drive Folder ID
                                        </label>
                                        <input type="text" value={config.driveFolderId} onChange={e => setConfig({...config, driveFolderId: e.target.value})} className="w-full px-6 py-4 border-2 border-white rounded-2xl font-mono text-xs focus:border-orange-500 outline-none bg-white shadow-sm" placeholder="1w2x3y4z..."/>
                                    </div>
                                    <div className="bg-white/80 p-6 rounded-3xl border border-orange-100 shadow-inner">
                                        <h4 className="font-black text-orange-900 text-sm mb-3 flex items-center gap-2">📌 ขั้นตอนการแก้ปัญหา Failed to fetch</h4>
                                        <ol className="text-[11px] text-orange-800 font-bold space-y-3 list-decimal pl-4">
                                            <li>คัดลอกโค้ด <span className="bg-slate-800 text-emerald-400 px-2 py-0.5 rounded font-mono">GAS Bridge v8.2</span> ฝั่งขวา</li>
                                            <li>เปิดโปรเจกต์เดิมใน <a href="https://script.google.com" target="_blank" className="underline text-orange-600">Google Apps Script</a></li>
                                            <li>วางโค้ดที่คัดลอกทับของเดิมและกด <span className="bg-orange-600 text-white px-1.5 py-0.5 rounded">Deploy {"\u2192"} New Deployment</span></li>
                                            <li>เลือกประเภท <span className="font-black">Web App</span> และตั้งค่า Access: <span className="underline">Anyone</span></li>
                                            <li>คัดลอก URL ใหม่ที่ได้มาอัปเดตในช่องด้านบนนี้</li>
                                        </ol>
                                    </div>
                                </div>
                                <div className="lg:col-span-7 flex flex-col space-y-4">
                                    <div className="flex justify-between items-end">
                                        <div className="flex items-center gap-2 font-black text-orange-900 text-xs uppercase tracking-widest px-2">
                                            <Terminal size={16}/> GAS Bridge Code (v8.2 Master)
                                        </div>
                                        <button onClick={() => { navigator.clipboard.writeText(gasCode); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all shadow-md active:scale-95 ${copied ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-white hover:bg-black'}`}>
                                            {copied ? 'Copied!' : 'Click to Copy'}
                                        </button>
                                    </div>
                                    <div className="bg-slate-900 rounded-[2rem] p-8 shadow-2xl flex-1 border-4 border-slate-800">
                                        <pre className="text-[10px] text-emerald-400 font-mono overflow-auto max-h-[350px] leading-relaxed custom-scrollbar shadow-inner">
                                            {gasCode}
                                        </pre>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-10 border-t">
                                <button onClick={handleSaveConfig} disabled={isLoadingConfig} className="bg-orange-600 text-white px-16 py-6 rounded-[2rem] font-black shadow-2xl shadow-orange-200 flex items-center gap-4 disabled:opacity-50 hover:bg-orange-700 transition-all active:scale-95 uppercase tracking-widest text-xl">
                                    {isLoadingConfig ? <RefreshCw className="animate-spin" size={28}/> : <Save size={28}/>} 
                                    บันทึกการตั้งค่าระบบคลาวด์
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <style>{`.custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }`}</style>
        </div>
    );
};

export default AdminUserManagement;