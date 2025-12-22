
import React, { useState, useEffect, useRef } from 'react';
import { Transaction, FinanceAccount, Teacher, FinanceAuditLog, SystemConfig } from '../types';
import { MOCK_TRANSACTIONS, MOCK_ACCOUNTS } from '../constants';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Plus, Wallet, FileText, ArrowRight, PlusCircle, LayoutGrid, List, ArrowLeft, Loader, Database, ServerOff, Edit2, Trash2, X, Save, ShieldAlert, Eye, Printer, Upload, Calendar, Search, ChevronLeft, ChevronRight, HardDrive, Cloud, RefreshCw, AlertTriangle, HelpCircle, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { db, isConfigured } from '../firebaseConfig';
import { collection, query, where, getDocs, setDoc, updateDoc, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { sendTelegramMessage } from '../utils/telegram';

// Thai Date Helper
const getThaiDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
};

// Convert YYYY-MM to Thai Month Year
const formatMonthYearInput = (ym: string) => {
    if (!ym) return '';
    const [year, month] = ym.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

// Helper to parse dates from Excel (Handles Text DD/MM/YYYY, YYYY-MM-DD, and Excel Serial Numbers)
const parseExcelDate = (raw: any): string => {
    if (!raw) return new Date().toISOString().split('T')[0];

    // Case 1: Excel Serial Number (e.g., 45302)
    if (typeof raw === 'number') {
        const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
        return date.toISOString().split('T')[0];
    }

    // Case 2: String
    const str = String(raw).trim();

    // Try DD/MM/YYYY (Thai style e.g., 12/05/2567 or 12/05/2024)
    if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = str.split('/');
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        let y = parseInt(parts[2]);
        if (y > 2400) y -= 543;
        return `${y}-${m}-${d}`;
    }

    // Try YYYY-MM-DD
    if (str.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
        return str;
    }

    // Fallback: Try JS Date parse
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
    }

    // Final fallback: Today
    return new Date().toISOString().split('T')[0];
};

interface FinanceSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
}

