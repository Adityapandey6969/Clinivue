import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, XCircle, ArrowDown, ShieldAlert, Microscope, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveSearch } from '../lib/searchHistory';

type ReportParam = { name: string; value: number; unit: string; status: string; severity: string; reference_range: number[]; explanation: string; };
type ReportData = { report_id: string; status: string; parsed_at?: string; confidence?: number; parameters?: ReportParam[]; summary?: string; recommendation?: string; disclaimer?: string; progress_pct?: number; };

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

  const pollReport = useCallback(async (reportId: string) => {
    let attempt = 0;
    const poll = async () => {
      attempt++;
      try {
        const res = await fetch(`http://localhost:8000/api/v1/report/${reportId}`);
        const data = await res.json();
        if (data.status === 'complete' || data.status === 'failed') {
          setReportData(data);
          setUploading(false);
          if (data.status === 'complete') {
            saveSearch(userUid, 'report', fileName, { summary: data.summary, parameters: data.parameters?.length });
          }
          return;
        }
        setReportData(data);
        if (attempt < 30) setTimeout(poll, 1000); else { setError('Timed out.'); setUploading(false); }
      } catch { setError('Connection lost.'); setUploading(false); }
    };
    poll();
  }, []);

  const handleUpload = async (file: File) => {
    setError(null); setReportData(null); setFileName(file.name); setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('http://localhost:8000/api/v1/report/upload', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Upload failed'); }
      const data = await res.json();
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
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400">{reportData?.progress_pct || 0}%</span>
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
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-100 dark:border-white/5">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">📋 {reportData.summary}</p>
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
                  
                  // Make dynamic backgrounds slightly transparent in dark mode
                  const isDark = document.documentElement.classList.contains('dark');
                  const bgClass = isDark ? cfg.bg.replace('50', '500/10') : cfg.bg;
                  const sevClass = isDark ? sev.replace(/50 /g, '500/10 ').replace(/200/g, '500/20').replace(/700/g, '400') : sev;

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
                <h3 className="text-[13px] font-bold text-teal-700 dark:text-teal-400 mb-2 flex items-center space-x-2"><ShieldAlert size={14} /><span>Guidance</span></h3>
                <div className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">{reportData.recommendation}</div>
              </div>
            )}

            <p className="text-center text-[10px] text-slate-400 dark:text-slate-500 py-1">⚕️ {reportData.disclaimer}</p>

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
