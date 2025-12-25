
import React, { useState, useEffect } from 'react';
import { DocumentItem, Teacher, Attachment, SystemConfig, School } from '../types';
import { 
    Search, FileText, Users, PenTool, CheckCircle, FilePlus, Eye, 
    CheckSquare, Loader, Link as LinkIcon, Trash2, File as FileIcon, 
    ExternalLink, Plus, UploadCloud, AlertTriangle, Monitor, FileCheck, 
    ArrowLeft, Send, MousePointerClick, ChevronLeft, ChevronRight, 
    FileBadge, Megaphone, Save, FileSpreadsheet, FileArchive, 
    Image as ImageIcon, Bell, X, Info, Layers, Zap, FastForward, 
    UserCheck, ChevronsLeft, ChevronsRight 
} from 'lucide-react';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';
import { stampPdfDocument, stampReceiveNumber } from '../utils/pdfStamper';
import { sendTelegramMessage } from '../utils/telegram';

interface BackgroundTask {
    id: string;
    title: string;
    status: 'processing' | 'uploading' | 'done' | 'error';
    message: string;
    notified?: boolean; 
}

interface DocumentsSystemProps {
    currentUser: Teacher;
    currentSchool: School;
    allTeachers: Teacher[];
    focusDocId?: string | null;
    onClearFocus?: () => void;
}

