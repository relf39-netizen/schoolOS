
import React, { useState, useEffect } from 'react';
import { Teacher, DirectorEvent, SystemConfig } from '../types';
import { MOCK_DIRECTOR_EVENTS } from '../constants';
import { Calendar, Clock, MapPin, Plus, Trash2, Bell, ServerOff, ListFilter, History, CheckCircle } from 'lucide-react';
import { db, isConfigured } from '../firebaseConfig';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { sendTelegramMessage } from '../utils/telegram';

interface DirectorCalendarProps {
    currentUser: Teacher;
    allTeachers: Teacher[];
}

const DirectorCalendar: React.FC<DirectorCalendarProps> = ({ currentUser, allTeachers }) => {
    // State
    const [events, setEvents] = useState<DirectorEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sysConfig, setSysConfig] = useState<SystemConfig | null>(null);
    
    // Tab State: 'UPCOMING' = งานที่ต้องปฏิบัติ, 'PAST' = ปฏิบัติเรียบร้อย
    const [activeTab, setActiveTab] = useState<'UPCOMING' | 'PAST'>('UPCOMING');

    // Form State
    const [showForm, setShowForm] = useState(false);
    const [newEvent, setNewEvent] = useState<Partial<DirectorEvent>>({
        date: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        title: '',
        location: '',
        description: ''
    });

    // Permissions
    const isDocOfficer = currentUser.roles.includes('DOCUMENT_OFFICER');
    const isDirector = currentUser.roles.includes('DIRECTOR');
    const isAdmin = currentUser.roles.includes('SYSTEM_ADMIN');
    const canEdit = isDocOfficer || isDirector || isAdmin;

    // --- Helpers: Thai Date Formatting ---
    
    const getThaiFullDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
        const months = [
            "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
            "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
        ];
        return `วัน${days[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
    };

    const getThaiMonthShort = (dateStr: string) => {
        const d = new Date(dateStr);
        const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        return months[d.getMonth()];
    };

    const getThaiDayShort = (dateStr: string) => {
        const d = new Date(dateStr);
        const days = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
        return days[d.getDay()];
    };

    // --- Data & Config Loading ---
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const local = localStorage.getItem('schoolos_system_config');
                if (local) setSysConfig(JSON.parse(local));
            } catch(e) {}

            if (isConfigured && db) {
                try {
                    const docRef = doc(db, "system_config", "settings");
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) setSysConfig(docSnap.data() as SystemConfig);
                } catch (e) { console.error(e); }
            }
        };
        fetchConfig();

        if (isConfigured && db) {
            const q = query(collection(db, "director_events"), where("schoolId", "==", currentUser.schoolId));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DirectorEvent));
                setEvents(fetchedEvents);
                setIsLoading(false);
            });
            return () => unsubscribe();
        } else {
            setEvents(MOCK_DIRECTOR_EVENTS);
            setIsLoading(false);
        }
    }, [currentUser.schoolId]);

    // --- Filter Logic ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter Upcoming (Today and Future)
    const upcomingEvents = events.filter(event => {
        const evtDate = new Date(event.date);
        evtDate.setHours(0, 0, 0, 0);
        return evtDate >= today;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Ascending

    // Filter Past (Before Today)
    const pastEvents = events.filter(event => {
        const evtDate = new Date(event.date);
        evtDate.setHours(0, 0, 0, 0);
        return evtDate < today;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Descending (Newest past first)

    const displayedEvents = activeTab === 'UPCOMING' ? upcomingEvents : pastEvents;

    // --- Handlers ---

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newEvent.title || !newEvent.date || !newEvent.startTime) return;

        const eventData: any = {
            ...newEvent,
            schoolId: currentUser.schoolId,
            createdBy: currentUser.id,
            notifiedOneDayBefore: false,
            notifiedOnDay: false
        };

        if (isConfigured && db) {
            try {
                await addDoc(collection(db, "director_events"), eventData);
                notifyDirector(eventData, 'NEW');
            } catch (e) {
                alert('เกิดข้อผิดพลาดในการบันทึก');
            }
        } else {
            setEvents([...events, { ...eventData, id: `evt_${Date.now()}` } as DirectorEvent]);
            alert('บันทึกเรียบร้อย (Offline)');
        }

        setShowForm(false);
        setNewEvent({ date: new Date().toISOString().split('T')[0], startTime: '09:00', title: '', location: '', description: '' });
    };

    const handleDeleteEvent = async (id: string) => {
        if (!confirm("ยืนยันลบรายการนี้?")) return;
        if (isConfigured && db) {
            await deleteDoc(doc(db, "director_events", id));
        } else {
            setEvents(events.filter(e => e.id !== id));
        }
    };

    // --- Notifications Logic ---
    const notifyDirector = async (event: any, type: 'NEW' | 'TOMORROW' | 'TODAY') => {
        let currentBotToken = sysConfig?.telegramBotToken;
        let currentBaseUrl = sysConfig?.appBaseUrl;

        try {
            const local = localStorage.getItem('schoolos_system_config');
            if (local) {
                const parsed = JSON.parse(local);
                if (parsed.telegramBotToken) currentBotToken = parsed.telegramBotToken;
                if (parsed.appBaseUrl) currentBaseUrl = parsed.appBaseUrl;
            }
        } catch(e) {}

        if (isConfigured && db) {
            try {
                const configDoc = await getDoc(doc(db, "system_config", "settings"));
                if (configDoc.exists()) {
                    const freshConfig = configDoc.data() as SystemConfig;
                    currentBotToken = freshConfig.telegramBotToken;
                    currentBaseUrl = freshConfig.appBaseUrl;
                }
            } catch (e) { console.error(e); }
        }

        if (!currentBotToken) return;
        
        const directors = allTeachers.filter(t => t.roles.includes('DIRECTOR'));
        if (directors.length === 0) return;

        let title = "";
        let icon = "";
        const thaiDateStr = getThaiFullDate(event.date);

        switch (type) {
            case 'NEW': title = "เพิ่มนัดหมายใหม่"; icon = "🆕"; break;
            case 'TOMORROW': title = "แจ้งเตือนภารกิจวันพรุ่งนี้"; icon = "⏰"; break;
            case 'TODAY': title = "แจ้งเตือนภารกิจวันนี้"; icon = "🔔"; break;
        }

        const message = `${icon} <b>${title}</b>\n` +
                        `เรื่อง: ${event.title}\n` +
                        `วันที่: ${thaiDateStr}\n` +
                        `เวลา: ${event.startTime}${event.endTime ? ' - ' + event.endTime : ''} น.\n` +
                        `สถานที่: ${event.location || '-'}\n` +
                        `${event.description ? `รายละเอียด: ${event.description}\n` : ''}` + 
                        `(บันทึกโดย: ${currentUser.name})`;

        const baseUrl = currentBaseUrl || window.location.origin;
        const deepLink = `${baseUrl}?view=DIRECTOR_CALENDAR`;

        directors.forEach(d => {
            if (d.telegramChatId) {
                sendTelegramMessage(currentBotToken!, d.telegramChatId, message, deepLink);
            }
        });
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-20">
            {/* Header */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Calendar className="text-purple-600"/> ปฏิทินปฏิบัติงานผู้อำนวยการ
                    </h2>
                    <p className="text-slate-500 text-sm">จัดการและแจ้งเตือนภารกิจงาน (สำหรับเจ้าหน้าที่ธุรการและผู้อำนวยการ)</p>
                </div>
                {canEdit && activeTab === 'UPCOMING' && (
                    <button 
                        onClick={() => setShowForm(true)}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 font-bold flex items-center gap-2 shadow-md transition-transform hover:scale-105"
                    >
                        <Plus size={20}/> เพิ่มนัดหมาย
                    </button>
                )}
            </div>

            {/* Tabs Navigation */}
            <div className="flex bg-slate-100 p-1 rounded-xl w-fit border border-slate-200">
                <button 
                    onClick={() => setActiveTab('UPCOMING')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                        activeTab === 'UPCOMING' 
                            ? 'bg-white text-purple-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <ListFilter size={16}/> งานที่ต้องปฏิบัติ ({upcomingEvents.length})
                </button>
                <button 
                    onClick={() => setActiveTab('PAST')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
                        activeTab === 'PAST' 
                            ? 'bg-white text-slate-700 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <History size={16}/> ปฏิบัติเรียบร้อย ({pastEvents.length})
                </button>
            </div>

            {/* Offline Indicator */}
            {!isConfigured && (
                <div className="bg-orange-50 border border-orange-200 text-orange-700 p-3 rounded-lg flex items-center gap-2 text-sm">
                    <ServerOff size={16}/> ระบบทำงานแบบ Offline ข้อมูลจะไม่ถูกบันทึกถาวร
                </div>
            )}

            {/* Add Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 animate-scale-up">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Plus className="text-purple-600"/> เพิ่มภารกิจงานใหม่
                        </h3>
                        <form onSubmit={handleSaveEvent} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">หัวข้อภารกิจ</label>
                                <input type="text" required className="w-full border rounded-lg px-3 py-2" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="เช่น ประชุมวิชาการ, ต้อนรับคณะดูงาน"/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">วันที่</label>
                                    <input type="date" required className="w-full border rounded-lg px-3 py-2" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">เวลาเริ่ม</label>
                                    <input type="time" required className="w-full border rounded-lg px-3 py-2" value={newEvent.startTime} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}/>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">เวลาสิ้นสุด (ถ้ามี)</label>
                                    <input type="time" className="w-full border rounded-lg px-3 py-2" value={newEvent.endTime || ''} onChange={e => setNewEvent({...newEvent, endTime: e.target.value})}/>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">สถานที่</label>
                                    <input type="text" className="w-full border rounded-lg px-3 py-2" value={newEvent.location} onChange={e => setNewEvent({...newEvent, location: e.target.value})} placeholder="ระบุสถานที่"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">รายละเอียดเพิ่มเติม</label>
                                <textarea rows={2} className="w-full border rounded-lg px-3 py-2" value={newEvent.description} onChange={e => setNewEvent({...newEvent, description: e.target.value})}></textarea>
                            </div>
                            
                            <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-800 flex items-start gap-2">
                                <Bell size={14} className="shrink-0 mt-0.5"/>
                                <div>
                                    ระบบจะแจ้งเตือน ผอ. ผ่าน Telegram ทันทีที่บันทึก <br/>
                                    และจะแจ้งเตือนซ้ำ: <strong>1 วันก่อนถึง</strong> และ <strong>เช้าวันปฏิบัติงาน</strong>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold">ยกเลิก</button>
                                <button type="submit" className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-bold shadow-md">บันทึก</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Events List */}
            <div className="space-y-4">
                {displayedEvents.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400 flex flex-col items-center gap-2">
                        {activeTab === 'UPCOMING' ? (
                            <>
                                <Calendar size={48} className="text-slate-200"/>
                                <p>ไม่มีรายการนัดหมายเร็วๆ นี้</p>
                            </>
                        ) : (
                            <>
                                <History size={48} className="text-slate-200"/>
                                <p>ยังไม่มีประวัติการปฏิบัติงานที่ผ่านมา</p>
                            </>
                        )}
                    </div>
                ) : (
                    displayedEvents.map((event) => {
                        const evtDate = new Date(event.date);
                        const todayRef = new Date();
                        todayRef.setHours(0,0,0,0);
                        evtDate.setHours(0,0,0,0);
                        
                        const isPast = evtDate < todayRef;
                        const isToday = evtDate.getTime() === todayRef.getTime();

                        return (
                            <div key={event.id} className={`bg-white rounded-xl p-6 shadow-sm border transition-all ${isToday ? 'border-purple-500 ring-1 ring-purple-100' : 'border-slate-200'} ${isPast ? 'opacity-80 bg-slate-50' : ''}`}>
                                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                                    <div className="flex gap-4 w-full">
                                        {/* Date Box (Thai Format) */}
                                        <div className={`flex flex-col items-center justify-center w-24 h-24 rounded-xl shrink-0 ${isToday ? 'bg-purple-600 text-white' : (isPast ? 'bg-slate-200 text-slate-500' : 'bg-purple-50 text-purple-700')}`}>
                                            <span className="text-xs font-bold">{getThaiMonthShort(event.date)}</span>
                                            <span className="text-3xl font-bold">{evtDate.getDate()}</span>
                                            <span className="text-[10px]">{getThaiDayShort(event.date)}</span>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                {isToday && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">วันนี้</span>}
                                                {isPast && <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><CheckCircle size={10}/> เสร็จสิ้น</span>}
                                                <h3 className={`text-lg font-bold ${isPast ? 'text-slate-600' : 'text-slate-800'}`}>{event.title}</h3>
                                            </div>
                                            
                                            {/* Full Thai Date Display */}
                                            <div className="text-sm font-bold text-slate-700 mb-1">
                                                {getThaiFullDate(event.date)}
                                            </div>

                                            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 mt-2">
                                                <div className="flex items-center gap-1">
                                                    <Clock size={16} className={isPast ? "text-slate-400" : "text-purple-500"}/> 
                                                    {event.startTime} {event.endTime ? `- ${event.endTime}` : ''} น.
                                                </div>
                                                {event.location && (
                                                    <div className="flex items-center gap-1">
                                                        <MapPin size={16} className={isPast ? "text-slate-400" : "text-red-500"}/> {event.location}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {event.description && (
                                                <p className="text-sm text-slate-500 mt-2 bg-white/50 p-2 rounded border border-slate-100 inline-block">
                                                    {event.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex flex-col items-end gap-2">
                                        {canEdit && (
                                            <button 
                                                onClick={() => handleDeleteEvent(event.id)}
                                                className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                                title="ลบรายการ"
                                            >
                                                <Trash2 size={18}/>
                                            </button>
                                        )}
                                        {/* Notification Status Badges (Only show on upcoming or today) */}
                                        {!isPast && (
                                            <div className="flex gap-1">
                                                {event.notifiedOneDayBefore && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded border border-green-200">แจ้งล่วงหน้าแล้ว</span>}
                                                {event.notifiedOnDay && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">แจ้งวันนี้แล้ว</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default DirectorCalendar;
