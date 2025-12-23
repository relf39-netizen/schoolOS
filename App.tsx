
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
import { SystemView, Teacher, School, TeacherRole, DirectorEvent, SystemConfig } from './types';
import { 
    Activity, Users, Clock, FileText, CalendarRange, 
    Loader, Database, ServerOff, Home, LogOut, 
    Settings, ChevronLeft, Building2, LayoutGrid, Bell, UserCircle, ExternalLink, X, Calendar, GraduationCap
} from 'lucide-react';
import { MOCK_DOCUMENTS, MOCK_LEAVE_REQUESTS, MOCK_TRANSACTIONS, MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';
import { db, isConfigured, collection, onSnapshot, setDoc, doc, deleteDoc, query, where, getDocs, updateDoc, getDoc, type QuerySnapshot, type DocumentData } from './firebaseConfig';
import { sendTelegramMessage } from './utils/telegram';

const SESSION_KEY = 'schoolos_session_v1';

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
    const [focusItem, setFocusItem] = useState<{ view: SystemView, id: string } | null>(null);
    const [pendingDeepLink, setPendingDeepLink] = useState<{ view: SystemView, id: string } | null>(null);
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);

    useEffect(() => {
        let unsubSchools: (() => void) | undefined;
        let unsubTeachers: (() => void) | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        if (isConfigured && db) {
            timeoutId = setTimeout(() => {
                setAllSchools(MOCK_SCHOOLS);
                setAllTeachers(MOCK_TEACHERS);
                setIsDataLoaded(true);
            }, 3000);

            unsubSchools = onSnapshot(collection(db, 'schools'), (snapshot) => {
                const schoolsData = snapshot.docs.map(doc => doc.data() as School);
                setAllSchools(schoolsData.length > 0 ? schoolsData : MOCK_SCHOOLS);
            });

            unsubTeachers = onSnapshot(collection(db, 'teachers'), (snapshot) => {
                if (timeoutId) clearTimeout(timeoutId);
                const teachersData = snapshot.docs.map(doc => doc.data() as Teacher);
                setAllTeachers(teachersData.length > 0 ? teachersData : MOCK_TEACHERS);
                setIsDataLoaded(true);
            });
        } else {
            setAllSchools(MOCK_SCHOOLS);
            setAllTeachers(MOCK_TEACHERS);
            setIsDataLoaded(true);
        }
        return () => { if (timeoutId) clearTimeout(timeoutId); if (unsubSchools) unsubSchools(); if (unsubTeachers) unsubTeachers(); };
    }, []);

    useEffect(() => {
        if (!isDataLoaded) return;
        const storedSession = localStorage.getItem(SESSION_KEY);
        if (storedSession) {
            try {
                const session = JSON.parse(storedSession);
                if (session.isSuperAdmin) setIsSuperAdminMode(true);
                else {
                    const user = allTeachers.find(t => t.id === session.userId);
                    if (user) setCurrentUser(user);
                }
            } catch (e) { localStorage.removeItem(SESSION_KEY); }
        }
        const params = new URLSearchParams(window.location.search);
        const viewParam = params.get('view');
        const idParam = params.get('id');
        if (viewParam && idParam && Object.values(SystemView).includes(viewParam as SystemView)) {
            setPendingDeepLink({ view: viewParam as SystemView, id: idParam });
        }
        setIsLoading(false);
    }, [isDataLoaded, allTeachers]);

    useEffect(() => {
        if (currentUser && pendingDeepLink) {
            setCurrentView(pendingDeepLink.view);
            setFocusItem({ view: pendingDeepLink.view, id: pendingDeepLink.id });
            setPendingDeepLink(null); 
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [currentUser, pendingDeepLink]);

    useEffect(() => {
        const checkCalendarNotifications = async () => {
            if (!currentUser || !isConfigured || !db) return;
            try {
                const configRef = doc(db, "schools", currentUser.schoolId, "settings", "config");
                const configDoc = await getDoc(configRef);
                if (!configDoc.exists()) return;
                const config = configDoc.data() as SystemConfig;
                if (!config.telegramBotToken) return;
                const directors = allTeachers.filter(t => t.schoolId === currentUser.schoolId && t.roles.includes('DIRECTOR') && t.telegramChatId);
                const todayStr = new Date().toISOString().split('T')[0];
                const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = tomorrow.toISOString().split('T')[0];
                const q = query(collection(db, "director_events"), where("schoolId", "==", currentUser.schoolId), where("date", "in", [todayStr, tomorrowStr]));
                const snapshot = await getDocs(q);
                snapshot.forEach(async (docSnap) => {
                    const evt = docSnap.data() as DirectorEvent;
                    let notifType = (evt.date === tomorrowStr && !evt.notifiedOneDayBefore) ? 'TOMORROW' : (evt.date === todayStr && !evt.notifiedOnDay) ? 'TODAY' : '';
                    if (notifType) {
                        const title = notifType === 'TOMORROW' ? "แจ้งเตือนภารกิจวันพรุ่งนี้" : "แจ้งเตือนภารกิจวันนี้";
                        const icon = notifType === 'TOMORROW' ? "⏰" : "🔔";
                        const message = `${icon} <b>${title}</b>\nเรื่อง: ${evt.title}\nวันที่: ${evt.date}\nเวลา: ${evt.startTime}\nสถานที่: ${evt.location}`;
                        const baseUrl = config.appBaseUrl || window.location.origin;
                        directors.forEach(d => { if (config.telegramBotToken && d.telegramChatId) sendTelegramMessage(config.telegramBotToken, d.telegramChatId, message, `${baseUrl}?view=DIRECTOR_CALENDAR`); });
                        await updateDoc(docSnap.ref, notifType === 'TOMORROW' ? { notifiedOneDayBefore: true } : { notifiedOnDay: true });
                    }
                });
            } catch (e) { console.error(e); }
        };
        const timer = setTimeout(checkCalendarNotifications, 3000);
        return () => clearTimeout(timer);
    }, [currentUser, isDataLoaded, allTeachers]);

    useEffect(() => {
        let unsubLeave: (() => void) | undefined;
        if (currentUser && isConfigured && db) {
            const q = query(collection(db, "leave_requests"), where("status", "==", "Pending"), where("schoolId", "==", currentUser.schoolId));
            let isInitial = true;
            unsubLeave = onSnapshot(q, (snapshot) => {
                setPendingLeaveCount(snapshot.size);
                if (currentUser.roles.includes('DIRECTOR')) {
                    if (isInitial) { isInitial = false; return; }
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            const data = change.doc.data();
                            const msg = `มีรายการลาใหม่จาก: ${data.teacherName || 'บุคลากร'} รอการอนุมัติ`;
                            setNotification({ message: msg, type: 'info', linkTo: SystemView.LEAVE, linkId: change.doc.id });
                        }
                    });
                }
            });
        }
        return () => { if (unsubLeave) unsubLeave(); };
    }, [currentUser]);

    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleRegister = async (schoolId: string, id: string, name: string) => {
        const newUser: Teacher = { id, schoolId, name, password: '123456', position: 'ครู', roles: ['TEACHER'], isFirstLogin: true };
        if (isConfigured && db) await setDoc(doc(db, 'teachers', newUser.id), newUser);
        else setAllTeachers([...allTeachers, newUser]);
        handleLogin(newUser);
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setIsSuperAdminMode(false);
        localStorage.removeItem(SESSION_KEY);
        setCurrentView(SystemView.DASHBOARD);
    };

    const handleFirstLoginComplete = async (newPass: string, position: string) => {
        if (!currentUser) return;
        const updatedUser: Teacher = { ...currentUser, password: newPass, position, isFirstLogin: false, roles: position.includes('ผู้อำนวยการ') ? ['DIRECTOR', 'TEACHER'] : currentUser.roles };
        if (isConfigured && db) await setDoc(doc(db, 'teachers', updatedUser.id), updatedUser);
        else setAllTeachers(allTeachers.map(t => t.id === currentUser.id ? updatedUser : t));
        setCurrentUser(updatedUser);
    };

    const handleUpdateSchool = async (s: School) => { if (isConfigured && db) await setDoc(doc(db, 'schools', s.id), s); };
    const handleDeleteSchool = async (id: string) => { if (isConfigured && db) await deleteDoc(doc(db, 'schools', id)); };
    const handleAddTeacher = async (t: Teacher) => { if (isConfigured && db) await setDoc(doc(db, 'teachers', t.id), t); };
    const handleEditTeacher = async (t: Teacher) => { if (isConfigured && db) await setDoc(doc(db, 'teachers', t.id), t); };
    const handleDeleteTeacher = async (id: string) => { if (isConfigured && db) await deleteDoc(doc(db, 'teachers', id)); };

    const schoolTeachers = allTeachers.filter(t => t.schoolId === currentUser?.schoolId);
    const currentSchool = allSchools.find(s => s.id === currentUser?.schoolId);

    const modules = [
        { id: SystemView.PROFILE, title: 'ข้อมูลส่วนตัว', slogan: 'แก้ไขรหัสผ่าน / ลายเซ็นดิจิทัล', icon: UserCircle, color: 'bg-purple-500', blob: 'rgba(168, 85, 247, 0.1)', visible: true },
        { id: SystemView.DIRECTOR_CALENDAR, title: 'ปฏิทินปฏิบัติงาน ผอ.', slogan: 'แจ้งเตือนนัดหมาย และภารกิจ', icon: Calendar, color: 'bg-blue-500', blob: 'rgba(59, 130, 246, 0.1)', visible: true },
        { id: SystemView.ACADEMIC, title: 'งานวิชาการ', slogan: 'สถิตินักเรียน / ผลสอบ O-NET', icon: GraduationCap, color: 'bg-indigo-600', blob: 'rgba(79, 70, 229, 0.1)', visible: true },
        { id: SystemView.DOCUMENTS, title: 'งานสารบรรณ', slogan: 'รับ-ส่ง รวดเร็ว ทันใจ', icon: FileText, color: 'bg-blue-400', blob: 'rgba(56, 189, 248, 0.1)', visible: true },
        { id: SystemView.PLAN, title: 'แผนปฏิบัติการ', slogan: 'วางแผนแม่นยำ สู่ความสำเร็จ', icon: CalendarRange, color: 'bg-fuchsia-500', blob: 'rgba(217, 70, 239, 0.1)', visible: true },
        { id: SystemView.LEAVE, title: 'ระบบการลา', slogan: 'โปร่งใส ตรวจสอบง่าย', icon: Users, color: 'bg-emerald-500', blob: 'rgba(16, 185, 129, 0.1)', visible: true, badge: pendingLeaveCount > 0 ? `มีใบลา ${pendingLeaveCount} ใบ` : null },
        { id: SystemView.FINANCE, title: 'ระบบการเงิน', slogan: 'คุมงบประมาณ อย่างมีประสิทธิภาพ', icon: Activity, color: 'bg-orange-500', blob: 'rgba(249, 115, 22, 0.1)', visible: currentUser?.roles.includes('DIRECTOR') || currentUser?.roles.includes('FINANCE_BUDGET') || currentUser?.roles.includes('FINANCE_NONBUDGET') },
        { id: SystemView.ATTENDANCE, title: 'ลงเวลาทำงาน', slogan: 'เช็คเวลาแม่นยำ ด้วย GPS', icon: Clock, color: 'bg-rose-500', blob: 'rgba(244, 63, 94, 0.1)', visible: true },
        { id: SystemView.ADMIN_USERS, title: 'ผู้ดูแลระบบ', slogan: 'ตั้งค่าระบบ และผู้ใช้งาน', icon: Settings, color: 'bg-slate-500', blob: 'rgba(100, 116, 139, 0.1)', visible: currentUser?.roles.includes('SYSTEM_ADMIN') || currentUser?.roles.includes('DIRECTOR') }
    ];

    const DashboardCards = () => (
        <div className="p-6 md:p-12 animate-fade-in pb-24 max-w-7xl mx-auto space-y-12">
            {/* Greeting Banner */}
            <div className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-8">
                <div className="w-24 h-24 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100 shrink-0">
                    {currentSchool?.logoBase64 ? (
                        <img src={currentSchool.logoBase64} alt="logo" className="w-full h-full object-contain rounded-2xl" />
                    ) : (
                        <Building2 size={48} />
                    )}
                </div>
                <div className="text-center md:text-left">
                    <h2 className="text-3xl font-black text-slate-800">สวัสดี, {currentUser?.name}</h2>
                    <p className="text-slate-400 font-bold mt-1 text-sm md:text-base">
                        {currentUser?.position} | {currentSchool?.name}
                    </p>
                </div>
            </div>
            
            {/* Dashboard Shortcuts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {modules.filter(m => m.visible).map((module) => {
                    const Icon = module.icon;
                    return (
                        <button 
                            key={module.id} 
                            onClick={() => setCurrentView(module.id)} 
                            className="relative bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 group overflow-hidden"
                        >
                            {/* Blob Decoration */}
                            <div 
                                className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full transition-transform duration-500 group-hover:scale-150"
                                style={{ backgroundColor: module.blob }}
                            />
                            
                            <div className="relative z-10 flex items-center gap-6">
                                <div className={`w-16 h-16 ${module.color} text-white rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 shrink-0`}>
                                    <Icon size={30}/>
                                </div>
                                <div className="text-left">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-black text-slate-800 text-lg leading-tight">{module.title}</h4>
                                        {module.badge && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1 font-bold">{module.slogan}</p>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
            <div className="flex justify-between items-center px-4">
                 <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isConfigured ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {isConfigured ? <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/> : <div className="w-2 h-2 rounded-full bg-red-500"/>}
                    {isConfigured ? 'Cloud SQL Connected' : 'Local Sandbox Mode'}
                </div>
                <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest">© MR SIAM CH</div>
            </div>
        </div>
    );

    const renderContent = () => {
        if (!currentSchool) return <div className="p-8 text-center text-slate-500">ไม่พบข้อมูลโรงเรียน</div>;
        switch (currentView) {
            case SystemView.PROFILE: return <UserProfile currentUser={currentUser!} onUpdateUser={setCurrentUser} />;
            case SystemView.DIRECTOR_CALENDAR: return <DirectorCalendar currentUser={currentUser!} allTeachers={schoolTeachers} />;
            case SystemView.ACADEMIC: return <AcademicSystem currentUser={currentUser!} />;
            case SystemView.DOCUMENTS: return <DocumentsSystem currentUser={currentUser!} allTeachers={schoolTeachers} focusDocId={focusItem?.view === SystemView.DOCUMENTS ? focusItem.id : null} onClearFocus={() => setFocusItem(null)} />;
            case SystemView.LEAVE: return <LeaveSystem currentUser={currentUser!} allTeachers={schoolTeachers} currentSchool={currentSchool} focusRequestId={focusItem?.view === SystemView.LEAVE ? focusItem.id : null} onClearFocus={() => setFocusItem(null)} />;
            case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser!} allTeachers={schoolTeachers} />;
            case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser!} allTeachers={schoolTeachers} currentSchool={currentSchool} />;
            case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser!} />;
            case SystemView.ADMIN_USERS: return <AdminUserManagement teachers={schoolTeachers} currentSchool={currentSchool} onUpdateSchool={handleUpdateSchool} onAddTeacher={handleAddTeacher} onEditTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher} />;
            default: return <DashboardCards />;
        }
    };

    if (isLoading || !isDataLoaded) return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400 gap-2"><Loader className="animate-spin"/> กำลังเชื่อมต่อฐานข้อมูล...</div>;
    if (isSuperAdminMode) return <SuperAdminDashboard schools={allSchools} teachers={allTeachers} onCreateSchool={async(s)=>await setDoc(doc(db,'schools',s.id),s)} onUpdateSchool={handleUpdateSchool} onDeleteSchool={handleDeleteSchool} onUpdateTeacher={handleEditTeacher} onLogout={handleLogout} onDeleteTeacher={handleDeleteTeacher} />;
    if (!currentUser) return <LoginScreen schools={allSchools} teachers={allTeachers} onLogin={handleLogin} onRegister={handleRegister} onSuperAdminLogin={()=>setIsSuperAdminMode(true)} />;
    if (currentUser.isFirstLogin) return <FirstLoginSetup user={currentUser} onComplete={handleFirstLoginComplete} onLogout={handleLogout} />;

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 font-sarabun">
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 shadow-sm print:hidden">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        {currentView !== SystemView.DASHBOARD && <button onClick={() => setCurrentView(SystemView.DASHBOARD)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><ChevronLeft size={24} /></button>}
                         <h1 className="text-xl font-black text-slate-700 tracking-tight uppercase flex items-center gap-2">
                            {currentView === SystemView.DASHBOARD ? <><LayoutGrid className="text-blue-600" size={20}/> Dashboard</> : modules.find(m => m.id === currentView)?.title || 'Menu'}
                        </h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden sm:block text-right">
                            <p className="text-sm font-black text-slate-800 leading-none">{currentUser.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-1">{currentUser.position}</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-xs shadow-lg ring-2 ring-white">
                            {currentUser.name[0]}
                        </div>
                        <button onClick={handleLogout} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><LogOut size={22}/></button>
                    </div>
                </div>
            </header>
            <main className="flex-1 w-full">
                {currentView !== SystemView.DASHBOARD ? (
                    <div className="max-w-7xl mx-auto p-6 md:p-10 pb-24 animate-fade-in">{renderContent()}</div>
                ) : renderContent()}
            </main>
        </div>
    );
};

export default App;
