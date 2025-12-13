
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
        // Excel base date is Dec 30, 1899. 
        // 25569 is the diff between Unix epoch and Excel epoch in days.
        // 86400 * 1000 is milliseconds per day.
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
        
        // Convert Thai Year if > 2400 (Simple heuristic)
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
    
    // View State
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'DETAIL' | 'PRINT'>('DASHBOARD');

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

    // UI State
    const [showTransForm, setShowTransForm] = useState(false);
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
            
            // 1. Fetch from LocalStorage (Fallback)
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

            // 2. Fetch from Firebase (If Configured)
            if (isConfigured && db) {
                try {
                    // Fetch Accounts
                    const accQ = query(collection(db, "finance_accounts"), where("schoolId", "==", currentUser.schoolId));
                    const accSnap = await getDocs(accQ);
                    const dbAccounts = accSnap.docs.map(doc => doc.data() as FinanceAccount);

                    // Fetch Transactions
                    const transQ = query(collection(db, "finance_transactions"), where("schoolId", "==", currentUser.schoolId));
                    const transSnap = await getDocs(transQ);
                    const dbTrans = transSnap.docs.map(doc => doc.data() as Transaction);

                    // Use DB data if available, otherwise fallback/merge (DB takes precedence)
                    if (dbAccounts.length > 0 || dbTrans.length > 0) {
                        setAccounts(dbAccounts);
                        setTransactions(dbTrans);
                    } else {
                        // First time online or empty DB? Use local or Mock
                        if (localAccounts.length > 0) {
                             setAccounts(localAccounts);
                             setTransactions(localTrans);
                        } else {
                            // Fallback to Mock if absolutely nothing
                            const mockBudget = MOCK_ACCOUNTS.filter(a => a.schoolId === currentUser.schoolId || a.type === 'Budget'); // Filter somewhat
                             setAccounts(mockBudget);
                             setTransactions(MOCK_TRANSACTIONS.filter(t => t.schoolId === currentUser.schoolId));
                        }
                    }

                    // Fetch System Config for Telegram
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
                // Offline Mode
                setAccounts(localAccounts.length ? localAccounts : MOCK_ACCOUNTS);
                setTransactions(localTrans.length ? localTrans : MOCK_TRANSACTIONS);
            }

            setIsLoadingData(false);
        };

        loadData();
    }, [currentUser.schoolId]);

    // Helper to Save Data (Router: Local vs Firebase)
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
            // Save to LocalStorage
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
            // LocalStorage
            const currentAllAcc = JSON.parse(localStorage.getItem('schoolos_finance_accounts') || '[]');
            const updatedAllAcc = [...currentAllAcc, accountData];
            localStorage.setItem('schoolos_finance_accounts', JSON.stringify(updatedAllAcc));
            return true;
        }
    }

    const handleUpdateAccountName = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingAccount || !newAccountName) return;

        // Optimistic Update UI
        const updatedAccounts = accounts.map(a => a.id === editingAccount.id ? { ...a, name: newAccountName } : a);
        setAccounts(updatedAccounts);

        const updatedAccountObj = { ...editingAccount, name: newAccountName };

        if (isConfigured && db) {
            try {
                // Use setDoc with merge: true. 
                // This prevents "Document not found" errors if editing a Mock Account that hasn't been synced to DB yet.
                const accRef = doc(db, "finance_accounts", editingAccount.id);
                await setDoc(accRef, { name: newAccountName }, { merge: true });
            } catch (e) {
                console.error("Firebase Update Error", e);
                alert("การบันทึกออนไลน์มีปัญหาเล็กน้อย แต่ระบบได้บันทึกข้อมูลในเครื่องให้แล้ว");
            }
        } 
        
        // Always update LocalStorage as backup/offline persistence
        try {
            const allLocal = JSON.parse(localStorage.getItem('schoolos_finance_accounts') || '[]');
            const existingIndex = allLocal.findIndex((a: any) => a.id === editingAccount.id);
            let updatedLocal;
            
            if (existingIndex >= 0) {
                updatedLocal = allLocal.map((a:any) => a.id === editingAccount.id ? updatedAccountObj : a);
            } else {
                // If editing a Mock account for the first time, it won't be in LS yet, so add it.
                updatedLocal = [...allLocal, updatedAccountObj];
            }
            localStorage.setItem('schoolos_finance_accounts', JSON.stringify(updatedLocal));
        } catch (err) {
            console.error("Local Storage Error", err);
        }

        setShowEditAccountModal(false);
        setEditingAccount(null);
    };


    // Update active tab logic based on permissions
    useEffect(() => {
        if (!isDirector && !isSystemAdmin) {
            if (activeTab === 'Budget' && !isBudgetOfficer && isNonBudgetOfficer) {
                setActiveTab('NonBudget');
            } else if (activeTab === 'NonBudget' && !isNonBudgetOfficer && isBudgetOfficer) {
                setActiveTab('Budget');
            }
        }
        
        // Auto-select logic
        if (activeTab === 'NonBudget') {
            setSelectedAccount(null); 
            if (viewMode === 'DASHBOARD') setViewMode('DETAIL');
        } else {
             setSelectedAccount(null);
             if (viewMode === 'DETAIL') setViewMode('DASHBOARD');
        }

    }, [currentUser, isBudgetOfficer, isNonBudgetOfficer, isDirector, isSystemAdmin, activeTab]);

    // Reset pagination when account changes
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedAccount, activeTab]);

    // --- Permissions Helpers ---
    const canSeeBudget = isDirector || isSystemAdmin || isBudgetOfficer;
    const canSeeNonBudget = isDirector || isSystemAdmin || isNonBudgetOfficer;
    
    // Updated: Director and Admin should also be able to edit/fix data
    const canEditBudget = isBudgetOfficer || isDirector || isSystemAdmin;
    const canEditNonBudget = isNonBudgetOfficer || isDirector || isSystemAdmin;
    
    const canEdit = (activeTab === 'Budget' && canEditBudget) || (activeTab === 'NonBudget' && canEditNonBudget);

    // --- Logic ---

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

        // If an account is explicitly selected, use it.
        if (selectedAccount) {
            targetAccountId = selectedAccount.id;
            targetAccountName = selectedAccount.name;
        } else if (activeTab === 'NonBudget') {
            // Find NonBudget Account
            const nbAcc = accounts.find(a => a.type === 'NonBudget');
            if (nbAcc) {
                targetAccountId = nbAcc.id;
                targetAccountName = nbAcc.name;
            } else {
                // Create Default NonBudget Account
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
            setShowTransForm(false);

            // --- TELEGRAM NOTIFICATION ---
            if (sysConfig?.telegramBotToken) {
                // 1. Calculate New Balance (Current + New Transaction)
                const currentTrans = transactions.filter(t => t.accountId === targetAccountId);
                const prevIncome = currentTrans.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
                const prevExpense = currentTrans.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
                const prevBalance = prevIncome - prevExpense;
                
                const newBalance = newTrans.type === 'Income' 
                    ? prevBalance + transactionAmount 
                    : prevBalance - transactionAmount;

                // 2. Identify Recipients
                // - Director (Always)
                // - Finance Officer (Based on Tab)
                const recipients = allTeachers.filter(t => {
                    const isDirector = t.roles.includes('DIRECTOR');
                    const isRelevantOfficer = activeTab === 'Budget' 
                        ? t.roles.includes('FINANCE_BUDGET') 
                        : t.roles.includes('FINANCE_NONBUDGET');
                    
                    // Filter by school and role, must have chat ID
                    return t.schoolId === currentUser.schoolId && t.telegramChatId && (isDirector || isRelevantOfficer);
                });

                // 3. Construct Message
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

                // 4. Send
                recipients.forEach(t => {
                    sendTelegramMessage(sysConfig.telegramBotToken!, t.telegramChatId!, message, deepLink);
                });
            }
        }
    };

    // --- Excel Import Logic ---
    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];

        // Determine Target Account
        let targetAccountId = '';

        if (selectedAccount) {
            targetAccountId = selectedAccount.id;
        } else if (activeTab === 'NonBudget') {
             const nbAcc = accounts.find(a => a.type === 'NonBudget');
             if (nbAcc) targetAccountId = nbAcc.id;
             else {
                 alert("ไม่พบบัญชีปลายทางสำหรับนำเข้าข้อมูล กรุณากด 'เปิดบัญชีรายได้สถานศึกษา' ก่อนนำเข้าไฟล์");
                 if(fileInputRef.current) fileInputRef.current.value = '';
                 return;
             }
        } else {
             alert("กรุณาเลือกบัญชีที่ต้องการนำเข้าข้อมูลก่อน");
             return;
        }

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
                let successCount = 0;

                rawData.forEach((row: any) => {
                    const normalizedRow: any = {};
                    Object.keys(row).forEach(key => normalizedRow[key.trim()] = row[key]);

                    const dateRaw = normalizedRow['Date'] || normalizedRow['date'] || normalizedRow['วันที่'];
                    const descRaw = normalizedRow['Description'] || normalizedRow['description'] || normalizedRow['รายการ'];
                    const amountRaw = normalizedRow['Amount'] || normalizedRow['amount'] || normalizedRow['จำนวนเงิน'];
                    const typeRaw = normalizedRow['Type'] || normalizedRow['type'] || normalizedRow['ประเภท'];

                    if (!descRaw || !amountRaw) return;

                    let amountValue = parseFloat(amountRaw.toString().replace(/,/g, ''));
                    if (isNaN(amountValue)) return;

                    let finalType = 'Income';
                    if (typeRaw && typeRaw.toString().toLowerCase().includes('จ่าย')) finalType = 'Expense';

                    // Parse Date correctly
                    const finalDate = parseExcelDate(dateRaw);

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
                });

                if (batchTransactions.length > 0) {
                    // Batch Save
                    if (isConfigured && db) {
                        // Firebase Batch Import (Sequentially for simplicity)
                        try {
                            const promises = batchTransactions.map(t => setDoc(doc(db, "finance_transactions", t.id), t));
                            await Promise.all(promises);
                        } catch (err) {
                            console.error("Batch Import Failed", err);
                            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลบางส่วนลงฐานข้อมูล");
                        }
                    } else {
                         // Local Storage
                         const currentAllTrans = JSON.parse(localStorage.getItem('schoolos_finance_transactions') || '[]');
                         localStorage.setItem('schoolos_finance_transactions', JSON.stringify([...currentAllTrans, ...batchTransactions]));
                    }
                    
                    setTransactions([...transactions, ...batchTransactions]);
                    alert(`นำเข้าข้อมูลสำเร็จจำนวน ${successCount} รายการ`);
                } else {
                    alert("ไม่พบข้อมูลที่สามารถนำเข้าได้ กรุณาตรวจสอบไฟล์ Excel (ต้องมีคอลัมน์: วันที่, รายการ, จำนวนเงิน)");
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
    
    // --- Edit / Delete Transaction ---
    const handleEditTransaction = (t: Transaction) => {
        if (!canEdit) return;
        setEditingTransaction(t);
        setShowEditModal(true);
    };

    const handleUpdateTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingTransaction) return;

        // UI Update
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
            // Local
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

         // UI Update
         const updatedTrans = transactions.filter(t => t.id !== editingTransaction.id);
         setTransactions(updatedTrans);

        if (isConfigured && db) {
            try {
                await deleteDoc(doc(db, "finance_transactions", editingTransaction.id));
            } catch (e) {
                console.error("Delete Trans Error", e);
            }
        } else {
            // Local
            const currentAllTrans = JSON.parse(localStorage.getItem('schoolos_finance_transactions') || '[]');
            const updated = currentAllTrans.filter((t:any) => t.id !== editingTransaction.id);
            localStorage.setItem('schoolos_finance_transactions', JSON.stringify(updated));
        }

         setShowEditModal(false);
         setEditingTransaction(null);
    };

    // --- Renderers ---

    const renderDashboard = () => (
        <div className="animate-fade-in space-y-6 pb-20">
            {/* Header / Tabs */}
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

            {/* Content based on Tab */}
            {activeTab === 'Budget' && canSeeBudget && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {accounts.filter(a => a.type === 'Budget').map(acc => {
                            const balance = getAccountBalance(acc.id);
                            return (
                                <div 
                                    key={acc.id} 
                                    className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md hover:border-orange-300 transition-all cursor-pointer group relative"
                                    onClick={() => { setSelectedAccount(acc); setViewMode('DETAIL'); }}
                                >
                                    {/* Edit Button for Budget Accounts */}
                                    {canEditBudget && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setEditingAccount(acc); setNewAccountName(acc.name); setShowEditAccountModal(true); }}
                                            className="absolute top-4 right-4 p-2 bg-white text-slate-400 hover:text-blue-600 rounded-full hover:bg-slate-100 z-10"
                                            title="แก้ไขชื่อบัญชี"
                                        >
                                            <Edit2 size={16}/>
                                        </button>
                                    )}

                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-orange-50 rounded-lg group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                            <FileText size={24}/>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-500">ยอดคงเหลือ</p>
                                            <p className={`text-xl font-bold ${balance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                                                ฿{balance.toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-lg text-slate-800 mb-2 group-hover:text-orange-600 pr-8">{acc.name}</h3>
                                    <div className="text-xs text-slate-400 flex items-center gap-1">
                                        แตะเพื่อดูรายละเอียด <ArrowRight size={12}/>
                                    </div>
                                </div>
                            );
                        })}
                        
                        {/* Add Account Button (Only Officer) */}
                        {canEditBudget && (
                            <button 
                                onClick={() => setShowAccountForm(true)}
                                className="border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-all gap-2"
                            >
                                <PlusCircle size={32}/>
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
                        <p className="text-xs text-slate-400 mb-6 max-w-md mx-auto">
                            หากท่านพบว่ามีข้อมูลในฐานข้อมูล แต่ไม่แสดงในหน้านี้ อาจเกิดจากข้อมูลบัญชี (Account) สูญหายหรือไม่ตรงกัน 
                        </p>
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

        // Pagination Logic
        const totalPages = Math.ceil(filteredTrans.length / ITEMS_PER_PAGE);
        const displayedTrans = filteredTrans.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

        const goToPage = (p: number) => {
            if (p >= 1 && p <= totalPages) setCurrentPage(p);
        };

        return (
            <div className="space-y-6 animate-slide-up pb-20">
                 {/* Header */}
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
                        {/* IMPORT BUTTON & HELP */}
                        <div className="relative flex items-center gap-1">
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept=".xlsx, .xls"
                                onChange={handleImportExcel}
                            />
                            {canEdit && (
                                <>
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={isImporting}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-green-700 font-bold flex items-center gap-2 text-sm disabled:opacity-50"
                                    >
                                        {isImporting ? <Loader className="animate-spin" size={16}/> : <Upload size={16}/>}
                                        <span className="hidden sm:inline">นำเข้า Excel</span>
                                    </button>
                                    <button 
                                        onClick={() => setShowImportHelp(true)}
                                        className="text-slate-400 hover:text-blue-600 p-2 hover:bg-slate-100 rounded-full transition-colors"
                                        title="ดูรูปแบบไฟล์ที่รองรับ"
                                    >
                                        <HelpCircle size={20} />
                                    </button>
                                </>
                            )}
                        </div>
                        
                        {/* PRINT BUTTON */}
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
                                    setShowTransForm(true);
                                }} 
                                className="bg-orange-600 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-orange-700 font-bold flex items-center gap-2 text-sm ml-auto"
                            >
                                <Plus size={18}/> บันทึกรายการ
                            </button>
                        )}
                    </div>
                 </div>

                 {/* Stats Cards */}
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

                 {/* Transactions Table */}
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

                     {/* Pagination Controls */}
                     {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-center items-center gap-4 sticky bottom-0">
                            <button 
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-50 text-slate-600 shadow-sm"
                            >
                                <ChevronLeft size={20}/>
                            </button>
                            <span className="text-sm font-bold text-slate-700 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
                                หน้า {currentPage} / {totalPages}
                            </span>
                            <button 
                                onClick={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-50 text-slate-600 shadow-sm"
                            >
                                <ChevronRight size={20}/>
                            </button>
                        </div>
                     )}
                 </div>
            </div>
        );
    };

    // Print View remains largely same ...
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
                {/* Print Controls Toolbar */}
                <div className="bg-white p-4 shadow-sm mb-6 print:hidden sticky top-0 z-40 border-b border-slate-200">
                    <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                         <div className="flex items-center gap-4 w-full md:w-auto flex-wrap">
                             <button onClick={() => setViewMode('DETAIL')} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold bg-slate-100 p-2 rounded-lg">
                                <ArrowLeft size={20}/> <span className="hidden sm:inline">ย้อนกลับ</span>
                             </button>
                             
                             <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                                <button 
                                    onClick={() => setReportConfig({ ...reportConfig, type: 'MONTH' })}
                                    className={`px-3 py-1 text-xs font-bold rounded ${reportConfig.type === 'MONTH' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                >
                                    รายเดือน
                                </button>
                                <button 
                                    onClick={() => setReportConfig({ ...reportConfig, type: 'CUSTOM' })}
                                    className={`px-3 py-1 text-xs font-bold rounded ${reportConfig.type === 'CUSTOM' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                >
                                    กำหนดเอง
                                </button>
                                <button 
                                    onClick={() => setReportConfig({ ...reportConfig, type: 'ALL' })}
                                    className={`px-3 py-1 text-xs font-bold rounded ${reportConfig.type === 'ALL' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}
                                >
                                    ทั้งหมด
                                </button>
                             </div>

                             {reportConfig.type === 'MONTH' && (
                                 <input 
                                    type="month" 
                                    value={reportConfig.month}
                                    onChange={(e) => setReportConfig({ ...reportConfig, month: e.target.value })}
                                    className="border rounded px-2 py-1 text-sm text-slate-700"
                                 />
                             )}
                             {reportConfig.type === 'CUSTOM' && (
                                 <div className="flex items-center gap-1">
                                     <input 
                                        type="date" 
                                        value={reportConfig.customStart}
                                        onChange={(e) => setReportConfig({ ...reportConfig, customStart: e.target.value })}
                                        className="border rounded px-2 py-1 text-xs text-slate-700 w-32"
                                     />
                                     <span className="text-slate-400">-</span>
                                     <input 
                                        type="date" 
                                        value={reportConfig.customEnd}
                                        onChange={(e) => setReportConfig({ ...reportConfig, customEnd: e.target.value })}
                                        className="border rounded px-2 py-1 text-xs text-slate-700 w-32"
                                     />
                                 </div>
                             )}
                         </div>

                         <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-mono hidden md:inline">
                                Found {filteredTrans.length} records
                            </span>
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

            {/* Help Import Modal */}
            {showImportHelp && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-scale-up">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <FileSpreadsheet className="text-green-600"/> รูปแบบไฟล์ Excel ที่รองรับ
                        </h3>
                        <div className="space-y-4 text-sm text-slate-600">
                            <div>
                                <p className="font-bold text-slate-800 mb-2">1. ชื่อคอลัมน์ (หัวตาราง)</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">วันที่</span> หรือ Date</li>
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">รายการ</span> หรือ Description</li>
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">จำนวนเงิน</span> หรือ Amount</li>
                                    <li><span className="font-mono bg-slate-100 px-1 rounded">ประเภท</span> (ถ้ามีคำว่า "จ่าย" = รายจ่าย, อื่นๆ = รายรับ)</li>
                                </ul>
                            </div>
                            <div>
                                <p className="font-bold text-slate-800 mb-2">2. รูปแบบวันที่</p>
                                <ul className="list-disc pl-5 space-y-1">
                                    <li>วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.) เช่น <code>31/01/2567</code></li>
                                    <li>YYYY-MM-DD เช่น <code>2024-01-31</code></li>
                                    <li>Format วันที่มาตรฐานของ Excel</li>
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

            {/* Transaction Form Modal */}
            {showTransForm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-scale-up">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <PlusCircle className="text-orange-500"/> บันทึกรายการใหม่
                        </h3>
                        <form onSubmit={handleAddTransaction} className="space-y-4">
                            {/* Type Selector */}
                            <div className="flex bg-slate-100 p-1 rounded-lg mb-2">
                                <button type="button" onClick={() => setNewTrans({...newTrans, type: 'Income'})} className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${newTrans.type === 'Income' ? 'bg-white text-green-600 shadow' : 'text-slate-500'}`}>รายรับ</button>
                                <button type="button" onClick={() => setNewTrans({...newTrans, type: 'Expense'})} className={`flex-1 py-2 rounded-md font-bold text-sm transition-all ${newTrans.type === 'Expense' ? 'bg-white text-red-600 shadow' : 'text-slate-500'}`}>รายจ่าย</button>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">วันที่</label>
                                <input 
                                    type="date" 
                                    required
                                    value={newTrans.date}
                                    onChange={e => setNewTrans({...newTrans, date: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">รายการ</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="ระบุรายละเอียด..."
                                    value={newTrans.desc}
                                    onChange={e => setNewTrans({...newTrans, desc: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">จำนวนเงิน (บาท)</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    required
                                    value={newTrans.amount}
                                    onChange={e => setNewTrans({...newTrans, amount: e.target.value})}
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-xl font-bold text-slate-800"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowTransForm(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-orange-600 text-white rounded-lg font-bold shadow-md">บันทึก</button>
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
                             {/* Type Selector */}
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
