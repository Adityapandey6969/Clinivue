import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, XCircle, ArrowDown, ShieldAlert, Microscope, ClipboardList, Leaf, Calendar, X, MapPin, Building2, Star, Search, ArrowRight, Activity } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { saveSearch } from '../lib/searchHistory';

type ReportParam = { name: string; value: number; unit: string; status: string; severity: string; reference_range: number[]; explanation: string; };
type ReportData = { report_id: string; status: string; parsed_at?: string; confidence?: number; parameters?: ReportParam[]; summary?: string; recommendation?: string; home_remedies?: string[]; action_plan?: string[]; health_risks?: string[]; disclaimer?: string; progress_pct?: number; };

const STATUS_CFG: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  high:   { bg: 'bg-red-50',     text: 'text-red-600',     icon: <AlertTriangle size={13} /> },
  low:    { bg: 'bg-amber-50',   text: 'text-amber-600',   icon: <ArrowDown size={13} /> },
  normal: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: <CheckCircle2 size={13} /> },
};

const SEV_STYLE: Record<string, string> = {
  high:     'bg-red-50 text-red-700 border-red-200',
  moderate: 'bg-amber-50 text-amber-700 border-amber-200',
  low:      'bg-yellow-50 text-yellow-700 border-yellow-200',
  normal:   'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function ReportUploader({ userUid }: { userUid: string }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentReportId = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  // Hospital Recommendation States
  const [location, setLocation] = useState('');
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);
  const [hospitalError, setHospitalError] = useState<string | null>(null);

  const fetchHospitals = async () => {
    if (!location.trim()) return;
    setHospitalsLoading(true);
    setHospitalError(null);
    try {
      // Defaulting procedure to 'Specialist Consultation' as it's the safest bet for a generic lab report issue.
      const res = await fetch('http://localhost:8000/api/v1/providers/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procedure: 'Specialist Consultation', location, budget_inr: null })
      });
      if (!res.ok) throw new Error('Failed to fetch hospitals');
      const data = await res.json();
      if (data.providers && data.providers.length > 0 && data.providers[0]._error !== "quota_exceeded") {
        setHospitals(data.providers);
      } else {
        setHospitalError(data.confidence?.assumptions?.[0] || 'Could not find hospitals in this area.');
        setHospitals([]);
      }
    } catch (err: any) {
      setHospitalError(err.message || 'Error fetching hospitals.');
      setHospitals([]);
    } finally {
      setHospitalsLoading(false);
    }
  };

  const pollReport = useCallback(async (reportId: string) => {
    let attempt = 0;
    const poll = async () => {
      if (cancelledRef.current) return;
      attempt++;
      try {
        const res = await fetch(`http://localhost:8000/api/v1/report/${reportId}`);
        const data = await res.json();
        if (cancelledRef.current) return;
        if (data.status === 'complete' || data.status === 'failed' || data.status === 'cancelled') {
          if (data.status === 'cancelled') {
            setReportData(null); setUploading(false);
            return;
          }
          setReportData(data);
          setUploading(false);
          if (data.status === 'complete') {
            saveSearch(userUid, 'report', fileName, {
              summary: data.summary,
              parameters: data.parameters,
              parameterCount: data.parameters?.length || 0,
              confidence: data.confidence,
              recommendation: data.recommendation,
            });
          }
          return;
        }
        setReportData(data);
        if (attempt < 120) setTimeout(poll, 1500); else { setError('Analysis timed out. Please try again.'); setUploading(false); }
      } catch { setError('Connection lost.'); setUploading(false); }
    };
    poll();
  }, []);

  const handleCancel = async () => {
    cancelledRef.current = true;
    const reportId = currentReportId.current;
    if (reportId) {
      try {
        await fetch(`http://localhost:8000/api/v1/report/${reportId}/cancel`, { method: 'POST' });
      } catch {}
    }
    setUploading(false);
    setReportData(null);
    setFileName('');
    setLocation('');
    setHospitals([]);
    setHospitalError(null);
    currentReportId.current = null;
  };

  const handleUpload = async (file: File) => {
    setError(null); setReportData(null); setFileName(file.name); setUploading(true);
    setLocation(''); setHospitals([]); setHospitalError(null);
    cancelledRef.current = false;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://localhost:8000/api/v1/report/upload', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Upload failed'); }
      const data = await res.json();
      currentReportId.current = data.report_id;
      setReportData({ report_id: data.report_id, status: 'processing', progress_pct: 5 });
      pollReport(data.report_id);
    } catch (err: any) { setError(err.message); setUploading(false); }
  };

  return (
    <div className="flex flex-col h-full card rounded-3xl overflow-hidden transition-colors duration-300">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center space-x-3 flex-shrink-0 bg-gradient-to-r from-violet-50/80 dark:from-violet-900/20 to-white dark:to-transparent">
        <div className="p-2.5 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl shadow-sm shadow-violet-200 dark:shadow-none">
          <Microscope size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Lab Report Analyzer</h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Upload a blood test, CBC, or any lab report</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0 bg-white/50 dark:bg-transparent">
        {/* Upload Zone */}
        {!reportData?.parameters && (
          <div
            onDrop={(e) => { e.preventDefault(); setDragActive(false); e.dataTransfer.files?.[0] && handleUpload(e.dataTransfer.files[0]); }}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all duration-200 group ${
              dragActive ? 'border-teal-400 dark:border-teal-500 bg-teal-50/40 dark:bg-teal-900/20 scale-[1.01]' : 'border-slate-200 dark:border-white/10 hover:border-teal-300 dark:hover:border-teal-500/50 hover:bg-teal-50/20 dark:hover:bg-teal-900/10'
            }`}
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
            <div className="flex flex-col items-center space-y-4">
              <div className={`p-5 rounded-2xl transition-all ${dragActive ? 'bg-teal-100 dark:bg-teal-900/40 scale-105' : 'bg-slate-50 dark:bg-slate-800/50 group-hover:bg-teal-50 dark:group-hover:bg-teal-900/30'}`}>
                <Upload className={`w-8 h-8 ${dragActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-teal-500 dark:group-hover:text-teal-400'} transition-colors`} />
              </div>
              <div>
                <p className="text-slate-700 dark:text-slate-200 font-bold text-sm">{dragActive ? 'Drop to analyze' : 'Upload Your Lab Report'}</p>
                <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">PDF, JPEG, or PNG · Max 20 MB</p>
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        <AnimatePresence>
          {uploading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="bg-white dark:bg-slate-900/40 rounded-xl p-5 border border-slate-100 dark:border-white/5 shadow-sm dark:backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 text-teal-500 dark:text-teal-400 animate-spin" />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Analyzing {fileName}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400">{reportData?.progress_pct || 0}%</span>
                  <button
                    onClick={handleCancel}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
                  >
                    <X size={12} />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                <motion.div className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full"
                  initial={{ width: '0%' }} animate={{ width: `${reportData?.progress_pct || 5}%` }} transition={{ duration: 0.5 }} />
              </div>
              <div className="flex items-center justify-between mt-3 px-1">
                {['OCR', 'Parse', 'Compare', 'Flag'].map((s, i) => (
                  <span key={s} className={`text-[10px] font-bold uppercase tracking-wide ${(reportData?.progress_pct || 0) > (i + 1) * 20 ? 'text-teal-600 dark:text-teal-400' : 'text-slate-300 dark:text-slate-600'}`}>{s}</span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="rounded-xl p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 flex items-center space-x-3">
            <XCircle size={18} className="text-red-500 dark:text-red-400 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Results */}
        {reportData?.status === 'complete' && reportData.parameters && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Analysis Complete</span>
              </div>
              {reportData.confidence !== undefined && (
                <span className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/10 px-3 py-1 rounded-full border border-teal-100 dark:border-teal-500/20">
                  {(reportData.confidence * 100).toFixed(0)}% confidence
                </span>
              )}
            </div>

            {reportData.summary && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-white/5 flex items-start space-x-2">
                <span className="text-xl">📋</span>
                <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed overflow-hidden prose dark:prose-invert max-w-none">
                  <ReactMarkdown>{reportData.summary}</ReactMarkdown>
                </div>
              </div>
            )}

            <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/40 dark:backdrop-blur-md">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-white/5 flex items-center space-x-2">
                <ClipboardList size={14} className="text-slate-500 dark:text-slate-400" />
                <h3 className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{reportData.parameters.length} Parameters Found</h3>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-white/5">
                {reportData.parameters.map((p, idx) => {
                  const cfg = STATUS_CFG[p.status] || STATUS_CFG.normal;
                  const sev = SEV_STYLE[p.severity] || SEV_STYLE.normal;

                  return (
                    <motion.div key={idx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }}
                      className="px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div className={`p-1.5 rounded-lg ${cfg.bg} dark:bg-white/5`}><span className={cfg.text}>{cfg.icon}</span></div>
                          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{p.name}</span>
                        </div>
                        <div className="flex items-center space-x-2.5">
                          <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{p.value} <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px]">{p.unit}</span></span>
                          <span className={`text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${sev}`}>{p.severity}</span>
                        </div>
                      </div>
                      <div className="ml-9 mt-1">
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">Ref: {p.reference_range[0]} – {p.reference_range[1]} {p.unit}</span>
                        {p.status !== 'normal' && <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{p.explanation}</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {reportData.recommendation && (
              <div className="rounded-xl p-4 bg-teal-50/50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-500/20">
                <h3 className="text-[13px] font-bold text-teal-700 dark:text-teal-400 mb-2 flex items-center space-x-2"><ShieldAlert size={14} /><span>Professional Guidance</span></h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line prose dark:prose-invert prose-sm max-w-none prose-p:my-1">
                  <ReactMarkdown>{reportData.recommendation}</ReactMarkdown>
                </div>
              </div>
            )}

            {reportData.health_risks && reportData.health_risks.length > 0 && (
              <div className="rounded-xl p-4 bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-500/20">
                <h3 className="text-[13px] font-bold text-red-700 dark:text-red-400 mb-3 flex items-center space-x-2"><Activity size={14} /><span>Health Risks & Consequences</span></h3>
                <div className="space-y-2">
                  {reportData.health_risks.map((risk, i) => (
                    <div key={i} className="flex items-start space-x-2 text-[12px] text-slate-600 dark:text-slate-400">
                      <div className="mt-1 flex-shrink-0 w-1 h-1 rounded-full bg-red-400 dark:bg-red-500" />
                      <div className="prose dark:prose-invert prose-sm max-w-none prose-p:my-0 prose-strong:text-slate-700 dark:prose-strong:text-slate-200">
                        <ReactMarkdown>{risk}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportData.home_remedies && reportData.home_remedies.length > 0 && (
              <div className="rounded-xl p-4 bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20">
                <h3 className="text-[13px] font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center space-x-2"><Leaf size={14} /><span>Traditional & Home Remedies</span></h3>
                <div className="space-y-2">
                  {reportData.home_remedies.map((remedy, i) => (
                    <div key={i} className="flex items-start space-x-2 text-[12px] text-slate-600 dark:text-slate-400">
                      <div className="mt-1 flex-shrink-0 w-1 h-1 rounded-full bg-emerald-400 dark:bg-emerald-500" />
                      <span>{remedy}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportData.action_plan && reportData.action_plan.length > 0 && (
              <div className="rounded-xl p-4 bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20">
                <h3 className="text-[13px] font-bold text-indigo-700 dark:text-indigo-400 mb-3 flex items-center space-x-2"><Calendar size={14} /><span>Future Action Plan</span></h3>
                <div className="space-y-2">
                  {reportData.action_plan.map((step, i) => (
                    <div key={i} className="flex items-start space-x-2 text-[12px] text-slate-600 dark:text-slate-400">
                      <div className="mt-1 flex-shrink-0 w-1 h-1 rounded-full bg-indigo-400 dark:bg-indigo-500" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reportData.parameters && reportData.parameters.some(p => p.status !== 'normal') && (
              <div className="rounded-xl p-4 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 shadow-sm">
                <h3 className="text-[13px] font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center space-x-2"><Building2 size={14} className="text-blue-500" /><span>Find Specialists Near You</span></h3>
                
                <div className="flex items-center space-x-2 mb-4">
                  <div className="relative flex-1">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Enter your city (e.g. Mumbai)" 
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchHospitals()}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                  <button 
                    onClick={fetchHospitals}
                    disabled={!location.trim() || hospitalsLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {hospitalsLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    <span>Search</span>
                  </button>
                </div>

                {hospitalError && (
                  <div className="p-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-500/20 mb-3">
                    {hospitalError}
                  </div>
                )}

                {hospitals.length > 0 && (
                  <div className="space-y-3">
                    {hospitals.map((h, i) => (
                      <div key={i} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-white/5 hover:border-blue-200 dark:hover:border-blue-500/30 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, ${h.city || location}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[13px] font-bold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors underline decoration-slate-200 dark:decoration-slate-700 hover:decoration-blue-400 dark:hover:decoration-blue-500 underline-offset-2"
                            title="View on Google Maps"
                          >
                            {h.name}
                          </a>
                          <div className="flex items-center space-x-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            <Star size={10} className="fill-current" />
                            <span>{(h.score_breakdown?.reputation * 5).toFixed(1) || '4.5'}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                          <span className="flex items-center"><MapPin size={10} className="mr-1" /> {h.score_breakdown?.distance_km} km away</span>
                          <span>•</span>
                          <span className="capitalize">{h.price_tier} Budget</span>
                          {h.nabh_accredited && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center"><CheckCircle2 size={10} className="mr-0.5" /> NABH</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed bg-white dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-white/5">
                          {h.why_this_hospital}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-center space-x-1.5 py-1 text-slate-400 dark:text-slate-500">
              <span className="text-[10px]">⚕️</span>
              <div className="text-[10px] prose dark:prose-invert prose-sm prose-p:my-0">
                <ReactMarkdown>{reportData.disclaimer || '*This is decision-support information, not medical advice. Always consult a qualified healthcare professional.*'}</ReactMarkdown>
              </div>
            </div>

            <button onClick={() => { setReportData(null); setError(null); setFileName(''); }}
              className="w-full py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-teal-50 dark:hover:bg-teal-900/30 border border-slate-200 dark:border-white/10 hover:border-teal-200 dark:hover:border-teal-500/50 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 transition-all font-semibold">
              Upload Another Report
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
