
import React, { useState } from 'react';
import { Teacher } from '../types';
import { ACADEMIC_POSITIONS } from '../constants';
import { User, Lock, Save, UploadCloud, FileSignature, Briefcase, Eye, EyeOff } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';

interface UserProfileProps {
    currentUser: Teacher;
    onUpdateUser: (updatedUser: Teacher) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ currentUser, onUpdateUser }) => {
    const [formData, setFormData] = useState({
        name: currentUser.name,
        position: currentUser.position,
        password: currentUser.password || '',
        id: currentUser.id
    });
    const [signaturePreview, setSignaturePreview] = useState<string>(currentUser.signatureBase64 || '');
    const [showPassword, setShowPassword] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                const base64 = evt.target?.result as string;
                setSignaturePreview(base64);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        const updatedUser: Teacher = {
            ...currentUser,
            name: formData.name,
            position: formData.position,
            password: formData.password,
            signatureBase64: signaturePreview
        };

        if (isConfigured && db) {
            try {
                const userRef = doc(db, "teachers", currentUser.id);
                await updateDoc(userRef, {
                    name: formData.name,
                    position: formData.position,
                    password: formData.password,
                    signatureBase64: signaturePreview
                });
                alert("บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว");
                onUpdateUser(updatedUser);
            } catch (e) {
                console.error("Update profile error", e);
                alert("เกิดข้อผิดพลาดในการบันทึก");
            }
        } else {
            // Mock mode
            alert("บันทึกข้อมูลเรียบร้อย (Offline Mode)");
            onUpdateUser(updatedUser);
        }
        setIsSaving(false);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-slate-800 text-white p-6 rounded-xl flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-white shadow-lg">
                    {currentUser.name[0]}
                </div>
                <div>
                    <h2 className="text-2xl font-bold">{currentUser.name}</h2>
                    <p className="text-slate-300">{currentUser.position}</p>
                </div>
            </div>

            <form onSubmit={handleSave} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6 animate-slide-up">
                <div className="flex items-center gap-2 border-b pb-2 mb-4">
                    <User className="text-blue-600" size={24}/>
                    <h3 className="font-bold text-lg text-slate-800">แก้ไขข้อมูลส่วนตัว</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อ - นามสกุล</label>
                        <input 
                            type="text" 
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">เลขบัตรประชาชน (ID)</label>
                        <input 
                            type="text" 
                            value={formData.id}
                            disabled
                            className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
                        <Briefcase size={16}/> ตำแหน่ง
                    </label>
                    <select 
                        value={formData.position}
                        onChange={e => setFormData({...formData, position: e.target.value})}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        {ACADEMIC_POSITIONS.map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
                        <Lock size={16}/> รหัสผ่าน
                    </label>
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"}
                            value={formData.password}
                            onChange={e => setFormData({...formData, password: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button 
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                        </button>
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                        <FileSignature size={18} className="text-orange-600"/> ลายเซ็นดิจิทัล (สำคัญสำหรับใบลา)
                    </label>
                    
                    <div className="flex flex-col md:flex-row gap-6 items-center">
                        <div className="flex-1 w-full">
                            <label className="cursor-pointer bg-white hover:bg-blue-50 w-full p-4 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center gap-2 transition-all group">
                                <UploadCloud size={32} className="text-slate-400 group-hover:text-blue-500"/>
                                <span className="text-sm font-bold text-slate-600 group-hover:text-blue-600">คลิกเพื่ออัปโหลดไฟล์ภาพ</span>
                                <span className="text-xs text-slate-400 text-center">แนะนำไฟล์ .PNG พื้นหลังโปร่งใส<br/>ขนาดประมาณ 300x100 px</span>
                                <input type="file" accept="image/png,image/jpeg" onChange={handleSignatureUpload} className="hidden" />
                            </label>
                        </div>
                        
                        <div className="w-full md:w-48 h-24 border border-slate-300 bg-white rounded-lg flex items-center justify-center relative overflow-hidden">
                            {signaturePreview ? (
                                <img src={signaturePreview} alt="Signature" className="max-w-full max-h-full object-contain" />
                            ) : (
                                <span className="text-xs text-slate-300 italic">ตัวอย่างลายเซ็น</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isSaving ? 'กำลังบันทึก...' : <><Save size={20}/> บันทึกข้อมูล</>}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default UserProfile;
