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
import { SystemView, Teacher, School, TeacherRole } from './types';
import { 
    Activity, Users, Clock, FileText, CalendarRange, 
    Loader, Database, ServerOff, LogOut, 
    Settings, ChevronLeft, Bell, UserCircle, ExternalLink, X, Calendar, GraduationCap, LayoutGrid
} from 'lucide-react';
import { MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';
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
    // --- Global Data State ---
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    
    // --- Auth State ---
    const [currentUser, setCurrentUser] = useState<Teacher | null>(null);
    const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- UI & Deep Link State ---
    const [notification, setNotification] = useState<AppNotification | null>(null);
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [pendingDocCount, setPendingDocCount] = useState(0);
    const [focusItem, setFocusItem] = useState<{ view: SystemView, id: string } | null>(null);
    const [pendingDeepLink, setPendingDeepLink] = useState<{ view: SystemView, id: string } | null>(null);
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);

    // --- 1. DATA LOADING & REALTIME SYNC ---
    const fetchInitialData = async () => {
        if (!isSupabaseConfigured || !supabase) {
            setAllSchools(MOCK_SCHOOLS);
            setAllTeachers(MOCK_TEACHERS);
            setIsDataLoaded(true);
            setIsLoading(false);
            return;
        }

        try {
            // โหลดข้อมูลโรงเรียน
            const { data: schoolsData } = await supabase.from('schools').select('*');
            if (schoolsData) {
                setAllSchools(schoolsData.map(s => ({
                    id: s.id, name: s.name, district: s.district, province: s.province,
                    lat: s.lat, lng: s.lng, radius: s.radius, lateTimeThreshold: s.late_time_threshold,
                    logoBase64: s.logo_base_64, isSuspended: s.is_suspended
                })));
            }

            // โหลดข้อมูลบุคลากรทั้งหมด
            const { data: profilesData } = await supabase.from('profiles').select('*');
            if (profilesData) {
                const mappedTeachers: Teacher[] = profilesData.map(p => ({
                    id: p.id, schoolId: p.school_id, name: p.name, password: p.password,
                    position: p.position, roles: p.roles as TeacherRole[], 
                    signatureBase64: p.signature_base_64, telegramChatId: p.telegram_chat_id,
                    isSuspended: p.is_suspended, isFirstLogin: false
                }));
                setAllTeachers(mappedTeachers);
                
                // คืนค่าเซสชั่นการล็อกอิน
                const storedSession = localStorage.getItem(SESSION_KEY);
                if (storedSession) {
                    try {
                        const session = JSON.parse(storedSession);
                        if (session.isSuperAdmin) {
                            setIsSuperAdminMode(true);
                        } else {
                            const user = mappedTeachers.find(t => t.id === session.userId);
                            if (user && !user.isSuspended) {
                                setCurrentUser(user);
                            }
                        }
                    } catch(e) { localStorage.removeItem(SESSION_KEY); }
                }
            }
            setIsDataLoaded(true);
            setIsLoading(false);
        } catch (err) {
            console.error("Initial Load Error:", err);
            setIsDataLoaded(true);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialData();

        // 🟢 ระบบ Realtime Sync (เมื่อเครื่องอื่นแก้ข้อมูล เครื่องนี้จะอัปเดตทันที)
        if (isSupabaseConfigured && supabase) {
            const profileChannel = supabase.channel('profiles_realtime_sync')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async (payload) => {
                    const { data } = await supabase!.from('profiles').select('*');
                    if (data) {
                        const updatedList: Teacher[] = data.map(p => ({
                            id: p.id, schoolId: p.school_id, name: p.name, password: p.password,
                            position: p.position, roles: p.roles as TeacherRole[], 
                            signatureBase64: p.signature_base_64, telegramChatId: p.telegram_chat_id,
                            isSuspended: p.is_suspended
                        } as any));
                        setAllTeachers(updatedList);

                        // ถ้าเป็นข้อมูลของเราเองที่เปลี่ยน ให้รีเฟรช currentUser ด้วย
                        const sessionStr = localStorage.getItem(SESSION_KEY);
                        if (sessionStr) {
                            const session = JSON.parse(sessionStr);
                            if (payload.new && (payload.new as any).id === session.userId) {
                                const me = updatedList.find(t => t.id === session.userId);
                                if (me) setCurrentUser(me);
                            }
                        }
                    }
                }).subscribe();
            return () => { supabase.removeChannel(profileChannel); };
        }
    }, []);

    // --- 2. DYNAMIC COUNTS (Realtime) ---
    useEffect(() => {
        if (!currentUser || !isSupabaseConfigured || !supabase) return;
        const fetchCounts = async () => {
            // นับจำนวนการลาที่ค้างพิจารณา
            const { count: leaveCount } = await supabase!.from('leave_requests').select('*', { count: 'exact', head: true }).eq('school_id', currentUser.schoolId).eq('status', 'Pending');
            setPendingLeaveCount(leaveCount || 0);

            // นับจำนวนหนังสือราชการค้างดำเนินการ
            const { data: docData } = await supabase!.from('documents').select('status, target_teachers, acknowledged_by, assigned_vice_director_id').eq('school_id', currentUser.schoolId);
            if (docData) {
                const isDir = currentUser.roles.includes('DIRECTOR');
                const isVice = currentUser.roles.includes('VICE_DIRECTOR');
                let dCount = 0;
                if (isDir) dCount = docData.filter(d => d.status === 'PendingDirector').length;
                else if (isVice) dCount = docData.filter(d => d.status === 'PendingViceDirector' && d.assigned_vice_director_id === currentUser.id).length;
                else dCount = docData.filter(d => d.status === 'Distributed' && (d.target_teachers || []).includes(currentUser.id) && !(d.acknowledged_by || []).includes(currentUser.id)).length;
                setPendingDocCount(dCount);
            }
        };
        fetchCounts();

        // ติดตามการเปลี่ยนแปลงตัวเลขแจ้งเตือน
        const leaveSub = supabase.channel('counts_leave').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchCounts()).subscribe();
        const docSub = supabase.channel('counts_docs').on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => fetchCounts()).subscribe();
        
        return () => {
            supabase.removeChannel(leaveSub);
            supabase.removeChannel(docSub);
        };
    }, [currentUser?.id]);

    // --- 3. DEEP LINKING SYSTEM ---
    useEffect(() => {
        if (!isDataLoaded) return;
        const params = new URLSearchParams(window.location.search);
        const viewParam = params.get('view');
        const idParam = params.get('id');
        if (viewParam && idParam && Object.values(SystemView).includes(viewParam as SystemView)) {
            setPendingDeepLink({ view: viewParam as SystemView, id: idParam });
        }
    }, [isDataLoaded]);

    useEffect(() => {
        if (currentUser && pendingDeepLink) {
            setCurrentView(pendingDeepLink.view);
            setFocusItem({ view: pendingDeepLink.view, id: pendingDeepLink.id });
            setPendingDeepLink(null); 
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [currentUser, pendingDeepLink]);

    // --- 4. ACTION HANDLERS ---
    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setIsSuperAdminMode(false);
        localStorage.removeItem(SESSION_KEY);
        setCurrentView(SystemView.DASHBOARD);
    };

    const handleUpdateUserProfile = (updatedUser: Teacher) => {
        setCurrentUser(updatedUser);
        setAllTeachers(prev => prev.map(t => t.id === updatedUser.id ? updatedUser : t));
    };

    const handleRegister = async (schoolId: string, id: string, name: string) => {
        if (!isSupabaseConfigured || !supabase) return;
        const newUser: Teacher = {
            id, schoolId, name, password: '123456',
            position: 'ครู', roles: ['TEACHER'],
            isFirstLogin: true, isSuspended: false
        };
        const { error } = await supabase.from('profiles').insert([{
            id, school_id: schoolId, name, password: '123456', position: 'ครู', roles: ['TEACHER'], is_suspended: false
        }]);
        if (!error) {
            setAllTeachers(prev => [...prev, newUser]);
            handleLogin(newUser);
        } else {
            alert("สมัครสมาชิกไม่สำเร็จ: " + error.message);
        }
    };

    const handleFirstLoginComplete = async (newPass: string, position: string) => {
        if (!currentUser || !supabase) return;
        const updatedUser: Teacher = { 
            ...currentUser, password: newPass, position: position, 
            isFirstLogin: false, roles: position.includes('ผู้อำนวยการ') ? (['DIRECTOR', 'TEACHER'] as TeacherRole[]) : currentUser.roles
        };
        const { error } = await supabase.from('profiles').update({ password: newPass, position: position, roles: updatedUser.roles }).eq('id', currentUser.id);
        if (!error) {
            setCurrentUser(updatedUser);
            setAllTeachers(prev => prev.map(t => t.id === updatedUser.id ? updatedUser : t));
        }
    };

    const handleUpdateSchool = async (s: School) => {
        if (!supabase) return;
        const { error } = await supabase.from('schools').upsert([{
            id: s.id, name: s.name, district: s.district, province: s.province,
            logo_base_64: s.logoBase64, lat: s.lat, lng: s.lng, radius: s.radius,
            late_time_threshold: s.lateTimeThreshold, is_suspended: s.isSuspended || false
        }]);
        if (!error) setAllSchools(prev => prev.map(sch => sch.id === s.id ? s : sch));
    };

    const handleAddTeacher = async (t: Teacher) => {
        if (!supabase) return;
        const { error } = await supabase.from('profiles').insert([{
            id: t.id, school_id: t.schoolId, name: t.name, password: t.password,
            position: t.position, roles: t.roles, is_suspended: false
        }]);
        if (!error) setAllTeachers(prev => [...prev, { ...t, isSuspended: false }]);
    };

    const handleEditTeacher = async (t: Teacher) => {
        if (!supabase) return;
        const { error } = await supabase.from('profiles').update({
            name: t.name, position: t.position, roles: t.roles,
            password: t.password, telegram_chat_id: t.telegramChatId,
            is_suspended: t.isSuspended || false, signature_base_64: t.signatureBase64
        }).eq('id', t.id);
        if (!error) setAllTeachers(prev => prev.map(teacher => teacher.id === t.id ? t : teacher));
    };

    const handleDeleteTeacher = async (id: string) => {
        if (!supabase) return;
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (!error) setAllTeachers(prev => prev.filter(t => t.id !== id));
    };

    // --- UI HELPER ---
    const schoolTeachers = allTeachers.filter(t => t.schoolId === currentUser?.schoolId);
    const currentSchool = allSchools.find(s => s.id === currentUser?.schoolId);

    const getDocBadge = () => {
        if (pendingDocCount === 0) return null;
        if (currentUser?.roles.includes('DIRECTOR')) return `รอกิจกรรม ${pendingDocCount}`;
        if (currentUser?.roles.includes('VICE_DIRECTOR')) return `รอพิจารณา ${pendingDocCount}`;
        return `หนังสือใหม่ ${pendingDocCount}`;
    };

    const modules = [
        { id: SystemView.PROFILE, title: 'ข้อมูลส่วนตัว', slogan: 'รหัสผ่าน / ลายเซ็นดิจิทัล', icon: UserCircle, color: 'from-purple-500 to-indigo-400', shadow: 'shadow-purple-200', blob: 'bg-purple-300', visible: true },
        { id: SystemView.DIRECTOR_CALENDAR, title: 'ปฏิทินปฏิบัติงาน ผอ.', slogan: 'แจ้งเตือนนัดหมายภารกิจ', icon: Calendar, color: 'from-indigo-500 to-blue-400', shadow: 'shadow-indigo-200', blob: 'bg-blue-300', visible: true },
        { id: SystemView.ACADEMIC, title: 'งานวิชาการ', slogan: 'สถิตินักเรียน / ผลสอบ O-NET', icon: GraduationCap, color: 'from-indigo-600 to-violet-500', shadow: 'shadow-indigo-200', blob: 'bg-indigo-300', visible: true },
        { 
            id: SystemView.DOCUMENTS, title: 'งานสารบรรณ', slogan: 'รับ-ส่ง รวดเร็ว ทันใจ', 
            badge: getDocBadge(),
            icon: FileText, color: 'from-blue-500 to-cyan-400', shadow: 'shadow-blue-200', blob: 'bg-sky-300', visible: true 
        },
        { id: SystemView.PLAN, title: 'แผนปฏิบัติการ', slogan: 'วางแผนงบประมาณประจำปี', icon: CalendarRange, color: 'from-violet-500 to-fuchsia-400', shadow: 'shadow-violet-200', blob: 'bg-fuchsia-300', visible: true },
        { id: SystemView.LEAVE, title: 'ระบบการลา', slogan: 'โปร่งใส ตรวจสอบง่าย', badge: pendingLeaveCount > 0 ? `รออนุมัติ ${pendingLeaveCount}` : null, icon: Users, color: 'from-emerald-500 to-teal-400', shadow: 'shadow-emerald-200', blob: 'bg-emerald-300', visible: true },
        { id: SystemView.FINANCE, title: 'ระบบการเงิน', slogan: 'งบประมาณ และรายรับ-จ่าย', icon: Activity, color: 'from-amber-500 to-orange-400', shadow: 'shadow-amber-200', blob: 'bg-amber-300', visible: currentUser?.roles.includes('DIRECTOR') || currentUser?.roles.includes('FINANCE_BUDGET') || currentUser?.roles.includes('FINANCE_NONBUDGET') || currentUser?.roles.includes('FINANCE_COOP') },
        { id: SystemView.ATTENDANCE, title: 'ลงเวลาทำงาน', slogan: 'เช็คเวลาแม่นยำ ด้วย GPS', icon: Clock, color: 'from-rose-500 to-pink-400', shadow: 'shadow-rose-200', blob: 'bg-rose-300', visible: true },
        { id: SystemView.ADMIN_USERS, title: 'ผู้ดูแลระบบ', slogan: 'ตั้งค่าระบบ และผู้ใช้งาน', icon: Settings, color: 'from-slate-600 to-slate-400', shadow: 'shadow-slate-200', blob: 'bg-slate-300', visible: currentUser?.roles.includes('SYSTEM_ADMIN') || currentUser?.roles.includes('DIRECTOR') }
    ];

    if (isLoading || !isDataLoaded) return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400 gap-3 font-sarabun"><Loader className="animate-spin" size={32}/> กำลังเชื่อมต่อฐานข้อมูล SQL Cloud...</div>;
    
    if (isSuperAdminMode) return (
        <SuperAdminDashboard 
            schools={allSchools} teachers={allTeachers} 
            onCreateSchool={async(s)=> { if(supabase) await supabase.from('schools').upsert([s]); setAllSchools([...allSchools, s]); }} 
            onUpdateSchool={handleUpdateSchool} 
            onDeleteSchool={async(id)=> { if(confirm(`ลบโรงเรียน?`)) { if(supabase) await supabase.from('schools').delete().eq('id', id); setAllSchools(allSchools.filter(s => s.id !== id)); } }} 
            onUpdateTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher}
            onLogout={handleLogout} 
        />
    );

    if (!currentUser) return <LoginScreen schools={allSchools} teachers={allTeachers} onLogin={handleLogin} onRegister={handleRegister} onSuperAdminLogin={()=>setIsSuperAdminMode(true)} />;
    
    if (currentUser.isFirstLogin) return <FirstLoginSetup user={currentUser} onComplete={handleFirstLoginComplete} onLogout={handleLogout} />;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 font-sarabun relative overflow-x-hidden">
            {/* Background Decorative Curved Lines (Elegant Patterns) */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.04] z-0">
                <svg width="100%" height="100%" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                    <path d="M0,200 C300,100 600,300 900,200 T1440,250" stroke="currentColor" fill="transparent" strokeWidth="3" className="text-blue-600" />
                    <path d="M-100,450 C200,350 500,550 800,450 S1200,350 1540,450" stroke="currentColor" fill="transparent" strokeWidth="2" className="text-indigo-600" />
                    <path d="M0,700 C400,600 800,800 1200,700 T1600,750" stroke="currentColor" fill="transparent" strokeWidth="4" className="text-purple-600" />
                    <path d="M200,-50 C400,150 100,400 600,600 S1000,400 1200,1000" stroke="currentColor" fill="transparent" strokeWidth="1" className="text-slate-400" />
                </svg>
            </div>

            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 shadow-sm print:hidden">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
                     <div className="flex items-center gap-2 md:gap-4">
                        {currentView !== SystemView.DASHBOARD && <button onClick={() => setCurrentView(SystemView.DASHBOARD)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><ChevronLeft size={24} /></button>}
                         <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
                            {currentView === SystemView.DASHBOARD ? <><LayoutGrid size={24} className="text-blue-600"/> Dashboard</> : modules.find(m => m.id === currentView)?.title}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end text-right">
                            <span className="text-sm font-bold text-slate-800 leading-none">{currentUser.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">{currentUser.position}</span>
                        </div>
                        <div onClick={() => setCurrentView(SystemView.PROFILE)} className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold cursor-pointer hover:scale-105 transition-transform shadow-md">{currentUser.name[0]}</div>
                        <button onClick={handleLogout} className="text-slate-300 hover:text-red-500 transition-colors p-2"><LogOut size={22} /></button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full p-4 md:p-8 relative z-10">
                <div className="max-w-7xl mx-auto pb-24">
                    {currentView === SystemView.DASHBOARD ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                            {modules.filter(m => m.visible).map((module: any) => (
                                <button key={module.id} onClick={() => setCurrentView(module.id)} className={`group relative bg-white p-8 rounded-[2rem] border border-slate-100 shadow-lg ${module.shadow} hover:-translate-y-2 transition-all text-left overflow-hidden`}>
                                    
                                    {/* Multi-layered Curved Lines Pattern on Cards */}
                                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.06] group-hover:opacity-[0.14] transition-opacity duration-700">
                                        <svg width="100%" height="100%" viewBox="0 0 300 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            {/* Primary Wavy Path */}
                                            <path 
                                                d="M0,120 C80,80 220,160 300,120 L300,200 L0,200 Z" 
                                                fill="currentColor" 
                                                className={`text-${module.blob.split('-')[1]}-500`} 
                                            />
                                            {/* Secondary Delicate Curve Lines */}
                                            <path 
                                                d="M-20,80 C100,30 200,130 320,80" 
                                                stroke="currentColor" 
                                                strokeWidth="10" 
                                                className={`text-${module.blob.split('-')[1]}-600`} 
                                                strokeLinecap="round" 
                                                opacity="0.3"
                                            />
                                            <path 
                                                d="M-20,100 C100,50 200,150 320,100" 
                                                stroke="currentColor" 
                                                strokeWidth="4" 
                                                className={`text-${module.blob.split('-')[1]}-400`} 
                                                strokeLinecap="round" 
                                                opacity="0.5"
                                            />
                                            <path 
                                                d="M0,140 C120,100 180,180 300,140" 
                                                stroke="currentColor" 
                                                strokeWidth="1" 
                                                className={`text-${module.blob.split('-')[1]}-300`} 
                                                strokeLinecap="round" 
                                            />
                                        </svg>
                                    </div>

                                    {/* Decorative Blobs (เดิม) */}
                                    <div className={`absolute -top-10 -right-10 w-44 h-44 ${module.blob} rounded-full blur-[60px] -z-0 opacity-30 group-hover:scale-125 transition-transform duration-700`}></div>
                                    <div className={`absolute -bottom-16 -left-16 w-32 h-32 ${module.blob} rounded-full blur-[50px] -z-0 opacity-15`}></div>
                                    
                                    <div className="relative z-10">
                                        <div className={`p-4 rounded-2xl bg-gradient-to-br ${module.color} text-white w-fit mb-6 shadow-md transition-transform group-hover:rotate-6`}>
                                            <module.icon size={32}/>
                                        </div>
                                        {module.badge && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full animate-pulse shadow-lg border-2 border-white z-20">{module.badge}</div>}
                                        <h3 className="font-black text-slate-800 text-xl mb-1 group-hover:text-blue-600 transition-colors">{module.title}</h3>
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-tight">{module.slogan}</p>
                                        <div className="mt-6 w-full h-1 bg-slate-50 rounded-full overflow-hidden">
                                            <div className={`h-full bg-gradient-to-r ${module.color} w-0 group-hover:w-full transition-all duration-1000 ease-out`}></div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="animate-fade-in relative z-10">
                            {(() => {
                                switch (currentView) {
                                    case SystemView.PROFILE: return <UserProfile currentUser={currentUser} onUpdateUser={handleUpdateUserProfile} />;
                                    case SystemView.DOCUMENTS: return <DocumentsSystem currentUser={currentUser} currentSchool={currentSchool!} allTeachers={schoolTeachers} focusDocId={focusItem?.id} onClearFocus={() => setFocusItem(null)} />;
                                    case SystemView.LEAVE: return <LeaveSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool!} focusRequestId={focusItem?.id} onClearFocus={() => setFocusItem(null)} />;
                                    case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
                                    case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool!} />;
                                    case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser} />;
                                    case SystemView.ACADEMIC: return <AcademicSystem currentUser={currentUser} />;
                                    case SystemView.ADMIN_USERS: return <AdminUserManagement teachers={schoolTeachers} currentSchool={currentSchool!} onUpdateSchool={handleUpdateSchool} onAddTeacher={async (t) => { if(supabase) await supabase.from('profiles').insert([t]); setAllTeachers(prev => [...prev, t]); }} onEditTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher} />;
                                    case SystemView.DIRECTOR_CALENDAR: return <DirectorCalendar currentUser={currentUser} allTeachers={schoolTeachers} />;
                                    default: return null;
                                }
                            })()}
                        </div>
                    )}
                </div>
            </main>
            
            <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-slate-200 p-4 z-40 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)] print:hidden">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <img src={APP_LOGO_URL} className="w-6 h-6 object-contain" alt="OS Logo"/>
                        <span className="font-black text-slate-700 text-sm md:text-base uppercase tracking-tight">{currentSchool?.name || 'SchoolOS System'}</span>
                    </div>
                    <div className="text-[9px] md:text-xs text-slate-400 font-bold uppercase tracking-widest hidden sm:block">ลิขสิทธิ์ของ สยาม เชียงเครือ</div>
                </div>
            </footer>
        </div>
    );
};

export default App;