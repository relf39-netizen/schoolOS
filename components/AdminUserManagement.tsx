
import React, { useState, useEffect } from 'react';
import { Teacher, TeacherRole, SystemConfig } from '../types';
import { Users, UserPlus, Edit, Trash2, CheckSquare, Square, Save, X, Settings, Database, Link as LinkIcon, AlertCircle, UploadCloud, ImageIcon, MoveVertical, Maximize } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AdminUserManagementProps {
    teachers: Teacher[];
    onUpdateTeachers: (teachers: Teacher[]) => void;
    currentSchoolId: string;
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

const AdminUserManagement: React.FC<AdminUserManagementProps> = ({ teachers, onUpdateTeachers, currentSchoolId }) => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'SETTINGS'>('USERS');
    
    // User Management State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Teacher>>({});
    const [isAdding, setIsAdding] = useState(false);

    // System Settings State
    const [config, setConfig] = useState<SystemConfig>({ driveFolderId: '', scriptUrl: '', schoolName: '', directorSignatureBase64: '', directorSignatureScale: 1, directorSignatureYOffset: 0 });
    const [driveLinkInput, setDriveLinkInput] = useState('');
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    const [signaturePreview, setSignaturePreview] = useState<string>('');

    // Load Config on Mount
    useEffect(() => {
        const loadConfig = async () => {
            if (isConfigured && db) {
                try {
                    const docRef = doc(db, "system_config", "settings");
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data() as SystemConfig;
                        setConfig({
                            ...data,
                            directorSignatureScale: data.directorSignatureScale || 1,
                            directorSignatureYOffset: data.directorSignatureYOffset || 0
                        });
                        setDriveLinkInput(data.driveFolderId ? `https://drive.google.com/drive/folders/${data.driveFolderId}` : '');
                        setSignaturePreview(data.directorSignatureBase64 || '');
                    }
                } catch (e) {
                    console.error("Error loading config:", e);
                }
            }
        };
        if (activeTab === 'SETTINGS') {
            loadConfig();
        }
    }, [activeTab]);

    // --- User Management Functions ---
    const handleEdit = (teacher: Teacher) => {
        setEditingId(teacher.id);
        setEditForm({ ...teacher });
        setIsAdding(false);
    };

    const handleStartAdd = () => {
        setEditingId(null);
        setEditForm({ 
            name: '', 
            position: 'ครู', 
            roles: ['TEACHER'] 
        });
        setIsAdding(true);
    };

    const handleSaveUser = () => {
        if (!editForm.name) return alert('กรุณาระบุชื่อ');

        if (isAdding) {
            const newTeacher: Teacher = {
                id: `t_${Date.now()}`,
                schoolId: currentSchoolId,
                name: editForm.name || '',
                position: editForm.position || 'ครู',
                roles: editForm.roles || ['TEACHER']
            };
            onUpdateTeachers([...teachers, newTeacher]);
        } else {
            const updated = teachers.map(t => t.id === editingId ? { ...t, ...editForm } as Teacher : t);
            onUpdateTeachers(updated);
        }
        setEditingId(null);
        setIsAdding(false);
    };

    const handleDeleteUser = (id: string) => {
        if (confirm('ต้องการลบข้อมูลบุคลากรรายนี้ใช่หรือไม่?')) {
            onUpdateTeachers(teachers.filter(t => t.id !== id));
        }
    };

    const toggleRole = (role: TeacherRole) => {
        const currentRoles = editForm.roles || [];
        if (currentRoles.includes(role)) {
            setEditForm({ ...editForm, roles: currentRoles.filter(r => r !== role) });
        } else {
            setEditForm({ ...editForm, roles: [...currentRoles, role] });
        }
    };

    // --- Settings Functions ---
    const extractFolderId = (url: string) => {
        const match = url.match(/[-\w]{25,}/);
        return match ? match[0] : '';
    };

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                const base64 = evt.target?.result as string;
                setConfig(prev => ({ ...prev, directorSignatureBase64: base64 }));
                setSignaturePreview(base64);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveConfig = async () => {
        setIsLoadingConfig(true);
        const folderId = extractFolderId(driveLinkInput);
        
        const newConfig: SystemConfig = {
            driveFolderId: folderId || config.driveFolderId,
            scriptUrl: config.scriptUrl.trim(),
            schoolName: config.schoolName?.trim(),
            directorSignatureBase64: config.directorSignatureBase64,
            directorSignatureScale: Number(config.directorSignatureScale),
            directorSignatureYOffset: Number(config.directorSignatureYOffset)
        };

        if (isConfigured && db) {
            try {
                await setDoc(doc(db, "system_config", "settings"), newConfig);
                setConfig(newConfig);
                alert("บันทึกการตั้งค่าระบบเรียบร้อยแล้ว");
            } catch (e) {
                console.error(e);
                alert("เกิดข้อผิดพลาดในการบันทึกการตั้งค่า");
            }
        } else {
            alert("บันทึกจำลอง (Offline Mode)");
            setConfig(newConfig);
        }
        setIsLoadingConfig(false);
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="bg-slate-800 text-white p-4 rounded-xl flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Users size={24}/> ผู้ดูแลระบบ (Admin)
                    </h2>
                    <p className="text-slate-300 text-sm">จัดการผู้ใช้งานและการตั้งค่าระบบ</p>
                </div>
                
                <div className="flex bg-slate-700 rounded-lg p-1">
                    <button 
                        onClick={() => setActiveTab('USERS')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'USERS' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        จัดการบุคลากร
                    </button>
                    <button 
                        onClick={() => setActiveTab('SETTINGS')}
                        className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeTab === 'SETTINGS' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        ตั้งค่าระบบ
                    </button>
                </div>
            </div>

            {/* TAB: USER MANAGEMENT */}
            {activeTab === 'USERS' && (
                <>
                    <div className="flex justify-end">
                        <button onClick={handleStartAdd} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2">
                            <UserPlus size={18}/> เพิ่มบุคลากร
                        </button>
                    </div>

                    {/* Editor Form */}
                    {(isAdding || editingId) && (
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-200 animate-slide-down">
                            <h3 className="font-bold text-slate-800 mb-4 text-lg border-b pb-2">
                                {isAdding ? 'เพิ่มบุคลากรใหม่' : 'แก้ไขข้อมูลบุคลากร'}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อ - นามสกุล</label>
                                    <input 
                                        type="text" 
                                        value={editForm.name || ''} 
                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">ตำแหน่ง</label>
                                    <input 
                                        type="text" 
                                        value={editForm.position || ''} 
                                        onChange={e => setEditForm({ ...editForm, position: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="mb-6">
                                <label className="block text-sm font-bold text-slate-700 mb-3">หน้าที่รับผิดชอบ (Roles) - กำหนดสิทธิ์การเข้าถึงระบบ</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                    {AVAILABLE_ROLES.map(role => {
                                        const isChecked = editForm.roles?.includes(role.id);
                                        return (
                                            <div 
                                                key={role.id} 
                                                onClick={() => toggleRole(role.id)}
                                                className={`p-3 rounded-lg border cursor-pointer flex items-center gap-2 transition-all ${
                                                    isChecked ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                                }`}
                                            >
                                                {isChecked ? <CheckSquare size={20} className="text-blue-600"/> : <Square size={20} className="text-slate-300"/>}
                                                <span className="text-sm font-medium">{role.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end">
                                <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2">
                                    <X size={18}/> ยกเลิก
                                </button>
                                <button onClick={handleSaveUser} className="px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-2">
                                    <Save size={18}/> บันทึกข้อมูล
                                </button>
                            </div>
                        </div>
                    )}

                    {/* List Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                    <th className="px-6 py-4">ชื่อ - นามสกุล</th>
                                    <th className="px-6 py-4">ตำแหน่ง</th>
                                    <th className="px-6 py-4">หน้าที่รับผิดชอบ</th>
                                    <th className="px-6 py-4 text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {teachers.map(teacher => (
                                    <tr key={teacher.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-800">{teacher.name}</td>
                                        <td className="px-6 py-4 text-slate-600">{teacher.position}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {teacher.roles.map(r => {
                                                    const roleLabel = AVAILABLE_ROLES.find(ar => ar.id === r)?.label || r;
                                                    return (
                                                        <span key={r} className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded text-xs">
                                                            {roleLabel}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                <button onClick={() => handleEdit(teacher)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                                    <Edit size={16}/>
                                                </button>
                                                <button onClick={() => handleDeleteUser(teacher.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                                    <Trash2 size={16}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* TAB: SYSTEM SETTINGS */}
            {activeTab === 'SETTINGS' && (
                <div className="max-w-2xl mx-auto space-y-6">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3 text-yellow-800 text-sm">
                        <AlertCircle className="shrink-0" size={20}/>
                        <div>
                            <p className="font-bold mb-1">คำแนะนำการตั้งค่า</p>
                            <p>กรุณากรอกข้อมูลให้ครบถ้วนเพื่อประสิทธิภาพในการใช้งานสูงสุด</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-3">
                            <Settings size={20} className="text-blue-600"/> การตั้งค่าทั่วไป
                        </h3>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                ชื่อโรงเรียน (สำหรับหัวกระดาษ)
                            </label>
                            <input 
                                type="text" 
                                value={config.schoolName || ''}
                                onChange={e => setConfig({...config, schoolName: e.target.value})}
                                placeholder="เช่น โรงเรียนตัวอย่างวิทยา"
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                         <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                ลายเซ็นผู้อำนวยการ (ไฟล์ภาพ .PNG พื้นหลังโปร่งใส)
                            </label>
                            
                            <div className="flex flex-col gap-4">
                                <div className="flex items-start gap-4">
                                    <label className="cursor-pointer bg-white hover:bg-slate-50 px-4 py-2 rounded-lg border border-slate-300 flex items-center gap-2 transition-colors shadow-sm">
                                        <UploadCloud size={18} className="text-slate-600"/>
                                        <span className="text-sm font-bold text-slate-700">อัปโหลดรูปภาพ</span>
                                        <input type="file" accept="image/png" onChange={handleSignatureUpload} className="hidden" />
                                    </label>
                                    
                                    {signaturePreview ? (
                                        <div className="border border-slate-200 rounded p-2 bg-white flex items-center justify-center min-w-[100px]">
                                            <img src={signaturePreview} alt="Signature Preview" className="h-10 object-contain" />
                                        </div>
                                    ) : (
                                        <div className="text-xs text-slate-400 italic mt-2">ยังไม่มีลายเซ็น</div>
                                    )}
                                </div>

                                {/* Customization Sliders */}
                                {signaturePreview && (
                                    <div className="grid grid-cols-2 gap-4 mt-2">
                                        <div>
                                            <label className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                                <span className="flex items-center gap-1"><Maximize size={12}/> ขนาด (Scale)</span>
                                                <span className="font-bold text-blue-600">{config.directorSignatureScale?.toFixed(1) || '1.0'}x</span>
                                            </label>
                                            <input 
                                                type="range" 
                                                min="0.5" 
                                                max="2.0" 
                                                step="0.1"
                                                value={config.directorSignatureScale || 1}
                                                onChange={e => setConfig({...config, directorSignatureScale: parseFloat(e.target.value)})}
                                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                                <span className="flex items-center gap-1"><MoveVertical size={12}/> ตำแหน่งแนวตั้ง</span>
                                                <span className="font-bold text-blue-600">{config.directorSignatureYOffset || '0'}px</span>
                                            </label>
                                            <input 
                                                type="range" 
                                                min="-50" 
                                                max="50" 
                                                step="5"
                                                value={config.directorSignatureYOffset || 0}
                                                onChange={e => setConfig({...config, directorSignatureYOffset: parseFloat(e.target.value)})}
                                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                                <span>ลงต่ำ</span>
                                                <span>ขึ้นบน</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <h3 className="font-bold text-slate-800 flex items-center gap-2 border-b pb-3 pt-4">
                            <Database size={20} className="text-blue-600"/> การเชื่อมต่อ Google Drive
                        </h3>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                ลิงก์โฟลเดอร์ Google Drive (Target Folder)
                            </label>
                            <div className="flex gap-2">
                                <div className="bg-slate-100 p-2 rounded-l-lg border border-r-0 border-slate-300 text-slate-500">
                                    <LinkIcon size={18}/>
                                </div>
                                <input 
                                    type="text" 
                                    value={driveLinkInput}
                                    onChange={e => setDriveLinkInput(e.target.value)}
                                    placeholder="เช่น https://drive.google.com/drive/folders/..."
                                    className="w-full px-3 py-2 border rounded-r-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                                {config.driveFolderId ? `Folder ID ที่ตรวจพบ: ${config.driveFolderId}` : 'กรุณาวางลิงก์เพื่อดึง ID'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Google Apps Script Web App URL (Upload Service)
                            </label>
                            <textarea 
                                rows={3}
                                value={config.scriptUrl}
                                onChange={e => setConfig({...config, scriptUrl: e.target.value})}
                                placeholder="เช่น https://script.google.com/macros/s/.../exec"
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xs font-mono"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                                Script ต้องตั้งค่า Execute as: Me และ Access: Anyone
                            </p>
                        </div>

                        <button 
                            onClick={handleSaveConfig}
                            disabled={isLoadingConfig}
                            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md flex justify-center items-center gap-2"
                        >
                            {isLoadingConfig ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminUserManagement;
