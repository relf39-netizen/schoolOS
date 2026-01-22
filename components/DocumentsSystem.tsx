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
        signed_file_url: d.signedFileUrl,
        assigned_vice_director_id: d.assignedViceDirectorId,
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
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                    <button 
                                        key={page} 
                                        onClick={() => goToPage(page)} 
                                        className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${currentPage === page ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-slate-50'}`}
                                    >
                                        {page}
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
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-10 max-w-5xl mx-auto relative overflow-hidden animate-slide-up">
                    <div className="mb-10 border-b pb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 flex items-center gap-4"><FilePlus className="text-blue-700" size={28}/> ลงทะเบียนรับหนังสือ / สร้างคำสั่ง</h3>
                            <p className="text-slate-500 font-bold mt-2">Document Registration System</p>
                        </div>
                        <div className="bg-slate-100 p-1.5 rounded-2xl flex shadow-inner">
                            <button type="button" onClick={() => setDocCategory('INCOMING')} className={`px-8 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-all ${docCategory === 'INCOMING' ? 'bg-white text-blue-700 shadow-md' : 'text-slate-600'}`}><FileBadge size={16}/> หนังสือรับภายนอก</button>
                            <button type="button" onClick={() => setDocCategory('ORDER')} className={`px-8 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-all ${docCategory === 'ORDER' ? 'bg-emerald-700 text-white shadow-md' : 'text-slate-600'}`}><Megaphone size={16}/> คำสั่งปฏิบัติราชการ</button>
                        </div>
                    </div>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const client = supabase;
                        if (!newDoc.bookNumber || !client) return;
                        const isOrder = docCategory === 'ORDER';
                        const now = new Date();
                        const created: any = {
                            schoolId: currentUser.schoolId, category: docCategory, bookNumber: newDoc.bookNumber, title: newDoc.title, description: newDoc.description,
                            from: isOrder ? (currentSchool.name) : newDoc.from, date: now.toISOString().split('T')[0], timestamp: now.toLocaleTimeString('th-TH', {hour:'2-digit', minute:'2-digit'}),
                            priority: newDoc.priority, attachments: tempAttachments, status: isOrder ? 'Distributed' : 'PendingDirector', targetTeachers: isOrder ? selectedTeachers : [], acknowledgedBy: [],
                            directorCommand: isOrder ? 'สั่งการตามเอกสารแนบ' : '', directorSignatureDate: isOrder ? now.toLocaleString('th-TH') : ''
                        };
                        const { data, error } = await client.from('documents').insert([mapDocToDb(created)]).select();
                        if (!error && data) {
                            const savedDocId = data[0].id.toString();
                            
                            if (isOrder && selectedTeachers.length > 0) {
                                triggerTelegramNotification(allTeachers.filter(t => selectedTeachers.includes(t.id)), savedDocId, created.title, true, created.bookNumber, currentSchool.name, tempAttachments);
                            } else if (!isOrder) {
                                const directors = allTeachers.filter(t => t.schoolId === currentUser.schoolId && t.roles.includes('DIRECTOR'));
                                if (directors.length > 0) {
                                    triggerTelegramNotification(directors, savedDocId, created.title, false, created.bookNumber, created.from, tempAttachments);
                                }
                            }
                            
                            setNewDoc({ bookNumber: '', title: '', from: '', priority: 'Normal', description: '' });
                            setTempAttachments([]); setSelectedTeachers([]); setViewMode('LIST'); fetchDocs();
                        } else { alert("บันทึกล้มเหลว: " + error?.message); }
                    }} className="space-y-10">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                                <div className="w-full">
                                    <div className="p-4 bg-white rounded-2xl border-2 border-slate-400 shadow-sm group transition-all focus-within:ring-4 ring-blue-50">
                                        <label className="block text-[11px] font-black text-slate-700 mb-1 ml-1 uppercase tracking-tight">{docCategory === 'ORDER' ? 'เลขที่คำสั่ง' : 'เลขที่รับ (แก้ไขได้)'}</label>
                                        <input required type="text" value={newDoc.bookNumber} onChange={e => setNewDoc({...newDoc, bookNumber: e.target.value})} className="w-full bg-transparent border-none font-bold text-xl outline-none text-slate-900 placeholder:text-slate-300 font-mono"/>
                                    </div>
                                </div>
                                <div className="w-full">
                                    <label className="block text-sm font-black text-slate-700 mb-1 ml-1">เรื่อง</label>
                                    <input required type="text" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="w-full px-4 py-4 bg-white border-2 border-slate-400 rounded-2xl font-bold outline-none focus:border-blue-600 shadow-sm transition-all text-slate-900" />
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    {docCategory === 'INCOMING' && (
                                        <div>
                                            <label className="block text-sm font-black text-slate-700 mb-1 ml-1">จาก</label>
                                            <input required type="text" value={newDoc.from} onChange={e => setNewDoc({...newDoc, from: e.target.value})} className="w-full px-4 py-3 bg-white border-2 border-slate-400 rounded-2xl font-bold outline-none focus:border-blue-600 transition-all text-slate-900" />
                                        </div>
                                    )}
                                    <div className={docCategory === 'ORDER' ? 'col-span-2' : ''}>
                                        <label className="block text-sm font-black text-slate-700 mb-1 ml-1">ความเร่งด่วน</label>
                                        <select value={newDoc.priority} onChange={e => setNewDoc({...newDoc, priority: e.target.value as any})} className="w-full px-4 py-3 bg-white border-2 border-slate-400 rounded-2xl font-bold outline-none focus:border-blue-600 appearance-none cursor-pointer transition-all text-slate-900">
                                            <option value="Normal">ปกติ</option>
                                            <option value="Urgent">ด่วน</option>
                                            <option value="Critical">ด่วนที่สุด</option>
                                        </select>
                                    </div>
                                </div>
                                <div><label className="block text-sm font-black text-slate-700 mb-1 ml-1">รายละเอียดเพิ่มเติม</label><textarea rows={3} value={newDoc.description} onChange={e => setNewDoc({...newDoc, description: e.target.value})} className="w-full px-4 py-3 border-2 border-slate-400 rounded-3xl outline-none focus:border-blue-600 font-bold bg-white leading-relaxed text-slate-900"></textarea></div>
                            </div>
                            <div className="space-y-8">
                                <div className="p-8 bg-white rounded-3xl border-2 border-slate-400 border-dashed relative group">
                                    <h4 className="text-sm font-bold text-slate-700 mb-6 flex items-center gap-3 tracking-widest"><UploadCloud size={20} className="text-blue-600"/> ไฟล์แนบ (อัปโหลดหรือใช้ลิงก์คลาวด์)</h4>
                                    <div className="space-y-3 mb-6 max-h-56 overflow-y-auto p-1 custom-scrollbar">
                                        {tempAttachments.map(att => (
                                            <div key={att.id} className="p-4 flex justify-between items-center bg-white border-2 border-slate-200 rounded-2xl shadow-sm animate-fade-in group/item">
                                                <div className="flex items-center gap-3 truncate font-bold text-slate-700 text-[11px]">
                                                    {att.fileType?.includes('pdf') ? <FileCheck size={16} className="text-emerald-500"/> : <LinkIcon size={16} className="text-blue-600"/>}
                                                    <span className="truncate max-w-[200px]">{att.name}</span>
                                                </div>
                                                <button type="button" onClick={() => setTempAttachments(prev => prev.filter(a => a.id !== att.id))} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                        {backgroundTasks.filter(t => (t.id.startsWith('upload_') || t.id.startsWith('fetch_')) && (t.status === 'uploading' || t.status === 'processing')).map(task => (
                                            <div key={task.id} className="p-3 flex flex-col gap-2 text-[10px] bg-blue-50 border-2 border-blue-200 rounded-2xl animate-pulse">
                                                <div className="flex items-center gap-2 font-black text-blue-700">
                                                    <Loader size={14} className="animate-spin"/> <span>{task.message}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <label className="block w-full text-center py-5 bg-white border-2 border-blue-200 rounded-2xl border-dashed cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-all font-black text-blue-700 text-xs shadow-sm">
                                        <input type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) { (Array.from(e.target.files) as File[]).forEach(file => handleFileUploadInBackground(file)); e.target.value = ''; } }} />
                                        <Plus size={16} className="inline mr-2"/> เลือกไฟล์ PDF จากเครื่อง
                                    </label>
                                    
                                    <div className="text-center text-[9px] text-slate-400 font-black my-6 uppercase tracking-[0.3em] flex items-center gap-3 before:content-[''] before:flex-1 before:h-px before:bg-slate-300 after:content-[''] after:flex-1 after:h-px after:bg-slate-300">หรือระบุลิงก์ต้นทาง</div>
                                    
                                    <div className="flex flex-col gap-3">
                                        <input type="text" placeholder="ชื่อเรียกเอกสาร (เช่น ไฟล์แนบ 1)" value={linkNameInput} onChange={e => setLinkNameInput(e.target.value)} className="w-full px-5 py-3.5 border-2 border-slate-300 rounded-xl text-sm outline-none focus:ring-4 ring-blue-50 shadow-inner bg-white font-bold text-slate-800"/>
                                        <div className="flex gap-3">
                                            <input type="text" placeholder="วางลิงก์ไฟล์ https://... .pdf" value={linkInput} onChange={e => setLinkInput(e.target.value)} className="flex-1 px-5 py-3.5 border-2 border-slate-300 rounded-xl text-xs outline-none focus:ring-4 ring-blue-50 shadow-inner bg-white font-mono text-slate-800"/>
                                            <button 
                                                type="button" 
                                                title="จัดเก็บเข้า Drive และปั๊มเลขรับอัตโนมัติ"
                                                onClick={() => { if (linkInput) { handleFetchAndUploadFromUrl(linkInput, linkNameInput); setLinkInput(''); setLinkNameInput(''); } }} 
                                                className="bg-orange-600 text-white px-4 py-3 rounded-xl hover:bg-orange-700 transition-all flex items-center justify-center gap-1 shadow-lg active:scale-95 border-none"
                                            >
                                                <DownloadCloud size={20} color="white" />
                                            </button>
                                            <button 
                                                type="button" 
                                                title="แนบแค่ลิงก์ (ไม่เก็บไฟล์)"
                                                onClick={() => { if (linkInput) { let finalUrl = linkInput.trim(); if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl; setTempAttachments([...tempAttachments, { id: `att_${Date.now()}`, name: linkNameInput || 'ลิงก์เอกสารภายนอก', type: 'LINK', url: finalUrl, fileType: 'external-link' }]); setLinkInput(''); setLinkNameInput(''); } }} 
                                                className="bg-slate-800 text-white px-4 py-3 rounded-xl hover:bg-black transition-colors shadow-lg active:scale-95 border-none"
                                            >
                                                <Plus size={20} color="white" />
                                            </button>
                                        </div>
                                        <p className="text-[9px] text-slate-400 italic mt-1 font-bold">* ปุ่มสีส้ม: ระบบจะใช้ Deep Proxy ดูดไฟล์มาประทับตราและเก็บเข้า Drive ให้ทันที</p>
                                    </div>
                                </div>
                                {docCategory === 'ORDER' && (
                                    <div className="bg-indigo-50/50 p-8 rounded-3xl border-2 border-indigo-200 animate-fade-in shadow-sm">
                                        <h4 className="text-sm font-bold text-indigo-900 uppercase mb-8 flex items-center gap-3 tracking-widest"><Users size={20} className="text-indigo-600"/> เลือกผู้รับปฏิบัติ (คำสั่ง)</h4>
                                        <TeacherSelectionGrid 
                                            selectedIds={selectedTeachers} 
                                            onToggle={setSelectedTeachers}
                                            currentSearch={teacherSearchTerm}
                                            onSearchChange={setTeacherSearchTerm}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-5 pt-10 border-t-2 border-slate-200">
                            <button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-5 bg-slate-200 text-slate-800 rounded-[2rem] font-black uppercase tracking-widest transition-all hover:bg-slate-300 active:scale-95">ยกเลิก</button>
                            <button type="submit" disabled={activeTasks.length > 0} className={`flex-[2] py-5 text-white rounded-[2rem] font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-4 active:scale-95 disabled:grayscale disabled:opacity-50 ${activeTasks.length > 0 ? 'bg-slate-400 cursor-not-allowed' : (docCategory === 'ORDER' ? 'bg-emerald-700 shadow-emerald-200 hover:bg-emerald-800' : 'bg-blue-700 shadow-blue-200 hover:bg-blue-800')}`}>
                                {activeTasks.length > 0 ? <Loader className="animate-spin" size={28} color="white" /> : (docCategory === 'ORDER' ? <Send size={28} color="white" /> : <Save size={28} color="white" />)} 
                                <span style={{ color: 'white' }}>{activeTasks.length > 0 ? 'กำลังประมวลผลไฟล์...' : (docCategory === 'ORDER' ? 'บันทึกและแจ้งบุคลากร' : 'บันทึกและเสนอ ผอ.')}</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {viewMode === 'DETAIL' && selectedDoc && (
                <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
                    <div className="flex justify-between items-center px-2">
                        <button type="button" onClick={() => setViewMode('LIST')} className="flex items-center gap-2 text-slate-400 hover:text-slate-800 font-black uppercase text-xs transition-colors group">
                            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform"/> ย้อนกลับรายการ
                        </button>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">รายละเอียดหนังสือราชการ</h2>
                        <div className="w-20"></div>
                    </div>
                    
                    <div className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-bl-full -z-10"></div>
                        
                        <div className="bg-slate-50 px-10 py-8 border-b flex flex-col md:flex-row justify-between items-start gap-10">
                            <div className="space-y-5 flex-1">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border-2 ${selectedDoc.category === 'ORDER' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                        {selectedDoc.category === 'ORDER' ? 'ประกาศ / คำสั่งโรงเรียน' : 'หนังสือราชการภายนอก'}
                                    </span>
                                    <span className="px-5 py-2 bg-slate-900 text-white rounded-full text-[10px] font-black font-mono tracking-wider shadow-sm">#{selectedDoc.bookNumber}</span>
                                    {selectedDoc.priority !== 'Normal' && (
                                        <span className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border-2 ${selectedDoc.priority === 'Critical' ? 'bg-red-500 text-white border-red-500 shadow-md animate-pulse' : 'bg-orange-100 text-orange-600 border-orange-200'}`}>
                                            {selectedDoc.priority}
                                        </span>
                                    )}
                                </div>
                                <h2 className="text-2xl font-black text-slate-800 leading-tight">{selectedDoc.title}</h2>
                                <div className="flex flex-wrap gap-8 text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em]">
                                    <span className="flex items-center gap-2.5"><History size={18} className="text-slate-300"/> ต้นเรื่อง: {selectedDoc.from}</span>
                                    <span className="flex items-center gap-2.5"><Clock size={18} className="text-slate-300"/> ลงรับเมื่อ: {selectedDoc.date} เวลา {selectedDoc.timestamp}</span>
                                </div>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center p-6 bg-white rounded-[2.5rem] border border-slate-100 shadow-inner min-w-[200px] group transition-all hover:shadow-lg">
                                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">บุคลากรรับทราบ</p>
                                <div className="text-4xl font-black text-blue-600 tracking-tighter">
                                    {(selectedDoc.acknowledgedBy || []).length}
                                    <span className="text-slate-200 mx-2 font-normal">/</span>
                                    {(selectedDoc.targetTeachers || []).length}
                                </div>
                                <div className="w-full h-1.5 bg-slate-100 rounded-full mt-6 overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500 transition-all duration-1000 ease-out" 
                                        style={{ width: `${(((selectedDoc.acknowledgedBy || []).length) / (((selectedDoc.targetTeachers || []).length) || 1)) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <div className="p-10 lg:p-14 space-y-14">
                            <div>
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-xs font-black text-slate-800 uppercase flex items-center gap-3 tracking-[0.2em]">
                                        <Bookmark size={18} className="text-blue-500"/> ไฟล์เอกสารแนบ
                                    </h3>
                                    <span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">คลิกดูไฟล์เพื่อยืนยันรับทราบ</span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {selectedDoc.signedFileUrl && (
                                        <button 
                                            type="button" 
                                            onClick={() => handleOpenAndAck(selectedDoc, selectedDoc.signedFileUrl!)} 
                                            className="p-4 bg-emerald-600 text-white rounded-xl shadow-md flex items-center justify-between hover:bg-emerald-700 transition-all border-2 border-emerald-400 group relative overflow-hidden text-left"
                                        >
                                            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-150 transition-transform"><CheckCircle size={80}/></div>
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm"><FileCheck size={28}/></div>
                                                <div>
                                                    <p className="font-black text-lg leading-none mb-1">บันทึกข้อสั่งการ (ลงนามแล้ว)</p>
                                                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Signed & Final Document</p>
                                                </div>
                                            </div>
                                            <ExternalLink size={20} className="opacity-40 group-hover:opacity-100 transition-opacity z-10"/>
                                        </button>
                                    )}
                                    {selectedDoc.attachments.map((att, idx) => (
                                        <button 
                                            type="button" 
                                            key={idx} 
                                            onClick={() => handleOpenAndAck(selectedDoc, att.url)} 
                                            className="p-4 bg-blue-600 text-white rounded-xl shadow-md flex items-center justify-between hover:bg-blue-700 transition-all border-2 border-blue-400 group relative overflow-hidden text-left"
                                        >
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm"><FileIcon size={28}/></div>
                                                <div>
                                                    <p className="font-black text-base leading-none mb-1 truncate max-w-[400px]">{att.name}</p>
                                                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">คลิกเพื่อเปิดดูเอกสาร PDF</p>
                                                </div>
                                            </div>
                                            <ExternalLink size={20} className="opacity-40 group-hover:opacity-100 transition-opacity z-10"/>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {isDirector && selectedDoc.status === 'PendingDirector' && (
                                <div className="bg-blue-50 p-10 lg:p-14 rounded-[3.5rem] border-2 border-blue-400 shadow-2xl space-y-10 animate-slide-up relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 opacity-5 -z-10"><PenTool size={200}/></div>
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-blue-200 pb-6">
                                        <h3 className="text-xl font-black text-slate-900 flex items-center gap-4">
                                            <PenTool size={24} className="text-blue-700"/> การพิจารณาสั่งการ (ผู้อำนวยการ)
                                        </h3>
                                        <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-2xl border-2 border-blue-100 text-[11px] font-black text-slate-700 shadow-sm">
                                            ประทับตราหน้าที่: <input type="number" min="1" value={stampPage} onChange={e => setStampPage(parseInt(e.target.value))} className="w-12 text-center font-black text-blue-600 bg-slate-50 rounded-lg outline-none border-2 border-slate-200" />
                                        </div>
                                    </div>
                                    
                                    <div className="bg-white p-8 rounded-[2.5rem] border-2 border-blue-200 shadow-inner space-y-6">
                                        <label className="block text-[11px] font-black text-blue-600 uppercase tracking-widest ml-1">ทางเลือกที่ 1: มอบรองผู้อำนวยการดำเนินการแทน</label>
                                        <div className="flex flex-col lg:flex-row gap-5">
                                            <div className="relative flex-1 group">
                                                <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20}/>
                                                <select 
                                                    value={assignedViceDirId} 
                                                    onChange={e => setAssignedViceDirId(e.target.value)} 
                                                    className="w-full pl-12 pr-10 py-4 border-2 border-slate-300 rounded-2xl font-black bg-slate-50 outline-none focus:border-blue-400 appearance-none cursor-pointer text-slate-900"
                                                >
                                                    <option value="">-- เลือกรายชื่อรองผู้อำนวยการ --</option>
                                                    {viceDirectors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.position})</option>)}
                                                </select>
                                                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={20}/>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={handleQuickDelegateToVice} 
                                                className={`px-8 py-3 rounded-2xl font-black shadow-xl transition-all flex items-center justify-center gap-3 active:scale-95 ${assignedViceDirId ? 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`} 
                                                disabled={!assignedViceDirId}
                                            >
                                                <FastForward size={20}/> มอบหมายทันที
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-white p-10 rounded-[3rem] border-2 border-blue-400 shadow-inner space-y-10">
                                        <div className="space-y-4">
                                            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-widest mb-3 ml-2">ระบุข้อความสั่งการ / ความเห็นของผู้บริหาร</label>
                                            <textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="ระบุข้อความ..." className="w-full p-8 bg-slate-50 border-2 border-slate-300 rounded-[2.5rem] h-40 outline-none focus:bg-white focus:ring-8 ring-blue-50 focus:border-blue-500 transition-all font-black text-slate-900 leading-relaxed shadow-inner placeholder:text-slate-200 text-lg" />
                                        </div>
                                        
                                        <div className="p-8 bg-slate-50/50 rounded-[3rem] border-2 border-slate-200 shadow-sm">
                                            <h4 className="text-xs font-black text-slate-900 uppercase mb-8 flex items-center gap-3 tracking-widest"><Users size={20} className="text-slate-600"/> เลือกผู้รับปฏิบัติ / แจ้งเวียนบุคลากร</h4>
                                            <TeacherSelectionGrid 
                                                selectedIds={selectedTeachers} 
                                                onToggle={setSelectedTeachers}
                                                currentSearch={teacherSearchTerm}
                                                onSearchChange={setTeacherSearchTerm}
                                            />
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-5">
                                            <button type="button" onClick={() => handleDirectorAction(true)} className="flex-1 py-4 bg-white border-2 border-emerald-500 text-emerald-700 rounded-[2rem] font-black text-sm uppercase tracking-widest hover:bg-emerald-50 shadow-xl transition-all active:scale-95"><CheckSquare size={20} className="inline mr-2"/> รับทราบ (แจ้งเวียน)</button>
                                            <button type="button" onClick={() => handleDirectorAction(false)} className="flex-[2] py-4 bg-slate-900 text-white rounded-[2rem] font-black text-lg uppercase tracking-widest shadow-2xl hover:bg-black transition-all flex items-center justify-center gap-4 active:scale-95"><PenTool size={28}/> ลงนามสั่งการทันที</button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedDoc.status === 'PendingViceDirector' && (isViceDirector || selectedDoc.assignedViceDirectorId === currentUser.id) && (
                                <div className="bg-indigo-50 p-10 lg:p-14 rounded-[3.5rem] border-2 border-indigo-400 shadow-2xl space-y-10 animate-slide-up relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 opacity-5 -z-10"><PenTool size={200}/></div>
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-b border-indigo-200 pb-6">
                                        <h3 className="text-xl font-black text-slate-900 flex items-center gap-4">
                                            <PenTool size={24} className="text-indigo-700"/> การพิจารณาหนังสือ (ผู้รับมอบหมาย)
                                        </h3>
                                        <div className="flex items-center gap-3 bg-white px-5 py-2.5 rounded-2xl border-2 border-indigo-100 text-[11px] font-black text-slate-700 shadow-sm">
                                            ประทับตราหน้าที่: <input type="number" min="1" value={stampPage} onChange={e => setStampPage(parseInt(e.target.value))} className="w-12 text-center font-black text-blue-600 bg-slate-50 rounded-lg outline-none border-2 border-slate-200" />
                                        </div>
                                    </div>

                                    <div className="p-8 bg-white border-2 border-indigo-400 rounded-[2.5rem] text-md text-indigo-900 font-black italic shadow-inner relative z-10">
                                        <span className="text-[10px] text-slate-600 not-italic block mb-1 uppercase tracking-widest font-black">ความเห็นจากผู้อำนวยการ:</span>
                                        "{selectedDoc.directorCommand || 'มอบพิจารณาดำเนินการ'}"
                                    </div>
                                    
                                    <div className="bg-white p-10 rounded-[3rem] border-2 border-indigo-400 shadow-inner space-y-10">
                                        <div className="space-y-4">
                                            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-widest mb-3 ml-2">ระบุข้อความสั่งการ / ความเห็น</label>
                                            <textarea value={command} onChange={e => setCommand(e.target.value)} placeholder="ระบุข้อความ..." className="w-full p-8 bg-slate-50 border-2 border-slate-300 rounded-[2.5rem] h-40 outline-none focus:bg-white focus:ring-8 ring-indigo-50 focus:border-indigo-500 transition-all font-black text-slate-900 leading-relaxed shadow-inner placeholder:text-slate-200 text-lg" />
                                        </div>
                                        
                                        <div className="p-8 bg-slate-50/50 rounded-[3rem] border-2 border-slate-200 shadow-sm">
                                            <h4 className="text-xs font-black text-slate-900 uppercase mb-8 flex items-center gap-3 tracking-widest"><Users size={20} className="text-slate-600"/> เลือกผู้รับปฏิบัติ / แจ้งเตือน</h4>
                                            <TeacherSelectionGrid 
                                                selectedIds={selectedTeachers} 
                                                onToggle={setSelectedTeachers}
                                                currentSearch={teacherSearchTerm}
                                                onSearchChange={setTeacherSearchTerm}
                                            />
                                        </div>

                                        <button type="button" onClick={handleViceDirectorAction} className="w-full py-4 bg-indigo-600 text-white rounded-[2rem] font-black text-lg uppercase tracking-widest shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 active:scale-95"><PenTool size={28}/> ลงนามและสั่งการบุคลากร</button>
                                    </div>
                                    <p className="text-[10px] text-center text-slate-500 italic font-black">* ระบบจะประทับตราผู้สั่งการที่ฝั่งซ้าย เพื่อความสวยงามและถูกต้องตามระเบียบ</p>
                                </div>
                            )}

                            {selectedDoc.status === 'Distributed' && (
                                <div className="space-y-12 animate-fade-in">
                                    <div className="bg-emerald-50/50 p-12 rounded-[3.5rem] border-2 border-emerald-100 text-center space-y-6 shadow-inner relative overflow-hidden group">
                                        <div className="absolute -top-10 -left-10 w-40 h-40 bg-emerald-100 rounded-full blur-3xl opacity-50 group-hover:scale-150 transition-transform duration-1000"></div>
                                        {selectedDoc.acknowledgedBy?.includes(currentUser.id) ? (
                                            <div className="text-emerald-600 font-black flex flex-col items-center gap-4">
                                                <div className="bg-emerald-100 p-6 rounded-full text-emerald-600 shadow-inner"><CheckCircle size={64} className="animate-bounce"/></div>
                                                <span className="text-3xl tracking-tight leading-none">ท่านได้รับทราบหนังสือฉบับนี้แล้ว</span>
                                                <div className="text-[10px] text-emerald-400 uppercase tracking-[0.3em] font-black">Successfully Acknowledged</div>
                                            </div>
                                        ) : (
                                            <div className="space-y-6">
                                                <div className="bg-blue-100 p-6 rounded-full text-blue-600 w-fit mx-auto shadow-inner"><Info size={48} className="animate-pulse"/></div>
                                                <div className="space-y-2">
                                                    <p className="text-slate-600 font-black text-2xl tracking-tight leading-none">กรุณาคลิกดูไฟล์เพื่อรับทราบ</p>
                                                    <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">ระบบจะบันทึกสถานะรับทราบให้อัตโนมัติเมื่อท่านเปิดอ่าน</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {(isDirector || isDocOfficer || isSystemAdmin) && (
                                        <div className="bg-white border-2 border-slate-50 p-10 rounded-[3.5rem] shadow-sm relative">
                                            <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-3 tracking-[0.2em] mb-10">
                                                <Users size={20} className="text-blue-500"/> สถานะการรับทราบ ({selectedDoc.acknowledgedBy.length}/{selectedDoc.targetTeachers.length})
                                            </h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
                                                {selectedDoc.targetTeachers.map(tid => {
                                                    const t = allTeachers.find(at => at.id === tid);
                                                    const isRead = selectedDoc.acknowledgedBy.includes(tid);
                                                    return (
                                                        <div key={tid} className={`p-4 rounded-2xl border transition-all flex flex-col gap-3 group relative ${isRead ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100 grayscale opacity-60'}`}>
                                                            <div className="flex justify-between items-center">
                                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${isRead ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                                                    {t?.name[0] || '?'}
                                                                </div>
                                                                {isRead ? <CheckCircle size={16} className="text-emerald-500"/> : <Clock size={16} className="text-slate-300"/>}
                             </div>
                                                            <div className="truncate">
                                                                <p className={`text-[11px] font-black truncate ${isRead ? 'text-emerald-900' : 'text-slate-500'}`}>{t?.name || tid}</p>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase truncate mt-0.5">{t?.position}</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <style>{`@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } } .animate-shimmer { animation: shimmer 2s infinite linear; } .custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }`}</style>
        </div>
    );
};
export default DocumentsSystem;