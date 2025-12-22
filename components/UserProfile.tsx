
import React, { useState } from 'react';
import { Teacher } from '../types';
import { ACADEMIC_POSITIONS } from '../constants';
import { User, Lock, Save, UploadCloud, FileSignature, Briefcase, Eye, EyeOff, Loader } from 'lucide-react';
import { db, isConfigured, doc, setDoc } from '../firebaseConfig';

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

    // Helper: Resize Image and convert to PNG
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
                        resolve(canvas.toDataURL('image/png', 0.8)); // Convert to PNG
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

    const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const base64 = await resizeImage(file, 400); 
                setSignaturePreview(base64);
            } catch (error) {
                console.error("Error processing signature", error);
                alert("เกิดข้อผิดพลาดในการประมวลผลรูปภาพ");
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        
        const updated: Teacher = {
            ...currentUser,
            name: formData.name,
            position: formData.position,
            password: formData.password,
            signatureBase64: signaturePreview
        };

        try {
            if (isConfigured && db) {
                await setDoc(doc(db, 'teachers', updated.id), updated);
            }
            onUpdateUser(updated);
            alert("บันทึกข้อมูลเรียบร้อยแล้ว");
        } catch (error) {
            console.error("Save profile error", error);
            alert("บันทึกข้อมูลไม่สำเร็จ");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-20">
             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-bold text-2xl">
                    {formData.name[0]}
                </div>
                <div>
                    <h2 className="text-xl font-bold text-slate-800">ข้อมูลส่วนตัว</h2>
                    <p className="text-slate-500 text-sm">จัดการข้อมูลผู้ใช้งานและลายเซ็นดิจิทัล</p>
                </div>
             </div>

             <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                             <User size={16}/> ชื่อ - นามสกุล
                        </label>
                        <input 
                            type="text" 
                            required
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                             <Briefcase size={16}/> ตำแหน่ง
                        </label>
                        <select 
                            value={formData.position} 
                            onChange={e => setFormData({...formData, position: e.target.value})}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        >
                             {ACADEMIC_POSITIONS.map(p => (
                                <option key={p} value={p}>{p}</option>
                             ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">เลขบัตรประชาชน (ID)</label>
                        <input 
                            type="text" 
                            disabled
                            value={formData.id}
                            className="w-full px-3 py-2 border rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                             <Lock size={16}/> รหัสผ่าน
                        </label>
                        <div className="relative">
                            <input 
                                type={showPassword ? "text" : "password"} 
                                value={formData.password}
                                onChange={e => setFormData({...formData, password: e.target.value})}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="border-t pt-6">
                    <label className="block text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <FileSignature size={18}/> ลายเซ็นดิจิทัล (สำหรับลงนามเอกสาร)
                    </label>
                    
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="w-full md:w-1/2 h-32 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center bg-slate-50 overflow-hidden relative">
                            {signaturePreview ? (
                                <img src={signaturePreview} className="max-h-full max-w-full object-contain" alt="Signature" />
                            ) : (
                                <span className="text-slate-400 text-sm">ยังไม่มีลายเซ็น</span>
                            )}
                        </div>
                        <div className="flex-1 flex flex-col justify-center gap-2">
                            <p className="text-xs text-slate-500 mb-2">
                                อัปโหลดรูปภาพลายเซ็น (ไฟล์ภาพจะถูกบีบอัดอัตโนมัติเพื่อให้ลายเซ็นแสดงใน PDF ได้ดีที่สุด)
                            </p>
                            <label className="cursor-pointer bg-purple-50 text-purple-700 border border-purple-200 px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-purple-100 transition-colors">
                                <UploadCloud size={20}/> เลือกรูปภาพลายเซ็น
                                <input type="file" className="hidden" accept="image/*" onChange={handleSignatureUpload}/>
                            </label>
                            {signaturePreview && (
                                <button 
                                    type="button" 
                                    onClick={() => setSignaturePreview('')}
                                    className="text-red-500 text-sm hover:underline text-center"
                                >
                                    ลบลายเซ็น
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="bg-purple-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? <Loader className="animate-spin" size={20}/> : <Save size={20}/>} 
                        {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                    </button>
                </div>
             </form>
        </div>
    );
};

export default UserProfile;
