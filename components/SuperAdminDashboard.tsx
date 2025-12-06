
import React, { useState } from 'react';
import { School, Teacher } from '../types';
import { Building, Plus, LogOut, MapPin, Users, X, User, ChevronRight, Edit, Trash2, Save, ShieldCheck, ShieldAlert } from 'lucide-react';

interface SuperAdminDashboardProps {
    schools: School[];
    teachers: Teacher[];
    onCreateSchool: (school: School) => void;
    onUpdateSchool: (school: School) => void;
    onDeleteSchool: (schoolId: string) => void;
    onUpdateTeacher: (teacher: Teacher) => void;
    onLogout: () => void;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ schools, teachers, onCreateSchool, onUpdateSchool, onDeleteSchool, onUpdateTeacher, onLogout }) => {
    const [showForm, setShowForm] = useState(false);
    const [formMode, setFormMode] = useState<'CREATE' | 'EDIT'>('CREATE');
    const [formData, setFormData] = useState<Partial<School>>({ id: '', name: '', district: '', province: '' });
    const [error, setError] = useState('');

    // Teacher List Modal
    const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);

    const handleStartCreate = () => {
        setFormMode('CREATE');
        setFormData({ id: '', name: '', district: '', province: '' });
        setShowForm(true);
    };

    const handleStartEdit = (school: School) => {
        setFormMode('EDIT');
        setFormData({ ...school });
        setShowForm(true);
    };

    const handleDelete = (schoolId: string) => {
        const teacherCount = teachers.filter(t => t.schoolId === schoolId).length;
        if (teacherCount > 0) {
            if (!confirm(`โรงเรียนนี้มีบุคลากรอยู่จำนวน ${teacherCount} ท่าน \nการลบโรงเรียนจะไม่ลบบุคลากร (แต่บุคลากรจะเข้าสู่ระบบไม่ได้จนกว่าจะย้ายสังกัด) \n\nยืนยันที่จะลบโรงเรียนนี้หรือไม่?`)) {
                return;
            }
        } else {
            if (!confirm('ยืนยันการลบโรงเรียนนี้?')) return;
        }
        
        onDeleteSchool(schoolId);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (formMode === 'CREATE') {
            if (!formData.id || formData.id.length !== 8) {
                setError('รหัสโรงเรียนต้องมี 8 หลัก');
                return;
            }
            if (schools.find(s => s.id === formData.id)) {
                setError('รหัสโรงเรียนนี้มีอยู่ในระบบแล้ว');
                return;
            }
        }

        if (!formData.name) {
            setError('กรุณาระบุชื่อโรงเรียน');
            return;
        }

        if (formMode === 'CREATE') {
            onCreateSchool(formData as School);
            alert('สร้างโรงเรียนเรียบร้อยแล้ว');
        } else {
            onUpdateSchool(formData as School);
            alert('แก้ไขข้อมูลเรียบร้อยแล้ว');
        }

        setFormData({ id: '', name: '', district: '', province: '' });
        setShowForm(false);
    };

    const toggleSchoolAdmin = (teacher: Teacher) => {
        const isCurrentlyAdmin = teacher.roles.includes('SYSTEM_ADMIN');
        let newRoles = [...teacher.roles];
        
        if (isCurrentlyAdmin) {
            if(!confirm(`ต้องการปลด ${teacher.name} ออกจากการเป็น Admin โรงเรียนใช่หรือไม่?`)) return;
            newRoles = newRoles.filter(r => r !== 'SYSTEM_ADMIN');
        } else {
            if(!confirm(`ต้องการตั้งให้ ${teacher.name} เป็น Admin ผู้ดูแลระบบของโรงเรียนนี้ใช่หรือไม่?`)) return;
            newRoles.push('SYSTEM_ADMIN');
        }
        
        onUpdateTeacher({ ...teacher, roles: newRoles });
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
                        onClick={handleStartCreate}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl shadow-lg flex items-center gap-2 font-bold transition-transform hover:scale-105"
                    >
                        <Plus size={20}/> สร้างโรงเรียนใหม่
                    </button>
                </div>

                {/* Create/Edit Form Modal */}
                {showForm && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-down">
                            <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2 flex items-center gap-2">
                                {formMode === 'CREATE' ? <Plus className="text-blue-600"/> : <Edit className="text-orange-500"/>}
                                {formMode === 'CREATE' ? 'สร้างโรงเรียนใหม่' : 'แก้ไขข้อมูลโรงเรียน'}
                            </h3>
                            
                            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm font-bold border border-red-200">{error}</div>}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">รหัสโรงเรียน (8 หลัก)</label>
                                    <input 
                                        type="text" 
                                        maxLength={8}
                                        value={formData.id}
                                        disabled={formMode === 'EDIT'}
                                        onChange={e => setFormData({...formData, id: e.target.value.replace(/\D/g,'')})}
                                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest text-lg ${formMode === 'EDIT' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                                        placeholder="XXXXXXXX"
                                    />
                                    {formMode === 'EDIT' && <p className="text-xs text-slate-400 mt-1">รหัสโรงเรียนไม่สามารถแก้ไขได้</p>}
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">ชื่อโรงเรียน</label>
                                    <input 
                                        type="text" 
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="ระบุชื่อโรงเรียน"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">อำเภอ/เขต</label>
                                        <input 
                                            type="text" 
                                            value={formData.district}
                                            onChange={e => setFormData({...formData, district: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1">จังหวัด</label>
                                        <input 
                                            type="text" 
                                            value={formData.province}
                                            onChange={e => setFormData({...formData, province: e.target.value})}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200">ยกเลิก</button>
                                    <button type="submit" className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-md flex items-center justify-center gap-2">
                                        <Save size={18}/> บันทึก
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Teacher List Modal (Full View) */}
                {selectedSchoolId && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col animate-slide-down">
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
                                        <div className="overflow-y-auto p-6 custom-scrollbar bg-slate-50/50">
                                            {schoolTeachers.length === 0 ? (
                                                <div className="text-center py-10 text-slate-400 bg-white rounded-lg border border-dashed border-slate-300">
                                                    ยังไม่มีบุคลากรลงทะเบียน
                                                </div>
                                            ) : (
                                                <div className="grid gap-3">
                                                    {schoolTeachers.map(t => {
                                                        const isSchoolAdmin = t.roles.includes('SYSTEM_ADMIN');
                                                        return (
                                                            <div key={t.id} className={`flex items-center gap-4 p-4 border rounded-xl transition-colors ${isSchoolAdmin ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${isSchoolAdmin ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                                                    {isSchoolAdmin ? <ShieldCheck size={24}/> : <User size={24}/>}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="font-bold text-slate-800 flex items-center gap-2">
                                                                        {t.name}
                                                                        {isSchoolAdmin && <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full">School Admin</span>}
                                                                    </div>
                                                                    <div className="text-sm text-slate-500">ตำแหน่ง: {t.position} | ID: {t.id}</div>
                                                                    <div className="flex gap-1 flex-wrap mt-1">
                                                                        {t.roles.map(r => (
                                                                            <span key={r} className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                                                                                {r}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-col items-end gap-2">
                                                                    <button 
                                                                        onClick={() => toggleSchoolAdmin(t)}
                                                                        className={`text-xs px-3 py-2 rounded-lg font-bold flex items-center gap-1 transition-all ${
                                                                            isSchoolAdmin 
                                                                                ? 'bg-white text-red-600 border border-red-200 hover:bg-red-50' 
                                                                                : 'bg-slate-800 text-white hover:bg-slate-900 shadow-sm'
                                                                        }`}
                                                                    >
                                                                        {isSchoolAdmin ? (
                                                                            <><ShieldAlert size={14}/> ปลด Admin</>
                                                                        ) : (
                                                                            <><ShieldCheck size={14}/> ตั้งเป็น Admin</>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
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
                            <div key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all group flex flex-col h-full relative">
                                <div className="h-2 bg-gradient-to-r from-blue-400 to-indigo-500"></div>
                                
                                {/* Edit/Delete Buttons Overlay */}
                                <div className="absolute top-4 right-4 flex gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleStartEdit(s); }}
                                        className="p-2 bg-white text-slate-500 hover:text-blue-600 border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-all"
                                        title="แก้ไขข้อมูล"
                                    >
                                        <Edit size={16}/>
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                        className="p-2 bg-white text-slate-500 hover:text-red-600 border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-all"
                                        title="ลบโรงเรียน"
                                    >
                                        <Trash2 size={16}/>
                                    </button>
                                </div>

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
                                                        <div className={`w-1.5 h-1.5 rounded-full ${t.roles.includes('SYSTEM_ADMIN') ? 'bg-blue-500' : 'bg-slate-300'}`}></div>
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
