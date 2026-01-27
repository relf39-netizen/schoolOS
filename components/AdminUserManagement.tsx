import { 
    Users, UserPlus, Edit, Trash2, CheckSquare, Square, Save, X, Settings, 
    Link as LinkIcon, AlertCircle, MapPin, Target, Crosshair, Clock, 
    RefreshCw, UserCheck, ShieldCheck, ShieldAlert, LogOut, 
    Send, Globe, Copy, Check, Cloud, Building2, Loader, 
    CheckCircle, HardDrive, Smartphone, Zap, Eye, EyeOff,
    ChevronRight, Info, Search, LayoutGrid, FileText,
    ChevronLeft, ChevronsLeft, ChevronsRight, Shield, UserCog,
    FileCheck, BookOpen, Fingerprint, Key, Activity, BarChart3,
    Lock, Mail, Bell, ZapOff, ChevronDown
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';
import { Teacher, TeacherRole, SystemConfig, School } from '../types';
import { ACADEMIC_POSITIONS } from '../constants';

interface AdminUserManagementProps {
    teachers: Teacher[];
    onAddTeacher: (teacher: Teacher) => Promise<void>;
    onEditTeacher: (teacher: Teacher) => Promise<void>;
    onDeleteTeacher: (id: string) => void;
    currentSchool: School;
    onUpdateSchool: (school: School) => void;
}

const AVAILABLE_ROLES: { id: TeacherRole, label: string }[] = [
    { id: 'SYSTEM_ADMIN', label: 'ผู้ดูแลระบบ (Admin)' },
    { id: 'DIRECTOR', label: 'ผู้อำนวยการ (Director)' },
    { id: 'VICE_DIRECTOR', label: 'รองผู้อำนวยการ (Vice)' },
    { id: 'DOCUMENT_OFFICER', label: 'เจ้าหน้าที่ธุรการ' },
    { id: 'ACADEMIC_OFFICER', label: 'เจ้าหน้าที่งานวิชาการ' },
    { id: 'FINANCE_BUDGET', label: 'การเงิน (งบประมาณ)' },
    { id: 'FINANCE_NONBUDGET', label: 'การเงิน (นอกงบประมาณ)' },
    { id: 'FINANCE_COOP', label: 'การเงิน (สหกรณ์)' },
    { id: 'PLAN_OFFICER', label: 'เจ้าหน้าที่งานแผน' },
    { id: 'TEACHER', label: 'ครูผู้สอน' },
];

const AdminUserManagement: React.FC<AdminUserManagementProps> = ({ 
    teachers, 
    onAddTeacher, 
    onEditTeacher, 
    onDeleteTeacher, 
    currentSchool, 
    onUpdateSchool 
}) => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'PENDING' | 'SCHOOL_SETTINGS' | 'SETTINGS' | 'CLOUD_SETUP'>('USERS');
    const [copied, setCopied] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Teacher>>({});
    const [isAdding, setIsAdding] = useState(false);
    const [isSubmittingUser, setIsSubmittingUser] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    const [showPasswordInModal, setShowPasswordInModal] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    const approvedTeachers = teachers.filter(t => 
        t.isApproved !== false && 
        (t.name.includes(userSearch) || t.id.includes(userSearch))
    );
    const pendingTeachers = teachers.filter(t => t.isApproved === false);

    const [config, setConfig] = useState<SystemConfig>({ 
        driveFolderId: '', 
        scriptUrl: '', 
        schoolName: '', 
        officerDepartment: '', 
        directorSignatureBase64: '', 
        directorSignatureScale: 1, 
        directorSignatureYOffset: 0, 
        schoolLogoBase64: '', 
        officialGarudaBase64: '', 
        telegramBotToken: '', 
        telegramBotUsername: '', 
        appBaseUrl: '' 
    });
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    
    const [schoolForm, setSchoolForm] = useState<Partial<School>>({});
    const [isGettingLocation, setIsGettingLocation] = useState(false);

    const gasCode = `/**
 * SchoolOS - Cloud Storage & Telegram Tracking Bridge v12.6
 */
var SUPABASE_URL = "วาง URL Supabase ที่นี่";
var SUPABASE_KEY = "วาง Anon Key ที่นี่";

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'ack') {
    var docId = e.parameter.docId;
    var userId = e.parameter.userId;
    var targetFile = decodeURIComponent(e.parameter.target);
    var appBaseUrl = decodeURIComponent(e.parameter.appUrl || "");
    var finalAppLink = appBaseUrl + "?view=DOCUMENTS&id=" + docId + "&file=" + encodeURIComponent(targetFile);
    
    // UI หน้าจอสำหรับแจ้งเตือนการกดรับทราบเอกสาร
    var html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1'>" +
               "<title>SchoolOS Tracking</title></head><body style='font-family:sans-serif; text-align:center; padding:0; margin:0; background:#f8fafc; color:#1e293b; display:flex; align-items:center; justify-content:center; min-height:100vh;'>" +
               "<div style='background:white; padding:50px 20px; border-radius:40px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.1); max-width:450px; width:90%; border-top:12px solid #2563eb;'>" +
               "<div style='font-size:75px; margin-bottom:20px;'>📄</div>" +
               "<h2 style='color:#1e293b; margin-bottom:15px; font-weight:800; font-size:24px;'>มีหนังสือราชการถึงท่าน</h2>" +
               "<p style='color:#64748b; font-size:16px; line-height:1.6; margin-bottom:40px;'>กรุณากดปุ่มด้านล่างเพื่อเปิดอ่านเอกสาร <br>และบันทึกสถานะการรับทราบในระบบ SchoolOS</p>" +
               "<a href='" + finalAppLink + "' style='display:block; background:#2563eb; color:white; font-weight:bold; text-decoration:none; padding:20px; border-radius:20px; font-size:18px; box-shadow:0 10px 20px rgba(37,99,235,0.2);'>👉 กดเปิดดูเอกสารทันที</a>" +
               "</div></body></html>";
               
    return HtmlService.createHtmlOutput(html).setTitle("SchoolOS - Tracking");
  }
  return ContentService.createTextOutput("SchoolOS Cloud Bridge is Online").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.message) return handleTelegramWebhook(data.message);
    if (data.action === 'fetchRemote') return fetchRemoteFile(data.url);
    
    var folder = DriveApp.getFolderById(data.folderId);
    var bytes = Utilities.base64Decode(data.fileData);
    var blob = Utilities.newBlob(bytes, data.mimeType, data.fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return createJsonResponse({'status': 'success', 'url': file.getUrl(), 'id': file.getId(), 'viewUrl': "https://drive.google.com/file/d/" + file.getId() + "/view"});
  } catch (f) {
    return createJsonResponse({ 'status': 'error', 'message': f.toString() });
  }
}

function fetchRemoteFile(url) {
  try {
    var response = UrlFetchApp.fetch(url);
    var blob = response.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    return createJsonResponse({ 'status': 'success', 'fileData': base64, 'mimeType': blob.getContentType() });
  } catch (e) {
    return createJsonResponse({ 'status': 'error', 'message': e.toString() });
  }
}

function handleTelegramWebhook(msg) {
  var chatId = msg.chat.id.toString();
  var text = msg.text || "";
  var botToken = "${config.telegramBotToken ? config.telegramBotToken.replace(/"/g, '\\"') : ''}";
  if (text.indexOf("/start") === 0) {
    var parts = text.split(" ");
    if (parts.length > 1) {
      var citizenId = parts[1].trim();
      var url = SUPABASE_URL + "/rest/v1/profiles?id=eq." + citizenId;
      UrlFetchApp.fetch(url, { "method": "patch", "headers": { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" }, "payload": JSON.stringify({ "telegram_chat_id": chatId }) });
      sendMessage(botToken, chatId, "✅ <b>เชื่อมต่อสำเร็จ!</b>\\nท่านจะได้รับแจ้งเตือนผ่านบอทตัวนี้ครับ");
    }
  }
  return ContentService.createTextOutput("ok");
}

function sendMessage(token, chatId, text) {
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  UrlFetchApp.fetch(url, { "method": "post", "contentType": "application/json", "payload": JSON.stringify({ "chat_id": chatId, "text": text, "parse_mode": "HTML" }) });
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function setTelegramWebhook() {
  var botToken = "${config.telegramBotToken ? config.telegramBotToken.replace(/"/g, '\\"') : ''}";
  var scriptUrl = "${config.scriptUrl ? config.scriptUrl.replace(/"/g, '\\"') : ''}";
  if (!botToken || !scriptUrl) return;
  var url = "https://api.telegram.org/bot" + botToken + "/setWebhook?url=" + encodeURIComponent(scriptUrl);
  UrlFetchApp.fetch(url);
}
`;

    const handleCopyCode = () => {
        navigator.clipboard.writeText(gasCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        if (currentSchool) setSchoolForm(currentSchool);
    }, [currentSchool]);

    useEffect(() => {
        const fetchConfig = async () => {
             const client = supabase;
             if (isSupabaseConfigured && client) {
                 setIsLoadingConfig(true);
                 try {
                     const { data, error } = await client.from('school_configs').select('*').eq('school_id', currentSchool.id).maybeSingle();
                     if (data) {
                         setConfig({
                             driveFolderId: data.drive_folder_id || '',
                             scriptUrl: data.script_url || '',
                             telegramBotToken: data.telegram_bot_token || '',
                             telegramBotUsername: data.telegram_bot_username || '',
                             appBaseUrl: data.app_base_url || '',
                             officialGarudaBase64: data.official_garuda_base_64 || '',
                             directorSignatureBase64: data.director_signature_base_64 || '',
                             directorSignatureScale: data.director_signature_scale || 1.0,
                             directorSignatureYOffset: data.director_signature_y_offset || 0,
                             schoolName: currentSchool.name
                         });
                     }
                 } finally {
                     setIsLoadingConfig(false);
                 }
             }
        };
        fetchConfig();
    }, [currentSchool.id]);

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        setIsSavingConfig(true);
        try {
            // Re-enabled telegram_bot_username for per-school configuration
            const { error } = await client.from('school_configs').upsert({
                school_id: currentSchool.id,
                drive_folder_id: config.driveFolderId,
                script_url: config.scriptUrl,
                telegram_bot_token: config.telegramBotToken,
                telegram_bot_username: config.telegramBotUsername,
                app_base_url: config.appBaseUrl
            });
            if (!error) alert("บันทึกการตั้งค่าสำเร็จ");
            else throw error;
        } catch(err: any) {
            alert("บันทึกล้มเหลว: " + err.message + "\n(กรุณาตรวจสอบว่าท่านได้รันคำสั่ง SQL เพิ่มคอลัมน์แล้วหรือยัง)");
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleSaveSchool = async (e: React.FormEvent) => {
        e.preventDefault();
        if (schoolForm.id) {
            onUpdateSchool(schoolForm as School);
            alert("บันทึกข้อมูลโรงเรียนสำเร็จ");
        }
    };

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.id || !editForm.name) return;
        setIsSubmittingUser(true);
        const teacherData = { 
            ...editForm, 
            roles: editForm.roles || ['TEACHER'], 
            schoolId: currentSchool.id, 
            isApproved: true 
        } as Teacher;
        try {
            if (isAdding) await onAddTeacher(teacherData);
            else await onEditTeacher(teacherData);
            setIsAdding(false); setEditingId(null); setEditForm({});
        } catch(err: any) {
            alert("บันทึกไม่สำเร็จ: " + err.message);
        } finally { 
            setIsSubmittingUser(false); 
        }
    };

    const handleApproveTeacher = async (teacher: Teacher) => {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        if (!confirm(`ยืนยันการอนุมัติคุณ "${teacher.name}" เข้าใช้งานระบบ?`)) return;
        
        setIsUpdatingStatus(teacher.id);
        try {
            const { error } = await client.from('profiles').update({ is_approved: true }).eq('id', teacher.id);
            if (!error) { 
                await onEditTeacher({ ...teacher, isApproved: true }); 
                alert("อนุมัติสำเร็จ"); 
            } else throw error;
        } catch (err: any) {
            alert("ขัดข้อง: " + err.message);
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const toggleRole = (role: TeacherRole) => {
        const currentRoles = editForm.roles || [];
        setEditForm({ 
            ...editForm, 
            roles: currentRoles.includes(role) 
                ? currentRoles.filter(r => r !== role) 
                : [...currentRoles, role] 
        });
    };

    const getLocation = () => {
        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition((pos) => {
            setSchoolForm({ ...schoolForm, lat: pos.coords.latitude, lng: pos.coords.longitude });
            setIsGettingLocation(false);
        }, (err) => { 
            alert("ไม่สามารถดึง GPS ได้: " + err.message); 
            setIsGettingLocation(false); 
        });
    };

    const paginatedTeachers = approvedTeachers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="space-y-4 animate-fade-in pb-10 font-sarabun max-w-7xl mx-auto">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg transition-transform hover:scale-105">
                        <UserCog size={24}/>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-none mb-1">School Administrator</h2>
                        <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                             <Building2 size={12} className="text-blue-500"/> {currentSchool.name}
                        </p>
                    </div>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full shadow-inner border border-slate-200 no-scrollbar">
                    <button onClick={() => { setActiveTab('USERS'); setCurrentPage(1); }} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'USERS' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>บุคลากร</button>
                    <button onClick={() => setActiveTab('PENDING')} className={`relative px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'PENDING' ? 'bg-white text-amber-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>
                        รออนุมัติ
                        {pendingTeachers.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{pendingTeachers.length}</span>}
                    </button>
                    <button onClick={() => setActiveTab('SCHOOL_SETTINGS')} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'SCHOOL_SETTINGS' ? 'bg-white text-orange-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>ข้อมูลโรงเรียน</button>
                    <button onClick={() => setActiveTab('SETTINGS')} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'SETTINGS' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>การเชื่อมต่อ</button>
                    <button onClick={() => setActiveTab('CLOUD_SETUP')} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'CLOUD_SETUP' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>Cloud Logic</button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 min-h-[500px]">
                {activeTab === 'USERS' && (
                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Users className="text-blue-600" size={20}/> ทะเบียนบุคลากร ({approvedTeachers.length})</h3>
                            <div className="flex gap-2 w-full md:w-auto">
                                <div className="relative flex-1 md:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                    <input type="text" placeholder="ค้นหาชื่อ..." value={userSearch} onChange={e => { setUserSearch(e.target.value); setCurrentPage(1); }} className="w-full pl-9 pr-4 py-2 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-bold text-sm shadow-inner"/>
                                </div>
                                <button onClick={() => { setIsAdding(true); setEditForm({id:'', name:'', position:'ครู', roles:['TEACHER'], password:'123456'}); }} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:bg-blue-700 transition-all text-xs"><UserPlus size={16}/> เพิ่มรายใหม่</button>
                            </div>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-100">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b">
                                    <tr><th className="px-6 py-4">โปรไฟล์บุคลากร</th><th className="px-6 py-4">ตำแหน่ง/สิทธิ์</th><th className="px-6 py-4 text-center">สถานภาพ</th><th className="px-6 py-4 text-right">ดำเนินการ</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {paginatedTeachers.map(t => (
                                        <tr key={t.id} className="hover:bg-slate-50/50 transition-all group">
                                            <td className="px-6 py-3">
                                                <div className="font-bold text-slate-800">{t.name}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">ID: {t.id}</div>
                                            </td>
                                            <td className="px-6 py-3">
                                                <div className="text-xs font-bold text-slate-600 mb-1">{t.position}</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {t.roles.map(r => <span key={r} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold border border-blue-100 uppercase">{r}</span>)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-center"><span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${t.isSuspended ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{t.isSuspended ? 'ระงับ' : 'ปกติ'}</span></td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button onClick={() => { setEditingId(t.id); setEditForm(t); setIsAdding(false); }} className="p-1.5 text-blue-600 bg-white rounded-lg hover:bg-blue-600 hover:text-white border shadow-sm transition-all"><Edit size={14}/></button>
                                                    <button onClick={() => { if(confirm('ยืนยันลบ?')) onDeleteTeacher(t.id); }} className="p-1.5 text-red-400 bg-white rounded-lg hover:bg-red-600 hover:text-white border shadow-sm transition-all"><Trash2 size={14}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'PENDING' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex items-center gap-3 border-b pb-4"><Clock className="text-amber-500" size={24}/><div><h3 className="font-bold text-lg text-slate-800 leading-none mb-1">คำขออนุมัติบุคลากรใหม่</h3><p className="text-slate-400 text-xs font-bold">บุคลากรที่สมัครเข้าสังกัดโรงเรียนของคุณ</p></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pendingTeachers.length === 0 ? <div className="md:col-span-2 py-20 text-center text-slate-300 font-bold italic">ไม่มีรายการค้างอนุมัติ</div> : pendingTeachers.map(t => (
                                <div key={t.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:border-blue-200 transition-all shadow-sm">
                                    <div><p className="font-bold text-slate-800 leading-none mb-1">{t.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.position}</p><p className="text-[9px] font-mono text-slate-300 mt-1">ID: {t.id}</p></div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleApproveTeacher(t)} disabled={isUpdatingStatus === t.id} className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black shadow-md hover:bg-emerald-700 transition-all flex items-center gap-2">
                                            {isUpdatingStatus === t.id ? <Loader className="animate-spin" size={14}/> : <UserCheck size={14}/>} อนุมัติสิทธิ์
                                        </button>
                                        <button onClick={() => { if(confirm('ยืนยันลบคำขอ?')) onDeleteTeacher(t.id); }} className="p-2 bg-white text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all"><X size={18}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'SCHOOL_SETTINGS' && (
                    <form onSubmit={handleSaveSchool} className="space-y-8 max-w-4xl animate-fade-in py-4">
                        <div className="flex items-center gap-3 border-b pb-4"><div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Building2 size={24}/></div><h3 className="font-bold text-xl text-slate-800">ข้อมูลและพิกัดสถานศึกษา</h3></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อสถานศึกษา</label><input type="text" value={schoolForm.name || ''} onChange={e => setSchoolForm({...schoolForm, name: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl font-bold focus:ring-2 ring-orange-500/10 outline-none bg-slate-50 focus:bg-white shadow-inner transition-all"/></div>
                            <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">รหัสโรงเรียน 8 หลัก</label><input type="text" disabled value={schoolForm.id || ''} className="w-full px-4 py-2.5 bg-slate-100 text-slate-300 font-mono font-bold rounded-xl text-center shadow-inner cursor-not-allowed"/></div>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6 shadow-sm">
                            <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><MapPin size={18} className="text-orange-500"/> ตั้งค่าพิกัดปฏิบัติราชการ (GPS)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">Latitude</label><input type="number" step="any" value={schoolForm.lat || ''} onChange={e => setSchoolForm({...schoolForm, lat: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-sm outline-none focus:ring-2 ring-orange-500/10"/></div>
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">Longitude</label><input type="number" step="any" value={schoolForm.lng || ''} onChange={e => setSchoolForm({...schoolForm, lng: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-sm outline-none focus:ring-2 ring-orange-500/10"/></div>
                                <div className="flex items-end"><button type="button" onClick={getLocation} disabled={isGettingLocation} className="w-full py-2 bg-white border-2 border-orange-200 text-orange-600 rounded-lg text-[10px] font-black uppercase hover:bg-orange-50 transition-all flex items-center justify-center gap-2">{isGettingLocation ? <RefreshCw className="animate-spin" size={14}/> : <Crosshair size={14}/>} ดึงพิกัดปัจจุบัน</button></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">รัศมีที่อนุญาต (เมตร)</label><input type="number" value={schoolForm.radius || 500} onChange={e => setSchoolForm({...schoolForm, radius: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-lg outline-none focus:ring-2 ring-orange-500/10"/></div>
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">เวลาเริ่มเข้าสาย</label><input type="time" value={schoolForm.lateTimeThreshold || '08:30'} onChange={e => setSchoolForm({...schoolForm, lateTimeThreshold: e.target.value})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-lg outline-none focus:ring-2 ring-orange-500/10"/></div>
                            </div>
                        </div>
                        <div className="flex justify-end pt-4"><button type="submit" className="bg-slate-900 text-white px-10 py-3 rounded-xl font-bold shadow-lg hover:bg-black transition-all flex items-center gap-2 text-sm active:scale-95"><Save size={20}/> บันทึกการตั้งค่าทั้งหมด</button></div>
                    </form>
                )}

                {activeTab === 'SETTINGS' && (
                    <div className="animate-fade-in space-y-10 max-w-5xl py-4 mx-auto">
                        <div className="bg-indigo-950 p-8 rounded-2xl border-2 border-indigo-700 flex flex-col md:flex-row gap-6 shadow-lg relative overflow-hidden group">
                            <div className="p-6 bg-white/10 rounded-2xl border border-white/20 text-white backdrop-blur-xl self-start shrink-0"><ShieldAlert size={40}/></div>
                            <div className="flex-1"><h4 className="font-bold text-white text-xl mb-2">Cloud Connectivity (รายโรงเรียน)</h4><p className="text-xs font-bold text-indigo-200 leading-relaxed uppercase tracking-widest opacity-80 mb-6">ผู้ดูแลระบบถือครอง Token และ API Key ประจำหน่วยงานเอง เพื่อความมั่นคงของข้อมูลสูงสุด</p></div>
                        </div>
                        {isLoadingConfig ? <div className="p-40 text-center flex flex-col items-center gap-6 animate-pulse"><Loader className="animate-spin text-indigo-600" size={48}/><p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Synchronizing Connection...</p></div> : (
                            <form onSubmit={handleSaveConfig} className="space-y-10">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    <div className="space-y-6"><h5 className="font-black text-slate-800 flex items-center gap-3 uppercase text-[10px] tracking-widest ml-4"><Cloud className="text-blue-500" size={20}/> Google Drive Proxy</h5>
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-6 shadow-sm">
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Root Folder ID</label><input type="text" value={config.driveFolderId} onChange={e => setConfig({...config, driveFolderId: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-blue-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="1ABCdeFgHiJkLmNoP..."/></div>
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">GAS Web App URL</label><input type="text" value={config.scriptUrl} onChange={e => setConfig({...config, scriptUrl: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-blue-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="https://script.google.com/macros/s/..."/></div>
                                        </div>
                                    </div>
                                    <div className="space-y-6"><h5 className="font-black text-slate-800 flex items-center gap-3 uppercase text-[10px] tracking-widest ml-4"><Smartphone className="text-indigo-500" size={20}/> Telegram Gateway</h5>
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-6 shadow-sm">
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bot API Token</label><input type="password" value={config.telegramBotToken || ''} onChange={e => setConfig({...config, telegramBotToken: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-indigo-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="123456789:ABCDefgh..."/></div>
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bot Username</label><input type="text" value={config.telegramBotUsername || ''} onChange={e => setConfig({...config, telegramBotUsername: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-indigo-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="@SchoolOS_Bot"/></div>
                                        </div>
                                    </div>
                                    <div className="lg:col-span-2"><div className="bg-slate-900 p-8 rounded-2xl border-2 border-slate-800 shadow-md relative overflow-hidden group"><h5 className="font-black text-white flex items-center gap-4 uppercase text-[10px] tracking-widest mb-6"><Zap className="text-yellow-400" size={24}/> Application URL</h5><div className="space-y-4"><input type="text" placeholder="https://your-app.vercel.app" value={config.appBaseUrl || ''} onChange={e => setConfig({...config, appBaseUrl: e.target.value})} className="w-full px-6 py-3 bg-white/5 border border-white/10 focus:border-yellow-400 rounded-xl font-mono text-base text-yellow-100 outline-none transition-all shadow-inner"/><div className="flex gap-4 items-center text-slate-500 px-6 py-2 bg-white/5 rounded-xl border border-white/10 w-fit backdrop-blur-md"><Info size={16} className="text-yellow-400 shrink-0"/><p className="text-[10px] font-bold uppercase tracking-widest">* URL หลักของแอปที่ท่านติดตั้ง เพื่อส่งลิงก์ใน Telegram</p></div></div></div></div>
                                </div>
                                <button type="submit" disabled={isSavingConfig} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-base shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 active:scale-95 uppercase tracking-widest border-b-4 border-indigo-950">{isSavingConfig ? <Loader className="animate-spin" size={24}/> : <Save size={24}/>} บันทึกการเชื่อมต่อ Cloud SQL</button>
                            </form>
                        )}
                    </div>
                )}

                {activeTab === 'CLOUD_SETUP' && (
                    <div className="space-y-10 animate-fade-in max-w-6xl mx-auto py-4 pb-10">
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-white rounded-[2rem] p-8 md:p-12 shadow-sm relative overflow-hidden">
                            <div className="relative z-10"><div className="flex items-center gap-6 mb-10"><div className="p-6 bg-emerald-600 text-white rounded-2xl shadow-lg"><Cloud size={36}/></div><div><h3 className="text-2xl font-black text-emerald-900 tracking-tight leading-none mb-1">Direct Tracking Bridge v12.6</h3><p className="text-emerald-600 font-bold text-[10px] uppercase tracking-widest mt-1">Direct Access Protocol for Documents</p></div></div>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                                    <div className="space-y-8"><div className="p-6 bg-white rounded-xl border-l-8 border-blue-600 shadow-sm"><p className="text-slate-700 text-base leading-relaxed font-bold">เพื่อให้บุคลากรสามารถ <b>"พรีวิวไฟล์และรับทราบได้ทันทีผ่าน Telegram"</b> ต้องนำโค้ดด้านข้างไปติดตั้งใน Google Apps Script ครับ</p></div>
                                        <div className="space-y-6"><h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-3"><ChevronRight className="text-emerald-500" size={24}/> Workflow การติดตั้งใช้งาน</h4>
                                            <ol className="space-y-4 text-sm text-slate-600 pl-6 list-decimal font-bold">
                                                <li className="pl-2">เปิด <a href="https://script.google.com" target="_blank" className="text-blue-600 underline font-black hover:text-blue-800 transition-all">Google Apps Script Console</a></li>
                                                <li className="pl-2">ลบโค้ดเดิมใน <code className="bg-slate-100 px-2 font-mono">Code.gs</code> ออกแล้ววางโค้ดที่คัดลอกไปลงแทน</li>
                                                <li className="pl-2">ระบุ <code className="bg-slate-200 px-2 py-0.5 rounded text-blue-800">SUPABASE_URL</code> และ <code className="bg-slate-200 px-2 py-0.5 rounded text-blue-800">SUPABASE_KEY</code></li>
                                                <li className="pl-2">กดปุ่ม <b>Deploy &gt; New Deployment</b> เลือกประเภท <b>Web App</b></li>
                                                <li className="pl-2">ตั้งค่า Execute as: <b>Me</b> และ Who has access: <b>Anyone</b></li>
                                                <li className="pl-2">คัดลอก URL ของ Web App ที่ได้มาใส่ในเมนู <b>"การเชื่อมต่อ"</b></li>
                                            </ol>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-4"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bridge Logic Source Code</span><button onClick={handleCopyCode} className={`text-[10px] flex items-center gap-2 font-black px-4 py-1.5 rounded-lg border-2 transition-all ${copied ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white'}`}>{copied ? <><Check size={14}/> COPIED</> : <><Copy size={14}/> COPY CODE</>}</button></div>
                                        <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden shadow-inner relative border border-slate-800"><pre className="text-[10px] text-emerald-400 font-mono overflow-auto max-h-[400px] custom-scrollbar leading-relaxed no-scrollbar">{gasCode}</pre></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {(isAdding || editingId) && (
                <div className="fixed inset-0 bg-slate-950/90 z-[70] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-8 animate-scale-up border-2 border-blue-50 overflow-y-auto max-h-[90vh] no-scrollbar relative">
                        <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full text-slate-300 transition-all active:scale-90"><X size={24}/></button>
                        <div className="mb-10 text-center"><div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-inner ring-2 ring-white"><UserCog size={32}/></div><h3 className="text-xl font-black text-slate-800 tracking-tight">{isAdding ? 'ลงทะเบียนบุคลากร' : 'ปรับปรุงข้อมูลบุคลากร'}</h3><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">Staff Registry Control</p></div>
                        <form onSubmit={handleUserSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ID (เลขบัตรประชาชน)</label><input type="text" required maxLength={13} disabled={!isAdding} value={editForm.id || ''} onChange={e => setEditForm({...editForm, id: e.target.value})} className={`w-full px-4 py-2 border rounded-xl font-bold outline-none transition-all shadow-sm ${!isAdding ? 'bg-slate-100 text-slate-300' : 'bg-slate-50 focus:border-blue-500'}`}/></div>
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อ - นามสกุล</label><input type="text" required value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold outline-none focus:border-blue-500 transition-all shadow-inner"/></div>
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ตำแหน่ง</label><div className="relative"><select value={editForm.position || ''} onChange={e => setEditForm({...editForm, position: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold appearance-none outline-none focus:border-blue-500 transition-all shadow-inner">{ACADEMIC_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={16}/></div></div>
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">รหัสผ่าน</label><div className="relative group"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18}/><input type={showPasswordInModal ? "text" : "password"} value={editForm.password || ''} onChange={e => setEditForm({...editForm, password: e.target.value})} className="w-full pl-10 pr-10 py-2 bg-slate-50 border rounded-xl font-mono font-bold text-blue-600 outline-none focus:border-blue-500 transition-all shadow-inner text-lg\"/><button type="button" onClick={() => setShowPasswordInModal(!showPasswordInModal)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-blue-500 transition-colors">{showPasswordInModal ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
                            </div>
                            <div className="space-y-4"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">สิทธิ์และบทบาท</label><div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">{AVAILABLE_ROLES.map(role => { const isChecked = editForm.roles?.includes(role.id); return (<div key={role.id} onClick={() => toggleRole(role.id)} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all border group ${isChecked ? 'border-blue-500 bg-white shadow-md' : 'border-transparent opacity-60 hover:opacity-100 hover:bg-white/80'}`}><div className={`transition-all ${isChecked ? 'text-blue-600' : 'text-slate-300'}`}>{isChecked ? <CheckSquare size={20}/> : <Square size={20}/>}</div><span className={`text-[11px] font-black transition-colors ${isChecked ? 'text-blue-900' : 'text-slate-500'}`}>{role.label}</span></div>); })}</div></div>
                            <div className="pt-6 flex gap-4"><button type="button" onClick={() => { setIsAdding(false); setEditingId(null); }} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px] hover:bg-slate-200 transition-all">ยกเลิก</button><button type="submit" disabled={isSubmittingUser} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black text-base shadow-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-3 border-b-4 border-blue-950 uppercase text-xs">{isSubmittingUser ? <Loader className="animate-spin" size={20}/> : <Save size={20}/>} ยืนยันบันทึกข้อมูล SQL</button></div>
                        </form>
                    </div>
                </div>
            )}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                @keyframes scale-up { from { transform: scale(0.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .animate-scale-up { animation: scale-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};

export default AdminUserManagement;