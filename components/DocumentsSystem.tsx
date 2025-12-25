
import React, { useState, useEffect } from 'react';
import { DocumentItem, Teacher, Attachment, SystemConfig, School } from '../types';
import { Search, FileText, Users, CheckCircle, FilePlus, Loader, Trash2, Plus, UploadCloud, AlertTriangle, Megaphone, ChevronLeft, ChevronRight, FileBadge, Bell, X, Zap, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
            if (supabase) {
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
                updateTask(taskId, { status: 'uploading', message: 'กำลังบันทึกไฟล์...' });
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

    const handleDeleteDoc = async (docId: string) => {
        if (!confirm("ยืนยันการลบหนังสือฉบับนี้?")) return;
        if (!supabase) return;
        
        const { error } = await supabase.from('documents').delete().eq('id', docId);
        if (error) {
            alert("ลบไม่สำเร็จ: " + error.message);
        } else {
            setDocs(docs.filter(d => d.id !== docId));
            setViewMode('LIST');
        }
    };

    const handleDirectorAction = (isAckOnly: boolean) => {
        if (!selectedDoc) return;
        const currentCommand = command || (isAckOnly ? 'รับทราบ' : 'ดำเนินการตามเสนอ');
        setBackgroundTasks(prev => [...prev, { id: selectedDoc.id, title: selectedDoc.title, status: 'processing', message: 'เริ่มงาน...', notified: false }]);
        setViewMode('LIST');
        processActionInBackground(selectedDoc, currentCommand, [...selectedTeachers], stampPage, 'Distributed');
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

    if (isLoading) return <div className="p-10 text-center text-slate-500"><Loader className="animate-spin inline mr-2"/> กำลังโหลดข้อมูล...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            {/* Task Console */}
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
                        {displayedDocs.map((docItem, index) => {
                             const isUnread = docItem.status === 'Distributed' && (docItem.targetTeachers || []).includes(currentUser.id) && !docItem.acknowledgedBy?.includes(currentUser.id);
                             const isAcknowledged = docItem.acknowledgedBy?.includes(currentUser.id);
                             const isNewForDirector = isDirector && docItem.status === 'PendingDirector';
                             const isNewForVice = (isViceDirector || docItem.assignedViceDirectorId === currentUser.id) && docItem.status === 'PendingViceDirector' && docItem.assignedViceDirectorId === currentUser.id;
                             
                             return (
                                <div key={docItem.id} className={`p-4 rounded-xl shadow-sm border transition-all cursor-pointer hover:shadow-md relative overflow-hidden group ${(isNewForDirector || isNewForVice) ? 'border-l-4 border-l-yellow-400 shadow-md' : 'border-slate-200'} ${index % 2 === 1 ? 'bg-blue-50/50' : 'bg-white'}`} onClick={() => { setSelectedDoc(docItem); setViewMode('DETAIL'); }}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-lg ${docItem.status === 'Distributed' ? (docItem.category === 'ORDER' ? 'bg-indigo-100 text-indigo-600' : 'bg-green-50 text-green-600') : 'bg-slate-100 text-slate-500'}`}>{docItem.category === 'ORDER' ? <Megaphone size={24}/> : <FileText size={24} />}</div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`text-xs font-mono px-2 py-0.5 rounded border ${docItem.category === 'ORDER' ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-100'}`}>{docItem.bookNumber}</span>
                                                    {isUnread && <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded-full animate-pulse font-bold">NEW</span>}
                                                    {isAcknowledged && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-bold">รับทราบแล้ว</span>}
                                                </div>
                                                <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{docItem.title}</h3>
                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-medium"><span>จาก: {docItem.from}</span><span>{docItem.date}</span></div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {isDirector && (<button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteDoc(docItem.id); }} className="p-1.5 text-slate-300 hover:text-red-600 transition-colors"><Trash2 size={16}/></button>)}
                                        </div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                    {totalPages > 1 && (<div className="flex justify-center items-center gap-2 mt-8"><button type="button" onClick={() => goToPage(1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50"><ChevronsLeft size={20}/></button><button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50"><ChevronLeft size={20}/></button><span className="text-sm font-bold text-slate-600">หน้า {currentPage} / {totalPages}</span><button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50"><ChevronRight size={20}/></button><button type="button" onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50"><ChevronsRight size={20}/></button></div>)}
                </>
            )}
            {/* View Form and Detail UI elements here... */}
        </div>
    );
};

export default DocumentsSystem;
