
import React, { useState, useEffect } from 'react';
import { Teacher, TeacherRole, SystemConfig, School } from '../types';
import { 
    Users, UserPlus, Edit, Trash2, CheckSquare, Square, Save, X, Settings, 
    Database, Link as LinkIcon, AlertCircle, UploadCloud, ImageIcon, 
    MoveVertical, Maximize, Shield, MapPin, Target, Crosshair, Clock, 
    Calendar, RefreshCw, UserCheck, ShieldCheck, ShieldAlert, LogOut, 
    Send, Globe, Copy, Check, Cloud 
} from 'lucide-react';
import { db, isConfigured, doc, getDoc, setDoc } from '../firebaseConfig';
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
    { id: 'DOCUMENT_OFFICER', label: 'เจ้าหน้าที่ธุรการ' },
    { id: 'FINANCE_BUDGET', label: 'การเงิน (งบประมาณ)' },
    { id: 'FINANCE_NONBUDGET', label: 'การเงิน (นอกงบประมาณ)' },
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

    // System Settings State
    const [config, setConfig] = useState<SystemConfig>({ driveFolderId: '', scriptUrl: '', schoolName: '', directorSignatureBase64: '', directorSignatureScale: 1, directorSignatureYOffset: 0, schoolLogoBase64: '', officialGarudaBase64: '', telegramBotToken: '', appBaseUrl: '' });
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    
    // School Settings State (Local)
    const [schoolForm, setSchoolForm] = useState<Partial<School>>({});
    const [isGettingLocation, setIsGettingLocation] = useState(false);

    // Google Apps Script Code
    const gasCode = `/**
 * SchoolOS - Cloud Storage Bridge (Google Drive)
 * สคริปต์สำหรับรับไฟล์จาก App และบันทึกลงใน Google Drive
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var folderId = data.folderId; // ID ของโฟลเดอร์โรงเรียน
    var fileName = data.fileName; 
    var base64Data = data.fileData; 
    var mimeType = data.mimeType;

    // ค้นหาโฟลเดอร์
    var folder = DriveApp.getFolderById(folderId);
    
    // แปลง base64 เป็น Blob
    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    
    // บันทึกไฟล์
    var file = folder.createFile(blob);
    
    // ตั้งค่าให้คนที่มีลิงก์เข้าถึงได้ (View Only)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success',
      'url': file.getUrl(),
      'id': file.getId(),
      'downloadUrl': "https://docs.google.com/uc?export=download&id=" + file.getId()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (f) {
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': f.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// สำหรับทดสอบสถานะ API
function doGet(e) {
  return ContentService.createTextOutput("SchoolOS API is Online").setMimeType(ContentService.MimeType.TEXT);
}`;

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

    // Load Config - Isolated by School ID
    useEffect(() => {
        const fetchConfig = async () => {
             if (isConfigured && db && currentSchool?.id) {
                 try {
                     // Updated Path for School Isolation
                     const docRef = doc(db, "schools", currentSchool.id, "settings", "config");
                     const docSnap = await getDoc(docRef);
                     if (docSnap.exists()) {
                         setConfig(docSnap.data() as SystemConfig);
                     } else {
                         // Default values if first time
                         setConfig(prev => ({ ...prev, schoolName: currentSchool.name }));
                     }
                 } catch (e) {
                     console.error("Config fetch error", e);
                 }
             }
        };
        fetchConfig();
    }, [currentSchool.id]);

    // Helper: Resize Image
    const resizeImage = (file: File, maxWidth: number = 300): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/png', 0.8)); // Compress
                    } else {
                        reject(new Error("Canvas context error"));
                    }
                };
                img.onerror = () => reject(new Error("Image load error"));
                img.src = event.target?.result as string;
            };
            reader.onerror = error => reject(error);
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, field: keyof SystemConfig) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                // Resize image to prevent large payload issues
                const base64 = await resizeImage(file, 400); 
                setConfig(prev => ({ ...prev, [field]: base64 }));
            } catch (error) {
                console.error("Error resizing image", error);
                alert("เกิดข้อผิดพลาดในการประมวลผลรูปภาพ");
            }
        }
    };

    const handleSaveConfig = async () => {
        if (!currentSchool?.id) return;
        setIsLoadingConfig(true);
        // Ensure no trailing slash
        let cleanUrl = config.appBaseUrl || '';
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        const newConfig = { ...config, appBaseUrl: cleanUrl, schoolName: currentSchool.name };

        try {
            if (isConfigured && db) {
                // Updated Path for School Isolation
                const docRef = doc(db, "schools", currentSchool.id, "settings", "config");
                await setDoc(docRef, newConfig);
                alert("บันทึกการตั้งค่าเฉพาะโรงเรียนของท่านเรียบร้อยแล้ว");
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

    const handleUserSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.id || !editForm.name) return;

        const teacherData = editForm as Teacher;

        if (isAdding) {
            // Check ID
            if (teachers.find(t => t.id === teacherData.id)) {
                alert("รหัสประชาชนนี้มีอยู่ในระบบแล้ว");
                return;
            }
            onAddTeacher(teacherData);
        } else {
            onEditTeacher(teacherData);
        }
        setIsAdding(false);
        setEditingId(null);
        setEditForm({});
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
                        <p className="text-slate-500 text-sm">จัดการผู้ใช้งานและตั้งค่าระบบโรงเรียน {currentSchool.name}</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg overflow-x-auto max-w-full">
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
                                                    placeholder="กรอก Chat ID ของผู้ใช้งาน"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-2">สิทธิ์การใช้งาน (Roles)</label>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                                {AVAILABLE_ROLES.map(role => (
                                                    <label key={role.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                                                        <div onClick={() => toggleRole(role.id)} className={`text-blue-600 ${editForm.roles?.includes(role.id) ? '' : 'text-slate-300'}`}>
                                                            {editForm.roles?.includes(role.id) ? <CheckSquare size={20}/> : <Square size={20}/>}
                                                        </div>
                                                        <span className={`text-sm ${editForm.roles?.includes(role.id) ? 'font-bold text-slate-800' : 'text-slate-500'}`}>
                                                            {role.label}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="pt-4 flex gap-3">
                                            <button type="button" onClick={() => { setIsAdding(false); setEditingId(null); }} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-lg hover:bg-slate-200">
                                                ยกเลิก
                                            </button>
                                            <button type="submit" className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-lg">
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
                            <h3 className="font-bold text-lg text-slate-800">ตั้งค่าระบบเฉพาะโรงเรียน (School-Isolated Config)</h3>
                        </div>

                        {/* Telegram Config */}
                        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 mb-6">
                            <h4 className="font-bold text-blue-800 mb-4 flex items-center gap-2">
                                <Send size={20}/> การตั้งค่า Telegram Notification
                            </h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Telegram Bot Token (จาก @BotFather)</label>
                                    <input 
                                        type="text" 
                                        value={config.telegramBotToken || ''}
                                        onChange={e => setConfig({...config, telegramBotToken: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs"
                                        placeholder="123456789:ABCDefGhIJKlmNoPQRstUvwxyz..."
                                    />
                                    <p className="text-xs text-blue-500 mt-1">
                                        ใช้สำหรับส่งการแจ้งเตือนหนังสือราชการไปยังบุคลากรผ่าน Telegram (ข้อมูลเป็นความลับเฉพาะโรงเรียนท่าน)
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">App Base URL (สำหรับส่งลิงก์ในแชท)</label>
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
                                <LinkIcon size={20}/> การเชื่อมต่อ Google Drive (สำหรับอัปโหลดไฟล์)
                            </h4>
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

                        <div className="bg-white rounded-xl border border-slate-200 p-6">
                            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <ImageIcon size={20}/> ตั้งค่าลายเซ็นและตราสัญลักษณ์ (สำหรับออกเอกสาร PDF)
                            </h4>
                            <div className="bg-yellow-50 text-yellow-800 p-3 rounded-lg mb-4 text-xs flex items-start gap-2 border border-yellow-200">
                                <AlertCircle size={16} className="shrink-0 mt-0.5"/>
                                <span>ระบบจะย่อขนาดรูปภาพอัตโนมัติ (ไม่เกิน 400px) เพื่อประหยัดพื้นที่จัดเก็บและลดข้อผิดพลาดในการบันทึก</span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* School Logo */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">ตราโรงเรียน (Logo)</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-24 border border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
                                            {config.schoolLogoBase64 ? (
                                                <img src={config.schoolLogoBase64} className="w-full h-full object-contain" alt="School Logo"/>
                                            ) : <ImageIcon className="text-slate-300"/>}
                                        </div>
                                        <div className="flex-1">
                                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'schoolLogoBase64')} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                        </div>
                                    </div>
                                </div>

                                {/* Official Garuda */}
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">ตราครุฑ (สำหรับหนังสือราชการ)</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-24 border border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
                                            {config.officialGarudaBase64 ? (
                                                <img src={config.officialGarudaBase64} className="w-full h-full object-contain" alt="Garuda Logo"/>
                                            ) : <ImageIcon className="text-slate-300"/>}
                                        </div>
                                        <div className="flex-1">
                                            <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'officialGarudaBase64')} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <hr className="my-6 border-slate-100"/>

                            {/* Director Signature Config */}
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">ลายเซ็นผู้อำนวยการ (ดิจิทัล)</label>
                                <div className="flex flex-col md:flex-row gap-6">
                                    <div className="w-full md:w-64 h-24 border border-slate-300 rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                                         {config.directorSignatureBase64 ? (
                                                <img 
                                                    src={config.directorSignatureBase64} 
                                                    className="object-contain" 
                                                    alt="Director Signature"
                                                    style={{ 
                                                        transform: `scale(${config.directorSignatureScale}) translateY(${config.directorSignatureYOffset}px)` 
                                                    }}
                                                />
                                            ) : <span className="text-xs text-slate-400">Preview</span>}
                                    </div>
                                    <div className="space-y-4 flex-1">
                                        <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'directorSignatureBase64')} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                                                    <Maximize size={12}/> ขนาด (Scale)
                                                </label>
                                                <input 
                                                    type="range" min="0.5" max="2" step="0.1"
                                                    value={config.directorSignatureScale}
                                                    onChange={e => setConfig({...config, directorSignatureScale: parseFloat(e.target.value)})}
                                                    className="w-full"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                                                    <MoveVertical size={12}/> ตำแหน่งแนวตั้ง (Y-Offset)
                                                </label>
                                                <input 
                                                    type="range" min="-50" max="50" step="1"
                                                    value={config.directorSignatureYOffset}
                                                    onChange={e => setConfig({...config, directorSignatureYOffset: parseInt(e.target.value)})}
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>
                                    </div>
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
                            <h3 className="text-xl font-bold text-orange-800 mb-4 flex items-center gap-2">
                                <Cloud className="text-orange-600"/> คู่มือติดตั้งระบบเก็บไฟล์ Cloud (Google Drive)
                            </h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <p className="text-slate-700 text-sm leading-relaxed">
                                        เพื่อให้โรงเรียนของท่านสามารถอัปโหลดไฟล์เอกสารและลายเซ็นได้ แอดมินต้องสร้างสคริปต์สะพานเชื่อมต่อไว้ในบัญชี Google ของโรงเรียนตามขั้นตอนดังนี้:
                                    </p>
                                    <ol className="space-y-3 text-sm text-slate-600 list-decimal pl-5">
                                        <li>เข้าสู่ระบบ <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold underline">Google Apps Script</a></li>
                                        <li>คลิก <b>"New Project"</b></li>
                                        <li>คัดลอกโค้ดทางด้านขวาไปวางทับโค้ดเดิมทั้งหมด</li>
                                        <li>คลิก <b>"Deploy"</b> เลือก <b>"New Deployment"</b></li>
                                        <li>เลือกประเภทเป็น <b>"Web App"</b></li>
                                        <li>ตั้งค่า <b>Execute as: Me</b> และ <b>Who has access: Anyone</b></li>
                                        <li>คลิก Deploy และคัดลอก <b>Web App URL</b> มาวางในหน้า "ตั้งค่าระบบ"</li>
                                    </ol>
                                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800">
                                        <AlertCircle className="inline mr-1" size={14}/> <b>หมายเหตุ:</b> ในการ Deploy ครั้งแรก ท่านต้องกด "Advanced" และ "Go to Project (unsafe)" เพื่ออนุญาตสิทธิ์เข้าถึง Drive
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-xs font-bold text-slate-500 uppercase">Google Apps Script Code</span>
                                        <button 
                                            onClick={handleCopyCode} 
                                            className="text-xs flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded transition-colors"
                                        >
                                            {copied ? <><Check size={14}/> คัดลอกแล้ว</> : <><Copy size={14}/> คัดลอกโค้ด</>}
                                        </button>
                                    </div>
                                    <div className="bg-slate-900 rounded-xl p-4 overflow-hidden relative">
                                        <pre className="text-[10px] text-emerald-400 font-mono overflow-auto max-h-[350px] custom-scrollbar leading-relaxed">
                                            {gasCode}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminUserManagement;
