import { 
    Users, UserPlus, Edit, Trash2, CheckSquare, Square, Save, X, Settings, 
    Link as LinkIcon, AlertCircle, MapPin, Target, Crosshair, Clock, 
    RefreshCw, UserCheck, ShieldCheck, ShieldAlert, LogOut, 
    Send, Globe, Copy, Check, Cloud, Building2, Loader, 
    CheckCircle, HardDrive, Smartphone, Zap, Eye, EyeOff,
    ChevronRight, Info, Search, LayoutGrid, FileText,
    ChevronLeft, ChevronsLeft, ChevronsRight, Shield, UserCog,
    FileCheck, BookOpen, Fingerprint, Key, Activity, BarChart3,
    Lock, Mail, Bell, ZapOff, ChevronDown, Image, GraduationCap,
    Calendar, Plus, FileSpreadsheet, ArrowUpRight, ArrowDownRight,
    Filter, Edit2, Download
} from 'lucide-react';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase, isConfigured as isSupabaseConfigured } from '../supabaseClient';
import { Teacher, TeacherRole, SystemConfig, School, Student, ClassRoom, AcademicYear } from '../types';
import { ACADEMIC_POSITIONS } from '../constants';
import * as XLSX from 'xlsx';

interface AdminUserManagementProps {
    teachers: Teacher[];
    onAddTeacher: (teacher: Teacher) => Promise<void>;
    onEditTeacher: (teacher: Teacher) => Promise<void>;
    onDeleteTeacher: (id: string) => void;
    currentSchool: School;
    onUpdateSchool: (school: School) => void;
}

const AVAILABLE_ROLES: { id: TeacherRole, label: string }[] = [
    { id: 'SYSTEM_ADMIN', label: 'ผู้ดูแลระบบ (Admin)' },
    { id: 'DIRECTOR', label: 'ผู้อำนวยการ (Director)' },
    { id: 'VICE_DIRECTOR', label: 'รองผู้อำนวยการ (Vice)' },
    { id: 'DOCUMENT_OFFICER', label: 'เจ้าหน้าที่ธุรการ' },
    { id: 'ACADEMIC_OFFICER', label: 'เจ้าหน้าที่งานวิชาการ' },
    { id: 'FINANCE_BUDGET', label: 'การเงิน (งบประมาณ)' },
    { id: 'FINANCE_NONBUDGET', label: 'การเงิน (นอกงบประมาณ)' },
    { id: 'FINANCE_COOP', label: 'การเงิน (สหกรณ์)' },
    { id: 'PLAN_OFFICER', label: 'เจ้าหน้าที่งานแผน' },
    { id: 'TEACHER', label: 'ครูผู้สอน' },
];

