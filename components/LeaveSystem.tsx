

import React, { useState, useEffect } from 'react';
import { LeaveRequest, Teacher, School, SystemConfig } from '../types';
import { Clock, CheckCircle, XCircle, FilePlus, FileText, UserCheck, Printer, ArrowLeft, Loader, Database, Phone, Calendar, User, ChevronRight, Paperclip, Trash2 } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, QuerySnapshot, DocumentData, getDoc, where } from 'firebase/firestore';
import { MOCK_LEAVE_REQUESTS } from '../constants';
import { generateOfficialLeavePdf } from '../utils/pdfStamper';

interface LeaveSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    currentSchool?: School;
    focusRequestId?: string | null;
    onClearFocus?: () => void;
}

const LeaveSystem: React.FC<LeaveSystemProps> = ({ currentUser, allTeachers, currentSchool, focusRequestId, onClearFocus }) => {
    // State
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // View Modes: LIST | FORM | PDF | REPORT_DASHBOARD
    const [viewMode, setViewMode] = useState<'LIST' | 'FORM' | 'PDF' | 'REPORT_DASHBOARD'>('LIST');
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
    const [isHighlighted, setIsHighlighted] = useState(false);

    // Form State
    const [leaveType, setLeaveType] = useState('Sick');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [mobilePhone, setMobilePhone] = useState('');
    
    // File Upload State
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>(''); 

    // Approval Processing State
    const [isProcessingApproval, setIsProcessingApproval] = useState(false);

    // Warning Modal State
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [offCampusCount, setOffCampusCount] = useState(0);

    // System Config for Drive Upload
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);

    // PDF Preview State
    const [pdfUrl, setPdfUrl] = useState<string>('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Permissions
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');
    
    const canApprove = isDirector;
    const canViewAll = isDirector || isSystemAdmin || isDocOfficer;

    // --- Data Connection (Hybrid) ---
    useEffect(() => {
        let unsubscribe: () => void;
        let timeoutId: ReturnType<typeof setTimeout>;

        if (isConfigured && db) {
            // SAFETY TIMEOUT: Fallback if Firestore takes too long (3s)
            timeoutId = setTimeout(() => {
                if(isLoading) {
                    console.warn("Firestore Leave Requests timeout. Switching to Mock Data.");
                    setRequests(MOCK_LEAVE_REQUESTS);
                    setIsLoading(false);
                }
            }, 3000);

            // 1. Real Mode: Connect to Firestore
            // Filter by schoolId if possible, or fetch all and filter in memory
            const q = query(collection(db, "leave_requests"), orderBy("createdAt", "desc"));
            unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
                clearTimeout(timeoutId);
                const fetchedRequests: LeaveRequest[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    if (!data.schoolId || data.schoolId === currentUser.schoolId) {
                        // Fix spread error by casting entire object
                        fetchedRequests.push({ id: doc.id, ...data } as LeaveRequest);
                    }
                });
                setRequests(fetchedRequests);
                setIsLoading(false);
            }, (error) => {
                clearTimeout(timeoutId);
                console.error("Error fetching leave requests:", error);
                setRequests(MOCK_LEAVE_REQUESTS);
                setIsLoading(false);
            });

             // 2. Fetch Config for Upload
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
            // Mock Mode
            setTimeout(() => {
                setRequests(MOCK_LEAVE_REQUESTS);
                setIsLoading(false);
            }, 800);
        }

        return () => {
            if(timeoutId) clearTimeout(timeoutId);
            if(unsubscribe) unsubscribe();
        };
    }, [currentUser.schoolId]);

    // --- Focus Deep Link Effect ---
    useEffect(() => {
        if (focusRequestId && requests.length > 0) {
            const found = requests.find(r => r.id === focusRequestId);
            if (found) {
                setSelectedRequest(found);
                
                // If director pending approval, set to LIST to trigger modal
                if (canApprove && found.status === 'Pending') {
                    setViewMode('LIST');
                } else {
                    setViewMode('PDF');
                }
                
                // Visual Highlight
                setIsHighlighted(true);
                setTimeout(() => setIsHighlighted(false), 2500);

                // Auto scroll to top
                window.scrollTo({ top: 0, behavior: 'smooth' });

                if (onClearFocus) onClearFocus();
            }
        }
    }, [focusRequestId, requests, canApprove, onClearFocus]);

    // --- PDF GENERATION EFFECT ---
    useEffect(() => {
        const generatePdf = async () => {
            if (viewMode === 'PDF' && selectedRequest) {
                setIsGeneratingPdf(true);
                try {
                    // 1. Calculate Stats for this teacher
                    const approvedReqs = requests.filter(r => 
                        r.teacherId === selectedRequest.teacherId && 
                        r.status === 'Approved' && 
                        r.id !== selectedRequest.id // Exclude current if it was already approved (to simulate 'previous' correctly, though simplify here)
                    );
                    
                    // Simple Stats Calculation (Fiscal Year Logic omitted for brevity, using simple sum)
                    const stats = {
                        currentDays: calculateDays(selectedRequest.startDate, selectedRequest.endDate),
                        prevSick: approvedReqs.filter(r => r.type === 'Sick').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevPersonal: approvedReqs.filter(r => r.type === 'Personal').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevMaternity: approvedReqs.filter(r => r.type === 'Maternity').reduce((acc, r) => acc + calculateDays(r.startDate, r.endDate), 0),
                        prevLate: approvedReqs.filter(r => r.type === 'Late').length,
                        prevOffCampus: approvedReqs.filter(r => r.type === 'OffCampus').length,
                        lastLeave: approvedReqs.length > 0 ? approvedReqs[0] : null,
                        lastLeaveDays: approvedReqs.length > 0 ? calculateDays(approvedReqs[0].startDate, approvedReqs[0].endDate) : 0
                    };

                    // 2. Get Teacher & Director Info
                    const teacher = allTeachers.find(t => t.id === selectedRequest.teacherId) || currentUser;
                    const director = allTeachers.find(t => t.roles.includes('DIRECTOR'));

                    // 3. Generate PDF
                    const base64Pdf = await generateOfficialLeavePdf({
                        req: selectedRequest,
                        stats,
                        teacher,
                        schoolName: currentSchool?.name || 'โรงเรียน.......................',
                        directorName: director?.name || '.......................',
                        directorSignatureBase64: sysConfig?.directorSignatureBase64,
                        teacherSignatureBase64: teacher.signatureBase64,
                        officialGarudaBase64: sysConfig?.officialGarudaBase64,
                        directorSignatureScale: sysConfig?.directorSignatureScale,
                        directorSignatureYOffset: sysConfig?.directorSignatureYOffset
                    });
                    
                    setPdfUrl(base64Pdf);
                } catch (e) {
                    console.error("PDF Gen Error", e);
                } finally {
                    setIsGeneratingPdf(false);
                }
            }
        };
        
        generatePdf();
    }, [viewMode, selectedRequest, requests, allTeachers, currentSchool, sysConfig, currentUser]);

    // --- Helpers ---

    const calculateDays = (start: string, end: string) => {
        if (!start || !end) return 0;
        const s = new Date(start);
        const e = new Date(end);
        const diffTime = Math.abs(e.getTime() - s.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
    };

    const getLeaveTypeName = (type: string) => {
        const map: {[key:string]: string} = { 
            'Sick': 'ลาป่วย', 
            'Personal': 'ลากิจส่วนตัว', 
            'OffCampus': 'ออกนอกบริเวณ',
            'Late': 'เข้าสาย', 
            'Maternity': 'ลาคลอดบุตร'
        };
        return map[type] || type;
    };

    // Thai Date Helpers
    const getThaiDate = (dateStr: string) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'Approved': return <span className="flex items-center gap-1 text-green-600 bg-green-100 px-2 py-1 rounded-full text-xs font-bold"><CheckCircle size={12}/> อนุมัติ</span>;
            case 'Rejected': return <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-1 rounded-full text-xs font-bold"><XCircle size={12}/> ไม่อนุมัติ</span>;
            default: return <span className="flex items-center gap-1 text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full text-xs font-bold"><Clock size={12}/> รอพิจารณา</span>;
        }
    };

    // --- Handlers ---

    const handleFormInit = () => {
        setViewMode('FORM');
        setLeaveType('Sick');
        setStartDate('');
        setEndDate('');
        setStartTime('');
        setEndTime('');
        setReason('');
        setContactInfo('');
        setMobilePhone('');
        setEvidenceFile(null);
    };

    const handleLeaveTypeChange = (type: string) => {
        setLeaveType(type);
        if (type === 'OffCampus' || type === 'Late') {
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
            setStartDate(dateStr);
            setEndDate(dateStr);
            setStartTime(timeStr);
        } else {
            setStartDate('');
            setEndDate('');
            setStartTime('');
        }
    };

    const handlePreSubmitCheck = (e: React.FormEvent) => {
        e.preventDefault();
        if (leaveType === 'OffCampus') {
            const count = requests.filter(r => r.teacherId === currentUser.id && r.type === 'OffCampus').length;
            setOffCampusCount(count);
            setShowWarningModal(true);
        } else {
            submitRequest();
        }
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = error => reject(error);
        });
    };

    const submitRequest = async () => {
        setIsUploading(true);
        setUploadStatus('กำลังเตรียมข้อมูล...');
        let evidenceUrl = '';

        // 1. Upload Evidence if exists
        if (evidenceFile) {
            if (sysConfig?.scriptUrl && sysConfig?.driveFolderId) {
                setUploadStatus('กำลังอัปโหลดไฟล์แนบไปยัง Google Drive...');
                try {
                    const base64Data = await fileToBase64(evidenceFile);
                    const base64Content = base64Data.split(',')[1] || base64Data;
                    
                    const response = await fetch(sysConfig.scriptUrl, {
                        method: 'POST',
                        body: JSON.stringify({
                            folderId: sysConfig.driveFolderId,
                            filename: `evidence_${currentUser.name}_${Date.now()}_${evidenceFile.name}`,
                            mimeType: evidenceFile.type,
                            base64: base64Content
                        })
                    });
                    const result = await response.json();
                    if (result.status === 'success') {
                        evidenceUrl = result.viewUrl || result.url;
                    } else {
                        console.error("Upload evidence failed", result);
                        alert("อัปโหลดไฟล์แนบไม่สำเร็จ (แต่จะบันทึกการลาต่อไป)");
                    }
                } catch (e) {
                    console.error("Upload error", e);
                    alert("เกิดข้อผิดพลาดในการอัปโหลดไฟล์ (แต่จะบันทึกการลาต่อไป)");
                }
            } else {
                 console.warn("No Drive Config");
            }
        }

        // 2. Prepare Payload
        setUploadStatus('กำลังบันทึกข้อมูลการลา...');
        const newReq: any = {
            teacherId: currentUser.id,
            teacherName: currentUser.name,
            teacherPosition: currentUser.position || 'ครู',
            type: leaveType,
            startDate,
            endDate,
            reason,
            contactInfo: contactInfo || '',
            mobilePhone: mobilePhone || '',
            status: 'Pending',
            teacherSignature: currentUser.name,
            createdAt: new Date().toISOString(),
            schoolId: currentUser.schoolId
        };

        if (leaveType === 'OffCampus' || leaveType === 'Late') {
            newReq.startTime = startTime || '';
        }
        if (leaveType === 'OffCampus') {
            newReq.endTime = endTime || '';
        }
        if (evidenceUrl) {
            newReq.evidenceUrl = evidenceUrl;
        }

        if (isConfigured && db) {
            try {
                await addDoc(collection(db, "leave_requests"), newReq);
                
                setIsUploading(false);
                setUploadStatus('');
                setViewMode('LIST');
                setShowWarningModal(false);
                
                setTimeout(() => {
                    alert('เสนอใบลาเรียบร้อยแล้ว รอการพิจารณา');
                }, 300);

            } catch (e) {
                console.warn(e);
                setIsUploading(false);
                setUploadStatus('');
                alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
            }
        } else {
             const mockReq = { ...newReq, id: `mock_${Date.now()}` };
             setRequests([mockReq, ...requests]);
             
             setIsUploading(false);
             setUploadStatus('');
             setViewMode('LIST');
             setShowWarningModal(false);

             setTimeout(() => {
                alert('เสนอใบลาเรียบร้อยแล้ว (ออฟไลน์)');
             }, 300);
        }
    };

    const handleDeleteRequest = async (e: React.MouseEvent, reqId: string) => {
        e.stopPropagation();
        
        // Strict Check: Only Director or Admin can delete
        if (!isDirector && !isSystemAdmin) {
            alert("สิทธิ์ไม่ถึง: เฉพาะผู้อำนวยการเท่านั้นที่สามารถลบรายการลาได้");
            return;
        }

        if (!confirm("คุณต้องการลบรายการลานี้ใช่หรือไม่? (การกระทำนี้ไม่สามารถย้อนกลับได้)")) return;

        if (isConfigured && db) {
            try {
                await deleteDoc(doc(db, "leave_requests", reqId));
            } catch (error) {
                console.error("Delete error", error);
                alert("เกิดข้อผิดพลาดในการลบข้อมูล");
            }
        } else {
            setRequests(requests.filter(r => r.id !== reqId));
        }
    };

    const handleDirectorApprove = async (req: LeaveRequest, isApproved: boolean) => {
        setIsProcessingApproval(true);
        
        // UX: Fake delay to show the "Creating Document" effect
        await new Promise(resolve => setTimeout(resolve, 2000));

        let updatedData: any = {
            status: isApproved ? 'Approved' : 'Rejected',
            directorSignature: isApproved ? (currentUser.name) : undefined,
            approvedDate: new Date().toISOString().split('T')[0]
        };

        if (isConfigured && db) {
            try {
                 const reqRef = doc(db, "leave_requests", req.id);
                 await updateDoc(reqRef, updatedData);
            } catch(e) {
                console.warn(e);
            }
        } else {
            // Mock
            const updatedRequests = requests.map(r => r.id === req.id ? { ...r, ...updatedData } : r);
            setRequests(updatedRequests);
        }

        setIsProcessingApproval(false);
        setSelectedRequest(null);
    };

    // --- Renderers ---

    const filteredRequests = (canViewAll)
        ? requests 
        : requests.filter(r => r.teacherId === currentUser.id);
    
    // Split into Pending and History for Mobile View
    const pendingRequests = filteredRequests.filter(r => r.status === 'Pending');
    const historyRequests = filteredRequests.filter(r => r.status !== 'Pending');

    if (isLoading) return <div className="p-10 text-center"><Loader className="animate-spin inline mr-2"/></div>;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
             {viewMode !== 'REPORT_DASHBOARD' && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-emerald-800 text-white p-4 rounded-xl print:hidden">
                    <div>
                        <h2 className="text-xl font-bold">ระบบการลาอิเล็กทรอนิกส์</h2>
                        <div className="flex items-center gap-2 text-sm text-emerald-100">
                             <span>ผู้ใช้งาน: <span className="font-bold text-yellow-300">{currentUser.name}</span></span>
                        </div>
                    </div>
                </div>
            )}

            {/* --- LIST VIEW --- */}
            {viewMode === 'LIST' && (
                <>
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-slate-600 font-bold">รายการลา ({filteredRequests.length})</div>
                        <button onClick={handleFormInit} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                            <FilePlus size={18} /> <span className="hidden sm:inline">ยื่นใบลาใหม่</span> <span className="sm:hidden">ยื่นใบลา</span>
                        </button>
                    </div>

                    {/* SECTION 1: PENDING (CARDS VIEW) */}
                    {pendingRequests.length > 0 && (
                        <div className="mb-8">
                             <h3 className="text-orange-600 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                                <Clock size={16}/> รอการพิจารณา / กำลังดำเนินการ
                             </h3>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {pendingRequests.map(req => (
                                    <div 
                                        key={req.id}
                                        onClick={() => setSelectedRequest(req)}
                                        className="bg-white rounded-xl shadow-md border-l-4 border-l-yellow-400 p-4 cursor-pointer hover:shadow-lg transition-all active:scale-[0.98] relative group"
                                    >
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                                    <User size={20}/>
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 leading-tight">{req.teacherName}</div>
                                                    <div className="text-xs text-slate-500">{req.teacherPosition || 'ครู'}</div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="bg-yellow-100 text-yellow-700 text-[10px] px-2 py-1 rounded-full font-bold border border-yellow-200">
                                                    รอการพิจารณา
                                                </span>
                                                {/* Only Director can delete for evidence */}
                                                {(isDirector || isSystemAdmin) && (
                                                    <button 
                                                        onClick={(e) => handleDeleteRequest(e, req.id)}
                                                        className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                                                        title="ลบใบลา"
                                                    >
                                                        <Trash2 size={16}/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2 mb-4">
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-500">ประเภท:</span>
                                                <span className="font-bold text-slate-700">{getLeaveTypeName(req.type)}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-slate-500 flex items-center gap-1"><Calendar size={14}/> วันที่:</span>
                                                <span className="font-bold text-slate-700">{getThaiDate(req.startDate)} - {getThaiDate(req.endDate)}</span>
                                            </div>
                                            <div className="text-sm bg-slate-50 p-2 rounded text-slate-600 italic border border-slate-100">
                                                "{req.reason}"
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end border-t pt-3 gap-2">
                                             {/* If Director, show Review Text */}
                                             {canApprove ? (
                                                <span className="text-blue-600 font-bold text-xs flex items-center gap-1 animate-pulse">
                                                    คลิกเพื่อพิจารณา <ChevronRight size={14}/>
                                                </span>
                                             ) : (
                                                 <span className="text-slate-400 text-xs flex items-center gap-1">
                                                    ดูรายละเอียด <ChevronRight size={14}/>
                                                 </span>
                                             )}
                                        </div>
                                    </div>
                                ))}
                             </div>
                        </div>
                    )}

                    {/* SECTION 2: HISTORY (TABLE VIEW) */}
                    <div className="mb-4">
                         <h3 className="text-slate-600 font-bold mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <Database size={16}/> ประวัติการลา (อนุมัติแล้ว/ไม่อนุมัติ)
                         </h3>
                         
                         <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                             {historyRequests.length === 0 ? (
                                 <div className="p-8 text-center text-slate-400">ยังไม่มีประวัติการลา</div>
                             ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3">วันที่</th>
                                            <th className="px-4 py-3">ผู้ขอ</th>
                                            <th className="px-4 py-3 hidden md:table-cell">ประเภท</th>
                                            <th className="px-4 py-3 hidden md:table-cell">เหตุผล</th>
                                            <th className="px-4 py-3 text-center">สถานะ</th>
                                            <th className="px-4 py-3 text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {historyRequests.map((req) => (
                                            <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-3 text-slate-600 font-medium whitespace-nowrap">
                                                    {getThaiDate(req.startDate)}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-slate-800">
                                                    {req.teacherName}
                                                    <div className="md:hidden text-xs text-slate-400 mt-0.5">{getLeaveTypeName(req.type)}</div>
                                                </td>
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    <span className="px-2 py-0.5 rounded text-xs border bg-slate-50 border-slate-200 text-slate-600">
                                                        {getLeaveTypeName(req.type)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 max-w-xs truncate hidden md:table-cell">{req.reason}</td>
                                                <td className="px-4 py-3 flex justify-center">
                                                    {getStatusBadge(req.status)}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className="text-slate-400 hover:text-slate-600 p-1">
                                                            <Printer size={16}/>
                                                        </button>
                                                        {(isDirector || isSystemAdmin) && (
                                                            <button 
                                                                onClick={(e) => handleDeleteRequest(e, req.id)}
                                                                className="text-slate-400 hover:text-red-600 p-1"
                                                                title="ลบข้อมูล"
                                                            >
                                                                <Trash2 size={16}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                             )}
                        </div>
                    </div>
                </>
            )}

            {/* --- REPORT DASHBOARD VIEW --- */}
            {viewMode === 'REPORT_DASHBOARD' && (
                <div className="p-4 bg-white">Report Dashboard Placeholder</div>
            )}

            {/* --- FORM VIEW --- */}
            {viewMode === 'FORM' && (
                 <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-lg border border-emerald-100 animate-slide-up relative">
                     {isUploading && (
                        <div className="absolute inset-0 z-50 bg-white/95 flex items-center justify-center flex-col">
                            <Loader className="animate-spin text-emerald-600 mb-4" size={48}/>
                            <h3 className="text-xl font-bold text-slate-800 mb-1">{uploadStatus || 'กำลังประมวลผล...'}</h3>
                            <p className="text-slate-500 text-sm">กรุณารอสักครู่ ห้ามปิดหน้าต่างนี้</p>
                        </div>
                     )}

                     <h3 className="text-xl font-bold text-slate-800 mb-6 border-b pb-4">แบบฟอร์มขออนุญาตลา</h3>
                     <form onSubmit={handlePreSubmitCheck} className="space-y-4">
                        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 flex gap-2">
                            <FileText size={16} className="mt-0.5"/>
                            <p>
                                ระบบจะนำ <strong>ข้อมูลตำแหน่ง</strong> และ <strong>ลายเซ็น</strong> จาก "ข้อมูลส่วนตัว" 
                                ของท่านมาใส่ในใบลาโดยอัตโนมัติ
                            </p>
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">ประเภทการลา</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {['Sick', 'Personal', 'Maternity', 'OffCampus', 'Late'].map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleLeaveTypeChange(type)}
                                        className={`py-3 px-2 rounded-lg text-sm font-medium border transition-all ${
                                            leaveType === type 
                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md transform scale-105' 
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        {getLeaveTypeName(type)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">วันที่เริ่มต้น</label>
                                <input required type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">ถึงวันที่</label>
                                <input required type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
                            </div>
                        </div>

                        {(leaveType === 'OffCampus' || leaveType === 'Late') && (
                            <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">เวลาเริ่มต้น</label>
                                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
                                </div>
                                {leaveType === 'OffCampus' && (
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">ถึงเวลา</label>
                                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-3 py-2 border rounded-lg"/>
                                    </div>
                                )}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">เหตุผลการลา</label>
                            <textarea required value={reason} onChange={e => setReason(e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg"/>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">ข้อมูลติดต่อ (ที่อยู่)</label>
                            <textarea required value={contactInfo} onChange={e => setContactInfo(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-lg"/>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-1">
                                <Phone size={14}/> เบอร์โทรศัพท์
                            </label>
                            <input 
                                required 
                                type="tel" 
                                value={mobilePhone} 
                                onChange={e => setMobilePhone(e.target.value)} 
                                className="w-full px-3 py-2 border rounded-lg font-mono"
                                placeholder="0XX-XXX-XXXX"
                            />
                        </div>

                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                             <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <Paperclip size={16}/> เอกสารแนบ (เช่น ใบรับรองแพทย์)
                             </label>
                             <input 
                                type="file" 
                                accept="image/*,.pdf"
                                onChange={(e) => setEvidenceFile(e.target.files ? e.target.files[0] : null)}
                                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                             />
                        </div>

                        <div className="flex gap-3 pt-4 border-t mt-6">
                            <button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-3 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 font-bold">ยกเลิก</button>
                            <button type="submit" className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-md hover:bg-emerald-700">บันทึกข้อมูล</button>
                        </div>
                     </form>
                 </div>
            )}

            {/* --- PDF VIEW --- */}
            {viewMode === 'PDF' && selectedRequest && (
                <div className={`flex flex-col lg:flex-row gap-6 ${isHighlighted ? 'ring-4 ring-emerald-300 rounded-xl transition-all duration-500' : ''}`}>
                    
                    {/* Left: PDF Preview (or Loader) */}
                    <div className="flex-1 bg-slate-500 rounded-xl overflow-hidden shadow-2xl min-h-[500px] lg:min-h-[800px] relative">
                         {isGeneratingPdf ? (
                            <div className="absolute inset-0 flex items-center justify-center flex-col text-white">
                                <Loader className="animate-spin mb-4" size={48}/>
                                <p>กำลังสร้างเอกสาร PDF...</p>
                            </div>
                         ) : (
                            <iframe 
                                src={pdfUrl} 
                                className="w-full h-full"
                                title="Leave PDF Preview"
                            />
                         )}
                    </div>

                    {/* Right: Controls & Approval Panel */}
                    <div className="w-full lg:w-80 space-y-4">
                        <button onClick={() => setViewMode('LIST')} className="w-full py-2 bg-white text-slate-600 rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 font-bold flex items-center justify-center gap-2">
                            <ArrowLeft size={18}/> ย้อนกลับ
                        </button>
                        
                        {/* Approval Panel (Only for Director & Pending) */}
                        {canApprove && selectedRequest.status === 'Pending' && (
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 shadow-sm animate-pulse-slow">
                                <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                                    <UserCheck size={20}/> ส่วนพิจารณา (ผอ.)
                                </h4>
                                <p className="text-xs text-blue-600 mb-4">
                                    เมื่อกดอนุมัติ ระบบจะลงนามลายเซ็นดิจิทัลของคุณลงในแบบฟอร์มทันที
                                </p>
                                <div className="space-y-2">
                                    <button 
                                        onClick={() => handleDirectorApprove(selectedRequest, true)}
                                        disabled={isProcessingApproval}
                                        className="w-full py-3 bg-green-600 text-white rounded-lg shadow-md hover:bg-green-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isProcessingApproval ? <Loader className="animate-spin"/> : <CheckCircle size={20}/>}
                                        อนุมัติ / อนุญาต
                                    </button>
                                    <button 
                                        onClick={() => handleDirectorApprove(selectedRequest, false)}
                                        disabled={isProcessingApproval}
                                        className="w-full py-3 bg-red-100 text-red-700 border border-red-200 rounded-lg hover:bg-red-200 font-bold flex items-center justify-center gap-2"
                                    >
                                        <XCircle size={20}/> ไม่อนุมัติ
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* Download / Status Info */}
                         <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h4 className="font-bold text-slate-800 mb-3">ข้อมูลเอกสาร</h4>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">สถานะ</span>
                                    {getStatusBadge(selectedRequest.status)}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">วันที่ยื่น</span>
                                    <span>{getThaiDate(selectedRequest.createdAt || '')}</span>
                                </div>
                                
                                {selectedRequest.evidenceUrl && (
                                     <a 
                                        href={selectedRequest.evidenceUrl} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="block mt-4 text-center py-2 bg-slate-100 text-slate-700 rounded border border-slate-200 hover:bg-slate-200 font-bold text-xs"
                                    >
                                        ดูเอกสารแนบ (เช่น ใบรับรองแพทย์)
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Warning Modal (Off Campus) */}
            {showWarningModal && (
                 <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                     <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-up">
                         <div className="text-center mb-4">
                             <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                 <Clock size={32}/>
                             </div>
                             <h3 className="text-xl font-bold text-slate-800">แจ้งเตือนการออกนอกบริเวณ</h3>
                             <p className="text-slate-500 mt-2">
                                 เดือนนี้ท่านได้ขออนุญาตออกนอกสถานศึกษาไปแล้ว <strong className="text-red-600 text-lg">{offCampusCount}</strong> ครั้ง
                             </p>
                         </div>
                         <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500 mb-6 border">
                             ตามระเบียบโรงเรียน หากออกนอกบริเวณเกินจำนวนที่กำหนด อาจมีผลต่อการพิจารณาความดีความชอบ
                         </div>
                         <div className="flex gap-3">
                             <button onClick={() => setShowWarningModal(false)} className="flex-1 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold">
                                 ยกเลิก
                             </button>
                             <button onClick={submitRequest} className="flex-1 py-2 bg-yellow-500 text-white hover:bg-yellow-600 rounded-lg font-bold">
                                 ยืนยันส่งใบลา
                             </button>
                         </div>
                     </div>
                 </div>
            )}
        </div>
    );
};

export default LeaveSystem;