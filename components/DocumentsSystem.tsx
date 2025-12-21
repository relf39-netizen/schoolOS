import React, { useState, useEffect, useRef } from 'react';
import { DocumentItem, Teacher, Attachment, SystemConfig } from '../types';
import { MOCK_DOCUMENTS } from '../constants';
import { Search, FileText, Users, PenTool, CheckCircle, FilePlus, Eye, CheckSquare, Loader, Link as LinkIcon, Trash2, File as FileIcon, ExternalLink, Plus, UploadCloud, AlertTriangle, Monitor, FileCheck, ArrowLeft, Send, MousePointerClick, ChevronLeft, ChevronRight, FileBadge, Megaphone, Save, FileSpreadsheet, FileArchive, Image as ImageIcon, Bell, X, Info } from 'lucide-react';
import { db, isConfigured, collection, addDoc, onSnapshot, query, orderBy, updateDoc, where, doc, getDoc, deleteDoc, getDocs, type QuerySnapshot, type DocumentData } from '../firebaseConfig';
import { stampPdfDocument, stampReceiveNumber } from '../utils/pdfStamper';
import { sendTelegramMessage } from '../utils/telegram';

interface BackgroundTask {
    id: string;
    title: string;
    status: 'processing' | 'uploading' | 'done' | 'error';
    message: string;
}

interface DocumentsSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    focusDocId?: string | null;
    onClearFocus?: () => void;
}

