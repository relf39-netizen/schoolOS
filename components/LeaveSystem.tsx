
import React, { useState, useEffect } from 'react';
import { LeaveRequest, Teacher, School, SystemConfig } from '../types';
import { Clock, CheckCircle, XCircle, FilePlus, AlertTriangle, FileText, Download, UserCheck, Printer, ArrowLeft, Loader, Database, ServerOff, UploadCloud, Link as LinkIcon, Paperclip, Eye, Phone } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, onSnapshot, query, orderBy, doc, updateDoc, QuerySnapshot, DocumentData, getDoc } from 'firebase/firestore';
import { MOCK_LEAVE_REQUESTS } from '../constants';

interface LeaveSystemProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
    currentSchool?: School;
}

const LeaveSystem: React.FC<LeaveSystemProps> = ({ currentUser, allTeachers, currentSchool }) => {
    // State
    const [requests, setRequests] = useState<LeaveRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // View Modes: LIST | FORM | PDF | REPORT_DASHBOARD
    const [viewMode, setViewMode] = useState<'LIST' | 'FORM' | 'PDF' | 'REPORT_DASHBOARD'>('LIST');
    const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);

    // Form State
    const [leaveType, setLeaveType] = useState('Sick');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [reason, setReason] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [mobilePhone, setMobilePhone] = useState(''); // New State
    
    // File Upload State
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>(''); // New state for granular status message

    // Warning Modal State
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [offCampusCount, setOffCampusCount] = useState(0);

    // Report State
    const [reportRange, setReportRange] = useState({ start: new Date().getFullYear()+'-05-16', end: (new Date().getFullYear()+1)+'-03-31' }); 
    const [reportType, setReportType] = useState<'OVERVIEW' | 'INDIVIDUAL'>('OVERVIEW');
    const [selectedTeacherForReport, setSelectedTeacherForReport] = useState<string>(allTeachers[0]?.id || 't1');

    // System Config for Drive Upload
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);

    // Permissions
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isSystemAdmin = currentUser.roles.includes('SYSTEM_ADMIN');
    
    const canApprove = isDirector;
    const canViewAll = isDirector || isSystemAdmin || isDocOfficer;

    // --- Data Connection (Hybrid) ---
    useEffect(() => {
        let unsubscribe: () => void;
        let timeoutId: NodeJS.Timeout;

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
            const q = query(collection(db, "leave_requests"), orderBy("createdAt", "desc"));
            unsubscribe = onSnapshot(q, (querySnapshot: QuerySnapshot<DocumentData>) => {
                clearTimeout(timeoutId);
                const fetchedRequests: LeaveRequest[] = [];
                querySnapshot.forEach((doc) => {
                    fetchedRequests.push({ id: doc.id, ...doc.data() } as LeaveRequest);
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
    }, []);

    // --- Helpers ---

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
        return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'Approved': return <span className="flex items-center gap-1 text-green-600 bg-green-100 px-2 py-1 rounded-full text-xs font-medium"><CheckCircle size={12}/> อนุมัติแล้ว</span>;
            case 'Rejected': return <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-1 rounded-full text-xs font-medium"><XCircle size={12}/> ไม่อนุมัติ</span>;
            default: return <span className="flex items-center gap-1 text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full text-xs font-medium"><Clock size={12}/> รออนุมัติ</span>;
        }
    };

    const countWorkingDays = (startStr: string, endStr: string) => {
        if (!startStr || !endStr) return 0;
        const start = new Date(startStr);
        const end = new Date(endStr);
        let count = 0;
        const cur = new Date(start);
        while (cur <= end) {
            const dayOfWeek = cur.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) count++; 
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    };

    // Helper: Fiscal Year
    const getFiscalYear = (date: Date) => {
        return date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear(); // Fiscal year starts Oct 1
    };

    const calculateFormStats = (req: LeaveRequest) => {
        const reqDate = new Date(req.startDate);
        const fiscalYear = getFiscalYear(reqDate);
        const fyStart = new Date(fiscalYear - 1, 9, 1).toISOString().split('T')[0];
        
        const previousRequests = requests.filter(r => 
            r.teacherId === req.teacherId && 
            r.status === 'Approved' && 
            r.startDate >= fyStart && 
            r.startDate < req.startDate
        );

        const sumDays = (type: string) => previousRequests
            .filter(r => r.type === type)
            .reduce((acc, r) => acc + countWorkingDays(r.startDate, r.endDate), 0);
            
        // Count Times for Late / OffCampus
        const countTimes = (type: string) => previousRequests.filter(r => r.type === type).length;

        const prevSick = sumDays('Sick');
        const prevPersonal = sumDays('Personal');
        const prevMaternity = sumDays('Maternity');
        const prevLate = countTimes('Late');
        const prevOffCampus = countTimes('OffCampus');

        const currentDays = countWorkingDays(req.startDate, req.endDate);
        
        // Find last leave of the SAME CATEGORY group
        // If Late/OffCampus, we look for Late/OffCampus
        // If Normal Leave, we look for Sick/Personal/Maternity
        let lastLeave = null;
        if (req.type === 'Late' || req.type === 'OffCampus') {
             lastLeave = previousRequests.filter(r => r.type === req.type).sort((a,b) => b.startDate.localeCompare(a.startDate))[0];
        } else {
             lastLeave = previousRequests.filter(r => ['Sick', 'Personal', 'Maternity'].includes(r.type)).sort((a,b) => b.startDate.localeCompare(a.startDate))[0];
        }
        
        const lastLeaveDays = lastLeave ? countWorkingDays(lastLeave.startDate, lastLeave.endDate) : 0;

        return { prevSick, prevPersonal, prevMaternity, prevLate, prevOffCampus, currentDays, lastLeave, lastLeaveDays };
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
                 alert("ระบบยังไม่ได้ตั้งค่า Google Drive ไม่สามารถอัปโหลดไฟล์ได้ (บันทึกเฉพาะข้อมูลการลา)");
            }
        }

        // 2. Prepare Payload (SANITIZE: No undefined values)
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
            createdAt: new Date().toISOString()
        };

        // Conditionally add optional fields
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
                
                // Clear state
                setIsUploading(false);
                setUploadStatus('');
                setViewMode('LIST');
                setShowWarningModal(false);
                
                // Alert success only after finished
                setTimeout(() => {
                    alert('เสนอใบลาเรียบร้อยแล้ว');
                }, 300);

            } catch (e) {
                console.warn(e);
                setIsUploading(false);
                setUploadStatus('');
                alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล (Firebase Error)');
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

    const handleDirectorApprove = async (req: LeaveRequest, isApproved: boolean) => {
        let updatedData: any = {
            status: isApproved ? 'Approved' : 'Rejected',
            directorSignature: isApproved ? (currentUser.name) : undefined,
            approvedDate: new Date().toISOString().split('T')[0]
        };

        // No generated PDF needed as per request.

        if (isConfigured && db) {
            try {
                 const reqRef = doc(db, "leave_requests", req.id);
                 await updateDoc(reqRef, updatedData);
                 setSelectedRequest(null);
                 alert(`บันทึกผลการพิจารณาเรียบร้อย`);
            } catch(e) {
                console.warn(e);
            }
        } else {
            // Mock
            const updatedRequests = requests.map(r => r.id === req.id ? { ...r, ...updatedData } : r);
            setRequests(updatedRequests);
            setSelectedRequest(null);
            alert(`บันทึกผลการพิจารณาเรียบร้อย (ออฟไลน์)`);
        }
    };

    // --- Renderers ---

    // Updated renderPDF to include signatures
    const renderPDF = (req: LeaveRequest) => {
        const stats = calculateFormStats(req);
        const schoolName = currentSchool?.name || 'โรงเรียน...................';
        const toThaiDate = (dateStr: string) => {
             if(!dateStr) return '....................';
             const d = new Date(dateStr);
             return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
        };
        const createDate = req.createdAt ? new Date(req.createdAt) : new Date();

        // Get Signatures
        const teacher = allTeachers.find(t => t.id === req.teacherId);
        const teacherSig = teacher?.signatureBase64;
        const teacherPos = req.teacherPosition || teacher?.position || 'ครู';
        
        // Director Signature comes from sysConfig if approved
        const directorSig = (req.status === 'Approved' && sysConfig?.directorSignatureBase64) ? sysConfig.directorSignatureBase64 : null;

        // Dynamic Header & Content based on Type
        let formTitle = "แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว";
        if (req.type === 'Late') formTitle = "แบบขออนุญาตเข้าสาย";
        if (req.type === 'OffCampus') formTitle = "แบบขออนุญาตออกนอกบริเวณโรงเรียน";

        // Dynamic Stats Logic
        const isLate = req.type === 'Late';
        const isOffCampus = req.type === 'OffCampus';
        const isNormalLeave = !isLate && !isOffCampus;

        return (
            <div id="printable-area" className="bg-white border border-slate-300 shadow-lg p-10 min-h-[1123px] w-[794px] mx-auto relative font-sarabun text-black leading-relaxed print:shadow-none print:border-none print:m-0 print:w-full">
                {/* Garuda Header */}
                <div className="flex flex-col items-center mb-6">
                    <img 
                        src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Emblem_of_the_Ministry_of_Education_of_Thailand.svg/1200px-Emblem_of_the_Ministry_of_Education_of_Thailand.svg.png" 
                        alt="Garuda" 
                        className="h-20 mb-2 grayscale opacity-90"
                    />
                    <div className="font-bold text-lg">{formTitle}</div>
                </div>

                <div className="text-right mt-2">เขียนที่ {schoolName}</div>
                <div className="text-right mt-1">วันที่ {createDate.getDate()} เดือน {createDate.toLocaleDateString('th-TH', { month: 'long' })} พ.ศ. {createDate.getFullYear() + 543}</div>
                
                <div className="mt-6 mb-2"><span className="font-bold">เรื่อง</span> ขออนุญาต{getLeaveTypeName(req.type)}</div>
                <div className="mb-4"><span className="font-bold">เรียน</span> ผู้อำนวยการ{schoolName}</div>

                <div className="indent-12 mb-2 text-justify">
                    ข้าพเจ้า <span className="font-bold">{req.teacherName}</span> ตำแหน่ง {teacherPos}
                </div>
                <div className="mb-4">สังกัด {schoolName}</div>

                {/* Body Content */}
                {isNormalLeave ? (
                    <div className="mb-2 flex flex-col gap-1 pl-4">
                        <div className="flex items-center gap-2"><div className={`w-4 h-4 rounded-full border border-black ${req.type === 'Sick' ? 'bg-black' : ''}`}></div> ป่วย</div>
                        <div className="flex items-center gap-2"><div className={`w-4 h-4 rounded-full border border-black ${req.type === 'Maternity' ? 'bg-black' : ''}`}></div> คลอดบุตร <span className="ml-2">เนื่องจาก {req.type === 'Maternity' ? req.reason : '..................................................................'}</span></div>
                        <div className="flex items-center gap-2"><div className={`w-4 h-4 rounded-full border border-black ${req.type === 'Personal' ? 'bg-black' : ''}`}></div> กิจส่วนตัว</div>
                    </div>
                ) : (
                    <div className="mb-2 indent-12">
                         มีความประสงค์ขอ{getLeaveTypeName(req.type)} เนื่องจาก {req.reason}
                    </div>
                )}

                <div className="mb-2">
                    ตั้งแต่วันที่ <span className="font-bold underline px-2">{toThaiDate(req.startDate)}</span> 
                    {req.startTime && <span> เวลา {req.startTime} น. </span>}
                    ถึงวันที่ <span className="font-bold underline px-2">{toThaiDate(req.endDate)}</span> 
                    {req.endTime && <span> เวลา {req.endTime} น. </span>}
                    {isNormalLeave && <span>มีกำหนด <span className="font-bold underline px-2">{stats.currentDays}</span> วัน</span>}
                </div>
                
                {/* Last Leave History (Context dependent) */}
                <div className="mb-4">
                    ข้าพเจ้าได้{isNormalLeave ? 'ลา' : 'ขออนุญาต'}
                    {isNormalLeave && (
                        <>
                            <span className="mx-2 inline-flex items-center gap-1"><div className={`w-3 h-3 rounded-full border border-black ${stats.lastLeave?.type === 'Sick' ? 'bg-black' : ''}`}></div> ป่วย</span>
                            <span className="mx-2 inline-flex items-center gap-1"><div className={`w-3 h-3 rounded-full border border-black ${stats.lastLeave?.type === 'Personal' ? 'bg-black' : ''}`}></div> กิจส่วนตัว</span>
                            <span className="mx-2 inline-flex items-center gap-1"><div className={`w-3 h-3 rounded-full border border-black ${stats.lastLeave?.type === 'Maternity' ? 'bg-black' : ''}`}></div> คลอดบุตร</span>
                        </>
                    )}
                    {isLate && <span className="mx-2 font-bold">เข้าสาย</span>}
                    {isOffCampus && <span className="mx-2 font-bold">ออกนอกบริเวณ</span>}

                    ครั้งสุดท้ายตั้งแต่วันที่ <span className="underline decoration-dotted px-2">{stats.lastLeave ? toThaiDate(stats.lastLeave.startDate) : '.........................'}</span> 
                    ถึงวันที่ <span className="underline decoration-dotted px-2">{stats.lastLeave ? toThaiDate(stats.lastLeave.endDate) : '.........................'}</span> 
                    {isNormalLeave && <span>มีกำหนด <span className="underline decoration-dotted px-2">{stats.lastLeave ? countWorkingDays(stats.lastLeave.startDate, stats.lastLeave.endDate) : '...'}</span> วัน</span>}
                </div>

                <div className="mb-8">ในระหว่างลาติดต่อข้าพเจ้าได้ที่ <span className="underline decoration-dotted font-bold">{req.contactInfo || '.......................................................................................................................................'}</span> เบอร์โทรศัพท์ <span className="underline decoration-dotted font-bold">{req.mobilePhone || '...............................'}</span></div>

                {/* Teacher Signature */}
                <div className="text-right mb-8 pr-10">
                     <p>ขอแสดงความนับถือ</p>
                     <br/>
                     {teacherSig ? (
                         <div className="flex flex-col items-end pr-8">
                             <img src={teacherSig} alt="Signature" className="h-10 object-contain" />
                             <div className="mt-1 text-center">
                                 <p>( {req.teacherName} )</p>
                                 <p>ตำแหน่ง {teacherPos}</p>
                             </div>
                         </div>
                     ) : (
                         <div className="flex flex-col items-end pr-4">
                             <p>(ลงชื่อ).....................................................</p>
                             <div className="mt-1 text-center">
                                 <p>( {req.teacherName} )</p>
                                 <p>ตำแหน่ง {teacherPos}</p>
                             </div>
                         </div>
                     )}
                </div>

                {/* Footer Columns: Stats & Director Approval ONLY */}
                <div className="flex gap-4 mb-4">
                    {/* Column 1: Statistics */}
                    <div className="w-1/2">
                        <div className="font-bold mb-1">สถิติการ{isNormalLeave ? 'ลา' : 'ขออนุญาต'}ในปีงบประมาณนี้</div>
                        <table className="w-full border-collapse border border-black text-center text-sm">
                            <thead>
                                <tr>
                                    <th className="border border-black p-1">ประเภท</th>
                                    <th className="border border-black p-1">{isNormalLeave ? 'ลามาแล้ว' : 'เคยขอ'}<br/>(วัน/ครั้ง)</th>
                                    <th className="border border-black p-1">{isNormalLeave ? 'ลาครั้งนี้' : 'ขอครั้งนี้'}<br/>(วัน/ครั้ง)</th>
                                    <th className="border border-black p-1">รวมเป็น<br/>(วัน/ครั้ง)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isNormalLeave ? (
                                    <>
                                        <tr>
                                            <td className="border border-black p-1">ป่วย</td>
                                            <td className="border border-black p-1">{stats.prevSick}</td>
                                            <td className="border border-black p-1">{req.type === 'Sick' ? stats.currentDays : '-'}</td>
                                            <td className="border border-black p-1">{stats.prevSick + (req.type === 'Sick' ? stats.currentDays : 0)}</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-black p-1">กิจส่วนตัว</td>
                                            <td className="border border-black p-1">{stats.prevPersonal}</td>
                                            <td className="border border-black p-1">{req.type === 'Personal' ? stats.currentDays : '-'}</td>
                                            <td className="border border-black p-1">{stats.prevPersonal + (req.type === 'Personal' ? stats.currentDays : 0)}</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-black p-1">คลอดบุตร</td>
                                            <td className="border border-black p-1">{stats.prevMaternity}</td>
                                            <td className="border border-black p-1">{req.type === 'Maternity' ? stats.currentDays : '-'}</td>
                                            <td className="border border-black p-1">{stats.prevMaternity + (req.type === 'Maternity' ? stats.currentDays : 0)}</td>
                                        </tr>
                                    </>
                                ) : (
                                    <tr>
                                        <td className="border border-black p-1">{isLate ? 'เข้าสาย' : 'ออกนอกบริเวณ'}</td>
                                        <td className="border border-black p-1">{isLate ? stats.prevLate : stats.prevOffCampus}</td>
                                        <td className="border border-black p-1">1</td>
                                        <td className="border border-black p-1">{(isLate ? stats.prevLate : stats.prevOffCampus) + 1}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Column 2: Director Approval (Removed Inspector/Commander) */}
                    <div className="w-1/2 pl-4 flex flex-col justify-end pb-4">
                         <div className="border border-black p-4 rounded-sm">
                             <div className="font-bold mb-2 text-center">คำสั่ง / การพิจารณา</div>
                             <div className="flex flex-col gap-1 mb-4 pl-4">
                                 <div className="flex items-center gap-2"><div className={`w-4 h-4 rounded-full border border-black ${req.status === 'Approved' ? 'bg-black' : ''}`}></div> อนุญาต</div>
                                 <div className="flex items-center gap-2"><div className={`w-4 h-4 rounded-full border border-black ${req.status === 'Rejected' ? 'bg-black' : ''}`}></div> ไม่อนุมัติ</div>
                             </div>
                             
                             <div className="text-center mt-4 min-h-[100px] flex flex-col justify-end items-center">
                                 {req.status === 'Approved' && directorSig ? (
                                      <div className="flex flex-col items-center">
                                          <img src={directorSig} alt="Director Sig" className="h-10 object-contain mb-1" />
                                          <p>( {req.directorSignature} )</p>
                                          <p>ตำแหน่ง ผู้อำนวยการโรงเรียน</p>
                                          <p>วันที่ {toThaiDate(req.approvedDate || '')}</p>
                                      </div>
                                 ) : (
                                     <>
                                        <p>(ลงชื่อ).......................................................</p>
                                        <p>(.....................................................)</p>
                                        <p>ตำแหน่ง ผู้อำนวยการโรงเรียน</p>
                                        <p>วันที่........... /........................... /................</p>
                                     </>
                                 )}
                             </div>
                         </div>
                    </div>
                </div>
            </div>
        );
    };

    const filteredRequests = (canViewAll)
        ? requests 
        : requests.filter(r => r.teacherId === currentUser.id);

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
                        <div className="text-slate-600 font-bold">ประวัติการลา {filteredRequests.length} รายการ</div>
                        <button onClick={handleFormInit} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 transition-colors">
                            <FilePlus size={18} /> <span>ยื่นใบลาใหม่</span>
                        </button>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="px-4 py-3">ผู้ขอ</th>
                                    <th className="px-4 py-3">ประเภท</th>
                                    <th className="px-4 py-3">ช่วงเวลา (ว/ด/ป)</th>
                                    <th className="px-4 py-3">เหตุผล</th>
                                    <th className="px-4 py-3 text-center">สถานะ</th>
                                    <th className="px-4 py-3 text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredRequests.map((req) => (
                                    <tr key={req.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium">{req.teacherName}</td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded text-xs border bg-slate-50 border-slate-200 text-slate-600">
                                                {getLeaveTypeName(req.type)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600">
                                            {getThaiDate(req.startDate)} ถึง {getThaiDate(req.endDate)}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{req.reason}</td>
                                        <td className="px-4 py-3 flex justify-center">
                                            {getStatusBadge(req.status)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {canApprove && req.status === 'Pending' && (
                                                <button onClick={() => setSelectedRequest(req)} className="text-blue-600 hover:text-blue-800 text-xs underline mr-2">
                                                    พิจารณา
                                                </button>
                                            )}
                                            
                                            <div className="flex justify-end gap-2">
                                                {/* Show Evidence Link */}
                                                {req.evidenceUrl && (
                                                    <a href={req.evidenceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-bold border border-blue-200 px-2 py-1 rounded">
                                                        <Paperclip size={12}/> หลักฐาน
                                                    </a>
                                                )}
                                                
                                                {/* View/Print Button for ALL statuses */}
                                                <button onClick={() => { setSelectedRequest(req); setViewMode('PDF'); }} className="text-slate-600 hover:text-slate-800 flex items-center gap-1 text-xs font-bold border border-slate-200 px-2 py-1 rounded">
                                                    <Printer size={12}/> พิมพ์/ดูรายละเอียด
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                                ของท่านมาใส่ในใบลาโดยอัตโนมัติ กรุณาตรวจสอบให้แน่ใจว่าท่านได้อัปโหลดลายเซ็นเรียบร้อยแล้ว
                            </p>
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">ประเภทการลา</label>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                {['Sick', 'Personal', 'Maternity', 'OffCampus', 'Late'].map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => handleLeaveTypeChange(type)}
                                        className={`py-2 px-2 rounded-lg text-sm font-medium border transition-all ${
                                            leaveType === type 
                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' 
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
                            <label className="block text-sm font-medium text-slate-700 mb-1">ข้อมูลติดต่อระหว่างลา (ที่อยู่)</label>
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
                             <p className="text-xs text-slate-400 mt-2">
                                * ไฟล์ที่อัปโหลดจะถูกเก็บไว้ใน Google Drive และแนบลิงก์ไว้กับคำขอนี้
                             </p>
                        </div>

                        <div className="flex gap-3 pt-4 border-t mt-6">
                            <button type="button" onClick={() => setViewMode('LIST')} className="flex-1 py-2 text-slate-600 bg-slate-100 rounded-lg">ยกเลิก</button>
                            <button type="submit" className="flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold">บันทึกข้อมูล</button>
                        </div>
                     </form>
                 </div>
            )}

            {/* --- PDF VIEW (or Fallback Download View) --- */}
            {viewMode === 'PDF' && selectedRequest && (
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Add styles for printing */}
                    <style>{`
                        @media print {
                            body * {
                                visibility: hidden;
                            }
                            #printable-area, #printable-area * {
                                visibility: visible;
                            }
                            #printable-area {
                                position: absolute;
                                left: 0;
                                top: 0;
                                width: 100%;
                                margin: 0;
                                padding: 0;
                                border: none;
                                shadow: none;
                            }
                            @page {
                                size: A4;
                                margin: 0;
                            }
                        }
                    `}</style>
                    <div className="flex-1 bg-slate-200 rounded-xl p-4 overflow-y-auto shadow-inner custom-scrollbar flex justify-center">
                        {renderPDF(selectedRequest)}
                    </div>
                    <div className="w-full lg:w-64 flex flex-col gap-4 print:hidden">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-2">การดำเนินการ</h4>
                            <button onClick={() => window.print()} className="w-full mb-2 py-2 bg-slate-800 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-slate-900">
                                <Printer size={16}/> พิมพ์เอกสาร
                            </button>
                            
                             {selectedRequest.evidenceUrl && (
                                <button onClick={() => window.open(selectedRequest.evidenceUrl, '_blank')} className="w-full mb-2 py-2 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700">
                                    <Paperclip size={16}/> ดูเอกสารแนบ (หลักฐาน)
                                </button>
                            )}
                            
                            <button onClick={() => setViewMode('LIST')} className="w-full py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- MODAL: DIRECTOR APPROVE --- */}
            {canApprove && selectedRequest && viewMode === 'LIST' && selectedRequest.status === 'Pending' && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
                        <div className="bg-blue-600 text-white p-4 font-bold text-lg flex items-center gap-2">
                             <UserCheck size={24}/> พิจารณาคำขออนุญาต
                        </div>
                        <div className="p-6">
                            <h4 className="font-bold text-lg">{selectedRequest.teacherName}</h4>
                            <p className="text-slate-500 mb-2">{getLeaveTypeName(selectedRequest.type)}: {selectedRequest.reason}</p>
                            
                            {selectedRequest.evidenceUrl && (
                                <a 
                                    href={selectedRequest.evidenceUrl} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="block mb-4 text-blue-600 text-sm hover:underline flex items-center gap-1"
                                >
                                    <Paperclip size={14}/> มีเอกสารแนบ (คลิกเพื่อดู)
                                </a>
                            )}
                            
                            <div className="flex gap-3 mt-4">
                                <button onClick={() => handleDirectorApprove(selectedRequest, false)} className="flex-1 py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-bold">ไม่อนุมัติ</button>
                                <button onClick={() => handleDirectorApprove(selectedRequest, true)} className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold shadow-md">อนุมัติ / ลงนาม</button>
                            </div>
                            <button onClick={() => setSelectedRequest(null)} className="w-full mt-3 text-sm text-slate-400 hover:text-slate-600">ปิดหน้าต่าง</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeaveSystem;