const DocumentsSystem: React.FC<DocumentsSystemProps> = ({ currentUser, currentSchool, allTeachers, focusDocId, onClearFocus }) => {
    // State
    const [docs, setDocs] = useState<DocumentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
    const [showTaskQueue, setShowTaskQueue] = useState(false);
    const [lastCompletedTaskId, setLastCompletedTaskId] = useState<string | null>(null);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    
    // System Config State
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    
    const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
    const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);

    // Form State (Admin)
    const [docCategory, setDocCategory] = useState<'INCOMING' | 'ORDER'>('INCOMING');
    const [newDoc, setNewDoc] = useState({ 
        bookNumber: '', 
        title: '', 
        from: '', 
        priority: 'Normal' as any, 
        description: '' 
    });
    
    // Attachment Management State
    const [tempAttachments, setTempAttachments] = useState<Attachment[]>([]);
    const [linkInput, setLinkInput] = useState('');
    const [linkNameInput, setLinkNameInput] = useState('');
    
    // Upload Progress State
    const [uploadProgress, setUploadProgress] = useState<string>('');

    // Action State
    const [command, setCommand] = useState('');
    const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
    const [stampPage, setStampPage] = useState<number>(1);
    const [assignedViceDirId, setAssignedViceDirId] = useState<string>(''); 
    const [teacherSearchTerm, setTeacherSearchTerm] = useState('');

    // --- Roles Checking ---
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isViceDirector = currentUser.roles.includes('VICE_DIRECTOR'); 
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');

    const teachersInSchool = allTeachers.filter(t => 
        t.schoolId === currentUser.schoolId && 
        !t.roles.includes('DIRECTOR')
    );

    const viceDirectors = teachersInSchool.filter(t => 
        t.position.includes('รองผู้อำนวยการ') || t.roles.includes('VICE_DIRECTOR')
    );

    // Reset action state when switching documents or views
    useEffect(() => {
        setCommand('');
        setSelectedTeachers([]);
        setStampPage(1);
        setAssignedViceDirId('');
        setTeacherSearchTerm('');
    }, [selectedDoc?.id, viewMode]);

    const activeTasks = backgroundTasks.filter(t => t.status === 'processing' || t.status === 'uploading');
    const doneTasksCount = backgroundTasks.filter(t => t.status === 'done').length;
    const latestTask = backgroundTasks[backgroundTasks.length - 1];

    const updateTask = (id: string, updates: Partial<BackgroundTask>) => {
        setBackgroundTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    };

    const removeTask = (id: string) => {
        setBackgroundTasks(prev => prev.filter(t => t.id !== id));
    };

    const autoRemoveDoneTask = (id: string) => {
        setTimeout(() => {
            setBackgroundTasks(prev => prev.filter(t => t.id !== id));
        }, 8000); 
    };

    const parseBookNumberForSort = (bn: string) => {
        if (!bn) return { num: 0, year: 0 };
        const parts = bn.split('/');
        return {
            num: parseInt(parts[0]) || 0,
            year: parseInt(parts[1]) || 0
        };
    };

    const mapDocFromDb = (d: any): DocumentItem => ({
        id: d.id.toString(),
        schoolId: d.school_id,
        category: d.category,
        bookNumber: d.book_number,
        title: d.title,
        description: d.description,
        from: d.from,
        date: d.date,
        timestamp: d.timestamp,
        priority: d.priority,
        attachments: d.attachments || [],
        status: d.status,
        directorCommand: d.director_command,
        directorSignatureDate: d.director_signature_date,
        signedFileUrl: d.signed_file_url,
        assignedViceDirectorId: d.assigned_vice_director_id,
        viceDirectorCommand: d.vice_director_command,
        viceDirectorSignatureDate: d.vice_director_signature_date,
        targetTeachers: d.target_teachers || [],
        acknowledgedBy: d.acknowledged_by || []
    });

    const mapDocToDb = (d: any) => ({
        school_id: d.schoolId,
        category: d.category,
        book_number: d.bookNumber,
        title: d.title,
        description: d.description,
        from: d.from,
        date: d.date,
        timestamp: d.timestamp,
        priority: d.priority,
        attachments: d.attachments,
        status: d.status,
        director_command: d.directorCommand,
        director_signature_date: d.directorSignatureDate,
        signed_file_url: d.signedFileUrl,
        assigned_vice_director_id: d.assignedViceDirectorId,
        vice_director_command: d.viceDirectorCommand,
        vice_director_signature_date: d.viceDirectorSignatureDate,
        target_teachers: d.targetTeachers,
        acknowledged_by: d.acknowledgedBy
    });

    useEffect(() => {
        const newlyDoneTask = backgroundTasks.find(t => t.status === 'done' && !t.notified);
        if (newlyDoneTask) {
            updateTask(newlyDoneTask.id, { notified: true });
            setLastCompletedTaskId(newlyDoneTask.id);
            setTimeout(() => setLastCompletedTaskId(null), 3000); 
            try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
                audio.volume = 0.3;
                audio.play().catch(e => {});
            } catch(e) {}
            autoRemoveDoneTask(newlyDoneTask.id);
            fetchDocs();
        }
    }, [backgroundTasks]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (activeTasks.length > 0) {
                e.preventDefault();
                e.returnValue = "ระบบกำลังบันทึกข้อมูลและอัปโหลดไฟล์ไปที่ Google Drive กรุณารอสักครู่เพื่อป้องกันข้อมูลสูญหาย";
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [activeTasks]);

    const fetchDocs = async () => {
        if (!isSupabaseConfigured || !supabase) return;
        const { data, error } = await supabase!
            .from('documents')
            .select('*')
            .eq('school_id', currentUser.schoolId);
        
        if (!error && data) {
            const mapped = data.map(mapDocFromDb);
            mapped.sort((a, b) => {
                const pA = parseBookNumberForSort(a.bookNumber);
                const pB = parseBookNumberForSort(b.bookNumber);
                if (pB.year !== pA.year) return pB.year - pA.year;
                return pB.num - pA.num;
            });
            setDocs(mapped);
            if (selectedDoc) {
                const updatedSelected = mapped.find(d => d.id === selectedDoc.id);
                if (updatedSelected) setSelectedDoc(updatedSelected);
            }
        }
        setIsLoading(false);
    };

    useEffect(() => {
        const loadInitial = async () => {
            setIsLoading(true);
            await fetchDocs();
            if (isSupabaseConfigured && supabase) {
                const { data: configData } = await supabase!
                    .from('school_configs')
                    .select('*')
                    .eq('school_id', currentUser.schoolId)
                    .single();
                if (configData) {
                    setSysConfig({
                        driveFolderId: configData.drive_folder_id || '',
                        scriptUrl: configData.script_url || '',
                        telegramBotToken: configData.telegram_bot_token || '',
                        appBaseUrl: configData.app_base_url || '',
                        officialGarudaBase64: configData.official_garuda_base_64,
                        directorSignatureBase64: configData.director_signature_base_64,
                        directorSignatureScale: configData.director_signature_scale || 1.0,
                        directorSignatureYOffset: configData.director_signature_y_offset || 0,
                        schoolName: currentSchool.name 
                    });
                }
            }
        };
        loadInitial();
        let channel: any;
        if (isSupabaseConfigured && supabase) {
            channel = supabase!
                .channel('documents_realtime')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'documents',
                    filter: `school_id=eq.${currentUser.schoolId}`
                }, () => { fetchDocs(); })
                .subscribe();
        }
        return () => { if (channel) supabase!.removeChannel(channel); };
    }, [currentUser.schoolId, currentSchool.name]);

    const getGoogleDriveId = (url: string) => {
        const patterns = [/drive\.google\.com\/file\/d\/([-_\w]+)/, /drive\.google\.com\/open\?id=([-_\w]+)/];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) return match[1];
        }
        return null;
    };

    const getCleanBase64 = (base64Str: string) => {
        if (!base64Str) return '';
        const parts = base64Str.split(',');
        const content = parts.length > 1 ? parts[1] : parts[0];
        return content.replace(/\s/g, ''); 
    };

    const triggerTelegramNotification = async (teachers: Teacher[], docId: string, title: string, isOrder: boolean) => {
        if (!sysConfig?.telegramBotToken) return;
        const baseUrl = sysConfig.appBaseUrl || window.location.origin;
        const deepLink = `${baseUrl}?view=DOCUMENTS&id=${docId}`;
        const message = isOrder 
            ? `📣 <b>มีคำสั่งปฏิบัติราชการใหม่</b>\nเรื่อง: ${title}\n`
            : `📢 <b>มีหนังสือราชการเวียน/สั่งการ</b>\nเรื่อง: ${title}\n`;
        teachers.forEach(t => {
            if (t.telegramChatId) sendTelegramMessage(sysConfig.telegramBotToken!, t.telegramChatId, message, deepLink);
        });
    };

    const processActionInBackground = async (targetDoc: DocumentItem, finalCommand: string, targetTeachers: string[], targetPage: number, nextStatus: any, viceId?: string) => {
        const taskId = targetDoc.id;
        if (!isSupabaseConfigured || !supabase) return;
        
        try {
            const isActorVice = targetDoc.status === 'PendingViceDirector' || (targetDoc.assignedViceDirectorId === currentUser.id);
            const stampAlignment = isActorVice ? 'left' : 'right';
            
            const firstAtt = targetDoc.attachments[0];
            const baseFile = targetDoc.signedFileUrl || (firstAtt?.fileType === 'application/pdf' ? firstAtt.url : null);
            let pdfBase64 = null;

            if (baseFile) {
                updateTask(taskId, { message: 'กำลังเชื่อมต่อไฟล์ต้นฉบับ...' });
                const fileId = getGoogleDriveId(baseFile);
                const dlUrl = fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : baseFile;
                
                let blob;
                try {
                    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(dlUrl)}`;
                    const resp = await fetch(proxyUrl);
                    if (!resp.ok) throw new Error("Proxy Access Error");
                    blob = await resp.blob();
                } catch (proxyError) {
                    updateTask(taskId, { message: 'ระบบสำรอง: กำลังดึงไฟล์ตรง...' });
                    const directResp = await fetch(dlUrl);
                    if (!directResp.ok) throw new Error("ไม่สามารถโหลดไฟล์ได้ (ตรวจสอบการแชร์ไฟล์)");
                    blob = await directResp.blob();
                }

                const base64Original = await new Promise<string>((res, rej) => {
                    const r = new FileReader(); 
                    r.onload = () => res(r.result as string); 
                    r.onerror = () => rej(new Error("File Read Failed"));
                    r.readAsDataURL(blob);
                });
                
                updateTask(taskId, { message: 'กำลังประทับตราดิจิทัล...' });
                pdfBase64 = await stampPdfDocument({
                    fileUrl: base64Original, fileType: 'application/pdf', notifyToText: '', commandText: finalCommand,
                    directorName: currentUser.name, 
                    directorPosition: currentUser.position, 
                    signatureImageBase64: currentUser.signatureBase64 || sysConfig?.directorSignatureBase64,
                    schoolName: currentSchool.name, 
                    schoolLogoBase64: sysConfig?.schoolLogoBase64, targetPage, 
                    onStatusChange: (m) => updateTask(taskId, { message: m }),
                    signatureScale: sysConfig?.directorSignatureScale || 1, 
                    signatureYOffset: sysConfig?.directorSignatureYOffset || 0,
                    alignment: stampAlignment
                });
            } else {
                updateTask(taskId, { message: 'กำลังสร้างใบสั่งการ...' });
                pdfBase64 = await stampPdfDocument({
                    fileUrl: '', fileType: 'new', notifyToText: '', commandText: finalCommand,
                    directorName: currentUser.name, 
                    directorPosition: currentUser.position, 
                    signatureImageBase64: currentUser.signatureBase64 || sysConfig?.directorSignatureBase64,
                    schoolName: currentSchool.name, 
                    schoolLogoBase64: sysConfig?.schoolLogoBase64, targetPage: 1,
                    onStatusChange: (m) => updateTask(taskId, { message: m }),
                    alignment: stampAlignment
                });
            }

            let signedUrl = null;
            if (pdfBase64 && sysConfig?.scriptUrl) {
                updateTask(taskId, { status: 'uploading', message: 'กำลังบันทึกไฟล์ (ชื่อตามเลขที่หนังสือ)...' });
                const safeBookNumber = targetDoc.bookNumber.replace(/[\\/:*?"<>|]/g, '-');
                const finalFileName = `${safeBookNumber}_signed.pdf`;

                const payload = { 
                    folderId: sysConfig.driveFolderId, 
                    fileName: finalFileName, 
                    mimeType: 'application/pdf', 
                    fileData: getCleanBase64(pdfBase64) 
                };

                try {
                    const upRespWithUrl = await fetch(sysConfig.scriptUrl, { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                        body: JSON.stringify(payload),
                        redirect: 'follow'
                    });
                    
                    if (!upRespWithUrl.ok) throw new Error(`GAS Error: ${upRespWithUrl.status}`);
                    
                    const upRes = await upRespWithUrl.json();
                    if (upRes.status === 'success') {
                        signedUrl = upRes.viewUrl || upRes.url;
                    } else {
                        throw new Error(upRes.message || "GAS Failed");
                    }
                } catch (fetchErr: any) {
                    console.error("GAS Signing Upload Error:", fetchErr);
                    throw new Error(`การบันทึกไฟล์ลง Drive ล้มเหลว (${fetchErr.message})`);
                }
            }

            updateTask(taskId, { message: 'กำลังบันทึกสถานะ...' });
            const nowStr = new Date().toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
            const updateData: any = { status: nextStatus };
            if (signedUrl) updateData.signed_file_url = signedUrl;
            
            if (isActorVice) { 
                updateData.vice_director_command = finalCommand; 
                updateData.vice_director_signature_date = nowStr; 
                updateData.target_teachers = targetTeachers; 
            } else { 
                updateData.director_command = finalCommand; 
                updateData.director_signature_date = nowStr; 
                if (nextStatus === 'PendingViceDirector') updateData.assigned_vice_director_id = viceId; 
                else updateData.target_teachers = targetTeachers; 
            }

            const { error: dbError } = await supabase!.from('documents').update(updateData).eq('id', taskId);
            if (dbError) throw dbError;

            const notifyIds = nextStatus === 'PendingViceDirector' ? [viceId!] : targetTeachers;
            if (notifyIds.length > 0) triggerTelegramNotification(allTeachers.filter(t => notifyIds.includes(t.id)), taskId, targetDoc.title, false);
            updateTask(taskId, { status: 'done', message: 'ดำเนินการสำเร็จ' }); 
            fetchDocs();
        } catch (e: any) { 
            console.error("Action Background Error:", e);
            updateTask(taskId, { status: 'error', message: `ล้มเหลว: ${e.message || "การเชื่อมต่อขัดข้อง"}` }); 
        }
    };

    const handleQuickDelegateToVice = async () => {
        if (!selectedDoc || !assignedViceDirId || !supabase) {
            alert("กรุณาเลือกผู้รับมอบหมาย");
            return;
        }
        const taskId = selectedDoc.id;
        const vice = allTeachers.find(t => t.id === assignedViceDirId);
        const finalCommand = command || `มอบ ${vice?.name} พิจารณาดำเนินการ`;
        
        setBackgroundTasks(prev => [...prev, { id: taskId, title: selectedDoc.title, status: 'processing', message: 'กำลังส่งต่อ...', notified: false }]);
        setViewMode('LIST');

        try {
            const nowStr = new Date().toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
            const { error } = await supabase!.from('documents').update({
                status: 'PendingViceDirector',
                assigned_vice_director_id: assignedViceDirId,
                director_command: finalCommand,
                director_signature_date: nowStr
            }).eq('id', taskId);

            if (error) throw error;
            if (vice) triggerTelegramNotification([vice], taskId, selectedDoc.title, false);
            updateTask(taskId, { status: 'done', message: 'มอบหมายสำเร็จ' });
            fetchDocs();
        } catch (e: any) {
            updateTask(taskId, { status: 'error', message: `ล้มเหลว: ${e.message}` });
        }
    };

    const handleDirectorAction = (isAckOnly: boolean) => {
        if (!selectedDoc) return;
        const currentCommand = command || (isAckOnly ? 'รับทราบ' : 'ดำเนินการตามเสนอ');
        setBackgroundTasks(prev => [...prev, { id: selectedDoc.id, title: selectedDoc.title, status: 'processing', message: 'เริ่มงาน...', notified: false }]);
        setViewMode('LIST');
        processActionInBackground(selectedDoc, currentCommand, [...selectedTeachers], stampPage, 'Distributed');
    };

    const handleViceDirectorAction = () => {
        if (!selectedDoc) return;
        const finalCommand = command || 'ดำเนินการตามเสนอ';
        setBackgroundTasks(prev => [...prev, { id: selectedDoc.id, title: selectedDoc.title, status: 'processing', message: 'กำลังเริ่มการลงนาม...', notified: false }]);
        setViewMode('LIST');
        processActionInBackground(selectedDoc, finalCommand, [...selectedTeachers], stampPage, 'Distributed');
    };

    const handleTeacherAcknowledge = async (docId: string, currentAckList: string[]) => {
        if (!isSupabaseConfigured || !supabase) return;
        const isCurrentlyActing = selectedDoc?.status !== 'Distributed';
        if (isCurrentlyActing) return;

        if (!currentAckList.includes(currentUser.id)) {
            const newAck = [...currentAckList, currentUser.id];
            await supabase!.from('documents').update({ acknowledged_by: newAck }).eq('id', docId);
            setDocs(prev => prev.map(d => d.id === docId ? { ...d, acknowledgedBy: newAck } : d));
            if (selectedDoc?.id === docId) { setSelectedDoc(prev => prev ? { ...prev, acknowledgedBy: newAck } : null); }
        }
    };

    const handleOpenAndAck = (docItem: DocumentItem, url: string) => {
        if (!url) return; window.open(url, '_blank');
        handleTeacherAcknowledge(docItem.id, docItem.acknowledgedBy || []);
    };

    const filteredDocs = docs.filter(doc => {
        if (isDirector || isDocOfficer || isSystemAdmin) return true;
        if (isViceDirector || (doc.assignedViceDirectorId === currentUser.id)) {
            return (doc.status === 'PendingViceDirector' && doc.assignedViceDirectorId === currentUser.id) ||
                   (doc.status === 'Distributed' && (doc.targetTeachers || []).includes(currentUser.id));
        }
        return doc.status === 'Distributed' && (doc.targetTeachers || []).includes(currentUser.id);
    });

    const totalPages = Math.ceil(filteredDocs.length / ITEMS_PER_PAGE);
    const displayedDocs = filteredDocs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const goToPage = (p: number) => { if (p >= 1 && p <= totalPages) setCurrentPage(p); };

    const filteredTeachersForAction = teachersInSchool.filter(t => 
        t.name.toLowerCase().includes(teacherSearchTerm.toLowerCase()) || 
        t.position.toLowerCase().includes(teacherSearchTerm.toLowerCase())
    );

    if (isLoading) return <div className="p-10 text-center text-slate-500"><Loader className="animate-spin inline mr-2"/> กำลังโหลดข้อมูล...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            {backgroundTasks.length > 0 && (
                <div className="fixed bottom-20 right-6 z-[60] w-72 flex flex-col gap-2 pointer-events-none">
                    {backgroundTasks.map(task => (
                        <div key={task.id} className={`p-3 rounded-xl shadow-2xl border flex flex-col gap-2 animate-slide-up pointer-events-auto transition-all ${task.status === 'done' ? 'bg-emerald-50 border-emerald-200' : task.status === 'error' ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                            <div className="flex justify-between items-start"><div className="flex items-center gap-2 overflow-hidden">{task.status === 'done' ? <CheckCircle className="text-emerald-600 shrink-0" size={16}/> : task.status === 'error' ? <AlertTriangle className="text-red-600 shrink-0" size={16}/> : <Loader className="animate-spin text-blue-600 shrink-0" size={16}/>}<span className="text-xs font-bold text-slate-700 truncate">{task.title}</span></div>{(task.status === 'error' || task.status === 'done') && (<button type="button" onClick={() => removeTask(task.id)} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={14}/></button>)}</div>
                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden"><div className={`h-full transition-all duration-500 ${task.status === 'done' ? 'bg-emerald-500 w-full' : task.status === 'error' ? 'bg-red-500 w-full' : task.status === 'uploading' ? 'bg-orange-500 w-2/3' : 'bg-blue-500 w-1/3'}`}></div></div>
                            <p className={`text-[10px] ${task.status === 'error' ? 'text-red-600 font-bold' : (task.status === 'done' ? 'text-emerald-600' : 'text-slate-500')}`}>{task.message}</p>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 text-white p-4 rounded-xl shadow-lg border-b-4 border-slate-700 relative overflow-hidden group">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4 w-full">
                    <div className="flex-1">
                        <div className="flex items-center gap-3"><h2 className="text-xl font-bold tracking-tight">ระบบงานสารบรรณโรงเรียน (SQL Online)</h2>{latestTask && (<div className="hidden lg:flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-full border border-slate-600 animate-fade-in max-w-md">{latestTask.status === 'processing' || latestTask.status === 'uploading' ? (<Loader size={14} className="animate-spin text-blue-400"/>) : latestTask.status === 'done' ? (<Zap size={14} className="text-yellow-400 fill-current"/>) : <AlertTriangle size={14} className="text-red-400"/>}<span className="text-[11px] font-medium text-slate-300 truncate">{latestTask.status === 'done' ? `สำเร็จ: ${latestTask.title}` : latestTask.message}</span></div>)}</div>
                        <p className="text-slate-400 text-xs mt-1">ผู้ใช้งาน: <span className="font-bold text-yellow-400">{currentUser.name}</span></p>
                    </div>
                    <div className="flex items-center gap-3"><div className="relative"><button type="button" onClick={() => setShowTaskQueue(!showTaskQueue)} className={`p-2 rounded-full transition-all hover:bg-slate-700 relative ${activeTasks.length > 0 ? 'bg-blue-600 shadow-lg' : 'bg-slate-700'}`}><Bell size={20} className={activeTasks.length > 0 ? 'animate-bounce' : ''}/>{(activeTasks.length > 0 || doneTasksCount > 0) && (<span className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full border-2 border-slate-800 ${activeTasks.length > 0 ? 'bg-blue-500' : 'bg-emerald-500'} text-white`}>{activeTasks.length || doneTasksCount}</span>)}</button></div></div>
                </div>
            </div>

            {viewMode === 'LIST' && (
                <>
                    <div className="flex justify-between items-center">
                        <div className="relative flex-1 max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="ค้นหาเรื่อง/เลขที่..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" /></div>
                        {(isDocOfficer || isSystemAdmin) && (<button type="button" onClick={() => { const currentThaiYear = String(new Date().getFullYear() + 543); let maxNum = 0; docs.forEach(d => { const parts = d.bookNumber.split('/'); if (parts.length === 2 && parts[1].trim() === currentThaiYear) { const num = parseInt(parts[0].trim()); if (!isNaN(num) && num > maxNum) maxNum = num; } }); setNewDoc({ bookNumber: `${String(maxNum + 1).padStart(3, '0')}/${currentThaiYear}`, title: '', from: '', priority: 'Normal', description: '' }); setDocCategory('INCOMING'); setTempAttachments([]); setSelectedTeachers([]); setViewMode('CREATE'); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all hover:scale-105 active:scale-95"><FilePlus size={18} /> ลงรับ/สร้างหนังสือ</button>)}
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                        {displayedDocs.length === 0 ? (<div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-dashed">ไม่มีรายการหนังสือราชการ</div>) : displayedDocs.map((docItem, index) => {
                             const isUnread = docItem.status === 'Distributed' && (docItem.targetTeachers || []).includes(currentUser.id) && !docItem.acknowledgedBy?.includes(currentUser.id);
                             const isAcknowledged = docItem.acknowledgedBy?.includes(currentUser.id);
                             const backgroundTask = backgroundTasks.find(t => t.id === docItem.id);
                             const isProcessing = backgroundTask && (backgroundTask.status === 'processing' || backgroundTask.status === 'uploading');
                             const isNewForDirector = isDirector && docItem.status === 'PendingDirector';
                             const isNewForVice = (isViceDirector || docItem.assignedViceDirectorId === currentUser.id) && docItem.status === 'PendingViceDirector' && docItem.assignedViceDirectorId === currentUser.id;
                             
                             const totalTargetCount = docItem.targetTeachers?.length || 0;
                             const ackCount = docItem.acknowledgedBy?.length || 0;

                             return (
                                <div key={docItem.id} className={`p-4 rounded-xl shadow-sm border transition-all cursor-pointer hover:shadow-md relative overflow-hidden group ${(isNewForDirector || isNewForVice) ? 'border-l-4 border-l-yellow-400 shadow-md' : 'border-slate-200'} ${isProcessing ? 'opacity-70 pointer-events-none' : ''} ${index % 2 === 1 ? 'bg-blue-50/50' : 'bg-white'}`} onClick={() => { setSelectedDoc(docItem); setViewMode('DETAIL'); }}>
                                    {(isNewForDirector || isNewForVice) && !isProcessing && (<div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg shadow-md z-20 flex items-center gap-1 animate-pulse"><Bell size={10} className="fill-current"/> หนังสือเข้าใหม่ !</div>)}
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-lg ${docItem.status === 'Distributed' ? (docItem.category === 'ORDER' ? 'bg-indigo-100 text-indigo-600' : 'bg-green-50 text-green-600') : 'bg-slate-100 text-slate-500'}`}>{docItem.category === 'ORDER' ? <Megaphone size={24}/> : <FileText size={24} />}</div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${docItem.category === 'ORDER' ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-100'}`}>{docItem.category === 'ORDER' ? 'เลขที่คำสั่ง' : 'รับที่'}: {docItem.bookNumber}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${docItem.priority === 'Critical' ? 'bg-red-100 text-red-700 border-red-200' : docItem.priority === 'Urgent' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>{docItem.priority === 'Critical' ? 'ด่วนที่สุด' : docItem.priority === 'Urgent' ? 'ด่วน' : 'ปกติ'}</span>
                                                    {isUnread && <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded-full animate-pulse font-bold shadow-sm">NEW</span>}
                                                    {isAcknowledged && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold border border-green-200">รับทราบแล้ว</span>}
                                                </div>
                                                <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{docItem.title}</h3>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-medium">
                                                    <span>จาก: {docItem.from}</span>
                                                    <span>{docItem.date}</span>
                                                    {docItem.status === 'Distributed' && totalTargetCount > 0 && (
                                                        <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100 font-black text-[10px]">
                                                            <Users size={12}/> รับทราบแล้ว {ackCount}/{totalTargetCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {docItem.status === 'PendingDirector' && <span className="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1 shadow-sm"><Users size={12}/> รอ ผอ. เกษียณ</span>}
                                            {docItem.status === 'PendingViceDirector' && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1 shadow-sm"><UserCheck size={12}/> รอตรวจสอบ/สั่งการ</span>}
                                            {isDirector && (<button type="button" onClick={async (e) => { e.stopPropagation(); if (!confirm("ยืนยันการลบหนังสือฉบับนี้?")) return; if (!supabase) return; const { error } = await supabase!.from('documents').delete().eq('id', docItem.id); if (error) alert("ลบไม่สำเร็จ: " + error.message); else { setDocs(docs.filter(d => d.id !== docItem.id)); } }} className="p-1.5 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button>)}
                                        </div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                    {totalPages > 1 && (<div className="flex justify-center items-center gap-2 mt-8"><button type="button" onClick={() => goToPage(1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-slate-600 shadow-sm"><ChevronsLeft size={20}/></button><button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-slate-600 shadow-sm"><ChevronLeft size={20}/></button><span className="text-sm font-bold text-slate-600 bg-white px-4 py-2 rounded-lg border shadow-sm">หน้า {currentPage} / {totalPages}</span><button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-slate-600 shadow-sm"><ChevronRight size={20}/></button><button type="button" onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 hover:bg-slate-50 text-slate-600 shadow-sm"><ChevronsRight size={20}/></button></div>)}
                </>
            )}

            {viewMode === 'CREATE' && (
                <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 max-w-4xl mx-auto relative overflow-hidden animate-slide-up">
                    {isUploading && (<div className="absolute inset-0 bg-white/90 z-50 flex items-center justify-center flex-col"><Loader className="animate-spin text-blue-600 mb-2" size={40} /><p className="font-bold text-slate-700">{uploadProgress}</p></div>)}
                    <div className="mb-6 border-b pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FilePlus className="text-blue-600"/> ลงทะเบียนรับหนังสือ / สร้างคำสั่ง</h3><div className="bg-slate-100 p-1 rounded-lg flex shadow-inner"><button type="button" onClick={() => setDocCategory('INCOMING')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${docCategory === 'INCOMING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}><FileBadge size={16}/> หนังสือรับภายนอก</button><button type="button" onClick={() => setDocCategory('ORDER')} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-all ${docCategory === 'ORDER' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}><Megaphone size={16}/> คำสั่งปฏิบัติราชการ</button></div></div>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newDoc.bookNumber || !supabase) return;
                        setIsUploading(true);
                        const isOrder = docCategory === 'ORDER';
                        const now = new Date();
                        const created: any = {
                            schoolId: currentUser.schoolId, category: docCategory, bookNumber: newDoc.bookNumber, title: newDoc.title, description: newDoc.description,
                            from: isOrder ? (currentSchool.name) : newDoc.from, date: now.toISOString().split('T')[0], timestamp: now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}),
                            priority: newDoc.priority, attachments: tempAttachments, status: isOrder ? 'Distributed' : 'PendingDirector', targetTeachers: isOrder ? selectedTeachers : [], acknowledgedBy: [],
                            directorCommand: isOrder ? 'สั่งการตามเอกสารแนบ' : '', directorSignatureDate: isOrder ? now.toLocaleString('th-TH') : ''
                        };
                        const { data, error } = await supabase!.from('documents').insert([mapDocToDb(created)]).select();
                        if (!error && data) {
                            const savedDocId = data[0].id.toString();
                            if (isOrder && selectedTeachers.length > 0) triggerTelegramNotification(allTeachers.filter(t => selectedTeachers.includes(t.id)), savedDocId, created.title, true);
                            setNewDoc({ bookNumber: '', title: '', from: '', priority: 'Normal', description: '' });
                            setTempAttachments([]); setSelectedTeachers([]); setViewMode('LIST'); fetchDocs();
                        } else { alert("บันทึกล้มเหลว: " + error?.message); }
                        setIsUploading(false);
                    }} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-inner"><label className="block text-sm font-bold text-slate-700 mb-1">{docCategory === 'ORDER' ? 'เลขที่คำสั่ง' : 'เลขที่รับ (แก้ไขได้)'}</label><input required type="text" value={newDoc.bookNumber} onChange={e => setNewDoc({...newDoc, bookNumber: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-slate-700"/></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">เรื่อง</label><input required type="text" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                                <div className="grid grid-cols-2 gap-4">{docCategory === 'INCOMING' && (<div><label className="block text-sm font-bold text-slate-700 mb-1">จาก</label><input required type="text" value={newDoc.from} onChange={e => setNewDoc({...newDoc, from: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" /></div>)}<div className={docCategory === 'ORDER' ? 'col-span-2' : ''}><label className="block text-sm font-bold text-slate-700 mb-1">ความเร่งด่วน</label><select value={newDoc.priority} onChange={e => setNewDoc({...newDoc, priority: e.target.value as any})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"><option value="Normal">ปกติ</option><option value="Urgent">ด่วน</option><option value="Critical">ด่วนที่สุด</option></select></div></div>
                                <div><label className="block text-sm font-bold text-slate-700 mb-1">รายละเอียดเพิ่มเติม</label><textarea rows={3} value={newDoc.description} onChange={e => setNewDoc({...newDoc, description: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea></div>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200"><h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2"><UploadCloud size={18}/> อัปโหลดไฟล์แนบ</h4>{tempAttachments.map(att => (<div key={att.id} className="p-2 flex justify-between items-center text-xs bg-white mb-2 border rounded shadow-sm"><div className="flex items-center gap-2 truncate"><span>{att.name}</span></div><button type="button" onClick={() => setTempAttachments(prev => prev.filter(a => a.id !== att.id))} className="text-red-500 ml-2 hover:bg-red-50 p-1 rounded transition-colors"><Trash2 size={14}/></button></div>))}<input type="file" onChange={async (e) => { 
                                    if (e.target.files && e.target.files[0]) { 
                                        const file = e.target.files[0]; 
                                        if (!sysConfig?.scriptUrl || !sysConfig?.driveFolderId) { alert("ไม่พบการตั้งค่า Google Drive!"); return; } 
                                        setUploadProgress('กำลังเตรียมไฟล์...'); 
                                        setIsUploading(true); 
                                        try { 
                                            const reader = new FileReader(); 
                                            reader.readAsDataURL(file); 
                                            reader.onload = async () => { 
                                                let base64Data = reader.result as string; 
                                                if (file.type === 'application/pdf' && tempAttachments.length === 0 && docCategory === 'INCOMING') { 
                                                    try { base64Data = await stampReceiveNumber({ fileBase64: base64Data, bookNumber: newDoc.bookNumber || "XXX/XXXX", date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }), time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.', schoolName: currentSchool.name }); } catch (e) {} 
                                                } 
                                                
                                                const safeBookNumber = (newDoc.bookNumber || 'unknown').replace(/[\\/:*?"<>|]/g, '-');
                                                const finalFileName = `${safeBookNumber}.pdf`;

                                                const payload = { 
                                                    folderId: sysConfig.driveFolderId, 
                                                    fileName: finalFileName, 
                                                    mimeType: file.type, 
                                                    fileData: getCleanBase64(base64Data) 
                                                }; 
                                                
                                                const response = await fetch(sysConfig.scriptUrl!, { 
                                                    method: 'POST', 
                                                    body: JSON.stringify(payload), 
                                                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                                    redirect: 'follow' 
                                                }); 
                                                
                                                const result = await response.json(); 
                                                if (result.status === 'success') { 
                                                    setTempAttachments([...tempAttachments, { id: `att_${Date.now()}`, name: finalFileName, type: 'LINK', url: result.viewUrl || result.url, fileType: file.type }]); 
                                                } else { 
                                                    throw new Error(result.message); 
                                                } 
                                                setIsUploading(false); 
                                                setUploadProgress(''); 
                                            }; 
                                        } catch (err: any) { 
                                            alert(`เกิดข้อผิดพลาดในการอัปโหลด: ${err.message || err}`); 
                                            setIsUploading(false); 
                                            setUploadProgress(''); 
                                        } 
                                    } 
                                }} className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"/><div className="text-center text-xs text-slate-400 font-bold my-2">- หรือ -</div><div className="flex flex-col gap-2"><input type="text" placeholder="ชื่อเอกสาร (ถ้ามี)" value={linkNameInput} onChange={e => setLinkNameInput(e.target.value)} className="w-full px-3 py-2 border rounded text-sm outline-none focus:ring-1 ring-blue-200"/><div className="flex gap-2"><input type="text" placeholder="วางลิงก์ https://..." value={linkInput} onChange={e => setLinkInput(e.target.value)} className="w-full px-3 py-2 border rounded text-sm outline-none focus:ring-1 ring-blue-200"/><button type="button" onClick={() => { if (linkInput) { let finalUrl = linkInput.trim(); if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl; setTempAttachments([...tempAttachments, { id: `att_${Date.now()}`, name: linkNameInput || 'ลิงก์เอกสาร', type: 'LINK', url: finalUrl, fileType: 'external-link' }]); setLinkInput(''); setLinkNameInput(''); } }} className="bg-slate-600 text-white px-3 py-2 rounded hover:bg-slate-700 transition-colors"><Plus size={16}/></button></div></div></div>
                                {docCategory === 'ORDER' && (<div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100"><div className="flex justify-between items-center mb-3"><h4 className="font-bold text-indigo-900 text-sm flex items-center gap-2 uppercase tracking-wide"><Users size={16}/> เลือกผู้รับปฏิบัติ (ส่งทันที)</h4><button type="button" onClick={() => setSelectedTeachers(teachersInSchool.length === selectedTeachers.length ? [] : teachersInSchool.map(t=>t.id))} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">เลือกทั้งหมด</button></div><div className="bg-white border rounded-xl max-h-[160px] overflow-y-auto custom-scrollbar p-1">{teachersInSchool.map(t => (<label key={t.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${selectedTeachers.includes(t.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}><input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={(e) => { if (e.target.checked) setSelectedTeachers([...selectedTeachers, t.id]); else setSelectedTeachers(selectedTeachers.filter(id => id !== t.id)); }} className="rounded-md text-indigo-600 w-4 h-4"/><div className="flex-1 overflow-hidden"><div className="text-xs font-bold text-slate-700 truncate">{t.name}</div><div className="text-[9px] text-slate-400 truncate">{t.position}</div></div></label>))}</div></div>)}
                            </div>
                        </div>
                        <div className="flex gap-3 pt-4 border-t"><button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-3 text-slate-600 bg-slate-100 rounded-xl font-bold hover:bg-slate-200 transition-all">ยกเลิก</button><button type="submit" className={`flex-1 py-3 text-white rounded-xl font-bold shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 ${docCategory === 'ORDER' ? 'bg-indigo-600' : 'bg-blue-600'}`}>{docCategory === 'ORDER' ? <Send size={20}/> : <Save size={20}/>} {docCategory === 'ORDER' ? 'บันทึกและส่งทันที' : 'บันทึกและเสนอ ผอ.'}</button></div>
                    </form>
                </div>
            )}

            {viewMode === 'DETAIL' && selectedDoc && (
                <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
                    <div className="flex items-center gap-4"><button type="button" onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"><ArrowLeft size={24}/></button><h2 className="text-2xl font-bold text-slate-800 tracking-tight">รายละเอียดหนังสือราชการ</h2></div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm border-b pb-6"><div className="flex flex-col"><span className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">เรื่อง</span><span className="font-bold text-lg text-slate-800 leading-tight">{selectedDoc.title}</span></div><div className="flex flex-col"><span className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">เลขที่รับ / คำสั่ง</span><span className="font-mono font-bold text-slate-700 text-lg">{selectedDoc.bookNumber}</span></div><div className="flex flex-col"><span className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">จากหน่วยงาน</span><span className="font-bold text-slate-700">{selectedDoc.from}</span></div><div className="flex flex-col"><span className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">วันที่รับ/บันทึก</span><span className="font-bold text-slate-700">{selectedDoc.date} เวลา {selectedDoc.timestamp}</span></div></div>
                        <div><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-700 flex items-center gap-2"><LinkIcon size={18} className="text-blue-500"/> ไฟล์เอกสารแนบ</h3><span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">คลิกดูไฟล์เพื่อยืนยันรับทราบ</span></div><div className="flex flex-col gap-3">{selectedDoc.signedFileUrl && (<button type="button" onClick={() => handleOpenAndAck(selectedDoc, selectedDoc.signedFileUrl!)} className="w-full p-4 bg-emerald-600 text-white rounded-xl shadow-md flex items-center justify-between group hover:bg-emerald-700 transition-all border-2 border-emerald-400 relative overflow-hidden"><div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-150 transition-transform"><CheckCircle size={80}/></div><div className="flex items-center gap-4 relative z-10"><div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm shadow-inner"><FileCheck size={28}/></div><div className="text-left"><div className="font-bold text-lg leading-none mb-1">บันทึกข้อสั่งการ (ลงนามแล้ว)</div><div className="text-xs opacity-80 uppercase tracking-widest">Signed & Final Document</div></div></div><ExternalLink size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform relative z-10"/></button>)}{selectedDoc.attachments.map((att, idx) => (<button type="button" key={idx} onClick={() => handleOpenAndAck(selectedDoc, att.url)} className="w-full p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between transition-all group"><div className="flex items-center gap-4"><div className="p-2 bg-white rounded-lg shadow-sm border border-slate-100 transition-transform group-hover:scale-110"><FileIcon size={24}/></div><div className="text-left"><div className="font-bold text-slate-700 mb-0.5">{att.name}</div><div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Original File Uploaded</div></div></div><ExternalLink size={20} className="text-slate-400 group-hover:text-blue-600 transition-all group-hover:scale-110"/></button>))}</div></div>

                        {isDirector && selectedDoc.status === 'PendingDirector' && (
                            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200 space-y-4 animate-slide-up shadow-sm">
                                <h3 className="font-bold text-blue-900 flex items-center gap-2 tracking-wide font-sarabun text-lg"><PenTool size={22}/> การพิจารณาหนังสือ (ผู้อำนวยการ)</h3>
                                
                                <div className="p-5 bg-white rounded-xl border border-blue-100 shadow-inner space-y-4">
                                    <div className="flex flex-col md:flex-row gap-4 items-end">
                                        <div className="flex-1 w-full space-y-2">
                                            <label className="block text-[11px] font-black text-blue-500 uppercase tracking-widest ml-1">มอบหมายงานพิจารณาต่อ (เฉพาะรองผู้อำนวยการ)</label>
                                            <select 
                                                value={assignedViceDirId} 
                                                onChange={e => setAssignedViceDirId(e.target.value)} 
                                                className="w-full px-5 py-3 border-2 border-slate-100 rounded-xl bg-slate-50 font-bold text-blue-800 outline-none focus:ring-2 focus:ring-blue-400 transition-all cursor-pointer text-lg shadow-sm"
                                            >
                                                <option value="">-- เลือกรายชื่อรองผู้อำนวยการ --</option>
                                                {viceDirectors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.position})</option>)}
                                            </select>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={handleQuickDelegateToVice} 
                                            className={`w-full md:w-auto px-10 py-4 rounded-xl font-black shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 text-lg uppercase tracking-tight ${assignedViceDirId ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`} 
                                            disabled={!assignedViceDirId}
                                        >
                                            <FastForward size={24}/> มอบรองผู้อำนวยการ
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-slate-400 italic font-bold">* ระบบจะแสดงรายชื่อบุคลากรที่มีตำแหน่งเป็น "รองผู้อำนวยการ" เท่านั้นสำหรับการมอบหมายงานพิจารณาต่อ</p>
                                </div>

                                <div className="p-4 bg-white rounded-xl border border-blue-100 shadow-inner space-y-4">
                                    <label className="block text-[11px] font-black text-blue-700 uppercase tracking-widest">ทางเลือกที่ 2: เกษียณหนังสือ / เวียนแจ้งบุคลากรโดยตรง</label>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">ระบุข้อความสั่งการ</label>
                                        <textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="ระบุข้อความ..." className="w-full p-4 border border-slate-100 rounded-2xl h-24 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner text-sm font-bold text-slate-700" />
                                    </div>
                                    
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
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
                                                        className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white shadow-sm"
                                                    />
                                                </div>
                                                <button 
                                                    type="button"
                                                    onClick={() => setSelectedTeachers(selectedTeachers.length === teachersInSchool.length ? [] : teachersInSchool.map(t => t.id))}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedTeachers.length === teachersInSchool.length ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'}`}
                                                >
                                                    {selectedTeachers.length === teachersInSchool.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
                                            {filteredTeachersForAction.map(t => (
                                                <label key={t.id} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer border transition-all ${selectedTeachers.includes(t.id) ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-white border-transparent'}`}>
                                                    <input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={e => e.target.checked ? setSelectedTeachers([...selectedTeachers, t.id]) : setSelectedTeachers(selectedTeachers.filter(id => id !== t.id))} className="rounded-md text-blue-600 w-4 h-4 transition-all"/>
                                                    <div className="flex-1 overflow-hidden"><div className="text-xs font-bold text-slate-700 truncate">{t.name}</div><div className="text-[9px] text-slate-400 font-bold truncate uppercase">{t.position}</div></div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center gap-4">
                                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border text-xs font-bold text-slate-500"><FileText size={14}/> ประทับตราที่หน้า: <input type="number" min="1" value={stampPage} onChange={e => setStampPage(parseInt(e.target.value))} className="w-10 text-center font-black text-blue-600 bg-transparent outline-none"/></div>
                                        <div className="flex flex-1 gap-3">
                                            <button type="button" onClick={() => handleDirectorAction(true)} className="flex-1 py-3 bg-white border-2 border-emerald-600 text-emerald-600 rounded-xl font-bold shadow-md hover:bg-emerald-50 active:scale-95 transition-all text-xs uppercase"><CheckSquare size={16} className="inline mr-1"/> รับทราบ (แจ้งเวียน)</button>
                                            <button type="button" onClick={() => handleDirectorAction(false)} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-bold shadow-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-xs uppercase"><PenTool size={16}/> ลงนามสั่งการ</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedDoc.status === 'PendingViceDirector' && (isViceDirector || selectedDoc.assignedViceDirectorId === currentUser.id) && (
                             <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-200 space-y-4 animate-slide-up shadow-sm">
                                <h3 className="font-bold text-indigo-900 flex items-center gap-2 tracking-wide font-sarabun text-lg"><PenTool size={22}/> การพิจารณาหนังสือ (ผู้รับมอบหมาย)</h3>
                                <div className="p-4 bg-white border-2 border-indigo-100 rounded-2xl text-xs text-indigo-800 font-bold mb-4 italic shadow-inner"><span className="text-[10px] text-slate-400 not-italic block mb-1 uppercase tracking-widest">ความเห็นจากผู้อำนวยการ:</span>"{selectedDoc.directorCommand || 'มอบพิจารณาดำเนินการ'}"</div>
                                
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest ml-1">ระบุข้อความสั่งการ/ความเห็น</label>
                                    <textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="ระบุข้อความสั่งการ/ความเห็น..." className="w-full p-4 border border-slate-100 rounded-2xl h-24 outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm font-bold text-slate-700" />
                                </div>
                                
                                <div className="bg-white p-4 rounded-2xl border border-indigo-100">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-3">
                                        <label className="block text-sm font-bold text-indigo-900 flex items-center gap-2">
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
                                                    className="w-full pl-9 pr-3 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-indigo-500 outline-none bg-slate-50 shadow-sm"
                                                />
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => setSelectedTeachers(selectedTeachers.length === teachersInSchool.length ? [] : teachersInSchool.map(t => t.id))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${selectedTeachers.length === teachersInSchool.length ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'}`}
                                            >
                                                {selectedTeachers.length === teachersInSchool.length ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar p-1">
                                        {filteredTeachersForAction.map(t => (
                                            <label key={t.id} className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer border transition-all ${selectedTeachers.includes(t.id) ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-white border-transparent'}`}>
                                                <input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={e => e.target.checked ? setSelectedTeachers([...selectedTeachers, t.id]) : setSelectedTeachers(selectedTeachers.filter(id => id !== t.id))} className="rounded-md text-blue-600 w-4 h-4 transition-all"/>
                                                <div className="flex-1 overflow-hidden"><div className="text-xs font-bold text-slate-700 truncate">{t.name}</div><div className="text-[9px] text-slate-400 font-bold truncate uppercase">{t.position}</div></div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 mt-4">
                                     <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border text-xs font-bold text-slate-500"><FileText size={14}/> ประทับตราที่หน้า: <input type="number" min="1" value={stampPage} onChange={e => setStampPage(parseInt(e.target.value))} className="w-10 text-center font-black text-blue-600 bg-transparent outline-none"/></div>
                                     <button type="button" onClick={handleViceDirectorAction} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95 uppercase tracking-wider"><PenTool size={22}/> ลงนามและสั่งการบุคลากร</button>
                                </div>
                                <p className="text-[10px] text-center text-slate-400 italic font-sarabun">* ระบบจะประทับตราผู้สั่งการที่ฝั่งซ้าย เพื่อความสวยงามและถูกต้องตามระเบียบ</p>
                             </div>
                        )}

                        {selectedDoc.status === 'Distributed' && (
                            <div className="bg-slate-50 p-8 rounded-2xl text-center space-y-4 border border-slate-200 shadow-inner animate-fade-in">
                                {selectedDoc.acknowledgedBy?.includes(currentUser.id) ? (
                                    <div className="text-emerald-600 font-black flex flex-col items-center gap-3"><div className="bg-emerald-100 p-4 rounded-full text-emerald-600"><CheckCircle size={48} className="animate-bounce"/></div><span className="text-2xl tracking-tight">ท่านได้รับทราบหนังสือฉบับนี้แล้ว</span><div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Successfully Acknowledged</div></div>
                                ) : (
                                    <div className="space-y-4"><div className="bg-blue-100 p-4 rounded-full text-blue-600 w-fit mx-auto"><Info size={40} className="animate-pulse"/></div><p className="text-slate-600 font-black text-xl tracking-tight">กรุณาคลิกที่ปุ่มดูไฟล์เพื่ออ่านหนังสือ</p><p className="text-slate-400 text-sm font-bold uppercase tracking-widest">ระบบจะบันทึกสถานะรับทราบให้อัตโนมัติเมื่อท่านเปิดอ่าน</p></div>
                                )}
                            </div>
                        )}
                        
                        {(isDirector || isDocOfficer) && selectedDoc.status === 'Distributed' && (
                             <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                 <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Users size={18}/> สถานะการรับทราบ ({selectedDoc.acknowledgedBy.length}/{selectedDoc.targetTeachers.length})</h4>
                                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                     {selectedDoc.targetTeachers.map(tid => {
                                         const t = allTeachers.find(at => at.id === tid);
                                         const isRead = selectedDoc.acknowledgedBy.includes(tid);
                                         return (
                                             <div key={tid} className={`flex items-center gap-2 p-2 rounded-lg border ${isRead ? 'bg-green-50 border-green-100' : 'bg-white border-slate-100'}`}>
                                                 {isRead ? <CheckCircle size={16} className="text-green-500"/> : <div className="w-4 h-4 rounded-full border-2 border-slate-200"></div>}
                                                 <span className={`text-xs truncate ${isRead ? 'text-green-800 font-medium' : 'text-slate-400'}`}>{t?.name || tid}</span>
                                             </div>
                                         )
                                     })}
                                 </div>
                             </div>
                         )}
                    </div>
                </div>
            )}
            <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } } .animate-shimmer { animation: shimmer 2s infinite linear; } .custom-scrollbar::-webkit-scrollbar { width: 6px; } .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }`}</style>
        </div>
    );
};
export default DocumentsSystem;
