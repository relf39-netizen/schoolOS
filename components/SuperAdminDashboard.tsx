
import React, { useState } from 'react';
import { School, Teacher } from '../types';
import { Building, Plus, LogOut, MapPin, Search, Users, X, User, ChevronRight } from 'lucide-react';

interface SuperAdminDashboardProps {
    schools: School[];
    teachers: Teacher[];
    onCreateSchool: (school: School) => void;
    onLogout: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ schools, teachers, onCreateSchool, onLogout }) => {
    const [showForm, setShowForm] = useState(false);
    const [newSchool, setNewSchool] = useState<Partial<School>>({ id: '', name: '', district: '', province: '' });
    const [error, setError] = useState('');

    // Teacher List Modal
    const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!newSchool.id || newSchool.id.length !== 8) {
            setError('รหัสโรงเรียนต้องมี 8 หลัก');
            return;
        }

        if (schools.find(s => s.id === newSchool.id)) {
            setError('รหัสโรงเรียนนี้มีอยู่ในระบบแล้ว');
            return;
        }

        if (!newSchool.name) {
            setError('กรุณาระบุชื่อโรงเรียน');
            return;
        }

        onCreateSchool(newSchool as School);
        setNewSchool({ id: '', name: '', district: '', province: '' });
        setShowForm(false);
        alert('สร้างโรงเรียนเรียบร้อยแล้ว');
    };

    return (
        <div className="min-h-screen bg-slate-100 font-sarabun">
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-20">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-bold">S</div>
                        Super Admin Dashboard
                    </h1>
                    <button onClick={onLogout} className="flex items-center gap-2 text-slate-300 hover:text-white">
                        <LogOut size={18}/> ออกจากระบบ
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">จัดการรายชื่อโรงเรียน</h2>
                        <p className="text-slate-500">ระบบมีโรงเรียนทั้งหมด {schools.length} แห่ง และบุคลากร {teachers.filter(t => !t.schoolId.includes('9999')).length} ท่าน</p>
                    </div>
                    <button 
                        onClick={() => setShowForm(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-transform hover:scale-105"
                    >
                        <Plus size={20}/> สร้างโรงเรียนใหม่
                    </button>
                </div>

                {/* Create Form Modal */}
                {showForm && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-down">
                            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2 flex items-center gap-2">
                                <Building className="text-blue-600"/> สร้างโรงเรียนใหม่
                            </h3>
                            
                            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-bold border border-red-200">{error}</div>}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">รหัสโรงเรียน (8 หลัก)</label>
                                    <input 
                                        type="text" 
                                        maxLength={8}
                                        value={newSchool.id}
                                        onChange={e => setNewSchool({...newSchool, id: e.target.value.replace(/\D/g,'')})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest text-lg"
                                        placeholder="XXXXXXXX"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อโรงเรียน</label>
                                    <input 
                                        type="text" 
                                        value={newSchool.name}
                                        onChange={e => setNewSchool({...newSchool, name: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="ระบุชื่อโรงเรียน"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">อำเภอ/เขต</label>
                                        <input 
                                            type="text" 
                                            value={newSchool.district}
                                            onChange={e => setNewSchool({...newSchool, district: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">จังหวัด</label>
                                        <input 
                                            type="text" 
                                            value={newSchool.province}
                                            onChange={e => setNewSchool({...newSchool, province: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">ยกเลิก</button>
                                    <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md">บันทึก</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Teacher List Modal (Full View) */}
                {selectedSchoolId && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-slide-down">
                            {(() => {
                                const school = schools.find(s => s.id === selectedSchoolId);
                                const schoolTeachers = teachers.filter(t => t.schoolId === selectedSchoolId);
                                
                                return (
                                    <>
                                        <div className="p-6 border-b flex justify-between items-center bg-slate-50 rounded-t-2xl">
                                            <div>
                                                <h3 className="text-xl font-bold text-slate-800">{school?.name}</h3>
                                                <p className="text-sm text-slate-500">รายชื่อบุคลากรทั้งหมด {schoolTeachers.length} ท่าน</p>
                                            </div>
                                            <button onClick={() => setSelectedSchoolId(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                                                <X size={24}/>
                                            </button>
                                        </div>
                                        <div className="overflow-y-auto p-6 custom-scrollbar">
                                            {schoolTeachers.length === 0 ? (
                                                <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                                                    ยังไม่มีบุคลากรลงทะเบียน
                                                </div>
                                            ) : (
                                                <div className="grid gap-3">
                                                    {schoolTeachers.map(t => (
                                                        <div key={t.id} className="flex items-center gap-4 p-3 border rounded-xl hover:bg-slate-50 transition-colors">
                                                            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                                                                <User size={20}/>
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="font-bold text-slate-800">{t.name}</div>
                                                                <div className="text-xs text-slate-500">ตำแหน่ง: {t.position} | ID: {t.id}</div>
                                                            </div>
                                                            <div className="flex gap-1 flex-wrap justify-end max-w-[150px]">
                                                                {t.roles.map(r => (
                                                                    <span key={r} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full border border-slate-200 truncate max-w-full">
                                                                        {r}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Card Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {schools.map(s => {
                        const schoolTeachers = teachers.filter(t => t.schoolId === s.id);
                        const teacherCount = schoolTeachers.length;
                        const previewTeachers = schoolTeachers.slice(0, 5); // Show first 5

                        return (
                            <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all group flex flex-col h-full">
                                <div className="h-2 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
                                <div className="p-6 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                            <Building size={24}/>
                                        </div>
                                        <div className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                            {s.id}
                                        </div>
                                    </div>
                                    
                                    <h3 className="font-bold text-lg text-slate-800 mb-1 line-clamp-2 min-h-[3.5rem]" title={s.name}>
                                        {s.name}
                                    </h3>
                                    
                                    <div className="flex items-center gap-1 text-sm text-slate-500 mb-4">
                                        <MapPin size={14}/> {s.district}, {s.province}
                                    </div>

                                    {/* Teacher List Preview Section */}
                                    <div className="mt-auto border-t border-slate-100 pt-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2 text-slate-600 font-bold text-sm">
                                                <Users size={16}/> {teacherCount} บุคลากร
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2 mb-3 min-h-[100px]">
                                            {previewTeachers.length > 0 ? (
                                                previewTeachers.map(t => (
                                                    <div key={t.id} className="text-xs text-slate-600 flex items-center gap-2 truncate">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                                        {t.name}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-xs text-slate-400 italic">ยังไม่มีข้อมูลบุคลากร</div>
                                            )}
                                            {teacherCount > 5 && (
                                                <div className="text-xs text-slate-400 pl-3">
                                                    ...และอีก {teacherCount - 5} ท่าน
                                                </div>
                                            )}
                                        </div>

                                        <button 
                                            onClick={() => setSelectedSchoolId(s.id)}
                                            className="w-full py-2 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center justify-center gap-1"
                                        >
                                            ดูรายชื่อทั้งหมด <ChevronRight size={14}/>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
