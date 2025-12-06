
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import DocumentsSystem from './components/DocumentsSystem';
import LeaveSystem from './components/LeaveSystem';
import FinanceSystem from './components/FinanceSystem';
import AttendanceSystem from './components/AttendanceSystem';
import ActionPlanSystem from './components/ActionPlanSystem';
import AdminUserManagement from './components/AdminUserManagement';
import LoginScreen from './components/LoginScreen';
import FirstLoginSetup from './components/FirstLoginSetup';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import { SystemView, Teacher, School, TeacherRole } from './types';
import { Menu, Activity, Users, Clock, FileText, CalendarRange, Loader } from 'lucide-react';
import { MOCK_DOCUMENTS, MOCK_LEAVE_REQUESTS, MOCK_TRANSACTIONS, MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';

// Keys for LocalStorage
const SESSION_KEY = 'schoolos_session_v1';

const App: React.FC = () => {
    // Global Data State
    const [allTeachers, setAllTeachers] = useState<Teacher[]>(MOCK_TEACHERS);
    const [allSchools, setAllSchools] = useState<School[]>(MOCK_SCHOOLS);
    
    // Auth State
    const [currentUser, setCurrentUser] = useState<Teacher | null>(null);
    const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Check LocalStorage on Mount (Auto Login)
    useEffect(() => {
        const storedSession = localStorage.getItem(SESSION_KEY);
        if (storedSession) {
            try {
                const session = JSON.parse(storedSession);
                if (session.isSuperAdmin) {
                    setIsSuperAdminMode(true);
                } else {
                    const user = allTeachers.find(t => t.id === session.userId);
                    if (user) setCurrentUser(user);
                }
            } catch (e) {
                console.error("Session parse error", e);
                localStorage.removeItem(SESSION_KEY);
            }
        }
        setIsLoading(false);
    }, []);

    // UI State
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // --- Auth Handlers ---

    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        // Save Session
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleRegister = (schoolId: string, id: string, name: string) => {
        const newUser: Teacher = {
            id,
            schoolId,
            name,
            password: '123456', // Default Password
            position: 'ครู',
            roles: ['TEACHER'],
            isFirstLogin: true // Force Setup
        };
        setAllTeachers([...allTeachers, newUser]);
        // Auto Login after register
        handleLogin(newUser);
    };

    const handleSuperAdminLogin = () => {
        setIsSuperAdminMode(true);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ isSuperAdmin: true }));
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setIsSuperAdminMode(false);
        localStorage.removeItem(SESSION_KEY);
        setCurrentView(SystemView.DASHBOARD);
    };

    const handleFirstLoginComplete = (newPass: string, position: string) => {
        if (!currentUser) return;
        
        const updatedUser: Teacher = { 
            ...currentUser, 
            password: newPass, 
            position: position, 
            isFirstLogin: false,
            // If Director position chosen, add role automatically
            roles: position.includes('ผู้อำนวยการ') ? (['DIRECTOR', 'TEACHER'] as TeacherRole[]) : currentUser.roles
        };

        const updatedList = allTeachers.map(t => t.id === currentUser.id ? updatedUser : t);
        setAllTeachers(updatedList);
        setCurrentUser(updatedUser);
        alert('ตั้งค่าเรียบร้อยแล้ว ยินดีต้อนรับเข้าสู่ระบบ');
    };

    // --- School & User Management Handlers ---

    const handleCreateSchool = (newSchool: School) => {
        setAllSchools([...allSchools, newSchool]);
    };

    const handleUpdateSchool = (updatedSchool: School) => {
        setAllSchools(allSchools.map(s => s.id === updatedSchool.id ? updatedSchool : s));
    };

    const handleDeleteSchool = (schoolId: string) => {
        setAllSchools(allSchools.filter(s => s.id !== schoolId));
        // Optionally clean up teachers associated with this school
        // setAllTeachers(allTeachers.filter(t => t.schoolId !== schoolId));
    };

    const handleUpdateTeacher = (updatedTeacher: Teacher) => {
        setAllTeachers(allTeachers.map(t => t.id === updatedTeacher.id ? updatedTeacher : t));
    };

    // --- Loading Screen ---
    if (isLoading) {
        return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400 gap-2"><Loader className="animate-spin"/> กำลังโหลด...</div>;
    }

    // --- Router Logic ---

    // 1. Super Admin View
    if (isSuperAdminMode) {
        return <SuperAdminDashboard 
            schools={allSchools} 
            teachers={allTeachers}
            onCreateSchool={handleCreateSchool} 
            onUpdateSchool={handleUpdateSchool}
            onDeleteSchool={handleDeleteSchool}
            onUpdateTeacher={handleUpdateTeacher}
            onLogout={handleLogout} 
        />;
    }

    // 2. Login Screen
    if (!currentUser) {
        return (
            <LoginScreen 
                schools={allSchools}
                teachers={allTeachers}
                onLogin={handleLogin}
                onRegister={handleRegister}
                onSuperAdminLogin={handleSuperAdminLogin}
            />
        );
    }

    // 3. First Login Setup
    if (currentUser.isFirstLogin) {
        return (
            <FirstLoginSetup 
                user={currentUser} 
                onComplete={handleFirstLoginComplete} 
                onLogout={handleLogout}
            />
        );
    }

    // --- 4. Main App (School System) ---
    
    // Filter Data by School ID
    const schoolTeachers = allTeachers.filter(t => t.schoolId === currentUser.schoolId);
    
    // Dashboard Overview Component (Internal)
    const Dashboard = () => {
        // Filter Mocks by School ID (In real DB this is done by Query)
        const schoolDocs = MOCK_DOCUMENTS.filter(d => d.schoolId === currentUser.schoolId);
        const schoolLeaves = MOCK_LEAVE_REQUESTS.filter(l => l.schoolId === currentUser.schoolId);
        const schoolTrans = MOCK_TRANSACTIONS.filter(t => t.schoolId === currentUser.schoolId);

        const unreadDocs = schoolDocs.filter(d => 
            d.status === 'Distributed' && 
            d.targetTeachers.includes(currentUser.id) && 
            !d.acknowledgedBy.includes(currentUser.id)
        ).length;
        
        const pendingLeaves = schoolLeaves.filter(l => l.status === 'Pending').length;
        const todayTrans = schoolTrans.length;
        
        const currentSchool = allSchools.find(s => s.id === currentUser.schoolId);

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="mb-6">
                    <h2 className="text-3xl font-bold text-slate-800">ยินดีต้อนรับ, {currentUser.name}</h2>
                    <p className="text-slate-500">{currentSchool?.name} (รหัส: {currentSchool?.id})</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                    <button onClick={() => setCurrentView(SystemView.DOCUMENTS)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all text-left group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <FileText size={24} />
                            </div>
                            {unreadDocs > 0 && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">{unreadDocs} ใหม่</span>}
                        </div>
                        <h3 className="font-bold text-slate-700">หนังสือราชการ</h3>
                        <p className="text-sm text-slate-500">รอเปิดอ่าน {unreadDocs} ฉบับ</p>
                    </button>

                    <button onClick={() => setCurrentView(SystemView.PLAN)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all text-left group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                <CalendarRange size={24} />
                            </div>
                        </div>
                        <h3 className="font-bold text-slate-700">แผนปฏิบัติการ</h3>
                        <p className="text-sm text-slate-500">จัดการโครงการ/งบประมาณ</p>
                    </button>

                    <button onClick={() => setCurrentView(SystemView.LEAVE)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all text-left group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <Users size={24} />
                            </div>
                        </div>
                        <h3 className="font-bold text-slate-700">สถานะการลา</h3>
                        <p className="text-sm text-slate-500">{pendingLeaves > 0 ? `${pendingLeaves} รายการรออนุมัติ` : 'ปกติ'}</p>
                    </button>

                    <button onClick={() => setCurrentView(SystemView.FINANCE)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all text-left group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <Activity size={24} />
                            </div>
                        </div>
                        <h3 className="font-bold text-slate-700">การเงิน</h3>
                        <p className="text-sm text-slate-500">เคลื่อนไหว {todayTrans} รายการ</p>
                    </button>

                    <button onClick={() => setCurrentView(SystemView.ATTENDANCE)} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-all text-left group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                <Clock size={24} />
                            </div>
                            <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">พร้อมใช้งาน</span>
                        </div>
                        <h3 className="font-bold text-slate-700">ลงเวลาทำงาน</h3>
                        <p className="text-sm text-slate-500">แตะเพื่อเช็คอิน</p>
                    </button>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        // Pass only school teachers to components
        switch (currentView) {
            case SystemView.DOCUMENTS: return <DocumentsSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
            case SystemView.LEAVE: return <LeaveSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
            case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser} />;
            case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
            case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser} />;
            case SystemView.ADMIN_USERS: return <AdminUserManagement 
                teachers={schoolTeachers} 
                currentSchoolId={currentUser.schoolId} 
                onUpdateTeachers={(updated) => {
                    // Merge updated school teachers back to global state
                    const otherTeachers = allTeachers.filter(t => t.schoolId !== currentUser.schoolId);
                    setAllTeachers([...otherTeachers, ...updated]);
                }} 
            />;
            default: return <Dashboard />;
        }
    };

    return (
        <div className="flex h-screen bg-slate-50 font-sarabun overflow-hidden">
            <Sidebar 
                currentView={currentView} 
                onChangeView={setCurrentView} 
                isMobileOpen={isMobileMenuOpen}
                toggleMobile={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                currentUser={currentUser}
                allTeachers={schoolTeachers} // Only show school colleagues
                onSwitchUser={(id) => {
                    // For dev purposes: easy switch within school
                    const t = schoolTeachers.find(u => u.id === id);
                    if(t) handleLogin(t);
                }}
            />
            
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                <header className="bg-white h-16 shadow-sm border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden text-slate-500 hover:text-slate-800">
                            <Menu size={24} />
                        </button>
                        <h1 className="text-xl font-bold text-slate-800 hidden sm:block">
                            {currentView === SystemView.DASHBOARD ? 'Dashboard' : 
                             currentView === SystemView.DOCUMENTS ? 'ระบบงานสารบรรณ' :
                             currentView === SystemView.LEAVE ? 'ระบบการลา' :
                             currentView === SystemView.FINANCE ? 'ระบบการเงิน' : 
                             currentView === SystemView.PLAN ? 'แผนปฏิบัติการประจำปี' :
                             currentView === SystemView.ADMIN_USERS ? 'ผู้ดูแลระบบ' : 'ลงเวลาปฏิบัติงาน'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold">
                                {currentUser.name[0]}
                             </div>
                             <div className="hidden md:block text-right">
                                <div className="text-sm font-medium text-slate-800">{currentUser.name}</div>
                                <div className="text-xs text-slate-500">{currentUser.position}</div>
                             </div>
                             <button onClick={handleLogout} className="ml-2 text-xs text-red-500 hover:text-red-700 underline hidden md:inline">
                                 ออกจากระบบ
                             </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-4 lg:p-8 relative">
                    <div className="max-w-7xl mx-auto">
                        {renderContent()}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;
