import React, { useEffect, useState } from 'react';
import { ShieldCheck, IndianRupee, MapPin, Building2, AlertTriangle, Star } from 'lucide-react';
import { motion } from 'framer-motion';

export default function InsightsPanel({ contextData }: { contextData: any }) {
  const [providers, setProviders] = useState<any[]>([]);
  const [costData, setCostData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Clear old data when a new query comes in
    setProviders([]);
    setCostData(null);
    
    if (!contextData?.procedure || !contextData?.location) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [provRes, costRes] = await Promise.all([
          fetch('http://localhost:8000/api/v1/providers/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ procedure: contextData.procedure, location: contextData.location, budget_inr: contextData.budget_inr }) }),
          fetch('http://localhost:8000/api/v1/cost-estimate/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ procedure: contextData.procedure, city: contextData.location, age: contextData.age, comorbidities: contextData.comorbidities }) })
        ]);
        const provData = await provRes.json();
        const costEstimate = await costRes.json();
        setProviders(provData.providers || []);
        setCostData(costEstimate);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [contextData]);

  const formatINR = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-3">
        <div className="w-10 h-10 rounded-full border-3 border-teal-100 dark:border-teal-900/50 border-t-teal-500 dark:border-t-teal-400 animate-spin"></div>
        <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">Finding best options for you...</p>
      </div>
    );
  }

  if (contextData?.procedure && !contextData?.location && !providers.length && !costData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-4 border border-amber-100 dark:border-amber-500/20">
          <MapPin className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Where are you looking?</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[240px]">
          We found your query for <span className="font-semibold text-slate-600 dark:text-slate-300 capitalize">{contextData.procedure}</span>, but we need a city to estimate costs and find hospitals.
        </p>
        <div className="mt-4 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          💡 Try replying: "in Mumbai" or "in Delhi"
        </div>
      </div>
    );
  }

  // If we only have a condition but no procedure yet
  if (!contextData?.procedure && contextData?.condition && !providers.length && !costData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center mb-4 border border-teal-100 dark:border-teal-500/20">
          <ShieldCheck className="w-7 h-7 text-teal-500" />
        </div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">More Details Needed</h3>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[240px]">
          We see you're asking about <span className="font-semibold text-slate-600 dark:text-slate-300 capitalize">{contextData.condition}</span>. Please specify a treatment or procedure to estimate costs.
        </p>
        <div className="mt-4 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-white/5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          💡 Try replying with a specific treatment or surgery.
        </div>
      </div>
    );
  }

  if (!providers.length && !costData) return null;

  const tierStyle: Record<string, string> = {
    budget:  'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-500/20',
    mid:     'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20',
    premium: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20',
  };

  return (
    <div className="space-y-5 animate-slide-up">
      {/* ─── Cost Card ─── */}
      {costData && (
        <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900/40 dark:backdrop-blur-md">
          <div className="bg-gradient-to-r from-teal-50 dark:from-teal-900/20 to-emerald-50 dark:to-emerald-900/10 px-5 py-4 border-b border-teal-100/50 dark:border-teal-500/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-xl border border-teal-100 dark:border-white/10 shadow-sm">
                  <IndianRupee size={16} className="text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Estimated Cost</h3>
                  <p className="text-[11px] text-teal-700 dark:text-teal-400 capitalize">{contextData.procedure}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Confidence</p>
                <p className="text-sm font-bold text-teal-600 dark:text-teal-400">{((costData.confidence?.confidence_score || 0.74) * 100).toFixed(0)}%</p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="px-5 py-4 bg-white dark:bg-transparent border-b border-slate-50 dark:border-white/5">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold uppercase mb-1">Total Range</p>
            <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
              {formatINR(costData.total_range_inr.min)}
              <span className="text-slate-300 dark:text-slate-600 mx-2 font-normal">—</span>
              {formatINR(costData.total_range_inr.max)}
            </p>
          </div>

          {/* Breakdown */}
          <div className="divide-y divide-slate-50 dark:divide-white/5">
            {costData.components.map((c: any, i: number) => (
              <div key={i} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                <div className="flex items-center space-x-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 dark:bg-teal-500"></span>
                  <span className="text-[13px] text-slate-600 dark:text-slate-300">{c.name}</span>
                </div>
                <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{formatINR(c.min_inr)} – {formatINR(c.max_inr)}</span>
              </div>
            ))}
          </div>

          {costData.confidence?.assumptions?.length > 0 && (
            <div className="px-5 py-3 bg-amber-50/50 dark:bg-amber-500/10 border-t border-amber-100/50 dark:border-amber-500/10 flex items-start space-x-2">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">{costData.confidence.assumptions.join(' · ')}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Providers ─── */}
      {providers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                <Building2 size={16} className="text-indigo-500 dark:text-indigo-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Recommended Hospitals</h3>
            </div>
            <div className="flex items-center space-x-1 text-[11px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 rounded-full border border-slate-100 dark:border-white/5">
              <MapPin size={11} />
              <span>{providers[0]?.city}</span>
            </div>
          </div>

          <div className="space-y-3">
            {providers.slice(0, 3).map((p: any, i: number) => (
              <motion.div
                key={p.hospital_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-4 bg-white dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-white/5 hover:border-teal-200 dark:hover:border-teal-500/50 hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className="w-6 h-6 rounded-full bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 flex items-center justify-center text-[11px] font-bold text-teal-700 dark:text-teal-400">
                        {p.rank}
                      </span>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.city}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-bold text-slate-800 dark:text-slate-200 hover:text-teal-700 dark:hover:text-teal-400 transition-colors underline decoration-slate-200 dark:decoration-slate-700 hover:decoration-teal-400 dark:hover:decoration-teal-500 underline-offset-2 flex items-center"
                        onClick={(e) => e.stopPropagation()}
                        title="View on Google Maps"
                      >
                        {p.name}
                      </a>
                      {p.nabh_accredited && (
                        <span className="flex items-center space-x-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-500/10 rounded border border-blue-100 dark:border-blue-500/20">
                          <ShieldCheck size={10} className="text-blue-500 dark:text-blue-400" />
                          <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">NABH</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 dark:text-slate-500 ml-8">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${tierStyle[p.price_tier] || tierStyle.mid}`}>
                        {p.price_tier}
                      </span>
                      <span>📍 {p.score_breakdown.distance_km.toFixed(1)} km</span>
                    </div>
                  </div>
                  {/* Score */}
                  <div className="flex flex-col items-center">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-50 dark:from-teal-900/30 to-emerald-50 dark:to-emerald-900/20 border-2 border-teal-200 dark:border-teal-700/50 flex items-center justify-center">
                      <span className="text-[13px] font-extrabold text-teal-700 dark:text-teal-400">{(p.score * 100).toFixed(0)}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-medium">Score</span>
                  </div>
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2.5 ml-8 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg border border-slate-100 dark:border-white/5">
                  💬 {p.why_this_hospital}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
