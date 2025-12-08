
import React, { useState, useEffect } from 'react';
import { PlanDepartment, Project, Teacher, ProjectStatus } from '../types';
import { MOCK_PLAN_DATA } from '../constants';
import { Briefcase, CheckCircle, Clock, Lock, Plus, ArrowRight, ArrowLeft, Edit2, Trash2, Loader, Database, ServerOff } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc, setDoc, QuerySnapshot, DocumentData } from 'firebase/firestore';

interface ActionPlanSystemProps {
    currentUser: Teacher;
}

const ActionPlanSystem: React.FC<ActionPlanSystemProps> = ({ currentUser }) => {
    // State
    const [departments, setDepartments] = useState<PlanDepartment[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [totalSchoolBudget, setTotalSchoolBudget] = useState(1000000); // Default 1M
    const [selectedDept, setSelectedDept] = useState<PlanDepartment | null>(null);
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'DETAIL'>('OVERVIEW');

    // Permissions
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isPlanOfficer = currentUser.roles.includes('PLAN_OFFICER');

    // Edit States
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', budget: '' });

    // --- Data Synchronization ---
    useEffect(() => {
        let unsubscribe: () => void;
        let timeoutId: ReturnType<typeof setTimeout>;

        if (isConfigured && db) {
            // SAFETY TIMEOUT: Fallback if Firestore takes too long (3s)
            timeoutId = setTimeout(() => {
                if(isLoadingData) {
                    console.warn("Firestore Plan Data timeout. Switching to Mock Data.");
                    setDepartments(MOCK_PLAN_DATA);
                    setIsLoadingData(false);
                }
            }, 3000);

            // Subscribe to departments for this school
            const q = query(collection(db, "plan_departments"), where("schoolId", "==", currentUser.schoolId));
            unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
                clearTimeout(timeoutId);
                const fetched: PlanDepartment[] = [];
                snapshot.forEach((doc) => {
                    fetched.push({ id: doc.id, ...doc.data() } as PlanDepartment);
                });
                
                // Sort departments by name or creation? Let's sort by name for now
                fetched.sort((a, b) => a.name.localeCompare(b.name));
                
                setDepartments(fetched);
                setIsLoadingData(false);

                // If currently viewing a department, update it with live data
                if (selectedDept) {
                    const updated = fetched.find(d => d.id === selectedDept.id);
                    if (updated) setSelectedDept(updated);
                    else {
                        // Department was deleted
                        setSelectedDept(null);
                        setViewMode('OVERVIEW');
                    }
                }
            }, (error) => {
                clearTimeout(timeoutId);
                console.error("Fetch Plan Data Error:", error);
                setDepartments(MOCK_PLAN_DATA);
                setIsLoadingData(false);
            });
        } else {
            // Offline Mode
            setDepartments(MOCK_PLAN_DATA);
            setIsLoadingData(false);
        }
        
        return () => {
            if(timeoutId) clearTimeout(timeoutId);
            if(unsubscribe) unsubscribe();
        };
    }, [currentUser.schoolId, selectedDept?.id]); // Note: selectedDept dependency helps refresh detail view but careful not to loop. 
    // Actually, updating selectedDept inside snapshot callback handles the sync.

    // --- Logic ---

    const getTotalAllocated = () => departments.reduce((acc, d) => acc + d.allocatedBudget, 0);
    const getTotalUsed = () => {
        return departments.reduce((acc, d) => {
            const usedInDept = d.projects
                .filter(p => p.status === 'Completed')
                .reduce((sum, p) => sum + p.budget, 0);
            return acc + usedInDept;
        }, 0);
    };

    const getDeptStats = (dept: PlanDepartment) => {
        const planned = dept.projects.reduce((acc, p) => acc + p.budget, 0);
        const used = dept.projects.filter(p => p.status === 'Completed').reduce((acc, p) => acc + p.budget, 0);
        const remaining = dept.allocatedBudget - used;
        const remainingPlan = dept.allocatedBudget - planned; // Unplanned budget
        return { planned, used, remaining, remainingPlan };
    };

    // --- Actions ---

    const handleAddDepartment = async () => {
        const name = prompt('ชื่อกลุ่มงานใหม่:');
        if (!name) return;

        const newDept: any = { // omit ID for auto-gen
            schoolId: currentUser.schoolId,
            name,
            allocatedBudget: 0,
            projects: []
        };

        if (isConfigured && db) {
            try {
                await addDoc(collection(db, "plan_departments"), newDept);
            } catch (e) {
                console.error("Error adding dept:", e);
                alert("เกิดข้อผิดพลาดในการเพิ่มกลุ่มงาน");
            }
        } else {
            const mock = { ...newDept, id: `d_${Date.now()}` };
            setDepartments([...departments, mock]);
        }
    };

    const handleUpdateAllocated = async (deptId: string, newAmount: number) => {
        setIsEditingBudget(false);
        
        if (isConfigured && db) {
            try {
                const docRef = doc(db, "plan_departments", deptId);
                await updateDoc(docRef, { allocatedBudget: newAmount });
            } catch (e) {
                console.error(e);
            }
        } else {
            setDepartments(departments.map(d => d.id === deptId ? { ...d, allocatedBudget: newAmount } : d));
            if (selectedDept && selectedDept.id === deptId) {
                setSelectedDept({ ...selectedDept, allocatedBudget: newAmount });
            }
        }
    };

    const handleAddProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDept) return;
        
        const amount = parseFloat(newProject.budget);
        const stats = getDeptStats(selectedDept);
        
        // Validation: Warn if planning more than allocated
        if (stats.planned + amount > selectedDept.allocatedBudget) {
            if (!confirm('งบประมาณโครงการเกินวงเงินที่จัดสรรไว้ คุณต้องการดำเนินการต่อหรือไม่?')) return;
        }

        const project: Project = {
            id: `p_${Date.now()}`,
            name: newProject.name,
            budget: amount,
            status: 'Draft'
        };

        const updatedProjects = [...selectedDept.projects, project];

        if (isConfigured && db) {
            try {
                const docRef = doc(db, "plan_departments", selectedDept.id);
                await updateDoc(docRef, { projects: updatedProjects });
                setNewProject({ name: '', budget: '' });
            } catch (e) {
                console.error(e);
                alert("บันทึกข้อมูลไม่สำเร็จ");
            }
        } else {
            const updatedDepts = departments.map(d => {
                if (d.id === selectedDept.id) {
                    return { ...d, projects: updatedProjects };
                }
                return d;
            });
            setDepartments(updatedDepts);
            setSelectedDept(updatedDepts.find(d => d.id === selectedDept.id) || null);
            setNewProject({ name: '', budget: '' });
        }
    };

    const handleStatusChange = async (deptId: string, projectId: string, newStatus: ProjectStatus) => {
        // Find dept
        const dept = departments.find(d => d.id === deptId);
        if (!dept) return;

        const updatedProjects = dept.projects.map(p => p.id === projectId ? { ...p, status: newStatus } : p);

        if (isConfigured && db) {
            try {
                const docRef = doc(db, "plan_departments", deptId);
                await updateDoc(docRef, { projects: updatedProjects });
            } catch (e) {
                console.error(e);
            }
        } else {
            const updatedDepts = departments.map(d => {
                if (d.id === deptId) {
                    return { ...d, projects: updatedProjects };
                }
                return d;
            });
            setDepartments(updatedDepts);
            setSelectedDept(updatedDepts.find(d => d.id === deptId) || null);
        }
    };

    const handleDeleteProject = async (deptId: string, projectId: string) => {
        if(!confirm('ต้องการลบโครงการนี้ใช่หรือไม่?')) return;
        
        const dept = departments.find(d => d.id === deptId);
        if (!dept) return;

        const updatedProjects = dept.projects.filter(p => p.id !== projectId);

        if (isConfigured && db) {
             try {
                const docRef = doc(db, "plan_departments", deptId);
                await updateDoc(docRef, { projects: updatedProjects });
            } catch (e) {
                console.error(e);
            }
        } else {
            const updatedDepts = departments.map(d => {
                if (d.id === deptId) {
                    return { ...d, projects: updatedProjects };
                }
                return d;
            });
            setDepartments(updatedDepts);
            setSelectedDept(updatedDepts.find(d => d.id === deptId) || null);
        }
    }

    const handleUpdateProjectBudget = async (deptId: string, projectId: string, newAmount: number) => {
        const dept = departments.find(d => d.id === deptId);
        if (!dept) return;

        const updatedProjects = dept.projects.map(p => {
            if (p.id === projectId && p.status !== 'Completed') {
                return { ...p, budget: newAmount };
            }
            return p;
        });

        if (isConfigured && db) {
             try {
                const docRef = doc(db, "plan_departments", deptId);
                await updateDoc(docRef, { projects: updatedProjects });
            } catch (e) {
                console.error(e);
            }
        } else {
             const updatedDepts = departments.map(d => {
                if (d.id === deptId) {
                    return { ...d, projects: updatedProjects };
                }
                return d;
            });
            setDepartments(updatedDepts);
            setSelectedDept(updatedDepts.find(d => d.id === deptId) || null);
        }
    };

    if (isLoadingData) {
        return (
             <div className="flex items-center justify-center h-64 text-slate-400 flex-col gap-2">
                <Loader className="animate-spin" size={32}/>
                <p>กำลังเชื่อมต่อข้อมูลแผนงาน...</p>
            </div>
        );
    }

    // --- Renderers ---

    const getStatusBadge = (status: ProjectStatus) => {
        switch(status) {
            case 'Completed': return <span className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold"><CheckCircle size={12}/> เบิกจ่ายแล้ว</span>;
            case 'Approved': return <span className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold"><CheckCircle size={12}/> อนุมัติแล้ว</span>;
            default: return <span className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-xs font-bold"><Clock size={12}/> ร่างโครงการ</span>;
        }
    };

    // --- VIEW: OVERVIEW ---
    const renderOverview = () => {
        const totalAllocated = getTotalAllocated();
        const totalUsed = getTotalUsed();
        const unallocated = totalSchoolBudget - totalAllocated;

        return (
            <div className="space-y-8 animate-fade-in pb-10">
                {/* Header with Offline Indicator */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                         <h2 className="text-2xl font-bold text-slate-800">ระบบแผนปฏิบัติการ</h2>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isConfigured ? <Database size={12}/> : <ServerOff size={12}/>}
                        {isConfigured ? 'ออนไลน์ (Firebase)' : 'ออฟไลน์ (Mock Data)'}
                    </div>
                </div>

                {/* Top Stats */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
                        <div>
                            <h3 className="text-xl font-bold text-slate-800">งบประมาณประจำปี {new Date().getFullYear() + 543}</h3>
                            <p className="text-slate-500 text-sm">บริหารจัดการแผนงานและงบประมาณรายจ่าย</p>
                        </div>
                        {isPlanOfficer && (
                             <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                <span className="text-sm text-slate-600">งบประมาณรวมทั้งโรงเรียน:</span>
                                <input 
                                    type="number" 
                                    value={totalSchoolBudget} 
                                    onChange={(e) => setTotalSchoolBudget(parseFloat(e.target.value))}
                                    className="w-32 bg-white border border-slate-300 rounded px-2 py-1 text-right font-bold text-slate-800"
                                />
                                <span className="text-sm text-slate-600">บาท</span>
                             </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                            <div className="text-indigo-600 text-sm font-bold mb-1">จัดสรรแล้ว</div>
                            <div className="text-2xl font-bold text-indigo-900">฿{totalAllocated.toLocaleString()}</div>
                            <div className="text-xs text-indigo-400 mt-1">จาก {totalSchoolBudget.toLocaleString()}</div>
                            <div className="w-full bg-indigo-200 h-1.5 rounded-full mt-2">
                                <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${Math.min((totalAllocated/totalSchoolBudget)*100, 100)}%` }}></div>
                            </div>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="text-emerald-600 text-sm font-bold mb-1">ใช้จ่ายจริง (เบิกแล้ว)</div>
                            <div className="text-2xl font-bold text-emerald-900">฿{totalUsed.toLocaleString()}</div>
                            <div className="text-xs text-emerald-400 mt-1">คิดเป็น {((totalUsed/totalSchoolBudget)*100).toFixed(1)}% ของงบรวม</div>
                        </div>
                        <div className={`p-4 rounded-xl border ${unallocated < 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                            <div className={`text-sm font-bold mb-1 ${unallocated < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                                {unallocated < 0 ? 'จัดสรรเกินงบประมาณ' : 'งบกลางคงเหลือ (รอจัดสรร)'}
                            </div>
                            <div className={`text-2xl font-bold ${unallocated < 0 ? 'text-red-900' : 'text-slate-900'}`}>
                                ฿{Math.abs(unallocated).toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Departments Grid */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-700">กลุ่มงาน / ฝ่าย</h3>
                        {isPlanOfficer && (
                            <button onClick={handleAddDepartment} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 flex items-center gap-1 shadow-sm">
                                <Plus size={16}/> เพิ่มกลุ่มงาน
                            </button>
                        )}
                    </div>
                    
                    {departments.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
                            ยังไม่มีข้อมูลกลุ่มงาน กรุณาเพิ่มกลุ่มงาน
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {departments.map(dept => {
                                const stats = getDeptStats(dept);
                                const percentUsed = dept.allocatedBudget > 0 ? (stats.used / dept.allocatedBudget) * 100 : 0;
                                
                                return (
                                    <div 
                                        key={dept.id} 
                                        onClick={() => { setSelectedDept(dept); setViewMode('DETAIL'); }}
                                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 cursor-pointer hover:shadow-md hover:border-blue-400 transition-all group relative overflow-hidden"
                                    >
                                        <div className="flex justify-between items-start mb-4 relative z-10">
                                            <div className="p-3 bg-slate-100 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                                <Briefcase size={24}/>
                                            </div>
                                            <ArrowRight className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all"/>
                                        </div>
                                        
                                        <h4 className="font-bold text-lg text-slate-800 mb-2">{dept.name}</h4>
                                        
                                        <div className="space-y-3">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">ได้รับจัดสรร</span>
                                                <span className="font-bold text-slate-800">฿{dept.allocatedBudget.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">ใช้ไปแล้ว</span>
                                                <span className="font-bold text-emerald-600">฿{stats.used.toLocaleString()}</span>
                                            </div>
                                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                                <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${percentUsed}%` }}></div>
                                            </div>
                                            <div className="text-xs text-right text-slate-400">
                                                คงเหลือ ฿{stats.remaining.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- VIEW: DETAIL ---
    const renderDetail = () => {
        if (!selectedDept) return null;
        const stats = getDeptStats(selectedDept);

        return (
            <div className="space-y-6 animate-slide-up pb-10">
                {/* Header */}
                <div className="flex items-center gap-4 mb-2">
                    <button onClick={() => setViewMode('OVERVIEW')} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                        <ArrowLeft size={24}/>
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">{selectedDept.name}</h2>
                        <p className="text-slate-500">บริหารจัดการงบประมาณและโครงการ</p>
                    </div>
                </div>

                {/* Summary Card for Dept */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-8 items-center">
                    <div className="flex-1 w-full space-y-4">
                        <div className="flex justify-between items-center border-b pb-2">
                            <span className="text-slate-500 font-medium">งบประมาณที่ได้รับจัดสรร</span>
                            <div className="flex items-center gap-2">
                                {isEditingBudget && isPlanOfficer ? (
                                    <div className="flex items-center gap-2">
                                        <input 
                                            autoFocus
                                            type="number" 
                                            defaultValue={selectedDept.allocatedBudget}
                                            onBlur={(e) => handleUpdateAllocated(selectedDept.id, parseFloat(e.target.value))}
                                            onKeyDown={(e) => { if(e.key === 'Enter') handleUpdateAllocated(selectedDept.id, parseFloat(e.currentTarget.value)) }}
                                            className="w-32 border border-blue-400 rounded px-2 py-1 text-right font-bold"
                                        />
                                        <span className="text-xs text-slate-400">กด Enter</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-2xl font-bold text-slate-800">฿{selectedDept.allocatedBudget.toLocaleString()}</span>
                                        {isPlanOfficer && (
                                            <button onClick={() => setIsEditingBudget(true)} className="text-slate-400 hover:text-blue-600"><Edit2 size={16}/></button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="text-xs text-slate-500">วางแผนแล้ว (Projects)</div>
                                <div className="font-bold text-blue-600">฿{stats.planned.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500">ใช้จ่ายจริง (Completed)</div>
                                <div className="font-bold text-emerald-600">฿{stats.used.toLocaleString()}</div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Status Circle */}
                    <div className="w-32 h-32 relative flex items-center justify-center">
                         <div className="absolute inset-0 border-4 border-slate-100 rounded-full"></div>
                         <div className="absolute inset-0 border-4 border-emerald-500 rounded-full" style={{ clipPath: `polygon(0 0, 100% 0, 100% ${100 - (selectedDept.allocatedBudget > 0 ? (stats.remaining/selectedDept.allocatedBudget)*100 : 0)}%, 0 100%)` }}></div> 
                         <div className="text-center">
                             <div className="text-xs text-slate-500">คงเหลือ</div>
                             <div className={`font-bold ${stats.remaining < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                                 {selectedDept.allocatedBudget > 0 ? ((stats.remaining / selectedDept.allocatedBudget)*100).toFixed(0) : 0}%
                             </div>
                         </div>
                    </div>
                </div>

                {/* Projects Section */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">รายการโครงการ</h3>
                        {/* Summary of Plan Balance */}
                        <div className="text-sm text-slate-500">
                            แผนคงเหลือ: <span className={stats.remainingPlan < 0 ? 'text-red-600 font-bold' : 'text-slate-700'}>฿{stats.remainingPlan.toLocaleString()}</span>
                        </div>
                    </div>
                    
                    {/* Add Project Form (Plan Officer Only) */}
                    {isPlanOfficer && (
                        <div className="p-4 border-b border-slate-100 bg-blue-50/50">
                            <form onSubmit={handleAddProject} className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="text-xs text-slate-500 mb-1 block">ชื่อโครงการ</label>
                                    <input 
                                        required 
                                        type="text" 
                                        placeholder="ระบุชื่อโครงการ..." 
                                        value={newProject.name}
                                        onChange={e => setNewProject({...newProject, name: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="w-40">
                                    <label className="text-xs text-slate-500 mb-1 block">งบประมาณ (บาท)</label>
                                    <input 
                                        required 
                                        type="number" 
                                        placeholder="0.00" 
                                        value={newProject.budget}
                                        onChange={e => setNewProject({...newProject, budget: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-right"
                                    />
                                </div>
                                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-bold shadow-sm">
                                    เพิ่ม
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">ชื่อโครงการ</th>
                                    <th className="px-4 py-3 text-right">งบประมาณ</th>
                                    <th className="px-4 py-3 text-center">สถานะ</th>
                                    <th className="px-4 py-3 text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {selectedDept.projects.length === 0 ? (
                                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">ยังไม่มีโครงการ</td></tr>
                                ) : (
                                    selectedDept.projects.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-700">{p.name}</td>
                                            <td className="px-4 py-3 text-right font-mono">
                                                {/* Allow editing budget if NOT completed and is PLAN OFFICER OR if DIRECTOR and status is Draft */}
                                                {(isPlanOfficer && p.status !== 'Completed') || (isDirector && p.status === 'Draft') ? (
                                                     <div className="flex items-center justify-end gap-1 group/edit">
                                                         {isDirector && <Edit2 size={12} className="text-slate-300 group-hover/edit:text-blue-500"/>}
                                                         <input 
                                                            type="number" 
                                                            defaultValue={p.budget}
                                                            onBlur={(e) => handleUpdateProjectBudget(selectedDept.id, p.id, parseFloat(e.target.value))}
                                                            className="w-24 text-right border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent"
                                                         />
                                                     </div>
                                                ) : (
                                                    <span className={p.status === 'Completed' ? 'text-slate-500' : 'text-slate-800'}>
                                                        {p.budget.toLocaleString()}
                                                    </span>
                                                )}
                                                {p.status === 'Completed' && <Lock size={12} className="inline ml-1 text-slate-400"/>}
                                            </td>
                                            <td className="px-4 py-3 text-center">{getStatusBadge(p.status)}</td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {/* Director Actions */}
                                                    {isDirector && p.status === 'Draft' && (
                                                        <button 
                                                            onClick={() => handleStatusChange(selectedDept.id, p.id, 'Approved')}
                                                            className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700"
                                                        >
                                                            อนุมัติ
                                                        </button>
                                                    )}
                                                    
                                                    {/* Plan Officer Actions */}
                                                    {isPlanOfficer && (
                                                        <>
                                                            {p.status === 'Approved' && (
                                                                <button 
                                                                    onClick={() => handleStatusChange(selectedDept.id, p.id, 'Completed')}
                                                                    className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                                                                >
                                                                    เบิกจ่ายเสร็จสิ้น
                                                                </button>
                                                            )}
                                                            {p.status !== 'Completed' && (
                                                                <button 
                                                                    onClick={() => handleDeleteProject(selectedDept.id, p.id)}
                                                                    className="text-red-400 hover:text-red-600 p-1"
                                                                >
                                                                    <Trash2 size={16}/>
                                                                </button>
                                                            )}
                                                        </>
                                                    )}

                                                    {!isDirector && !isPlanOfficer && <span className="text-slate-300">-</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto">
            {viewMode === 'OVERVIEW' ? renderOverview() : renderDetail()}
        </div>
    );
};

export default ActionPlanSystem;