const AdminUserManagement: React.FC<AdminUserManagementProps> = ({ 
    teachers, 
    onAddTeacher, 
    onEditTeacher, 
    onDeleteTeacher, 
    currentSchool, 
    onUpdateSchool 
}) => {
    const [activeTab, setActiveTab] = useState<'USERS' | 'PENDING' | 'STUDENTS' | 'SCHOOL_SETTINGS' | 'SETTINGS' | 'CLOUD_SETUP'>('USERS');
    const [copied, setCopied] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<Teacher>>({});
    const [isAdding, setIsAdding] = useState(false);
    const [isSubmittingUser, setIsSubmittingUser] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    const [showPasswordInModal, setShowPasswordInModal] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 12;

    // Student Management State
    const [students, setStudents] = useState<Student[]>([]);
    const [classRooms, setClassRooms] = useState<ClassRoom[]>([]);
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
    const [isLoadingStudents, setIsLoadingStudents] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');
    const [selectedClass, setSelectedClass] = useState<string>('All');
    const [currentAcademicYear, setCurrentAcademicYear] = useState<string>('');
    
    const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
    const [isEditStudentOpen, setIsEditStudentOpen] = useState(false);
    const [isManageClassesOpen, setIsManageClassesOpen] = useState(false);
    const [isManageYearsOpen, setIsManageYearsOpen] = useState(false);
    const [isPromoteOpen, setIsPromoteOpen] = useState(false);
    const [isAlumniOpen, setIsAlumniOpen] = useState(false);

    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [newStudentName, setNewStudentName] = useState('');
    const [newStudentClass, setNewStudentClass] = useState('');
    const [newClassName, setNewClassName] = useState('');
    const [newYearName, setNewYearName] = useState('');
    const [promoteFromClass, setPromoteFromClass] = useState('');
    const [promoteToClass, setPromoteToClass] = useState('');
    const [graduationYear, setGraduationYear] = useState<string>((new Date().getFullYear() + 543).toString());
    const [batchNumber, setBatchNumber] = useState<string>('');

    const approvedTeachers = teachers.filter(t => 
        t.isApproved !== false && 
        (t.name.includes(userSearch) || t.id.includes(userSearch))
    );
    const pendingTeachers = teachers.filter(t => t.isApproved === false);

    const [config, setConfig] = useState<SystemConfig>({ 
        driveFolderId: '', 
        scriptUrl: '', 
        schoolName: '', 
        officerDepartment: '', 
        directorSignatureBase64: '', 
        directorSignatureScale: 1, 
        directorSignatureYOffset: 0, 
        schoolLogoBase64: '', 
        officialGarudaBase64: '', 
        telegramBotToken: '', 
        telegramBotUsername: '', 
        appBaseUrl: '' 
    });
    const [isLoadingConfig, setIsLoadingConfig] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);
    
    const [schoolForm, setSchoolForm] = useState<Partial<School>>({});
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [availableClasses, setAvailableClasses] = useState<string[]>([]);

    const gasCode = `/**
 * SchoolOS - Cloud Storage & Telegram Tracking Bridge v12.6
 */
var SUPABASE_URL = "วาง URL Supabase ที่นี่";
var SUPABASE_KEY = "วาง Anon Key ที่นี่";

function doGet(e) {
  var action = e.parameter.action;
  if (action === 'ack') {
    var docId = e.parameter.docId;
    var userId = e.parameter.userId;
    var targetFile = decodeURIComponent(e.parameter.target);
    var appBaseUrl = decodeURIComponent(e.parameter.appUrl || "");
    var finalAppLink = appBaseUrl + "?view=DOCUMENTS&id=" + docId + "&file=" + encodeURIComponent(targetFile);
    
    // UI หน้าจอสำหรับแจ้งเตือนการกดรับทราบเอกสาร
    var html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1'>" +
               "<title>SchoolOS Tracking</title></head><body style='font-family:sans-serif; text-align:center; padding:0; margin:0; background:#f8fafc; color:#1e293b; display:flex; align-items:center; justify-content:center; min-height:100vh;'>" +
               "<div style='background:white; padding:50px 20px; border-radius:40px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.1); max-width:450px; width:90%; border-top:12px solid #2563eb;'>" +
               "<div style='font-size:75px; margin-bottom:20px;'>📄</div>" +
               "<h2 style='color:#1e293b; margin-bottom:15px; font-weight:800; font-size:24px;'>มีหนังสือราชการถึงท่าน</h2>" +
               "<p style='color:#64748b; font-size:16px; line-height:1.6; margin-bottom:40px;'>กรุณากดปุ่มด้านล่างเพื่อเปิดอ่านเอกสาร <br>และบันทึกสถานะการรับทราบในระบบ SchoolOS</p>" +
               "<a href='" + finalAppLink + "' style='display:block; background:#2563eb; color:white; font-weight:bold; text-decoration:none; padding:20px; border-radius:20px; font-size:18px; box-shadow:0 10px 20px rgba(37,99,235,0.2);'>👉 กดเปิดดูเอกสารทันที</a>" +
               "</div></body></html>";
               
    return HtmlService.createHtmlOutput(html).setTitle("SchoolOS - Tracking");
  }
  return ContentService.createTextOutput("SchoolOS Cloud Bridge is Online").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.message) return handleTelegramWebhook(data.message);
    if (data.action === 'fetchRemote') return fetchRemoteFile(data.url);
    if (data.action === 'setup') return setTelegramWebhook();
    
    if (data.folderId && data.fileData) {
      var folder = DriveApp.getFolderById(data.folderId);
      var bytes = Utilities.base64Decode(data.fileData);
      var blob = Utilities.newBlob(bytes, data.mimeType, data.fileName);
      var file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return createJsonResponse({'status': 'success', 'url': file.getUrl(), 'id': file.getId(), 'viewUrl': "https://drive.google.com/file/d/" + file.getId() + "/view"});
    }
    return ContentService.createTextOutput("ok");
  } catch (f) {
    return ContentService.createTextOutput("error: " + f.toString());
  }
}

function fetchRemoteFile(url) {
  try {
    var response = UrlFetchApp.fetch(url);
    var blob = response.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    return createJsonResponse({ 'status': 'success', 'fileData': base64, 'mimeType': blob.getContentType() });
  } catch (e) {
    return createJsonResponse({ 'status': 'error', 'message': e.toString() });
  }
}

function handleTelegramWebhook(msg) {
  try {
    if (!msg || !msg.chat || !msg.chat.id) return ContentService.createTextOutput("ok");
    var chatId = msg.chat.id.toString();
    var text = msg.text || "";
    if (text.indexOf("/start") === 0) {
      var parts = text.split(" ");
      if (parts.length > 1) {
        var citizenId = parts[1].trim();
        var url = SUPABASE_URL + "/rest/v1/profiles?id=eq." + citizenId;
        UrlFetchApp.fetch(url, { 
          "method": "patch", 
          "headers": { 
            "apikey": SUPABASE_KEY, 
            "Authorization": "Bearer " + SUPABASE_KEY, 
            "Content-Type": "application/json" 
          }, 
          "payload": JSON.stringify({ "telegram_chat_id": chatId }) 
        });
        // การแจ้งเตือนถูกปิดตามคำขอของผู้ใช้เพื่อป้องกันการส่งข้อความซ้ำ
      }
    }
  } catch (e) {
    // Return OK anyway to stop Telegram from retrying
  }
  return ContentService.createTextOutput("ok");
}

function sendMessage(token, chatId, text) {
  var url = "https://api.telegram.org/bot" + token + "/sendMessage";
  UrlFetchApp.fetch(url, { "method": "post", "contentType": "application/json", "payload": JSON.stringify({ "chat_id": chatId, "text": text, "parse_mode": "HTML" }) });
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function setTelegramWebhook() {
  var botToken = "${config.telegramBotToken ? config.telegramBotToken.replace(/"/g, '\\"') : ''}";
  var scriptUrl = "${config.scriptUrl ? config.scriptUrl.replace(/"/g, '\\"') : ''}";
  if (!botToken || !scriptUrl) return createJsonResponse({'status': 'error', 'message': 'Missing Token or URL'});
  var url = "https://api.telegram.org/bot" + botToken + "/setWebhook?url=" + encodeURIComponent(scriptUrl);
  var resp = UrlFetchApp.fetch(url);
  return createJsonResponse({'status': 'success', 'result': JSON.parse(resp.getContentText())});
}
`;

    const handleCopyCode = () => {
        navigator.clipboard.writeText(gasCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        if (currentSchool) setSchoolForm(currentSchool);
    }, [currentSchool]);

    useEffect(() => {
        const fetchConfig = async () => {
             const client = supabase;
             if (isSupabaseConfigured && client) {
                 setIsLoadingConfig(true);
                 try {
                     const { data, error } = await client.from('school_configs').select('*').eq('school_id', currentSchool.id).maybeSingle();
                     if (data) {
                         setConfig({
                             driveFolderId: data.drive_folder_id || '',
                             scriptUrl: data.script_url || '',
                             telegramBotToken: data.telegram_bot_token || '',
                             telegramBotUsername: data.telegram_bot_username || '',
                             appBaseUrl: data.app_base_url || '',
                             officialGarudaBase64: data.official_garuda_base_64 || '',
                             directorSignatureBase64: data.director_signature_base_64 || '',
                             directorSignatureScale: data.director_signature_scale || 1.0,
                             directorSignatureYOffset: data.director_signature_y_offset || 0,
                             schoolName: currentSchool.name
                         });
                     } else {
                         // Reset config if no data found for this specific school
                         setConfig({ 
                            driveFolderId: '', 
                            scriptUrl: '', 
                            schoolName: currentSchool.name, 
                            officerDepartment: '', 
                            directorSignatureBase64: '', 
                            directorSignatureScale: 1, 
                            directorSignatureYOffset: 0, 
                            schoolLogoBase64: '', 
                            officialGarudaBase64: '', 
                            telegramBotToken: '', 
                            telegramBotUsername: '', 
                            appBaseUrl: '' 
                         });
                     }
                 } catch (err) {
                     console.error("Config fetch error:", err);
                 } finally {
                     setIsLoadingConfig(false);
                 }
             }
        };
        fetchConfig();
    }, [currentSchool.id]);

    useEffect(() => {
        const fetchClasses = async () => {
            if (!supabase) return;
            const { data, error } = await supabase
                .from('class_rooms')
                .select('name')
                .eq('school_id', currentSchool.id);
            if (data) {
                const uniqueClasses = Array.from(new Set(data.map(c => c.name))).sort();
                setAvailableClasses(uniqueClasses);
            }
        };
        fetchClasses();
    }, [currentSchool.id]);

    const fetchStudentData = async () => {
        if (!supabase) return;
        setIsLoadingStudents(true);
        try {
            // Fetch Years
            const { data: yearsData } = await supabase
                .from('academic_years')
                .select('*')
                .eq('school_id', currentSchool.id)
                .order('year', { ascending: false });
            
            if (yearsData) {
                const mappedYears = yearsData.map(y => ({
                    id: y.id,
                    schoolId: y.school_id,
                    year: y.year,
                    isCurrent: y.is_current
                }));
                setAcademicYears(mappedYears);
                const current = mappedYears.find(y => y.isCurrent);
                if (current) setCurrentAcademicYear(current.year);
            }

            // Fetch Classes
            const { data: classesData } = await supabase
                .from('class_rooms')
                .select('*')
                .eq('school_id', currentSchool.id);
            
            if (classesData) {
                setClassRooms(classesData.map(c => ({
                    id: c.id,
                    schoolId: c.school_id,
                    name: c.name,
                    academicYear: c.academic_year
                })));
            }

            // Fetch Students
            const { data: studentsData } = await supabase
                .from('students')
                .select('*')
                .eq('school_id', currentSchool.id)
                .eq('is_active', true);
            
            if (studentsData) {
                setStudents(studentsData.map(s => ({
                    id: s.id,
                    schoolId: s.school_id,
                    name: s.name,
                    currentClass: s.current_class,
                    academicYear: s.academic_year,
                    isActive: s.is_active,
                    isAlumni: s.is_alumni,
                    graduationYear: s.graduation_year,
                    batchNumber: s.batch_number
                })));
            }
        } catch (err) {
            console.error("Error fetching student data:", err);
        } finally {
            setIsLoadingStudents(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'STUDENTS') {
            fetchStudentData();
        }
    }, [activeTab, currentSchool.id]);

    const handleAddStudent = async () => {
        if (!newStudentName || !newStudentClass || !supabase) return;
        try {
            const { data, error } = await supabase
                .from('students')
                .insert([{
                    school_id: currentSchool.id,
                    name: newStudentName,
                    current_class: newStudentClass,
                    academic_year: currentAcademicYear,
                    is_active: true
                }])
                .select();
            if (error) throw error;
            if (data) {
                fetchStudentData();
                setIsAddStudentOpen(false);
                setNewStudentName('');
                setNewStudentClass('');
            }
        } catch (err) { console.error(err); }
    };

    const handleEditStudent = async () => {
        if (!selectedStudent || !supabase) return;
        try {
            const { error } = await supabase
                .from('students')
                .update({
                    name: selectedStudent.name,
                    current_class: selectedStudent.currentClass
                })
                .eq('id', selectedStudent.id);
            if (error) throw error;
            fetchStudentData();
            setIsEditStudentOpen(false);
            setSelectedStudent(null);
        } catch (err) { console.error(err); }
    };

    const handleDeleteStudent = async (id: string) => {
        if (!confirm('ยืนยันลบนักเรียน?') || !supabase) return;
        try {
            const { error } = await supabase.from('students').delete().eq('id', id);
            if (error) throw error;
            fetchStudentData();
        } catch (err) { console.error(err); }
    };

    const handlePromoteStudents = async () => {
        if (!promoteFromClass || !promoteToClass || !supabase) return;
        if (!confirm(`เลื่อนชั้นจาก ${promoteFromClass} ไป ${promoteToClass}?`)) return;
        try {
            const { error } = await supabase
                .from('students')
                .update({ current_class: promoteToClass })
                .eq('school_id', currentSchool.id)
                .eq('current_class', promoteFromClass)
                .eq('is_active', true);
            if (error) throw error;
            fetchStudentData();
            setIsPromoteOpen(false);
            alert('เลื่อนชั้นสำเร็จ');
        } catch (err) { console.error(err); }
    };

    const handleGraduateStudents = async () => {
        if (!selectedClass || selectedClass === 'All' || !graduationYear || !supabase) return;
        if (!confirm(`บันทึกนักเรียนชั้น ${selectedClass} เป็นศิษย์เก่า?`)) return;
        try {
            const { error } = await supabase
                .from('students')
                .update({
                    is_active: false,
                    is_alumni: true,
                    graduation_year: graduationYear,
                    batch_number: batchNumber
                })
                .eq('school_id', currentSchool.id)
                .eq('current_class', selectedClass)
                .eq('is_active', true);
            if (error) throw error;
            fetchStudentData();
            setIsAlumniOpen(false);
            alert('บันทึกศิษย์เก่าสำเร็จ');
        } catch (err) { console.error(err); }
    };

    const handleAddClass = async () => {
        if (!newClassName || !supabase) return;
        try {
            const { error } = await supabase.from('class_rooms').insert([{
                school_id: currentSchool.id,
                name: newClassName,
                academic_year: currentAcademicYear
            }]);
            if (error) throw error;
            fetchStudentData();
            setNewClassName('');
        } catch (err) { console.error(err); }
    };

    const handleDeleteClass = async (id: string) => {
        if (!confirm('ลบห้องเรียน?') || !supabase) return;
        try {
            const { error } = await supabase.from('class_rooms').delete().eq('id', id);
            if (error) throw error;
            fetchStudentData();
        } catch (err) { console.error(err); }
    };

    const handleAddYear = async () => {
        if (!newYearName || !supabase) return;
        try {
            const { error } = await supabase.from('academic_years').insert([{
                school_id: currentSchool.id,
                year: newYearName,
                is_current: academicYears.length === 0
            }]);
            if (error) throw error;
            fetchStudentData();
            setNewYearName('');
        } catch (err) { console.error(err); }
    };

    const handleSetCurrentYear = async (id: string) => {
        if (!supabase) return;
        try {
            await supabase.from('academic_years').update({ is_current: false }).eq('school_id', currentSchool.id);
            await supabase.from('academic_years').update({ is_current: true }).eq('id', id);
            fetchStudentData();
        } catch (err) { console.error(err); }
    };

    const downloadTemplate = () => {
        const templateData = [
            { 'ชื่อ-นามสกุล': 'เด็กชายตัวอย่าง ดีมาก', 'ชั้น': 'ป.1/1' },
            { 'ชื่อ-นามสกุล': 'เด็กหญิงใจดี เรียนเก่ง', 'ชั้น': 'ป.1/1' }
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");
        XLSX.writeFile(wb, "student_import_template.xlsx");
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !supabase) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const bstr = evt.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(ws) as any[];
            const toInsert = data.map(row => ({
                school_id: currentSchool.id,
                name: row.name || row['ชื่อ-นามสกุล'] || row['ชื่อ'],
                current_class: row.class || row['ชั้น'] || row['ห้อง'],
                academic_year: currentAcademicYear,
                is_active: true
            })).filter(s => s.name && s.current_class);
            if (toInsert.length > 0 && supabase) {
                const { error } = await supabase.from('students').insert(toInsert);
                if (!error) { fetchStudentData(); alert('นำเข้าสำเร็จ'); }
                else alert('ขัดข้อง: ' + error.message);
            }
        };
        reader.readAsBinaryString(file);
    };

    const filteredStudents = students.filter(s => 
        (selectedClass === 'All' || s.currentClass === selectedClass) &&
        (s.name.includes(studentSearch) || s.id.includes(studentSearch))
    );

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        setIsSavingConfig(true);
        try {
            const { error } = await client.from('school_configs').upsert({
                school_id: currentSchool.id,
                drive_folder_id: config.driveFolderId,
                script_url: config.scriptUrl,
                telegram_bot_token: config.telegramBotToken,
                telegram_bot_username: config.telegramBotUsername,
                app_base_url: config.appBaseUrl,
                official_garuda_base_64: config.officialGarudaBase64,
                director_signature_base_64: config.directorSignatureBase64,
                director_signature_scale: config.directorSignatureScale,
                director_signature_y_offset: config.directorSignatureYOffset
            });
            if (!error) alert("บันทึกการตั้งค่าสำเร็จ");
            else throw error;
        } catch(err: any) {
            alert("บันทึกล้มเหลว: " + err.message + "\n(กรุณาตรวจสอบว่าท่านได้รันคำสั่ง SQL เพิ่มคอลัมน์แล้วหรือยัง)");
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleSaveSchool = async (e: React.FormEvent) => {
        e.preventDefault();
        if (schoolForm.id) {
            onUpdateSchool(schoolForm as School);
            alert("บันทึกข้อมูลโรงเรียนสำเร็จ");
        }
    };

    const handleUserSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.id || !editForm.name) return;
        setIsSubmittingUser(true);
        const teacherData = { 
            ...editForm, 
            roles: editForm.roles || ['TEACHER'], 
            schoolId: currentSchool.id, 
            isApproved: true,
            assignedClasses: editForm.assignedClasses || []
        } as Teacher;
        try {
            if (isAdding) await onAddTeacher(teacherData);
            else await onEditTeacher(teacherData);
            
            // Update assigned_classes in Supabase profiles table
            if (supabase) {
                await supabase
                    .from('profiles')
                    .update({ assigned_classes: teacherData.assignedClasses })
                    .eq('id', teacherData.id);
            }

            setIsAdding(false); setEditingId(null); setEditForm({});
        } catch(err: any) {
            alert("บันทึกไม่สำเร็จ: " + err.message);
        } finally { 
            setIsSubmittingUser(false); 
        }
    };

    const handleApproveTeacher = async (teacher: Teacher) => {
        const client = supabase;
        if (!isSupabaseConfigured || !client) return;
        if (!confirm(`ยืนยันการอนุมัติคุณ "${teacher.name}" เข้าใช้งานระบบ?`)) return;
        
        setIsUpdatingStatus(teacher.id);
        try {
            const { error } = await client.from('profiles').update({ is_approved: true }).eq('id', teacher.id);
            if (!error) { 
                await onEditTeacher({ ...teacher, isApproved: true }); 
                alert("อนุมัติสำเร็จ"); 
            } else throw error;
        } catch (err: any) {
            alert("ขัดข้อง: " + err.message);
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    const toggleRole = (role: TeacherRole) => {
        const currentRoles = editForm.roles || [];
        setEditForm({ 
            ...editForm, 
            roles: currentRoles.includes(role) 
                ? currentRoles.filter(r => r !== role) 
                : [...currentRoles, role] 
        });
    };

    const getLocation = () => {
        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition((pos) => {
            setSchoolForm({ ...schoolForm, lat: pos.coords.latitude, lng: pos.coords.longitude });
            setIsGettingLocation(false);
        }, (err) => { 
            alert("ไม่สามารถดึง GPS ได้: " + err.message); 
            setIsGettingLocation(false); 
        });
    };

    const paginatedTeachers = approvedTeachers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="space-y-4 animate-fade-in pb-10 font-sarabun max-w-7xl mx-auto">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg transition-transform hover:scale-105">
                        <UserCog size={24}/>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 leading-none mb-1">School Administrator</h2>
                        <p className="text-slate-400 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                             <Building2 size={12} className="text-blue-500"/> {currentSchool.name}
                        </p>
                    </div>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full shadow-inner border border-slate-200 no-scrollbar">
                    <button onClick={() => { setActiveTab('USERS'); setCurrentPage(1); }} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'USERS' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>บุคลากร</button>
                    <button onClick={() => setActiveTab('PENDING')} className={`relative px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'PENDING' ? 'bg-white text-amber-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>
                        รออนุมัติ
                        {pendingTeachers.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold">{pendingTeachers.length}</span>}
                    </button>
                    <button onClick={() => setActiveTab('STUDENTS')} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'STUDENTS' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>จัดการนักเรียน</button>
                    <button onClick={() => setActiveTab('SCHOOL_SETTINGS')} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'SCHOOL_SETTINGS' ? 'bg-white text-orange-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>ข้อมูลโรงเรียน</button>
                    <button onClick={() => setActiveTab('SETTINGS')} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'SETTINGS' ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>การเชื่อมต่อ</button>
                    <button onClick={() => setActiveTab('CLOUD_SETUP')} className={`px-4 py-2 rounded-lg text-xs font-bold shrink-0 transition-all ${activeTab === 'CLOUD_SETUP' ? 'bg-white text-emerald-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:text-slate-800'}`}>Cloud Logic</button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 min-h-[500px]">
                {activeTab === 'USERS' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Users className="text-blue-600" size={20}/> บัญชีผู้ใช้งาน ({approvedTeachers.length})</h3>
                            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                                <div className="relative flex-1 md:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                    <input type="text" placeholder="ค้นหาชื่อ หรือ ID..." value={userSearch} onChange={e => setUserSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border rounded-xl outline-none focus:border-blue-500 font-bold text-sm shadow-inner"/>
                                </div>
                                <button onClick={() => { setEditForm({}); setIsAdding(true); }} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:bg-blue-700 transition-all text-sm"><UserPlus size={18}/> เพิ่มบุคลากร</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {approvedTeachers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE).map(t => (
                                <div key={t.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 group hover:bg-white hover:border-blue-200 transition-all shadow-sm relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-black text-lg shadow-inner">
                                                {t.name[0]}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-800 leading-none mb-1">{t.name}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.position}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                            <button onClick={() => { setEditForm(t); setEditingId(t.id); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><Edit size={16}/></button>
                                            <button onClick={() => { if(confirm('ยืนยันลบผู้ใช้งาน?')) onDeleteTeacher(t.id); }} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16}/></button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {t.roles.map(role => (
                                            <span key={role} className="px-2 py-0.5 bg-white border border-slate-100 text-slate-500 rounded-md text-[9px] font-bold uppercase tracking-tighter">
                                                {AVAILABLE_ROLES.find(r => r.id === role)?.label.split(' ')[0] || role}
                                            </span>
                                        ))}
                                    </div>
                                    {t.isSuspended && (
                                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[8px] font-black px-2 py-0.5 rounded-bl-lg uppercase tracking-widest">Suspended</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {approvedTeachers.length > ITEMS_PER_PAGE && (
                            <div className="flex justify-center gap-2 pt-6">
                                <button 
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                    className="p-2 rounded-xl border bg-white disabled:opacity-30 hover:bg-slate-50 transition-all"
                                >
                                    <ChevronLeft size={20}/>
                                </button>
                                <div className="flex items-center px-4 font-bold text-slate-500 text-sm">
                                    หน้า {currentPage} จาก {Math.ceil(approvedTeachers.length / ITEMS_PER_PAGE)}
                                </div>
                                <button 
                                    disabled={currentPage === Math.ceil(approvedTeachers.length / ITEMS_PER_PAGE)}
                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                    className="p-2 rounded-xl border bg-white disabled:opacity-30 hover:bg-slate-50 transition-all"
                                >
                                    <ChevronRight size={20}/>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'STUDENTS' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><GraduationCap className="text-indigo-600" size={20}/> ทะเบียนนักเรียน ({filteredStudents.length})</h3>
                            <div className="flex flex-wrap gap-2 w-full md:w-auto">
                                <div className="relative flex-1 md:w-48">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                    <input type="text" placeholder="ค้นหาชื่อ..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border rounded-xl outline-none focus:border-indigo-500 font-bold text-sm shadow-inner"/>
                                </div>
                                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="px-4 py-2 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:border-indigo-500 shadow-inner">
                                    <option value="All">ทุกชั้นเรียน</option>
                                    {classRooms.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                                <button onClick={() => setIsAddStudentOpen(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:bg-indigo-700 transition-all text-xs"><Plus size={16}/> เพิ่มนักเรียน</button>
                                <button onClick={() => setIsManageClassesOpen(true)} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all text-xs"><LayoutGrid size={16}/> จัดการห้องเรียน</button>
                                <button onClick={() => setIsManageYearsOpen(true)} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all text-xs"><Calendar size={16}/> ปีการศึกษา</button>
                                <button onClick={() => setIsPromoteOpen(true)} className="bg-amber-50 text-amber-700 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-100 transition-all text-xs border border-amber-100"><ArrowUpRight size={16}/> เลื่อนชั้น</button>
                                <button onClick={() => setIsAlumniOpen(true)} className="bg-rose-50 text-rose-700 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-rose-100 transition-all text-xs border border-rose-100"><GraduationCap size={16}/> บันทึกศิษย์เก่า</button>
                            </div>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-100">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b">
                                    <tr><th className="px-6 py-4">ชื่อ-นามสกุล</th><th className="px-6 py-4">ชั้นเรียน</th><th className="px-6 py-4">ปีการศึกษา</th><th className="px-6 py-4 text-right">ดำเนินการ</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {isLoadingStudents ? (
                                        <tr><td colSpan={4} className="px-6 py-10 text-center animate-pulse text-slate-400 font-bold">กำลังโหลดข้อมูล...</td></tr>
                                    ) : filteredStudents.length === 0 ? (
                                        <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-300 italic">ไม่พบข้อมูลนักเรียน</td></tr>
                                    ) : filteredStudents.map(s => (
                                        <tr key={s.id} className="hover:bg-slate-50/50 transition-all group">
                                            <td className="px-6 py-3 font-bold text-slate-800">{s.name}</td>
                                            <td className="px-6 py-3 font-bold text-slate-600">{s.currentClass}</td>
                                            <td className="px-6 py-3 text-slate-400">{s.academicYear}</td>
                                            <td className="px-6 py-3 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button onClick={() => { setSelectedStudent(s); setIsEditStudentOpen(true); }} className="p-1.5 text-blue-600 bg-white rounded-lg hover:bg-blue-600 hover:text-white border shadow-sm transition-all"><Edit2 size={14}/></button>
                                                    <button onClick={() => handleDeleteStudent(s.id)} className="p-1.5 text-red-400 bg-white rounded-lg hover:bg-red-600 hover:text-white border shadow-sm transition-all"><Trash2 size={14}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'PENDING' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex items-center gap-3 border-b pb-4"><Clock className="text-amber-500" size={24}/><div><h3 className="font-bold text-lg text-slate-800 leading-none mb-1">คำขออนุมัติบุคลากรใหม่</h3><p className="text-slate-400 text-xs font-bold">บุคลากรที่สมัครเข้าสังกัดโรงเรียนของคุณ</p></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {pendingTeachers.length === 0 ? <div className="md:col-span-2 py-20 text-center text-slate-300 font-bold italic">ไม่มีรายการค้างอนุมัติ</div> : pendingTeachers.map(t => (
                                <div key={t.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:border-blue-200 transition-all shadow-sm">
                                    <div><p className="font-bold text-slate-800 leading-none mb-1">{t.name}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{t.position}</p><p className="text-[9px] font-mono text-slate-300 mt-1">ID: {t.id}</p></div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleApproveTeacher(t)} disabled={isUpdatingStatus === t.id} className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black shadow-md hover:bg-emerald-700 transition-all flex items-center gap-2">
                                            {isUpdatingStatus === t.id ? <Loader className="animate-spin" size={14}/> : <UserCheck size={14}/>} อนุมัติสิทธิ์
                                        </button>
                                        <button onClick={() => { if(confirm('ยืนยันลบคำขอ?')) onDeleteTeacher(t.id); }} className="p-2 bg-white text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all"><X size={18}/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'SCHOOL_SETTINGS' && (
                    <form onSubmit={handleSaveSchool} className="space-y-8 max-w-4xl animate-fade-in py-4">
                        <div className="flex items-center gap-3 border-b pb-4"><div className="p-2 bg-orange-100 text-orange-600 rounded-lg"><Building2 size={24}/></div><h3 className="font-bold text-xl text-slate-800">ข้อมูลและพิกัดสถานศึกษา</h3></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อสถานศึกษา</label><input type="text" value={schoolForm.name || ''} onChange={e => setSchoolForm({...schoolForm, name: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl font-bold focus:ring-2 ring-orange-500/10 outline-none bg-slate-50 focus:bg-white shadow-inner transition-all"/></div>
                            <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">รหัสโรงเรียน 8 หลัก</label><input type="text" disabled value={schoolForm.id || ''} className="w-full px-4 py-2.5 bg-slate-100 text-slate-300 font-mono font-bold rounded-xl text-center shadow-inner cursor-not-allowed"/></div>
                        </div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6 shadow-sm">
                            <h4 className="font-bold text-slate-700 text-sm flex items-center gap-2"><MapPin size={18} className="text-orange-500"/> ตั้งค่าพิกัดปฏิบัติราชการ (GPS)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">Latitude</label><input type="number" step="any" value={schoolForm.lat || ''} onChange={e => setSchoolForm({...schoolForm, lat: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-sm outline-none focus:ring-2 ring-orange-500/10"/></div>
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">Longitude</label><input type="number" step="any" value={schoolForm.lng || ''} onChange={e => setSchoolForm({...schoolForm, lng: parseFloat(e.target.value)})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-sm outline-none focus:ring-2 ring-orange-500/10"/></div>
                                <div className="flex items-end"><button type="button" onClick={getLocation} disabled={isGettingLocation} className="w-full py-2 bg-white border-2 border-orange-200 text-orange-600 rounded-lg text-[10px] font-black uppercase hover:bg-orange-50 transition-all flex items-center justify-center gap-2">{isGettingLocation ? <RefreshCw className="animate-spin" size={14}/> : <Crosshair size={14}/>} ดึงพิกัดปัจจุบัน</button></div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">รัศมีที่อนุญาต (เมตร)</label><input type="number" value={schoolForm.radius || 500} onChange={e => setSchoolForm({...schoolForm, radius: parseInt(e.target.value)})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-lg outline-none focus:ring-2 ring-orange-500/10"/></div>
                                <div className="space-y-1"><label className="block text-[10px] font-bold text-slate-400 ml-1">เวลาเริ่มเข้าสาย</label><input type="time" value={schoolForm.lateTimeThreshold || '08:30'} onChange={e => setSchoolForm({...schoolForm, lateTimeThreshold: e.target.value})} className="w-full px-4 py-2 border rounded-lg font-bold bg-white text-lg outline-none focus:ring-2 ring-orange-500/10"/></div>
                            </div>
                        </div>
                        <div className="flex justify-end pt-4"><button type="submit" className="bg-slate-900 text-white px-10 py-3 rounded-xl font-bold shadow-lg hover:bg-black transition-all flex items-center gap-2 text-sm active:scale-95"><Save size={20}/> บันทึกการตั้งค่าทั้งหมด</button></div>
                    </form>
                )}

                {activeTab === 'SETTINGS' && (
                    <div className="animate-fade-in space-y-10 max-w-5xl py-4 mx-auto">
                        <div className="bg-indigo-950 p-8 rounded-2xl border-2 border-indigo-700 flex flex-col md:flex-row gap-6 shadow-lg relative overflow-hidden group">
                            <div className="p-6 bg-white/10 rounded-2xl border border-white/20 text-white backdrop-blur-xl self-start shrink-0"><ShieldAlert size={40}/></div>
                            <div className="flex-1"><h4 className="font-bold text-white text-xl mb-2">Cloud Connectivity (รายโรงเรียน)</h4><p className="text-xs font-bold text-indigo-200 leading-relaxed uppercase tracking-widest opacity-80 mb-6">ผู้ดูแลระบบถือครอง Token และ API Key ประจำหน่วยงานเอง เพื่อความมั่นคงของข้อมูลสูงสุด</p></div>
                        </div>
                        {isLoadingConfig ? <div className="p-40 text-center flex flex-col items-center gap-6 animate-pulse"><Loader className="animate-spin text-indigo-600" size={48}/><p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Synchronizing Connection...</p></div> : (
                            <form onSubmit={handleSaveConfig} className="space-y-10">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    <div className="space-y-6"><h5 className="font-black text-slate-800 flex items-center gap-3 uppercase text-[10px] tracking-widest ml-4"><Cloud className="text-blue-500" size={20}/> Google Drive Proxy</h5>
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-6 shadow-sm">
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Root Folder ID</label><input type="text" value={config.driveFolderId} onChange={e => setConfig({...config, driveFolderId: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-blue-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="1ABCdeFgHiJkLmNoP..."/></div>
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">GAS Web App URL</label><input type="text" value={config.scriptUrl} onChange={e => setConfig({...config, scriptUrl: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-blue-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="https://script.google.com/macros/s/..."/></div>
                                        </div>
                                    </div>
                                    <div className="space-y-6"><h5 className="font-black text-slate-800 flex items-center gap-3 uppercase text-[10px] tracking-widest ml-4"><Smartphone className="text-indigo-500" size={20}/> Telegram Gateway</h5>
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-6 shadow-sm">
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bot API Token</label><input type="password" value={config.telegramBotToken || ''} onChange={e => setConfig({...config, telegramBotToken: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-indigo-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="123456789:ABCDefgh..."/></div>
                                            <div className="space-y-1"><label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Bot Username</label><input type="text" value={config.telegramBotUsername || ''} onChange={e => setConfig({...config, telegramBotUsername: e.target.value})} className="w-full px-4 py-2 border border-slate-100 focus:border-indigo-500 rounded-lg font-mono text-xs bg-slate-50 outline-none shadow-inner" placeholder="@SchoolOS_Bot"/></div>
                                            <button 
                                                type="button"
                                                onClick={async () => {
                                                    if (!config.scriptUrl || !config.telegramBotToken) {
                                                        alert("กรุณาระบุ GAS Web App URL และ Bot Token ก่อน");
                                                        return;
                                                    }
                                                    try {
                                                        const resp = await fetch(config.scriptUrl, {
                                                            method: 'POST',
                                                            body: JSON.stringify({ action: 'setup' }),
                                                            headers: { 'Content-Type': 'text/plain;charset=utf-8' }
                                                        });
                                                        const res = await resp.json();
                                                        if (res.status === 'success') {
                                                            alert("เชื่อมต่อ Webhook สำเร็จ! บอทพร้อมใช้งานแล้ว");
                                                        } else {
                                                            alert("เชื่อมต่อล้มเหลว: " + res.message);
                                                        }
                                                    } catch (e: any) {
                                                        alert("ขัดข้อง: " + e.message);
                                                    }
                                                }}
                                                className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 border border-indigo-100"
                                            >
                                                <RefreshCw size={14}/> เชื่อมต่อ Webhook (Set Webhook)
                                            </button>
                                        </div>
                                    </div>
                                    <div className="lg:col-span-2">
                                        <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-6 shadow-sm">
                                            <h5 className="font-black text-slate-800 flex items-center gap-3 uppercase text-[10px] tracking-widest">
                                                <Image size={20} className="text-orange-500"/> ตราครุฑ / ตราโรงเรียน (สำหรับหัวจดหมาย)
                                            </h5>
                                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                                <div className="w-24 h-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                                                    {config.officialGarudaBase64 ? (
                                                        <img src={config.officialGarudaBase64} className="w-full h-full object-contain" alt="Garuda" />
                                                    ) : (
                                                        <span className="text-[10px] text-slate-300 font-bold">ไม่มีรูป</span>
                                                    )}
                                                </div>
                                                <div className="flex-1 space-y-3">
                                                    <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
                                                        แนะนำรูปภาพประเภท PNG พื้นหลังโปร่งใส ขนาดประมาณ 300x300 พิกเซล <br/>
                                                        รูปนี้จะใช้เป็นตราครุฑใน "บันทึกข้อความ" และเอกสารราชการต่างๆ
                                                    </p>
                                                    <input 
                                                        type="file" 
                                                        accept="image/*"
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (event) => {
                                                                    const base64 = event.target?.result as string;
                                                                    setConfig({ ...config, officialGarudaBase64: base64 });
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        }}
                                                        className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 transition-all"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="lg:col-span-2"><div className="bg-slate-900 p-8 rounded-2xl border-2 border-slate-800 shadow-md relative overflow-hidden group"><h5 className="font-black text-white flex items-center gap-4 uppercase text-[10px] tracking-widest mb-6"><Zap className="text-yellow-400" size={24}/> Application URL</h5><div className="space-y-4"><input type="text" placeholder="https://your-app.vercel.app" value={config.appBaseUrl || ''} onChange={e => setConfig({...config, appBaseUrl: e.target.value})} className="w-full px-6 py-3 bg-white/5 border border-white/10 focus:border-yellow-400 rounded-xl font-mono text-base text-yellow-100 outline-none transition-all shadow-inner"/><div className="flex gap-4 items-center text-slate-500 px-6 py-2 bg-white/5 rounded-xl border border-white/10 w-fit backdrop-blur-md"><Info size={16} className="text-yellow-400 shrink-0"/><p className="text-[10px] font-bold uppercase tracking-widest">* URL หลักของแอปที่ท่านติดตั้ง เพื่อส่งลิงก์ใน Telegram</p></div></div></div></div>
                                </div>
                                <button type="submit" disabled={isSavingConfig} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-base shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 active:scale-95 uppercase tracking-widest border-b-4 border-indigo-950">{isSavingConfig ? <Loader className="animate-spin" size={24}/> : <Save size={24}/>} บันทึกการเชื่อมต่อ Cloud SQL</button>
                            </form>
                        )}
                    </div>
                )}

                {activeTab === 'CLOUD_SETUP' && (
                    <div className="space-y-10 animate-fade-in max-w-6xl mx-auto py-4 pb-10">
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-white rounded-[2rem] p-8 md:p-12 shadow-sm relative overflow-hidden">
                            <div className="relative z-10"><div className="flex items-center gap-6 mb-10"><div className="p-6 bg-emerald-600 text-white rounded-2xl shadow-lg"><Cloud size={36}/></div><div><h3 className="text-2xl font-black text-emerald-900 tracking-tight leading-none mb-1">Direct Tracking Bridge v12.6</h3><p className="text-emerald-600 font-bold text-[10px] uppercase tracking-widest mt-1">Direct Access Protocol for Documents</p></div></div>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                                    <div className="space-y-8"><div className="p-6 bg-white rounded-xl border-l-8 border-blue-600 shadow-sm"><p className="text-slate-700 text-base leading-relaxed font-bold">เพื่อให้บุคลากรสามารถ <b>"พรีวิวไฟล์และรับทราบได้ทันทีผ่าน Telegram"</b> ต้องนำโค้ดด้านข้างไปติดตั้งใน Google Apps Script ครับ</p></div>
                                        <div className="space-y-6"><h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-3"><ChevronRight className="text-emerald-500" size={24}/> Workflow การติดตั้งใช้งาน</h4>
                                            <ol className="space-y-4 text-sm text-slate-600 pl-6 list-decimal font-bold">
                                                <li className="pl-2">เปิด <a href="https://script.google.com" target="_blank" className="text-blue-600 underline font-black hover:text-blue-800 transition-all">Google Apps Script Console</a></li>
                                                <li className="pl-2">ลบโค้ดเดิมใน <code className="bg-slate-100 px-2 font-mono">Code.gs</code> ออกแล้ววางโค้ดที่คัดลอกไปลงแทน</li>
                                                <li className="pl-2">ระบุ <code className="bg-slate-200 px-2 py-0.5 rounded text-blue-800">SUPABASE_URL</code> และ <code className="bg-slate-200 px-2 py-0.5 rounded text-blue-800">SUPABASE_KEY</code></li>
                                                <li className="pl-2">กดปุ่ม <b>Deploy &gt; New Deployment</b> เลือกประเภท <b>Web App</b></li>
                                                <li className="pl-2">ตั้งค่า Execute as: <b>Me</b> และ Who has access: <b>Anyone</b></li>
                                                <li className="pl-2">คัดลอก URL ของ Web App ที่ได้มาใส่ในเมนู <b>"การเชื่อมต่อ"</b></li>
                                            </ol>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center px-4"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bridge Logic Source Code</span><button onClick={handleCopyCode} className={`text-[10px] flex items-center gap-2 font-black px-4 py-1.5 rounded-lg border-2 transition-all ${copied ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white'}`}>{copied ? <><Check size={14}/> COPIED</> : <><Copy size={14}/> COPY CODE</>}</button></div>
                                        <div className="bg-slate-900 rounded-2xl p-6 overflow-hidden shadow-inner relative border border-slate-800"><pre className="text-[10px] text-emerald-400 font-mono overflow-auto max-h-[400px] custom-scrollbar leading-relaxed no-scrollbar">{gasCode}</pre></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals for Student Management */}
            {isAddStudentOpen && (
                <div className="fixed inset-0 bg-slate-950/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><Plus className="text-indigo-600"/> เพิ่มนักเรียนใหม่</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">ชื่อ-นามสกุล</label>
                                <input type="text" value={newStudentName} onChange={e => setNewStudentName(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-inner"/>
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">ชั้นเรียน</label>
                                <select value={newStudentClass} onChange={e => setNewStudentClass(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-inner">
                                    <option value="">-- เลือกชั้นเรียน --</option>
                                    {classRooms.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="pt-4 border-t border-slate-50">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">หรือนำเข้าจาก Excel</label>
                                <div className="flex flex-col gap-2 mt-2">
                                    <button onClick={downloadTemplate} className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 p-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-emerald-100 transition-all">
                                        <Download size={16}/> ดาวน์โหลดเทมเพลต Excel
                                    </button>
                                    <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 p-3 rounded-xl font-bold text-center text-xs flex items-center justify-center gap-2 transition-all">
                                        <FileSpreadsheet size={16}/> เลือกไฟล์ Excel เพื่อนำเข้า
                                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel}/>
                                    </label>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-6">
                                <button onClick={() => setIsAddStudentOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px]">ยกเลิก</button>
                                <button onClick={handleAddStudent} className="flex-[2] py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-all">บันทึกข้อมูล</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isEditStudentOpen && selectedStudent && (
                <div className="fixed inset-0 bg-slate-950/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><Edit2 className="text-blue-600"/> แก้ไขข้อมูลนักเรียน</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">ชื่อ-นามสกุล</label>
                                <input type="text" value={selectedStudent.name} onChange={e => setSelectedStudent({...selectedStudent, name: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-blue-500 shadow-inner"/>
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">ชั้นเรียน</label>
                                <select value={selectedStudent.currentClass} onChange={e => setSelectedStudent({...selectedStudent, currentClass: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-blue-500 shadow-inner">
                                    {classRooms.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-3 pt-6">
                                <button onClick={() => setIsEditStudentOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px]">ยกเลิก</button>
                                <button onClick={handleEditStudent} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black shadow-lg hover:bg-blue-700 transition-all">บันทึกการแก้ไข</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isManageClassesOpen && (
                <div className="fixed inset-0 bg-slate-950/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><LayoutGrid className="text-indigo-600"/> จัดการห้องเรียน</h3>
                            <button onClick={() => setIsManageClassesOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-300"><X size={20}/></button>
                        </div>
                        <div className="space-y-6">
                            <div className="flex gap-2">
                                <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="ชื่อห้อง เช่น ป.1/1" className="flex-1 p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-inner"/>
                                <button onClick={handleAddClass} className="bg-indigo-600 text-white px-4 rounded-xl font-bold hover:bg-indigo-700 transition-all"><Plus size={20}/></button>
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {classRooms.length === 0 ? <p className="text-center text-slate-300 italic py-4">ยังไม่มีข้อมูลห้องเรียน</p> : classRooms.map(c => (
                                    <div key={c.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <span className="font-bold text-slate-700">{c.name}</span>
                                        <button onClick={() => handleDeleteClass(c.id)} className="text-red-400 hover:text-red-600 transition-all"><Trash2 size={16}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isManageYearsOpen && (
                <div className="fixed inset-0 bg-slate-950/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><Calendar className="text-indigo-600"/> จัดการปีการศึกษา</h3>
                            <button onClick={() => setIsManageYearsOpen(false)} className="p-2 hover:bg-slate-50 rounded-full text-slate-300"><X size={20}/></button>
                        </div>
                        <div className="space-y-6">
                            <div className="flex gap-2">
                                <input type="text" value={newYearName} onChange={e => setNewYearName(e.target.value)} placeholder="ปีการศึกษา เช่น 2567" className="flex-1 p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-indigo-500 shadow-inner"/>
                                <button onClick={handleAddYear} className="bg-indigo-600 text-white px-4 rounded-xl font-bold hover:bg-indigo-700 transition-all"><Plus size={20}/></button>
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {academicYears.map(y => (
                                    <div key={y.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <span className="font-bold text-slate-700">{y.year}</span>
                                            {y.isCurrent && <span className="bg-emerald-100 text-emerald-600 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">ปัจจุบัน</span>}
                                        </div>
                                        <div className="flex gap-2">
                                            {!y.isCurrent && <button onClick={() => handleSetCurrentYear(y.id)} className="text-xs font-bold text-indigo-600 hover:underline">ตั้งเป็นปัจจุบัน</button>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isPromoteOpen && (
                <div className="fixed inset-0 bg-slate-950/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><ArrowUpRight className="text-amber-600"/> เลื่อนระดับชั้นนักเรียน</h3>
                        <div className="space-y-6">
                            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-6">
                                <p className="text-xs text-amber-700 font-bold leading-relaxed">ระบบจะเปลี่ยนชั้นเรียนของนักเรียนทุกคนในชั้นต้นทาง ไปยังชั้นปลายทางที่เลือก</p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">จากชั้นเรียน</label>
                                    <select value={promoteFromClass} onChange={e => setPromoteFromClass(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-amber-500 shadow-inner">
                                        <option value="">-- เลือกชั้นต้นทาง --</option>
                                        {classRooms.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="flex justify-center py-2 text-slate-300"><ChevronDown size={24}/></div>
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">ไปยังชั้นเรียน</label>
                                    <select value={promoteToClass} onChange={e => setPromoteToClass(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-amber-500 shadow-inner">
                                        <option value="">-- เลือกชั้นปลายทาง --</option>
                                        {classRooms.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-6">
                                <button onClick={() => setIsPromoteOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px]">ยกเลิก</button>
                                <button onClick={handlePromoteStudents} className="flex-[2] py-3 bg-amber-600 text-white rounded-xl font-black shadow-lg hover:bg-amber-700 transition-all">ยืนยันการเลื่อนชั้น</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isAlumniOpen && (
                <div className="fixed inset-0 bg-slate-950/80 z-[80] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2"><GraduationCap className="text-rose-600"/> บันทึกศิษย์เก่า</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">เลือกชั้นเรียนที่จบ</label>
                                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-rose-500 shadow-inner">
                                    <option value="All">-- เลือกชั้นเรียน --</option>
                                    {classRooms.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">ปีที่จบ (พ.ศ.)</label>
                                    <input type="text" value={graduationYear} onChange={e => setGraduationYear(e.target.value)} className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-rose-500 shadow-inner"/>
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2">รุ่นที่จบ</label>
                                    <input type="text" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="เช่น รุ่นที่ 50" className="w-full p-3 bg-slate-50 border rounded-xl font-bold outline-none focus:border-rose-500 shadow-inner"/>
                                </div>
                            </div>
                            <div className="flex gap-3 pt-6">
                                <button onClick={() => setIsAlumniOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px]">ยกเลิก</button>
                                <button onClick={handleGraduateStudents} className="flex-[2] py-3 bg-rose-600 text-white rounded-xl font-black shadow-lg hover:bg-rose-700 transition-all">บันทึกศิษย์เก่า</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {(isAdding || editingId) && (
                <div className="fixed inset-0 bg-slate-950/90 z-[70] flex items-center justify-center p-4 backdrop-blur-md animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-8 animate-scale-up border-2 border-blue-50 overflow-y-auto max-h-[90vh] no-scrollbar relative">
                        <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="absolute top-6 right-6 p-2 hover:bg-slate-50 rounded-full text-slate-300 transition-all active:scale-90"><X size={24}/></button>
                        <div className="mb-10 text-center"><div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4 shadow-inner ring-2 ring-white"><UserCog size={32}/></div><h3 className="text-xl font-black text-slate-800 tracking-tight">{isAdding ? 'ลงทะเบียนบุคลากร' : 'ปรับปรุงข้อมูลบุคลากร'}</h3><p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">Staff Registry Control</p></div>
                        <form onSubmit={handleUserSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ID (เลขบัตรประชาชน)</label><input type="text" required maxLength={13} disabled={!isAdding} value={editForm.id || ''} onChange={e => setEditForm({...editForm, id: e.target.value})} className={`w-full px-4 py-2 border rounded-xl font-bold outline-none transition-all shadow-sm ${!isAdding ? 'bg-slate-100 text-slate-300' : 'bg-slate-50 focus:border-blue-500'}`}/></div>
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ชื่อ - นามสกุล</label><input type="text" required value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold outline-none focus:border-blue-500 transition-all shadow-inner"/></div>
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ตำแหน่ง</label><div className="relative"><select value={editForm.position || ''} onChange={e => setEditForm({...editForm, position: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold appearance-none outline-none focus:border-blue-500 transition-all shadow-inner">{ACADEMIC_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}</select><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" size={16}/></div></div>
                                <div className="space-y-1.5"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">รหัสผ่าน</label><div className="relative group"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18}/><input type={showPasswordInModal ? "text" : "password"} value={editForm.password || ''} onChange={e => setEditForm({...editForm, password: e.target.value})} className="w-full pl-10 pr-10 py-2 bg-slate-50 border rounded-xl font-mono font-bold text-blue-600 outline-none focus:border-blue-500 transition-all shadow-inner text-lg"/><button type="button" onClick={() => setShowPasswordInModal(!showPasswordInModal)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-blue-500 transition-colors">{showPasswordInModal ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></div>
                            </div>
                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase ml-1">การมอบหมายพิเศษ</label>
                                <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 shadow-inner">
                                    <div 
                                        onClick={() => setEditForm({ ...editForm, isActingDirector: !editForm.isActingDirector })}
                                        className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all border group ${editForm.isActingDirector ? 'border-orange-500 bg-white shadow-md' : 'border-transparent opacity-60 hover:opacity-100 hover:bg-white/80'}`}
                                    >
                                        <div className={`transition-all ${editForm.isActingDirector ? 'text-orange-600' : 'text-slate-300'}`}>
                                            {editForm.isActingDirector ? <CheckSquare size={20}/> : <Square size={20}/>}
                                        </div>
                                        <div>
                                            <span className={`text-[11px] font-black block transition-colors ${editForm.isActingDirector ? 'text-orange-900' : 'text-slate-500'}`}>รักษาการในตำแหน่งผู้อำนวยการโรงเรียน</span>
                                            <p className="text-[9px] text-orange-600/70 font-bold mt-0.5">* สามารถมองเห็นและเกษียณหนังสือแทน ผอ. ได้</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="block text-[10px] font-black text-slate-400 uppercase ml-1">ห้องเรียนที่รับผิดชอบ (ครูประจำชั้น)</label>
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-inner">
                                    {availableClasses.length === 0 ? (
                                        <p className="text-[10px] text-slate-400 font-bold italic">ยังไม่มีข้อมูลห้องเรียนในระบบ (กรุณาเพิ่มในแท็บจัดการนักเรียน)</p>
                                    ) : (
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {availableClasses.map(className => {
                                                const isAssigned = editForm.assignedClasses?.includes(className);
                                                return (
                                                    <div 
                                                        key={className}
                                                        onClick={() => {
                                                            const current = editForm.assignedClasses || [];
                                                            setEditForm({
                                                                ...editForm,
                                                                assignedClasses: isAssigned 
                                                                    ? current.filter(c => c !== className)
                                                                    : [...current, className]
                                                            });
                                                        }}
                                                        className={`flex items-center gap-2 cursor-pointer p-2 rounded-lg transition-all border ${isAssigned ? 'border-blue-500 bg-white shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                                    >
                                                        <div className={isAssigned ? 'text-blue-600' : 'text-slate-300'}>
                                                            {isAssigned ? <CheckSquare size={16}/> : <Square size={16}/>}
                                                        </div>
                                                        <span className={`text-[10px] font-bold ${isAssigned ? 'text-blue-900' : 'text-slate-500'}`}>{className}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4"><label className="block text-[10px] font-black text-slate-400 uppercase ml-1">สิทธิ์และบทบาท</label>
<div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">{AVAILABLE_ROLES.map(role => { const isChecked = editForm.roles?.includes(role.id); return (<div key={role.id} onClick={() => toggleRole(role.id)} className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl transition-all border group ${isChecked ? 'border-blue-500 bg-white shadow-md' : 'border-transparent opacity-60 hover:opacity-100 hover:bg-white/80'}`}><div className={`transition-all ${isChecked ? 'text-blue-600' : 'text-slate-300'}`}>{isChecked ? <CheckSquare size={20}/> : <Square size={20}/>}</div><span className={`text-[11px] font-black transition-colors ${isChecked ? 'text-blue-900' : 'text-slate-500'}`}>{role.label}</span></div>); })}</div></div>
                            <div className="pt-6 flex gap-4"><button type="button" onClick={() => { setIsAdding(false); setEditingId(null); }} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black uppercase text-[10px] hover:bg-slate-200 transition-all">ยกเลิก</button><button type="submit" disabled={isSubmittingUser} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black text-base shadow-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-3 border-b-4 border-blue-950 uppercase text-xs">{isSubmittingUser ? <Loader className="animate-spin" size={20}/> : <Save size={20}/>} ยืนยันบันทึกข้อมูล SQL</button></div>
                        </form>
                    </div>
                </div>
            )}
            
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; } 
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; } 
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 20px; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                @keyframes scale-up { from { transform: scale(0.97); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                .animate-scale-up { animation: scale-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};

export default AdminUserManagement;
