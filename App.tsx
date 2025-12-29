
import React, { useState, useEffect } from 'react';
import DocumentsSystem from './components/DocumentsSystem';
import LeaveSystem from './components/LeaveSystem';
import FinanceSystem from './components/FinanceSystem';
import AttendanceSystem from './components/AttendanceSystem';
import ActionPlanSystem from './components/ActionPlanSystem';
import AcademicSystem from './components/AcademicSystem';
import AdminUserManagement from './components/AdminUserManagement';
import UserProfile from './components/UserProfile';
import LoginScreen from './components/LoginScreen';
import FirstLoginSetup from './components/FirstLoginSetup';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import DirectorCalendar from './components/DirectorCalendar'; 
import { SystemView, Teacher, School, TeacherRole, DocumentItem } from './types';
import { 
    Activity, Users, Clock, FileText, CalendarRange, 
    Loader, Database, ServerOff, LogOut, 
    Settings, ChevronLeft, LayoutGrid, Bell, UserCircle, ExternalLink, X, Calendar, GraduationCap
} from 'lucide-react';
import { MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';
import { isConfigured, type QuerySnapshot, type DocumentData } from './firebaseConfig';
import { supabase, isConfigured as isSupabaseConfigured } from './supabaseClient';

const SESSION_KEY = 'schoolos_session_v1';
const APP_LOGO_URL = "https://img2.pic.in.th/pic/9c2e0f8ba684e3441fc58d880fdf143d.png";

interface AppNotification {
    message: string;
    type: 'info' | 'alert';
    linkTo?: SystemView;
    linkId?: string;
}

const App: React.FC = () => {
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [currentUser, setCurrentUser] = useState<Teacher | null>(null);
    const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [notification, setNotification] = useState<AppNotification | null>(null);
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [pendingDocCount, setPendingDocCount] = useState(0);
    const [focusItem, setFocusItem] = useState<{ view: SystemView, id: string } | null>(null);
    const [pendingDeepLink, setPendingDeepLink] = useState<{ view: SystemView, id: string } | null>(null);
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);

    // Hybrid Data Loading: Supabase Sync for main data
    useEffect(() => {
        const loadData = async () => {
            if (isSupabaseConfigured && supabase) {
                const { data: schools } = await supabase.from('schools').select('*');
                if (schools) setAllSchools(schools.map(s => ({
                    id: s.id, name: s.name, district: s.district, province: s.province,
                    lat: s.lat, lng: s.lng, radius: s.radius, lateTimeThreshold: s.late_time_threshold,
                    logoBase64: s.logo_base_64, isSuspended: s.is_suspended
                })));

                const { data: profiles } = await supabase.from('profiles').select('*');
                if (profiles) setAllTeachers(profiles.map(p => ({
                    id: p.id, schoolId: p.school_id, name: p.name, password: p.password,
                    position: p.position, roles: p.roles as TeacherRole[], 
                    signatureBase64: p.signature_base_64, telegramChatId: p.telegram_chat_id,
                    isSuspended: p.is_suspended
                })));
                
                setIsDataLoaded(true);
                setIsLoading(false);
            } else {
                setAllSchools(MOCK_SCHOOLS);
                setAllTeachers(MOCK_TEACHERS);
                setIsDataLoaded(true);
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    // Real-time Pending Counts via Supabase
    useEffect(() => {
        if (!currentUser || !isSupabaseConfigured || !supabase) return;

        const fetchCounts = async () => {
            // 1. Pending Leave Count
            const { count: leaveCount } = await supabase!
                .from('leave_requests')
                .select('*', { count: 'exact', head: true })
                .eq('school_id', currentUser.schoolId)
                .eq('status', 'Pending');
            setPendingLeaveCount(leaveCount || 0);

            // 2. Pending Document Count based on roles
            const isDirector = currentUser.roles.includes('DIRECTOR');
            const isViceDirector = currentUser.roles.includes('VICE_DIRECTOR');

            const { data: docData, error: docError } = await supabase!
                .from('documents')
                .select('id, status, target_teachers, acknowledged_by, assigned_vice_director_id')
                .eq('school_id', currentUser.schoolId);

            if (!docError && docData) {
                let count = 0;
                if (isDirector) {
                    count = docData.filter(d => d.status === 'PendingDirector').length;
                } else if (isViceDirector) {
                    count = docData.filter(d => d.status === 'PendingViceDirector' && d.assigned_vice_director_id === currentUser.id).length;
                } else {
                    // Regular Teacher - count Distributed but not yet acknowledged
                    count = docData.filter(d => 
                        d.status === 'Distributed' && 
                        (d.target_teachers || []).includes(currentUser.id) && 
                        !(d.acknowledged_by || []).includes(currentUser.id)
                    ).length;
                }
                setPendingDocCount(count);
            }
        };

        fetchCounts();

        const leaveChannel = supabase!.channel('app_counts_leave').on('postgres_changes', { 
            event: '*', schema: 'public', table: 'leave_requests', filter: `school_id=eq.${currentUser.schoolId}` 
        }, () => fetchCounts()).subscribe();

        const docChannel = supabase!.channel('app_counts_docs').on('postgres_changes', { 
            event: '*', schema: 'public', table: 'documents', filter: `school_id=eq.${currentUser.schoolId}` 
        }, () => fetchCounts()).subscribe();

        return () => {
            supabase!.removeChannel(leaveChannel);
            supabase!.removeChannel(docChannel);
        };
    }, [currentUser?.id, currentUser?.schoolId]);

    useEffect(() => {
        if (!isDataLoaded) return;
        const storedSession = localStorage.getItem(SESSION_KEY);
        if (storedSession) {
            try {
                const session = JSON.parse(storedSession);
                if (session.isSuperAdmin) setIsSuperAdminMode(true);
                else {
                    const user = allTeachers.find(t => t.id === session.userId);
                    const school = allSchools.find(s => s.id === user?.schoolId);
                    if (user && !user.isSuspended && !school?.isSuspended) {
                        setCurrentUser(user);
                    } else if (user) {
                        alert("บัญชีของท่านหรือโรงเรียนถูกระงับการใช้งาน");
                        handleLogout();
                    }
                }
            } catch (e) { localStorage.removeItem(SESSION_KEY); }
        }
        const params = new URLSearchParams(window.location.search);
        const viewParam = params.get('view');
        const idParam = params.get('id');
        if (viewParam && idParam && Object.values(SystemView).includes(viewParam as SystemView)) {
            setPendingDeepLink({ view: viewParam as SystemView, id: idParam });
        }
    }, [isDataLoaded, allTeachers, allSchools]);

    useEffect(() => {
        if (currentUser && pendingDeepLink) {
            setCurrentView(pendingDeepLink.view);
            setFocusItem({ view: pendingDeepLink.view, id: pendingDeepLink.id });
            setPendingDeepLink(null); 
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [currentUser, pendingDeepLink]);

    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleRegister = async (schoolId: string, id: string, name: string) => {
        const newUser: Teacher = { id, schoolId, name, password: '123456', position: 'ครู', roles: ['TEACHER'], isFirstLogin: true };
        if (isSupabaseConfigured && supabase) {
            const { error } = await supabase.from('profiles').upsert([{
                id, school_id: schoolId, name, password: '123456', position: 'ครู', roles: ['TEACHER']
            }]);
            if (error) { alert("สมัครสมาชิกไม่สำเร็จ: " + error.message); return; }
        }
        setAllTeachers([...allTeachers, newUser]);
        handleLogin(newUser);
    };

    const handleLogout = () => {
        setCurrentUser(null); setIsSuperAdminMode(false);
        localStorage.removeItem(SESSION_KEY); setCurrentView(SystemView.DASHBOARD);
    };

    const handleFirstLoginComplete = async (newPass: string, position: string) => {
        if (!currentUser) return;
        const updatedUser: Teacher = { ...currentUser, password: newPass, position, isFirstLogin: false, roles: position.includes('ผู้อำนวยการ') ? ['DIRECTOR', 'TEACHER'] : currentUser.roles };
        if (isSupabaseConfigured && supabase) {
            const { error } = await supabase.from('profiles').upsert([{
                id: updatedUser.id, school_id: updatedUser.schoolId, name: updatedUser.name, 
                password: newPass, position, roles: updatedUser.roles
            }]);
            if (error) alert("Error: " + error.message);
        }
        setAllTeachers(allTeachers.map(t => t.id === currentUser.id ? updatedUser : t));
        setCurrentUser(updatedUser);
    };

    const handleUpdateSchool = async (s: School) => {
        if (isSupabaseConfigured && supabase) {
            await supabase.from('schools').upsert([{ id: s.id, name: s.name, district: s.district, province: s.province, lat: s.lat, lng: s.lng, radius: s.radius, late_time_threshold: s.lateTimeThreshold, is_suspended: s.isSuspended || false }]);
            setAllSchools(allSchools.map(sch => sch.id === s.id ? s : sch));
        }
    };

    const handleAddTeacher = async (t: Teacher) => { 
        if (isSupabaseConfigured && supabase) {
            await supabase.from('profiles').upsert([{ id: t.id, school_id: t.schoolId, name: t.name, password: t.password, position: t.position, roles: t.roles, is_suspended: false }]);
            setAllTeachers([...allTeachers, { ...t, isSuspended: false }]);
        }
    };

    const handleEditTeacher = async (t: Teacher) => { 
        if (isSupabaseConfigured && supabase) {
            await supabase.from('profiles').upsert([{
                id: t.id, school_id: t.schoolId, name: t.name, password: t.password,
                position: t.position, roles: t.roles, signature_base_64: t.signatureBase64,
                telegram_chat_id: t.telegramChatId, is_suspended: t.isSuspended || false
            }]);
            setAllTeachers(allTeachers.map(teacher => teacher.id === t.id ? t : teacher));
        }
    };

    const handleDeleteTeacher = async (id: string) => { 
        if (isSupabaseConfigured && supabase) {
            await supabase.from('profiles').delete().eq('id', id);
            setAllTeachers(allTeachers.filter(t => t.id !== id));
        }
    };

    const handleNotificationClick = () => {
        if (notification?.linkTo) {
            setCurrentView(notification.linkTo);
            if (notification.linkId) setFocusItem({ view: notification.linkTo, id: notification.linkId });
            setNotification(null);
        }
    };

    const schoolTeachers = allTeachers.filter(t => t.schoolId === currentUser?.schoolId);
    const currentSchool = allSchools.find(s => s.id === currentUser?.schoolId);

    // Dynamic Module Config with counts
    const isDirector = currentUser?.roles.includes('DIRECTOR');
    const isViceDirector = currentUser?.roles.includes('VICE_DIRECTOR');

    const getDocStatusText = () => {
        if (pendingDocCount === 0) return null;
        if (isDirector) return `มีหนังสือรอเกษียณ ${pendingDocCount} ฉบับ`;
        if (isViceDirector) return `มีหนังสือรอสั่งการ ${pendingDocCount} ฉบับ`;
        return `มีหนังสือเข้าใหม่ ${pendingDocCount} ฉบับ`;
    };

    const modules = [
        { id: SystemView.PROFILE, title: 'ข้อมูลส่วนตัว', slogan: 'แก้ไขรหัสผ่าน / ลายเซ็นดิจิทัล', icon: UserCircle, color: 'from-purple-500 to-indigo-400', shadow: 'shadow-purple-200', visible: true },
        { id: SystemView.DIRECTOR_CALENDAR, title: 'ปฏิทินปฏิบัติงาน ผอ.', slogan: 'แจ้งเตือนนัดหมาย และภารกิจ', icon: Calendar, color: 'from-indigo-500 to-blue-400', shadow: 'shadow-indigo-200', visible: true },
        { id: SystemView.ACADEMIC, title: 'งานวิชาการ', slogan: 'สถิตินักเรียน / ผลสอบ O-NET', icon: GraduationCap, color: 'from-indigo-600 to-violet-500', shadow: 'shadow-indigo-200', visible: true },
        { 
            id: SystemView.DOCUMENTS, 
            title: 'งานสารบรรณ', 
            slogan: 'รับ-ส่ง รวดเร็ว ทันใจ', 
            badge: getDocStatusText(),
            icon: FileText, 
            color: 'from-blue-500 to-cyan-400', 
            shadow: 'shadow-blue-200', 
            visible: true 
        },
        { id: SystemView.PLAN, title: 'แผนปฏิบัติการ', slogan: 'วางแผนแม่นยำ สู่ความสำเร็จ', icon: CalendarRange, color: 'from-violet-500 to-fuchsia-400', shadow: 'shadow-violet-200', visible: true },
        { id: SystemView.LEAVE, title: 'ระบบการลา', slogan: 'โปร่งใส ตรวจสอบง่าย', icon: Users, color: 'from-emerald-500 to-teal-400', shadow: 'shadow-emerald-200', visible: true, badge: pendingLeaveCount > 0 ? `รอพิจารณา ${pendingLeaveCount} รายการ` : null },
        { id: SystemView.FINANCE, title: 'ระบบการเงิน', slogan: 'คุมงบประมาณ อย่างมีประสิทธิภาพ', icon: Activity, color: 'from-amber-500 to-orange-400', shadow: 'shadow-amber-200', visible: currentUser?.roles.includes('DIRECTOR') || currentUser?.roles.includes('FINANCE_BUDGET') || currentUser?.roles.includes('FINANCE_NONBUDGET') || currentUser?.roles.includes('FINANCE_COOP') },
        { id: SystemView.ATTENDANCE, title: 'ลงเวลาทำงาน', slogan: 'เช็คเวลาแม่นยำ ด้วย GPS', icon: Clock, color: 'from-rose-500 to-pink-400', shadow: 'shadow-rose-200', visible: true },
        { id: SystemView.ADMIN_USERS, title: 'ผู้ดูแลระบบ', slogan: 'ตั้งค่าระบบ และผู้ใช้งาน', icon: Settings, color: 'from-slate-600 to-slate-400', shadow: 'shadow-slate-200', visible: currentUser?.roles.includes('SYSTEM_ADMIN') || currentUser?.roles.includes('DIRECTOR') }
    ];

    const DashboardCards = () => (
        <div className="p-4 md:p-8 animate-fade-in pb-24">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8 flex items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border">
                    <img src={currentSchool?.logoBase64 || APP_LOGO_URL} alt="Logo" className="w-16 h-16 rounded-xl object-contain bg-white shadow-sm border" />
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-800">สวัสดี, {currentUser?.name}</h2>
                        <p className="text-slate-500 font-medium">{currentUser?.position} | {currentSchool?.name}</p>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {modules.filter(m => m.visible).map((module: any) => (
                        <button key={module.id} onClick={() => setCurrentView(module.id)} className={`group relative overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-white border border-slate-100 shadow-lg ${module.shadow}`}>
                            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${module.color} opacity-10 rounded-bl-full transition-transform group-hover:scale-110`}></div>
                            <div className="flex flex-col h-full justify-between items-start relative z-10">
                                <div className="flex justify-between w-full items-start">
                                    <div className={`p-4 rounded-2xl bg-gradient-to-br ${module.color} text-white shadow-md mb-6`}><module.icon size={32} /></div>
                                    {module.badge && (
                                        <div className="bg-red-600 text-white text-[11px] font-black px-4 py-2 rounded-full animate-pulse shadow-xl border-2 border-white transform hover:scale-110 transition-transform">
                                            {module.badge}
                                        </div>
                                    )}
                                </div>
                                <div className="text-left w-full">
                                    <h3 className="text-xl font-bold text-slate-800 mb-1 group-hover:text-blue-700 transition-colors">{module.title}</h3>
                                    <p className="text-slate-500 font-medium text-sm">
                                        {module.slogan}
                                    </p>
                                </div>
                                <div className="mt-4 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full bg-gradient-to-r ${module.color} w-0 group-hover:w-full transition-all duration-500 ease-out`}></div>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
                <div className="mt-8 flex justify-end">
                     <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isSupabaseConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isSupabaseConfigured ? <Database size={12}/> : <ServerOff size={12}/>} {isSupabaseConfigured ? 'SQL Online' : 'Local Mock Mode'}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderContent = () => {
        if (!currentSchool) return <div className="p-8 text-center text-slate-500">ไม่พบข้อมูลโรงเรียน</div>;
        switch (currentView) {
            case SystemView.PROFILE: return <UserProfile currentUser={currentUser!} onUpdateUser={setCurrentUser} />;
            case SystemView.DIRECTOR_CALENDAR: return <DirectorCalendar currentUser={currentUser!} allTeachers={schoolTeachers} />;
            case SystemView.ACADEMIC: return <AcademicSystem currentUser={currentUser!} />;
            case SystemView.DOCUMENTS: return <DocumentsSystem currentUser={currentUser!} currentSchool={currentSchool} allTeachers={schoolTeachers} focusDocId={focusItem?.view === SystemView.DOCUMENTS ? focusItem.id : null} onClearFocus={() => setFocusItem(null)} />;
            case SystemView.LEAVE: return <LeaveSystem currentUser={currentUser!} allTeachers={schoolTeachers} currentSchool={currentSchool} focusRequestId={focusItem?.view === SystemView.LEAVE ? focusItem.id : null} onClearFocus={() => setFocusItem(null)} />;
            case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser!} allTeachers={schoolTeachers} />;
            case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser!} allTeachers={schoolTeachers} currentSchool={currentSchool} />;
            case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser!} />;
            case SystemView.ADMIN_USERS: return <AdminUserManagement teachers={schoolTeachers} currentSchool={currentSchool} onUpdateSchool={handleUpdateSchool} onAddTeacher={handleAddTeacher} onEditTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher} />;
            default: return <DashboardCards />;
        }
    };

    if (isLoading || !isDataLoaded) return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400 gap-2"><Loader className="animate-spin"/> กำลังเชื่อมต่อฐานข้อมูล...</div>;
    
    if (isSuperAdminMode) return (
        <SuperAdminDashboard 
            schools={allSchools} 
            teachers={allTeachers} 
            onCreateSchool={async(s)=> {
                if (isSupabaseConfigured && supabase) {
                    await supabase.from('schools').upsert([{ id: s.id, name: s.name, district: s.district, province: s.province, is_suspended: false }]);
                    setAllSchools([...allSchools, { ...s, isSuspended: false }]);
                }
            }} 
            onUpdateSchool={handleUpdateSchool} 
            onDeleteSchool={async(id)=> {
                if (confirm(`ลบ?`)) {
                    if (isSupabaseConfigured && supabase) {
                        await supabase.from('schools').delete().eq('id', id);
                        setAllSchools(allSchools.filter(s => s.id !== id));
                    }
                }
            }} 
            onUpdateTeacher={handleEditTeacher} 
            onDeleteTeacher={handleDeleteTeacher}
            onLogout={handleLogout} 
        />
    );

    if (!currentUser) return <LoginScreen schools={allSchools} teachers={allTeachers} onLogin={handleLogin} onRegister={handleRegister} onSuperAdminLogin={()=>setIsSuperAdminMode(true)} />;
    
    if (currentUser.isFirstLogin) return <FirstLoginSetup user={currentUser} onComplete={handleFirstLoginComplete} onLogout={handleLogout} />;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 font-sarabun">
            {notification && (
                <div onClick={handleNotificationClick} className="fixed bottom-20 right-6 z-50 animate-slide-up print:hidden cursor-pointer">
                    <div className={`border-l-4 shadow-2xl rounded-lg p-4 flex items-start gap-4 max-w-sm transition-transform hover:scale-105 bg-white ${notification.type === 'alert' ? 'border-red-500 ring-1 ring-red-100' : 'border-blue-500 ring-1 ring-blue-100'}`}>
                        <div className={`p-2.5 rounded-full shrink-0 ${notification.type === 'alert' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}><Bell size={24}/></div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-800 text-sm mb-1">{notification.type === 'alert' ? 'แจ้งเตือนด่วน' : 'แจ้งเตือนระบบ'}</h4>
                            <p className="text-sm text-slate-600 leading-snug break-words">{notification.message}</p>
                            {notification.linkTo && <p className="text-xs text-blue-600 mt-2 flex items-center gap-1 font-bold bg-blue-50 w-fit px-2 py-1 rounded">คลิกเพื่อเปิดดู <ExternalLink size={10}/></p>}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setNotification(null); }} className="text-slate-400 hover:text-slate-600 p-1 rounded-full"><X size={16}/></button>
                    </div>
                </div>
            )}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 shadow-sm print:hidden">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-center md:justify-between relative">
                     <div className="absolute left-4 md:static flex items-center gap-2 md:gap-4">
                        {currentView !== SystemView.DASHBOARD && <button onClick={() => setCurrentView(SystemView.DASHBOARD)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><ChevronLeft size={24} /></button>}
                         <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent flex items-center gap-2">
                            {currentView === SystemView.DASHBOARD ? <><LayoutGrid className="text-slate-800 hidden md:block" size={24}/> Dashboard</> : modules.find(m => m.id === currentView)?.title || 'หน้าหลัก'}
                        </h1>
                    </div>
                    <div className="absolute right-4 md:static flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end mr-2 text-right">
                            <span className="text-sm font-bold text-slate-800 leading-none">{currentUser.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{currentUser.position}</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md border-2 border-white cursor-pointer hover:scale-105 transition-transform">{currentUser.name[0]}</div>
                        <button onClick={handleLogout} className="text-slate-300 hover:text-red-500 transition-colors p-2"><LogOut size={22} /></button>
                    </div>
                </div>
            </header>
            <main className="flex-1 w-full">{currentView !== SystemView.DASHBOARD ? <div className="max-w-7xl mx-auto p-4 md:p-8 pb-24 animate-fade-in">{renderContent()}</div> : renderContent()}</main>
            <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-slate-200 py-3 px-6 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] print:hidden">
                <div className="max-w-7xl mx-auto flex justify-between items-center"><div className="flex items-center gap-2 text-slate-600"><img src={APP_LOGO_URL} className="w-5 h-5 object-contain"/><span className="font-bold text-sm md:text-base">{currentSchool?.name || 'SchoolOS System'}</span></div><div className="text-[10px] md:text-xs text-slate-400 font-bold">SMART SCHOOL MANAGEMENT v5.0</div></div>
            </footer>
        </div>
    );
};

export default App;
