
import React, { useState, useEffect } from 'react';
// Sidebar is removed
import DocumentsSystem from './components/DocumentsSystem';
import LeaveSystem from './components/LeaveSystem';
import FinanceSystem from './components/FinanceSystem';
import AttendanceSystem from './components/AttendanceSystem';
import ActionPlanSystem from './components/ActionPlanSystem';
import AdminUserManagement from './components/AdminUserManagement';
import UserProfile from './components/UserProfile';
import LoginScreen from './components/LoginScreen';
import FirstLoginSetup from './components/FirstLoginSetup';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import { SystemView, Teacher, School, TeacherRole } from './types';
import { 
    Activity, Users, Clock, FileText, CalendarRange, 
    Loader, Database, ServerOff, Home, LogOut, 
    Settings, ChevronLeft, Building2, LayoutGrid, Bell, UserCircle, ExternalLink, X
} from 'lucide-react';
import { MOCK_DOCUMENTS, MOCK_LEAVE_REQUESTS, MOCK_TRANSACTIONS, MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';
import { db, isConfigured } from './firebaseConfig';
import { collection, onSnapshot, setDoc, doc, deleteDoc, query, where, QuerySnapshot, DocumentData } from 'firebase/firestore';

// Keys for LocalStorage
const SESSION_KEY = 'schoolos_session_v1';

interface AppNotification {
    message: string;
    type: 'info' | 'alert';
    linkTo?: SystemView;
    linkId?: string;
}

const App: React.FC = () => {
    // Global Data State
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    
    // Auth State
    const [currentUser, setCurrentUser] = useState<Teacher | null>(null);
    const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Notification State
    const [notification, setNotification] = useState<AppNotification | null>(null);
    const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

    // Deep Link State (For clicking notification)
    const [focusItem, setFocusItem] = useState<{ view: SystemView, id: string } | null>(null);

    // --- DATA SYNCHRONIZATION (FIREBASE) ---
    useEffect(() => {
        let unsubSchools: (() => void) | undefined;
        let unsubTeachers: (() => void) | undefined;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;

        if (isConfigured && db) {
            // SAFETY: Set a timeout to fallback to Mocks if Firestore is unreachable/slow (e.g. 3 seconds)
            timeoutId = setTimeout(() => {
                console.warn("Firestore connection timeout. Falling back to Mock Data.");
                setAllSchools(MOCK_SCHOOLS);
                setAllTeachers(MOCK_TEACHERS);
                setIsDataLoaded(true);
            }, 3000);

            // 1. Sync Schools
            unsubSchools = onSnapshot(collection(db, 'schools'), (snapshot: QuerySnapshot<DocumentData>) => {
                const schoolsData = snapshot.docs.map(doc => doc.data() as School);
                if (schoolsData.length > 0) {
                    setAllSchools(schoolsData);
                } else {
                    setAllSchools(MOCK_SCHOOLS);
                }
            }, (err) => {
                console.error("School Sync Error:", err);
                setAllSchools(MOCK_SCHOOLS);
            });

            // 2. Sync Teachers
            unsubTeachers = onSnapshot(collection(db, 'teachers'), (snapshot: QuerySnapshot<DocumentData>) => {
                if (timeoutId) clearTimeout(timeoutId);
                const teachersData = snapshot.docs.map(doc => doc.data() as Teacher);
                if (teachersData.length > 0) {
                    setAllTeachers(teachersData);
                } else {
                    setAllTeachers(MOCK_TEACHERS);
                }
                setIsDataLoaded(true);
            }, (err) => {
                if (timeoutId) clearTimeout(timeoutId);
                console.error("Teacher Sync Error:", err);
                setAllTeachers(MOCK_TEACHERS);
                setIsDataLoaded(true);
            });
        } else {
            setAllSchools(MOCK_SCHOOLS);
            setAllTeachers(MOCK_TEACHERS);
            setIsDataLoaded(true);
        }

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (unsubSchools) unsubSchools();
            if (unsubTeachers) unsubTeachers();
        };
    }, []);

    // Check LocalStorage on Mount
    useEffect(() => {
        if (!isDataLoaded) return;
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
                localStorage.removeItem(SESSION_KEY);
            }
        }
        setIsLoading(false);
    }, [isDataLoaded, allTeachers]);

    // --- NOTIFICATION HELPERS ---
    const requestNotificationPermission = async () => {
        if ('Notification' in window && Notification.permission !== 'granted') {
            await Notification.requestPermission();
        }
    };

    useEffect(() => {
        requestNotificationPermission();
    }, []);

    const sendSystemNotification = (title: string, body: string, linkTo?: SystemView, linkId?: string) => {
        // 1. Browser Notification
        if ('Notification' in window && Notification.permission === 'granted') {
            const notif = new Notification(title, { body, icon: '/vite.svg' });
            
            // Handle click on the system notification
            if (linkTo) {
                notif.onclick = (e) => {
                    e.preventDefault();
                    window.focus();
                    setCurrentView(linkTo);
                    if (linkId) {
                        setFocusItem({ view: linkTo, id: linkId });
                    }
                    setNotification(null); // Clear toast
                    notif.close();
                };
            }
        }
        // 2. Sound
        try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {}); // Catch autoplay blocks
        } catch(e) {}
    };

    // --- LEAVE LISTENER ---
    useEffect(() => {
        let unsubLeave: (() => void) | undefined;
        
        if (currentUser && isConfigured && db) {
            // Query for Pending requests in this school
            const q = query(
                collection(db, "leave_requests"), 
                where("status", "==", "Pending"),
                where("schoolId", "==", currentUser.schoolId) 
            );
            
            // To handle "New Notification" sound, we track changes
            let isInitial = true;

            unsubLeave = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
                // Update Count for Badge
                setPendingLeaveCount(snapshot.size);

                if (currentUser.roles.includes('DIRECTOR')) {
                    if (isInitial) {
                        isInitial = false;
                        return;
                    }
                    
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            const data = change.doc.data();
                            const teacherName = data.teacherName || 'บุคลากร';
                            const msg = `มีรายการลาใหม่จาก: ${teacherName} รอการอนุมัติ`;
                            const leaveId = change.doc.id;

                            setNotification({
                                message: msg,
                                type: 'info',
                                linkTo: SystemView.LEAVE,
                                linkId: leaveId
                            });
                            // Trigger system notification with link
                            sendSystemNotification('อนุมัติการลา', msg, SystemView.LEAVE, leaveId);
                        }
                    });
                }
            });
        } else if (!isConfigured) {
            // Mock Mode count
            const pending = MOCK_LEAVE_REQUESTS.filter(l => l.status === 'Pending').length;
            setPendingLeaveCount(pending);
        }

        return () => {
            if (unsubLeave) unsubLeave();
        };
    }, [currentUser]);

    // --- DOCUMENTS LISTENER ---
    useEffect(() => {
        let unsubDocs: (() => void) | undefined;

        if (currentUser && isConfigured && db) {
            // Query documents for this school
            const qDocs = query(
                collection(db, "documents"), 
                where("schoolId", "==", currentUser.schoolId)
            );

            let isInitial = true;

            unsubDocs = onSnapshot(qDocs, (snapshot: QuerySnapshot<DocumentData>) => {
                if (isInitial) {
                    isInitial = false;
                    return;
                }

                snapshot.docChanges().forEach((change) => {
                    const docData = change.doc.data();
                    const docId = change.doc.id;

                    // 1. Notify Director for New Pending Documents
                    if (change.type === 'added' && docData.status === 'PendingDirector' && currentUser.roles.includes('DIRECTOR')) {
                        const msg = `หนังสือราชการใหม่: ${docData.title} รอเกษียณ`;
                        setNotification({
                            message: msg,
                            type: 'info',
                            linkTo: SystemView.DOCUMENTS,
                            linkId: docId
                        });
                        sendSystemNotification('งานสารบรรณ', msg, SystemView.DOCUMENTS, docId);
                    }

                    // 2. Notify Teachers for Distributed Documents
                    if ((change.type === 'added' || change.type === 'modified') && docData.status === 'Distributed') {
                        const targets = docData.targetTeachers || [];
                        const acks = docData.acknowledgedBy || [];

                        // If user is target and hasn't acknowledged yet
                        if (targets.includes(currentUser.id) && !acks.includes(currentUser.id)) {
                             const msg = `มีหนังสือสั่งการถึงท่าน: ${docData.title}`;
                            setNotification({
                                message: msg,
                                type: 'alert',
                                linkTo: SystemView.DOCUMENTS,
                                linkId: docId
                            });
                            sendSystemNotification('หนังสือสั่งการ', msg, SystemView.DOCUMENTS, docId);
                        }
                    }
                });
            });
        }

        return () => {
            if (unsubDocs) unsubDocs();
        };
    }, [currentUser]);


    // UI State
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);

    // --- Auth Handlers ---
    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleRegister = async (schoolId: string, id: string, name: string) => {
        const newUser: Teacher = {
            id, schoolId, name, password: '123456', position: 'ครู', roles: ['TEACHER'], isFirstLogin: true
        };
        if (isConfigured && db) {
            try { await setDoc(doc(db, 'teachers', newUser.id), newUser); } 
            catch (e) { alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล"); return; }
        } else {
            setAllTeachers([...allTeachers, newUser]);
        }
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

    const handleFirstLoginComplete = async (newPass: string, position: string) => {
        if (!currentUser) return;
        const updatedUser: Teacher = { 
            ...currentUser, 
            password: newPass, 
            position: position, 
            isFirstLogin: false, 
            roles: position.includes('ผู้อำนวยการ') ? (['DIRECTOR', 'TEACHER'] as TeacherRole[]) : currentUser.roles
        };

        if (isConfigured && db) {
            await setDoc(doc(db, 'teachers', updatedUser.id), updatedUser);
        } else {
            const updatedList = allTeachers.map(t => t.id === currentUser.id ? updatedUser : t);
            setAllTeachers(updatedList);
        }
        setCurrentUser(updatedUser);
        alert('ตั้งค่าเรียบร้อยแล้ว ยินดีต้อนรับเข้าสู่ระบบ');
    };

    // --- School & User CRUD ---
    const handleCreateSchool = async (newSchool: School) => {
        if (isConfigured && db) await setDoc(doc(db, 'schools', newSchool.id), newSchool);
        else setAllSchools([...allSchools, newSchool]);
    };
    const handleUpdateSchool = async (updatedSchool: School) => {
        if (isConfigured && db) await setDoc(doc(db, 'schools', updatedSchool.id), updatedSchool);
        else setAllSchools(allSchools.map(s => s.id === updatedSchool.id ? updatedSchool : s));
    };
    const handleDeleteSchool = async (schoolId: string) => {
        if (isConfigured && db) await deleteDoc(doc(db, 'schools', schoolId));
        else setAllSchools(allSchools.filter(s => s.id !== schoolId));
    };
    const handleAddTeacher = async (newTeacher: Teacher) => {
        if (isConfigured && db) await setDoc(doc(db, 'teachers', newTeacher.id), newTeacher);
        else setAllTeachers([...allTeachers, newTeacher]);
    };
    const handleEditTeacher = async (updatedTeacher: Teacher) => {
        if (isConfigured && db) await setDoc(doc(db, 'teachers', updatedTeacher.id), updatedTeacher);
        else setAllTeachers(allTeachers.map(t => t.id === updatedTeacher.id ? updatedTeacher : t));
    };
    const handleDeleteTeacher = async (teacherId: string) => {
        if (isConfigured && db) await deleteDoc(doc(db, 'teachers', teacherId));
        else setAllTeachers(allTeachers.filter(t => t.id !== teacherId));
    };

    const handleNotificationClick = () => {
        if (notification?.linkTo) {
            setCurrentView(notification.linkTo);
            if (notification.linkId) {
                setFocusItem({ view: notification.linkTo, id: notification.linkId });
            }
            setNotification(null);
        }
    };

    // --- Renderers ---
    if (isLoading || !isDataLoaded) {
        return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400 gap-2"><Loader className="animate-spin"/> กำลังเชื่อมต่อฐานข้อมูล...</div>;
    }

    if (isSuperAdminMode) {
        return <SuperAdminDashboard schools={allSchools} teachers={allTeachers} onCreateSchool={handleCreateSchool} onUpdateSchool={handleUpdateSchool} onDeleteSchool={handleDeleteSchool} onUpdateTeacher={handleEditTeacher} onLogout={handleLogout} />;
    }

    if (!currentUser) {
        return <LoginScreen schools={allSchools} teachers={allTeachers} onLogin={handleLogin} onRegister={handleRegister} onSuperAdminLogin={handleSuperAdminLogin} />;
    }

    if (currentUser.isFirstLogin) {
        return <FirstLoginSetup user={currentUser} onComplete={handleFirstLoginComplete} onLogout={handleLogout} />;
    }

    // --- Main App Logic ---
    const schoolTeachers = allTeachers.filter(t => t.schoolId === currentUser.schoolId);
    const currentSchool = allSchools.find(s => s.id === currentUser.schoolId);

    // --- CARD DATA DEFINITION ---
    const modules = [
        {
            id: SystemView.PROFILE,
            title: 'ข้อมูลส่วนตัว',
            slogan: 'แก้ไขรหัสผ่าน / ลายเซ็นดิจิทัล',
            icon: UserCircle,
            color: 'from-purple-500 to-indigo-400',
            shadow: 'shadow-purple-200',
            visible: true
        },
        {
            id: SystemView.DOCUMENTS,
            title: 'งานสารบรรณ',
            slogan: 'รับ-ส่ง รวดเร็ว ทันใจ',
            icon: FileText,
            color: 'from-blue-500 to-cyan-400',
            shadow: 'shadow-blue-200',
            visible: true
        },
        {
            id: SystemView.PLAN,
            title: 'แผนปฏิบัติการ',
            slogan: 'วางแผนแม่นยำ สู่ความสำเร็จ',
            icon: CalendarRange,
            color: 'from-violet-500 to-fuchsia-400',
            shadow: 'shadow-violet-200',
            visible: true
        },
        {
            id: SystemView.LEAVE,
            title: 'ระบบการลา',
            slogan: 'โปร่งใส ตรวจสอบง่าย',
            icon: Users,
            color: 'from-emerald-500 to-teal-400',
            shadow: 'shadow-emerald-200',
            visible: true,
            // Add notification badge logic here
            badge: pendingLeaveCount > 0 ? `มีใบลา ${pendingLeaveCount} ใบ` : null
        },
        {
            id: SystemView.FINANCE,
            title: 'ระบบการเงิน',
            slogan: 'คุมงบประมาณ อย่างมีประสิทธิภาพ',
            icon: Activity,
            color: 'from-amber-500 to-orange-400',
            shadow: 'shadow-amber-200',
            visible: currentUser.roles.includes('DIRECTOR') || currentUser.roles.includes('FINANCE_BUDGET') || currentUser.roles.includes('FINANCE_NONBUDGET')
        },
        {
            id: SystemView.ATTENDANCE,
            title: 'ลงเวลาทำงาน',
            slogan: 'เช็คเวลาแม่นยำ ด้วย GPS',
            icon: Clock,
            color: 'from-rose-500 to-pink-400',
            shadow: 'shadow-rose-200',
            visible: true
        },
        {
            id: SystemView.ADMIN_USERS,
            title: 'ผู้ดูแลระบบ',
            slogan: 'ตั้งค่าระบบ และผู้ใช้งาน',
            icon: Settings,
            color: 'from-slate-600 to-slate-400',
            shadow: 'shadow-slate-200',
            visible: currentUser.roles.includes('SYSTEM_ADMIN') || currentUser.roles.includes('DIRECTOR')
        }
    ];

    // --- DASHBOARD COMPONENT ---
    const DashboardCards = () => (
        <div className="p-4 md:p-8 animate-fade-in pb-24">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8 flex items-center gap-4">
                    {currentSchool?.logoBase64 ? (
                        <img src={currentSchool.logoBase64} alt="Logo" className="w-16 h-16 rounded-xl object-contain bg-white shadow-sm border" />
                    ) : (
                        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <Building2 size={32}/>
                        </div>
                    )}
                    <div>
                        <h2 className="text-3xl font-bold text-slate-800">สวัสดี, {currentUser.name}</h2>
                        <p className="text-slate-500">{currentUser.position} | {currentSchool?.name}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {modules.filter(m => m.visible).map((module) => {
                        const Icon = module.icon;
                        return (
                            <button
                                key={module.id}
                                onClick={() => setCurrentView(module.id)}
                                className={`group relative overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl bg-white border border-slate-100 shadow-lg ${module.shadow}`}
                            >
                                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${module.color} opacity-10 rounded-bl-full transition-transform group-hover:scale-110`}></div>
                                
                                <div className="flex flex-col h-full justify-between items-start relative z-10">
                                    <div className="flex justify-between w-full items-start">
                                        <div className={`p-4 rounded-2xl bg-gradient-to-br ${module.color} text-white shadow-md mb-6`}>
                                            <Icon size={32} />
                                        </div>
                                        {/* Notification Badge */}
                                        {module.badge && (
                                            <div className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse shadow-md border-2 border-white">
                                                {module.badge}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="text-left w-full">
                                        <h3 className="text-xl font-bold text-slate-800 mb-1 group-hover:text-blue-700 transition-colors">
                                            {module.title}
                                        </h3>
                                        <p className="text-slate-500 font-medium text-sm">
                                            {module.slogan}
                                        </p>
                                    </div>

                                    <div className="mt-4 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                                        <div className={`h-full bg-gradient-to-r ${module.color} w-0 group-hover:w-full transition-all duration-500 ease-out`}></div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-8 flex justify-end">
                     <div className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isConfigured ? <Database size={14}/> : <ServerOff size={14}/>}
                        {isConfigured ? 'System Online' : 'Offline Mode'}
                    </div>
                </div>
            </div>
        </div>
    );

    const getSystemTitle = () => {
        const activeModule = modules.find(m => m.id === currentView);
        return activeModule ? activeModule.title : 'หน้าหลัก';
    };

    const renderContent = () => {
        if (!currentSchool) return <div className="p-8 text-center text-slate-500">ไม่พบข้อมูลโรงเรียน</div>;
        switch (currentView) {
            case SystemView.PROFILE: return <UserProfile currentUser={currentUser} onUpdateUser={setCurrentUser} />;
            case SystemView.DOCUMENTS: 
                return <DocumentsSystem 
                    currentUser={currentUser} 
                    allTeachers={schoolTeachers} 
                    focusDocId={focusItem?.view === SystemView.DOCUMENTS ? focusItem.id : null}
                    onClearFocus={() => setFocusItem(null)}
                />;
            case SystemView.LEAVE: 
                return <LeaveSystem 
                    currentUser={currentUser} 
                    allTeachers={schoolTeachers} 
                    currentSchool={currentSchool} 
                    focusRequestId={focusItem?.view === SystemView.LEAVE ? focusItem.id : null}
                    onClearFocus={() => setFocusItem(null)}
                />;
            case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser} allTeachers={schoolTeachers} />; // Pass schoolTeachers as allTeachers
            case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool} />;
            case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser} />;
            case SystemView.ADMIN_USERS: return <AdminUserManagement teachers={schoolTeachers} currentSchool={currentSchool} onUpdateSchool={handleUpdateSchool} onAddTeacher={handleAddTeacher} onEditTeacher={handleEditTeacher} onDeleteTeacher={handleDeleteTeacher} />;
            default: return <DashboardCards />;
        }
    };

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 font-sarabun">
            
            {/* --- NOTIFICATION TOAST --- */}
            {notification && (
                <div 
                    onClick={handleNotificationClick}
                    className="fixed bottom-6 right-6 z-50 animate-slide-up print:hidden cursor-pointer"
                >
                    <div className={`border-l-4 shadow-2xl rounded-lg p-4 flex items-start gap-4 max-w-sm transition-transform hover:scale-105 bg-white ${
                        notification.type === 'alert' ? 'border-red-500 ring-1 ring-red-100' : 'border-blue-500 ring-1 ring-blue-100'
                    }`}>
                        <div className={`p-2.5 rounded-full shrink-0 ${
                            notification.type === 'alert' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                            <Bell size={24}/>
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-800 text-sm mb-1">{notification.type === 'alert' ? 'แจ้งเตือนด่วน' : 'แจ้งเตือนระบบ'}</h4>
                            <p className="text-sm text-slate-600 leading-snug break-words">{notification.message}</p>
                            {notification.linkTo && (
                                <p className="text-xs text-blue-600 mt-2 flex items-center gap-1 font-bold bg-blue-50 w-fit px-2 py-1 rounded hover:bg-blue-100 transition-colors">
                                    คลิกเพื่อเปิดดู <ExternalLink size={10}/>
                                </p>
                            )}
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); setNotification(null); }} 
                            className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full"
                        >
                            <X size={16}/>
                        </button>
                    </div>
                </div>
            )}

            {/* --- HEADER --- */}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 shadow-sm print:hidden">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-center md:justify-between relative">
                     {/* Left: Title & Back */}
                     <div className="absolute left-4 md:static flex items-center gap-2 md:gap-4">
                        {currentView !== SystemView.DASHBOARD && (
                            <button 
                                onClick={() => setCurrentView(SystemView.DASHBOARD)}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                            >
                                <ChevronLeft size={24} />
                            </button>
                        )}
                         <h1 className="text-lg md:text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent flex items-center gap-2">
                            {currentView === SystemView.DASHBOARD ? (
                                <><LayoutGrid className="text-slate-800 hidden md:block" size={24}/> Dashboard</>
                            ) : getSystemTitle()}
                        </h1>
                    </div>

                    {/* Right: User Profile & Logout */}
                    <div className="absolute right-4 md:static flex items-center gap-4">
                        <div className="hidden md:flex flex-col items-end mr-2">
                            <span className="text-sm font-bold text-slate-800">{currentUser.name}</span>
                            <span className="text-[10px] text-slate-500">{currentUser.position}</span>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md border-2 border-white cursor-pointer hover:scale-105 transition-transform">
                            {currentUser.name[0]}
                        </div>
                        <button onClick={handleLogout} className="text-slate-400 hover:text-red-500 transition-colors p-2">
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </header>

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 w-full">
                {currentView !== SystemView.DASHBOARD ? (
                    <div className="max-w-7xl mx-auto p-4 md:p-8 pb-24 animate-fade-in">
                         {renderContent()}
                    </div>
                ) : (
                    renderContent()
                )}
            </main>

            {/* --- STICKY FOOTER --- */}
            <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-3 px-6 z-30 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] print:hidden">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2 text-slate-600">
                        <Building2 size={18} className="text-blue-600"/>
                        <span className="font-bold text-sm md:text-base">{currentSchool?.name || 'SchoolOS System'}</span>
                    </div>
                    <div className="text-[10px] md:text-xs text-slate-400">
                        © 2024 SchoolOS
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default App;
