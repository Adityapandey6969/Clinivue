import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Loader2, CheckCircle2, AlertTriangle, XCircle, ArrowDown, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ReportParam = {
  name: string;
  value: number;
  unit: string;
  status: string;
  severity: string;
  reference_range: number[];
  explanation: string;
};

type ReportData = {
  report_id: string;
  status: string;
  parsed_at?: string;
  confidence?: number;
  parameters?: ReportParam[];
  summary?: string;
  recommendation?: string;
  disclaimer?: string;
  progress_pct?: number;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  high: { bg: 'bg-red-500/15', text: 'text-red-400', icon: <AlertTriangle size={14} /> },
  low: { bg: 'bg-amber-500/15', text: 'text-amber-400', icon: <ArrowDown size={14} /> },
  normal: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: <CheckCircle2 size={14} /> },
};

const SEVERITY_BADGE: Record<string, string> = {
  high: 'bg-red-500/20 text-red-300 border-red-500/30',
  moderate: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20',
  normal: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
};

export default function ReportUploader() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pollReport = useCallback(async (reportId: string) => {
    const maxAttempts = 30;
    let attempt = 0;

    const poll = async () => {
      attempt++;
      try {
        const res = await fetch(`http://localhost:8000/api/v1/report/${reportId}`);
        const data = await res.json();

        if (data.status === 'complete' || data.status === 'failed') {
          setReportData(data);
          setUploading(false);
          return;
        }

        setReportData(data);

        if (attempt < maxAttempts) {
          setTimeout(poll, 1000);
        } else {
          setError('Report processing timed out. Please try again.');
          setUploading(false);
        }
      } catch (err) {
        setError('Failed to check report status.');
        setUploading(false);
      }
    };

    poll();
  }, []);

  const handleUpload = async (file: File) => {
    setError(null);
    setReportData(null);
    setFileName(file.name);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/api/v1/report/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Upload failed');
      }

      const data = await res.json();
      setReportData({ report_id: data.report_id, status: 'processing', progress_pct: 5 });
      pollReport(data.report_id);
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = () => setDragActive(false);

  const confidenceColor = (score: number) => {
    if (score >= 0.85) return 'text-emerald-400';
    if (score >= 0.60) return 'text-amber-400';
    return 'text-red-400';
  };

  const confidenceBar = (score: number) => {
    if (score >= 0.85) return 'bg-emerald-500';
    if (score >= 0.60) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="flex flex-col h-full bg-slate-800/40 rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-800/60">
        <h2 className="text-lg font-semibold text-slate-100 flex items-center">
          <FileText className="w-5 h-5 text-teal-400 mr-3" />
          Lab Report Analyzer
        </h2>
        <p className="text-xs text-slate-400 mt-1">Upload a PDF or image of your medical report for AI-powered analysis</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Drop Zone */}
        {!reportData?.parameters && (
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${
              dragActive
                ? 'border-teal-400 bg-teal-500/10 scale-[1.02]'
                : 'border-slate-600 bg-slate-800/30 hover:border-teal-500/50 hover:bg-slate-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
            <div className="flex flex-col items-center space-y-4">
              <div className={`p-4 rounded-2xl transition-colors ${dragActive ? 'bg-teal-500/20' : 'bg-slate-700/50'}`}>
                <Upload className={`w-8 h-8 ${dragActive ? 'text-teal-400' : 'text-slate-400'}`} />
              </div>
              <div>
                <p className="text-slate-200 font-medium">
                  {dragActive ? 'Drop your report here' : 'Drag & drop your lab report'}
                </p>
                <p className="text-slate-500 text-sm mt-1">PDF, JPEG, PNG — up to 20 MB</p>
              </div>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        <AnimatePresence>
          {uploading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/50"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <Loader2 className="w-5 h-5 text-teal-400 animate-spin" />
                  <span className="text-sm font-medium text-slate-200">Analyzing {fileName}...</span>
                </div>
                <span className="text-xs text-slate-400">{reportData?.progress_pct || 0}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${reportData?.progress_pct || 5}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">Running OCR → parsing → reference comparison → flagging...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start space-x-3">
            <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-red-300 text-sm font-medium">Upload Error</p>
              <p className="text-red-400/80 text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {reportData?.status === 'complete' && reportData.parameters && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Confidence Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-medium text-slate-200">Analysis Complete</span>
              </div>
              {reportData.confidence !== undefined && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Confidence</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${confidenceBar(reportData.confidence)}`}
                        style={{ width: `${reportData.confidence * 100}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold ${confidenceColor(reportData.confidence)}`}>
                      {(reportData.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
            {reportData.summary && (
              <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50">
                <p className="text-sm text-slate-200 leading-relaxed">{reportData.summary}</p>
              </div>
            )}

            {/* Parameters Table */}
            <div className="bg-slate-800/60 rounded-2xl border border-slate-700/50 overflow-hidden">
              <div className="px-5 py-3 bg-slate-800/80 border-b border-slate-700/50">
                <h3 className="text-sm font-semibold text-slate-200">Extracted Parameters</h3>
              </div>
              <div className="divide-y divide-slate-700/30">
                {reportData.parameters.map((param, idx) => {
                  const statusStyle = STATUS_COLORS[param.status] || STATUS_COLORS.normal;
                  const severityStyle = SEVERITY_BADGE[param.severity] || SEVERITY_BADGE.normal;

                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className="px-5 py-4 hover:bg-slate-700/20 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-3">
                          <div className={`p-1.5 rounded-lg ${statusStyle.bg}`}>
                            <span className={statusStyle.text}>{statusStyle.icon}</span>
                          </div>
                          <span className="font-medium text-slate-100 text-sm">{param.name}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="text-slate-100 font-bold text-sm">
                            {param.value} <span className="text-slate-400 font-normal text-xs">{param.unit}</span>
                          </span>
                          <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${severityStyle}`}>
                            {param.severity}
                          </span>
                        </div>
                      </div>
                      <div className="ml-10">
                        <p className="text-xs text-slate-500 mb-1">
                          Ref: {param.reference_range[0]} – {param.reference_range[1]} {param.unit}
                        </p>
                        {param.status !== 'normal' && (
                          <p className="text-xs text-slate-400 bg-slate-800/60 rounded-lg p-2 mt-1 leading-relaxed">
                            {param.explanation}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Recommendation */}
            {reportData.recommendation && (
              <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 rounded-2xl p-5 border border-teal-500/20">
                <h3 className="text-sm font-semibold text-teal-400 mb-3 flex items-center">
                  <ShieldAlert size={16} className="mr-2" />
                  Safe Guidance
                </h3>
                <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                  {reportData.recommendation}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 flex items-start space-x-2">
              <ShieldAlert size={14} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-300/80 leading-relaxed">
                {reportData.disclaimer}
              </p>
            </div>

            {/* Upload Another */}
            <button
              onClick={() => {
                setReportData(null);
                setError(null);
                setFileName('');
              }}
              className="w-full py-3 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl text-sm text-slate-300 hover:text-teal-400 transition-colors font-medium"
            >
              Upload Another Report
            </button>
          </motion.div>
        )}

        {/* Failed */}
        {reportData?.status === 'failed' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-center">
            <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-red-300 font-medium">Analysis Failed</p>
            <p className="text-red-400/70 text-xs mt-1">{reportData.summary}</p>
            <button
              onClick={() => { setReportData(null); setError(null); }}
              className="mt-4 px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm text-slate-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
