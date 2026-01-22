import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
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
import { SystemView, Teacher, School, DirectorEvent, SystemConfig } from './types';
import { 
    Loader, LogOut, LayoutGrid, Bell, ShieldAlert,
    RefreshCw, Cloud, Database, Monitor, Smartphone,
    ChevronRight, Info, AlertTriangle, CheckCircle2,
    Calendar as CalendarIcon, UserCircle, Globe,
    FileText, GraduationCap, Calendar, CalendarRange, UserCog,
    // Fix: Added UserCheck to missing imports from lucide-react
    UserCheck
} from 'lucide-react';
import { MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';
import { db, isConfigured as isFirebaseConfigured } from './firebaseConfig';
import { supabase, isConfigured as isSupabaseConfigured } from './supabaseClient';
import { collection, onSnapshot, doc, query, where, QuerySnapshot, DocumentData, getDocs, updateDoc } from 'firebase/firestore';

/**
 * Session persistence version key
 */
const SESSION_KEY = 'schoolos_secure_session_v3';

/**
 * App Notification Structure
 */
interface AppNotification {
    id: string;
    message: string;
    type: 'info' | 'alert' | 'success';
    timestamp: number;
    read: boolean;
    view?: SystemView;
    targetId?: string;
}

const App: React.FC = () => {
    // --- Global Data State ---
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    
    // --- Authentication & Session State ---
    const [currentUser, setCurrentUser] = useState<Teacher | null>(null);
    const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [syncSource, setSyncSource] = useState<'LOCAL' | 'SQL' | 'FIREBASE'>('LOCAL');

    // --- Navigation & UI State ---
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [showNotificationCenter, setShowNotificationCenter] = useState(false);

    // --- Deep Link State ---
    const [focusItem, setFocusItem] = useState<{ view: SystemView, id: string } | null>(null);

    // --- Data Synchronization (Cloud Native) ---

    const loadLocalData = useCallback(() => {
        setAllSchools(MOCK_SCHOOLS);
        setAllTeachers(MOCK_TEACHERS);
        setIsDataLoaded(true);
        setSyncSource('LOCAL');
    }, []);

    const fetchSqlData = useCallback(async () => {
        // Use local constant for type narrowing
        const client = supabase;
        if (!isSupabaseConfigured || !client) return false;
        
        try {
            // Fetch Schools
            const { data: schoolsData, error: schoolsError } = await client.from('schools').select('*');
            if (schoolsError) throw schoolsError;
            
            // Map SQL names to CamelCase for frontend
            const mappedSchools: School[] = (schoolsData || []).map(s => ({
                id: s.id, name: s.name, district: s.district, province: s.province,
                isSuspended: s.is_suspended, logoBase64: s.logo_base_64, lat: s.lat, lng: s.lng,
                radius: s.radius, lateTimeThreshold: s.late_time_threshold
            }));
            setAllSchools(mappedSchools);

            // Fetch Teachers (Profiles)
            const { data: teachersData, error: teachersError } = await client.from('profiles').select('*');
            if (teachersError) throw teachersError;

            const mappedTeachers: Teacher[] = (teachersData || []).map(t => ({
                id: t.id, schoolId: t.school_id, name: t.name, password: t.password,
                position: t.position, roles: t.roles || [], isFirstLogin: t.is_first_login,
                signatureBase64: t.signature_base_64, telegramChatId: t.telegram_chat_id,
                isSuspended: t.is_suspended
            }));
            setAllTeachers(mappedTeachers);
            
            setSyncSource('SQL');
            setIsDataLoaded(true);
            return true;
        } catch (e) {
            console.error("SQL Sync Failed:", e);
            return false;
        }
    }, []);

    // Initial Data Orchestration
    useEffect(() => {
        const sync = async () => {
            setIsLoading(true);
            
            // 1. Try SQL (Supabase) first - Local ref for type safety
            const client = supabase;
            if (isSupabaseConfigured && client) {
                const ok = await fetchSqlData();
                if (ok) {
                    setIsLoading(false);
                    return;
                }
            }

            // 2. Fallback to Firebase
            if (isFirebaseConfigured && db) {
                try {
                    onSnapshot(collection(db, 'schools'), (snap) => {
                        setAllSchools(snap.docs.map(d => d.data() as School));
                    });
                    onSnapshot(collection(db, 'teachers'), (snap) => {
                        setAllTeachers(snap.docs.map(d => d.data() as Teacher));
                        setIsDataLoaded(true);
                        setSyncSource('FIREBASE');
                    });
                    setIsLoading(false);
                    return;
                } catch (e) { console.error("Firebase Sync Failed:", e); }
            }

            // 3. Last resort: Mock Local Data
            loadLocalData();
            setIsLoading(false);
        };
        sync();
    }, [fetchSqlData, loadLocalData]);

    // Session Management & URL Deep Link Parsing
    useEffect(() => {
        if (!isDataLoaded) return;
        
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
            try {
                const session = JSON.parse(stored);
                if (session.isSA) {
                    setIsSuperAdminMode(true);
                } else {
                    const found = allTeachers.find(t => t.id === session.userId);
                    if (found && !found.isSuspended) {
                        setCurrentUser(found);
                    } else {
                        localStorage.removeItem(SESSION_KEY);
                    }
                }
            } catch (e) { localStorage.removeItem(SESSION_KEY); }
        }

        const params = new URLSearchParams(window.location.search);
        const v = params.get('view');
        const id = params.get('id');
        if (v && id) {
            const viewKey = Object.keys(SystemView).find(k => k === v) as SystemView;
            if (viewKey) {
                setCurrentView(viewKey);
                setFocusItem({ view: viewKey, id });
            }
        }
    }, [isDataLoaded, allTeachers]);

    // Real-time SQL Notifications
    useEffect(() => {
        const client = supabase;
        if (!currentUser || !isSupabaseConfigured || !client) return;
        
        const channel = client.channel('app_global_notifications')
            .on('postgres_changes', { 
                event: 'INSERT', schema: 'public', table: 'documents', 
                filter: `school_id=eq.${currentUser.schoolId}` 
            }, (payload) => {
                if (payload.new.target_teachers?.includes(currentUser.id)) {
                    addNotification(`ได้รับหนังสือใหม่: ${payload.new.title}`, 'info', SystemView.DOCUMENTS, payload.new.id.toString());
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'leave_requests',
                filter: `teacher_id=eq.${currentUser.id}`
            }, (payload) => {
                if (payload.new.status !== payload.old.status) {
                    addNotification(`การลาของคุณได้รับสถานะ: ${payload.new.status}`, 'success', SystemView.LEAVE, payload.new.id.toString());
                }
            })
            .subscribe();

        return () => { 
            if (client) client.removeChannel(channel); 
        };
    }, [currentUser]);

    // --- Core Action Handlers ---

    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSA: false }));
        addNotification(`ยินดีต้อนรับกลับ ${user.name}`, 'success');
    };

    const handleLogout = () => {
        if (!confirm("ยืนยันการออกจากระบบ?")) return;
        setCurrentUser(null);
        setIsSuperAdminMode(false);
        localStorage.removeItem(SESSION_KEY);
        window.history.replaceState({}, document.title, window.location.pathname);
    };

    const addNotification = (message: string, type: 'info' | 'alert' | 'success' = 'info', view?: SystemView, targetId?: string) => {
        const newNotif: AppNotification = {
            id: Math.random().toString(36).substring(7),
            message, type, timestamp: Date.now(), read: false, view, targetId
        };
        setNotifications(prev => [newNotif, ...prev].slice(0, 10));
    };

    const handleUpdateUser = async (updated: Teacher) => {
        const client = supabase;
        setAllTeachers(prev => prev.map(t => t.id === updated.id ? updated : t));
        setCurrentUser(updated);
        
        if (isSupabaseConfigured && client) {
            await client.from('profiles').update({
                name: updated.name, position: updated.position,
                password: updated.password, signature_base_64: updated.signatureBase64,
                telegram_chat_id: updated.telegramChatId
            }).eq('id', updated.id);
        }
    };

    // --- UI Layout Renderers ---

    if (isLoading) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-slate-50 gap-6 font-sarabun">
                <div className="relative">
                    <div className="w-24 h-24 border-4 border-blue-100 rounded-full"></div>
                    <Loader className="absolute top-0 animate-spin text-blue-600" size={96} />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">SCHOOL OS</h2>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.3em] mt-1">Booting Smart Platform</p>
                </div>
            </div>
        );
    }
    
    if (!currentUser && !isSuperAdminMode) {
        return (
            <LoginScreen 
                schools={allSchools} 
                teachers={allTeachers} 
                onLogin={handleLogin} 
                onRegister={(sid, id, n) => {
                     const newUser: Teacher = { id, schoolId: sid, name: n, position: 'ครู', roles: ['TEACHER'], password: '123456', isFirstLogin: true };
                     setAllTeachers(prev => [...prev, newUser]);
                     handleLogin(newUser);
                }} 
                onSuperAdminLogin={() => setIsSuperAdminMode(true)} 
            />
        );
    }

    if (isSuperAdminMode) {
        return (
            <SuperAdminDashboard 
                schools={allSchools} 
                teachers={allTeachers} 
                onCreateSchool={async (s) => setAllSchools([...allSchools, s])} 
                onUpdateSchool={async (s) => setAllSchools(allSchools.map(x => x.id === s.id ? s : x))} 
                onDeleteSchool={async (id) => setAllSchools(allSchools.filter(x => x.id !== id))} 
                onUpdateTeacher={async (t) => setAllTeachers(allTeachers.map(x => x.id === t.id ? t : x))} 
                onDeleteTeacher={async (id) => setAllTeachers(allTeachers.filter(x => x.id !== id))} 
                onLogout={handleLogout} 
            />
        );
    }

    if (currentUser?.isFirstLogin) {
        return (
            <FirstLoginSetup 
                user={currentUser} 
                onComplete={async (p, pos) => {
                    const updated = { ...currentUser, password: p, position: pos, isFirstLogin: false };
                    await handleUpdateUser(updated);
                }} 
                onLogout={handleLogout} 
            />
        );
    }

    const currentSchool = allSchools.find(s => s.id === currentUser?.schoolId) || MOCK_SCHOOLS[0];

    const DashboardCard = ({ view, title, subtitle, icon: Icon, color, hasBorder }: { view: SystemView, title: string, subtitle: string, icon: any, color: string, hasBorder?: boolean }) => (
        <div 
            onClick={() => setCurrentView(view)}
            className="group relative bg-white p-8 rounded-[2rem] shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden border border-slate-50 h-56 flex flex-col justify-between"
        >
            {/* Background Blob */}
            <div className={`absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-[0.03] group-hover:scale-110 transition-transform duration-500`} style={{ backgroundColor: color }}></div>
            <div className={`absolute right-4 bottom-4 w-32 h-32 rounded-full opacity-[0.05] group-hover:-translate-x-4 transition-transform duration-500`} style={{ backgroundColor: color }}></div>
            
            <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300" style={{ backgroundColor: `${color}15`, color: color }}>
                    <Icon size={32} />
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-1">{title}</h3>
                <p className="text-slate-400 text-xs font-bold leading-relaxed">{subtitle}</p>
            </div>

            {hasBorder && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-blue-500 rounded-b-[2rem]"></div>
            )}
        </div>
    );

    const renderView = () => {
        const viewTitles: any = {
            [SystemView.DASHBOARD]: 'Dashboard',
            [SystemView.DOCUMENTS]: 'งานสารบรรณ',
            [SystemView.LEAVE]: 'ระบบการลา',
            [SystemView.FINANCE]: 'ระบบการเงิน',
            [SystemView.ATTENDANCE]: 'ลงเวลาทำงาน',
            [SystemView.PLAN]: 'แผนปฏิบัติการ',
            [SystemView.ACADEMIC]: 'งานวิชาการ',
            [SystemView.ADMIN_USERS]: 'ผู้ดูแลระบบ',
            [SystemView.PROFILE]: 'ข้อมูลส่วนตัว',
            [SystemView.DIRECTOR_CALENDAR]: 'ปฏิทินปฏิบัติงาน ผอ.'
        };

        switch (currentView) {
            case SystemView.DASHBOARD: 
                return (
                    <div className="space-y-8 animate-fade-in pb-20">
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <DashboardCard 
                                view={SystemView.PROFILE}
                                title="ข้อมูลส่วนตัว"
                                subtitle="แก้ไขรหัสผ่าน / ลายเซ็นดิจิทัล"
                                icon={UserCircle}
                                color="#8b5cf6" // Purple
                            />
                            <DashboardCard 
                                view={SystemView.DIRECTOR_CALENDAR}
                                title="ปฏิทินปฏิบัติงาน ผอ."
                                subtitle="แจ้งเตือนนัดหมาย และภารกิจ"
                                icon={Calendar}
                                color="#3b82f6" // Blue
                            />
                            <DashboardCard 
                                view={SystemView.ACADEMIC}
                                title="งานวิชาการ"
                                subtitle="สถิตินักเรียน / ผลสอบ O-NET"
                                icon={GraduationCap}
                                color="#6366f1" // Indigo
                            />
                            <DashboardCard 
                                view={SystemView.DOCUMENTS}
                                title="งานสารบรรณ"
                                subtitle="รับ-ส่ง รวดเร็ว ทันใจ"
                                icon={FileText}
                                color="#3b82f6" // Blue
                                hasBorder={true}
                            />
                            <DashboardCard 
                                view={SystemView.PLAN}
                                title="แผนปฏิบัติการ"
                                subtitle="วางแผนแม่นยำ สู่ความสำเร็จ"
                                icon={CalendarRange}
                                color="#d946ef" // Magenta
                            />
                            <DashboardCard 
                                view={SystemView.LEAVE}
                                title="ระบบการลา"
                                subtitle="โปร่งใส ตรวจสอบง่าย"
                                icon={UserCheck}
                                color="#10b981" // Green
                            />
                         </div>
                    </div>
                );
            case SystemView.DOCUMENTS: 
                return <DocumentsSystem 
                    currentUser={currentUser!} 
                    currentSchool={currentSchool} 
                    allTeachers={allTeachers} 
                    focusDocId={focusItem?.view === SystemView.DOCUMENTS ? focusItem.id : null} 
                    onClearFocus={() => setFocusItem(null)} 
                />;
            case SystemView.LEAVE: 
                return <LeaveSystem 
                    currentUser={currentUser!} 
                    currentSchool={currentSchool} 
                    allTeachers={allTeachers} 
                    focusRequestId={focusItem?.view === SystemView.LEAVE ? focusItem.id : null} 
                    onClearFocus={() => setFocusItem(null)} 
                />;
            case SystemView.FINANCE: 
                return <FinanceSystem currentUser={currentUser!} allTeachers={allTeachers} />;
            case SystemView.ATTENDANCE: 
                return <AttendanceSystem currentUser={currentUser!} currentSchool={currentSchool} allTeachers={allTeachers} />;
            case SystemView.PLAN: 
                return <ActionPlanSystem currentUser={currentUser!} />;
            case SystemView.ACADEMIC: 
                return <AcademicSystem currentUser={currentUser!} />;
            case SystemView.ADMIN_USERS: 
                return <AdminUserManagement 
                    teachers={allTeachers.filter(t => t.schoolId === currentSchool.id)} 
                    onAddTeacher={(t) => setAllTeachers([...allTeachers, t])} 
                    onEditTeacher={(t) => setAllTeachers(allTeachers.map(x => x.id === t.id ? t : x))} 
                    onDeleteTeacher={(id) => setAllTeachers(allTeachers.filter(x => x.id !== id))} 
                    currentSchool={currentSchool} 
                    onUpdateSchool={(s) => setAllSchools(allSchools.map(x => x.id === s.id ? s : x))} 
                />;
            case SystemView.PROFILE: 
                return <UserProfile currentUser={currentUser!} onUpdateUser={handleUpdateUser} />;
            case SystemView.DIRECTOR_CALENDAR: 
                return <DirectorCalendar currentUser={currentUser!} allTeachers={allTeachers} />;
            default: 
                return <div>Unexpected Navigation State. Return to <button onClick={() => setCurrentView(SystemView.DASHBOARD)}>Home</button></div>;
        }
    };

    const getViewTitle = (view: SystemView) => {
        const titles: any = {
            [SystemView.DASHBOARD]: 'Dashboard',
            [SystemView.DOCUMENTS]: 'งานสารบรรณ',
            [SystemView.LEAVE]: 'ระบบการลา',
            [SystemView.FINANCE]: 'ระบบการเงิน',
            [SystemView.ATTENDANCE]: 'ลงเวลาทำงาน',
            [SystemView.PLAN]: 'แผนปฏิบัติการ',
            [SystemView.ACADEMIC]: 'งานวิชาการ',
            [SystemView.ADMIN_USERS]: 'ผู้ดูแลระบบ',
            [SystemView.PROFILE]: 'ข้อมูลส่วนตัว',
            [SystemView.DIRECTOR_CALENDAR]: 'ปฏิทินปฏิบัติงาน ผอ.'
        };
        return titles[view] || view;
    }

    return (
        <div className="flex h-screen bg-[#f8fafc] overflow-hidden font-sarabun text-slate-900">
            <Sidebar
                currentView={currentView}
                onChangeView={setCurrentView}
                isMobileOpen={isMobileOpen}
                toggleMobile={() => setIsMobileOpen(!isMobileOpen)}
                currentUser={currentUser!}
                allTeachers={allTeachers}
                onSwitchUser={(id) => {
                    const user = allTeachers.find(t => t.id === id);
                    if (user) {
                        setCurrentUser(user);
                        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: id, isSA: false }));
                        addNotification(`สลับผู้ใช้งานเป็น: ${user.name}`, 'info');
                    }
                }}
                schoolLogo={currentSchool.logoBase64}
            />

            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Header Updated to match image style */}
                <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 lg:px-14 shrink-0 z-40 sticky top-0">
                    <div className="flex items-center gap-6">
                        <button onClick={() => setIsMobileOpen(true)} className="lg:hidden p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-100 transition-colors">
                            <LayoutGrid size={24}/>
                        </button>
                        <div className="flex items-center gap-3">
                            <LayoutGrid size={24} className="text-slate-600" />
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight">{getViewTitle(currentView)}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex flex-col items-end">
                            <p className="text-sm font-black text-slate-800 leading-none">{currentUser?.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">{currentUser?.position}</p>
                        </div>
                        
                        <div className="relative group">
                            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-blue-500/30 cursor-pointer">
                                {currentUser?.name[0]}
                            </div>
                        </div>

                        <button 
                            onClick={handleLogout} 
                            className="p-2 text-slate-300 hover:text-rose-500 transition-all active:scale-90"
                            title="ออกจากระบบ"
                        >
                            <LogOut size={24}/>
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-14 custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto">
                        {renderView()}
                    </div>
                </main>

                {/* Footer Updated to match image style */}
                <footer className="h-14 bg-white border-t border-slate-50 flex items-center justify-between px-8 shrink-0 z-40">
                    <div className="flex items-center gap-3 opacity-60">
                        {currentSchool.logoBase64 ? (
                            <img src={currentSchool.logoBase64} className="w-6 h-6 object-contain" alt="School" />
                        ) : <Globe size={18} className="text-slate-400" />}
                        <span className="text-xs font-black text-slate-600">{currentSchool.name}</span>
                    </div>
                    <div className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
                        SMART SCHOOL MANAGEMENT v5.0
                    </div>
                </footer>

                <div className="lg:hidden h-16 bg-white border-t flex items-center justify-around px-4 shrink-0 z-40">
                    <button onClick={() => setCurrentView(SystemView.DASHBOARD)} className={`p-2 rounded-xl ${currentView === SystemView.DASHBOARD ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><LayoutGrid size={24}/></button>
                    <button onClick={() => setCurrentView(SystemView.DOCUMENTS)} className={`p-2 rounded-xl ${currentView === SystemView.DOCUMENTS ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><FileText size={24}/></button>
                    <button onClick={() => setCurrentView(SystemView.LEAVE)} className={`p-2 rounded-xl ${currentView === SystemView.LEAVE ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><CalendarIcon size={24}/></button>
                    <button onClick={() => setCurrentView(SystemView.PROFILE)} className={`p-2 rounded-xl ${currentView === SystemView.PROFILE ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><UserCircle size={24}/></button>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                
                @keyframes scaleUp { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .animate-scale-up { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
                
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.4s ease-out; }
            `}</style>
        </div>
    );
};

export default App;