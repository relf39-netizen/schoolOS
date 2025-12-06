

import React, { useState, useEffect } from 'react';
import { Transaction, FinanceAccount, Teacher } from '../types';
import { MOCK_TRANSACTIONS, MOCK_ACCOUNTS } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Plus, Wallet, FileText, ArrowRight, PlusCircle, LayoutGrid, List, ArrowLeft, Loader, Database, ServerOff } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, where, orderBy } from 'firebase/firestore';

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
    const [isLoadingData, setIsLoadingData] = useState(true);
    
    // Determine default active tab
    const [activeTab, setActiveTab] = useState<'Budget' | 'NonBudget'>(
        isBudgetOfficer ? 'Budget' : isNonBudgetOfficer ? 'NonBudget' : 'Budget'
    );
    
    // Drill-down State
    const [selectedAccount, setSelectedAccount] = useState<FinanceAccount | null>(null);

    // UI State
    const [showTransForm, setShowTransForm] = useState(false);
    const [showAccountForm, setShowAccountForm] = useState(false);

    // Form Data
    const [newTrans, setNewTrans] = useState({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'Income' });
    const [newAccount, setNewAccount] = useState({ name: '' });

    // --- Data Synchronization ---
    useEffect(() => {
        let unsubAccounts: () => void;
        let unsubTrans: () => void;
        let timeoutId: NodeJS.Timeout;

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
                // Keep waiting for transactions to load fully
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
                 // Fallback on error
                 setAccounts(MOCK_ACCOUNTS);
                 setTransactions(MOCK_TRANSACTIONS);
                 setIsLoadingData(false);
            });
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
        };
    }, [currentUser.schoolId]);

    // Update active tab if user switches role and loses access to current tab
    useEffect(() => {
        if (!isDirector) {
            if (activeTab === 'Budget' && !isBudgetOfficer && isNonBudgetOfficer) {
                setActiveTab('NonBudget');
            } else if (activeTab === 'NonBudget' && !isNonBudgetOfficer && isBudgetOfficer) {
                setActiveTab('Budget');
            }
        }
    }, [currentUser, isBudgetOfficer, isNonBudgetOfficer, isDirector, activeTab]);

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
            const nbAcc = accounts.find(a => a.type === 'NonBudget');
            if (nbAcc) targetAccountId = nbAcc.id;
            else {
                alert("ไม่พบบัญชีเงินนอกงบประมาณ กรุณาสร้างบัญชีก่อน");
                return; 
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

    // Filter Logic
    const getFilteredAccounts = () => accounts.filter(a => a.type === activeTab);
    
    const getCurrentTransactions = () => {
        if (selectedAccount) {
            return transactions.filter(t => t.accountId === selectedAccount.id);
        }
        if (activeTab === 'NonBudget') {
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
                            onClick={() => setSelectedAccount(acc)}
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
            </div>
        </div>
    );

    const renderDetailView = () => (
        <div className="space-y-6 animate-fade-in">
            {/* Header & Back Button */}
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => { setSelectedAccount(null); setShowTransForm(false); }}
                    className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                >
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">
                        {activeTab === 'Budget' ? selectedAccount?.name : 'เงินนอกงบประมาณ (รวม)'}
                    </h2>
                    <p className="text-slate-500">
                        {activeTab === 'Budget' ? 'รายการรับ-จ่ายภายในบัญชีนี้' : 'รายการรับ-จ่ายทั่วไป'}
                    </p>
                </div>
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
                                        <th className="px-4 py-3 w-32">วันที่</th>
                                        <th className="px-4 py-3">รายละเอียด</th>
                                        <th className="px-4 py-3 text-right w-32">จำนวนเงิน</th>
                                        <th className="px-4 py-3 text-center w-20">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {displayTransactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="text-center py-10 text-slate-400">ยังไม่มีรายการบันทึก</td>
                                        </tr>
                                    ) : (
                                        displayTransactions.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => (
                                            <tr key={t.id} className="hover:bg-slate-50">
                                                <td className="px-4 py-3 text-slate-600 font-mono">{t.date}</td>
                                                <td className="px-4 py-3 text-slate-800 font-medium">{t.description}</td>
                                                <td className={`px-4 py-3 text-right font-bold ${t.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                                                    {t.type === 'Income' ? '+' : '-'}{t.amount.toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                     <span className={`text-[10px] px-2 py-1 rounded-full ${t.type === 'Income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {t.type === 'Income' ? 'รายรับ' : 'รายจ่าย'}
                                                     </span>
                                                </td>
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

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">ระบบบริหารการเงิน</h2>
                    <p className="text-slate-500">จัดการเงินงบประมาณและเงินนอกงบประมาณ</p>
                </div>
                {/* Offline/Online Indicator */}
                <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${isConfigured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {isConfigured ? <Database size={12}/> : <ServerOff size={12}/>}
                    {isConfigured ? 'ออนไลน์ (Firebase)' : 'ออฟไลน์ (Mock Data)'}
                </div>
            </div>
            
            <div className="bg-white p-1 rounded-lg border border-slate-200 flex shadow-sm w-fit">
                {/* Only show buttons if user has role or is director */}
                {(isDirector || isBudgetOfficer) && (
                    <button 
                        onClick={() => { setActiveTab('Budget'); setSelectedAccount(null); }}
                        className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'Budget' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <LayoutGrid size={16}/> เงินงบประมาณ
                    </button>
                )}
                {(isDirector || isNonBudgetOfficer) && (
                    <button 
                        onClick={() => { setActiveTab('NonBudget'); setSelectedAccount(null); }}
                        className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'NonBudget' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <List size={16}/> เงินนอกงบประมาณ
                    </button>
                )}
            </div>

            {/* Main Content Switcher */}
            {activeTab === 'Budget' && !selectedAccount ? renderBudgetOverview() : renderDetailView()}
        </div>
    );
};

export default FinanceSystem;