const DocumentsSystem: React.FC<DocumentsSystemProps> = ({ currentUser, allTeachers, focusDocId, onClearFocus }) => {
    // State
    const [docs, setDocs] = useState<DocumentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    
    // System Config State
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    
    const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
    const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);

    // Form State (Admin)
    const [docCategory, setDocCategory] = useState<'INCOMING' | 'ORDER'>('INCOMING');
    const [newDoc, setNewDoc] = useState({ 
        bookNumber: '', 
        title: '', 
        from: '', 
        priority: 'Normal', 
        description: '' 
    });
    
    // Attachment Management State
    const [tempAttachments, setTempAttachments] = useState<Attachment[]>([]);
    const [linkInput, setLinkInput] = useState('');
    const [linkNameInput, setLinkNameInput] = useState('');
    
    // Upload Progress State
    const [uploadProgress, setUploadProgress] = useState<string>('');

    // Director Action State
    const [command, setCommand] = useState('');
    const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
    const [stampPage, setStampPage] = useState<number>(1);
    const [teacherSearchTerm, setTeacherSearchTerm] = useState(''); 

    // --- Roles Checking ---
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');

    // --- Background Task Manager Logic ---
    const updateTask = (id: string, updates: Partial<BackgroundTask>) => {
        setBackgroundTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const removeTask = (id: string) => {
        setTimeout(() => {
            setBackgroundTasks(prev => prev.filter(t => t.id !== id));
        }, 5000); // Keep done tasks for 5s
    };

    // Browser closure warning
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            const activeTasks = backgroundTasks.filter(t => t.status === 'processing' || t.status === 'uploading');
            if (activeTasks.length > 0) {
                e.preventDefault();
                e.returnValue = "ระบบกำลังบันทึกข้อมูลและอัปโหลดไฟล์ไปที่ Google Drive กรุณารอสักครู่เพื่อป้องกันข้อมูลสูญหาย";
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [backgroundTasks]);

    // --- Helpers ---
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    const getFileIcon = (fileName: string, type: 'FILE' | 'LINK', size: number = 20, colored: boolean = true) => {
        const lower = fileName.toLowerCase();
        let Icon = FileIcon;
        let colorClass = "text-slate-500";

        if (type === 'LINK') {
            Icon = ExternalLink;
            colorClass = "text-blue-500";
        } else if (lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv')) {
            Icon = FileSpreadsheet;
            colorClass = "text-green-600";
        } else if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
            Icon = FileText;
            colorClass = "text-blue-600";
        } else if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) {
            Icon = Monitor;
            colorClass = "text-orange-600";
        } else if (lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')) {
            Icon = FileArchive;
            colorClass = "text-yellow-600";
        } else if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            Icon = ImageIcon;
            colorClass = "text-purple-600";
        } else if (lower.endsWith('.pdf')) {
            Icon = FileIcon;
            colorClass = "text-red-500";
        }
        
        return <Icon size={size} className={colored ? colorClass : ''} />;
    };

    const generateNextBookNumber = (currentDocs: DocumentItem[]) => {
        const currentThaiYear = String(new Date().getFullYear() + 543);
        let maxNum = 0;
        currentDocs.forEach(d => {
            const parts = d.bookNumber.split('/');
            if (parts.length === 2 && parts[1] === currentThaiYear) {
                const num = parseInt(parts[0]);
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        });
        return `${String(maxNum + 1).padStart(3, '0')}/${currentThaiYear}`;
    };

    const handleInitCreate = () => {
        const nextNum = generateNextBookNumber(docs);
        setNewDoc({
            bookNumber: nextNum,
            title: '',
            from: '',
            priority: 'Normal',
            description: ''
        });
        setDocCategory('INCOMING'); 
        setTempAttachments([]);
        setSelectedTeachers([]); 
        setViewMode('CREATE');
    };

    const getGoogleDriveId = (url: string) => {
        const patterns = [
            /drive\.google\.com\/file\/d\/([-_\w]+)/,
            /drive\.google\.com\/open\?id=([-_\w]+)/
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) return match[1];
        }
        return null;
    };

    const formatDateForFilename = (dateStr: string) => {
        if (!dateStr) return '00000000';
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear() + 543;
        return `${day}${month}${year}`;
    };

    const triggerTelegramNotification = async (teachers: Teacher[], docId: string, title: string, isOrder: boolean) => {
        let currentBotToken = sysConfig?.telegramBotToken;
        let currentBaseUrl = sysConfig?.appBaseUrl;

        try {
            const local = localStorage.getItem('schoolos_system_config');
            if (local) {
                const parsed = JSON.parse(local);
                if (parsed.telegramBotToken) currentBotToken = parsed.telegramBotToken;
                if (parsed.appBaseUrl) currentBaseUrl = parsed.appBaseUrl;
            }
        } catch (e) {}

        if (isConfigured && db) {
            try {
                const configDoc = await getDoc(doc(db, "system_config", "settings"));
                if (configDoc.exists()) {
                    const freshConfig = configDoc.data() as SystemConfig;
                    currentBotToken = freshConfig.telegramBotToken;
                    currentBaseUrl = freshConfig.appBaseUrl;
                }
            } catch (e) {
                console.error("Failed to fetch fresh config for notification", e);
            }
        }

        if (!currentBotToken) return;
        
        const baseUrl = currentBaseUrl || window.location.origin;
        const deepLink = `${baseUrl}?view=DOCUMENTS&id=${docId}`;
        
        const message = isOrder 
            ? `📣 <b>มีคำสั่งปฏิบัติราชการใหม่</b>\nเรื่อง: ${title}\n`
            : `📢 <b>มีหนังสือราชการเวียน/สั่งการ</b>\nเรื่อง: ${title}\n`;
            
        teachers.forEach(t => {
            if (t.telegramChatId) {
                sendTelegramMessage(currentBotToken!, t.telegramChatId, message, deepLink);
            }
        });
    };

    // --- Data Connection ---
    useEffect(() => {
        let unsubscribe: () => void;
        let timeoutId: ReturnType<typeof setTimeout>;

        if (isConfigured && db) {
            timeoutId = setTimeout(() => {
                if(isLoading) {
                    console.warn("Firestore Documents timeout. Switching to Mock Data.");
                    setDocs(MOCK_DOCUMENTS);
                    setIsLoading(false);
                }
            }, 3000);

            try {
                const q = query(collection(db, "documents"), orderBy("id", "desc")); 
                unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
                    clearTimeout(timeoutId);
                    const fetched: DocumentItem[] = [];
                    snapshot.forEach((docSnap) => {
                        fetched.push({ ...docSnap.data() } as DocumentItem);
                    });
                    setDocs(fetched);
                    setIsLoading(false);
                }, (error) => {
                    clearTimeout(timeoutId);
                    console.error("Error fetching docs:", error);
                    setDocs(MOCK_DOCUMENTS);
                    setIsLoading(false);
                });
                
                const fetchConfig = async () => {
                    try {
                        const local = localStorage.getItem('schoolos_system_config');
                        if (local) setSysConfig(JSON.parse(local));
                    } catch(e) {}

                    try {
                        const docRef = doc(db, "system_config", "settings");
                        const docSnap = await getDoc(docRef);
                        if (docSnap.exists()) {
                            setSysConfig(docSnap.data() as SystemConfig);
                        }
                    } catch (e) {
                        console.error("Config fetch error", e);
                    }
                };
                fetchConfig();
            } catch (err) {
                clearTimeout(timeoutId);
                console.error("Setup error", err);
                setDocs(MOCK_DOCUMENTS);
                setIsLoading(false);
            }
        } else {
            try {
                const local = localStorage.getItem('schoolos_system_config');
                if (local) setSysConfig(JSON.parse(local));
            } catch(e) {}

            setTimeout(() => {
                setDocs(MOCK_DOCUMENTS);
                setIsLoading(false);
            }, 500);
        }

        return () => {
            if(timeoutId) clearTimeout(timeoutId);
            if(unsubscribe) unsubscribe();
        }
    }, []);

    // --- Focus Deep Link Effect ---
    useEffect(() => {
        if (focusDocId && docs.length > 0) {
            const found = docs.find(d => d.id === focusDocId);
            if (found) {
                setSelectedDoc(found);
                setViewMode('DETAIL');
                setIsHighlighted(true);
                setTimeout(() => setIsHighlighted(false), 2500);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (onClearFocus) onClearFocus();
            }
        }
    }, [focusDocId, docs, onClearFocus]);

    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!sysConfig?.scriptUrl || !sysConfig?.driveFolderId) {
                alert("ไม่พบการตั้งค่า Google Drive!");
                return;
            }
            setUploadProgress('กำลังเตรียมไฟล์...');
            setIsUploading(true);
            try {
                let base64Data = await fileToBase64(file);
                const isFirstFile = tempAttachments.length === 0;
                if (file.type === 'application/pdf' && isFirstFile && docCategory === 'INCOMING') {
                    setUploadProgress('กำลังอัปโหลดไฟล์ไปที่ Google Drive และลงเลขที่รับ...');
                    const bookNumToStamp = newDoc.bookNumber || "XXX/XXXX";
                    const now = new Date();
                    const thaiDate = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
                    const thaiTime = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
                    try {
                        base64Data = await stampReceiveNumber({
                            fileBase64: base64Data,
                            bookNumber: bookNumToStamp,
                            date: thaiDate,
                            time: thaiTime,
                            schoolName: sysConfig?.schoolName || 'โรงเรียนตัวอย่างวิทยา',
                            schoolLogoBase64: sysConfig?.schoolLogoBase64
                        });
                    } catch (stampErr) { console.error("Stamp Error", stampErr); }
                } else {
                    setUploadProgress('กำลังอัปโหลดไฟล์ไปที่ Google Drive...');
                }
                const base64Content = base64Data.split(',')[1] || base64Data;
                const payload = {
                    folderId: sysConfig.driveFolderId,
                    filename: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    base64: base64Content
                };
                const response = await fetch(sysConfig.scriptUrl, { method: 'POST', body: JSON.stringify(payload) });
                const result = await response.json();
                if (result.status === 'success') {
                    setUploadProgress('อัปโหลดไฟล์เรียบร้อยแล้ว');
                    const newAtt: Attachment = {
                        id: `att_${Date.now()}`,
                        name: file.name,
                        type: 'LINK',
                        url: result.viewUrl || result.url,
                        fileType: file.type || 'application/octet-stream'
                    };
                    setTempAttachments([...tempAttachments, newAtt]);
                } else { throw new Error(result.message || 'Unknown GAS Error'); }
            } catch (err) {
                console.error("Upload Error:", err);
                alert(`เกิดข้อผิดพลาดในการอัปโหลด: ${err}`);
            } finally {
                setIsUploading(false);
                setUploadProgress('');
                e.target.value = '';
            }
        }
    };

    const handleAddLink = () => {
        if (!linkInput) return;
        let finalUrl = linkInput.trim();
        if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
        const newAtt: Attachment = {
            id: `att_${Date.now()}`,
            name: linkNameInput || 'ลิงก์เอกสาร',
            type: 'LINK',
            url: finalUrl,
            fileType: 'external-link'
        };
        setTempAttachments([...tempAttachments, newAtt]);
        setLinkInput('');
        setLinkNameInput('');
    };

    const handleRemoveAttachment = (id: string) => {
        setTempAttachments(tempAttachments.filter(a => a.id !== id));
    };

    const handleCreateDoc = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDoc.bookNumber) { alert("กรุณาระบุเลขที่รับ / เลขคำสั่ง"); return; }
        const isOrder = docCategory === 'ORDER';
        if (isOrder && selectedTeachers.length === 0) {
            if(!confirm("ท่านยังไม่ได้เลือกผู้รับปฏิบัติ (สามารถเพิ่มภายหลังได้) ยืนยันที่จะบันทึกหรือไม่?")) return;
        }
        setIsUploading(true);
        setUploadProgress(isOrder ? 'กำลังบันทึกและส่งคำสั่ง...' : 'กำลังส่งหนังสือไปหาผู้อำนวยการ...');
        const now = new Date();
        const docId = Date.now().toString();
        try {
            const sanitizedAttachments = tempAttachments.map(att => ({
                id: att.id, name: att.name || 'Unnamed', type: att.type || 'LINK', url: att.url || '', fileType: att.fileType || ''
            }));
            const created: any = {
                id: docId, schoolId: currentUser.schoolId, category: docCategory, bookNumber: newDoc.bookNumber || '', 
                title: newDoc.title || '', description: newDoc.description || '', priority: newDoc.priority || 'Normal',
                date: now.toISOString().split('T')[0], timestamp: now.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'}),
                attachments: sanitizedAttachments, acknowledgedBy: []
            };
            if (isOrder) {
                created.status = 'Distributed'; created.targetTeachers = selectedTeachers; created.from = sysConfig?.schoolName || 'โรงเรียน';
                created.directorCommand = 'สั่งการตามเอกสารแนบ'; created.directorSignatureDate = now.toLocaleString('th-TH');
            } else {
                created.status = 'PendingDirector'; created.targetTeachers = []; created.from = newDoc.from || '';
            }
            if (isConfigured && db) {
                const cleanObject = JSON.parse(JSON.stringify(created));
                await addDoc(collection(db, "documents"), cleanObject);
            } else { setDocs([created, ...docs]); }
            if (isOrder && selectedTeachers.length > 0) {
                const targetUsers = allTeachers.filter(t => selectedTeachers.includes(t.id));
                await triggerTelegramNotification(targetUsers, docId, created.title, true);
            }
            setIsUploading(false); setUploadProgress('');
            setNewDoc({ bookNumber: '', title: '', from: '', priority: 'Normal', description: '' });
            setTempAttachments([]); setLinkInput(''); setSelectedTeachers([]); setViewMode('LIST');
        } catch (e) {
            setIsUploading(false); setUploadProgress(''); console.error("Create Doc Error:", e);
            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล (" + (e as Error).message + ")");
        }
    };

    const handleDeleteDoc = async (e: React.MouseEvent, docId: string) => {
        e.stopPropagation();
        if (!confirm("ยืนยันการลบหนังสือราชการนี้? \n(การกระทำนี้จะลบถาวร)")) return;
        try {
            if (isConfigured && db) {
                const q = query(collection(db, "documents"), where("id", "==", docId));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) { const docRef = snapshot.docs[0].ref; await deleteDoc(docRef); }
            } else { setDocs(docs.filter(d => d.id !== docId)); }
        } catch (error) { console.error("Delete error", error); alert("เกิดข้อผิดพลาดในการลบ"); }
    };

    const handleDirectorAction = async (isAckOnly: boolean) => {
         if (!selectedDoc) return;
         
         const taskId = selectedDoc.id;
         const taskTitle = selectedDoc.title;
         const currentCommand = command || 'รับทราบ';
         const currentTeachers = [...selectedTeachers];
         const currentStampPage = stampPage;

         // Non-blocking: Add to background task and go back to list immediately
         const newTask: BackgroundTask = {
            id: taskId,
            title: taskTitle,
            status: 'processing',
            message: 'กำลังเตรียมไฟล์เพื่อประทับตรา...'
         };
         
         setBackgroundTasks(prev => [...prev, newTask]);
         setViewMode('LIST'); // Close detail window immediately
         
         // Perform async logic in background
         processDirectorActionInBackground(selectedDoc, isAckOnly, currentCommand, currentTeachers, currentStampPage);
         
         // Cleanup input states
         setCommand('');
         setSelectedTeachers([]);
         setStampPage(1);
    };

    const processDirectorActionInBackground = async (targetDoc: DocumentItem, isAckOnly: boolean, finalCommand: string, targetTeachers: string[], targetPage: number) => {
        const firstAtt = targetDoc.attachments[0];
        const canStamp = firstAtt && (firstAtt.fileType === 'application/pdf' || firstAtt.name.toLowerCase().endsWith('.pdf'));
        const taskId = targetDoc.id;

        try {
            let sigBase64 = sysConfig?.directorSignatureBase64;
            let schoolName = sysConfig?.schoolName;
            let logoBase64 = sysConfig?.schoolLogoBase64;
            let sigScale = sysConfig?.directorSignatureScale || 1;
            let sigYOffset = sysConfig?.directorSignatureYOffset || 0;
            const notifyToText = '';
            
            let pdfBase64: string | null = null;
            if (canStamp) {
                 const fileId = getGoogleDriveId(firstAtt.url);
                 const downloadUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : firstAtt.url;
                 let base64Original = '';
                 
                 try {
                     updateTask(taskId, { message: 'กำลังดึงไฟล์ต้นฉบับผ่าน Proxy (1/2)...' });
                     const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(downloadUrl)}`;
                     const resp = await fetch(proxyUrl);
                     if (!resp.ok) throw new Error(`Proxy Fetch failed: ${resp.status}`);
                     const blob = await resp.blob();
                     const reader = new FileReader();
                     base64Original = await new Promise<string>((resolve, reject) => {
                         reader.onload = () => resolve(reader.result as string);
                         reader.onerror = reject;
                         reader.readAsDataURL(blob);
                     });
                 } catch (proxyError) {
                     try {
                         updateTask(taskId, { message: 'กำลังลองดึงไฟล์ผ่าน Proxy สำรอง (2/2)...' });
                         const backupProxy = `https://corsproxy.io/?${encodeURIComponent(downloadUrl)}`;
                         const resp2 = await fetch(backupProxy);
                         const blob2 = await resp2.blob();
                         const reader2 = new FileReader();
                         base64Original = await new Promise<string>((resolve) => {
                             reader2.onload = () => resolve(reader2.result as string);
                             reader2.readAsDataURL(blob2);
                         });
                     } catch (finalError) {
                         throw new Error("ไม่สามารถดึงไฟล์ต้นฉบับได้ (ติด CORS)");
                     }
                 }

                 updateTask(taskId, { message: 'กำลังประทับตราและลงนาม...' });
                 pdfBase64 = await stampPdfDocument({
                    fileUrl: base64Original, fileType: 'application/pdf', notifyToText, commandText: finalCommand,
                    directorName: currentUser.name, directorPosition: currentUser.position, signatureImageBase64: sigBase64,
                    schoolName: schoolName, schoolLogoBase64: logoBase64, targetPage: targetPage,
                    onStatusChange: (msg: string) => updateTask(taskId, { message: msg }), 
                    signatureScale: sigScale, signatureYOffset: sigYOffset
                });
            } else {
                 updateTask(taskId, { message: 'สร้างใบแนบบันทึกข้อสั่งการ...' });
                 pdfBase64 = await stampPdfDocument({
                    fileUrl: '', fileType: 'new', notifyToText, commandText: finalCommand,
                    directorName: currentUser.name, directorPosition: currentUser.position, signatureImageBase64: sigBase64,
                    schoolName: schoolName, schoolLogoBase64: logoBase64, targetPage: 1,
                    onStatusChange: (msg: string) => updateTask(taskId, { message: msg }), 
                    signatureScale: sigScale, signatureYOffset: sigYOffset
                });
            }

            // Finish Signing
            updateTask(taskId, { status: 'uploading', message: 'กำลังอัปโหลดไฟล์ที่ลงนามแล้ว...' });
            
            let signedUrl = null;
            if (pdfBase64 && sysConfig?.scriptUrl && sysConfig?.driveFolderId) {
                try {
                    const bookNumDigits = targetDoc.bookNumber.replace(/\D/g, '');
                    const dateDigits = formatDateForFilename(targetDoc.date); 
                    const finalFilename = `signed_${bookNumDigits}_${dateDigits}.pdf`;
                    const base64Content = pdfBase64.split(',')[1] || pdfBase64;
                    const payload = { folderId: sysConfig.driveFolderId, filename: finalFilename, mimeType: 'application/pdf', base64: base64Content };
                    const response = await fetch(sysConfig.scriptUrl, { method: 'POST', body: JSON.stringify(payload) });
                    const result = await response.json();
                    if (result.status === 'success') { signedUrl = result.viewUrl || result.url; }
                } catch (e) { console.error("Upload signed PDF failed", e); }
            }

            const nowStr = new Date().toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
            const updateData: any = { directorCommand: finalCommand, directorSignatureDate: nowStr, targetTeachers: targetTeachers, status: 'Distributed' };
            if (signedUrl) { updateData.signedFileUrl = signedUrl; }

            if (isConfigured && db) {
                const qFind = query(collection(db, "documents"), where("id", "==", targetDoc.id));
                const snapshot = await getDocs(qFind);
                if (!snapshot.empty) {
                    await updateDoc(snapshot.docs[0].ref, updateData);
                    if (targetTeachers.length > 0) {
                        const targetUsers = allTeachers.filter(t => targetTeachers.includes(t.id));
                        await triggerTelegramNotification(targetUsers, targetDoc.id, targetDoc.title, false);
                    }
                }
            } else {
                setDocs(prev => prev.map(d => d.id === targetDoc.id ? { ...d, ...updateData } as DocumentItem : d));
            }

            updateTask(taskId, { status: 'done', message: 'ดำเนินการสั่งการสำเร็จ' });
            removeTask(taskId);

        } catch (error) {
            console.error("Background PDF Error", error);
            updateTask(taskId, { status: 'error', message: (error as Error).message });
        }
    };

    const handleTeacherAcknowledge = async (targetDocId?: string) => {
        const docId = targetDocId || selectedDoc?.id;
        if (!docId) return;
        if (isConfigured && db) {
            try {
                const qFind = query(collection(db, "documents"), where("id", "==", docId));
                const snapshot = await getDocs(qFind);
                 if (!snapshot.empty) {
                    const docRef = snapshot.docs[0].ref;
                    const docData = snapshot.docs[0].data() as DocumentItem;
                    const currentAck = docData.acknowledgedBy || [];
                    if (!currentAck.includes(currentUser.id)) {
                        await updateDoc(docRef, { acknowledgedBy: [...currentAck, currentUser.id] });
                    }
                }
            } catch(e) { console.error(e); }
        } else {
             const updatedDocs = docs.map(d => {
                if (d.id === docId && !d.acknowledgedBy.includes(currentUser.id)) {
                    return { ...d, acknowledgedBy: [...d.acknowledgedBy, currentUser.id] };
                }
                return d;
            });
            setDocs(updatedDocs);
        }
        if (!targetDocId) setViewMode('LIST');
    };
    
    const handleOpenAndAck = async (docItem: DocumentItem, url: string) => {
        if (!url) return;
        window.open(url, '_blank');
        if (!docItem.acknowledgedBy.includes(currentUser.id)) { await handleTeacherAcknowledge(docItem.id); }
    };
    
    const handleSelectAllTeachers = (checked: boolean) => {
        if (checked) { setSelectedTeachers(allTeachers.map(t => t.id)); } else { setSelectedTeachers([]); }
    };

    const filteredDocs = docs.filter(doc => {
        if (isDirector || isDocOfficer || isSystemAdmin) return true;
        return doc.status === 'Distributed' && doc.targetTeachers.includes(currentUser.id);
    });

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'Critical': return 'bg-red-100 text-red-700 border-red-200';
            case 'Urgent': return 'bg-orange-100 text-orange-700 border-orange-200';
            default: return 'bg-blue-100 text-blue-700 border-blue-200';
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'Critical': return 'ด่วนที่สุด';
            case 'Urgent': return 'ด่วน';
            case 'Normal': return 'ปกติ';
            default: return priority;
        }
    };

    const totalPages = Math.ceil(filteredDocs.length / ITEMS_PER_PAGE);
    const displayedDocs = filteredDocs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const goToPage = (p: number) => { if (p >= 1 && p <= totalPages) setCurrentPage(p); };

    const filteredTeachers = allTeachers.filter(t => 
        t.name.toLowerCase().includes(teacherSearchTerm.toLowerCase()) || 
        t.position.toLowerCase().includes(teacherSearchTerm.toLowerCase())
    );

    if (isLoading) return <div className="p-10 text-center text-slate-500"><Loader className="animate-spin inline mr-2"/> กำลังโหลดข้อมูล...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            {/* Background Task Queue UI */}
            {backgroundTasks.length > 0 && (
                <div className="fixed bottom-20 right-6 z-[60] w-72 flex flex-col gap-2 pointer-events-none">
                    {backgroundTasks.map(task => (
                        <div key={task.id} className={`p-3 rounded-xl shadow-2xl border flex flex-col gap-2 animate-slide-up pointer-events-auto transition-all ${
                            task.status === 'done' ? 'bg-emerald-50 border-emerald-200' : 
                            task.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
                        }`}>
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    {task.status === 'done' ? <CheckCircle className="text-emerald-600" size={16}/> : 
                                     task.status === 'error' ? <AlertTriangle className="text-red-600" size={16}/> : 
                                     <Loader className="animate-spin text-blue-600" size={16}/>}
                                    <span className="text-xs font-bold text-slate-700 truncate max-w-[180px]">{task.title}</span>
                                </div>
                                {task.status === 'error' && <button onClick={() => removeTask(task.id)} className="text-slate-400 hover:text-slate-600"><X size={14}/></button>}
                            </div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                <div className={`h-full transition-all duration-500 ${
                                    task.status === 'done' ? 'bg-emerald-500 w-full' : 
                                    task.status === 'error' ? 'bg-red-500 w-full' : 
                                    task.status === 'uploading' ? 'bg-orange-500 w-2/3' : 'bg-blue-500 w-1/3'
                                }`}></div>
                            </div>
                            <p className={`text-[10px] ${task.status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{task.message}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 text-white p-4 rounded-xl">
                <div>
                    <h2 className="text-xl font-bold">ระบบงานสารบรรณอิเล็กทรอนิกส์</h2>
                    <p className="text-slate-300 text-sm">ผู้ใช้งาน: <span className="font-bold text-yellow-400">{currentUser.name}</span></p>
                </div>
            </div>

            {viewMode === 'LIST' && (
                <>
                    <div className="flex justify-between items-center">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input type="text" placeholder="ค้นหาหนังสือ..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        {(isDocOfficer || isSystemAdmin) && (
                            <button onClick={handleInitCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2">
                                <FilePlus size={18} /> ลงรับ/สร้างหนังสือ
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {displayedDocs.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 bg-white rounded-xl">ไม่มีหนังสือราชการ</div>
                        ) : displayedDocs.map((docItem, index) => {
                             const isUnread = docItem.status === 'Distributed' && docItem.targetTeachers.includes(currentUser.id) && !docItem.acknowledgedBy.includes(currentUser.id);
                             const isAcknowledged = docItem.status === 'Distributed' && docItem.acknowledgedBy.includes(currentUser.id);
                             const isOrder = docItem.category === 'ORDER';
                             const isNewForDirector = isDirector && docItem.status === 'PendingDirector';
                             
                             // Check if this doc is currently being processed in background
                             const backgroundTask = backgroundTasks.find(t => t.id === docItem.id);
                             const isProcessing = backgroundTask && (backgroundTask.status === 'processing' || backgroundTask.status === 'uploading');

                             return (
                                <div key={docItem.id}
                                    className={`p-4 rounded-xl shadow-sm border transition-all relative overflow-hidden group
                                        ${docItem.status === 'PendingDirector' && isDirector ? 'border-l-4 border-l-yellow-400 shadow-md' : 'border-slate-200'}
                                        ${index % 2 === 1 ? 'bg-blue-50' : 'bg-white'}
                                        ${isProcessing ? 'opacity-70 pointer-events-none' : ''}
                                    `}
                                >
                                    {isNewForDirector && !isProcessing && (
                                        <div className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-bl-lg shadow-md z-20 flex items-center gap-1 animate-pulse">
                                            <Bell size={12} className="fill-current"/> หนังสือเข้าใหม่ !
                                        </div>
                                    )}

                                    {isProcessing && (
                                        <div className="absolute top-0 left-0 w-full h-full bg-blue-500/5 z-10 flex items-center justify-center pointer-events-none">
                                            <div className="bg-white/80 px-4 py-2 rounded-full shadow-lg border border-blue-100 flex items-center gap-3">
                                                <Loader size={18} className="animate-spin text-blue-600" />
                                                <span className="text-xs font-bold text-blue-700">กำลังประมวลผล... ({backgroundTask.message})</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex justify-between items-start cursor-pointer" onClick={() => { setSelectedDoc(docItem); setViewMode('DETAIL'); }}>
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-lg ${docItem.status === 'Distributed' ? (isOrder ? 'bg-indigo-100 text-indigo-600' : 'bg-green-50 text-green-600') : 'bg-slate-100 text-slate-500'}`}>
                                                {isOrder ? <Megaphone size={24}/> : <FileText size={24} />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${isOrder ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                                                        {isOrder ? 'เลขที่คำสั่ง' : 'รับที่'}: {docItem.bookNumber}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getPriorityColor(docItem.priority)}`}>
                                                        {getPriorityLabel(docItem.priority)}
                                                    </span>
                                                    {isUnread && (
                                                        <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded-full animate-pulse font-bold shadow-sm">
                                                            NEW
                                                        </span>
                                                    )}
                                                    {isAcknowledged && (
                                                        <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold border border-green-200">
                                                            รับทราบแล้ว
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{docItem.title}</h3>
                                                <p className="text-sm text-slate-500 line-clamp-1">{docItem.description}</p>
                                                
                                                {(isDirector || isDocOfficer) && docItem.status === 'Distributed' && (
                                                    <div className="mt-2 text-xs font-bold text-green-600 flex items-center gap-1">
                                                        <CheckCircle size={12} />
                                                        รับทราบแล้ว {docItem.acknowledgedBy.length}/{docItem.targetTeachers.length} ท่าน
                                                        {docItem.acknowledgedBy.length === docItem.targetTeachers.length && <span className="text-green-500 ml-1">(ครบถ้วน)</span>}
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                                    <span>จาก: {docItem.from}</span>
                                                    <span>{docItem.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {!isNewForDirector && docItem.status === 'PendingDirector' && (
                                                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                                    <Users size={12} /> รอเกษียณ
                                                </span>
                                            )}
                                            {docItem.attachments && docItem.attachments.length > 0 && (
                                                 <span className="text-xs text-slate-400 flex items-center gap-1">
                                                    <LinkIcon size={12}/> {docItem.attachments.length} ไฟล์
                                                 </span>
                                            )}
                                            {(isSystemAdmin || (isDocOfficer && (docItem.status === 'PendingDirector' || isOrder))) && (
                                                <button onClick={(e: any) => handleDeleteDoc(e, docItem.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors z-10">
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {(!isDirector) && docItem.status === 'Distributed' && (
                                        <div className="mt-4 pt-3 border-t border-slate-100">
                                            <p className="text-xs text-slate-500 mb-2 font-bold">เอกสารแนบ (คลิกเพื่อเปิดและรับทราบ)</p>
                                            <div className="flex flex-col gap-2">
                                                {docItem.signedFileUrl && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleOpenAndAck(docItem, docItem.signedFileUrl!); }} className="w-full flex items-center justify-between p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg group transition-all">
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-white p-2 rounded-full text-emerald-600 shadow-sm"><FileCheck size={20}/></div>
                                                            <div className="text-left">
                                                                <div className="font-bold text-emerald-900 text-sm">เอกสารฉบับที่ 1 (บันทึกข้อสั่งการ)</div>
                                                                <div className="text-[10px] text-emerald-500">{`stamp${docItem.bookNumber.replace(/\D/g,'')}${formatDateForFilename(docItem.date)}.pdf`}</div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                )}
                                                {docItem.attachments.map((att, idx) => {
                                                    const displayIndex = docItem.signedFileUrl ? idx + 2 : idx + 1;
                                                    return (
                                                        <button key={idx} onClick={(e) => { e.stopPropagation(); handleOpenAndAck(docItem, att.url); }} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg group transition-all">
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-white p-2 rounded-full shadow-sm">{getFileIcon(att.name, att.type as 'FILE'|'LINK', 20)}</div>
                                                                <div className="text-left"><div className="font-bold text-slate-700 text-sm">เอกสารฉบับที่ {displayIndex}</div><div className="text-[10px] text-slate-400 truncate max-w-[200px]">{att.name}</div></div>
                                                            </div>
                                                            <div title="คลิกเพื่อเปิด"><MousePointerClick size={16} className="text-slate-300"/></div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {docItem.acknowledgedBy.includes(currentUser.id) && (
                                                <div className="mt-2 flex items-center justify-center gap-1 text-green-600 font-bold text-xs bg-green-50 px-2 py-1 rounded-full border border-green-100">
                                                    <CheckCircle size={12}/> ท่านได้รับทราบหนังสือฉบับนี้แล้ว
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                             );
                        })}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 mt-6">
                            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"><ChevronLeft size={20}/></button>
                            <span className="text-sm font-medium text-slate-600">หน้า {currentPage} / {totalPages}</span>
                            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"><ChevronRight size={20}/></button>
                        </div>
                    )}
                </>
            )}

            {viewMode === 'CREATE' && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 max-w-4xl mx-auto relative">
                    {isUploading && (
                        <div className="absolute inset-0 bg-white/90 z-50 flex items-center justify-center flex-col rounded-xl">
                            <Loader className="animate-spin text-blue-600 mb-2" size={40} />
                            <p className="font-bold text-slate-700">{uploadProgress}</p>
                            <p className="text-sm text-slate-500">กรุณาอย่าปิดหน้าต่าง</p>
                        </div>
                    )}
                    <div className="mb-6 border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h3 className="text-xl font-bold text-slate-800">ลงทะเบียนรับ/สร้างหนังสือ</h3>
                        <div className="bg-slate-100 p-1 rounded-lg flex shadow-inner">
                            <button type="button" onClick={() => setDocCategory('INCOMING')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${docCategory === 'INCOMING' ? 'bg-white text-blue-600 shadow' : 'text-slate-500 hover:text-slate-700'}`}><FileBadge size={16}/> ลงรับหนังสือภายนอก</button>
                            <button type="button" onClick={() => setDocCategory('ORDER')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${docCategory === 'ORDER' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500 hover:text-slate-700'}`}><Megaphone size={16}/> บันทึกคำสั่งปฏิบัติราชการ</button>
                        </div>
                    </div>
                    <form onSubmit={handleCreateDoc} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">{docCategory === 'ORDER' ? 'เลขที่คำสั่ง' : 'เลขที่รับ (แก้ไขได้)'}</label>
                                    <input required type="text" value={newDoc.bookNumber} onChange={e => setNewDoc({...newDoc, bookNumber: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-slate-700"/>
                                </div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">เรื่อง</label><input required type="text" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    {docCategory === 'INCOMING' && (<div><label className="block text-sm font-medium text-slate-700 mb-1">จาก</label><input required type="text" value={newDoc.from} onChange={e => setNewDoc({...newDoc, from: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>)}
                                    <div className={docCategory === 'ORDER' ? 'col-span-2' : ''}><label className="block text-sm font-medium text-slate-700 mb-1">ความเร่งด่วน</label><select value={newDoc.priority} onChange={e => setNewDoc({...newDoc, priority: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"><option value="Normal">ปกติ</option><option value="Urgent">ด่วน</option><option value="Critical">ด่วนที่สุด</option></select></div>
                                </div>
                                <div><label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label><textarea rows={3} value={newDoc.description} onChange={e => setNewDoc({...newDoc, description: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea></div>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><UploadCloud size={18}/> อัปโหลดไฟล์</h4>
                                    {tempAttachments.length > 0 && (<div className="bg-white rounded border border-slate-200 mb-4 divide-y">{tempAttachments.map(att => (<div key={att.id} className="p-2 flex justify-between items-center text-sm"><div className="flex items-center gap-2 overflow-hidden">{getFileIcon(att.name, att.type as 'FILE'|'LINK', 16)}<span className="truncate">{att.name}</span></div><button type="button" onClick={() => handleRemoveAttachment(att.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button></div>))}</div>)}
                                    <div><input type="file" accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar" onChange={handleAddFile} disabled={!sysConfig?.scriptUrl} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"/></div>
                                    <div className="text-center text-xs text-slate-400 font-bold my-2">- หรือ -</div>
                                    <div className="flex flex-col gap-2"><input type="text" placeholder="ชื่อเอกสาร (ถ้ามี)" value={linkNameInput} onChange={e => setLinkNameInput(e.target.value)} className="w-full px-3 py-2 border rounded text-sm focus:ring-1 outline-none"/><div className="flex gap-2"><input type="text" placeholder="วางลิงก์ https://..." value={linkInput} onChange={e => setLinkInput(e.target.value)} className="w-full px-3 py-2 border rounded text-sm focus:ring-1 outline-none"/><button type="button" onClick={handleAddLink} className="bg-slate-600 text-white px-3 py-2 rounded hover:bg-slate-700"><Plus size={16}/></button></div></div>
                                </div>
                                {docCategory === 'ORDER' && (
                                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200 flex-1 flex flex-col">
                                        <div className="flex justify-between items-center mb-2">
                                            <h4 className="font-bold text-indigo-900 flex items-center gap-2"><Users size={18}/> ผู้รับปฏิบัติ (ส่งทันที)</h4>
                                            <div className="flex items-center gap-2"><input type="checkbox" checked={selectedTeachers.length === allTeachers.length && allTeachers.length > 0} onChange={(e) => handleSelectAllTeachers(e.target.checked)} className="rounded text-indigo-600 w-4 h-4 cursor-pointer"/><span className="text-xs text-indigo-800 font-bold">เลือกทั้งหมด</span></div>
                                        </div>
                                        <div className="bg-white border border-indigo-100 rounded-lg p-2 overflow-y-auto max-h-[200px] shadow-inner">
                                            {allTeachers.map(t => (<label key={t.id} className="flex items-center gap-2 p-2 hover:bg-indigo-50 rounded cursor-pointer border-b border-slate-50 last:border-0"><input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={(e) => { if (e.target.checked) setSelectedTeachers([...selectedTeachers, t.id]); else setSelectedTeachers(selectedTeachers.filter(id => id !== t.id)); }} className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"/><span className="text-sm text-slate-700">{t.name}</span>{t.telegramChatId && <Send size={12} className="text-blue-400 ml-auto"/>}</label>))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4 border-t mt-4"><button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-3 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 font-bold">ยกเลิก</button><button type="submit" className={`flex-1 py-3 text-white rounded-lg hover:brightness-90 font-bold shadow-md flex items-center justify-center gap-2 ${docCategory === 'ORDER' ? 'bg-indigo-600' : 'bg-blue-600'}`}>{docCategory === 'ORDER' ? <Send size={20}/> : <Save size={20}/>} {docCategory === 'ORDER' ? 'บันทึกและส่งทันที' : 'บันทึกและส่งให้ ผอ.'}</button></div>
                    </form>
                </div>
            )}

            {viewMode === 'DETAIL' && selectedDoc && (
                <div className={`max-w-4xl mx-auto space-y-6 ${isHighlighted ? 'ring-4 ring-blue-300 rounded-xl transition-all duration-500' : ''}`}>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-200 rounded-full text-slate-600">
                            <ArrowLeft size={24}/>
                        </button>
                        <h2 className="text-2xl font-bold text-slate-800">รายละเอียดหนังสือราชการ</h2>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><LinkIcon size={20}/> เอกสารแนบ (แตะเพื่อเปิด)</h3>
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-2 text-sm text-blue-800"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><p>การคลิกเปิดอ่านไฟล์เอกสาร จะถือว่าท่าน <strong>"รับทราบ"</strong> หนังสือฉบับนี้โดยอัตโนมัติ</p></div>
                        <div className="flex flex-col gap-3">
                            {selectedDoc.attachments.map((att, idx) => {
                                const isDistributed = selectedDoc.status === 'Distributed';
                                const showSigned = isDistributed && idx === 0 && selectedDoc.signedFileUrl;
                                const targetUrl = showSigned ? selectedDoc.signedFileUrl : att.url;
                                const fileLabel = `เอกสารฉบับที่ ${idx + 1}${showSigned ? ' (ลงนามแล้ว)' : ''}`;
                                return (
                                    <button key={idx} onClick={() => handleOpenAndAck(selectedDoc, targetUrl || '')} className={`w-full p-4 text-white rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-between group ${showSigned ? 'bg-emerald-600 hover:bg-emerald-700 border-2 border-emerald-400' : (selectedDoc.category === 'ORDER' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700')}`}>
                                        <div className="flex items-center gap-4"><div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">{showSigned ? <CheckCircle size={28}/> : getFileIcon(att.name, att.type as 'FILE'|'LINK', 28, false)}</div><div className="text-left"><div className="font-bold text-lg">{fileLabel}</div><div className="text-sm opacity-90 truncate max-w-[200px] md:max-w-md">{att.name}</div></div></div><div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-medium"><MousePointerClick size={14}/> แแตะเปิด</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><FileText size={20}/> รายละเอียดหนังสือ</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                             <div className="flex flex-col"><span className="text-slate-500 text-xs">เรื่อง</span><span className="font-bold text-lg text-slate-800">{selectedDoc.title}</span></div>
                             <div className="flex flex-col"><span className="text-slate-500 text-xs">{selectedDoc.category === 'ORDER' ? 'เลขที่คำสั่ง' : 'เลขที่รับ'}</span><span className="font-mono font-bold text-slate-700">{selectedDoc.bookNumber}</span></div>
                             <div className="flex flex-col"><span className="text-slate-500 text-xs">จากหน่วยงาน</span><span className="font-medium text-slate-700">{selectedDoc.from}</span></div>
                             <div className="flex flex-col"><span className="text-slate-500 text-xs">ความเร่งด่วน</span><div><span className={`px-2 py-0.5 rounded text-xs border ${getPriorityColor(selectedDoc.priority)}`}>{getPriorityLabel(selectedDoc.priority)}</span></div></div>
                             <div className="col-span-1 md:col-span-2 flex flex-col"><span className="text-slate-500 text-xs">รายละเอียดเพิ่มเติม</span><p className="text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed mt-1">{selectedDoc.description}</p></div>
                             <div className="flex flex-col"><span className="text-slate-500 text-xs">วันที่รับ/บันทึก</span><span className="text-slate-700">{selectedDoc.date} เวลา {selectedDoc.timestamp}</span></div>
                             <div className="flex flex-col"><span className="text-slate-500 text-xs">สถานะ</span><span className={`font-bold ${selectedDoc.status === 'Distributed' ? 'text-green-600' : 'text-yellow-600'}`}>{selectedDoc.status === 'Distributed' ? 'สั่งการแล้ว' : 'รอเกษียณ'}</span></div>
                        </div>
                    </div>

                    {isDirector && selectedDoc.status === 'PendingDirector' && selectedDoc.category !== 'ORDER' && (
                        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-sm animate-fade-in">
                            <div className="flex items-center gap-2 mb-4 text-blue-900 border-b border-blue-200 pb-2">
                                <PenTool size={20}/>
                                <h3 className="font-bold text-lg">ส่วนเกษียณหนังสือ / สั่งการ</h3>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-blue-900 mb-2">ข้อความสั่งการ</label>
                                    <textarea 
                                        value={command} 
                                        onChange={(e) => setCommand(e.target.value)}
                                        placeholder="ระบุข้อความสั่งการ..." 
                                        className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none shadow-sm"
                                    ></textarea>
                                </div>
                                
                                <div className="bg-white rounded-xl border border-blue-100 p-4 shadow-sm">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-3">
                                        <label className="block text-sm font-bold text-blue-900 flex items-center gap-2">
                                            <Users size={18}/> เลือกผู้รับปฏิบัติ / แจ้งเตือน
                                        </label>
                                        
                                        <div className="flex gap-2 w-full md:w-auto">
                                            <div className="relative flex-1 md:w-64">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                                                <input 
                                                    type="text" 
                                                    placeholder="ค้นหาชื่อครู..." 
                                                    value={teacherSearchTerm}
                                                    onChange={(e) => setTeacherSearchTerm(e.target.value)}
                                                    className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-slate-50"
                                                />
                                            </div>
                                            <button 
                                                onClick={() => setSelectedTeachers(selectedTeachers.length === allTeachers.length ? [] : allTeachers.map(t => t.id))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedTeachers.length === allTeachers.length ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                                            >
                                                {selectedTeachers.length === allTeachers.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                                        {filteredTeachers.map(t => {
                                            const isSelected = selectedTeachers.includes(t.id);
                                            return (
                                                <div 
                                                    key={t.id} 
                                                    onClick={() => {
                                                        if (isSelected) setSelectedTeachers(selectedTeachers.filter(id => id !== t.id));
                                                        else setSelectedTeachers([...selectedTeachers, t.id]);
                                                    }}
                                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all active:scale-95 ${
                                                        isSelected 
                                                            ? 'bg-blue-50 border-blue-400 shadow-sm ring-1 ring-blue-400' 
                                                            : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-blue-300'
                                                    }`}
                                                >
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-300'}`}>
                                                        {isSelected && <CheckCircle size={14}/>}
                                                    </div>
                                                    <div className="flex-1 overflow-hidden">
                                                        <div className={`text-sm font-bold truncate ${isSelected ? 'text-blue-800' : 'text-slate-700'}`}>{t.name}</div>
                                                        <div className="text-xs text-slate-500 truncate">{t.position}</div>
                                                    </div>
                                                    {t.telegramChatId && <div title="แจ้งเตือนทาง Telegram"><Send size={14} className="text-blue-400" /></div>}
                                                </div>
                                            );
                                        })}
                                        {filteredTeachers.length === 0 && (
                                            <div className="col-span-full text-center py-4 text-slate-400 text-sm">ไม่พบรายชื่อที่ค้นหา</div>
                                        )}
                                    </div>
                                    
                                    <div className="mt-2 text-right text-xs text-slate-500 font-bold">
                                        เลือกแล้ว {selectedTeachers.length} ท่าน
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-blue-100 shadow-sm">
                                        <span className="text-xs font-bold text-slate-500">หน้าที่จะประทับตรา:</span>
                                        <button onClick={() => setStampPage(Math.max(1, stampPage - 1))} className="p-1 bg-slate-100 rounded hover:bg-slate-200"><ChevronLeft size={16}/></button>
                                        <span className="font-bold text-blue-800 text-lg w-8 text-center">{stampPage}</span>
                                        <button onClick={() => setStampPage(stampPage + 1)} className="p-1 bg-slate-100 rounded hover:bg-slate-200"><Plus size={16}/></button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button onClick={() => handleDirectorAction(true)} className="flex-1 py-3 bg-white border-2 border-green-600 text-green-600 rounded-xl hover:bg-green-50 font-bold flex items-center justify-center gap-2 transition-all shadow-sm">
                                    <FileCheck size={20}/> รับทราบ (ไม่ต้องพิมพ์)
                                </button>
                                <button onClick={() => handleDirectorAction(false)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 font-bold flex items-center justify-center gap-2 transition-all hover:shadow-xl">
                                    <PenTool size={20}/> ลงนามสั่งการ
                                </button>
                            </div>
                            <div className="mt-2 text-center text-xs text-blue-400">ระบบจะประทับตราที่มุมขวาล่างของหน้าที่เลือก</div>
                        </div>
                    )}

                    {!isDirector && selectedDoc.status === 'Distributed' && !selectedDoc.acknowledgedBy.includes(currentUser.id) && selectedDoc.targetTeachers.includes(currentUser.id) && (
                        <div className="bg-orange-50 p-6 rounded-xl border border-orange-200 shadow-sm animate-fade-in text-center">
                            <h4 className="font-bold text-orange-800 flex items-center justify-center gap-2 text-lg mb-2"><Eye size={24}/> ยืนยันการรับทราบ</h4>
                            <p className="text-orange-700 mb-6">กรุณาอ่านรายละเอียดและกดปุ่มรับทราบเพื่อยืนยันการรับหนังสือ</p>
                            <button onClick={() => handleTeacherAcknowledge()} className="px-8 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mx-auto"><CheckSquare size={20}/> รับทราบ / อ่านแล้ว</button>
                        </div>
                    )}
                     {selectedDoc.acknowledgedBy.includes(currentUser.id) && (
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-green-800 flex items-center justify-center gap-2 font-bold shadow-sm"><CheckSquare size={24}/> ท่านได้รับทราบหนังสือฉบับนี้แล้ว</div>
                     )}
                     {(isDirector || isDocOfficer) && selectedDoc.status === 'Distributed' && (
                         <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                             <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Users size={18}/> การรับทราบ ({selectedDoc.acknowledgedBy.length}/{selectedDoc.targetTeachers.length})</h4>
                             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                 {selectedDoc.targetTeachers.map(tid => {
                                     const t = allTeachers.find(at => at.id === tid);
                                     const isRead = selectedDoc.acknowledgedBy.includes(tid);
                                     return (
                                         <div key={tid} className={`flex items-center gap-2 p-2 rounded-lg border ${isRead ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}>
                                             {isRead ? <CheckCircle size={16} className="text-green-500"/> : <div className="w-4 h-4 rounded-full border-2 border-slate-200"></div>}
                                             <span className={`text-sm truncate ${isRead ? 'text-green-800 font-medium' : 'text-slate-400'}`}>{t?.name || tid}</span>
                                         </div>
                                     )
                                 })}
                             </div>
                         </div>
                     )}
                </div>
            )}
        </div>
    );
};

export default DocumentsSystem;