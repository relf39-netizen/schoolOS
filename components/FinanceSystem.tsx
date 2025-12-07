
import React, { useState, useEffect } from 'react';
import { Transaction, FinanceAccount, Teacher, FinanceAuditLog, SystemConfig } from '../types';
import { MOCK_TRANSACTIONS, MOCK_ACCOUNTS } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Plus, Wallet, FileText, ArrowRight, PlusCircle, LayoutGrid, List, ArrowLeft, Loader, Database, ServerOff, Edit2, Trash2, X, Save, ShieldAlert, Eye, Printer } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, where, orderBy, doc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';

// Thai Date Helper
const getThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const getThaiMonthYear = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
};

interface FinanceSystemProps {
    currentUser: Teacher;
}

const FinanceSystem: React.FC<FinanceSystemProps> = ({ currentUser }) => {
    // Permissions
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isBudgetOfficer = currentUser.roles.includes('FINANCE_BUDGET');
    const isNonBudgetOfficer = currentUser.roles.includes('FINANCE_NONBUDGET');

    // State
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [auditLogs, setAuditLogs] = useState<FinanceAuditLog[]>([]); // For Director
    const [isLoadingData, setIsLoadingData] = useState(true);
    
    // System Config for Reports
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);

    // Determine default active tab
    const [activeTab, setActiveTab] = useState<'Budget' | 'NonBudget'>(
        isBudgetOfficer ? 'Budget' : isNonBudgetOfficer ? 'NonBudget' : 'Budget'
    );
    
    // View State
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'DETAIL' | 'PRINT'>('DASHBOARD');

    // Drill-down State
    const [selectedAccount, setSelectedAccount] = useState<FinanceAccount | null>(null);

    // UI State
    const [showTransForm, setShowTransForm] = useState(false);
    const [showAccountForm, setShowAccountForm] = useState(false);
    
    // Edit Transaction State
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);

    // Audit Log View State (Director Only)
    const [showAuditModal, setShowAuditModal] = useState(false);

    // Form Data
    const [newTrans, setNewTrans] = useState({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'Income' });
    const [newAccount, setNewAccount] = useState({ name: '' });

    // --- Data Synchronization ---
    useEffect(() => {
        let unsubAccounts: () => void;
        let unsubTrans: () => void;
        let unsubLogs: () => void;
        let timeoutId: ReturnType<typeof setTimeout>;

        if (isConfigured && db) {
            // SAFETY TIMEOUT: Fallback if Firestore takes too long (3s)
            timeoutId = setTimeout(() => {
                if(isLoadingData) {
                    console.warn("Firestore Finance timeout. Switching to Mock Data.");
                    setAccounts(MOCK_ACCOUNTS);
                    setTransactions(MOCK_TRANSACTIONS);
                    setIsLoadingData(false);
                }
            }, 3000);

            // Sync Accounts
            const qAccounts = query(collection(db, "finance_accounts"), where("schoolId", "==", currentUser.schoolId));
            unsubAccounts = onSnapshot(qAccounts, (snapshot) => {
                const fetched: FinanceAccount[] = [];
                snapshot.forEach((doc) => {
                    fetched.push({ id: doc.id, ...doc.data() } as FinanceAccount);
                });
                setAccounts(fetched);
            });

            // Sync Transactions
            const qTransactions = query(collection(db, "finance_transactions"), where("schoolId", "==", currentUser.schoolId));
            unsubTrans = onSnapshot(qTransactions, (snapshot) => {
                clearTimeout(timeoutId);
                const fetched: Transaction[] = [];
                snapshot.forEach((doc) => {
                    fetched.push({ id: doc.id, ...doc.data() } as Transaction);
                });
                setTransactions(fetched);
                setIsLoadingData(false);
            }, (error) => {
                 clearTimeout(timeoutId);
                 console.error(error);
                 setAccounts(MOCK_ACCOUNTS);
                 setTransactions(MOCK_TRANSACTIONS);
                 setIsLoadingData(false);
            });

            // Sync Audit Logs (ONLY IF DIRECTOR)
            if (isDirector) {
                const qLogs = query(collection(db, "finance_audit_logs"), where("schoolId", "==", currentUser.schoolId), orderBy("timestamp", "desc"));
                unsubLogs = onSnapshot(qLogs, (snapshot) => {
                    const fetchedLogs: FinanceAuditLog[] = [];
                    snapshot.forEach((doc) => {
                        fetchedLogs.push({ id: doc.id, ...doc.data() } as FinanceAuditLog);
                    });
                    setAuditLogs(fetchedLogs);
                });
            }

            // Fetch Config
            const fetchConfig = async () => {
                try {
                    const docRef = doc(db, "system_config", "settings");
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setSysConfig(docSnap.data() as SystemConfig);
                    }
                } catch (e) {}
            };
            fetchConfig();

        } else {
            // Offline Mode
            setAccounts(MOCK_ACCOUNTS);
            setTransactions(MOCK_TRANSACTIONS);
            setIsLoadingData(false);
        }
        
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            if (unsubAccounts) unsubAccounts();
            if (unsubTrans) unsubTrans();
            if (unsubLogs) unsubLogs();
        };
    }, [currentUser.schoolId, isDirector]);

    // Update active tab logic based on permissions
    useEffect(() => {
        if (!isDirector) {
            if (activeTab === 'Budget' && !isBudgetOfficer && isNonBudgetOfficer) {
                setActiveTab('NonBudget');
            } else if (activeTab === 'NonBudget' && !isNonBudgetOfficer && isBudgetOfficer) {
                setActiveTab('Budget');
            }
        }
        
        // Auto-select "General Account" logic for NonBudget to bypass Account selection screen
        if (activeTab === 'NonBudget') {
            // We don't force select here, we handle it in rendering to show DetailView immediately
            setSelectedAccount(null); // Clear selected account so we can handle "All NonBudget" logic
            if (viewMode === 'DASHBOARD') setViewMode('DETAIL');
        } else {
             setSelectedAccount(null);
             if (viewMode === 'DETAIL') setViewMode('DASHBOARD');
        }

    }, [currentUser, isBudgetOfficer, isNonBudgetOfficer, isDirector, activeTab]);

    // --- Permissions Helpers ---
    // Strict visibility check: If teacher doesn't have role, don't show specific tabs
    const canSeeBudget = isDirector || isBudgetOfficer;
    const canSeeNonBudget = isDirector || isNonBudgetOfficer;
    
    // Officers can edit/delete in their respective tabs. Directors can view audits.
    const canEditBudget = isBudgetOfficer;
    const canEditNonBudget = isNonBudgetOfficer;

    // --- Logic ---

    const getAccountBalance = (accId: string) => {
        const accTrans = transactions.filter(t => t.accountId === accId);
        const income = accTrans.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
        const expense = accTrans.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
        return income - expense;
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const created: any = { // ID generated by firestore
            schoolId: currentUser.schoolId,
            name: newAccount.name,
            type: activeTab
        };

        if (isConfigured && db) {
            try {
                await addDoc(collection(db, "finance_accounts"), created);
            } catch(e) {
                console.error(e);
                alert("บันทึกข้อมูลไม่สำเร็จ");
            }
        } else {
            setAccounts([...accounts, { ...created, id: `acc_${Date.now()}` }]);
        }

        setNewAccount({ name: '' });
        setShowAccountForm(false);
    };

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        
        let targetAccountId = '';
        
        if (selectedAccount) {
            targetAccountId = selectedAccount.id;
        } else if (activeTab === 'NonBudget') {
            // Find existing NonBudget account or Create a default one
            const nbAcc = accounts.find(a => a.type === 'NonBudget');
            if (nbAcc) {
                targetAccountId = nbAcc.id;
            } else {
                // Auto-create a default account for NonBudget if none exists
                const defaultName = 'เงินรายได้สถานศึกษา (ทั่วไป)';
                const createdAcc: any = {
                    schoolId: currentUser.schoolId,
                    name: defaultName,
                    type: 'NonBudget'
                };
                
                if (isConfigured && db) {
                    try {
                        const docRef = await addDoc(collection(db, "finance_accounts"), createdAcc);
                        targetAccountId = docRef.id;
                    } catch(e) {
                         alert("ไม่สามารถสร้างบัญชีเริ่มต้นได้");
                         return;
                    }
                } else {
                     const newId = `acc_nb_${Date.now()}`;
                     setAccounts([...accounts, { ...createdAcc, id: newId }]);
                     targetAccountId = newId;
                }
            }
        }

        const created: any = {
            schoolId: currentUser.schoolId,
            accountId: targetAccountId,
            date: newTrans.date,
            description: newTrans.desc,
            amount: parseFloat(newTrans.amount),
            type: newTrans.type as 'Income' | 'Expense'
        };

        if (isConfigured && db) {
            try {
                await addDoc(collection(db, "finance_transactions"), created);
            } catch(e) {
                console.error(e);
                alert("บันทึกข้อมูลไม่สำเร็จ");
            }
        } else {
             setTransactions([{ ...created, id: `t_${Date.now()}` }, ...transactions]);
        }

        setNewTrans({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'Income' });
        setShowTransForm(false);
    };

    // --- EDIT & DELETE with AUDIT LOG ---

    const recordAuditLog = async (log: FinanceAuditLog) => {
        if (isConfigured && db) {
            try {
                // Remove 'id' if passing to addDoc, it generates one
                const { id, ...logData } = log; 
                await addDoc(collection(db, "finance_audit_logs"), logData);
            } catch(e) {
                console.error("Failed to record audit log", e);
            }
        } else {
            // Mock mode logs
            setAuditLogs([log, ...auditLogs]);
        }
    };

    const handleDeleteTransaction = async (t: Transaction) => {
        if (!confirm('ยืนยันการลบรายการนี้? \n(การกระทำนี้จะถูกบันทึกในระบบตรวจสอบ)')) return;

        // 1. Record Audit Log (Secretly)
        const log: FinanceAuditLog = {
            id: `log_${Date.now()}`,
            schoolId: currentUser.schoolId,
            timestamp: new Date().toISOString(),
            actorName: currentUser.name,
            actionType: 'DELETE',
            transactionDescription: t.description,
            amountInvolved: t.amount,
            details: `Deleted transaction: ${t.description} (${t.amount} THB) dated ${t.date}`
        };
        await recordAuditLog(log);

        // 2. Perform Delete
        if (isConfigured && db) {
            try {
                await deleteDoc(doc(db, "finance_transactions", t.id));
            } catch(e) {
                alert("เกิดข้อผิดพลาดในการลบข้อมูล");
            }
        } else {
            setTransactions(transactions.filter(tr => tr.id !== t.id));
        }
    };

    const handleEditClick = (t: Transaction) => {
        setEditingTransaction({ ...t });
        setShowEditModal(true);
    };

    const handleSaveEdit = async () => {
        if (!editingTransaction) return;

        // Find original for comparison
        const original = transactions.find(t => t.id === editingTransaction.id);
        if (!original) return;

        // Build Change Details
        const changes = [];
        if (original.amount !== editingTransaction.amount) changes.push(`Amount: ${original.amount} -> ${editingTransaction.amount}`);
        if (original.description !== editingTransaction.description) changes.push(`Desc: ${original.description} -> ${editingTransaction.description}`);
        if (original.date !== editingTransaction.date) changes.push(`Date: ${original.date} -> ${editingTransaction.date}`);
        if (original.type !== editingTransaction.type) changes.push(`Type: ${original.type} -> ${editingTransaction.type}`);
        
        if (changes.length === 0) {
            setShowEditModal(false);
            return;
        }

        // 1. Record Audit Log
        const log: FinanceAuditLog = {
            id: `log_${Date.now()}`,
            schoolId: currentUser.schoolId,
            timestamp: new Date().toISOString(),
            actorName: currentUser.name,
            actionType: 'EDIT',
            transactionDescription: original.description,
            amountInvolved: editingTransaction.amount,
            details: `Edited: ${changes.join(', ')}`
        };
        await recordAuditLog(log);

        // 2. Update Data
        if (isConfigured && db) {
             try {
                const docRef = doc(db, "finance_transactions", editingTransaction.id);
                const { id, ...data } = editingTransaction;
                await updateDoc(docRef, data);
            } catch(e) {
                alert("เกิดข้อผิดพลาดในการแก้ไขข้อมูล");
            }
        } else {
            setTransactions(transactions.map(t => t.id === editingTransaction.id ? editingTransaction : t));
        }

        setShowEditModal(false);
        setEditingTransaction(null);
    };


    // Filter Logic
    const getFilteredAccounts = () => accounts.filter(a => a.type === activeTab);
    
    const getCurrentTransactions = () => {
        if (selectedAccount) {
            return transactions.filter(t => t.accountId === selectedAccount.id);
        }
        if (activeTab === 'NonBudget') {
             // For NonBudget, show all transactions that belong to any NonBudget account
             const accIds = getFilteredAccounts().map(a => a.id);
             return transactions.filter(t => accIds.includes(t.accountId));
        }
        return []; 
    };

    const displayTransactions = getCurrentTransactions();
    
    const totalIncome = displayTransactions.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = displayTransactions.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
    const totalBalance = totalIncome - totalExpense;

    const COLORS = ['#10b981', '#ef4444'];
    const chartData = [
        { name: 'รายรับ', value: totalIncome },
        { name: 'รายจ่าย', value: totalExpense },
    ];

    if (isLoadingData) {
        return (
             <div className="flex items-center justify-center h-64 text-slate-400 flex-col gap-2">
                <Loader className="animate-spin" size={32}/>
                <p>กำลังเชื่อมต่อข้อมูลการเงิน...</p>
            </div>
        );
    }

    // --- Renderers ---

    const renderBudgetOverview = () => (
        <div className="space-y-6 animate-fade-in">
             {/* Toolbar */}
             <div className="flex justify-between items-center">
                <p className="text-slate-500 text-sm">เลือกบัญชีเพื่อดูรายละเอียดหรือบันทึกรายการ</p>
                {isBudgetOfficer && (
                    <button 
                        onClick={() => { setShowAccountForm(true); }}
                        className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 py-2 px-4 rounded-lg shadow-sm flex items-center gap-2 transition-colors"
                    >
                        <PlusCircle size={18}/> เพิ่มบัญชีงบประมาณ
                    </button>
                )}
            </div>

            {/* Account Form */}
            {showAccountForm && (
                <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 animate-slide-down">
                    <h3 className="font-bold text-slate-800 mb-4">เพิ่มบัญชีเงินงบประมาณใหม่</h3>
                    <form onSubmit={handleAddAccount} className="flex gap-4">
                        <input 
                            required 
                            type="text" 
                            placeholder="ชื่อบัญชี (เช่น เงินค่าอุปกรณ์การเรียน)" 
                            value={newAccount.name}
                            onChange={e => setNewAccount({name: e.target.value})}
                            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button type="submit" className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900">บันทึก</button>
                        <button type="button" onClick={() => setShowAccountForm(false)} className="text-slate-500 px-4">ยกเลิก</button>
                    </form>
                </div>
            )}

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {getFilteredAccounts().map(acc => {
                    const balance = getAccountBalance(acc.id);
                    return (
                        <div 
                            key={acc.id} 
                            onClick={() => { setSelectedAccount(acc); setViewMode('DETAIL'); }}
                            className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-blue-300 cursor-pointer transition-all relative overflow-hidden group"
                        >
                            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-50 rounded-bl-full -mr-10 -mt-10 transition-transform group-hover:scale-125"></div>
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <Wallet size={24}/>
                                </div>
                                <ArrowRight className="text-slate-300 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all"/>
                            </div>
                            <h3 className="font-bold text-slate-800 text-lg mb-1">{acc.name}</h3>
                            <p className="text-slate-500 text-xs mb-4">บัญชีเงินงบประมาณ</p>
                            <div className="text-3xl font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                                ฿{balance.toLocaleString()}
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                                <List size={14}/> คลิกเพื่อดูรายการเคลื่อนไหว
                            </div>
                        </div>
                    );
                })}
                {getFilteredAccounts().length === 0 && (
                     <div className="col-span-full text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                         ยังไม่มีบัญชีงบประมาณ
                     </div>
                )}
            </div>
        </div>
    );

    const renderDetailView = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Header & Back Button */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {/* Only show back button if we are in Budget mode where we selected an account */}
                    {activeTab === 'Budget' && (
                        <button 
                            onClick={() => { setSelectedAccount(null); setShowTransForm(false); setViewMode('DASHBOARD'); }}
                            className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                        >
                            <ArrowLeft size={24} />
                        </button>
                    )}
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">
                            {activeTab === 'Budget' ? selectedAccount?.name : 'เงินนอกงบประมาณ (รวม)'}
                        </h2>
                        <p className="text-slate-500">
                            {activeTab === 'Budget' ? 'รายการรับ-จ่ายภายในบัญชีนี้' : 'สามารถบันทึกรายรับรายจ่ายได้โดยไม่ต้องตั้งชื่อบัญชี'}
                        </p>
                    </div>
                </div>
                
                {/* Print Button (For Review) */}
                {(isDirector || isBudgetOfficer || isNonBudgetOfficer) && (
                    <button 
                        onClick={() => setViewMode('PRINT')}
                        className="bg-slate-800 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-slate-900 transition-colors flex items-center gap-2"
                    >
                        <Printer size={18} /> พิมพ์รายงานเสนอ ผอ.
                    </button>
                )}
            </div>

            {/* Summary Cards for this specific view */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-6 rounded-2xl text-white shadow-lg ${activeTab === 'Budget' ? 'bg-indigo-600' : 'bg-emerald-600'}`}>
                    <p className="text-white/80 text-sm mb-1">ยอดเงินคงเหลือสุทธิ</p>
                    <div className="flex items-center gap-2">
                        <DollarSign size={28} />
                        <span className="text-3xl font-bold">{totalBalance.toLocaleString()}</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-slate-500 text-sm">รับเข้า</p>
                        <div className="p-2 bg-green-100 rounded-full text-green-600">
                            <TrendingUp size={20} />
                        </div>
                    </div>
                    <span className="text-2xl font-bold text-green-600">+{totalIncome.toLocaleString()}</span>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-slate-500 text-sm">เบิกจ่าย</p>
                        <div className="p-2 bg-red-100 rounded-full text-red-600">
                            <TrendingDown size={20} />
                        </div>
                    </div>
                    <span className="text-2xl font-bold text-red-600">-{totalExpense.toLocaleString()}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Transaction List & Form */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Add Button - Checked by Role */}
                    {!showTransForm && (
                        (activeTab === 'Budget' && isBudgetOfficer) || (activeTab === 'NonBudget' && isNonBudgetOfficer)
                    ) && (
                        <button 
                            onClick={() => setShowTransForm(true)}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl shadow-sm flex items-center justify-center gap-2 font-bold transition-all"
                        >
                            <Plus size={20}/> บันทึกรับ/จ่าย รายการใหม่
                        </button>
                    )}

                    {/* Transaction Form */}
                    {showTransForm && (
                        <div className="bg-white p-6 rounded-xl shadow-md border border-blue-200 animate-slide-down relative">
                            <button onClick={() => setShowTransForm(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                                <ArrowLeft size={20}/> กลับ
                            </button>
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-lg">
                                <FileText size={20} className="text-blue-600"/> 
                                บันทึกรายการใหม่
                            </h3>
                            <form onSubmit={handleAddTransaction} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">วันที่</label>
                                        <input 
                                            required 
                                            type="date" 
                                            value={newTrans.date}
                                            onChange={e => setNewTrans({...newTrans, date: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-slate-600 mb-1">ประเภท</label>
                                        <div className="flex gap-2">
                                            <label className={`flex-1 border rounded-lg py-2 px-1 flex items-center justify-center gap-1 cursor-pointer transition-colors ${newTrans.type === 'Income' ? 'bg-green-50 border-green-500 text-green-700 font-bold shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}>
                                                <input type="radio" name="ttype" value="Income" checked={newTrans.type === 'Income'} onChange={() => setNewTrans({...newTrans, type: 'Income'})} className="hidden"/>
                                                รับ
                                            </label>
                                            <label className={`flex-1 border rounded-lg py-2 px-1 flex items-center justify-center gap-1 cursor-pointer transition-colors ${newTrans.type === 'Expense' ? 'bg-red-50 border-red-500 text-red-700 font-bold shadow-sm' : 'hover:bg-slate-50 text-slate-600'}`}>
                                                <input type="radio" name="ttype" value="Expense" checked={newTrans.type === 'Expense'} onChange={() => setNewTrans({...newTrans, type: 'Expense'})} className="hidden"/>
                                                จ่าย
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-600 mb-1">รายละเอียดรายการ</label>
                                    <input 
                                        required 
                                        type="text" 
                                        placeholder="ระบุรายละเอียด..." 
                                        value={newTrans.desc}
                                        onChange={e => setNewTrans({...newTrans, desc: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-600 mb-1">จำนวนเงิน (บาท)</label>
                                    <input 
                                        required 
                                        type="number" 
                                        placeholder="0.00" 
                                        value={newTrans.amount}
                                        onChange={e => setNewTrans({...newTrans, amount: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xl font-bold text-slate-800"
                                    />
                                </div>
                                <div className="pt-2">
                                    <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-lg shadow-blue-200">
                                        ยืนยันการบันทึก
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <List size={18}/> รายการเคลื่อนไหว
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-slate-500 bg-slate-50/50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 w-40">วันที่</th>
                                        <th className="px-4 py-3">รายละเอียด</th>
                                        <th className="px-4 py-3 text-right w-32">จำนวนเงิน</th>
                                        <th className="px-4 py-3 text-center w-20">สถานะ</th>
                                        {/* Action Column for Officers */}
                                        {((activeTab === 'Budget' && canEditBudget) || (activeTab === 'NonBudget' && canEditNonBudget)) && (
                                            <th className="px-4 py-3 text-center w-20">จัดการ</th>
                                        )}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {displayTransactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="text-center py-10 text-slate-400">ยังไม่มีรายการบันทึก</td>
                                        </tr>
                                    ) : (
                                        displayTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => (
                                            <tr key={t.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600">{getThaiDate(t.date)}</td>
                                                <td className="px-4 py-3 text-slate-800 font-medium">{t.description}</td>
                                                <td className={`px-4 py-3 text-right font-bold ${t.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {t.type === 'Income' ? '+' : '-'}{t.amount.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                     <span className={`text-[10px] px-2 py-1 rounded-full ${t.type === 'Income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {t.type === 'Income' ? 'รายรับ' : 'รายจ่าย'}
                                                     </span>
                                                </td>
                                                {/* Action Buttons: Only visible to authorized officer of that department */}
                                                {((activeTab === 'Budget' && canEditBudget) || (activeTab === 'NonBudget' && canEditNonBudget)) && (
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex justify-center gap-1">
                                                            <button 
                                                                onClick={() => handleEditClick(t)}
                                                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                                title="แก้ไข"
                                                            >
                                                                <Edit2 size={16}/>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteTransaction(t)}
                                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                title="ลบ"
                                                            >
                                                                <Trash2 size={16}/>
                                                            </button>
                                                        </div>
                                                    </td>
                                                )}
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right: Graph */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center">
                    <h3 className="text-slate-700 font-bold mb-4 w-full text-left">สัดส่วน รับ-จ่าย</h3>
                    {displayTransactions.length > 0 ? (
                        <div className="w-full h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip formatter={(value: number) => value.toLocaleString()} />
                                    <Legend verticalAlign="bottom"/>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                            ไม่มีข้อมูลแสดงกราฟ
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // --- RENDER PRINT VIEW (MEMO STYLE) ---
    const renderPrintView = () => (
        <div className="animate-fade-in pb-10">
            {/* Toolbar */}
            <div className="bg-white p-4 shadow-sm mb-6 print:hidden">
                <div className="max-w-4xl mx-auto flex justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('DETAIL')} className="p-2 hover:bg-slate-100 rounded-full text-slate-500">
                            <ArrowLeft size={20}/>
                        </button>
                        <h2 className="font-bold text-slate-800 text-lg">รายงานการเงิน (สำหรับพิมพ์เสนอ ผอ.)</h2>
                    </div>
                    <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 shadow-sm">
                        <Printer size={18} /> สั่งพิมพ์เอกสาร
                    </button>
                </div>
            </div>

            {/* A4 Paper */}
            <div className="bg-white shadow-lg p-10 mx-auto max-w-[800px] min-h-[1000px] font-sarabun text-black leading-relaxed print:shadow-none print:border-none print:p-0 print:w-full">
                {/* Header: Garuda & Memo */}
                <div className="flex flex-col items-center mb-6">
                     <img 
                        src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Emblem_of_the_Ministry_of_Education_of_Thailand.svg/1200px-Emblem_of_the_Ministry_of_Education_of_Thailand.svg.png" 
                        alt="Garuda" 
                        className="h-20 mb-2 grayscale opacity-90"
                    />
                    <h2 className="text-xl font-bold">บันทึกข้อความ</h2>
                </div>

                <div className="flex gap-2 mb-2">
                    <span className="font-bold w-20">ส่วนราชการ</span>
                    <span className="border-b border-dotted border-black flex-1">{sysConfig?.schoolName || 'โรงเรียน.......................................................'}</span>
                </div>
                <div className="flex gap-8 mb-2">
                     <div className="flex gap-2 flex-1">
                        <span className="font-bold w-10">ที่</span>
                        <span className="border-b border-dotted border-black flex-1">........................................</span>
                     </div>
                     <div className="flex gap-2 flex-1">
                        <span className="font-bold w-10">วันที่</span>
                        <span className="border-b border-dotted border-black flex-1">{getThaiDate(new Date().toISOString())}</span>
                     </div>
                </div>
                <div className="flex gap-2 mb-6">
                    <span className="font-bold w-20">เรื่อง</span>
                    <span className="border-b border-dotted border-black flex-1">
                        รายงานการรับ-จ่ายเงิน {activeTab === 'Budget' ? 'งบประมาณ' : 'นอกงบประมาณ'}
                        {selectedAccount ? ` (${selectedAccount.name})` : ''} ประจำเดือน {getThaiMonthYear(new Date().toISOString())}
                    </span>
                </div>

                <div className="mb-4">
                    <span className="font-bold mr-2">เรียน</span> ผู้อำนวยการโรงเรียน
                </div>

                <div className="indent-12 text-justify mb-4">
                    ตามที่ ข้าพเจ้า {currentUser.name} ตำแหน่ง {currentUser.position} ปฏิบัติหน้าที่เจ้าหน้าที่การเงิน ({activeTab === 'Budget' ? 'งบประมาณ' : 'นอกงบประมาณ'}) ได้ดำเนินการบันทึกรายการรับ-จ่ายเงิน
                    {selectedAccount ? ` ของบัญชี "${selectedAccount.name}"` : ` ประเภทเงิน${activeTab === 'Budget' ? 'งบประมาณ' : 'นอกงบประมาณ'}`}
                    นั้น บัดนี้ขอรายงานผลการดำเนินงาน ดังรายละเอียดต่อไปนี้
                </div>

                {/* Transaction Table */}
                <table className="w-full border-collapse border border-black mb-6 text-sm">
                    <thead>
                        <tr className="bg-slate-100">
                            <th className="border border-black p-2 text-center w-12">ที่</th>
                            <th className="border border-black p-2 text-center w-24">ว/ด/ป</th>
                            <th className="border border-black p-2 text-left">รายการ</th>
                            <th className="border border-black p-2 text-right w-24">รายรับ</th>
                            <th className="border border-black p-2 text-right w-24">รายจ่าย</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayTransactions.length === 0 ? (
                             <tr><td colSpan={5} className="border border-black p-4 text-center text-slate-400">ไม่มีรายการเคลื่อนไหว</td></tr>
                        ) : (
                            displayTransactions
                            .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Sort by Date ASC for Report
                            .map((t, index) => (
                                <tr key={t.id}>
                                    <td className="border border-black p-2 text-center">{index + 1}</td>
                                    <td className="border border-black p-2 text-center">{getThaiDate(t.date)}</td>
                                    <td className="border border-black p-2">{t.description}</td>
                                    <td className="border border-black p-2 text-right">
                                        {t.type === 'Income' ? t.amount.toLocaleString() : '-'}
                                    </td>
                                    <td className="border border-black p-2 text-right">
                                        {t.type === 'Expense' ? t.amount.toLocaleString() : '-'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    <tfoot>
                         <tr className="bg-slate-50 font-bold">
                            <td colSpan={3} className="border border-black p-2 text-right">รวมทั้งสิ้น</td>
                            <td className="border border-black p-2 text-right">{totalIncome.toLocaleString()}</td>
                            <td className="border border-black p-2 text-right">{totalExpense.toLocaleString()}</td>
                         </tr>
                         <tr>
                            <td colSpan={3} className="border border-black p-2 text-right font-bold">คงเหลือสุทธิ</td>
                            <td colSpan={2} className="border border-black p-2 text-center font-bold">
                                {totalBalance.toLocaleString()} บาท
                            </td>
                         </tr>
                    </tfoot>
                </table>

                <div className="indent-12 mb-8">
                    จึงเรียนมาเพื่อโปรดทราบและพิจารณา
                </div>

                {/* Signature Section 1: Officer */}
                <div className="flex justify-end mb-10">
                    <div className="text-center w-64">
                         <p className="mb-4">ขอแสดงความนับถือ</p>
                         
                         {/* Digital Signature of Officer */}
                         {currentUser.signatureBase64 ? (
                            <div className="flex flex-col items-center justify-center h-16 mb-2">
                                <img src={currentUser.signatureBase64} alt="Signature" className="h-full object-contain" />
                            </div>
                         ) : (
                             <p className="mt-8 mb-4">...........................................................</p>
                         )}

                         <p>({currentUser.name})</p>
                         <p>ตำแหน่ง {currentUser.position}</p>
                         <p>เจ้าหน้าที่การเงิน</p>
                    </div>
                </div>

                {/* Signature Section 2: Director Box */}
                <div className="border border-black p-4 rounded-sm flex flex-col items-center justify-center mx-auto w-3/4">
                    <p className="font-bold mb-4 underline">คำสั่ง / ข้อพิจารณา</p>
                    <div className="flex gap-8 mb-6 w-full px-10">
                        <div className="flex items-center gap-2">
                             <div className="w-4 h-4 border border-black"></div> ทราบ
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-4 h-4 border border-black"></div> อนุมัติ
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-4 h-4 border border-black"></div> ไม่อนุมัติ
                        </div>
                    </div>
                    
                    <p className="self-start px-10 mb-8">ข้อคิดเห็นเพิ่มเติม: ........................................................................................................................</p>
                    
                    <p className="mt-4">...........................................................</p>
                    <p className="mt-1">(...........................................................)</p>
                    <p className="mt-1">ตำแหน่ง ผู้อำนวยการโรงเรียน</p>
                    <p className="mt-1">วันที่.........../......................../................</p>
                </div>
            </div>
        </div>
    );

    // --- MAIN RENDER ---

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Top Bar (Hide in Print Mode) */}
            {viewMode !== 'PRINT' && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">ระบบบริหารการเงิน</h2>
                        <p className="text-slate-500">จัดการเงินงบประมาณและเงินนอกงบประมาณ</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        {/* SECRET BUTTON FOR DIRECTOR ONLY: AUDIT LOGS */}
                        {isDirector && (
                            <button 
                                onClick={() => setShowAuditModal(true)}
                                className="p-2 bg-slate-800 text-yellow-400 rounded-full shadow-lg hover:scale-110 transition-transform flex items-center gap-2 px-4"
                                title="ดูประวัติการแก้ไขข้อมูล (ลับ)"
                            >
                                <ShieldAlert size={18}/>
                                <span className="text-xs font-bold text-white">ประวัติการแก้ไข</span>
                            </button>
                        )}
                        <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {isConfigured ? <Database size={12}/> : <ServerOff size={12}/>}
                            {isConfigured ? 'ออนไลน์ (Firebase)' : 'ออฟไลน์ (Mock Data)'}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Tab Switcher (Hide in Print Mode) */}
            {viewMode !== 'PRINT' && (
                <div className="bg-white p-1 rounded-lg border border-slate-200 flex shadow-sm w-fit">
                    {(canSeeBudget) && (
                        <button 
                            onClick={() => { setActiveTab('Budget'); setSelectedAccount(null); setViewMode('DASHBOARD'); }}
                            className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'Budget' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <LayoutGrid size={16}/> เงินงบประมาณ
                        </button>
                    )}
                    {(canSeeNonBudget) && (
                        <button 
                            onClick={() => { setActiveTab('NonBudget'); }}
                            className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'NonBudget' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <List size={16}/> เงินนอกงบประมาณ
                        </button>
                    )}
                </div>
            )}

            {/* Main Content Switcher */}
            {viewMode === 'PRINT' ? renderPrintView() : (
                activeTab === 'Budget' && !selectedAccount ? renderBudgetOverview() : renderDetailView()
            )}

            {/* --- MODAL: EDIT TRANSACTION --- */}
            {showEditModal && editingTransaction && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 animate-slide-down">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <Edit2 size={20} className="text-orange-500"/> แก้ไขรายการ
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">วันที่</label>
                                <input 
                                    type="date" 
                                    value={editingTransaction.date}
                                    onChange={e => setEditingTransaction({...editingTransaction, date: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">รายละเอียด</label>
                                <input 
                                    type="text" 
                                    value={editingTransaction.description}
                                    onChange={e => setEditingTransaction({...editingTransaction, description: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-600 mb-1">จำนวนเงิน</label>
                                <input 
                                    type="number" 
                                    value={editingTransaction.amount}
                                    onChange={e => setEditingTransaction({...editingTransaction, amount: parseFloat(e.target.value)})}
                                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 font-bold"
                                />
                            </div>
                             <div>
                                <label className="block text-sm text-slate-600 mb-1">ประเภท</label>
                                <select 
                                    value={editingTransaction.type}
                                    onChange={e => setEditingTransaction({...editingTransaction, type: e.target.value as 'Income' | 'Expense'})}
                                    className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2"
                                >
                                    <option value="Income">รายรับ</option>
                                    <option value="Expense">รายจ่าย</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg">ยกเลิก</button>
                            <button onClick={handleSaveEdit} className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg">บันทึกการแก้ไข</button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: AUDIT LOGS (DIRECTOR ONLY) --- */}
            {showAuditModal && isDirector && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-[80vh] flex flex-col animate-slide-down">
                        <div className="p-4 border-b bg-slate-900 text-white rounded-t-xl flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <ShieldAlert size={20} className="text-yellow-400"/>
                                <h3 className="font-bold text-lg">บันทึกประวัติการแก้ไขข้อมูล (Audit Log)</h3>
                            </div>
                            <button onClick={() => setShowAuditModal(false)} className="text-slate-400 hover:text-white">
                                <X size={24}/>
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 bg-slate-50">
                            {auditLogs.length === 0 ? (
                                <div className="text-center py-20 text-slate-400">ยังไม่มีประวัติการแก้ไขข้อมูล</div>
                            ) : (
                                <div className="space-y-4">
                                    {auditLogs.map(log => (
                                        <div key={log.id} className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-slate-400">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${log.actionType === 'DELETE' ? 'bg-red-600' : 'bg-orange-500'}`}>
                                                        {log.actionType === 'DELETE' ? 'ลบข้อมูล' : 'แก้ไขข้อมูล'}
                                                    </span>
                                                    <span className="text-sm font-bold text-slate-700">{log.transactionDescription}</span>
                                                </div>
                                                <span className="text-xs text-slate-400">{new Date(log.timestamp).toLocaleString('th-TH')}</span>
                                            </div>
                                            <div className="text-sm text-slate-600 mb-1">
                                                โดย: <span className="font-bold">{log.actorName}</span>
                                            </div>
                                            <div className="text-xs bg-slate-100 p-2 rounded text-slate-500 font-mono">
                                                {log.details}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t bg-white text-xs text-slate-400 text-center">
                            * ข้อมูลนี้เห็นเฉพาะผู้อำนวยการเท่านั้น
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceSystem;
