
import React, { useState, useEffect } from 'react';
import { PlanDepartment, Project, Teacher, ProjectStatus } from '../types';
import { Briefcase, CheckCircle, Clock, Plus, ArrowLeft, Trash2, Loader, Wallet, BookOpen, Settings, X, Save, CalendarRange, ChevronDown, CheckSquare, Coins } from 'lucide-react';
import { supabase, isConfigured } from '../supabaseClient';

const ActionPlanSystem: React.FC<{ currentUser: Teacher }> = ({ currentUser }) => {
    const [departments, setDepartments] = useState<PlanDepartment[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [selectedDept, setSelectedDept] = useState<PlanDepartment | null>(null);
    const [viewMode, setViewMode] = useState<'OVERVIEW' | 'DETAIL'>('OVERVIEW');
    const [selectedFiscalYear, setSelectedFiscalYear] = useState<string>((new Date().getFullYear() + 543).toString());
    const [totalSubsidyBudget, setTotalSubsidyBudget] = useState(0); 
    const [totalLearnerDevBudget, setTotalLearnerDevBudget] = useState(0); 
    const [showBudgetModal, setShowBudgetModal] = useState(false);
    const [tempBudgetConfig, setTempBudgetConfig] = useState({ subsidy: 0, learner: 0 });
    const [isSaving, setIsSaving] = useState(false);
    const [showSettlementModal, setShowSettlementModal] = useState(false);
    const [settleProjectData, setSettleProjectData] = useState<{deptId: string, project: Project} | null>(null);
    const [actualAmountInput, setActualAmountInput] = useState('');
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectAmount, setNewProjectAmount] = useState('');
    const [budgetSource, setBudgetSource] = useState<'Subsidy' | 'LearnerDev'>('Subsidy');

    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isPlanOfficer = currentUser.roles.includes('PLAN_OFFICER');

    const STANDARD_DEPTS = ['กลุ่มบริหารงานวิชาการ', 'กลุ่มบริหารงานงบประมาณ', 'กลุ่มบริหารงานบุคคล', 'กลุ่มบริหารงานทั่วไป', 'งบกลาง / สาธารณูปโภค'];

    useEffect(() => {
        const loadData = async () => {
            setIsLoadingData(true);
            if (isConfigured && supabase) {
                const { data: projs } = await supabase.from('plan_projects').select('*').eq('school_id', currentUser.schoolId).eq('fiscal_year', selectedFiscalYear);
                const { data: budget } = await supabase.from('budget_settings').select('*').eq('id', `budget_${currentUser.schoolId}_${selectedFiscalYear}`).single();
                
                if (budget) { setTotalSubsidyBudget(budget.subsidy); setTotalLearnerDevBudget(budget.learner); }
                else { setTotalSubsidyBudget(0); setTotalLearnerDevBudget(0); }

                const depts = STANDARD_DEPTS.map(name => ({
                    id: `dept_${name}`, schoolId: currentUser.schoolId, name,
                    projects: projs ? projs.filter((p: any) => p.department_name === name).map(p => ({
                        id: p.id, name: p.name, subsidyBudget: p.subsidy_budget, learnerDevBudget: p.learner_dev_budget,
                        actualExpense: p.actual_expense, status: p.status, fiscalYear: p.fiscal_year
                    })) : []
                }));
                setDepartments(depts);
            }
            setIsLoadingData(false);
        };
        loadData();
    }, [currentUser.schoolId, selectedFiscalYear]);

    const stats = departments.flatMap(d => d.projects).reduce((acc, p) => {
        const amt = p.status === 'Completed' ? (p.actualExpense || 0) : (p.subsidyBudget + p.learnerDevBudget);
        if (p.subsidyBudget > 0) acc.usedSubsidy += amt;
        else acc.usedLearnerDev += amt;
        return acc;
    }, { usedSubsidy: 0, usedLearnerDev: 0 });

    const handleSaveBudgetConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        setIsSaving(true);
        const id = `budget_${currentUser.schoolId}_${selectedFiscalYear}`;
        const { error } = await supabase.from('budget_settings').upsert({ id, school_id: currentUser.schoolId, fiscal_year: selectedFiscalYear, subsidy: tempBudgetConfig.subsidy, learner: tempBudgetConfig.learner });
        if (!error) { setTotalSubsidyBudget(tempBudgetConfig.subsidy); setTotalLearnerDevBudget(tempBudgetConfig.learner); setShowBudgetModal(false); }
        setIsSaving(false);
    };

    const handleAddProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedDept || !supabase) return;
        const id = `p_${Date.now()}`;
        const amount = parseFloat(newProjectAmount);
        const data = { id, school_id: currentUser.schoolId, department_name: selectedDept.name, name: newProjectName, subsidy_budget: budgetSource === 'Subsidy' ? amount : 0, learner_dev_budget: budgetSource === 'LearnerDev' ? amount : 0, status: 'Draft', fiscal_year: selectedFiscalYear };
        const { error } = await supabase.from('plan_projects').insert([data]);
        if (!error) {
            const newP: Project = { id, name: newProjectName, subsidyBudget: data.subsidy_budget, learnerDevBudget: data.learner_dev_budget, status: 'Draft', fiscalYear: selectedFiscalYear };
            setDepartments(prev => prev.map(d => d.name === selectedDept.name ? { ...d, projects: [...d.projects, newP] } : d));
            setNewProjectName(''); setNewProjectAmount('');
        }
    };

    const handleStatusChange = async (deptId: string, projectId: string, newStatus: ProjectStatus) => {
        if (!supabase) return;
        const { error } = await supabase.from('plan_projects').update({ status: newStatus }).eq('id', projectId);
        if (!error) setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, projects: d.projects.map(p => p.id === projectId ? { ...p, status: newStatus } : p) } : d));
    };

    const handleSaveSettlement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settleProjectData || !supabase) return;
        const amt = parseFloat(actualAmountInput);
        const { error } = await supabase.from('plan_projects').update({ status: 'Completed', actual_expense: amt }).eq('id', settleProjectData.project.id);
        if (!error) {
            setDepartments(prev => prev.map(d => d.id === settleProjectData.deptId ? { ...d, projects: d.projects.map(p => p.id === settleProjectData.project.id ? { ...p, status: 'Completed', actualExpense: amt } : p) } : d));
            setShowSettlementModal(false);
        }
    };

    const getStatusBadge = (status: ProjectStatus) => {
        switch(status) {
            case 'Completed': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-[10px] font-bold">ปิดโครงการ</span>;
            case 'Approved': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-[10px] font-bold">อนุมัติแล้ว</span>;
            default: return <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full text-[10px] font-bold">ร่าง</span>;
        }
    };

    if (isLoadingData) return <div className="p-20 text-center flex flex-col items-center gap-3"><Loader className="animate-spin text-blue-600" size={32}/><p className="font-bold text-slate-500">กำลังเชื่อมต่อข้อมูล SQL...</p></div>;

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
            {viewMode === 'OVERVIEW' ? (
                <>
                    <div className="flex justify-between items-center">
                        <div><h2 className="text-2xl font-black text-slate-800 flex items-center gap-3"><CalendarRange className="text-blue-600"/> แผนปฏิบัติการประจำปี</h2><p className="text-slate-500">จัดการโครงการและงบประมาณสถานศึกษา (Cloud SQL)</p></div>
                        <div className="flex gap-3">
                            <select value={selectedFiscalYear} onChange={e => setSelectedFiscalYear(e.target.value)} className="px-4 py-2 border rounded-xl font-bold bg-white">{[2567, 2568, 2569].map(y => <option key={y} value={y}>ปี {y}</option>)}</select>
                            {isPlanOfficer && <button onClick={() => { setTempBudgetConfig({subsidy: totalSubsidyBudget, learner: totalLearnerDevBudget}); setShowBudgetModal(true); }} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"><Settings size={20}/></button>}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-3xl border border-orange-100 shadow-sm"><h3 className="font-bold text-orange-800 mb-1">งบเงินอุดหนุน (Subsidy)</h3><p className="text-3xl font-black text-orange-600">฿{(totalSubsidyBudget - stats.usedSubsidy).toLocaleString()}</p><div className="text-[10px] text-orange-400 font-bold uppercase mt-2">ใช้ไปแล้ว: {stats.usedSubsidy.toLocaleString()} / {totalSubsidyBudget.toLocaleString()}</div></div>
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-3xl border border-blue-100 shadow-sm"><h3 className="font-bold text-blue-800 mb-1">งบกิจกรรมพัฒนาผู้เรียน</h3><p className="text-3xl font-black text-blue-600">฿{(totalLearnerDevBudget - stats.usedLearnerDev).toLocaleString()}</p><div className="text-[10px] text-blue-400 font-bold uppercase mt-2">ใช้ไปแล้ว: {stats.usedLearnerDev.toLocaleString()} / {totalLearnerDevBudget.toLocaleString()}</div></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {departments.map(dept => (
                            <div key={dept.id} onClick={() => { setSelectedDept(dept); setViewMode('DETAIL'); }} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl cursor-pointer transition-all group">
                                <div className="p-3 bg-slate-50 w-fit rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all mb-4"><Briefcase size={24}/></div>
                                <h4 className="font-bold text-lg text-slate-800 mb-1">{dept.name}</h4>
                                <p className="text-xs text-slate-400 font-bold">{dept.projects.length} โครงการ</p>
                            </div>
                        ))}
                    </div>
                </>
            ) : selectedDept && (
                <div className="space-y-6 animate-slide-up">
                    <button onClick={() => setViewMode('OVERVIEW')} className="flex items-center gap-2 text-slate-500 font-bold"><ArrowLeft size={18}/> ย้อนกลับ</button>
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                        <h2 className="text-2xl font-black text-slate-800 mb-6">{selectedDept.name} ({selectedFiscalYear})</h2>
                        {isPlanOfficer && (
                            <form onSubmit={handleAddProject} className="flex gap-4 mb-8 p-6 bg-slate-50 rounded-2xl">
                                <input required placeholder="ชื่อโครงการ..." className="flex-1 px-4 py-2 border rounded-xl" value={newProjectName} onChange={e => setNewProjectName(e.target.value)}/>
                                <div className="flex bg-white rounded-xl p-1 border">
                                    <button type="button" onClick={() => setBudgetSource('Subsidy')} className={`px-3 py-1 rounded-lg text-xs font-bold ${budgetSource === 'Subsidy' ? 'bg-orange-600 text-white' : 'text-slate-500'}`}>อุดหนุน</button>
                                    <button type="button" onClick={() => setBudgetSource('LearnerDev')} className={`px-3 py-1 rounded-lg text-xs font-bold ${budgetSource === 'LearnerDev' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>กิจกรรม</button>
                                </div>
                                <input required type="number" placeholder="งบประมาณ" className="w-32 px-4 py-2 border rounded-xl font-bold" value={newProjectAmount} onChange={e => setNewProjectAmount(e.target.value)}/>
                                <button type="submit" className="bg-slate-800 text-white px-6 rounded-xl font-bold hover:bg-black transition-colors">เพิ่มโครงการ</button>
                            </form>
                        )}
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase"><tr><th className="p-4">โครงการ</th><th className="p-4 text-right">งบแผน</th><th className="p-4 text-center">ใช้จริง</th><th className="p-4 text-center">สถานะ</th><th className="p-4"></th></tr></thead>
                            <tbody className="divide-y">
                                {selectedDept.projects.map(p => (
                                    <tr key={p.id} className="hover:bg-slate-50">
                                        <td className="p-4 font-bold text-slate-700">{p.name}</td>
                                        <td className="p-4 text-right font-mono">{(p.subsidyBudget+p.learnerDevBudget).toLocaleString()}</td>
                                        <td className="p-4 text-center font-bold text-green-600">{p.actualExpense?.toLocaleString() || '-'}</td>
                                        <td className="p-4 text-center">{getStatusBadge(p.status)}</td>
                                        <td className="p-4 text-right">
                                            {isDirector && p.status === 'Draft' && <button onClick={() => handleStatusChange(selectedDept.id, p.id, 'Approved')} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-bold">อนุมัติ</button>}
                                            {isPlanOfficer && p.status === 'Approved' && <button onClick={() => { setSettleProjectData({deptId: selectedDept.id, project: p}); setActualAmountInput((p.subsidyBudget+p.learnerDevBudget).toString()); setShowSettlementModal(true); }} className="text-xs bg-green-600 text-white px-3 py-1 rounded-lg font-bold">สรุปจ่าย</button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {showBudgetModal && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8"><h3 className="text-xl font-black mb-6">ตั้งค่างบประมาณปี {selectedFiscalYear}</h3>
                <form onSubmit={handleSaveBudgetConfig} className="space-y-4">
                    <div><label className="block text-xs font-bold text-orange-600 mb-2">งบอุดหนุน (บาท)</label><input required type="number" className="w-full px-4 py-3 border-2 rounded-2xl font-black text-xl" value={tempBudgetConfig.subsidy} onChange={e => setTempBudgetConfig({...tempBudgetConfig, subsidy: parseFloat(e.target.value)})}/></div>
                    <div><label className="block text-xs font-bold text-blue-600 mb-2">งบกิจกรรม (บาท)</label><input required type="number" className="w-full px-4 py-3 border-2 rounded-2xl font-black text-xl" value={tempBudgetConfig.learner} onChange={e => setTempBudgetConfig({...tempBudgetConfig, learner: parseFloat(e.target.value)})}/></div>
                    <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowBudgetModal(false)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-bold">ยกเลิก</button><button type="submit" disabled={isSaving} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg">บันทึกตั้งค่า</button></div>
                </form></div></div>
            )}
            {showSettlementModal && settleProjectData && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center"><h3 className="text-xl font-black mb-2">สรุปยอดใช้จ่ายจริง</h3><p className="text-sm text-slate-500 mb-6">{settleProjectData.project.name}</p>
                <form onSubmit={handleSaveSettlement} className="space-y-4">
                    <input autoFocus required type="number" step="0.01" className="w-full px-4 py-4 border-2 border-green-200 rounded-2xl text-center text-3xl font-black text-green-700 outline-none" value={actualAmountInput} onChange={e => setActualAmountInput(e.target.value)}/>
                    <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowSettlementModal(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">ยกเลิก</button><button type="submit" className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg">ยืนยันและปิดโครงการ</button></div>
                </form></div></div>
            )}
        </div>
    );
};

export default ActionPlanSystem;
