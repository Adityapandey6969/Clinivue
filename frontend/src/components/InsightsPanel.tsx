import React, { useEffect, useState } from 'react';
import { ShieldCheck, IndianRupee, MapPin, Building2, AlertTriangle, Star } from 'lucide-react';
import { motion } from 'framer-motion';

export default function InsightsPanel({ contextData }: { contextData: any }) {
  const [providers, setProviders] = useState<any[]>([]);
  const [costData, setCostData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
        <div className="w-10 h-10 rounded-full border-3 border-teal-100 border-t-teal-500 animate-spin"></div>
        <p className="text-sm text-slate-400 font-medium">Finding best options for you...</p>
      </div>
    );
  }

  // If a procedure was found but no location was specified, ask for the location
  if (contextData?.procedure && !contextData?.location && !providers.length && !costData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8 animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4 border border-amber-100">
          <MapPin className="w-7 h-7 text-amber-500" />
        </div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">Where are you looking?</h3>
        <p className="text-xs text-slate-400 max-w-[240px]">
          We found your query for <span className="font-semibold text-slate-600 capitalize">{contextData.procedure}</span>, but we need a city to estimate costs and find hospitals.
        </p>
        <div className="mt-4 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100 text-[11px] text-slate-500 font-medium">
          💡 Try replying: "in Mumbai" or "in Delhi"
        </div>
      </div>
    );
  }

  if (!providers.length && !costData) return null;

  const tierStyle: Record<string, string> = {
    budget:  'bg-green-50 text-green-700 border-green-200',
    mid:     'bg-blue-50 text-blue-700 border-blue-200',
    premium: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  return (
    <div className="space-y-5 animate-slide-up">
      {/* ─── Cost Card ─── */}
      {costData && (
        <div className="rounded-2xl overflow-hidden border border-slate-100 bg-white">
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 px-5 py-4 border-b border-teal-100/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white rounded-xl border border-teal-100 shadow-sm">
                  <IndianRupee size={16} className="text-teal-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Estimated Cost</h3>
                  <p className="text-[11px] text-teal-700 capitalize">{contextData.procedure}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">Confidence</p>
                <p className="text-sm font-bold text-teal-600">{((costData.confidence?.confidence_score || 0.74) * 100).toFixed(0)}%</p>
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="px-5 py-4 bg-white border-b border-slate-50">
            <p className="text-[11px] text-slate-400 font-semibold uppercase mb-1">Total Range</p>
            <p className="text-xl font-extrabold text-slate-800">
              {formatINR(costData.total_range_inr.min)}
              <span className="text-slate-300 mx-2 font-normal">—</span>
              {formatINR(costData.total_range_inr.max)}
            </p>
          </div>

          {/* Breakdown */}
          <div className="divide-y divide-slate-50">
            {costData.components.map((c: any, i: number) => (
              <div key={i} className="px-5 py-2.5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center space-x-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
                  <span className="text-[13px] text-slate-600">{c.name}</span>
                </div>
                <span className="text-[13px] font-semibold text-slate-700">{formatINR(c.min_inr)} – {formatINR(c.max_inr)}</span>
              </div>
            ))}
          </div>

          {costData.confidence?.assumptions?.length > 0 && (
            <div className="px-5 py-3 bg-amber-50/50 border-t border-amber-100/50 flex items-start space-x-2">
              <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 leading-relaxed">{costData.confidence.assumptions.join(' · ')}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Providers ─── */}
      {providers.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100">
                <Building2 size={16} className="text-indigo-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Recommended Hospitals</h3>
            </div>
            <div className="flex items-center space-x-1 text-[11px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
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
                className="p-4 bg-white rounded-xl border border-slate-100 hover:border-teal-200 hover:shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1.5">
                      <span className="w-6 h-6 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-[11px] font-bold text-teal-700">
                        {p.rank}
                      </span>
                      <a 
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name}, ${p.city}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] font-bold text-slate-800 hover:text-teal-700 transition-colors underline decoration-slate-200 hover:decoration-teal-400 underline-offset-2 flex items-center"
                        onClick={(e) => e.stopPropagation()}
                        title="View on Google Maps"
                      >
                        {p.name}
                      </a>
                      {p.nabh_accredited && (
                        <span className="flex items-center space-x-1 px-1.5 py-0.5 bg-blue-50 rounded border border-blue-100">
                          <ShieldCheck size={10} className="text-blue-500" />
                          <span className="text-[9px] font-bold text-blue-600">NABH</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-400 ml-8">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold capitalize ${tierStyle[p.price_tier] || tierStyle.mid}`}>
                        {p.price_tier}
                      </span>
                      <span>📍 {p.score_breakdown.distance_km.toFixed(1)} km</span>
                    </div>
                  </div>
                  {/* Score */}
                  <div className="flex flex-col items-center">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-teal-50 to-emerald-50 border-2 border-teal-200 flex items-center justify-center">
                      <span className="text-[13px] font-extrabold text-teal-700">{(p.score * 100).toFixed(0)}</span>
                    </div>
                    <span className="text-[9px] text-slate-400 mt-1 font-medium">Score</span>
                  </div>
                </div>
                <p className="text-[12px] text-slate-500 mt-2.5 ml-8 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
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
