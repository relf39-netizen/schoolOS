
import React, { useState, useEffect } from 'react';
import { Teacher } from '../types';
import { ACADEMIC_POSITIONS } from '../constants';
import { User, Lock, Save, UploadCloud, FileSignature, Briefcase, Eye, EyeOff, Loader, MessageCircle, Database } from 'lucide-react';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';

interface UserProfileProps {
    currentUser: Teacher;
    onUpdateUser: (updatedUser: Teacher) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ currentUser, onUpdateUser }) => {
    const [formData, setFormData] = useState({
        name: currentUser.name,
        position: currentUser.position,
        password: currentUser.password || '',
        id: currentUser.id,
        telegramChatId: currentUser.telegramChatId || ''
    });
    const [signaturePreview, setSignaturePreview] = useState<string>(currentUser.signatureBase64 || '');
    const [showPassword, setShowPassword] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // เมื่อ currentUser เปลี่ยน (เช่น เมื่อ Sync จาก Cloud สำเร็จ) ให้รีเฟรชข้อมูลในฟอร์ม
    useEffect(() => {
        setFormData({
            name: currentUser.name,
            position: currentUser.position,
            password: currentUser.password || '',
            id: currentUser.id,
            telegramChatId: currentUser.telegramChatId || ''
        });
        setSignaturePreview(currentUser.signatureBase64 || '');
    }, [currentUser.id, currentUser.name, currentUser.signatureBase64]);

    // ฟังก์ชันบีบอัดรูปภาพให้เล็กลงแต่ยังชัดพอสำหรับเอกสารราชการ (ป้องกันการบันทึกล้มเหลวเพราะข้อมูลใหญ่เกินไป)
    const resizeImage = (file: File, maxWidth: number = 350): Promise<string> => {
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
                        // บังคับพื้นหลังสีขาวกรณีไฟล์ที่อัปโหลดเป็น PNG โปร่งใส
                        ctx.fillStyle = "#FFFFFF";
                        ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);
                        // บันทึกเป็น JPEG คุณภาพ 0.6 เพื่อขนาดไฟล์ที่เหมาะสมที่สุดสำหรับ SQL Text Column
                        resolve(canvas.toDataURL('image/jpeg', 0.6));
                    } else {
                        reject(new Error("Canvas context is null"));
                    }
                };
                img.onerror = () => reject(new Error("Failed to load image"));
                img.src = event.target?.result as string;
            };
            reader.onerror = (error) => reject(error);
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
                alert("เกิดข้อผิดพลาดในการประมวลผลรูปภาพ กรุณาลองใหม่อีกครั้ง");
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!isSupabaseConfigured || !supabase) {
            alert("ระบบฐานข้อมูลคลาวด์ยังไม่ถูกตั้งค่า ไม่สามารถบันทึกข้อมูลถาวรได้");
            return;
        }

        setIsSaving(true);
        
        const updatedUserObject: Teacher = {
            ...currentUser,
            name: formData.name,
            position: formData.position,
            password: formData.password,
            signatureBase64: signaturePreview,
            telegramChatId: formData.telegramChatId
        };

        try {
            // บันทึกลง Supabase profiles table
            const { error } = await supabase
                .from('profiles')
                .update({
                    name: updatedUserObject.name,
                    position: updatedUserObject.position,
                    password: updatedUserObject.password,
                    signature_base_64: updatedUserObject.signatureBase64,
                    telegram_chat_id: updatedUserObject.telegramChatId
                })
                .eq('id', updatedUserObject.id);

            if (error) throw error;

            // หากบันทึกสำเร็จ ให้อัปเดตสถานะในหน้าหลัก App.tsx
            onUpdateUser(updatedUserObject);
            alert("บันทึกข้อมูลส่วนตัวและลายเซ็นดิจิทัลลงฐานข้อมูลคลาวด์เรียบร้อยแล้ว ท่านสามารถใช้งานได้ทุกที่");
        } catch (error: any) {
            console.error("SQL Save Error:", error);
            alert("บันทึกล้มเหลว: " + (error.message || "ปัญหาการเชื่อมต่อกับเซิร์ฟเวอร์"));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-20">
             {/* Profile Header */}
             <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex items-center gap-6">
                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-3xl flex items-center justify-center font-black text-3xl shadow-inner">
                    {formData.name[0]}
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">ข้อมูลส่วนตัว</h2>
                    <p className="text-slate-500 text-sm font-bold uppercase tracking-widest flex items-center gap-1">
                        <Database size={12}/> SQL Database Persistence
                    </p>
                </div>
             </div>

             <form onSubmit={handleSubmit} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-2">
                             <User size={14} className="text-blue-500"/> ชื่อ - นามสกุล
                        </label>
                        <input 
                            type="text" 
                            required 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                            className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none font-bold bg-slate-50 focus:bg-white transition-all shadow-sm" 
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-2">
                             <Briefcase size={14} className="text-blue-500"/> ตำแหน่ง
                        </label>
                        <select 
                            value={formData.position} 
                            onChange={e => setFormData({...formData, position: e.target.value})} 
                            className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none font-bold bg-slate-50 focus:bg-white transition-all shadow-sm"
                        >
                             {ACADEMIC_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">เลขบัตรประชาชน (ใช้สำหรับ Login)</label>
                        <input type="text" disabled value={formData.id} className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl bg-slate-100 text-slate-400 cursor-not-allowed font-mono font-bold" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-2">
                             <Lock size={14} className="text-blue-500"/> รหัสผ่าน
                        </label>
                        <div className="relative">
                            <input 
                                type={showPassword ? "text" : "password"} 
                                value={formData.password} 
                                onChange={e => setFormData({...formData, password: e.target.value})} 
                                className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none font-bold bg-slate-50 focus:bg-white transition-all shadow-sm" 
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowPassword(!showPassword)} 
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                            </button>
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1 flex items-center gap-2">
                            <MessageCircle size={14} className="text-blue-500"/> Telegram Chat ID (สำหรับรับแจ้งเตือนส่วนตัว)
                        </label>
                        <input 
                            type="text" 
                            value={formData.telegramChatId} 
                            onChange={e => setFormData({...formData, telegramChatId: e.target.value})} 
                            placeholder="ตัวอย่าง: 123456789" 
                            className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl focus:border-blue-500 outline-none font-mono font-bold bg-slate-50 focus:bg-white transition-all shadow-sm" 
                        />
                    </div>
                </div>

                {/* Signature Upload Section */}
                <div className="border-t border-slate-100 pt-8">
                    <label className="block text-sm font-black text-slate-700 mb-6 flex items-center gap-2 uppercase tracking-wide">
                        <FileSignature size={20} className="text-blue-600"/> ลายเซ็นดิจิทัล (จัดเก็บในระบบคลาวด์ถาวร)
                    </label>
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="w-full md:w-1/2 h-40 border-4 border-dashed border-slate-100 rounded-[2rem] flex items-center justify-center bg-slate-50 overflow-hidden relative shadow-inner group">
                            {signaturePreview ? (
                                <img src={signaturePreview} className="max-h-full max-w-full object-contain p-4 drop-shadow-md" alt="Signature Preview" />
                            ) : (
                                <div className="text-center">
                                    <FileSignature className="mx-auto text-slate-200 mb-2" size={32}/>
                                    <span className="text-slate-300 text-[10px] font-black uppercase tracking-widest">No Signature Found</span>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 flex flex-col justify-center space-y-4">
                            <label className="cursor-pointer bg-slate-900 text-white px-6 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-black transition-all active:scale-95 shadow-xl uppercase tracking-widest text-xs">
                                <UploadCloud size={20}/> เลือกรูปภาพลายเซ็น
                                <input type="file" className="hidden" accept="image/*" onChange={handleSignatureUpload}/>
                            </label>
                            {signaturePreview && (
                                <button 
                                    type="button" 
                                    onClick={() => setSignaturePreview('')} 
                                    className="text-red-500 text-xs font-black uppercase tracking-widest hover:underline text-center transition-all"
                                >
                                    ลบรูปภาพทิ้ง
                                </button>
                            )}
                            <p className="text-[10px] text-slate-400 font-bold italic leading-relaxed">
                                * แนะนำ: ใช้ลายเซ็นบนพื้นหลังสีขาวหรือโปร่งใส ระบบจะบีบอัดรูปภาพให้อัตโนมัติเพื่อให้การแสดงผลใน PDF รวดเร็วที่สุด
                            </p>
                        </div>
                    </div>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-6 border-t border-slate-50">
                    <button 
                        type="submit" 
                        disabled={isSaving} 
                        className="bg-blue-600 text-white px-12 py-5 rounded-[2rem] font-black shadow-2xl shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-3 transition-all active:scale-95 uppercase tracking-widest text-lg"
                    >
                        {isSaving ? <Loader className="animate-spin" size={24}/> : <Save size={24}/>} 
                        {isSaving ? 'กำลังบันทึกลง SQL...' : 'บันทึกข้อมูลถาวร'}
                    </button>
                </div>
             </form>
        </div>
    );
};

export default UserProfile;
