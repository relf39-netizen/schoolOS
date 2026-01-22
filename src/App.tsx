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
    FileText
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
        const client = supabase; // Narrowing locally
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
            
            // Fix TS18047: Use local constant for narrowing
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
        // Fix TS18047: Local variable narrowing
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
            if (client) {
                client.removeChannel(channel); 
            }
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
        setAllTeachers(prev => prev.map(t => t.id === updated.id ? updated : t));
        setCurrentUser(updated);
        
        // Fix TS18047: Local variable narrowing
        const client = supabase;
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

    const renderView = () => {
        switch (currentView) {
            case SystemView.DASHBOARD: 
                return (
                    <div className="space-y-8 animate-fade-in pb-20">
                         <div className="bg-white p-10 rounded-[3rem] shadow-xl shadow-blue-900/5 border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden">
                             <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-bl-full -z-10 opacity-50"></div>
                             <div className="flex items-center gap-6">
                                <div className="p-5 bg-blue-600 text-white rounded-[2rem] shadow-2xl shadow-blue-500/20">
                                    <Monitor size={36}/>
                                </div>
                                <div>
                                    <h2 className="text-4xl font-black text-slate-800 tracking-tight">ยินดีต้อนรับสู่ระบบบริหารจัดการ</h2>
                                    <p className="text-slate-400 font-bold text-lg mt-1">Smart SchoolOS v5.4 | {currentSchool.name}</p>
                                </div>
                             </div>
                             <div className="flex gap-3">
                                 <button onClick={() => setCurrentView(SystemView.DOCUMENTS)} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black shadow-lg hover:scale-105 transition-all">งานสารบรรณ</button>
                                 <button onClick={() => setCurrentView(SystemView.LEAVE)} className="bg-blue-50 text-blue-600 px-8 py-3 rounded-2xl font-black border border-blue-100 hover:bg-blue-100 transition-all">ระบบการลา</button>
                             </div>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm flex flex-col gap-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">บุคลากรทั้งหมด</p>
                                <div className="flex items-end justify-between">
                                    <span className="text-4xl font-black text-slate-800">{allTeachers.filter(t => t.schoolId === currentSchool.id).length}</span>
                                    <UserCircle className="text-slate-100" size={48}/>
                                </div>
                             </div>
                             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm flex flex-col gap-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">ฐานข้อมูลเชื่อมต่อ</p>
                                <div className="flex items-end justify-between">
                                    <span className={`text-xl font-black uppercase tracking-widest ${syncSource === 'SQL' ? 'text-emerald-600' : 'text-blue-600'}`}>{syncSource} Cloud</span>
                                    <Database className="text-slate-100" size={48}/>
                                </div>
                             </div>
                             <div className="bg-white p-8 rounded-[2.5rem] border border-slate-50 shadow-sm flex flex-col gap-4">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">สถานะระบบ</p>
                                <div className="flex items-end justify-between">
                                    <span className="text-xl font-black text-emerald-600 flex items-center gap-2">
                                        <CheckCircle2 size={24}/> Online
                                    </span>
                                    <Globe className="text-slate-100" size={48}/>
                                </div>
                             </div>
                         </div>
                         
                         <div className="py-20 text-center bg-white rounded-[3.5rem] border-2 border-dashed border-slate-100">
                             <LayoutGrid className="mx-auto text-slate-100 mb-4" size={64}/>
                             <p className="text-slate-400 font-black uppercase tracking-[0.3em]">กรุณาเลือกเมนูเพื่อแสดงข้อมูลเชิงลึก</p>
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
                <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between px-8 lg:px-14 shrink-0 z-40 sticky top-0">
                    <div className="flex items-center gap-6">
                        <button onClick={() => setIsMobileOpen(true)} className="lg:hidden p-3 bg-slate-50 text-slate-600 rounded-2xl hover:bg-slate-100 transition-colors">
                            <LayoutGrid size={24}/>
                        </button>
                        <div className="flex flex-col">
                            <h1 className="text-2xl font-black text-slate-800 tracking-tight truncate max-w-[200px] md:max-w-md">{currentSchool.name}</h1>
                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                <span className="flex items-center gap-1"><RefreshCw size={10} className="text-blue-500"/> SYNCED</span>
                                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                <span>{currentView}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <button 
                                onClick={() => setShowNotificationCenter(!showNotificationCenter)}
                                className={`p-3 rounded-2xl transition-all relative ${notifications.filter(n => !n.read).length > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                            >
                                <Bell size={22}/>
                                {notifications.filter(n => !n.read).length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-black flex items-center justify-center border-2 border-white animate-bounce">
                                        {notifications.filter(n => !n.read).length}
                                    </span>
                                )}
                            </button>
                            
                            {showNotificationCenter && (
                                <div className="absolute top-full right-0 mt-4 w-80 bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-4 animate-scale-up z-50">
                                    <div className="flex justify-between items-center px-4 mb-4 border-b pb-3 border-slate-50">
                                        <h4 className="font-black text-slate-800 text-xs uppercase tracking-widest">การแจ้งเตือน</h4>
                                        <button onClick={() => setNotifications([])} className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors">ล้างทั้งหมด</button>
                                    </div>
                                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                                        {notifications.length === 0 ? (
                                            <p className="text-center py-10 text-[10px] text-slate-300 font-black uppercase tracking-widest">ไม่มีการแจ้งเตือนใหม่</p>
                                        ) : notifications.map(n => (
                                            <div 
                                                key={n.id} 
                                                onClick={() => {
                                                    if(n.view) {
                                                        setCurrentView(n.view);
                                                        if(n.targetId) setFocusItem({ view: n.view, id: n.targetId });
                                                    }
                                                    setNotifications(prev => prev.map(x => x.id === n.id ? {...x, read: true} : x));
                                                    setShowNotificationCenter(false);
                                                }}
                                                className={`p-4 rounded-2xl cursor-pointer transition-all border-l-4 ${n.read ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-blue-500 hover:shadow-lg'}`}
                                            >
                                                <p className="text-xs font-bold text-slate-800 leading-relaxed">{n.message}</p>
                                                <p className="text-[9px] text-slate-400 mt-2 font-mono">{new Date(n.timestamp).toLocaleTimeString()}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={handleLogout} 
                            className="p-3 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                        >
                            <LogOut size={22}/>
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-14 custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto">
                        {renderView()}
                    </div>
                </main>

                <div className="lg:hidden h-16 bg-white border-t flex items-center justify-around px-4 shrink-0 z-40">
                    <button onClick={() => setCurrentView(SystemView.DASHBOARD)} className={`p-2 rounded-xl ${currentView === SystemView.DASHBOARD ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><LayoutGrid size={24}/></button>
                    <button onClick={() => setCurrentView(SystemView.DOCUMENTS)} className={`p-2 rounded-xl ${currentView === SystemView.DOCUMENTS ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><FileText size={24}/></button>
                    <button onClick={() => setCurrentView(SystemView.LEAVE)} className={`p-2 rounded-xl ${currentView === SystemView.LEAVE ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><CalendarIcon size={24}/></button>
                    <button onClick={() => setCurrentView(SystemView.PROFILE)} className={`p-2 rounded-xl ${currentView === SystemView.PROFILE ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}><UserCircle size={24}/></button>
                </div>

                <div className="fixed bottom-6 left-6 z-50 pointer-events-none hidden md:block">
                    <div className="bg-slate-900/90 text-white backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl border border-white/10">
                        <div className={`w-2 h-2 rounded-full ${syncSource === 'SQL' ? 'bg-emerald-50 animate-pulse' : 'bg-blue-500'}`}></div>
                        <span>CLOUD STATUS: {syncSource} CONNECTED</span>
                    </div>
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