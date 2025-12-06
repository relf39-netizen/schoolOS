

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
import { Menu, Activity, Users, Clock, FileText, CalendarRange, Loader, Database, ServerOff } from 'lucide-react';
import { MOCK_DOCUMENTS, MOCK_LEAVE_REQUESTS, MOCK_TRANSACTIONS, MOCK_TEACHERS, MOCK_SCHOOLS } from './constants';
import { db, isConfigured } from './firebaseConfig';
import { collection, onSnapshot, setDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';

// Keys for LocalStorage
const SESSION_KEY = 'schoolos_session_v1';

const App: React.FC = () => {
    // Global Data State
    const [allTeachers, setAllTeachers] = useState<Teacher[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    
    // Auth State
    const [currentUser, setCurrentUser] = useState<Teacher | null>(null);
    const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // --- DATA SYNCHRONIZATION (FIREBASE) ---
    useEffect(() => {
        if (isConfigured && db) {
            // 1. Sync Schools
            const unsubSchools = onSnapshot(collection(db, 'schools'), (snapshot) => {
                const schoolsData = snapshot.docs.map(doc => doc.data() as School);
                // If DB is empty, might fallback or just show empty. 
                // For this demo, if empty we might want to keep Mocks, but let's prefer DB.
                if (schoolsData.length > 0) {
                    setAllSchools(schoolsData);
                } else {
                    // Initialize with Mocks if DB is completely empty (first run)
                    setAllSchools(MOCK_SCHOOLS);
                    // Optionally seed DB here
                }
            }, (err) => {
                console.error("School Sync Error:", err);
                setAllSchools(MOCK_SCHOOLS);
            });

            // 2. Sync Teachers
            const unsubTeachers = onSnapshot(collection(db, 'teachers'), (snapshot) => {
                const teachersData = snapshot.docs.map(doc => doc.data() as Teacher);
                if (teachersData.length > 0) {
                    setAllTeachers(teachersData);
                } else {
                    setAllTeachers(MOCK_TEACHERS);
                }
                setIsDataLoaded(true);
            }, (err) => {
                console.error("Teacher Sync Error:", err);
                setAllTeachers(MOCK_TEACHERS);
                setIsDataLoaded(true);
            });

            return () => {
                unsubSchools();
                unsubTeachers();
            };
        } else {
            // Offline Mode / Config Missing
            setAllSchools(MOCK_SCHOOLS);
            setAllTeachers(MOCK_TEACHERS);
            setIsDataLoaded(true);
        }
    }, []);


    // Check LocalStorage on Mount (Auto Login) - Runs after data is potentially loaded
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
                    if (user) {
                        setCurrentUser(user);
                    } else {
                        // User might have been deleted or data not synced yet
                        console.warn("Session found but user not in list (yet).");
                    }
                }
            } catch (e) {
                console.error("Session parse error", e);
                localStorage.removeItem(SESSION_KEY);
            }
        }
        setIsLoading(false);
    }, [isDataLoaded, allTeachers]); // Re-run when teachers list updates

    // UI State
    const [currentView, setCurrentView] = useState<SystemView>(SystemView.DASHBOARD);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // --- Auth Handlers ---

    const handleLogin = (user: Teacher) => {
        setCurrentUser(user);
        // Save Session
        localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, isSuperAdmin: false }));
    };

    const handleRegister = async (schoolId: string, id: string, name: string) => {
        const newUser: Teacher = {
            id,
            schoolId,
            name,
            password: '123456', // Default Password
            position: 'ครู',
            roles: ['TEACHER'],
            isFirstLogin: true // Force Setup
        };

        if (isConfigured && db) {
            try {
                await setDoc(doc(db, 'teachers', newUser.id), newUser);
                // No need to setAllTeachers here, the snapshot listener will pick it up
            } catch (e) {
                console.error("Register Error:", e);
                alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลลงฐานข้อมูล");
                return;
            }
        } else {
            // Offline fallback
            setAllTeachers([...allTeachers, newUser]);
        }
        
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

    const handleFirstLoginComplete = async (newPass: string, position: string) => {
        if (!currentUser) return;
        
        const updatedUser: Teacher = { 
            ...currentUser, 
            password: newPass, 
            position: position, 
            isFirstLogin: false,
            // If Director position chosen, add role automatically
            roles: position.includes('ผู้อำนวยการ') ? (['DIRECTOR', 'TEACHER'] as TeacherRole[]) : currentUser.roles
        };

        if (isConfigured && db) {
            try {
                await setDoc(doc(db, 'teachers', updatedUser.id), updatedUser);
            } catch (e) {
                console.error("Update User Error:", e);
                alert("บันทึกข้อมูลไม่สำเร็จ");
                return;
            }
        } else {
            const updatedList = allTeachers.map(t => t.id === currentUser.id ? updatedUser : t);
            setAllTeachers(updatedList);
        }

        setCurrentUser(updatedUser);
        alert('ตั้งค่าเรียบร้อยแล้ว ยินดีต้อนรับเข้าสู่ระบบ');
    };

    // --- School & User Management Handlers (CRUD) ---

    const handleCreateSchool = async (newSchool: School) => {
        if (isConfigured && db) {
            await setDoc(doc(db, 'schools', newSchool.id), newSchool);
        } else {
            setAllSchools([...allSchools, newSchool]);
        }
    };

    const handleUpdateSchool = async (updatedSchool: School) => {
        if (isConfigured && db) {
            await setDoc(doc(db, 'schools', updatedSchool.id), updatedSchool);
        } else {
            setAllSchools(allSchools.map(s => s.id === updatedSchool.id ? updatedSchool : s));
        }
    };

    const handleDeleteSchool = async (schoolId: string) => {
        if (isConfigured && db) {
            await deleteDoc(doc(db, 'schools', schoolId));
        } else {
            setAllSchools(allSchools.filter(s => s.id !== schoolId));
        }
    };

    // For SuperAdmin and SchoolAdmin usage
    const handleAddTeacher = async (newTeacher: Teacher) => {
        if (isConfigured && db) {
            await setDoc(doc(db, 'teachers', newTeacher.id), newTeacher);
        } else {
            setAllTeachers([...allTeachers, newTeacher]);
        }
    };

    const handleEditTeacher = async (updatedTeacher: Teacher) => {
        if (isConfigured && db) {
            await setDoc(doc(db, 'teachers', updatedTeacher.id), updatedTeacher);
        } else {
            setAllTeachers(allTeachers.map(t => t.id === updatedTeacher.id ? updatedTeacher : t));
        }
    };

    const handleDeleteTeacher = async (teacherId: string) => {
        if (isConfigured && db) {
            await deleteDoc(doc(db, 'teachers', teacherId));
        } else {
            setAllTeachers(allTeachers.filter(t => t.id !== teacherId));
        }
    };

    // --- Loading Screen ---
    if (isLoading || !isDataLoaded) {
        return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400 gap-2"><Loader className="animate-spin"/> กำลังเชื่อมต่อฐานข้อมูล...</div>;
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
            onUpdateTeacher={handleEditTeacher}
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
    
    // Find Current School Object
    const currentSchool = allSchools.find(s => s.id === currentUser.schoolId);
    
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
        
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    <div className="flex items-start gap-6">
                        {/* Display School Logo on Dashboard if available */}
                        {currentSchool?.logoBase64 && (
                            <div className="w-24 h-24 bg-white rounded-xl shadow-sm p-2 shrink-0 hidden md:block border border-slate-100">
                                <img src={currentSchool.logoBase64} alt="School Logo" className="w-full h-full object-contain" />
                            </div>
                        )}
                        <div>
                            <h2 className="text-3xl font-bold text-slate-800">ยินดีต้อนรับ, {currentUser.name}</h2>
                            <p className="text-slate-500 text-lg">{currentSchool?.name}</p>
                            <p className="text-slate-400 text-sm">รหัสโรงเรียน: {currentSchool?.id}</p>
                        </div>
                    </div>
                    {/* Connection Status Indicator */}
                    <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isConfigured ? <Database size={12}/> : <ServerOff size={12}/>}
                        {isConfigured ? 'Connected to Firebase' : 'Offline / Mock Data'}
                    </div>
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
        if (!currentSchool) return <div className="p-8 text-center text-slate-500">ไม่พบข้อมูลโรงเรียน (School ID: {currentUser.schoolId})</div>;

        // Pass only school teachers to components
        switch (currentView) {
            case SystemView.DOCUMENTS: return <DocumentsSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
            case SystemView.LEAVE: return <LeaveSystem currentUser={currentUser} allTeachers={schoolTeachers} />;
            case SystemView.FINANCE: return <FinanceSystem currentUser={currentUser} />;
            case SystemView.ATTENDANCE: return <AttendanceSystem currentUser={currentUser} allTeachers={schoolTeachers} currentSchool={currentSchool} />;
            case SystemView.PLAN: return <ActionPlanSystem currentUser={currentUser} />;
            case SystemView.ADMIN_USERS: return <AdminUserManagement 
                teachers={schoolTeachers} 
                currentSchool={currentSchool}
                onUpdateSchool={handleUpdateSchool}
                onAddTeacher={handleAddTeacher}
                onEditTeacher={handleEditTeacher}
                onDeleteTeacher={handleDeleteTeacher}
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
                schoolLogo={currentSchool?.logoBase64}
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
                             <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold overflow-hidden">
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
