
import React, { useState, useEffect, useRef } from 'react';
import { DocumentItem, Teacher, Attachment, SystemConfig } from '../types';
import { MOCK_DOCUMENTS, CURRENT_SCHOOL_YEAR } from '../constants';
import { Search, FileText, Users, PenTool, CheckCircle, FilePlus, Eye, CheckSquare, Loader, Link as LinkIcon, Download, Trash2, File as FileIcon, ExternalLink, Plus, UploadCloud, AlertTriangle, Monitor, FileCheck, ArrowLeft, Send, MousePointerClick, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, updateDoc, where, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { stampPdfDocument, stampReceiveNumber } from '../utils/pdfStamper';

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
    const [isSigning, setIsSigning] = useState(false);
    const [processingMessage, setProcessingMessage] = useState('');
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    
    // System Config State
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    
    const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'DETAIL'>('LIST');
    const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);

    // Form State (Admin)
    const [newDoc, setNewDoc] = useState({ 
        bookNumber: '', // Added custom book number
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
    
    // Ref for capturing the document paper (Preview only now)
    const paperRef = useRef<HTMLDivElement>(null);

    // --- Roles Checking ---
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');

    // --- Helpers ---
    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    // Generate Next Book Number Logic
    const generateNextBookNumber = (currentDocs: DocumentItem[]) => {
        let maxNum = 0;
        currentDocs.forEach(d => {
            // Try to parse "XXX/YYYY"
            const parts = d.bookNumber.split('/');
            const num = parseInt(parts[0]);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        });
        // Increment and Format
        return `${String(maxNum + 1).padStart(3, '0')}/${CURRENT_SCHOOL_YEAR}`;
    };

    // Init Create Form
    const handleInitCreate = () => {
        const nextNum = generateNextBookNumber(docs);
        setNewDoc({
            bookNumber: nextNum,
            title: '',
            from: '',
            priority: 'Normal',
            description: ''
        });
        setTempAttachments([]);
        setViewMode('CREATE');
    };

    // Helper to convert Drive View URL to Download URL (for PDF fetching)
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

    // Helper for Thai Date in Filename (DDMMYYYY)
    const formatDateForFilename = (dateStr: string) => {
        if (!dateStr) return '00000000';
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear() + 543;
        return `${day}${month}${year}`;
    };

    // --- Data Connection ---
    useEffect(() => {
        let unsubscribe: () => void;
        let timeoutId: ReturnType<typeof setTimeout>;

        if (isConfigured && db) {
            // SAFETY TIMEOUT: Fallback if Firestore takes too long (3s)
            timeoutId = setTimeout(() => {
                if(isLoading) {
                    console.warn("Firestore Documents timeout. Switching to Mock Data.");
                    setDocs(MOCK_DOCUMENTS);
                    setIsLoading(false);
                }
            }, 3000);

            try {
                // 1. Fetch Documents
                const q = query(collection(db, "documents"), orderBy("id", "desc")); 
                unsubscribe = onSnapshot(q, (snapshot) => {
                    clearTimeout(timeoutId);
                    const fetched: DocumentItem[] = [];
                    snapshot.forEach((doc) => {
                        fetched.push({ ...doc.data() } as DocumentItem);
                    });
                    setDocs(fetched);
                    setIsLoading(false);
                }, (error) => {
                    clearTimeout(timeoutId);
                    console.error("Error fetching docs:", error);
                    setDocs(MOCK_DOCUMENTS);
                    setIsLoading(false);
                });
                
                // 2. Fetch System Config (for Drive Upload)
                const fetchConfig = async () => {
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
                
                // Visual Highlight Effect
                setIsHighlighted(true);
                setTimeout(() => setIsHighlighted(false), 2500);

                if (onClearFocus) onClearFocus();
            }
        }
    }, [focusDocId, docs, onClearFocus]);

    // --- Attachment Handlers ---

    const handleAddFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            
            // Validate Config
            if (!sysConfig?.scriptUrl || !sysConfig?.driveFolderId) {
                alert("ไม่พบการตั้งค่า Google Drive! \nกรุณาแจ้ง Admin ให้ตั้งค่า 'System Settings' ก่อนใช้งาน");
                return;
            }

            setUploadProgress('กำลังเตรียมไฟล์...');
            setIsUploading(true);

            try {
                // 1. Convert to Base64
                let base64Data = await fileToBase64(file);
                
                // ----------------------------------------------------
                // AUTO STAMP RECEIVE NUMBER (Only First PDF File)
                // ----------------------------------------------------
                const isFirstFile = tempAttachments.length === 0;
                
                if (file.type === 'application/pdf' && isFirstFile) {
                    setUploadProgress('กำลังอัปโหลดไฟล์ไปที่ Google Drive และลงเลขที่รับ...');
                    
                    // Use the custom book number from state instead of auto-calc logic here
                    const bookNumToStamp = newDoc.bookNumber || "XXX/XXXX";

                    // Format Date & Time for Stamp
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
                    } catch (stampErr) {
                        console.error("Stamp Error", stampErr);
                        // Continue even if stamp fails
                    }
                } else {
                    setUploadProgress('กำลังอัปโหลดไฟล์ไปที่ Google Drive...');
                }

                // Remove Data URI prefix (e.g. "data:image/png;base64,") for GAS
                const base64Content = base64Data.split(',')[1] || base64Data;

                // 2. Upload to GAS
                const payload = {
                    folderId: sysConfig.driveFolderId,
                    filename: file.name,
                    mimeType: file.type,
                    base64: base64Content
                };

                const response = await fetch(sysConfig.scriptUrl, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (result.status === 'success') {
                    setUploadProgress('อัปโหลดไฟล์เรียบร้อยแล้ว');
                    
                    const newAtt: Attachment = {
                        id: `att_${Date.now()}`,
                        name: file.name,
                        type: 'LINK', // Treat as LINK because it's on Drive now
                        url: result.viewUrl || result.url,
                        fileType: file.type
                    };
                    setTempAttachments([...tempAttachments, newAtt]);
                } else {
                    throw new Error(result.message || 'Unknown GAS Error');
                }

            } catch (err) {
                console.error("Upload Error:", err);
                alert(`เกิดข้อผิดพลาดในการอัปโหลด: ${err}`);
            } finally {
                setIsUploading(false);
                setUploadProgress('');
                e.target.value = ''; // Reset input
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

    // --- Actions ---

    const handleCreateDoc = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!newDoc.bookNumber) {
            alert("กรุณาระบุเลขที่รับ");
            return;
        }

        setIsUploading(true);
        setUploadProgress('กำลังส่งหนังสือไปหาผู้อำนวยการ...');
        
        const now = new Date();
        const docId = Date.now().toString();

        try {
            const created: DocumentItem = {
                id: docId,
                bookNumber: newDoc.bookNumber, // Use user input
                title: newDoc.title,
                from: newDoc.from,
                description: newDoc.description,
                priority: newDoc.priority as any,
                date: now.toISOString().split('T')[0],
                timestamp: now.toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'}),
                attachments: tempAttachments, // Save the list
                status: 'PendingDirector',
                targetTeachers: [],
                acknowledgedBy: []
            };

            if (isConfigured && db) {
                await addDoc(collection(db, "documents"), created);
            } else {
                setDocs([created, ...docs]);
            }

            // Cleanup & Redirect to List View (Refresh)
            setIsUploading(false);
            setUploadProgress('');
            setNewDoc({ bookNumber: '', title: '', from: '', priority: 'Normal', description: '' });
            setTempAttachments([]);
            setLinkInput('');
            setViewMode('LIST');

        } catch (e) {
            setIsUploading(false);
            setUploadProgress('');
            console.error(e);
            alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
        }
    };

    const handleDeleteDoc = async (e: React.MouseEvent, docId: string) => {
        e.stopPropagation(); // Prevent opening detail
        if (!confirm("ยืนยันการลบหนังสือราชการนี้? \n(การกระทำนี้จะลบถาวร)")) return;

        try {
            if (isConfigured && db) {
                const q = query(collection(db, "documents"), where("id", "==", docId));
                const { getDocs, deleteDoc } = await import('firebase/firestore');
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const docRef = snapshot.docs[0].ref;
                    await deleteDoc(docRef);
                    // alert("ลบข้อมูลเรียบร้อยแล้ว");
                }
            } else {
                setDocs(docs.filter(d => d.id !== docId));
            }
        } catch (error) {
            console.error("Delete error", error);
            alert("เกิดข้อผิดพลาดในการลบ");
        }
    };

    // --- PDF SIGNATURE LOGIC ---
    
    // Support "Acknowledge Only" where command text might be empty
    const handleDirectorAction = async (isAckOnly: boolean) => {
         if (!selectedDoc) return;
         
         const firstAtt = selectedDoc.attachments[0];
         // Check if we can stamp (must be PDF)
         const canStamp = firstAtt && (firstAtt.fileType === 'application/pdf' || firstAtt.name.toLowerCase().endsWith('.pdf'));

         // If we cannot stamp directly or it is a link, we need to decide strategy
         setIsSigning(true);
         setProcessingMessage('กำลังดึงข้อมูลเอกสารเพื่อประทับตรา...');

         try {
             // 1. Get Config for Signature and School Name
            let sigBase64 = sysConfig?.directorSignatureBase64;
            let schoolName = sysConfig?.schoolName;
            let logoBase64 = sysConfig?.schoolLogoBase64;
            let sigScale = sysConfig?.directorSignatureScale || 1;
            let sigYOffset = sysConfig?.directorSignatureYOffset || 0;

            // Prepare Text
            const notifyToText = '';
            
            // If AckOnly, force command to be 'รับทราบ'
            const finalCommand = isAckOnly ? 'รับทราบ' : (command || 'รับทราบ');

             // CALL THE UTILITY
            let pdfBase64: string | null = null;
            
            if (canStamp) {
                 // Try to get a downloadable link if it's Google Drive
                 const fileId = getGoogleDriveId(firstAtt.url);
                 // Construct a direct download link
                 const downloadUrl = fileId 
                    ? `https://drive.google.com/uc?export=download&id=${fileId}` 
                    : firstAtt.url;

                 console.log("Attempting to fetch PDF from:", downloadUrl);
                 
                 // PROXY FETCH LOGIC
                 let base64Original = '';
                 try {
                     // ATTEMPT 1: Try fetch via CORS Proxy (AllOrigins)
                     setProcessingMessage('กำลังดึงไฟล์ต้นฉบับผ่าน Proxy (1/2)...');
                     const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(downloadUrl)}`;
                     const resp = await fetch(proxyUrl);
                     if (!resp.ok) throw new Error(`Proxy Fetch failed: ${resp.status} ${resp.statusText}`);
                     
                     const blob = await resp.blob();
                     if (blob.size < 100) throw new Error("File too small, likely an error page");
                     
                     const reader = new FileReader();
                     base64Original = await new Promise<string>((resolve, reject) => {
                         reader.onload = () => resolve(reader.result as string);
                         reader.onerror = reject;
                         reader.readAsDataURL(blob);
                     });
                     
                 } catch (proxyError) {
                     console.error("Proxy fetch failed:", proxyError);
                     try {
                         // ATTEMPT 2: Fallback Proxy (corsproxy.io)
                         setProcessingMessage('กำลังลองดึงไฟล์ผ่าน Proxy สำรอง (2/2)...');
                         const backupProxy = `https://corsproxy.io/?${encodeURIComponent(downloadUrl)}`;
                         const resp2 = await fetch(backupProxy);
                         if (!resp2.ok) throw new Error("Backup Proxy Failed");
                         const blob2 = await resp2.blob();
                         const reader2 = new FileReader();
                         base64Original = await new Promise<string>((resolve) => {
                             reader2.onload = () => resolve(reader2.result as string);
                             reader2.readAsDataURL(blob2);
                         });
                     } catch (finalError) {
                         console.error("All fetch attempts failed:", finalError);
                         alert(`ไม่สามารถดึงไฟล์ต้นฉบับได้\n\nสาเหตุ: ติดสิทธิ์การเข้าถึงไฟล์ (CORS) ของ Google Drive\n\nคำแนะนำ: กรุณาลองอัปโหลดไฟล์ใหม่ หรือ ตรวจสอบว่าไฟล์แชร์เป็น Public แล้ว`);
                         setIsSigning(false);
                         return; // Stop here, do not create blank sheet
                     }
                 }

                 // If we got here, we have the base64!
                 setProcessingMessage('กำลังประทับตราลงในไฟล์...');
                 pdfBase64 = await stampPdfDocument({
                    fileUrl: base64Original,
                    fileType: 'application/pdf',
                    notifyToText, // This will be empty
                    commandText: finalCommand,
                    directorName: currentUser.name,
                    directorPosition: currentUser.position,
                    signatureImageBase64: sigBase64,
                    schoolName: schoolName,
                    schoolLogoBase64: logoBase64,
                    targetPage: stampPage,
                    onStatusChange: setProcessingMessage,
                    signatureScale: sigScale,
                    signatureYOffset: sigYOffset
                });

            } else {
                 // Non-PDF files: Must create new sheet
                 setProcessingMessage('สร้างใบแนบบันทึกข้อสั่งการ (สำหรับไฟล์ที่ไม่ใช่ PDF)...');
                 pdfBase64 = await stampPdfDocument({
                    fileUrl: '', 
                    fileType: 'new',
                    notifyToText,
                    commandText: finalCommand,
                    directorName: currentUser.name,
                    directorPosition: currentUser.position,
                    signatureImageBase64: sigBase64,
                    schoolName: schoolName,
                    schoolLogoBase64: logoBase64,
                    targetPage: 1,
                    onStatusChange: (msg) => setProcessingMessage(msg),
                    signatureScale: sigScale,
                    signatureYOffset: sigYOffset
                });
            }

            // Finish
            await finishSigning(pdfBase64, finalCommand);

         } catch (error) {
            console.error("PDF Generation Error", error);
            alert("Error: " + error);
            setIsSigning(false);
         }
    };

    const finishSigning = async (signedBase64: string | null, finalCommand: string) => {
        if (!selectedDoc) return;
        
        let signedUrl = null;

        // Upload the stamped file if we have one and config exists
        if (signedBase64 && sysConfig?.scriptUrl && sysConfig?.driveFolderId) {
            setProcessingMessage('กำลังอัปโหลดไฟล์ที่ลงนามแล้ว...');
            try {
                // Generate Filename: stamp + BookNumber(Digits) + Date(Digits)
                const bookNumDigits = selectedDoc.bookNumber.replace(/\D/g, '');
                const dateDigits = formatDateForFilename(selectedDoc.date); 
                
                const finalFilename = `stamp${bookNumDigits}${dateDigits}.pdf`;

                const base64Content = signedBase64.split(',')[1] || signedBase64;
                const payload = {
                    folderId: sysConfig.driveFolderId,
                    filename: finalFilename,
                    mimeType: 'application/pdf',
                    base64: base64Content
                };

                const response = await fetch(sysConfig.scriptUrl, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.status === 'success') {
                    signedUrl = result.viewUrl || result.url;
                }
            } catch (e) {
                console.error("Upload signed PDF failed", e);
            }
        } else if (signedBase64) {
             signedUrl = signedBase64;
        }

        const nowStr = new Date().toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});

        const updateData = {
            directorCommand: finalCommand,
            directorSignatureDate: nowStr,
            targetTeachers: selectedTeachers,
            status: 'Distributed',
            signedFileUrl: signedUrl || undefined
        };

        if (isConfigured && db) {
            try {
                const { getDocs, where } = await import('firebase/firestore');
                const qFind = query(collection(db, "documents"), where("id", "==", selectedDoc.id));
                const snapshot = await getDocs(qFind);
                if (!snapshot.empty) {
                    const docRef = snapshot.docs[0].ref;
                    await updateDoc(docRef, updateData);
                    
                    cleanupAfterSign();
                    setTimeout(() => alert("ลงนามและสั่งการเรียบร้อยแล้ว"), 100);
                }
            } catch (e) {
                cleanupAfterSign();
                console.error("Update error:", e);
                alert("เกิดข้อผิดพลาดในการบันทึก (Firebase)");
            }
        } else {
             const updatedDocs = docs.map(d => 
                d.id === selectedDoc.id ? { ...d, ...updateData } as DocumentItem : d
            );
            setDocs(updatedDocs);
            cleanupAfterSign();
            setTimeout(() => alert("ลงนามเรียบร้อย (Offline)"), 100);
        }
    };

    const cleanupAfterSign = () => {
        setIsSigning(false);
        setViewMode('LIST');
        setCommand('');
        setSelectedTeachers([]);
        setSelectedDoc(null);
        setStampPage(1);
    };


    const handleTeacherAcknowledge = async (targetDocId?: string) => {
        const docId = targetDocId || selectedDoc?.id;
        if (!docId) return;
        
        if (isConfigured && db) {
            try {
                const { getDocs, where } = await import('firebase/firestore');
                const qFind = query(collection(db, "documents"), where("id", "==", docId));
                const snapshot = await getDocs(qFind);
                 if (!snapshot.empty) {
                    const docRef = snapshot.docs[0].ref;
                    const currentAck = snapshot.docs[0].data().acknowledgedBy || [];
                    if (!currentAck.includes(currentUser.id)) {
                        await updateDoc(docRef, {
                            acknowledgedBy: [...currentAck, currentUser.id]
                        });
                    }
                }
            } catch(e) {
                console.error(e);
            }
        } else {
             const updatedDocs = docs.map(d => {
                if (d.id === docId && !d.acknowledgedBy.includes(currentUser.id)) {
                    return {
                        ...d,
                        acknowledgedBy: [...d.acknowledgedBy, currentUser.id]
                    };
                }
                return d;
            });
            setDocs(updatedDocs);
        }
        
        // If we are in DETAIL view, keep it there, otherwise stay in LIST
        if (!targetDocId) setViewMode('LIST');
    };
    
    const handleOpenAndAck = async (doc: DocumentItem, url: string) => {
        if (!url) return;
        window.open(url, '_blank');
        if (!doc.acknowledgedBy.includes(currentUser.id)) {
            await handleTeacherAcknowledge(doc.id);
        }
    };
    
    const handleSelectAllTeachers = (checked: boolean) => {
        if (checked) {
            setSelectedTeachers(allTeachers.map(t => t.id));
        } else {
            setSelectedTeachers([]);
        }
    };

    // --- Filtering Logic ---
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

    // --- Pagination Logic ---
    const totalPages = Math.ceil(filteredDocs.length / ITEMS_PER_PAGE);
    const displayedDocs = filteredDocs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const goToPage = (p: number) => {
        if (p >= 1 && p <= totalPages) setCurrentPage(p);
    };


    if (isLoading) return <div className="p-10 text-center text-slate-500"><Loader className="animate-spin inline mr-2"/> กำลังโหลดข้อมูล...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 text-white p-4 rounded-xl">
                <div>
                    <h2 className="text-xl font-bold">ระบบงานสารบรรณอิเล็กทรอนิกส์</h2>
                    <p className="text-slate-300 text-sm">ผู้ใช้งาน: <span className="font-bold text-yellow-400">{currentUser.name}</span></p>
                </div>
            </div>

            {/* --- LIST VIEW --- */}
            {viewMode === 'LIST' && (
                <>
                    <div className="flex justify-between items-center">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input type="text" placeholder="ค้นหาหนังสือ..." className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        {(isDocOfficer || isSystemAdmin) && (
                            <button onClick={handleInitCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2">
                                <FilePlus size={18} /> ลงรับหนังสือ
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {displayedDocs.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 bg-white rounded-xl">ไม่มีหนังสือราชการ</div>
                        ) : displayedDocs.map((doc, index) => {
                             const isUnread = doc.status === 'Distributed' && doc.targetTeachers.includes(currentUser.id) && !doc.acknowledgedBy.includes(currentUser.id);
                             const isAcknowledged = doc.status === 'Distributed' && doc.acknowledgedBy.includes(currentUser.id);
                             
                             return (
                                <div key={doc.id}
                                    className={`p-4 rounded-xl shadow-sm border transition-all relative overflow-hidden group
                                        ${doc.status === 'PendingDirector' && isDirector ? 'border-l-4 border-l-yellow-400' : 'border-slate-200'}
                                        ${index % 2 === 1 ? 'bg-blue-50' : 'bg-white'}
                                    `}
                                >
                                    <div className="flex justify-between items-start cursor-pointer" onClick={() => { setSelectedDoc(doc); setViewMode('DETAIL'); }}>
                                        <div className="flex items-start gap-4">
                                            <div className={`p-3 rounded-lg ${doc.status === 'Distributed' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                                                <FileText size={24} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">รับที่: {doc.bookNumber}</span>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getPriorityColor(doc.priority)}`}>
                                                        {doc.priority}
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
                                                <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition-colors">{doc.title}</h3>
                                                <p className="text-sm text-slate-500 line-clamp-1">{doc.description}</p>
                                                
                                                {/* Director Progress Indicator */}
                                                {isDirector && doc.status === 'Distributed' && (
                                                    <div className="mt-2 text-xs font-bold text-green-600 flex items-center gap-1">
                                                        <CheckCircle size={12} />
                                                        รับทราบแล้ว {doc.acknowledgedBy.length}/{doc.targetTeachers.length} ท่าน
                                                        {doc.acknowledgedBy.length === doc.targetTeachers.length && <span className="text-green-500 ml-1">(ครบถ้วน)</span>}
                                                    </div>
                                                )}

                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                                                    <span>จาก: {doc.from}</span>
                                                    <span>{doc.date}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {doc.status === 'PendingDirector' && (
                                                <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                                                    <Users size={12} /> รอเกษียณ
                                                </span>
                                            )}
                                            {doc.attachments && doc.attachments.length > 0 && (
                                                 <span className="text-xs text-slate-400 flex items-center gap-1">
                                                    <LinkIcon size={12}/> {doc.attachments.length} ไฟล์
                                                 </span>
                                            )}
                                            
                                            {/* DELETE BUTTON: Admin Can Delete ALL, Doc Officer Can Delete Pending */}
                                            {(isSystemAdmin || (isDocOfficer && doc.status === 'PendingDirector')) && (
                                                <button 
                                                    onClick={(e) => handleDeleteDoc(e, doc.id)}
                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors z-10"
                                                    title="ลบหนังสือ"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* FILES LIST IN CARD (For Teachers/Officers when Distributed) */}
                                    {(!isDirector) && doc.status === 'Distributed' && (
                                        <div className="mt-4 pt-3 border-t border-slate-100">
                                            <p className="text-xs text-slate-500 mb-2 font-bold">เอกสารแนบ (คลิกเพื่อเปิดและรับทราบ)</p>
                                            <div className="flex flex-col gap-2">
                                                {/* File 1: Signed Version (If Exists) */}
                                                {doc.signedFileUrl && (
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleOpenAndAck(doc, doc.signedFileUrl!); }}
                                                        className="w-full flex items-center justify-between p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg group transition-all"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="bg-white p-2 rounded-full text-emerald-600 shadow-sm">
                                                                <FileCheck size={20}/>
                                                            </div>
                                                            <div className="text-left">
                                                                <div className="font-bold text-emerald-900 text-sm">
                                                                    เอกสารฉบับที่ 1 (บันทึกข้อสั่งการ)
                                                                </div>
                                                                <div className="text-[10px] text-emerald-500">
                                                                    {`stamp${doc.bookNumber.replace(/\D/g,'')}${formatDateForFilename(doc.date)}.pdf`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                )}

                                                {/* Other Files: Starting from Index 1 if signed exists, else index 0 */}
                                                {doc.attachments.map((att, index) => {
                                                    // Note: If signedFileUrl exists, it usually corresponds to the first attachment (index 0). 
                                                    // We still show all attachments, but rename them sequentially.
                                                    // If signed exists, start count from 2.
                                                    const displayIndex = doc.signedFileUrl ? index + 2 : index + 1;
                                                    
                                                    return (
                                                        <button 
                                                            key={index}
                                                            onClick={(e) => { e.stopPropagation(); handleOpenAndAck(doc, att.url); }}
                                                            className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg group transition-all"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-white p-2 rounded-full text-slate-500 shadow-sm">
                                                                    {att.type === 'LINK' ? <ExternalLink size={20}/> : <FileIcon size={20}/>}
                                                                </div>
                                                                <div className="text-left">
                                                                    <div className="font-bold text-slate-700 text-sm">
                                                                        เอกสารฉบับที่ {displayIndex}
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                                                        {att.name}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <MousePointerClick size={16} className="text-slate-300"/>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            
                                            {/* Status Footer */}
                                            {doc.acknowledgedBy.includes(currentUser.id) && (
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

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 mt-6">
                            <button 
                                onClick={() => goToPage(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                            >
                                <ChevronLeft size={20}/>
                            </button>
                            <span className="text-sm font-medium text-slate-600">
                                หน้า {currentPage} / {totalPages}
                            </span>
                            <button 
                                onClick={() => goToPage(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-lg bg-white border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                            >
                                <ChevronRight size={20}/>
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* --- CREATE VIEW --- */}
            {viewMode === 'CREATE' && (
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 max-w-4xl mx-auto">
                    {isUploading && (
                        <div className="absolute inset-0 bg-white/90 z-50 flex items-center justify-center flex-col rounded-xl">
                            <Loader className="animate-spin text-blue-600 mb-2" size={40} />
                            <p className="font-bold text-slate-700">{uploadProgress}</p>
                            <p className="text-sm text-slate-500">กรุณาอย่าปิดหน้าต่าง</p>
                        </div>
                    )}
                    <h3 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">ลงทะเบียนรับหนังสือราชการ</h3>
                    
                    {!sysConfig?.scriptUrl && (
                        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg mb-6 border border-yellow-200 flex items-start gap-3">
                            <AlertTriangle className="shrink-0" />
                            <div>
                                <p className="font-bold">ระบบยังไม่ได้เชื่อมต่อ Google Drive</p>
                                <p className="text-sm">กรุณาติดต่อ Admin ให้ตั้งค่า 'System Settings' เพื่อเปิดใช้งานการอัปโหลดไฟล์</p>
                            </div>
                        </div>
                    )}

                    <form onSubmit={handleCreateDoc} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">เลขที่รับ (แก้ไขได้)</label>
                                    <div className="relative">
                                        <Settings className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                        <input 
                                            required 
                                            type="text" 
                                            value={newDoc.bookNumber} 
                                            onChange={e => setNewDoc({...newDoc, bookNumber: e.target.value})} 
                                            className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold text-slate-700"
                                            placeholder="XXX/25XX"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">* ระบบคำนวณเลขถัดไปให้อัตโนมัติ ท่านสามารถแก้ไขเพื่อตั้งค่าเริ่มต้นใหม่ได้</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">เรื่อง</label>
                                    <input required type="text" value={newDoc.title} onChange={e => setNewDoc({...newDoc, title: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">จาก</label>
                                        <input required type="text" value={newDoc.from} onChange={e => setNewDoc({...newDoc, from: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">ความเร่งด่วน</label>
                                        <select value={newDoc.priority} onChange={e => setNewDoc({...newDoc, priority: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                                            <option value="Normal">ปกติ</option>
                                            <option value="Urgent">ด่วน</option>
                                            <option value="Critical">ด่วนที่สุด</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">รายละเอียด</label>
                                    <textarea rows={3} value={newDoc.description} onChange={e => setNewDoc({...newDoc, description: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"></textarea>
                                </div>
                            </div>
                            
                            <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                                    <UploadCloud size={18}/> อัปโหลดไฟล์ (Google Drive)
                                </h4>
                                
                                {/* 1. List current attachments */}
                                {tempAttachments.length > 0 && (
                                    <div className="bg-white rounded border border-slate-200 mb-4 divide-y">
                                        {tempAttachments.map(att => (
                                            <div key={att.id} className="p-2 flex justify-between items-center text-sm">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    {att.type === 'LINK' ? <ExternalLink size={16} className="text-blue-500 shrink-0"/> : <FileIcon size={16} className="text-orange-500 shrink-0"/>}
                                                    <span className="truncate">{att.name}</span>
                                                </div>
                                                <button type="button" onClick={() => handleRemoveAttachment(att.id)} className="text-red-400 hover:text-red-600 p-1">
                                                    <Trash2 size={16}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 2. Add File */}
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">เลือกไฟล์เพื่ออัปโหลด (Auto Stamp ไฟล์แรก)</label>
                                    <input 
                                        type="file" 
                                        accept=".pdf,image/*" 
                                        onChange={handleAddFile}
                                        disabled={!sysConfig?.scriptUrl}
                                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">* ระบบจะประทับตราเลขรับอัตโนมัติเฉพาะไฟล์ PDF ไฟล์แรกที่อัปโหลด</p>
                                </div>

                                <div className="text-center text-xs text-slate-400 font-bold my-2">- หรือ -</div>

                                {/* 3. Add Google Drive Link */}
                                <div className="flex flex-col gap-2">
                                    <label className="block text-xs font-medium text-slate-500">แปะลิงก์ Google Drive (กรณีมีไฟล์อยู่แล้ว)</label>
                                    <input 
                                        type="text" 
                                        placeholder="ชื่อเอกสาร (ถ้ามี)" 
                                        value={linkNameInput}
                                        onChange={e => setLinkNameInput(e.target.value)}
                                        className="w-full px-3 py-2 border rounded text-sm focus:ring-1 outline-none"
                                    />
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="วางลิงก์ https://..." 
                                            value={linkInput}
                                            onChange={e => setLinkInput(e.target.value)}
                                            className="w-full px-3 py-2 border rounded text-sm focus:ring-1 outline-none"
                                        />
                                        <button type="button" onClick={handleAddLink} className="bg-slate-600 text-white px-3 py-2 rounded hover:bg-slate-700">
                                            <Plus size={16}/>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t mt-4">
                            <button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-2 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">ยกเลิก</button>
                            <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md">บันทึกข้อมูล</button>
                        </div>
                    </form>
                </div>
            )}

            {/* --- DETAIL VIEW --- */}
            {viewMode === 'DETAIL' && selectedDoc && (
                <div className={`max-w-4xl mx-auto space-y-6 ${isHighlighted ? 'ring-4 ring-blue-300 rounded-xl transition-all duration-500' : ''}`}>
                     {/* Overlay Loader for Signing */}
                     {isSigning && (
                        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center flex-col text-white">
                            <Loader className="animate-spin mb-4" size={48}/>
                            <h3 className="text-xl font-bold">{processingMessage || 'กำลังประมวลผล...'}</h3>
                            <p className="text-slate-300">กรุณารอสักครู่ ระบบกำลังดึงไฟล์ต้นฉบับจาก Google Drive และประทับตรา</p>
                        </div>
                    )}

                    {/* Header */}
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-200 rounded-full text-slate-600">
                            <ArrowLeft size={24}/>
                        </button>
                        <h2 className="text-2xl font-bold text-slate-800">รายละเอียดหนังสือราชการ</h2>
                    </div>

                    {/* 1. Files List (Big Buttons for Mobile) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <LinkIcon size={20}/> เอกสารแนบ (แตะเพื่อเปิด)
                        </h3>
                        <div className="flex flex-col gap-3">
                            {selectedDoc.attachments.map((att, idx) => {
                                // If distributed and is the first file, show the stamped version
                                const isDistributed = selectedDoc.status === 'Distributed';
                                const showSigned = isDistributed && idx === 0 && selectedDoc.signedFileUrl;
                                const targetUrl = showSigned ? selectedDoc.signedFileUrl : att.url;
                                
                                // Simplified file naming logic
                                const fileLabel = `เอกสารฉบับที่ ${idx + 1}${showSigned ? ' (ลงนามแล้ว)' : ''}`;
                                
                                return (
                                    <button 
                                        key={idx}
                                        onClick={() => window.open(targetUrl, '_blank')}
                                        className={`w-full p-4 text-white rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-between group 
                                            ${showSigned ? 'bg-emerald-600 hover:bg-emerald-700 border-2 border-emerald-400' : 'bg-blue-600 hover:bg-blue-700'}
                                        `}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                                {showSigned ? <CheckCircle size={28}/> : (att.type === 'LINK' ? <ExternalLink size={28}/> : <FileIcon size={28}/>)}
                                            </div>
                                            <div className="text-left">
                                                <div className="font-bold text-lg">
                                                    {fileLabel}
                                                </div>
                                                <div className="text-sm opacity-90 truncate max-w-[200px] md:max-w-md">
                                                    {att.name}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-xs font-medium">
                                            <MousePointerClick size={14}/> แตะเปิด
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 2. Document Details */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <FileText size={20}/> รายละเอียดหนังสือ
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8 text-sm">
                             <div className="flex flex-col">
                                 <span className="text-slate-500 text-xs">เรื่อง</span>
                                 <span className="font-bold text-lg text-slate-800">{selectedDoc.title}</span>
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-slate-500 text-xs">เลขที่รับ</span>
                                 <span className="font-mono font-bold text-slate-700">{selectedDoc.bookNumber}</span>
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-slate-500 text-xs">จากหน่วยงาน</span>
                                 <span className="font-medium text-slate-700">{selectedDoc.from}</span>
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-slate-500 text-xs">ความเร่งด่วน</span>
                                 <div>
                                     <span className={`px-2 py-0.5 rounded text-xs border ${getPriorityColor(selectedDoc.priority)}`}>
                                        {selectedDoc.priority}
                                     </span>
                                 </div>
                             </div>
                             <div className="col-span-1 md:col-span-2 flex flex-col">
                                 <span className="text-slate-500 text-xs">รายละเอียดเพิ่มเติม</span>
                                 <p className="text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed mt-1">
                                     {selectedDoc.description}
                                 </p>
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-slate-500 text-xs">วันที่รับ</span>
                                 <span className="text-slate-700">{selectedDoc.date} เวลา {selectedDoc.timestamp}</span>
                             </div>
                             <div className="flex flex-col">
                                 <span className="text-slate-500 text-xs">สถานะ</span>
                                 <span className={`font-bold ${selectedDoc.status === 'Distributed' ? 'text-green-600' : 'text-yellow-600'}`}>
                                     {selectedDoc.status === 'Distributed' ? 'สั่งการแล้ว' : 'รอเกษียณ'}
                                 </span>
                             </div>
                        </div>
                    </div>

                    {/* 3. Action Panel (Director / Teacher) */}
                    
                    {/* ROLE: DIRECTOR ACTIONS */}
                    {isDirector && selectedDoc.status === 'PendingDirector' && (
                        <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-sm animate-fade-in">
                            <div className="flex items-center gap-2 mb-4 text-blue-900 border-b border-blue-200 pb-2">
                                <PenTool size={20}/>
                                <h3 className="font-bold text-lg">ส่วนเกษียณหนังสือ / สั่งการ</h3>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-bold text-blue-900 mb-2">ข้อความสั่งการ</label>
                                    <textarea 
                                        value={command} 
                                        onChange={(e) => setCommand(e.target.value)}
                                        placeholder="ระบุข้อความสั่งการ..." 
                                        className="w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-40 resize-none shadow-sm"
                                    ></textarea>
                                </div>
                                
                                <div className="flex flex-col h-full gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-bold text-blue-900 mb-2">ส่งต่อให้ (แจ้งเตือน)</label>
                                        <div className="border rounded-xl p-3 bg-white overflow-y-auto max-h-32 shadow-sm">
                                            {/* SELECT ALL Checkbox */}
                                            <div className="flex items-center gap-2 p-2 bg-slate-100 rounded mb-2 border border-slate-200 sticky top-0">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedTeachers.length === allTeachers.length && allTeachers.length > 0}
                                                    onChange={(e) => handleSelectAllTeachers(e.target.checked)}
                                                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                />
                                                <span className="font-bold text-sm text-slate-700">เลือกทั้งหมด (ส่งถึงทุกคน)</span>
                                            </div>

                                            {allTeachers.map(t => (
                                                <label key={t.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer border-b border-slate-50 last:border-0">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedTeachers.includes(t.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedTeachers([...selectedTeachers, t.id]);
                                                            else setSelectedTeachers(selectedTeachers.filter(id => id !== t.id));
                                                        }}
                                                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                    />
                                                    <span className="text-sm text-slate-700">{t.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Page Selection for Stamping */}
                                    <div className="bg-white p-3 rounded-xl border border-blue-100">
                                        <label className="block text-xs font-bold text-slate-500 mb-2">เลือกหน้าที่ต้องการประทับตรา (กรณีมีหลายหน้า)</label>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setStampPage(Math.max(1, stampPage - 1))} className="p-1 bg-slate-100 rounded hover:bg-slate-200"><ArrowLeft size={16}/></button>
                                            <span className="font-bold text-blue-800 text-lg w-10 text-center">{stampPage}</span>
                                            <button onClick={() => setStampPage(stampPage + 1)} className="p-1 bg-slate-100 rounded hover:bg-slate-200"><Plus size={16}/></button>
                                            <span className="text-xs text-slate-400 ml-2">(ค่าเริ่มต้น: หน้า 1)</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button 
                                    onClick={() => handleDirectorAction(true)}
                                    disabled={isSigning}
                                    className="flex-1 py-3 bg-white border-2 border-green-600 text-green-600 rounded-xl hover:bg-green-50 font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                                >
                                    <FileCheck size={20}/> รับทราบ (ไม่ต้องพิมพ์)
                                </button>
                                <button 
                                    onClick={() => handleDirectorAction(false)}
                                    disabled={isSigning}
                                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl shadow-lg hover:bg-blue-700 font-bold flex items-center justify-center gap-2 transition-all hover:shadow-xl"
                                >
                                    <PenTool size={20}/> ลงนามสั่งการ
                                </button>
                            </div>
                            <div className="mt-2 text-center">
                                <p className="text-xs text-blue-400">ระบบจะประทับตราที่มุมขวาล่างของหน้าที่เลือก (หากดึงไฟล์ได้)</p>
                            </div>
                        </div>
                    )}

                    {/* ROLE: TEACHER ACKNOWLEDGE (Now also visible to Officer if they are target) */}
                    {!isDirector && selectedDoc.status === 'Distributed' && !selectedDoc.acknowledgedBy.includes(currentUser.id) && selectedDoc.targetTeachers.includes(currentUser.id) && (
                        <div className="bg-orange-50 p-6 rounded-xl border border-orange-200 shadow-sm animate-fade-in text-center">
                            <h4 className="font-bold text-orange-800 flex items-center justify-center gap-2 text-lg mb-2">
                                <Eye size={24}/> ยืนยันการรับทราบ
                            </h4>
                            <p className="text-orange-700 mb-6">กรุณาอ่านรายละเอียดและกดปุ่มรับทราบเพื่อยืนยันการรับหนังสือ</p>
                            <button onClick={() => handleTeacherAcknowledge()} className="px-8 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mx-auto">
                                <CheckSquare size={20}/> รับทราบ / อ่านแล้ว
                            </button>
                        </div>
                    )}

                     {/* ACKNOWLEDGED STATUS */}
                     {selectedDoc.acknowledgedBy.includes(currentUser.id) && (
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200 text-green-800 flex items-center justify-center gap-2 font-bold shadow-sm">
                            <CheckSquare size={24}/> ท่านได้รับทราบหนังสือฉบับนี้แล้ว
                        </div>
                     )}

                     {/* READ RECEIPT (ADMIN/DIRECTOR) */}
                     {(isDirector || isDocOfficer) && selectedDoc.status === 'Distributed' && (
                         <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                             <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                 <Users size={18}/> การรับทราบ ({selectedDoc.acknowledgedBy.length}/{selectedDoc.targetTeachers.length})
                             </h4>
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