const FinanceSystem: React.FC<FinanceSystemProps> = ({ currentUser, allTeachers }) => {
    // Permissions
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');
    const isBudgetOfficer = currentUser.roles.includes('FINANCE_BUDGET');
    const isNonBudgetOfficer = currentUser.roles.includes('FINANCE_NONBUDGET');

    // State
    const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    
    // Config State for Notifications
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 15;

    // Determine default active tab
    const [activeTab, setActiveTab] = useState<'Budget' | 'NonBudget'>(
        isBudgetOfficer ? 'Budget' : isNonBudgetOfficer ? 'NonBudget' : 'Budget'
    );
    
    // View State (Updated to include TRANS_FORM)
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'DETAIL' | 'PRINT' | 'TRANS_FORM'>('DASHBOARD');

    // Drill-down State
    const [selectedAccount, setSelectedAccount] = useState<FinanceAccount | null>(null);

    // Report Configuration State
    const [reportConfig, setReportConfig] = useState<{
        type: 'ALL' | 'MONTH' | 'CUSTOM';
        month: string;
        customStart: string;
        customEnd: string;
    }>({
        type: 'MONTH',
        month: new Date().toISOString().slice(0, 7), // Current Month YYYY-MM
        customStart: new Date().toISOString().split('T')[0],
        customEnd: new Date().toISOString().split('T')[0]
    });

    // UI State (showTransForm is replaced by viewMode === 'TRANS_FORM')
    const [showAccountForm, setShowAccountForm] = useState(false);
    
    // Edit Transaction State
    const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);

    // Edit Account Name State
    const [showEditAccountModal, setShowEditAccountModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
    const [newAccountName, setNewAccountName] = useState('');

    // Import State
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [showImportHelp, setShowImportHelp] = useState(false);

    // Form Data
    const [newTrans, setNewTrans] = useState({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'Income' });
    const [newAccount, setNewAccount] = useState({ name: '' });

    // --- HYBRID DATA LOADING ---
    useEffect(() => {
        const loadData = async () => {
            setIsLoadingData(true);
            
            let localAccounts: FinanceAccount[] = [];
            let localTrans: Transaction[] = [];
            try {
                const savedAcc = localStorage.getItem('schoolos_finance_accounts');
                const savedTx = localStorage.getItem('schoolos_finance_transactions');
                const localConfig = localStorage.getItem('schoolos_system_config');
                
                if (savedAcc) localAccounts = JSON.parse(savedAcc);
                if (savedTx) localTrans = JSON.parse(savedTx);
                if (localConfig) setSysConfig(JSON.parse(localConfig));
            } catch (e) {
                console.error("Local Load Error", e);
            }

            if (isConfigured && db) {
                try {
                    const accQ = query(collection(db, "finance_accounts"), where("schoolId", "==", currentUser.schoolId));
                    const accSnap = await getDocs(accQ);
                    const dbAccounts = accSnap.docs.map(doc => doc.data() as FinanceAccount);

                    const transQ = query(collection(db, "finance_transactions"), where("schoolId", "==", currentUser.schoolId));
                    const transSnap = await getDocs(transQ);
                    const dbTrans = transSnap.docs.map(doc => doc.data() as Transaction);

                    if (dbAccounts.length > 0 || dbTrans.length > 0) {
                        setAccounts(dbAccounts);
                        setTransactions(dbTrans);
                    } else {
                        if (localAccounts.length > 0) {
                             setAccounts(localAccounts);
                             setTransactions(localTrans);
                        } else {
                            const mockBudget = MOCK_ACCOUNTS.filter(a => a.schoolId === currentUser.schoolId || a.type === 'Budget');
                             setAccounts(mockBudget);
                             setTransactions(MOCK_TRANSACTIONS.filter(t => t.schoolId === currentUser.schoolId));
                        }
                    }

                    const configRef = doc(db, "system_config", "settings");
                    const configSnap = await getDoc(configRef);
                    if (configSnap.exists()) {
                        setSysConfig(configSnap.data() as SystemConfig);
                    }

                } catch (err) {
                    console.error("Firebase Finance Fetch Error:", err);
                    setAccounts(localAccounts.length ? localAccounts : MOCK_ACCOUNTS);
                    setTransactions(localTrans.length ? localTrans : MOCK_TRANSACTIONS);
                }
            } else {
                setAccounts(localAccounts.length ? localAccounts : MOCK_ACCOUNTS);
                setTransactions(localTrans.length ? localTrans : MOCK_TRANSACTIONS);
            }

            setIsLoadingData(false);
        };

        loadData();
    }, [currentUser.schoolId]);

    const handleSaveTransaction = async (transactionData: any) => {
        if (isConfigured && db) {
            try {
                await setDoc(doc(db, "finance_transactions", transactionData.id), transactionData);
                return true;
            } catch (e) {
                console.error("Error saving transaction to Firebase:", e);
                alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลออนไลน์");
                return false;
            }
        } else {
            const currentAllTrans = JSON.parse(localStorage.getItem('schoolos_finance_transactions') || '[]');
            const updatedAllTrans = [...currentAllTrans, transactionData];
            localStorage.setItem('schoolos_finance_transactions', JSON.stringify(updatedAllTrans));
            return true;
        }
    };

    const handleSaveAccount = async (accountData: any) => {
        if (isConfigured && db) {
            try {
                await setDoc(doc(db, "finance_accounts", accountData.id), accountData);
                return true;
            } catch (e) {
                console.error("Error saving account to Firebase:", e);
                alert("เกิดข้อผิดพลาดในการบันทึกบัญชีออนไลน์");
                return false;
            }
        } else {
            const currentAllAcc = JSON.parse(localStorage.getItem('schoolos_finance_accounts') || '[]');
            const updatedAllAcc = [...currentAllAcc, accountData];
            localStorage.setItem('schoolos_finance_accounts', JSON.stringify(updatedAllAcc));
            return true;
        }
    }

    const handleUpdateAccountName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAccount || !newAccountName) return;

        const updatedAccounts = accounts.map(a => a.id === editingAccount.id ? { ...a, name: newAccountName } : a);
        setAccounts(updatedAccounts);

        const updatedAccountObj = { ...editingAccount, name: newAccountName };

        if (isConfigured && db) {
            try {
                const accRef = doc(db, "finance_accounts", editingAccount.id);
                await setDoc(accRef, { name: newAccountName }, { merge: true });
            } catch (e) {
                console.error("Firebase Update Error", e);
                alert("การบันทึกออนไลน์มีปัญหาเล็กน้อย แต่ระบบได้บันทึกข้อมูลในเครื่องให้แล้ว");
            }
        } 
        
        try {
            const allLocal = JSON.parse(localStorage.getItem('schoolos_finance_accounts') || '[]');
            const existingIndex = allLocal.findIndex((a: any) => a.id === editingAccount.id);
            let updatedLocal;
            
            if (existingIndex >= 0) {
                updatedLocal = allLocal.map((a:any) => a.id === editingAccount.id ? updatedAccountObj : a);
            } else {
                updatedLocal = [...allLocal, updatedAccountObj];
            }
            localStorage.setItem('schoolos_finance_accounts', JSON.stringify(updatedLocal));
        } catch (err) {
            console.error("Local Storage Error", err);
        }

        setShowEditAccountModal(false);
        setEditingAccount(null);
    };

    const handleDeleteAccount = async (e: React.MouseEvent, accId: string) => {
        e.stopPropagation();
        if (!confirm("ยืนยันการลบบัญชีนี้?\n\n⚠️ คำเตือน: ประวัติธุรกรรมทั้งหมดในบัญชีนี้จะถูกลบออกจากหน้าจอ")) return;

        const updatedAccounts = accounts.filter(a => a.id !== accId);
        setAccounts(updatedAccounts);

        const updatedTrans = transactions.filter(t => t.accountId !== accId);
        setTransactions(updatedTrans);

        if (isConfigured && db) {
            try {
                await deleteDoc(doc(db, "finance_accounts", accId));
            } catch (e) { console.error(e); }
        } else {
            localStorage.setItem('schoolos_finance_accounts', JSON.stringify(updatedAccounts));
            localStorage.setItem('schoolos_finance_transactions', JSON.stringify(updatedTrans));
        }
    };

    useEffect(() => {
        if (!isDirector && !isSystemAdmin) {
            if (activeTab === 'Budget' && !isBudgetOfficer && isNonBudgetOfficer) {
                setActiveTab('NonBudget');
            } else if (activeTab === 'NonBudget' && !isNonBudgetOfficer && isBudgetOfficer) {
                setActiveTab('Budget');
            }
        }
        
        if (activeTab === 'NonBudget') {
            setSelectedAccount(null); 
            if (viewMode === 'DASHBOARD') setViewMode('DETAIL');
        } else {
             setSelectedAccount(null);
             if (viewMode === 'DETAIL') setViewMode('DASHBOARD');
        }

    }, [currentUser, isBudgetOfficer, isNonBudgetOfficer, isDirector, isSystemAdmin, activeTab]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedAccount, activeTab]);

    const canSeeBudget = isDirector || isSystemAdmin || isBudgetOfficer;
    const canSeeNonBudget = isDirector || isSystemAdmin || isNonBudgetOfficer;
    
    const canEditBudget = isBudgetOfficer || isDirector || isSystemAdmin;
    const canEditNonBudget = isNonBudgetOfficer || isDirector || isSystemAdmin;
    
    const canEdit = (activeTab === 'Budget' && canEditBudget) || (activeTab === 'NonBudget' && canEditNonBudget);

    const getAccountBalance = (accId: string) => {
        const accTrans = transactions.filter(t => t.accountId === accId);
        const income = accTrans.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
        const expense = accTrans.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
        return income - expense;
    };

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const created: any = { 
            id: `acc_${Date.now()}`,
            schoolId: currentUser.schoolId,
            name: newAccount.name,
            type: activeTab
        };

        const success = await handleSaveAccount(created);
        if (success) {
             setAccounts([...accounts, created]);
        }

        setNewAccount({ name: '' });
        setShowAccountForm(false);
    };

    const handleAddTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        
        let targetAccountId = '';
        let targetAccountName = '';

        if (selectedAccount) {
            targetAccountId = selectedAccount.id;
            targetAccountName = selectedAccount.name;
        } else if (activeTab === 'NonBudget') {
            const nbAcc = accounts.find(a => a.type === 'NonBudget');
            if (nbAcc) {
                targetAccountId = nbAcc.id;
                targetAccountName = nbAcc.name;
            } else {
                const defaultName = 'เงินรายได้สถานศึกษา (ทั่วไป)';
                const newId = `acc_nb_${Date.now()}`;
                const createdAcc: any = {
                    id: newId,
                    schoolId: currentUser.schoolId,
                    name: defaultName,
                    type: 'NonBudget'
                };
                await handleSaveAccount(createdAcc);
                setAccounts([...accounts, createdAcc]);
                targetAccountId = newId;
                targetAccountName = defaultName;
            }
        }

        const transactionAmount = parseFloat(newTrans.amount);
        const created: any = {
            id: `trans_${Date.now()}`,
            schoolId: currentUser.schoolId,
            accountId: targetAccountId,
            date: newTrans.date,
            description: newTrans.desc,
            amount: transactionAmount,
            type: newTrans.type
        };

        const success = await handleSaveTransaction(created);
        if (success) {
            setTransactions([...transactions, created]);
            alert("บันทึกรายการเรียบร้อยแล้ว");
            setNewTrans({ date: new Date().toISOString().split('T')[0], desc: '', amount: '', type: 'Income' });
            
            // Go back to Detail View instead of closing modal
            setViewMode('DETAIL');

            // --- TELEGRAM NOTIFICATION ---
            if (sysConfig?.telegramBotToken) {
                const currentTrans = transactions.filter(t => t.accountId === targetAccountId);
                const prevIncome = currentTrans.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
                const prevExpense = currentTrans.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
                const prevBalance = prevIncome - prevExpense;
                
                const newBalance = newTrans.type === 'Income' 
                    ? prevBalance + transactionAmount 
                    : prevBalance - transactionAmount;

                const recipients = allTeachers.filter(t => {
                    const isDir = t.roles.includes('DIRECTOR');
                    const isRelOfficer = activeTab === 'Budget' 
                        ? t.roles.includes('FINANCE_BUDGET') 
                        : t.roles.includes('FINANCE_NONBUDGET');
                    return t.schoolId === currentUser.schoolId && t.telegramChatId && (isDir || isRelOfficer);
                });

                const icon = newTrans.type === 'Income' ? '🟢' : '🔴';
                const typeLabel = newTrans.type === 'Income' ? 'รายรับ' : 'รายจ่าย';
                const message = `${icon} <b>แจ้งเตือนการเงิน (${activeTab === 'Budget' ? 'งบประมาณ' : 'นอกงบประมาณ'})</b>\n` +
                                `บัญชี: ${targetAccountName}\n` +
                                `--------------------------------\n` +
                                `รายการ: ${newTrans.desc}\n` +
                                `ประเภท: ${typeLabel}\n` +
                                `จำนวนเงิน: <b>${transactionAmount.toLocaleString()}</b> บาท\n` +
                                `--------------------------------\n` +
                                `💰 <b>ยอดคงเหลือสุทธิ: ${newBalance.toLocaleString()} บาท</b>\n` +
                                `(บันทึกโดย: ${currentUser.name})`;

                const baseUrl = sysConfig.appBaseUrl || window.location.origin;
                const deepLink = `${baseUrl}?view=FINANCE`;

                recipients.forEach(t => {
                    sendTelegramMessage(sysConfig.telegramBotToken!, t.telegramChatId!, message, deepLink);
                });
            }
        }
    };

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];

        setIsImporting(true);
        const reader = new FileReader();
        
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                
                const rawData = XLSX.utils.sheet_to_json(ws);
                const batchTransactions: any[] = [];
                const newAccounts: any[] = [];
                let successCount = 0;

                const accountMap = new Map<string, string>(); // Name -> ID
                accounts.forEach(a => accountMap.set(a.name.trim(), a.id));

                for (const row of rawData as any[]) {
                    const normalizedRow: any = {};
                    Object.keys(row).forEach(key => normalizedRow[key.trim()] = row[key]);

                    const dateRaw = normalizedRow['Date'] || normalizedRow['date'] || normalizedRow['วันที่'];
                    const accountNameRaw = normalizedRow['Account'] || normalizedRow['ชื่อบัญชี'] || normalizedRow['Account Name'];
                    const descRaw = normalizedRow['Description'] || normalizedRow['description'] || normalizedRow['รายการ'];
                    const amountRaw = normalizedRow['Amount'] || normalizedRow['amount'] || normalizedRow['จำนวนเงิน'];
                    const typeRaw = normalizedRow['Type'] || normalizedRow['type'] || normalizedRow['ประเภท'] || normalizedRow['ฝาก/ถอน'];

                    if (!descRaw || !amountRaw || !accountNameRaw) continue;

                    let amountValue = parseFloat(amountRaw.toString().replace(/,/g, ''));
                    if (isNaN(amountValue)) continue;

                    let finalType = 'Income';
                    const typeStr = typeRaw ? typeRaw.toString().toLowerCase() : '';
                    if (typeStr.includes('จ่าย') || typeStr.includes('ถอน') || typeStr.includes('expense') || typeStr.includes('withdraw') || typeStr.includes('out')) {
                        finalType = 'Expense';
                    }

                    const finalDate = parseExcelDate(dateRaw);
                    const cleanAccountName = accountNameRaw.toString().trim();

                    let targetAccountId = accountMap.get(cleanAccountName);

                    if (!targetAccountId) {
                        const newId = `acc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                        const newAcc = {
                            id: newId,
                            schoolId: currentUser.schoolId,
                            name: cleanAccountName,
                            type: activeTab
                        };
                        newAccounts.push(newAcc);
                        accountMap.set(cleanAccountName, newId);
                        targetAccountId = newId;
                    }

                    batchTransactions.push({
                        id: `imp_${Date.now()}_${successCount}`,
                        schoolId: currentUser.schoolId,
                        accountId: targetAccountId,
                        date: finalDate, 
                        description: descRaw.toString().trim(),
                        amount: amountValue,
                        type: finalType
                    });
                    successCount++;
                }

                if (batchTransactions.length > 0) {
                    if (newAccounts.length > 0) {
                        if (isConfigured && db) {
                            try {
                                const accPromises = newAccounts.map(a => setDoc(doc(db, "finance_accounts", a.id), a));
                                await Promise.all(accPromises);
                            } catch (e) { console.error("Account Batch Save Error", e); }
                        } else {
                            const currentAllAcc = JSON.parse(localStorage.getItem('schoolos_finance_accounts') || '[]');
                            localStorage.setItem('schoolos_finance_accounts', JSON.stringify([...currentAllAcc, ...newAccounts]));
                        }
                        setAccounts(prev => [...prev, ...newAccounts]);
                    }

                    if (isConfigured && db) {
                        try {
                            const transPromises = batchTransactions.map(t => setDoc(doc(db, "finance_transactions", t.id), t));
                            await Promise.all(transPromises);
                        } catch (err) {
                            console.error("Trans Batch Import Failed", err);
                            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลบางส่วนลงฐานข้อมูล");
                        }
                    } else {
                         const currentAllTrans = JSON.parse(localStorage.getItem('schoolos_finance_transactions') || '[]');
                         localStorage.setItem('schoolos_finance_transactions', JSON.stringify([...currentAllTrans, ...batchTransactions]));
                    }
                    
                    setTransactions(prev => [...prev, ...batchTransactions]);
                    alert(`นำเข้าข้อมูลสำเร็จ ${successCount} รายการ (สร้างบัญชีใหม่ ${newAccounts.length} บัญชี)`);
                } else {
                    alert("ไม่พบข้อมูลที่สามารถนำเข้าได้ กรุณาตรวจสอบไฟล์ Excel (ต้องมีคอลัมน์: วันที่, ชื่อบัญชี, รายการ, ฝาก/ถอน, จำนวนเงิน)");
                }

            } catch (error) {
                console.error("Import Error", error);
                alert("เกิดข้อผิดพลาดในการอ่านไฟล์");
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };
    
    const handleEditTransaction = (t: Transaction) => {
        if (!canEdit) return;
        setEditingTransaction(t);
        setShowEditModal(true);
    };

    const handleUpdateTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTransaction) return;

        const updatedTrans = transactions.map(t => t.id === editingTransaction.id ? editingTransaction : t);
        setTransactions(updatedTrans);

        if (isConfigured && db) {
             try {
                const transRef = doc(db, "finance_transactions", editingTransaction.id);
                await updateDoc(transRef, { ...editingTransaction });
             } catch (e) {
                 console.error("Update Trans Error", e);
             }
        } else {
            const currentAllTrans = JSON.parse(localStorage.getItem('schoolos_finance_transactions') || '[]');
            const updated = currentAllTrans.map((t:any) => t.id === editingTransaction.id ? editingTransaction : t);
            localStorage.setItem('schoolos_finance_transactions', JSON.stringify(updated));
        }

        setShowEditModal(false);
        setEditingTransaction(null);
    };

    const handleDeleteTransaction = async () => {
        if (!editingTransaction) return;
        if (!confirm("ยืนยันการลบรายการนี้?")) return;

         const updatedTrans = transactions.filter(t => t.id !== editingTransaction.id);
         setTransactions(updatedTrans);

        if (isConfigured && db) {
            try {
                await deleteDoc(doc(db, "finance_transactions", editingTransaction.id));
            } catch (e) {
                console.error("Delete Trans Error", e);
            }
        } else {
            const currentAllTrans = JSON.parse(localStorage.getItem('schoolos_finance_transactions') || '[]');
            const updated = currentAllTrans.filter((t:any) => t.id !== editingTransaction.id);
            localStorage.setItem('schoolos_finance_transactions', JSON.stringify(updated));
        }

         setShowEditModal(false);
         setEditingTransaction(null);
    };

    // --- Render Functions ---

    const renderDashboard = () => (
        <div className="animate-fade-in space-y-6 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="text-orange-500"/>
                        ระบบการเงินและงบประมาณ
                    </h2>
                    {canEdit && (
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            {isConfigured ? <Cloud size={12}/> : <HardDrive size={12}/>}
                            {isConfigured ? 'Online Mode' : 'Local Mode'}
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        {canSeeBudget && (
                            <button 
                                onClick={() => { setActiveTab('Budget'); setViewMode('DASHBOARD'); }}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'Budget' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <DollarSign size={16}/> เงินงบประมาณ
                            </button>
                        )}
                        {canSeeNonBudget && (
                            <button 
                                onClick={() => { setActiveTab('NonBudget'); setViewMode('DASHBOARD'); }}
                                className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'NonBudget' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Wallet size={16}/> เงินนอกงบประมาณ
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {canEdit && (
                <div className="flex justify-end gap-2">
                    <div className="relative flex items-center gap-1">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".xlsx, .xls"
                            onChange={handleImportExcel}
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isImporting}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-green-700 font-bold flex items-center gap-2 text-sm disabled:opacity-50"
                        >
                            {isImporting ? <Loader className="animate-spin" size={16}/> : <Upload size={16}/>}
                            <span>นำเข้าไฟล์ Excel</span>
                        </button>
                        <button 
                            onClick={() => setShowImportHelp(true)}
                            className="text-slate-400 hover:text-blue-600 p-2 hover:bg-white rounded-full transition-colors bg-slate-100"
                            title="ดูรูปแบบไฟล์ที่รองรับ"
                        >
                            <HelpCircle size={20} />
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'Budget' && canSeeBudget && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {accounts.filter(a => a.type === 'Budget').map((acc, index) => {
                            const balance = getAccountBalance(acc.id);
                            
                            const cardStyles = [
                                'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 hover:border-blue-300 shadow-blue-100',
                                'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 hover:border-emerald-300 shadow-emerald-100',
                                'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 hover:border-amber-300 shadow-amber-100',
                                'bg-gradient-to-br from-rose-50 to-pink-50 border-rose-200 hover:border-rose-300 shadow-rose-100',
                                'bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200 hover:border-purple-300 shadow-purple-100',
                                'bg-gradient-to-br from-cyan-50 to-sky-50 border-cyan-200 hover:border-cyan-300 shadow-cyan-100',
                            ];
                            const currentStyle = cardStyles[index % cardStyles.length];
                            
                            const iconStyles = [
                                'bg-blue-200 text-blue-700',
                                'bg-emerald-200 text-emerald-700',
                                'bg-amber-200 text-amber-700',
                                'bg-rose-200 text-rose-700',
                                'bg-purple-200 text-purple-700',
                                'bg-cyan-200 text-cyan-700',
                            ];
                            const currentIconStyle = iconStyles[index % iconStyles.length];

                            return (
                                <div 
                                    key={acc.id} 
                                    className={`relative rounded-2xl shadow-sm hover:shadow-lg border-2 p-6 transition-all cursor-pointer group hover:-translate-y-1 ${currentStyle}`}
                                    onClick={() => { setSelectedAccount(acc); setViewMode('DETAIL'); }}
                                >
                                    {canEditBudget && (
                                        <div className="absolute top-3 right-3 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded-lg p-1 shadow-sm backdrop-blur-sm">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); setNewAccountName(acc.name); setShowEditAccountModal(true); }}
                                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-white rounded-md transition-colors"
                                                title="แก้ไขชื่อบัญชี"
                                            >
                                                <Edit2 size={16}/>
                                            </button>
                                            <button 
                                                onClick={(e) => handleDeleteAccount(e, acc.id)}
                                                className="p-2 text-slate-500 hover:text-red-600 hover:bg-white rounded-md transition-colors"
                                                title="ลบบัญชี"
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start mb-6">
                                        <div className={`p-4 rounded-xl shadow-inner ${currentIconStyle}`}>
                                            <FileText size={28}/>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <h3 className="font-bold text-lg text-slate-800 leading-tight min-h-[3rem] line-clamp-2">
                                            {acc.name}
                                        </h3>
                                        <div className="flex justify-between items-end border-t border-slate-200/50 pt-3">
                                            <span className="text-xs text-slate-500 font-medium">ยอดคงเหลือ</span>
                                            <span className={`text-2xl font-bold tracking-tight ${balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                                                ฿{balance.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1">
                                        <ArrowRight className="text-slate-400"/>
                                    </div>
                                </div>
                            );
                        })}
                        
                        {canEditBudget && (
                            <button 
                                onClick={() => setShowAccountForm(true)}
                                className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-all gap-2 min-h-[220px]"
                            >
                                <div className="bg-slate-100 p-4 rounded-full group-hover:bg-orange-100 transition-colors">
                                    <PlusCircle size={32}/>
                                </div>
                                <span className="font-bold">เปิดบัญชีใหม่</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
            
            {!canSeeBudget && !canSeeNonBudget && (
                <div className="text-center py-20 text-slate-400">ท่านไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้</div>
            )}
        </div>
    );

    const renderDetail = () => {
        let targetAcc = selectedAccount;
        if (!targetAcc && activeTab === 'NonBudget') {
            targetAcc = accounts.find(a => a.type === 'NonBudget') || null;
        }

        if (!targetAcc && activeTab === 'NonBudget') {
            return (
                <div className="space-y-6 animate-slide-up pb-20">
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Wallet className="text-blue-500"/> เงินนอกงบประมาณ
                            </h2>
                            <p className="text-sm text-slate-500">บัญชีรายได้สถานศึกษา / เงินบริจาค / อื่นๆ</p>
                        </div>
                    </div>

                    <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                        <Wallet size={48} className="mx-auto text-slate-300 mb-4"/>
                        <p className="text-slate-500 font-bold mb-2">ยังไม่มีบัญชีเงินนอกงบประมาณ</p>
                        {canEditNonBudget && (
                             <button onClick={() => setShowAccountForm(true)} className="bg-blue-600 text-white px-6 py-2 rounded-lg shadow font-bold hover:bg-blue-700 transition-colors">
                                เปิดบัญชีรายได้สถานศึกษา
                             </button>
                        )}
                    </div>
                </div>
            )
        }

        if (!targetAcc) return null;

        const filteredTrans = transactions
            .filter(t => t.accountId === targetAcc!.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const totalIncome = filteredTrans.filter(t => t.type === 'Income').reduce((s,t) => s + t.amount, 0);
        const totalExpense = filteredTrans.filter(t => t.type === 'Expense').reduce((s,t) => s + t.amount, 0);
        const currentBalance = totalIncome - totalExpense;

        const totalPages = Math.ceil(filteredTrans.length / ITEMS_PER_PAGE);
        const displayedTrans = filteredTrans.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

        const goToPage = (p: number) => {
            if (p >= 1 && p <= totalPages) setCurrentPage(p);
        };

        return (
            <div className="space-y-6 animate-slide-up pb-20">
                 <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    <div className="flex items-center gap-4">
                        {activeTab === 'Budget' && (
                            <button onClick={() => setViewMode('DASHBOARD')} className="p-2 hover:bg-slate-200 rounded-full text-slate-600">
                                <ArrowLeft size={24}/>
                            </button>
                        )}
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                                {targetAcc.name}
                                {activeTab === 'Budget' && canEdit && (
                                     <button 
                                        onClick={() => { setEditingAccount(targetAcc); setNewAccountName(targetAcc!.name); setShowEditAccountModal(true); }}
                                        className="text-slate-400 hover:text-blue-600"
                                    >
                                        <Edit2 size={16}/>
                                    </button>
                                )}
                            </h2>
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <span>{activeTab === 'Budget' ? 'บัญชีเงินงบประมาณ' : 'บัญชีเงินรายได้สถานศึกษา'}</span>
                                <span className="text-slate-300">|</span>
                                <span className={`flex items-center gap-1 font-bold px-2 rounded-full ${isConfigured ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'}`}>
                                    {isConfigured ? <Cloud size={12}/> : <HardDrive size={12}/>}
                                    {isConfigured ? 'Online' : 'Offline'}
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                        <button 
                            onClick={() => setViewMode('PRINT')}
                            className="bg-slate-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-slate-700 font-bold flex items-center gap-2 text-sm"
                        >
                            <Printer size={16}/> <span className="hidden sm:inline">พิมพ์รายงาน</span>
                        </button>

                        {canEdit && (
                            <button 
                                onClick={() => {
                                    if (activeTab === 'NonBudget' && !selectedAccount && targetAcc) {
                                        setSelectedAccount(targetAcc);
                                    }
                                    setViewMode('TRANS_FORM'); // Changed to viewMode instead of setShowTransForm
                                }} 
                                className="bg-orange-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-orange-700 font-bold flex items-center gap-2 text-sm ml-auto"
                            >
                                <Plus size={18}/> บันทึกรายการ
                            </button>
                        )}
                    </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                         <p className="text-xs text-slate-500">รับตลอดปี</p>
                         <p className="text-xl font-bold text-green-600">+{totalIncome.toLocaleString()}</p>
                     </div>
                     <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                         <p className="text-xs text-slate-500">จ่ายตลอดปี</p>
                         <p className="text-xl font-bold text-red-600">-{totalExpense.toLocaleString()}</p>
                     </div>
                     <div className="bg-slate-800 p-4 rounded-xl border border-slate-900 shadow-sm text-white">
                         <p className="text-xs text-slate-400">คงเหลือสุทธิ</p>
                         <p className="text-2xl font-bold">฿{currentBalance.toLocaleString()}</p>
                     </div>
                 </div>

                 <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                     <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                         <h3 className="font-bold text-slate-700">รายการเคลื่อนไหว (ทั้งหมด {filteredTrans.length})</h3>
                         <span className="text-xs text-slate-500">แสดงหน้า {currentPage} จาก {totalPages || 1}</span>
                     </div>
                     <div className="overflow-x-auto flex-1 min-h-[400px]">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white text-slate-500 border-b border-slate-100 sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap w-32 bg-slate-50">วันที่</th>
                                    <th className="px-4 py-3 bg-slate-50">รายการ</th>
                                    <th className="px-4 py-3 text-right bg-slate-50">จำนวนเงิน</th>
                                    {canEdit && <th className="px-4 py-3 text-center bg-slate-50">จัดการ</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {displayedTrans.map(t => (
                                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">{getThaiDate(t.date)}</td>
                                        <td className="px-4 py-3 text-slate-800">{t.description}</td>
                                        <td className={`px-4 py-3 text-right font-bold ${t.type === 'Income' ? 'text-green-600' : 'text-red-600'}`}>
                                            {t.type === 'Income' ? '+' : '-'}{t.amount.toLocaleString()}
                                        </td>
                                        {canEdit && (
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => handleEditTransaction(t)} className="text-slate-400 hover:text-blue-600 p-1">
                                                    <Edit2 size={16}/>
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {displayedTrans.length === 0 && (
                                    <tr><td colSpan={4} className="text-center py-8 text-slate-400">ยังไม่มีรายการ</td></tr>
                                )}
                            </tbody>
                        </table>
                     </div>

                     {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-center items-center gap-4 sticky bottom-0">
                            <button 
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 shadow-sm"
                            >
                                <ChevronLeft size={20}/>
                            </button>
                            <span className="text-sm font-bold text-slate-700 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                                หน้า {currentPage} / {totalPages}
                            </span>
                            <button 
                                onClick={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 shadow-sm"
                            >
                                <ChevronRight size={20}/>
                            </button>
                        </div>
                     )}
                 </div>
            </div>
        );
    };

    // --- NEW: TRANSACTION FORM FULL VIEW ---
    const renderTransactionFormView = () => {
        let targetAcc = selectedAccount;
        if (!targetAcc && activeTab === 'NonBudget') {
            targetAcc = accounts.find(a => a.type === 'NonBudget') || null;
        }
        if (!targetAcc) return null;

        return (
            <div className="max-w-2xl mx-auto space-y-6 animate-slide-up pb-20">
                {/* Header for Form */}
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setViewMode('DETAIL')} 
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"
                    >
                        <ArrowLeft size={24}/>
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">บันทึกรายการบัญชี</h2>
                        <p className="text-slate-500 text-sm">บัญชี: {targetAcc.name}</p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                    <div className="p-8">
                        <form onSubmit={handleAddTransaction} className="space-y-6">
                            {/* Type Selector */}
                            <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                                <button 
                                    type="button" 
                                    onClick={() => setNewTrans({...newTrans, type: 'Income'})} 
                                    className={`flex-1 py-3 rounded-lg font-bold text-base transition-all ${newTrans.type === 'Income' ? 'bg-white text-green-600 shadow-md ring-1 ring-slate-200' : 'text-slate-500'}`}
                                >
                                    รายรับ (ฝาก)
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => setNewTrans({...newTrans, type: 'Expense'})} 
                                    className={`flex-1 py-3 rounded-lg font-bold text-base transition-all ${newTrans.type === 'Expense' ? 'bg-white text-red-600 shadow-md ring-1 ring-slate-200' : 'text-slate-500'}`}
                                >
                                    รายจ่าย (ถอน)
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
                                        <Calendar size={16} className="text-slate-400"/> วันที่ทำรายการ
                                    </label>
                                    <input 
                                        type="date" 
                                        required
                                        value={newTrans.date}
                                        onChange={e => setNewTrans({...newTrans, date: e.target.value})}
                                        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-slate-700 font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1">
                                        <DollarSign size={16} className="text-slate-400"/> จำนวนเงิน (บาท)
                                    </label>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        required
                                        placeholder="0.00"
                                        value={newTrans.amount}
                                        onChange={e => setNewTrans({...newTrans, amount: e.target.value})}
                                        className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-xl font-bold text-slate-800"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">รายละเอียดรายการ</label>
                                <textarea 
                                    rows={3}
                                    required
                                    placeholder="ระบุที่มาหรือรายละเอียดการจ่าย..."
                                    value={newTrans.desc}
                                    onChange={e => setNewTrans({...newTrans, desc: e.target.value})}
                                    className="w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none text-slate-700 font-medium"
                                />
                            </div>

                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 flex items-start gap-3">
                                <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" size={18}/>
                                <div className="text-xs text-orange-800 leading-relaxed font-medium">
                                    การบันทึกข้อมูลจะถูกส่งไปยังระบบตรวจสอบออนไลน์และแจ้งเตือนผู้บริหารทันที โปรดตรวจสอบความถูกต้องของจำนวนเงินก่อนบันทึก
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setViewMode('DETAIL')} 
                                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button 
                                    type="submit" 
                                    className="flex-[2] py-4 bg-orange-600 text-white rounded-xl font-bold shadow-lg hover:bg-orange-700 transition-all flex items-center justify-center gap-2"
                                >
                                    <Save size={20}/> บันทึกรายการลงบัญชี
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    };

    const renderPrintView = () => {
        let targetAcc = selectedAccount;
        if (!targetAcc && activeTab === 'NonBudget') {
             targetAcc = accounts.find(a => a.type === 'NonBudget') || null;
        }
        if (!targetAcc) return null;
        
        const director = allTeachers.find(t => t.roles.includes('DIRECTOR'));
        const directorName = director ? director.name : "......................................................................";

        const officerRole = activeTab === 'Budget' ? 'FINANCE_BUDGET' : 'FINANCE_NONBUDGET';
        const officer = allTeachers.find(t => t.roles.includes(officerRole));
        const officerName = currentUser.roles.includes(officerRole) ? currentUser.name : (officer ? officer.name : currentUser.name);

        const filteredTrans = transactions
            .filter(t => t.accountId === targetAcc!.id)
            .filter(t => {
                if (reportConfig.type === 'ALL') return true;
                if (reportConfig.type === 'MONTH') return t.date.startsWith(reportConfig.month);
                if (reportConfig.type === 'CUSTOM') return t.date >= reportConfig.customStart && t.date <= reportConfig.customEnd;
                return true;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const totalIncome = filteredTrans.filter(t => t.type === 'Income').reduce((s,t) => s + t.amount, 0);
        const totalExpense = filteredTrans.filter(t => t.type === 'Expense').reduce((s,t) => s + t.amount, 0);
        const balance = totalIncome - totalExpense;

        return (
            <div className="absolute inset-0 z-50 bg-slate-100 min-h-screen animate-fade-in">
                <div className="bg-white p-4 shadow-sm mb-6 print:hidden sticky top-0 z-40 border-b border-slate-200">
                    <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                         <div className="flex items-center gap-4 w-full md:w-auto flex-wrap">
                             <button onClick={() => setViewMode('DETAIL')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold bg-slate-100 p-2 rounded-lg">
                                <ArrowLeft size={20}/> <span className="hidden sm:inline">ย้อนกลับ</span>
                             </button>
                             
                             <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                                <button onClick={() => setReportConfig({ ...reportConfig, type: 'MONTH' })} className={`px-3 py-1 text-xs font-bold rounded ${reportConfig.type === 'MONTH' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>รายเดือน</button>
                                <button onClick={() => setReportConfig({ ...reportConfig, type: 'CUSTOM' })} className={`px-3 py-1 text-xs font-bold rounded ${reportConfig.type === 'CUSTOM' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>กำหนดเอง</button>
                                <button onClick={() => setReportConfig({ ...reportConfig, type: 'ALL' })} className={`px-3 py-1 text-xs font-bold rounded ${reportConfig.type === 'ALL' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>ทั้งหมด</button>
                             </div>

                             {reportConfig.type === 'MONTH' && (
                                 <input type="month" value={reportConfig.month} onChange={(e) => setReportConfig({ ...reportConfig, month: e.target.value })} className="border rounded px-2 py-1 text-sm text-slate-700"/>
                             )}
                             {reportConfig.type === 'CUSTOM' && (
                                 <div className="flex items-center gap-1">
                                     <input type="date" value={reportConfig.customStart} onChange={(e) => setReportConfig({ ...reportConfig, customStart: e.target.value })} className="border rounded px-2 py-1 text-xs text-slate-700 w-32"/>
                                     <span className="text-slate-400">-</span>
                                     <input type="date" value={reportConfig.customEnd} onChange={(e) => setReportConfig({ ...reportConfig, customEnd: e.target.value })} className="border rounded px-2 py-1 text-xs text-slate-700 w-32"/>
                                 </div>
                             )}
                         </div>

                         <div className="flex items-center gap-2">
                            <button onClick={() => window.print()} className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2 shadow-sm">
                                <Printer size={20}/> สั่งพิมพ์
                            </button>
                         </div>
                    </div>
                </div>

                <div className="bg-white shadow-lg p-10 mx-auto max-w-[210mm] min-h-[297mm] print:shadow-none print:w-full print:p-[2.5cm] print:m-0 text-slate-900">
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-bold mb-1">รายงานการรับ - จ่ายเงิน</h2>
                        <h3 className="text-lg font-bold text-slate-700">{targetAcc.name}</h3>
                        <p className="text-sm text-slate-600 mt-2 font-bold">
                            {reportConfig.type === 'ALL' && "ข้อมูลทั้งหมด"}
                            {reportConfig.type === 'MONTH' && `ประจำเดือน ${formatMonthYearInput(reportConfig.month)}`}
                            {reportConfig.type === 'CUSTOM' && `ตั้งแต่วันที่ ${getThaiDate(reportConfig.customStart)} ถึง ${getThaiDate(reportConfig.customEnd)}`}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">พิมพ์เมื่อ: {new Date().toLocaleDateString('th-TH', { dateStyle: 'long' })}</p>
                    </div>

                    <table className="w-full border-collapse border border-slate-400 text-sm">
                        <thead>
                            <tr className="bg-slate-50">
                                <th className="border border-slate-400 p-2 text-center w-16">ลำดับ</th>
                                <th className="border border-slate-400 p-2 text-center whitespace-nowrap w-28">วัน/เดือน/ปี</th>
                                <th className="border border-slate-400 p-2 text-left">รายการ</th>
                                <th className="border border-slate-400 p-2 text-right w-24">รายรับ</th>
                                <th className="border border-slate-400 p-2 text-right w-24">รายจ่าย</th>
                                <th className="border border-slate-400 p-2 text-right w-28">คงเหลือ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                let runBal = 0;
                                if (filteredTrans.length === 0) return <tr><td colSpan={6} className="p-4 text-center">ไม่มีรายการในช่วงเวลาที่เลือก</td></tr>;
                                return filteredTrans.map((t, idx) => {
                                    if(t.type === 'Income') runBal += t.amount;
                                    else runBal -= t.amount;
                                    return (
                                        <tr key={t.id}>
                                            <td className="border border-slate-400 p-2 text-center">{idx + 1}</td>
                                            <td className="border border-slate-400 p-2 text-center whitespace-nowrap">{getThaiDate(t.date)}</td>
                                            <td className="border border-slate-400 p-2">{t.description}</td>
                                            <td className="border border-slate-400 p-2 text-right text-green-700">{t.type === 'Income' ? t.amount.toLocaleString() : '-'}</td>
                                            <td className="border border-slate-400 p-2 text-right text-red-700">{t.type === 'Expense' ? t.amount.toLocaleString() : '-'}</td>
                                            <td className="border border-slate-400 p-2 text-right font-bold">{runBal.toLocaleString()}</td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold">
                                <td colSpan={3} className="border border-slate-400 p-2 text-center">รวมทั้งสิ้น</td>
                                <td className="border border-slate-400 p-2 text-right text-green-700">{totalIncome.toLocaleString()}</td>
                                <td className="border border-slate-400 p-2 text-right text-red-700">{totalExpense.toLocaleString()}</td>
                                <td className="border border-slate-400 p-2 text-right text-blue-700">{balance.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="mt-16 flex justify-between px-10 page-break-inside-avoid">
                        <div className="text-center w-5/12 whitespace-nowrap">
                            <p className="mb-8">ลงชื่อ..........................................................ผู้ทำรายการ</p>
                            <p className="font-bold">({officerName})</p>
                            <p className="mt-1">ตำแหน่ง เจ้าหน้าที่การเงิน</p>
                        </div>
                        <div className="text-center w-5/12 whitespace-nowrap">
                            <p className="mb-8">ลงชื่อ..........................................................ผู้ตรวจสอบ</p>
                            <p className="font-bold">({directorName})</p>
                            <p className="mt-1">ตำแหน่ง ผู้อำนวยการโรงเรียน</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (isLoadingData) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400 flex-col gap-2">
                <Loader className="animate-spin" size={32}/>
                <p>กำลังเชื่อมต่อฐานข้อมูล...</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            {viewMode === 'DASHBOARD' && renderDashboard()}
            {viewMode === 'DETAIL' && renderDetail()}
            {viewMode === 'PRINT' && renderPrintView()}
            {viewMode === 'TRANS_FORM' && renderTransactionFormView()}

            {/* Help Import Modal */}
            {showImportHelp && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-scale-up">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <FileSpreadsheet className="text-green-600"/> รูปแบบไฟล์ Excel ที่รองรับ
                        </h3>
                        <div className="space-y-4 text-sm text-slate-600">
                            <div>
                                <p className="font-bold text-slate-800 mb-2">ชื่อคอลัมน์ (หัวตาราง)</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">วันที่</span> (Date)</li>
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">ชื่อบัญชี</span> (Account Name) <span className="text-xs text-orange-500 font-bold">*สำคัญ</span></li>
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">รายการ</span> (Description)</li>
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">ฝาก/ถอน</span> หรือ ประเภท (Type)</li>
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">จำนวนเงิน</span> (Amount)</li>
                                </ul>
                            </div>
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <p className="font-bold text-blue-800 mb-1">💡 ระบบอัตโนมัติ:</p>
                                <ul className="list-disc pl-5 space-y-1 text-blue-700">
                                    <li>ระบบจะแยกรายการไปลงตาม <strong>ชื่อบัญชี</strong> ที่ระบุในไฟล์ให้อัตโนมัติ</li>
                                    <li>ถ้ายังไม่มีบัญชีชื่อนั้น ระบบจะสร้างการ์ดบัญชีใหม่ให้ทันที</li>
                                </ul>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button onClick={() => setShowImportHelp(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-bold hover:bg-slate-200">ปิดหน้าต่าง</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Account Form Modal */}
            {showAccountForm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-scale-up">
                        <h3 className="text-lg font-bold text-slate-800 mb-4">เปิดบัญชีใหม่</h3>
                        <form onSubmit={handleAddAccount} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อบัญชี</label>
                                <input 
                                    autoFocus
                                    type="text" 
                                    required
                                    placeholder="เช่น ค่าอาหารกลางวัน, เงินอุดหนุน..."
                                    value={newAccount.name}
                                    onChange={e => setNewAccount({...newAccount, name: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowAccountForm(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-orange-600 text-white rounded-lg font-bold shadow-md">บันทึก</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Account Name Modal */}
            {showEditAccountModal && editingAccount && (
                 <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-scale-up">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Edit2 size={20} className="text-blue-600"/> แก้ไขชื่อบัญชี
                        </h3>
                        <form onSubmit={handleUpdateAccountName} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อบัญชี</label>
                                <input 
                                    autoFocus
                                    type="text" 
                                    required
                                    value={newAccountName}
                                    onChange={e => setNewAccountName(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowEditAccountModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md">บันทึก</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EDIT Transaction Modal */}
            {showEditModal && editingTransaction && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-scale-up">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Edit2 className="text-blue-500"/> แก้ไขรายการ
                            </h3>
                            <button 
                                type="button" 
                                onClick={handleDeleteTransaction}
                                className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                title="ลบรายการ"
                            >
                                <Trash2 size={20}/>
                            </button>
                        </div>

                        <form onSubmit={handleUpdateTransaction} className="space-y-4">
                             <div className="flex bg-slate-100 p-1 rounded-lg mb-2">
                                <button type="button" onClick={() => setEditingTransaction({...editingTransaction, type: 'Income'})} className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${editingTransaction.type === 'Income' ? 'bg-white text-green-600 shadow' : 'text-slate-500'}`}>รายรับ</button>
                                <button type="button" onClick={() => setEditingTransaction({...editingTransaction, type: 'Expense'})} className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${editingTransaction.type === 'Expense' ? 'bg-white text-red-600 shadow' : 'text-slate-500'}`}>รายจ่าย</button>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">วันที่</label>
                                <input 
                                    type="date" 
                                    required
                                    value={editingTransaction.date}
                                    onChange={e => setEditingTransaction({...editingTransaction, date: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">รายการ</label>
                                <input 
                                    type="text" 
                                    required
                                    value={editingTransaction.description}
                                    onChange={e => setEditingTransaction({...editingTransaction, description: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">จำนวนเงิน</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    required
                                    value={editingTransaction.amount}
                                    onChange={e => setEditingTransaction({...editingTransaction, amount: parseFloat(e.target.value)})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold"
                                />
                            </div>

                            <div className="bg-yellow-50 p-3 rounded-lg text-xs text-yellow-800 border border-yellow-200 flex items-start gap-2">
                                <ShieldAlert size={16} className="shrink-0 mt-0.5"/>
                                <span>การแก้ไขหรือลบรายการจะถูกบันทึกในระบบตรวจสอบ (Audit Log)</span>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold shadow-md">บันทึกการแก้ไข</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinanceSystem;
