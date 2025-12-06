
import React, { useState } from 'react';
import { School, Teacher } from '../types';
import { Lock, User, Building, LogIn, UserPlus, ShieldAlert, Eye, EyeOff, Search, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';

interface LoginScreenProps {
    schools: School[];
    teachers: Teacher[];
    onLogin: (user: Teacher) => void;
    onRegister: (schoolId: string, id: string, name: string) => void;
    onSuperAdminLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ schools, teachers, onLogin, onRegister, onSuperAdminLogin }) => {
    const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'SUPER_ADMIN'>('LOGIN');
    
    // Login State
    // Removed loginSchoolId as per requirement
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    
    // Register State (Multi-step)
    const [regStep, setRegStep] = useState<1 | 2>(1);
    const [regSchoolId, setRegSchoolId] = useState('');
    const [foundSchool, setFoundSchool] = useState<School | null>(null);
    const [regUsername, setRegUsername] = useState('');
    const [regFullName, setRegFullName] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // 1. Check for Super Admin (Allow from ANY mode if username is 'admin')
        if (loginUsername === 'admin') {
            if (loginPassword === 'schoolos') {
                onSuperAdminLogin();
                return;
            } else {
                setError('รหัสผ่าน Super Admin ไม่ถูกต้อง');
                return;
            }
        }

        // 2. If explicitly in Super Admin mode but username is not admin
        if (mode === 'SUPER_ADMIN') {
            setError('ชื่อผู้ใช้งาน Super Admin ไม่ถูกต้อง (ต้องใช้ admin)');
            return;
        }

        // 3. Regular Teacher Login (Find User globally)
        const user = teachers.find(t => t.id === loginUsername);
        
        if (!user) {
            setError('ไม่พบข้อมูลผู้ใช้งาน (เลขบัตรประชาชนไม่ถูกต้อง)');
            return;
        }

        if (user.password !== loginPassword) {
            setError('รหัสผ่านไม่ถูกต้อง');
            return;
        }

        onLogin(user);
    };

    const handleCheckSchool = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (regSchoolId.length !== 8) {
            setError('กรุณากรอกรหัสโรงเรียนให้ครบ 8 หลัก');
            return;
        }

        const school = schools.find(s => s.id === regSchoolId);
        if (school) {
            setFoundSchool(school);
            setRegStep(2);
        } else {
            setError('ไม่สามารถติดตั้ง App ได้ ไม่มีข้อมูลโรงเรียนในระบบ กรุณาติดต่อ Super Admin เพื่อสร้างโรงเรียน');
        }
    };

    const handleFinalRegister = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (regUsername.length !== 13) {
            setError('เลขบัตรประชาชนต้องมี 13 หลัก');
            return;
        }

        const existingUser = teachers.find(t => t.id === regUsername);
        if (existingUser) {
            setError('เลขบัตรประชาชนนี้ลงทะเบียนไปแล้ว');
            return;
        }

        if (!regFullName) {
            setError('กรุณาระบุชื่อ-นามสกุล');
            return;
        }

        if (foundSchool) {
            onRegister(foundSchool.id, regUsername, regFullName);
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sarabun overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden my-auto">
                {/* Header */}
                <div className="bg-slate-800 p-6 text-center text-white">
                    <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                        <span className="font-bold text-3xl">S</span>
                    </div>
                    <h1 className="text-2xl font-bold">SchoolOS</h1>
                    <p className="text-slate-300 text-sm">ระบบบริหารจัดการโรงเรียนดิจิทัล</p>
                </div>

                {/* Tab Switcher */}
                {mode !== 'SUPER_ADMIN' && (
                    <div className="flex border-b">
                        <button 
                            onClick={() => { setMode('LOGIN'); setError(''); }}
                            className={`flex-1 py-3 text-sm font-bold transition-colors ${mode === 'LOGIN' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            เข้าสู่ระบบ
                        </button>
                        <button 
                            onClick={() => { setMode('REGISTER'); setError(''); setRegStep(1); setRegSchoolId(''); setFoundSchool(null); }}
                            className={`flex-1 py-3 text-sm font-bold transition-colors ${mode === 'REGISTER' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' : 'text-slate-500 hover:bg-slate-50'}`}
                        >
                            ติดตั้ง App / ลงทะเบียน
                        </button>
                    </div>
                )}

                {mode === 'SUPER_ADMIN' && (
                     <div className="bg-red-50 p-2 text-center text-red-600 text-sm font-bold border-b border-red-100">
                        เข้าสู่ระบบ Super Admin
                    </div>
                )}

                <div className="p-6">
                    {error && (
                        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg flex items-start gap-2">
                            <ShieldAlert size={16} className="shrink-0 mt-0.5"/>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* --- LOGIN MODE --- */}
                    {(mode === 'LOGIN' || mode === 'SUPER_ADMIN') && (
                        <form onSubmit={handleLogin} className="space-y-4 animate-fade-in">
                            {/* Note: School ID input removed for Login */}

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">
                                    {mode === 'SUPER_ADMIN' ? 'Username' : 'เลขบัตรประจำตัวประชาชน'}
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type="text" 
                                        required
                                        maxLength={mode === 'SUPER_ADMIN' ? 20 : 13}
                                        placeholder={mode === 'SUPER_ADMIN' ? 'admin' : 'เลขบัตร 13 หลัก หรือ admin'}
                                        value={loginUsername}
                                        onChange={(e) => setLoginUsername(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">รหัสผ่าน</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type={showPassword ? "text" : "password"} 
                                        required
                                        placeholder="รหัสผ่าน"
                                        value={loginPassword}
                                        onChange={(e) => setLoginPassword(e.target.value)}
                                        className="w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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

                            <button 
                                type="submit" 
                                className="w-full py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-bold shadow-lg flex items-center justify-center gap-2"
                            >
                                <LogIn size={20}/> เข้าสู่ระบบ
                            </button>
                        </form>
                    )}

                    {/* --- REGISTER MODE (STEP 1: SCHOOL ID) --- */}
                    {mode === 'REGISTER' && regStep === 1 && (
                        <form onSubmit={handleCheckSchool} className="space-y-4 animate-fade-in">
                            <div className="text-center mb-6">
                                <div className="bg-blue-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2 text-blue-600">
                                    <Building size={24}/>
                                </div>
                                <h3 className="font-bold text-slate-800">ขั้นตอนที่ 1: ยืนยันโรงเรียน</h3>
                                <p className="text-xs text-slate-500">กรุณาระบุรหัสโรงเรียน 8 หลัก เพื่อเริ่มต้นการติดตั้ง App</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">รหัสโรงเรียน</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type="text" 
                                        required
                                        maxLength={8}
                                        placeholder="XXXXXXXX"
                                        value={regSchoolId}
                                        onChange={(e) => setRegSchoolId(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 outline-none font-mono text-center text-lg tracking-widest"
                                    />
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg flex items-center justify-center gap-2"
                            >
                                ตรวจสอบ <ArrowRight size={20}/>
                            </button>
                        </form>
                    )}

                    {/* --- REGISTER MODE (STEP 2: USER INFO) --- */}
                    {mode === 'REGISTER' && regStep === 2 && foundSchool && (
                        <form onSubmit={handleFinalRegister} className="space-y-4 animate-fade-in">
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
                                <div className="flex items-center justify-center gap-2 text-green-700 font-bold mb-1">
                                    <CheckCircle size={20}/> พบข้อมูลในระบบ
                                </div>
                                <h3 className="font-bold text-lg text-slate-800">{foundSchool.name}</h3>
                                <p className="text-xs text-slate-500">{foundSchool.district} {foundSchool.province}</p>
                            </div>

                            <div className="text-center mb-2">
                                <h3 className="font-bold text-slate-800">ขั้นตอนที่ 2: ลงทะเบียนครู</h3>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">เลขบัตรประจำตัวประชาชน (Username)</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type="text" 
                                        required
                                        maxLength={13}
                                        placeholder="เลขบัตร 13 หลัก"
                                        value={regUsername}
                                        onChange={(e) => setRegUsername(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อ - นามสกุล</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="ระบุชื่อจริง นามสกุล"
                                        value={regFullName}
                                        onChange={(e) => setRegFullName(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800 border border-blue-100">
                                <p className="font-bold mb-1">หมายเหตุ:</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li>รหัสผ่านเริ่มต้นคือ <strong>123456</strong> (อัตโนมัติ)</li>
                                    <li>ท่านจะต้องเปลี่ยนรหัสผ่านในการเข้าใช้งานครั้งแรก</li>
                                </ul>
                            </div>

                            <div className="flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={() => { setRegStep(1); setFoundSchool(null); }}
                                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 font-bold"
                                >
                                    <ArrowLeft size={20} className="mx-auto"/>
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-[3] py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold shadow-lg flex items-center justify-center gap-2"
                                >
                                    <UserPlus size={20}/> ยืนยันการติดตั้ง
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                        {mode === 'SUPER_ADMIN' ? (
                            <button onClick={() => setMode('LOGIN')} className="text-sm text-slate-500 hover:text-blue-600 underline">
                                กลับหน้าหลัก
                            </button>
                        ) : (
                            <button onClick={() => setMode('SUPER_ADMIN')} className="text-xs text-slate-300 hover:text-slate-500">
                                สำหรับผู้ดูแลระบบสูงสุด (Super Admin)
                            </button>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Version Info */}
            <div className="fixed bottom-4 text-xs text-slate-400 text-center w-full pointer-events-none">
                SchoolOS v1.1.0 | รองรับการใช้งาน Mobile & Desktop
            </div>
        </div>
    );
};

export default LoginScreen;
