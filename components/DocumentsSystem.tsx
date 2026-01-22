
// Fix: Added missing imports for History, Clock, Bookmark, and ChevronDown from lucide-react
import { AlertTriangle, ArrowLeft, Bell, CheckCircle, CheckSquare, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, FastForward, FileBadge, FileCheck, FileIcon, FilePlus, FileText, Info, Link as LinkIcon, Loader, Megaphone, PenTool, Plus, Save, Search, Send, Trash2, UploadCloud, UserCheck, UserMinus, UserPlus, Users, X, Zap, DownloadCloud, History, Clock, Bookmark, ChevronDown } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';
import { Attachment, DocumentItem, School, SystemConfig, Teacher } from '../types';
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
    
    // Pagination & Search State
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'ALL' | 'INCOMING' | 'ORDER'>('ALL');
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
    ).sort((a, b) => a.name.localeCompare(b.name, 'th'));

    const viceDirectors = teachersInSchool.filter(t => 
        t.position.includes('รองผู้อำนวยการ') || t.roles.includes('VICE_DIRECTOR')
    );

    async function handleTeacherAcknowledge(docId: string, currentAckList: string[]) {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        
        if (!currentAckList.includes(currentUser.id)) {
            const newAck = [...currentAckList, currentUser.id];
            try {
                const { error } = await client.from('documents').update({ acknowledged_by: newAck }).eq('id', docId);
                if (error) throw error;
                
                // Local state update
                setDocs(prev => prev.map(d => d.id === docId ? { ...d, acknowledgedBy: newAck } : d));
                if (selectedDoc?.id === docId) { 
                    setSelectedDoc(prev => prev ? { ...prev, acknowledgedBy: newAck } : null); 
                }
            } catch (e) {
                console.error("Acknowledgement Error:", e);
            }
        }
    }

    // Reset action state when switching documents or views
    useEffect(() => {
        setCommand('');
        setSelectedTeachers([]);
        setStampPage(1);
        setAssignedViceDirId('');
        setTeacherSearchTerm('');
    }, [selectedDoc?.id, viewMode]);

    // Reset page to 1 when search term or tab changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeTab]);

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
        signed_file_url: d.signed_file_url,
        assigned_vice_director_id: d.assigned_vice_director_id,
        vice_director_command: d.viceDirectorCommand,
        vice_director_signature_date: d.viceDirectorSignatureDate,
        target_teachers: d.targetTeachers,
        acknowledged_by: d.acknowledgedBy
    });

    const fetchDocs = async () => {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        const { data, error } = await client
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

    useEffect(() => {
        const client = supabase;
        const loadInitial = async () => {
            setIsLoading(true);
            await fetchDocs();
            if (isSupabaseConfigured && client) {
                const { data: configData } = await client
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
        if (isSupabaseConfigured && client) {
            channel = client
                .channel('documents_realtime')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'documents',
                    filter: `school_id=eq.${currentUser.schoolId}`
                }, () => { fetchDocs(); })
                .subscribe();
        }
        return () => { if (channel && client) client.removeChannel(channel); };
    }, [currentUser.schoolId, currentSchool.name]);

    // --- Helper for Google Drive Links ---
    const getGoogleDriveId = (url: string) => {
        if (!url) return null;
        const patterns = [/drive\.google\.com\/file\/d\/([-_w]+)/, /drive\.google\.com\/open\?id=([-_w]+)/, /id=([-_w]+)/];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) return match[1];
        }
        return null;
    };

    const getPreviewUrl = (url: string) => {
        const id = getGoogleDriveId(url);
        if (id) return `https://drive.google.com/file/d/${id}/view`;
        return url.replace('export=download', 'export=view');
    };

    // Handle deep link focusing and auto-acknowledgement with direct file open
    useEffect(() => {
        if (focusDocId && docs.length > 0) {
            const found = docs.find(d => d.id === focusDocId);
            if (found) {
                setSelectedDoc(found);
                setViewMode('DETAIL');
                
                const isDistributed = found.status === 'Distributed' || found.status === 'PendingViceDirector';
                const isTarget = (found.targetTeachers || []).includes(currentUser.id) || 
                                 (found.assignedViceDirectorId === currentUser.id);
                const notAckedYet = !(found.acknowledgedBy || []).includes(currentUser.id);

                if (isDistributed && isTarget && notAckedYet) {
                    handleTeacherAcknowledge(found.id, found.acknowledgedBy || []);
                }

                const params = new URLSearchParams(window.location.search);
                const directFileUrl = params.get('file');
                if (directFileUrl) {
                    const viewUrl = getPreviewUrl(directFileUrl);
                    setTimeout(() => {
                        window.location.replace(viewUrl);
                    }, 300);
                }
                
                if (onClearFocus) onClearFocus();
            }
        }
    }, [focusDocId, docs, currentUser.id]);

    const getCleanBase64 = (base64Str: string) => {
        if (!base64Str) return '';
        const parts = base64Str.split(',');
        const content = parts.length > 1 ? parts[1] : parts[0];
        return content.replace(/[\s\n\r]/g, ''); 
    };

    async function triggerTelegramNotification(teachers: Teacher[], docId: string, title: string, isOrder: boolean, bookNumber: string, fromStr: string, attachments: Attachment[] = []) {
        if (!sysConfig?.telegramBotToken || !sysConfig?.scriptUrl) return;
        const baseUrl = sysConfig.appBaseUrl || window.location.origin;
        const scriptUrl = sysConfig.scriptUrl;

        teachers.forEach(t => {
            if (!t.telegramChatId) return;

            let message = `<b>${isOrder ? '📝 มีคำสั่งปฏิบัติราชการใหม่' : '📩 มีหนังสือราชการใหม่'}</b>\n` +
                            `----------------------------------\n` +
                            `<b>เลขที่:</b> ${bookNumber}\n` +
                            `<b>เรื่อง:</b> ${title}\n` +
                            `<b>จาก:</b> ${fromStr}\n` +
                            `----------------------------------\n`;
            
            if (attachments && attachments.length > 0) {
                message += `<b>📎 คลิกเพื่อดูเอกสารและยืนยันรับทราบ:</b>\n`;
                attachments.forEach((att, idx) => {
                    const directFileUrl = getPreviewUrl(att.url);
                    const trackingLink = `${scriptUrl}?action=ack&docId=${docId}&userId=${t.id}&target=${encodeURIComponent(directFileUrl)}`;
                    message += `${idx + 1}. <a href=\"${trackingLink}\">${att.name}</a>\n`;
                });
                message += `----------------------------------\n`;
            }

            message += `✅ ระบบจะบันทึกสถานะ "รับทราบ" ให้ท่านทันทีเมื่อกดดูไฟล์เอกสาร`;
            
            const appLink = `${baseUrl}?view=DOCUMENTS&id=${docId}`;
            sendTelegramMessage(sysConfig.telegramBotToken!, t.telegramChatId, message, appLink);
        });
    }

    const handleFetchAndUploadFromUrl = async (url: string, customName?: string) => {
        if (!sysConfig?.scriptUrl || !sysConfig?.driveFolderId) {
            alert("ไม่พบการตั้งค่า Google Drive! (โปรดระบุ Script URL และ Folder ID)");
            return;
        }

        const taskId = `fetch_${Date.now()}`;
        const finalName = customName || `link_file_${Date.now()}.pdf`;
        
        setBackgroundTasks(prev => [...prev, { 
            id: taskId, 
            title: `ลิงก์คลาวด์: ${finalName}`, 
            status: 'uploading', 
            message: 'กำลังส่งคำสั่งดึงไฟล์จากต้นทาง...', 
            notified: false 
        }]);

        try {
            const trimmedUrl = url.trim();
            const protocolPart = trimmedUrl.indexOf('https://') === 0 ? 'https://' : 'http://';
            const bodyPart = trimmedUrl.replace(protocolPart, "").replace(/\/+/g, "/");
            const normalizedUrl = protocolPart + bodyPart;

            updateTask(taskId, { message: 'กำลังดาวน์โหลดไฟล์ผ่าน Deep Proxy Bridge...' });
            const response = await fetch(sysConfig.scriptUrl.trim(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'fetchRemote', url: normalizedUrl }),
                redirect: 'follow'
            });

            if (!response.ok) throw new Error("Cloud Bridge Connection Error");
            const result = await response.json();

            if (result.status !== 'success' || !result.fileData) {
                if (result.message?.includes('UrlFetchApp')) {
                    throw new Error("ระบบต้องการการยืนยันสิทธิ์ใน Apps Script (โปรดติดต่อ Admin เพื่อ Run triggerAuthorization)");
                }
                throw new Error(result.message || "ไม่สามารถเข้าถึงไฟล์ต้นทางได้ (อาจถูกเซิร์ฟเวอร์ปลายทางบล็อกสคริปต์)");
            }

            let fileData = `data:${result.mimeType};base64,${result.fileData}`;

            if (result.mimeType === 'application/pdf' && docCategory === 'INCOMING') {
                updateTask(taskId, { message: 'กำลังประทับตราเลขรับอัตโนมัติ...' });
                try {
                    fileData = await stampReceiveNumber({
                        fileBase64: fileData,
                        bookNumber: newDoc.bookNumber || "XXX/XXXX",
                        date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
                        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
                        schoolName: currentSchool.name,
                        schoolLogoBase64: sysConfig.schoolLogoBase64
                    });
                } catch (e) {
                    console.warn("Stamping link file failed, continuing with original", e);
                }
            }

            updateTask(taskId, { message: 'กำลังบันทึกเข้า Google Drive โรงเรียน...' });
            const safeBookNumber = (newDoc.bookNumber || 'unknown').replace(/[\\\/ :*?"<>|]/g, '-');
            const uploadName = `${safeBookNumber}_${finalName}`;

            const uploadPayload = {
                folderId: sysConfig.driveFolderId.trim(),
                fileName: uploadName,
                mimeType: result.mimeType,
                fileData: result.mimeType === 'application/pdf' && docCategory === 'INCOMING' ? getCleanBase64(fileData) : result.fileData
            };

            const uploadResp = await fetch(sysConfig.scriptUrl.trim(), {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(uploadPayload),
                redirect: 'follow'
            });

            const upResult = await uploadResp.json();
            if (upResult.status === 'success') {
                setTempAttachments(prev => [...prev, { id: `att_${Date.now()}`, name: uploadName, type: 'LINK', url: upResult.viewUrl || upResult.url, fileType: result.mimeType }]);
                updateTask(taskId, { status: 'done', message: 'ดึงไฟล์+จัดเก็บ สำเร็จ' });
            } else {
                throw new Error(upResult.message || "Failed to save to Drive");
            }

        } catch (err: any) {
            updateTask(taskId, { status: 'error', message: `ขัดข้อง: ${err.message}` });
        }
    };

    const handleFileUploadInBackground = async (file: File) => {
        if (!sysConfig?.scriptUrl || !sysConfig?.driveFolderId) {
            alert("ไม่พบการตั้งค่า Google Drive! (โปรดระบุ Script URL และ Folder ID ในหน้าคลาวด์)");
            return;
        }

        const taskId = `upload_${Date.now()}`;
        const safeBookNumber = (newDoc.bookNumber || 'unknown').replace(/[\\\/ :*?"<>|]/g, '-');
        const finalFileName = `${safeBookNumber}_${file.name}`;

        setBackgroundTasks(prev => [...prev, { 
            id: taskId, 
            title: `อัปโหลด: ${file.name}`, 
            status: 'uploading', 
            message: 'กำลังเตรียมไฟล์...', 
            notified: false 
        }]);

        try {
            const reader = new FileReader();
            const base64DataPromise = new Promise<string>((resolve) => {
                reader.onload = async () => {
                    let data = reader.result as string;
                    if (file.type === 'application/pdf' && docCategory === 'INCOMING') {
                        updateTask(taskId, { message: 'กำลังประทับตราเลขรับ...' });
                        try {
                            data = await stampReceiveNumber({
                                fileBase64: data,
                                bookNumber: newDoc.bookNumber || "XXX/XXXX",
                                date: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }),
                                time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.',
                                schoolName: currentSchool.name,
                                schoolLogoBase64: sysConfig.schoolLogoBase64
                            });
                        } catch (e) {
                            console.error("Stamping failed, uploading original", e);
                        }
                    }
                    resolve(data);
                };
            });
            reader.readAsDataURL(file);
            const base64Data = await base64DataPromise;

            updateTask(taskId, { message: 'กำลังอัปโหลดไปที่ Google Drive...' });

            const payload = { 
                folderId: sysConfig.driveFolderId.trim(), 
                fileName: finalFileName, 
                mimeType: file.type, 
                fileData: getCleanBase64(base64Data) 
            }; 
            
            const response = await fetch(sysConfig.scriptUrl.trim(), { 
                method: 'POST', 
                body: JSON.stringify(payload), 
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                redirect: 'follow' 
            }); 
            
            if (!response.ok) throw new Error("Cloud Storage Response Error: " + response.status);

            const result = await response.json(); 
            if (result.status === 'success') { 
                const newAtt: Attachment = { 
                    id: `att_${Date.now()}`, 
                    name: finalFileName, 
                    type: 'LINK', 
                    url: result.viewUrl || result.url, 
                    fileType: file.type 
                };
                setTempAttachments(prev => [...prev, newAtt]); 
                updateTask(taskId, { status: 'done', message: 'อัปโหลดสำเร็จ' });
            } else { 
                throw new Error(result.message); 
            }
        } catch (err: any) {
            updateTask(taskId, { status: 'error', message: `อัปโหลดล้มเหลว: ${err.message || 'ตรวจสัญญาณอินเทอร์เน็ต'}` });
        }
    };

    const processActionInBackground = async (targetDoc: DocumentItem, finalCommand: string, targetTeachers: string[], targetPage: number, nextStatus: any, viceId?: string) => {
        const taskId = targetDoc.id;
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        
        try {
            const isActorVice = targetDoc.status === 'PendingViceDirector' || (targetDoc.assignedViceDirectorId === currentUser.id);
            const stampAlignment = isActorVice ? 'left' : 'right';
            
            const signatureToUse = currentUser.signatureBase64;
            
            if (!signatureToUse) {
                throw new Error("ไม่พบข้อมูลลายเซ็นของท่าน กรุณาอัปโหลดลายเซ็นในเมนู 'ข้อมูลส่วนตัว' ก่อนดำเนินการ");
            }

            const firstAtt = targetDoc.attachments[0];
            const baseFile = targetDoc.signedFileUrl || (firstAtt?.fileType === 'application/pdf' ? firstAtt.url : null);
            let pdfBase64 = null;

            if (baseFile) {
                const fileId = getGoogleDriveId(baseFile);
                
                if (fileId && sysConfig?.scriptUrl) {
                    updateTask(taskId, { message: 'กำลังดึงไฟล์ผ่าน Cloud Proxy...' });
                    try {
                        const proxyResp = await fetch(sysConfig.scriptUrl.trim(), {
                            method: 'POST',
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify({ action: 'read', fileId: fileId }),
                            redirect: 'follow'
                        });
                        
                        if (!proxyResp.ok) throw new Error("Cloud Proxy Connection Failed (HTTP " + proxyResp.status + ")");
                        const proxyData = await proxyResp.json();
                        
                        if (proxyData.status === 'success' && proxyData.fileData) {
                            pdfBase64 = `data:application/pdf;base64,${proxyData.fileData}`;
                        } else {
                            throw new Error(proxyData.message || "Drive denied access to file");
                        }
                    } catch (proxyError: any) {
                        console.error("GAS Proxy Error:", proxyError);
                        updateTask(taskId, { message: 'Proxy หลักขัดข้อง กำลังใช้ทางสำรอง...' });
                        const dlUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                        const allOriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(dlUrl)}`;
                        const resp = await fetch(allOriginsUrl);
                        if (!resp.ok) throw new Error("ไม่สามารถดึงไฟล์ได้ (โปรดตรวจสอบการเปิดแชร์ไฟล์เป็น Anyone with link)");
                        const blob = await resp.blob();
                        pdfBase64 = await new Promise<string>((res, rej) => {
                            const r = new FileReader(); 
                            r.onload = () => res(r.result as string); 
                            r.onerror = () => rej(new Error("File Read Failed"));
                            r.readAsDataURL(blob);
                        });
                    }
                } else if (baseFile && baseFile.startsWith('data:')) {
                    pdfBase64 = baseFile;
                } else if (baseFile) {
                    updateTask(taskId, { message: 'กำลังดาวน์โหลดไฟล์แนบ...' });
                    const resp = await fetch(baseFile);
                    if (!resp.ok) throw new Error("Cannot fetch external file");
                    const blob = await resp.blob();
                    pdfBase64 = await new Promise<string>((res) => {
                        const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob);
                    });
                }

                updateTask(taskId, { message: 'กำลังประทับตราดิจิทัลและลงนาม...' });
                pdfBase64 = await stampPdfDocument({
                    fileUrl: pdfBase64 || '', fileType: 'application/pdf', notifyToText: '', commandText: finalCommand,
                    directorName: currentUser.name, 
                    directorPosition: currentUser.position, 
                    signatureImageBase64: signatureToUse,
                    schoolName: currentSchool.name, 
                    schoolLogoBase64: sysConfig?.schoolLogoBase64, targetPage, 
                    onStatusChange: (m) => updateTask(taskId, { message: m }),
                    signatureScale: sysConfig?.directorSignatureScale || 1, 
                    signatureYOffset: sysConfig?.directorSignatureYOffset || 0,
                    alignment: stampAlignment
                });
            } else {
                updateTask(taskId, { message: 'กำลังสร้างใบสั่งการใหม่...' });
                pdfBase64 = await stampPdfDocument({
                    fileUrl: '', fileType: 'new', notifyToText: '', commandText: finalCommand,
                    directorName: currentUser.name, 
                    directorPosition: currentUser.position, 
                    signatureImageBase64: signatureToUse,
                    schoolName: currentSchool.name, 
                    schoolLogoBase64: sysConfig?.schoolLogoBase64, targetPage: 1,
                    onStatusChange: (m) => updateTask(taskId, { message: m }),
                    alignment: stampAlignment
                });
            }

            let signedUrl = null;
            if (pdfBase64 && sysConfig?.scriptUrl) {
                updateTask(taskId, { status: 'uploading', message: 'กำลังบันทึกไฟล์ข้อสั่งการลงคลาวด์...' });
                const safeBookNumber = targetDoc.bookNumber.replace(/[\\\/ :*?"<>|]/g, '-');
                const finalFileName = `${safeBookNumber}_signed.pdf`;

                const payload = { 
                    folderId: sysConfig.driveFolderId.trim(), 
                    fileName: finalFileName, 
                    mimeType: 'application/pdf', 
                    fileData: getCleanBase64(pdfBase64) 
                };

                const upRespWithUrl = await fetch(sysConfig.scriptUrl.trim(), { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload),
                    redirect: 'follow'
                });
                
                if (!upRespWithUrl.ok) throw new Error("Cloud Storage Response Error: " + upRespWithUrl.status);

                const upRes = await upRespWithUrl.json();
                if (upRes.status === 'success') {
                    signedUrl = upRes.viewUrl || upRes.url;
                } else {
                    throw new Error(upRes.message || "Cloud Storage Save Failed");
                }
            }

            updateTask(taskId, { message: 'บันทึกสถานะลงฐานข้อมูล SQL...' });
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

            const { error: dbError } = await client.from('documents').update(updateData).eq('id', taskId);
            if (dbError) throw dbError;

            const notifyIds = nextStatus === 'PendingViceDirector' ? [viceId!] : targetTeachers;
            if (notifyIds.length > 0) {
                const notifyList = allTeachers.filter(t => notifyIds.includes(t.id));
                const notifyAttachments = [...targetDoc.attachments];
                if (signedUrl) {
                    notifyAttachments.unshift({ id: 'signed', name: 'บันทึกข้อสั่งการ (ลงนามแล้ว)', type: 'LINK', url: signedUrl });
                }
                triggerTelegramNotification(notifyList, taskId, targetDoc.title, false, targetDoc.bookNumber, isActorVice ? currentSchool.name : (targetDoc.from || ''), notifyAttachments);
            }
            updateTask(taskId, { status: 'done', message: 'ดำเนินการสำเร็จ' }); 
            fetchDocs();
        } catch (e: any) { 
            console.error("Action Background Error:", e);
            updateTask(taskId, { status: 'error', message: `ล้มเหลว: ${e.message || "Failed to fetch (Check Internet/Script URL)"}` }); 
            alert(e.message);
        }
    };

    const handleQuickDelegateToVice = async () => {
        const client = supabase;
        if (!selectedDoc || !assignedViceDirId || !client) {
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
            const { error } = await client.from('documents').update({
                status: 'PendingViceDirector',
                assigned_vice_director_id: assignedViceDirId,
                director_command: finalCommand,
                director_signature_date: nowStr
            }).eq('id', taskId);

            if (error) throw error;
            if (vice) triggerTelegramNotification([vice], taskId, selectedDoc.title, false, selectedDoc.bookNumber, currentSchool.name, selectedDoc.attachments);
            updateTask(taskId, { status: 'done', message: 'มอบหมายสำเร็จ' });
            fetchDocs();
        } catch (e: any) {
            updateTask(taskId, { status: 'error', message: `ล้มเหลว: ${e.message}` });
        }
    };

    const handleDirectorAction = (isAckOnly: boolean) => {
        if (!selectedDoc) return;
        if (!sysConfig?.scriptUrl) { alert("โปรดตั้งค่า Script URL ในเมนูคลาวด์ก่อน"); return; }
        const currentCommand = command || (isAckOnly ? 'รับทราบ' : 'ดำเนินการตามเสนอ');
        setBackgroundTasks(prev => [...prev, { id: selectedDoc.id, title: selectedDoc.title, status: 'processing', message: 'เริ่มงาน...', notified: false }]);
        setViewMode('LIST');
        processActionInBackground(selectedDoc, currentCommand, [...selectedTeachers], stampPage, 'Distributed');
    };

    const handleViceDirectorAction = () => {
        if (!selectedDoc) return;
        if (!sysConfig?.scriptUrl) { alert("โปรดตั้งค่า Script URL ในเมนูคลาวด์ก่อน"); return; }
        const finalCommand = command || 'ดำเนินการตามเสนอ';
        setBackgroundTasks(prev => [...prev, { id: selectedDoc.id, title: selectedDoc.title, status: 'processing', message: 'กำลังเริ่มการลงนาม...', notified: false }]);
        setViewMode('LIST');
        processActionInBackground(selectedDoc, finalCommand, [...selectedTeachers], stampPage, 'Distributed');
    };

    const handleOpenAndAck = (docItem: DocumentItem, url: string) => {
        if (!url) return; 
        const viewUrl = getPreviewUrl(url);
        window.open(viewUrl, '_blank');
        handleTeacherAcknowledge(docItem.id, docItem.acknowledgedBy || []);
    };

    const filteredDocs = docs.filter(doc => {
        let isVisible = false;
        if (isDirector || isDocOfficer || isSystemAdmin) {
            isVisible = true;
        } else if (isViceDirector || (doc.assignedViceDirectorId === currentUser.id)) {
            isVisible = (doc.status === 'PendingViceDirector' && doc.assignedViceDirectorId === currentUser.id) ||
                        (doc.status === 'Distributed' && (doc.targetTeachers || []).includes(currentUser.id));
        } else {
            isVisible = doc.status === 'Distributed' && (doc.targetTeachers || []).includes(currentUser.id);
        }

        if (!isVisible) return false;

        // Tab Filtering
        if (activeTab === 'INCOMING' && doc.category !== 'INCOMING') return false;
        if (activeTab === 'ORDER' && doc.category !== 'ORDER') return false;

        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
            doc.title.toLowerCase().includes(s) || 
            doc.bookNumber.toLowerCase().includes(s) || 
            doc.from.toLowerCase().includes(s)
        );
    });

    const totalPages = Math.ceil(filteredDocs.length / ITEMS_PER_PAGE);
    const displayedDocs = filteredDocs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const goToPage = (p: number) => { if (p >= 1 && p <= totalPages) setCurrentPage(p); };

    // Helper for rendering teacher selection grid
    const TeacherSelectionGrid = ({ selectedIds, onToggle, currentSearch, onSearchChange }: { 
        selectedIds: string[], 
        onToggle: (ids: string[]) => void,
        currentSearch: string,
        onSearchChange: (val: string) => void
    }) => {
        const filtered = teachersInSchool.filter(t => 
            t.name.toLowerCase().includes(currentSearch.toLowerCase()) || 
            t.position.toLowerCase().includes(currentSearch.toLowerCase())
        );

        return (
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row gap-3 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                        <input 
                            type="text" 
                            placeholder="ค้นชื่อครู..." 
                            value={currentSearch}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 text-sm border-2 border-slate-400 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm text-slate-900 font-bold"
                        />
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <button 
                            type="button" 
                            onClick={() => onToggle(teachersInSchool.map(t => t.id))}
                            className="flex-1 md:flex-none px-3 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-100 transition-colors border-2 border-blue-200"
                        >
                            เลือกทั้งหมด
                        </button>
                        <button 
                            type="button" 
                            onClick={() => onToggle([])}
                            className="flex-1 md:flex-none px-3 py-2 bg-slate-50 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors border-2 border-slate-300"
                        >
                            ล้างทั้งหมด
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[250px] overflow-y-auto p-1 custom-scrollbar">
                    {filtered.map(t => {
                        const isSelected = selectedIds.includes(t.id);
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                    if (isSelected) onToggle(selectedIds.filter(id => id !== t.id));
                                    else onToggle([...selectedIds, t.id]);
                                }}
                                className={`p-3 rounded-xl border-2 text-left transition-all duration-200 hover:scale-[1.02] active:scale-95 ${
                                    isSelected 
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                                    : 'bg-white border-slate-300 text-slate-600 hover:border-blue-400'
                                }`}
                            >
                                <div className="font-bold text-xs truncate">{t.name}</div>
                                <div className={`text-[9px] truncate mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                    {t.position}
                                </div>
                            </button>
                        );
                    })}
                    {filtered.length === 0 && (
                        <div className="col-span-full py-10 text-center text-slate-400 italic text-sm">ไม่พบรายชื่อที่ค้นหา</div>
                    )}
                </div>
                
                {selectedIds.length > 0 && (
                    <div className="p-3 bg-blue-50 rounded-xl border-2 border-blue-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-700">เลือกแล้ว {selectedIds.length} ท่าน</span>
                        <div className="flex -space-x-2">
                            {selectedIds.slice(0, 5).map(id => (
                                <div key={id} className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-bold">
                                    {(teachersInSchool.find(t => t.id === id)?.name || '?')[0]}
                                </div>
                            ))}
                            {selectedIds.length > 5 && (
                                <div className="w-6 h-6 rounded-full bg-slate-300 border-2 border-white flex items-center justify-center text-[10px] text-slate-600 font-bold">
                                    +{selectedIds.length - 5}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (isLoading) return <div className="p-10 text-center text-slate-500"><Loader className="animate-spin inline mr-2" /> กำลังโหลดข้อมูล...</div>;

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
                        <div className="flex items-center gap-3">
                            <h2 className="text-xl font-bold tracking-tight">ระบบงานสารบรรณโรงเรียน</h2>
                            <div className="bg-blue-500/20 text-blue-300 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-500/20">SQL Real-time Synchronization</div>
                            {latestTask && (<div className="hidden lg:flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-full border border-slate-600 animate-fade-in max-w-md">{latestTask.status === 'processing' || latestTask.status === 'uploading' ? (<Loader size={14} className="animate-spin text-blue-400" />) : latestTask.status === 'done' ? (<Zap size={14} className="text-yellow-400 fill-current" />) : <AlertTriangle size={14} className="text-red-400" />}<span className="text-[11px] font-medium text-slate-300 truncate">{latestTask.status === 'done' ? `สำเร็จ: ${latestTask.title}` : latestTask.message}</span></div>)}
                        </div>
                        <p className="text-slate-400 text-xs mt-1">ผู้ใช้งาน: <span className="font-bold text-yellow-400">{currentUser.name}</span></p>
                    </div>
                    <div className="flex items-center gap-3"><div className="relative"><button type="button" onClick={() => setShowTaskQueue(!showTaskQueue)} className={`p-2 rounded-full transition-all hover:bg-slate-700 relative ${activeTasks.length > 0 ? 'bg-blue-600 shadow-lg' : 'bg-slate-700'}`}><Bell size={20} className={activeTasks.length > 0 ? 'animate-bounce' : ''}/>{(activeTasks.length > 0 || doneTasksCount > 0) && (<span className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full border-2 border-slate-800 ${activeTasks.length > 0 ? 'bg-blue-500' : 'bg-emerald-500'} text-white`}>{activeTasks.length || doneTasksCount}</span>)}</button></div></div>
                </div>
            </div>

            {viewMode === 'LIST' && (
                <>
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-100 w-full md:w-auto">
                            <button onClick={() => setActiveTab('ALL')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'ALL' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>ทั้งหมด</button>
                            <button onClick={() => setActiveTab('INCOMING')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'INCOMING' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>หนังสือรับ</button>
                            <button onClick={() => setActiveTab('ORDER')} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'ORDER' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}>คำสั่งโรงเรียน</button>
                        </div>
                        <div className="flex flex-col md:flex-row flex-1 justify-end items-center gap-4 w-full">
                            <div className="relative flex-1 w-full md:max-w-md group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="ค้นหาเรื่อง, เลขที่หนังสือ, หน่วยงาน..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border-2 border-slate-400 focus:outline-none focus:ring-4 ring-blue-50 shadow-sm transition-all text-slate-900 font-bold" 
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                                    >
                                        <X size={16}/>
                                    </button>
                                )}
                            </div>
                            {(isDocOfficer || isSystemAdmin) && (
                                <button type="button" onClick={() => { const currentThaiYear = String(new Date().getFullYear() + 543); let maxNum = 0; docs.forEach(d => { const parts = d.bookNumber.split('/'); if (parts.length === 2 && parts[1].trim() === currentThaiYear) { const num = parseInt(parts[0].trim()); if (!isNaN(num) && num > maxNum) maxNum = num; } }); setNewDoc({ bookNumber: `${String(maxNum + 1).padStart(3, '0')}/${currentThaiYear}`, title: '', from: '', priority: 'Normal', description: '' }); setDocCategory('INCOMING'); setTempAttachments([]); setSelectedTeachers([]); setViewMode('CREATE'); }} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl shadow-lg shadow-blue-100 flex items-center gap-2 font-black transition-all hover:scale-105 active:scale-95 w-full md:w-auto justify-center text-sm">
                                    <FilePlus size={18} /> ลงรับ/สร้างหนังสือ
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col gap-4">
                        {displayedDocs.length === 0 ? (
                            <div className="text-center py-20 text-slate-400 bg-white rounded-xl border border-dashed flex flex-col items-center gap-2">
                                <Search size={48} className="opacity-20" />
                                <p>{searchTerm ? `ไม่พบข้อมูลที่ค้นหาสำหรับ "${searchTerm}"` : 'ไม่มีรายการหนังสือราชการ'}</p>
                                {searchTerm && <button onClick={() => setSearchTerm('')} className="text-blue-600 text-sm font-bold hover:underline">ล้างการค้นหา</button>}
                            </div>
                        ) : displayedDocs.map((docItem, index) => {
                             const isUnread = docItem.status === 'Distributed' && (docItem.targetTeachers || []).includes(currentUser.id) && !docItem.acknowledgedBy?.includes(currentUser.id);
                             const isAcknowledged = docItem.acknowledgedBy?.includes(currentUser.id);
                             const backgroundTask = backgroundTasks.find(t => t.id === docItem.id);
                             const isProcessing = backgroundTask && (backgroundTask.status === 'processing' || backgroundTask.status === 'uploading');
                             const isNewForDirector = isDirector && docItem.status === 'PendingDirector';
                             const isNewForVice = (isViceDirector || docItem.assignedViceDirectorId === currentUser.id) && docItem.status === 'PendingViceDirector' && docItem.assignedViceDirectorId === currentUser.id;
                             
                             const totalTargetCount = docItem.targetTeachers?.length || 0;
                             const ackCount = docItem.acknowledgedBy?.length || 0;

                             return (
                                <div key={docItem.id} className={`group bg-white p-5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden flex flex-row items-center gap-6 ${isNewForDirector || isNewForVice ? 'border-amber-400 shadow-lg' : isUnread ? 'border-blue-400 shadow-lg' : 'border-slate-50 hover:border-blue-200 hover:shadow-md'} ${isProcessing ? 'opacity-70 pointer-events-none' : ''}`} onClick={() => { setSelectedDoc(docItem); setViewMode('DETAIL'); }}>
                                    {(isNewForDirector || isNewForVice) && !isProcessing && (<div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-4 py-1 rounded-bl-xl shadow-lg z-10 flex items-center gap-1 animate-pulse"><Bell size={10} className="fill-current"/> หนังสือเข้าใหม่ !</div>)}
                                    
                                    {/* Left: Icon */}
                                    <div className={`p-4 rounded-xl shrink-0 transition-transform group-hover:scale-110 duration-500 ${docItem.status === 'Distributed' ? (docItem.category === 'ORDER' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600') : 'bg-slate-50 text-slate-400'}`}>
                                        {docItem.category === 'ORDER' ? <Megaphone size={24}/> : <FileText size={24} />}
                                    </div>

                                    {/* Middle: Content */}
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded ${docItem.category === 'ORDER' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                                {docItem.category === 'ORDER' ? 'เลขที่คำสั่ง' : 'รับที่'}: {docItem.bookNumber}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${docItem.priority === 'Critical' ? 'bg-red-500 text-white border-red-500 shadow-sm animate-pulse' : docItem.priority === 'Urgent' ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                {docItem.priority === 'Normal' ? 'ปกติ' : docItem.priority === 'Urgent' ? 'ด่วน' : 'ด่วนที่สุด'}
                                            </span>
                                            {isUnread && <span className="text-[10px] text-blue-600 font-black animate-pulse px-2 bg-blue-50 rounded-full">NEW</span>}
                                            {isAcknowledged && <span className="bg-green-100 text-green-700 text-[10px] px-2 py-1 rounded-full font-black border border-green-200">รับทราบแล้ว</span>}
                                        </div>
                                        
                                        <h3 className="font-bold text-lg text-slate-800 truncate group-hover:text-blue-600 transition-colors leading-tight">
                                            {docItem.title}
                                        </h3>
                                        
                                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[11px] text-slate-400 font-bold uppercase tracking-tight">
                                            <span className="flex items-center gap-1.5"><History size={12} className="text-slate-300"/> จาก: {docItem.from}</span>
                                            <span className="flex items-center gap-1.5"><Clock size={12} className="text-slate-300"/> {docItem.date}</span>
                                            {docItem.status === 'Distributed' && totalTargetCount > 0 && (
                                                <span className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full text-[9px] border border-blue-100 font-black">
                                                    <Users size={12}/> รับทราบแล้ว {ackCount}/{totalTargetCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Right: Actions / Status */}
                                    <div className="flex flex-col items-end shrink-0 gap-2 min-w-[140px]">
                                        {docItem.status === 'PendingDirector' && <span className="bg-yellow-100 text-yellow-700 text-[9px] px-3 py-1 rounded-lg font-black uppercase tracking-wider flex items-center gap-1 shadow-sm"><Users size={12}/> รอ ผอ. เกษียณ</span>}
                                        {docItem.status === 'PendingViceDirector' && <span className="bg-blue-100 text-blue-700 text-[9px] px-3 py-1 rounded-lg font-black uppercase tracking-wider flex items-center gap-1 shadow-sm"><UserCheck size={12}/> รอตรวจสอบ/สั่งการ</span>}
                                        
                                        <div className="flex items-center gap-2">
                                            {isDirector && (
                                                <button type="button" onClick={async (e) => { e.stopPropagation(); if (!confirm("ยืนยันการลบหนังสือฉบับนี้?")) return; const client = supabase; if (!client) return; const { error } = await client.from('documents').delete().eq('id', docItem.id); if (error) alert("ลบไม่สำเร็จ: " + error.message); else { setDocs(docs.filter(d => d.id !== docItem.id)); } }} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16}/></button>
                                            )}
                                            <div className="p-2 bg-slate-50 rounded-lg text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-50 transition-all">
                                                <ChevronRight size={18}/>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                             );
                        })}
                    </div>
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 mt-12 bg-white p-3 rounded-2xl w-fit mx-auto shadow-sm border border-slate-100">
                            <button type="button" onClick={() => goToPage(1)} disabled={currentPage === 1} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:bg-white hover:text-blue-600 transition-all disabled:opacity-30"><ChevronsLeft size={20}/></button>
                            <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:bg-white hover:text-blue-600 transition-all disabled:opacity-30"><ChevronLeft size={20}/></button>
                            <div className="flex items-center gap-2 mx-4">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                    <button 
                                        key={p} 
                                        onClick={() => goToPage(p)} 
                                        className={`w-10 h-10 rounded-xl font-bold transition-all ${currentPage === p ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-blue-50'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:bg-white hover:text-blue-600 transition-all disabled:opacity-30"><ChevronRight size={20}/></button>
                            <button type="button" onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:bg-white hover:text-blue-600 transition-all disabled:opacity-30"><ChevronsRight size={20}/></button>
                        </div>
                    )}
                </>
            )}

            {viewMode === 'CREATE' && (
                <div className="animate-slide-up">
                    <button onClick={() => setViewMode('LIST')} className="mb-6 flex items-center gap-2 text-slate-500 font-bold"><ArrowLeft size={18}/> ย้อนกลับ</button>
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                        <h2 className="text-2xl font-black text-slate-800 mb-6">ลงรับหนังสือ / สร้างคำสั่ง</h2>
                        <div className="space-y-4">
                            <input placeholder="เลขที่หนังสือ" className="w-full px-4 py-2 border rounded-xl" value={newDoc.bookNumber} onChange={e => setNewDoc({...newDoc, bookNumber: e.target.value})}/>
                            <input placeholder="เรื่อง" className="w-full px-4 py-2 border rounded-xl" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})}/>
                            <textarea placeholder="รายละเอียด" className="w-full px-4 py-2 border rounded-xl" value={newDoc.description} onChange={e => setNewDoc({...newDoc, description: e.target.value})}/>
                        </div>
                        <button onClick={() => setViewMode('LIST')} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold">บันทึกข้อมูล (Mockup)</button>
                    </div>
                </div>
            )}

            {viewMode === 'DETAIL' && selectedDoc && (
                <div className="animate-slide-up">
                    <button onClick={() => setViewMode('LIST')} className="mb-6 flex items-center gap-2 text-slate-500 font-bold transition-all hover:text-blue-600"><ArrowLeft size={18}/> ย้อนกลับ</button>
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                        <h2 className="text-3xl font-black text-slate-800 mb-4">{selectedDoc.title}</h2>
                        <div className="bg-slate-50 p-6 rounded-2xl mb-8">
                            <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{selectedDoc.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
                        </div>
                        <div className="flex gap-4">
                            {selectedDoc.attachments.map(att => (
                                <button key={att.id} onClick={() => handleOpenAndAck(selectedDoc, att.url)} className="flex items-center gap-2 p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                    <DownloadCloud size={18}/> {att.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentsSystem;
