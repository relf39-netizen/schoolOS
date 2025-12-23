
import React, { useState, useEffect } from 'react';
import { Teacher, EnrollmentData, TestScoreData, TestType } from '../types';
import { CURRENT_SCHOOL_YEAR } from '../constants';
import { 
    GraduationCap, Users, LineChart, BarChart as BarChartIcon, 
    Save, ChevronLeft, Award, Database, Loader, Cloud, RefreshCw
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
    LineChart as RechartsLineChart, Line, LabelList 
} from 'recharts';
import { supabase, isConfigured } from '../supabaseClient';

interface AcademicSystemProps {
    currentUser: Teacher;
}

const AcademicSystem: React.FC<AcademicSystemProps> = ({ currentUser }) => {
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'ENROLLMENT' | 'TEST_SCORES'>('DASHBOARD');
    const [enrollments, setEnrollments] = useState<EnrollmentData[]>([]);
    const [testScores, setTestScores] = useState<TestScoreData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [selectedYear, setSelectedYear] = useState<string>(CURRENT_SCHOOL_YEAR);
    const [tempEnrollment, setTempEnrollment] = useState<EnrollmentData | null>(null);
    const [selectedTestType, setSelectedTestType] = useState<TestType>('ONET');
    const [tempScore, setTempScore] = useState<TestScoreData | null>(null);

    const loadData = async () => {
        setIsLoading(true);
        if (isConfigured && supabase) {
            try {
                const { data: enrollData } = await supabase
                    .from('academic_enrollments')
                    .select('*')
                    .eq('school_id', currentUser.schoolId);
                
                if (enrollData) {
                    setEnrollments(enrollData.map(d => ({
                        id: d.id, schoolId: d.school_id, year: d.year, levels: d.levels
                    })));
                }

                const { data: scoreData } = await supabase
                    .from('academic_test_scores')
                    .select('*')
                    .eq('school_id', currentUser.schoolId);
                
                if (scoreData) {
                    setTestScores(scoreData.map(d => ({
                        id: d.id, schoolId: d.school_id, year: d.year, testType: d.test_type as TestType, results: d.results
                    })));
                }
            } catch (err) {
                console.error("Database Fetch Error:", err);
            }
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, [currentUser.schoolId]);

    const LEVELS = [
        { id: 'Anuban1', label: 'อนุบาล 1' }, { id: 'Anuban2', label: 'อนุบาล 2' }, { id: 'Anuban3', label: 'อนุบาล 3' },
        { id: 'Prathom1', label: 'ป.1' }, { id: 'Prathom2', label: 'ป.2' }, { id: 'Prathom3', label: 'ป.3' },
        { id: 'Prathom4', label: 'ป.4' }, { id: 'Prathom5', label: 'ป.5' }, { id: 'Prathom6', label: 'ป.6' },
    ];

    const getTestSubjectLabel = (key: string) => {
        const map: any = {
            'Reading': 'การอ่านออกเสียง', 'Understanding': 'การอ่านรู้เรื่อง',
            'Math': 'คณิตศาสตร์', 'Thai': 'ภาษาไทย', 'Science': 'วิทยาศาสตร์', 'English': 'ภาษาอังกฤษ'
        };
        return map[key] || key;
    };

    const getTestSubjects = (type: TestType) => {
        switch(type) {
            case 'RT': return ['Reading', 'Understanding'];
            case 'NT': return ['Math', 'Thai'];
            case 'ONET': return ['Thai', 'Math', 'Science', 'English'];
            default: return [];
        }
    };

    const handleSaveEnrollment = async () => {
        if (!tempEnrollment || !supabase) return;
        setIsSaving(true);
        const payload = {
            id: `enroll_${currentUser.schoolId}_${tempEnrollment.year}`,
            school_id: currentUser.schoolId,
            year: tempEnrollment.year,
            levels: tempEnrollment.levels
        };
        const { error } = await supabase.from('academic_enrollments').upsert([payload]);
        if (!error) { alert("บันทึกข้อมูลเรียบร้อยแล้ว"); await loadData(); setViewMode('DASHBOARD'); }
        setIsSaving(false);
    };

    const handleSaveScore = async () => {
        if (!tempScore || !supabase) return;
        setIsSaving(true);
        const payload = {
            id: `score_${currentUser.schoolId}_${tempScore.testType.toLowerCase()}_${tempScore.year}`,
            school_id: currentUser.schoolId,
            year: tempScore.year,
            test_type: tempScore.testType,
            results: tempScore.results
        };
        const { error } = await supabase.from('academic_test_scores').upsert([payload]);
        if (!error) { alert("บันทึกคะแนนสอบเรียบร้อยแล้ว"); await loadData(); setViewMode('DASHBOARD'); }
        setIsSaving(false);
    };

    const initEnrollmentForm = (year: string) => {
        const existing = enrollments.find(e => e.year === year);
        if (existing) setTempEnrollment({ ...existing });
        else {
            const empty: any = {}; LEVELS.forEach(l => empty[l.id] = { m: 0, f: 0 });
            setTempEnrollment({ id: '', schoolId: currentUser.schoolId, year, levels: empty });
        }
    };

    const initScoreForm = (year: string, type: TestType) => {
        const existing = testScores.find(s => s.year === year && s.testType === type);
        if (existing) setTempScore({ ...existing });
        else {
            const res: any = {}; getTestSubjects(type).forEach(s => res[s] = 0);
            setTempScore({ id: '', schoolId: currentUser.schoolId, year, testType: type, results: res });
        }
    };

    const renderDashboard = () => {
        const enrollmentChartData = enrollments
            .sort((a, b) => parseInt(a.year) - parseInt(b.year))
            .map(e => {
                let total = 0;
                Object.values(e.levels).forEach((val: any) => { total += (parseInt(val.m) || 0) + (parseInt(val.f) || 0); });
                return { year: `ปี ${e.year}`, Total: total };
            });

        const prepareScoreData = (type: TestType) => {
            return testScores.filter(s => s.testType === type)
                .sort((a,b) => parseInt(a.year) - parseInt(b.year))
                .map(s => {
                    const item: any = { year: `ปี ${s.year}` };
                    Object.keys(s.results).forEach(subj => { item[getTestSubjectLabel(subj)] = s.results[subj]; });
                    return item;
                });
        };

        const rtData = prepareScoreData('RT');
        const ntData = prepareScoreData('NT');
        const onetData = prepareScoreData('ONET');
        const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        const hasNoData = enrollments.length === 0 && testScores.length === 0;

        return (
            <div className="space-y-6 pb-20 animate-fade-in">
                {/* Header Banner */}
                <div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-2.5 rounded-xl"><GraduationCap size={28}/></div>
                        <div>
                            <h2 className="text-xl font-bold">งานบริหารวิชาการ</h2>
                            <p className="text-indigo-100 text-xs font-medium">สถิตินักเรียนและผลสัมฤทธิ์ทางการเรียนระดับสถานศึกษา</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => { setViewMode('ENROLLMENT'); initEnrollmentForm(selectedYear); }} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-all border border-white/10">
                            <Users size={14}/> ข้อมูลนักเรียน
                        </button>
                        <button onClick={() => { setViewMode('TEST_SCORES'); initScoreForm(selectedYear, selectedTestType); }} className="bg-white text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg font-bold text-xs shadow-md flex items-center gap-2 transition-all">
                            <Award size={14}/> ผลสอบ O-NET/NT/RT
                        </button>
                    </div>
                </div>

                {hasNoData ? (
                    <div className="bg-white p-20 rounded-2xl border-2 border-dashed border-slate-100 text-center">
                        <Database className="mx-auto text-slate-200 mb-3" size={40}/>
                        <h3 className="text-lg font-bold text-slate-800">ไม่มีข้อมูลในระบบ</h3>
                        <p className="text-slate-400 text-sm">กรุณาบันทึกข้อมูลเพื่อเริ่มแสดงผลรายงานสถิติ</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* 1. Bar Chart Full Width */}
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                            <h3 className="text-sm font-bold text-slate-600 mb-5 flex items-center gap-2 uppercase tracking-wide">
                                <BarChartIcon size={16} className="text-indigo-500"/> เปรียบเทียบจำนวนนักเรียนรวมแต่ละปีการศึกษา
                            </h3>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={enrollmentChartData} margin={{ top: 15, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 'bold'}} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                                        <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                        <Bar dataKey="Total" name="จำนวนนักเรียนทั้งหมด" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40}>
                                            <LabelList dataKey="Total" position="top" fill="#4338ca" fontSize={10} fontWeight="black" offset={8} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* 2. Grid for Score Charts (3 Columns) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* O-NET */}
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-xs font-black text-slate-500 mb-5 flex items-center gap-2 uppercase tracking-widest">
                                    <LineChart size={14} className="text-orange-500"/> ผลสอบ O-NET (ป.6)
                                </h3>
                                <div className="h-[220px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsLineChart data={onetData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                                            <Legend iconType="circle" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}} />
                                            {['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'ภาษาอังกฤษ'].map((subj, idx) => (
                                                <Line key={subj} type="monotone" dataKey={subj} stroke={COLORS[idx]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                                            ))}
                                        </RechartsLineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* NT */}
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-xs font-black text-slate-500 mb-5 flex items-center gap-2 uppercase tracking-widest">
                                    <LineChart size={14} className="text-emerald-500"/> ผลสอบ NT (ป.3)
                                </h3>
                                <div className="h-[220px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsLineChart data={ntData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                                            <Legend iconType="circle" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}} />
                                            {['คณิตศาสตร์', 'ภาษาไทย'].map((subj, idx) => (
                                                <Line key={subj} type="monotone" dataKey={subj} stroke={COLORS[idx + 1]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                                            ))}
                                        </RechartsLineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* RT */}
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                                <h3 className="text-xs font-black text-slate-500 mb-5 flex items-center gap-2 uppercase tracking-widest">
                                    <LineChart size={14} className="text-blue-500"/> ผลสอบ RT (ป.1)
                                </h3>
                                <div className="h-[220px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsLineChart data={rtData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} />
                                            <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '11px' }} />
                                            <Legend iconType="circle" wrapperStyle={{fontSize: '9px', paddingTop: '10px'}} />
                                            {['การอ่านออกเสียง', 'การอ่านรู้เรื่อง'].map((subj, idx) => (
                                                <Line key={subj} type="monotone" dataKey={subj} stroke={COLORS[idx + 4]} strokeWidth={3} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} />
                                            ))}
                                        </RechartsLineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-center pt-8">
                            <div className="px-4 py-1.5 bg-slate-50 rounded-full text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                <Cloud size={10}/> Analytics Connected via Cloud SQL
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderEnrollmentForm = () => {
        if (!tempEnrollment) return null;
        let totalM = 0, totalF = 0;
        Object.values(tempEnrollment.levels).forEach((v: any) => { totalM += parseInt(v.m || 0); totalF += parseInt(v.f || 0); });

        return (
            <div className="max-w-3xl mx-auto space-y-4 pb-20 animate-slide-up">
                <button onClick={() => setViewMode('DASHBOARD')} className="flex items-center gap-2 text-slate-500 font-bold hover:text-indigo-600 transition-colors text-sm">
                    <ChevronLeft size={16}/> กลับสู่หน้าวิเคราะห์
                </button>
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 relative overflow-hidden">
                    {isSaving && <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center backdrop-blur-sm"><Loader className="animate-spin text-indigo-600" size={32}/></div>}
                    <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 border-b pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Users size={20}/></div>
                            <select value={tempEnrollment.year} onChange={(e) => initEnrollmentForm(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 font-bold text-indigo-700 outline-none text-base">
                                {[2565, 2566, 2567, 2568, 2569].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div className="flex gap-4 text-xs font-black bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                            <span className="text-blue-500 uppercase">M: {totalM}</span>
                            <span className="text-pink-500 uppercase">F: {totalF}</span>
                            <span className="text-slate-800 border-l pl-4 uppercase">Total: {totalM + totalF}</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        {LEVELS.map((level) => (
                            <div key={level.id} className="grid grid-cols-12 items-center gap-2 p-1.5 hover:bg-slate-50 rounded-lg transition-colors">
                                <div className="col-span-6 md:col-span-4 font-bold text-slate-700 text-sm">{level.label}</div>
                                <div className="col-span-3 md:col-span-4 relative">
                                    <input type="number" min="0" className="w-full text-center border rounded-lg py-1.5 focus:border-blue-400 outline-none text-blue-700 font-bold text-sm bg-slate-50/30" value={tempEnrollment.levels[level.id]?.m || 0} onChange={e => setTempEnrollment({...tempEnrollment, levels: {...tempEnrollment.levels, [level.id]: {...tempEnrollment.levels[level.id], m: parseInt(e.target.value)||0}}})}/>
                                </div>
                                <div className="col-span-3 md:col-span-4 relative">
                                    <input type="number" min="0" className="w-full text-center border rounded-lg py-1.5 focus:border-pink-400 outline-none text-pink-700 font-bold text-sm bg-slate-50/30" value={tempEnrollment.levels[level.id]?.f || 0} onChange={e => setTempEnrollment({...tempEnrollment, levels: {...tempEnrollment.levels, [level.id]: {...tempEnrollment.levels[level.id], f: parseInt(e.target.value)||0}}})}/>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleSaveEnrollment} disabled={isSaving} className="w-full mt-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-base shadow-lg hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 active:scale-95">
                        <Save size={18}/> บันทึกข้อมูลนักเรียน (SQL)
                    </button>
                </div>
            </div>
        );
    };

    const renderTestScoreForm = () => {
        if (!tempScore) return null;
        const subjects = getTestSubjects(tempScore.testType);
        return (
            <div className="max-w-2xl mx-auto space-y-4 pb-20 animate-slide-up">
                <button onClick={() => setViewMode('DASHBOARD')} className="flex items-center gap-2 text-slate-500 font-bold hover:text-emerald-600 transition-colors text-sm">
                    <ChevronLeft size={16}/> กลับสู่หน้าวิเคราะห์
                </button>
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-100 relative overflow-hidden">
                    {isSaving && <div className="absolute inset-0 bg-white/60 z-50 flex items-center justify-center backdrop-blur-sm"><Loader className="animate-spin text-emerald-600" size={32}/></div>}
                    <div className="flex flex-col md:flex-row gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="flex-1">
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">ประเภทการสอบ</label>
                            <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                                {['RT', 'NT', 'ONET'].map((t) => (
                                    <button key={t} onClick={() => { setSelectedTestType(t as TestType); initScoreForm(tempScore.year, t as TestType); }} className={`flex-1 py-1 text-xs font-black rounded-md transition-all ${tempScore.testType === t ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}>{t}</button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">ปีการศึกษา</label>
                            <select value={tempScore.year} onChange={(e) => initScoreForm(e.target.value, tempScore.testType)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1 font-bold text-slate-700 outline-none text-sm h-[32px]">
                                {[2565, 2566, 2567, 2568, 2569].map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-4 max-w-md mx-auto">
                        <h3 className="text-center font-bold text-lg text-slate-800 flex items-center justify-center gap-2"><Award className="text-emerald-500" size={20}/> คะแนนเฉลี่ย {tempScore.testType}</h3>
                        {subjects.map(subj => (
                            <div key={subj} className="space-y-1">
                                <label className="block text-[11px] font-bold text-slate-500 ml-1 uppercase">{getTestSubjectLabel(subj)}</label>
                                <div className="relative">
                                    <input type="number" step="0.01" min="0" max="100" value={tempScore.results[subj] || ''} onChange={e => setTempScore({...tempScore, results: { ...tempScore.results, [subj]: parseFloat(e.target.value) || 0 }})} className="w-full px-4 py-2.5 border rounded-xl focus:border-emerald-500 outline-none text-2xl font-bold text-center text-emerald-600 bg-slate-50/50 transition-all"/>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">/ 100</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button onClick={handleSaveScore} disabled={isSaving} className="w-full mt-8 py-3 bg-emerald-600 text-white rounded-xl font-bold text-base shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 active:scale-95">
                        <Save size={18}/> บันทึกคะแนนเฉลี่ยลง SQL
                    </button>
                </div>
            </div>
        );
    };

    if (isLoading) return <div className="flex items-center justify-center h-64 text-slate-400 flex-col gap-3 animate-pulse"><Loader className="animate-spin text-indigo-600" size={32}/><p className="font-bold text-sm">กำลังเชื่อมต่อข้อมูล...</p></div>;

    return (
        <div className="max-w-7xl mx-auto">
            {viewMode === 'DASHBOARD' && renderDashboard()}
            {viewMode === 'ENROLLMENT' && renderEnrollmentForm()}
            {viewMode === 'TEST_SCORES' && renderTestScoreForm()}
        </div>
    );
};

export default AcademicSystem;
