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
    Loader, LogOut, 
    Settings, ChevronLeft, UserCircle, Calendar, GraduationCap, LayoutGrid, UserCheck
} from 'lucide-react';
import { MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';
import { supabase, isConfigured as isSupabaseConfigured } from './supabaseClient';

const SESSION_KEY = 'schoolos_session_v1';
const APP_LOGO_URL = "https://img2.pic.in.th/pic/9c2e0f8ba684e3441fc58d880fdf143d.png";

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
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
    const [pendingDocCount, setPendingDocCount] = useState(0);
    const [focusItem, setFocusItem] = useState<{ view: SystemView, id: string } | null>(null);
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);

    // --- 1. DATA LOADING & REALTIME SYNC ---
    const fetchInitialData = async () => {
        const client = supabase;
        if (!isSupabaseConfigured || !client) {
            setAllSchools(MOCK_SCHOOLS);
            setAllTeachers(MOCK_TEACHERS);
            setIsDataLoaded(true);
            setIsLoading(false);
            return;
        }

        try {
            const { data: schoolsData } = await client.from('schools').select('*');
            if (schoolsData) {
                setAllSchools(schoolsData.map(s => ({
                    id: s.id, name: s.name, district: s.district, province: s.province,
                    lat: s.lat, lng: s.lng, radius: s.radius, lateTimeThreshold: s.late_time_threshold,
                    logoBase64: s.logo_base_64, isSuspended: s.is_suspended
                })));
            }

            const { data: profilesData } = await client.from('profiles').select('*');
            if (profilesData) {
                const mappedTeachers: Teacher[] = profilesData.map(p => ({
                    id: p.id, schoolId: p.school_id, name: p.name, password: p.password,
                    position: p.position, roles: p.roles as TeacherRole[], 
                    signatureBase64: p.signature_base_64, telegramChatId: p.telegram_chat_id,
                    isSuspended: p.is_suspended, isFirstLogin: false
                }));
                setAllTeachers(mappedTeachers);
                
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

        const client = supabase;
        if (isSupabaseConfigured && client) {
            const profileChannel = client.channel('profiles_realtime_sync')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async (payload) => {
                    const { data } = await client.from('profiles').select('*');
                    if (data) {
                        const updatedList: Teacher[] = data.map(p => ({
                            id: p.id, schoolId: p.school_id, name: p.name, password: p.password,
                            position: p.position, roles: p.roles as TeacherRole[], 
                            signatureBase64: p.signature_base_64, telegramChatId: p.telegram_chat_id,
                            isSuspended: p.is_suspended
                        } as any));
                        setAllTeachers(updatedList);

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
            return () => { client.removeChannel(profileChannel); };
        }
    }, []);

    // --- 2. DYNAMIC COUNTS (Realtime) ---
    useEffect(() => {
        const client = supabase;
        if (!currentUser || !isSupabaseConfigured || !client) return;
        const fetchCounts = async () => {
            const { count: leaveCount } = await client.from('leave_requests').select('*', { count: 'exact', head: true }).eq('school_id', currentUser.schoolId).eq('status', 'Pending');
            setPendingLeaveCount(leaveCount || 0);

            const { data: docData } = await client.from('documents').select('status, target_teachers, acknowledged_by, assigned_vice_director_id').eq('school_id', currentUser.schoolId);
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

        const leaveSub = client.channel('counts_leave').on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => fetchCounts()).subscribe();
        const docSub = client.channel('counts_docs').on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, () => fetchCounts()).subscribe();
        
        return () => {
            client.removeChannel(leaveSub);
            client.removeChannel(docSub);
        };
    }, [currentUser?.id]);

    // --- 3. ACTION HANDLERS ---
    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleLogout = () => {
        if (!confirm("ต้องการออกจากระบบใช่หรือไม่?")) return;
        setCurrentUser(null);
        setIsSuperAdminMode(false);
        localStorage.removeItem(SESSION_KEY);
        setCurrentView(SystemView.DASHBOARD);
    };

    const handleUpdateUserProfile = (updatedUser: Teacher) => {
        setCurrentUser(updatedUser);
        setAllTeachers(prev => prev.map(t => t.id === updatedUser.id ? updatedUser : t));
    };

    const handleUpdateSchool = async (s: School) => {
        const client = supabase;
        if (!client) return;
        const { error } = await client.from('schools').upsert([{
            id: s.id, name: s.name, district: s.district, province: s.province,
            logo_base_64: s.logoBase64, lat: s.lat, lng: s.lng, radius: s.radius,
            late_time_threshold: s.lateTimeThreshold, is_suspended: s.isSuspended || false
        }]);
        if (!error) setAllSchools(prev => prev.map(sch => sch.id === s.id ? s : sch));
    };

    const handleEditTeacher = async (t: Teacher) => {
        const client = supabase;
        if (!client) return;
        const { error } = await client.from('profiles').update({
            name: t.name, position: t.position, roles: t.roles,
            password: t.password, telegram_chat_id: t.telegramChatId,
            is_suspended: t.isSuspended || false, signature_base_64: t.signatureBase64
        }).eq('id', t.id);
        if (!error) setAllTeachers(prev => prev.map(teacher => teacher.id === t.id ? t : teacher));
    };

    const handleDeleteTeacher = async (id: string) => {
        const client = supabase;
        if (!client) return;
        const { error } = await client.from('profiles').delete().eq('id', id);
        if (!error) setAllTeachers(prev => prev.filter(t => t.id !== id));
    };

    // --- DASHBOARD UI COMPONENTS ---
    const currentSchool = allSchools.find(s => s.id === currentUser?.schoolId);
    const schoolTeachers = allTeachers.filter(t => t.schoolId === currentUser?.schoolId);

    const DashboardCard = ({ view, title, slogan, icon: Icon, color, badge, hasBorder }: any) => (
        <button 
            onClick={() => setCurrentView(view)}
            className={`group relative bg-white p-8 rounded-[2.5rem] shadow-sm hover:shadow-2xl transition-all duration-700 text-left overflow-hidden border border-slate-50 flex flex-col justify-between h-60 hover:-translate-y-2`}
        >
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-[0.12] group-hover:opacity-[0.25] transition-opacity duration-700">
                <svg width="100%" height="100%" viewBox="0 0 300 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0,120 C80,80 220,160 300,120 L300,200 L0,200 Z" fill={color} opacity="0.6"/>
                    <path d="M-20,80 C100,30 200,130 320,80" stroke={color} strokeWidth="12" strokeLinecap="round" opacity="0.4"/>
                    <path d="M-20,100 C100,50 200,150 320,100" stroke={color} strokeWidth="6" strokeLinecap="round" opacity="0.6"/>
                </svg>
            </div>
            <div className={`absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-[0.05] group-hover:scale-125 transition-transform duration-1000`} style={{ backgroundColor: color }}></div>
            <div className={`absolute left-0 bottom-0 w-32 h-32 rounded-full opacity-[0.03] blur-3xl`} style={{ backgroundColor: color }}></div>
            <div className="relative z-10">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110`} style={{ backgroundColor: `${color}15`, color: color }}>
                    <Icon size={36} />
                </div>
                {badge && (
                    <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full animate-pulse shadow-lg border-2 border-white z-20">
                        {badge}
                    </div>
                )}
                <h3 className="text-2xl font-black text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">{title}</h3>
                <p className="text-slate-400 text-sm font-bold leading-relaxed">{slogan}</p>
            </div>
            <div className="relative z-10 w-full">
                <div className="w-full h-1 bg-slate-50 rounded-full overflow-hidden">
                    <div className="h-full w-0 group-hover:w-full transition-all duration-1000 ease-out" style={{ backgroundColor: color }}></div>
                </div>
            </div>
            {hasBorder && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-blue-500 rounded-b-[2.5rem]"></div>
            )}
        </button>
    );

    const getDocBadge = () => {
        if (pendingDocCount === 0) return null;
        if (currentUser?.roles.includes('DIRECTOR')) return `รอกิจกรรม ${pendingDocCount}`;
        if (currentUser?.roles.includes('VICE_DIRECTOR')) return `รอพิจารณา ${pendingDocCount}`;
        return `หนังสือใหม่ ${pendingDocCount}`;
    };

    if (isLoading || !isDataLoaded) return <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-6 font-sarabun">
        <div className="relative">
            <div className="w-24 h-24 border-4 border-blue-100 rounded-full"></div>
            <Loader className="absolute top-0 animate-spin text-blue-600" size={96} />
        </div>
        <div className="text-center">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">SCHOOL OS</h2>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.3em] mt-1">Booting Smart Platform</p>
        </div>
    </div>;
    
    if (isSuperAdminMode) return (
        <SuperAdminDashboard 
            schools={allSchools} teachers={allTeachers} 
            onCreateSchool={async(s)=> { const client = supabase; if(client) await client.from('schools').upsert([s]); setAllSchools([...allSchools, s]); }} 
            onUpdateSchool={handleUpdateSchool} 
            onDeleteSchool={async(id)=> { if(confirm(`ลบโรงเรียน?`)) { const client = supabase; if(client) await client.from('schools').delete().eq('id', id); setAllSchools(allSchools.filter(s => s.id !== id)); } }} 
            onUpdateTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher}
            onLogout={handleLogout} 
        />
    );

    if (!currentUser) return <LoginScreen schools={allSchools} teachers={allTeachers} onLogin={handleLogin} onRegister={async (sid, id, n) => {
        const client = supabase;
        if (!client) return;
        const { error } = await client.from('profiles').insert([{ id, school_id: sid, name: n, password: '123456', position: 'ครู', roles: ['TEACHER'], is_suspended: false }]);
        if (!error) { await fetchInitialData(); } else { alert(error.message); }
    }} onSuperAdminLogin={()=>setIsSuperAdminMode(true)} />;
    
    if (currentUser.isFirstLogin) return <FirstLoginSetup user={currentUser} onComplete={async (p, pos) => {
        const client = supabase;
        if (!client) return;
        const roles = pos.includes('ผู้อำนวยการ') ? ['DIRECTOR', 'TEACHER'] : currentUser.roles;
        await client.from('profiles').update({ password: p, position: pos, roles }).eq('id', currentUser.id);
        await fetchInitialData();
    }} onLogout={handleLogout} />;

    return (
        <div className="flex flex-col min-h-screen bg-[#f8fafc] font-sarabun relative overflow-x-hidden">
            <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0">
                <svg width="100%" height="100%" viewBox="0 0 1440 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                    <path d="M0,200 C300,100 600,300 900,200 T1440,250" stroke="#3b82f6" fill="transparent" strokeWidth="3" />
                    <path d="M-100,450 C200,350 500,550 800,450 S1200,350 1540,450" stroke="#6366f1" fill="transparent" strokeWidth="2" />
                    <path d="M0,700 C400,600 800,800 1200,700 T1600,750" stroke="#8b5cf6" fill="transparent" strokeWidth="4" />
                </svg>
            </div>
            <header className="bg-white/90 backdrop-blur-md sticky top-0 z-40 border-b border-slate-100 h-20 flex items-center shadow-sm print:hidden">
                <div className="max-w-7xl mx-auto w-full px-8 flex justify-between items-center">
                    <div className="flex items-center gap-6">
                        {currentView !== SystemView.DASHBOARD ? (
                            <button onClick={() => setCurrentView(SystemView.DASHBOARD)} className="p-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all">
                                <ChevronLeft size={24}/>
                            </button>
                        ) : (
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                <LayoutGrid size={24}/>
                            </div>
                        )}
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                            {currentView === SystemView.DASHBOARD ? 'Dashboard' : 'หน้าหลักระบบ'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex flex-col items-end">
                            <span className="text-sm font-black text-slate-800 leading-none">{currentUser.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase mt-1.5 tracking-widest">{currentUser.position}</span>
                        </div>
                        <div onClick={() => setCurrentView(SystemView.PROFILE)} className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-white font-black cursor-pointer hover:scale-110 transition-all shadow-lg shadow-blue-500/20">
                            {currentUser.name[0]}
                        </div>
                        <button onClick={handleLogout} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                            <LogOut size={24}/>
                        </button>
                    </div>
                </div>
            </header>
            <main className="flex-1 w-full p-8 relative z-10">
                <div className="max-w-7xl mx-auto">
                    {currentView === SystemView.DASHBOARD ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 animate-fade-in">
                            <DashboardCard view={SystemView.PROFILE} title="ข้อมูลส่วนตัว" slogan="แก้ไขรหัสผ่าน / ลายเซ็นดิจิทัล" icon={UserCircle} color="#8b5cf6"/>
                            <DashboardCard view={SystemView.DIRECTOR_CALENDAR} title="ปฏิทินปฏิบัติงาน ผอ." slogan="แจ้งเตือนนัดหมาย และภารกิจ" icon={Calendar} color="#3b82f6"/>
                            <DashboardCard view={SystemView.ACADEMIC} title="งานวิชาการ" slogan="สถิตินักเรียน / ผลสอบ O-NET" icon={GraduationCap} color="#6366f1"/>
                            <DashboardCard view={SystemView.DOCUMENTS} title="งานสารบรรณ" slogan="รับ-ส่ง รวดเร็ว ทันใจ" icon={FileText} color="#06b6d4" badge={getDocBadge()} hasBorder={true}/>
                            <DashboardCard view={SystemView.PLAN} title="แผนปฏิบัติการ" slogan="วางแผนแม่นยำ สู่ความสำเร็จ" icon={CalendarRange} color="#d946ef"/>
                            <DashboardCard view={SystemView.LEAVE} title="ระบบการลา" slogan="โปร่งใส ตรวจสอบง่าย" icon={UserCheck} color="#10b981" badge={pendingLeaveCount > 0 ? `รออนุมัติ ${pendingLeaveCount}` : null}/>
                            <DashboardCard view={SystemView.ATTENDANCE} title="ลงเวลาทำงาน" slogan="เช็คเวลาแม่นยำ ด้วย GPS" icon={Clock} color="#f43f5e"/>
                            <DashboardCard view={SystemView.FINANCE} title="ระบบการเงิน" slogan="งบประมาณ และรายรับ-จ่าย" icon={Activity} color="#f59e0b"/>
                            <DashboardCard view={SystemView.ADMIN_USERS} title="ผู้ดูแลระบบ" slogan="ตั้งค่าระบบ และผู้ใช้งาน" icon={Settings} color="#64748b"/>
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            {(() => {
                                switch (currentView) {
                                    case SystemView.PROFILE: return <UserProfile currentUser={currentUser} onUpdateUser={handleUpdateUserProfile} />;
                                    case SystemView.DOCUMENTS: return <DocumentsSystem currentUser={currentUser} currentSchool={currentSchool!} allTeachers={schoolTeachers} focusDocId={focusItem?.id} onClearFocus={() => setFocusItem(null)} />;
                                    case SystemView.LEAVE: return <LeaveSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool!} focusRequestId={focusItem?.id} onClearFocus={() => setFocusItem(null)} />;
                                    case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
                                    case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool!} />;
                                    case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser} />;
                                    case SystemView.ACADEMIC: return <AcademicSystem currentUser={currentUser} />;
                                    case SystemView.ADMIN_USERS: return <AdminUserManagement teachers={schoolTeachers} currentSchool={currentSchool!} onUpdateSchool={handleUpdateSchool} onAddTeacher={async (t) => { const client = supabase; if(client) await client.from('profiles').insert([t]); setAllTeachers(prev => [...prev, t]); }} onEditTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher} />;
                                    case SystemView.DIRECTOR_CALENDAR: return <DirectorCalendar currentUser={currentUser} allTeachers={schoolTeachers} />;
                                    default: return null;
                                }
                            })()}
                        </div>
                    )}
                </div>
            </main>
            <footer className="h-16 bg-white border-t border-slate-100 flex items-center print:hidden mt-auto">
                <div className="max-w-7xl mx-auto w-full px-8 flex justify-between items-center opacity-60">
                    <div className="flex items-center gap-3">
                        {currentSchool?.logoBase64 ? (
                            <img src={currentSchool.logoBase64} className="w-6 h-6 object-contain" alt="School Logo" />
                        ) : (
                            <img src={APP_LOGO_URL} className="w-6 h-6 object-contain grayscale" alt="OS Logo"/>
                        )}
                        <span className="font-black text-slate-600 text-sm uppercase tracking-tight">{currentSchool?.name || 'SchoolOS System'}</span>
                    </div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">SMART SCHOOL MANAGEMENT v5.0</div>
                </div>
            </footer>
        </div>
    );
};

export default App;