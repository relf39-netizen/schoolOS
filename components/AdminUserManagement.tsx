
import React, { useState, useEffect } from 'react';
import { Teacher, TeacherRole, SystemConfig, School } from '../types';
import { 
    Users, UserPlus, Edit, Trash2, CheckSquare, Square, Save, X, Settings, 
    Database, Link as LinkIcon, AlertCircle, UploadCloud, ImageIcon, 
    MoveVertical, Maximize, Shield, MapPin, Target, Crosshair, Clock, 
    Calendar, RefreshCw, UserCheck, ShieldCheck, ShieldAlert, LogOut, 
    Send, Globe, Copy, Check, Cloud, Building2, Loader
} from 'lucide-react';
import { db, isConfigured, doc, getDoc, setDoc, collection, getDocs, query } from '../firebaseConfig';
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

const AdminUserManagement: React.FC<AdminUserManagementProps> = ({ teachers, onAddTeacher, onEditTeacher, onDeleteTeacher, currentSchool, onUpdateSchool }) => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'SETTINGS' | 'SCHOOL_SETTINGS' | 'CLOUD_SETUP'>('USERS');
    const [copied, setCopied] = useState(false);
    
    // User Management State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Teacher>>({});
    const [isAdding, setIsAdding] = useState(false);
    const [isSubmittingUser, setIsSubmittingUser] = useState(false);

    // System Settings State
    const [config, setConfig] = useState<SystemConfig>({ driveFolderId: '', scriptUrl: '', schoolName: '', officerDepartment: '', directorSignatureBase64: '', directorSignatureScale: 1, directorSignatureYOffset: 0, schoolLogoBase64: '', officialGarudaBase64: '', telegramBotToken: '', telegramBotUsername: '', appBaseUrl: '' });
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    
    // School Settings State (Local)
    const [schoolForm, setSchoolForm] = useState<Partial<School>>({});
    const [isGettingLocation, setIsGettingLocation] = useState(false);

    // Google Apps Script Code v12.5 (Improved Landing Page Interface)
    const gasCode = `/**
 * SchoolOS - Cloud Storage & Telegram Tracking Bridge v12.5
 * ระบบจัดการไฟล์ Drive และหน้าเปิดพรีวิวเอกสารที่ชัดเจนสำหรับคุณครู
 */

var SUPABASE_URL = "ใส่ URL Supabase ของท่านที่นี่";
var SUPABASE_KEY = "ใส่ Anon Key ของท่านที่นี่";

function doGet(e) {
  var action = e.parameter.action;
  
  if (action === 'ack') {
    var docId = e.parameter.docId;
    var userId = e.parameter.userId;
    var targetFile = decodeURIComponent(e.parameter.target);
    var appBaseUrl = decodeURIComponent(e.parameter.appUrl || "");
    
    // สร้าง Deep Link เข้าสู่แอป SchoolOS เพื่อให้แอปบันทึก SQL ต่อ
    var finalAppLink = appBaseUrl + "?view=DOCUMENTS&id=" + docId + "&file=" + encodeURIComponent(targetFile);
    
    var html = "<html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>SchoolOS Tracking</title></head>" +
               "<body style='font-family:\"Sarabun\", sans-serif; text-align:center; padding:0; margin:0; background:#f8fafc; color:#1e293b; display:flex; align-items:center; justify-content:center; min-height:100vh;'>" +
               "<div style='background:white; padding:50px 20px; border-radius:40px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.1); max-width:450px; width:90%; border-top:12px solid #2563eb;'>" +
               "<div style='font-size:75px; margin-bottom:20px;'>📄</div>" +
               "<h2 style='color:#1e293b; margin-bottom:15px; font-weight:800; font-size:24px;'>มีหนังสือราชการถึงท่าน</h2>" +
               "<p style='color:#64748b; font-size:16px; line-height:1.6; margin-bottom:40px;'>กรุณากดปุ่มด้านล่างเพื่อเปิดอ่านเอกสาร <br>และบันทึกสถานะการรับทราบในระบบ SchoolOS</p>" +
               "<a href='" + finalAppLink + "' style='display:block; background:#2563eb; color:white; font-weight:bold; text-decoration:none; padding:25px; border-radius:25px; font-size:20px; box-shadow:0 15px 30px -5px rgba(37,99,235,0.4); transform:scale(1); transition:all 0.2s;'>👉 กดเปิดดูเอกสารทันที</a>" +
               "<p style='margin-top:35px; font-size:11px; color:#94a3b8; font-weight:bold; letter-spacing:1px; text-transform:uppercase;'>SchoolOS Management System</p>" +
               "</div>" +
               "<link href='https://fonts.googleapis.com/css2?family=Sarabun:wght@400;800&display=swap' rel='stylesheet'>" +
               "</body></html>";
               
    return HtmlService.createHtmlOutput(html).setTitle("SchoolOS - เปิดเอกสารและรับทราบ");
  }
  
  return ContentService.createTextOutput("SchoolOS Cloud Bridge v12.5 is Online").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.message) return handleTelegramWebhook(data.message);

    var folder = DriveApp.getFolderById(data.folderId);
    var bytes = Utilities.base64Decode(data.fileData);
    var blob = Utilities.newBlob(bytes, data.mimeType, data.fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return createJsonResponse({
      'status': 'success',
      'url': file.getUrl(),
      'id': file.getId(),
      'viewUrl': "https://drive.google.com/file/d/" + file.getId() + "/view"
    });
  } catch (f) {
    return createJsonResponse({ 'status': 'error', 'message': f.toString() });
  }
}

function handleTelegramWebhook(msg) {
  var chatId = msg.chat.id.toString();
  var text = msg.text || "";
  var botToken = "${config.telegramBotToken || ''}";

  if (text.indexOf("/start") === 0) {
    var parts = text.split(" ");
    if (parts.length > 1) {
      var citizenId = parts[1].trim();
      var url = SUPABASE_URL + "/rest/v1/profiles?id=eq." + citizenId;
      try {
        UrlFetchApp.fetch(url, {
          "method": "patch",
          "headers": { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
          "payload": JSON.stringify({ "telegram_chat_id": chatId })
        });
        sendMessage(botToken, chatId, "✅ <b>เชื่อมต่อระบบ SchoolOS สำเร็จ!</b>\\nต่อจากนี้คุณจะได้รับการแจ้งเตือนผ่านช่องทางนี้ครับ");
      } catch(e) {
        sendMessage(botToken, chatId, "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล");
      }
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
  var botToken = "${config.telegramBotToken || ''}";
  var scriptUrl = "${config.scriptUrl || ''}";
  var url = "https://api.telegram.org/bot" + botToken + "/setWebhook?url=" + scriptUrl;
  UrlFetchApp.fetch(url);
}
`;

    const handleCopyCode = () => {
        navigator.clipboard.writeText(gasCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Init School Form
    useEffect(() => {
        if (currentSchool) {
            setSchoolForm(currentSchool);
        }
    }, [currentSchool]);

    // Load Config
    useEffect(() => {
        const fetchConfig = async () => {
             if (isConfigured && db) {
                 try {
                     const docRef = doc(db, "system_config", "settings");
                     const docSnap = await getDoc(docRef);
                     if (docSnap.exists()) {
                         setConfig(docSnap.data() as SystemConfig);
                     }
                 } catch (e) {
                     console.error("Config fetch error", e);
                 }
             }
        };
        fetchConfig();
    }, []);

    const handleSaveConfig = async () => {
        setIsLoadingConfig(true);
        // Ensure no trailing slash
        let cleanUrl = config.appBaseUrl || '';
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        const newConfig = { ...config, appBaseUrl: cleanUrl };

        try {
            if (isConfigured && db) {
                await setDoc(doc(db, "system_config", "settings"), newConfig);
                alert("บันทึกการตั้งค่าเรียบร้อย");
            } else {
                // Mock Save
                setTimeout(() => {
                    alert("บันทึกการตั้งค่าเรียบร้อย (Offline Mode)");
                }, 500);
            }
            setConfig(newConfig);
        } catch (error) {
            console.error("Save config error", error);
            alert("เกิดข้อผิดพลาดในการบันทึก: " + (error as Error).message);
        } finally {
            setIsLoadingConfig(false);
        }
    };

    const handleSaveSchool = async (e: React.FormEvent) => {
        e.preventDefault();
        if (schoolForm.id) {
            onUpdateSchool(schoolForm as School);
            alert("บันทึกข้อมูลโรงเรียนเรียบร้อยแล้ว");
        }
    };

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.id || !editForm.name) return;

        setIsSubmittingUser(true);
        const teacherData = {
            ...editForm,
            roles: editForm.roles || ['TEACHER'],
            schoolId: currentSchool.id
        } as Teacher;

        try {
            if (isAdding) {
                // Check ID
                if (teachers.find(t => t.id === teacherData.id)) {
                    alert("รหัสประชาชนนี้มีอยู่ในระบบแล้ว");
                    setIsSubmittingUser(false);
                    return;
                }
                await onAddTeacher(teacherData);
            } else {
                await onEditTeacher(teacherData);
            }
            setIsAdding(false);
            setEditingId(null);
            setEditForm({});
        } catch (err: any) {
            alert("บันทึกล้มเหลว: " + err.message);
        } finally {
            setIsSubmittingUser(false);
        }
    };

    const startEdit = (t: Teacher) => {
        setEditingId(t.id);
        setEditForm({ ...t });
        setIsAdding(false);
    };

    const startAdd = () => {
        setIsAdding(true);
        setEditForm({
            id: '',
            name: '',
            position: 'ครู',
            roles: ['TEACHER'],
            password: '123456', // Default
            schoolId: currentSchool.id
        });
    };

    const toggleRole = (role: TeacherRole) => {
        const currentRoles = editForm.roles || [];
        if (currentRoles.includes(role)) {
            setEditForm({ ...editForm, roles: currentRoles.filter(r => r !== role) });
        } else {
            setEditForm({ ...editForm, roles: [...currentRoles, role] });
        }
    };

    const getLocation = () => {
        setIsGettingLocation(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                setSchoolForm({
                    ...schoolForm,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude
                });
                setIsGettingLocation(false);
            }, (err) => {
                alert("ไม่สามารถระบุตำแหน่งได้: " + err.message);
                setIsGettingLocation(false);
            });
        } else {
            alert("Browser ไม่รองรับ Geolocation");
            setIsGettingLocation(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-800 text-white rounded-lg">
                        <Settings size={24}/>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">ผู้ดูแลระบบ</h2>
                        <p className="text-slate-500 text-sm">จัดการผู้ใช้งานและตั้งค่าระบบ</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto max-full">
                    <button 
                        onClick={() => setActiveTab('USERS')}
                        className={`px-4 py-2 rounded-md text-sm font-bold shrink-0 transition-all ${activeTab === 'USERS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        ผู้ใช้งาน
                    </button>
                    <button 
                        onClick={() => setActiveTab('SCHOOL_SETTINGS')}
                        className={`px-4 py-2 rounded-md text-sm font-bold shrink-0 transition-all ${activeTab === 'SCHOOL_SETTINGS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        ตั้งค่าโรงเรียน
                    </button>
                    <button 
                        onClick={() => setActiveTab('SETTINGS')}
                        className={`px-4 py-2 rounded-md text-sm font-bold shrink-0 transition-all ${activeTab === 'SETTINGS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        ตั้งค่าระบบ
                    </button>
                    <button 
                        onClick={() => setActiveTab('CLOUD_SETUP')}
                        className={`px-4 py-2 rounded-md text-sm font-bold shrink-0 transition-all ${activeTab === 'CLOUD_SETUP' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        เชื่อมต่อ Cloud
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                
                {/* --- USERS TAB --- */}
                {activeTab === 'USERS' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <Users className="text-blue-600"/> รายชื่อบุคลากร ({teachers.length})
                            </h3>
                            <button onClick={startAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 shadow-sm">
                                <UserPlus size={18}/> เพิ่มบุคลากร
                            </button>
                        </div>

                        {/* User Form Modal */}
                        {(isAdding || editingId) && (
                            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 animate-scale-up">
                                    <div className="flex justify-between items-center mb-6 border-b pb-4">
                                        <h3 className="text-xl font-bold text-slate-800">
                                            {isAdding ? 'เพิ่มบุคลากรใหม่' : 'แก้ไขข้อมูลบุคลากร'}
                                        </h3>
                                        <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-slate-400 hover:text-slate-600">
                                            <X size={24}/>
                                        </button>
                                    </div>

                                    <form onSubmit={handleUserSubmit} className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-1">เลขบัตรประชาชน (ID)</label>
                                                <input 
                                                    type="text" 
                                                    required 
                                                    maxLength={13}
                                                    disabled={!isAdding}
                                                    value={editForm.id || ''}
                                                    onChange={e => setEditForm({...editForm, id: e.target.value})}
                                                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${!isAdding ? 'bg-slate-100 text-slate-500' : ''}`}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อ - นามสกุล</label>
                                                <input 
                                                    type="text" 
                                                    required 
                                                    value={editForm.name || ''}
                                                    onChange={e => setEditForm({...editForm, name: e.target.value})}
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-1">ตำแหน่ง</label>
                                                <input 
                                                    type="text" 
                                                    value={editForm.position || ''}
                                                    onChange={e => setEditForm({...editForm, position: e.target.value})}
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-slate-700 mb-1">รหัสผ่าน</label>
                                                <input 
                                                    type="text" 
                                                    value={editForm.password || ''}
                                                    onChange={e => setEditForm({...editForm, password: e.target.value})}
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                                    placeholder="Reset Password"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1">
                                                    <Send size={14}/> Telegram Chat ID
                                                </label>
                                                <input 
                                                    type="text" 
                                                    value={editForm.telegramChatId || ''}
                                                    onChange={e => setEditForm({...editForm, telegramChatId: e.target.value})}
                                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                                    placeholder="กรอก Chat ID หรือให้ครูกดเชื่อมต่อเองในโปรไฟล์"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">สิทธิ์การใช้งาน (Roles)</label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                                {AVAILABLE_ROLES.map(role => {
                                                    const isChecked = editForm.roles?.includes(role.id);
                                                    return (
                                                        <div 
                                                            key={role.id} 
                                                            onClick={() => toggleRole(role.id)}
                                                            className={`flex items-center gap-2 cursor-pointer p-2 rounded transition-all hover:bg-white border-2 ${isChecked ? 'border-blue-100 bg-white shadow-sm' : 'border-transparent'}`}
                                                        >
                                                            <div className={`text-blue-600 ${isChecked ? '' : 'text-slate-300'}`}>
                                                                {isChecked ? <CheckSquare size={20}/> : <Square size={20}/>}
                                                            </div>
                                                            <span className={`text-sm ${isChecked ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                                                                {role.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="pt-4 flex gap-3">
                                            <button 
                                                type="button" 
                                                disabled={isSubmittingUser}
                                                onClick={() => { setIsAdding(false); setEditingId(null); }} 
                                                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200 disabled:opacity-50"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button 
                                                type="submit" 
                                                disabled={isSubmittingUser}
                                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg disabled:opacity-70 flex items-center justify-center gap-2"
                                            >
                                                {isSubmittingUser ? <Loader className="animate-spin" size={18}/> : <Save size={18}/>}
                                                บันทึกข้อมูล
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Teachers Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 uppercase">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-lg">ชื่อ - สกุล</th>
                                        <th className="px-4 py-3">ตำแหน่ง</th>
                                        <th className="px-4 py-3">สิทธิ์การใช้งาน</th>
                                        <th className="px-4 py-3 rounded-tr-lg text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {teachers.map(t => (
                                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 font-medium text-slate-800">
                                                {t.name}
                                                <div className="text-xs text-slate-400 font-mono">{t.id}</div>
                                                {t.telegramChatId && (
                                                    <div className="text-[10px] text-blue-500 flex items-center gap-1 mt-0.5">
                                                        <Send size={10}/> Telegram Connected
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{t.position}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-wrap gap-1">
                                                    {t.roles.map(r => (
                                                        <span key={r} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-bold border border-blue-100">
                                                            {AVAILABLE_ROLES.find(ar => ar.id === r)?.label || r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => startEdit(t)} className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100">
                                                        <Edit size={16}/>
                                                    </button>
                                                    <button 
                                                        onClick={() => { if(confirm('ยืนยันลบผู้ใช้งานนี้?')) onDeleteTeacher(t.id); }}
                                                        className="p-1.5 text-red-600 bg-red-50 rounded hover:bg-red-100"
                                                    >
                                                        <Trash2 size={16}/>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- SCHOOL SETTINGS TAB --- */}
                {activeTab === 'SCHOOL_SETTINGS' && (
                     <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-4 border-b pb-4">
                            <MapPin className="text-orange-500"/>
                            <h3 className="font-bold text-lg text-slate-800">ตั้งค่าข้อมูลโรงเรียน</h3>
                        </div>

                        <form onSubmit={handleSaveSchool} className="space-y-4 max-w-3xl">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อโรงเรียน</label>
                                    <input 
                                        type="text" 
                                        value={schoolForm.name || ''}
                                        onChange={e => setSchoolForm({...schoolForm, name: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">รหัสโรงเรียน</label>
                                    <input 
                                        type="text" 
                                        disabled
                                        value={schoolForm.id || ''}
                                        className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">อำเภอ</label>
                                    <input 
                                        type="text" 
                                        value={schoolForm.district || ''}
                                        onChange={e => setSchoolForm({...schoolForm, district: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">จังหวัด</label>
                                    <input 
                                        type="text" 
                                        value={schoolForm.province || ''}
                                        onChange={e => setSchoolForm({...schoolForm, province: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                             </div>

                             <div className="bg-orange-50 p-6 rounded-xl border border-orange-200">
                                <h4 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                                    <Target size={20}/> การตั้งค่าพิกัด GPS (สำหรับลงเวลา)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    <div>
                                        <label className="block text-xs font-bold text-orange-700 mb-1">ละติจูด (Lat)</label>
                                        <input 
                                            type="number" 
                                            step="any"
                                            value={schoolForm.lat || ''}
                                            onChange={e => setSchoolForm({...schoolForm, lat: parseFloat(e.target.value)})}
                                            className="w-full px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-orange-700 mb-1">ลองจิจูด (Lng)</label>
                                        <input 
                                            type="number" 
                                            step="any"
                                            value={schoolForm.lng || ''}
                                            onChange={e => setSchoolForm({...schoolForm, lng: parseFloat(e.target.value)})}
                                            className="w-full px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <button 
                                            type="button" 
                                            onClick={getLocation}
                                            disabled={isGettingLocation}
                                            className="w-full py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-bold flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            {isGettingLocation ? <RefreshCw className="animate-spin"/> : <Crosshair size={18}/>}
                                            ดึงพิกัดปัจจุบัน
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-orange-700 mb-1">รัศมีที่อนุญาต (เมตร)</label>
                                        <input 
                                            type="number" 
                                            value={schoolForm.radius || 500}
                                            onChange={e => setSchoolForm({...schoolForm, radius: parseInt(e.target.value)})}
                                            className="w-full px-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-orange-700 mb-1">เวลาเข้าสาย (HH:MM)</label>
                                        <div className="relative">
                                            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400" size={16}/>
                                            <input 
                                                type="time" 
                                                value={schoolForm.lateTimeThreshold || '08:30'}
                                                onChange={e => setSchoolForm({...schoolForm, lateTimeThreshold: e.target.value})}
                                                className="w-full pl-10 pr-3 py-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                             </div>

                             <div className="flex justify-end pt-4">
                                <button type="submit" className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2">
                                    <Save size={20}/> บันทึกการตั้งค่าโรงเรียน
                                </button>
                             </div>
                        </form>
                     </div>
                )}

                {/* --- SYSTEM SETTINGS TAB --- */}
                {activeTab === 'SETTINGS' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2 mb-4 border-b pb-4">
                            <Database className="text-purple-600"/>
                            <h3 className="font-bold text-lg text-slate-800">ตั้งค่าระบบส่วนกลาง</h3>
                        </div>

                        {/* Telegram Config */}
                        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 mb-6">
                            <h4 className="font-bold text-blue-800 mb-4 flex items-center gap-2">
                                <Send size={20}/> การตั้งค่า Telegram Notification
                            </h4>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Telegram Bot Token</label>
                                        <input 
                                            type="text" 
                                            value={config.telegramBotToken || ''}
                                            onChange={e => setConfig({...config, telegramBotToken: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs"
                                            placeholder="123456789:ABC..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">Telegram Bot Username</label>
                                        <input 
                                            type="text" 
                                            value={config.telegramBotUsername || ''}
                                            onChange={e => setConfig({...config, telegramBotUsername: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs"
                                            placeholder="เช่น SchoolOS_Bot"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">App Base URL</label>
                                    <input 
                                        type="text" 
                                        value={config.appBaseUrl || ''}
                                        onChange={e => setConfig({...config, appBaseUrl: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs"
                                        placeholder="https://your-app.vercel.app"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-purple-50 p-6 rounded-xl border border-purple-200 mb-6">
                            <h4 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                                <LinkIcon size={20}/> การเชื่อมต่อ Google Drive</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Google Apps Script Web App URL</label>
                                    <input 
                                        type="text" 
                                        value={config.scriptUrl}
                                        onChange={e => setConfig({...config, scriptUrl: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono text-xs"
                                        placeholder="https://script.google.com/macros/s/..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Google Drive Folder ID</label>
                                    <input 
                                        type="text" 
                                        value={config.driveFolderId}
                                        onChange={e => setConfig({...config, driveFolderId: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono text-xs"
                                        placeholder="1234567890abcdef..."
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button 
                                onClick={handleSaveConfig}
                                disabled={isLoadingConfig}
                                className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2 disabled:opacity-50"
                            >
                                {isLoadingConfig ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20}/>} 
                                บันทึกการตั้งค่าระบบ
                            </button>
                        </div>
                    </div>
                )}

                {/* --- CLOUD SETUP TAB --- */}
                {activeTab === 'CLOUD_SETUP' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
                            <h3 className="text-xl font-bold text-orange-800 mb-4 flex items-center gap-2"><Cloud className="text-orange-600"/> การติดตั้งระบบ Direct Tracking v12.5</h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8"><div className="space-y-4"><p className="text-slate-700 text-sm leading-relaxed">เพื่อให้ระบบงานสารบรรณสามารถ <b>"บันทึกรับทราบและพรีวิวไฟล์ได้ทันที"</b> แอดมินต้องอัปเดตสคริปต์กลางดังนี้:</p>
                                    <ol className="space-y-3 text-sm text-slate-600 list-decimal pl-5">
                                        <li>เปิดโปรเจกต์เดิมใน <a href="https://script.google.com" target="_blank" className="text-blue-600 font-bold underline">Apps Script</a></li>
                                        <li>ลบโค้ดเก่าทิ้งทั้งหมด แล้ววางโค้ดใหม่จากทางด้านขวา</li>
                                        <li><b>แก้ไข</b> <code className="bg-white px-1 font-bold">SUPABASE_URL</code> และ <code className="bg-white px-1 font-bold">SUPABASE_KEY</code> ให้ถูกต้อง</li>
                                        <li>กด <b>Deploy &gt; New Deployment</b> (Execute as: Me / Who: Anyone)</li>
                                        <li>นำ URL ที่ได้มาวางในหน้า "ตั้งค่าระบบ" และกด <b>Run</b> ฟังก์ชัน setTelegramWebhook</li>
                                    </ol>
                                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800"><AlertCircle className="inline mr-1" size={14}/> <b>ฟีเจอร์เด่น v12.5:</b> เปลี่ยนหน้าจอ Landing Page ให้มีปุ่มกดขนาดใหญ่ เพื่อให้คุณครูใช้งานง่ายขึ้นและลดปัญหาหน้าจอขอสิทธิ์ของ Google</div>
                                </div>
                                <div className="space-y-2"><div className="flex justify-between items-center px-1"><span className="text-xs font-bold text-slate-500 uppercase">GAS v12.5 Source Code</span><button onClick={handleCopyCode} className="text-xs flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded transition-colors">{copied ? <><Check size={14}/> คัดลอกแล้ว</> : <><Copy size={14}/> คัดลอกโค้ด</>}</button></div><div className="bg-slate-900 rounded-xl p-4 overflow-hidden relative"><pre className="text-[10px] text-emerald-400 font-mono overflow-auto max-h-[400px] custom-scrollbar leading-relaxed">{gasCode}</pre></div></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminUserManagement;
