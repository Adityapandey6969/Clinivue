import React, { useEffect, useState } from 'react';
import { ShieldCheck, IndianRupee, MapPin, Building2, ChevronRight, Activity, AlertCircle } from 'lucide-react';
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
          fetch('http://localhost:8000/api/v1/providers/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              procedure: contextData.procedure,
              location: contextData.location,
              budget_inr: contextData.budget_inr
            })
          }),
          fetch('http://localhost:8000/api/v1/cost-estimate/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              procedure: contextData.procedure,
              city: contextData.location,
              age: contextData.age,
              comorbidities: contextData.comorbidities
            })
          })
        ]);

        const provData = await provRes.json();
        const costEstimate = await costRes.json();

        setProviders(provData.providers || []);
        setCostData(costEstimate);
      } catch (err) {
        console.error('Failed to fetch insights', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [contextData]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Activity className="w-8 h-8 animate-spin mb-4 text-teal-500" />
        <p>Crunching clinical pathways & cost data...</p>
      </div>
    );
  }

  if (!providers.length && !costData) {
    return null;
  }

  const formatINR = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6 text-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {costData && (
        <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/50 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center">
              <IndianRupee className="w-5 h-5 text-emerald-400 mr-2" />
              Cost Estimate
            </h3>
            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full border border-emerald-500/20 flex items-center font-medium">
              Target Scope
            </span>
          </div>
          
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm text-slate-400 mb-1">Total Expected Range</p>
            <p className="text-2xl font-bold text-emerald-300">
              {formatINR(costData.total_range_inr.min)} - {formatINR(costData.total_range_inr.max)}
            </p>
          </div>

          <div className="space-y-3">
            {costData.components.map((c: any, i: number) => (
              <div key={i} className="flex justify-between items-center text-sm border-b border-slate-700/50 pb-2 last:border-0 last:pb-0">
                <span className="text-slate-300">{c.name}</span>
                <span className="font-medium">{formatINR(c.min_inr)} - {formatINR(c.max_inr)}</span>
              </div>
            ))}
          </div>
          
          {costData.confidence.risk_flags?.length > 0 && (
            <div className="mt-4 p-3 bg-amber-500/10 rounded-lg flex items-start text-xs text-amber-200">
              <AlertCircle size={14} className="mt-0.5 mr-2 shrink-0 text-amber-400" />
              <p>Assumption: {costData.confidence.assumptions[0]}</p>
            </div>
          )}
        </div>
      )}

      {providers.length > 0 && (
        <div className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/50 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center">
              <Building2 className="w-5 h-5 text-teal-400 mr-2" />
              Top Providers
            </h3>
            <span className="text-xs text-slate-400 flex items-center bg-slate-800 px-2 py-1 rounded border border-slate-700">
              <MapPin size={12} className="mr-1" /> {providers[0].city}
            </span>
          </div>

          <div className="space-y-4">
            {providers.slice(0, 3).map((provider: any) => (
              <motion.div key={provider.hospital_id} whileHover={{ scale: 1.01 }} className="bg-slate-900/40 p-4 rounded-xl border border-slate-700/50 hover:border-teal-500/30 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-semibold text-slate-100 flex items-center">
                      {provider.name}
                      {provider.nabh_accredited && <ShieldCheck size={14} className="ml-2 text-blue-400" title="NABH Accredited" />}
                    </h4>
                    <div className="flex items-center space-x-2 text-xs text-slate-400 mt-1">
                      <span className="capitalize">{provider.price_tier} Tier</span>
                      <span>•</span>
                      <span>{provider.score_breakdown.distance_km.toFixed(1)} km away</span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400 font-bold border border-teal-500/20 group-hover:bg-teal-500/20 transition-colors">
                    #{provider.rank}
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mt-2 bg-slate-800 p-2 rounded-lg">
                  "{provider.why_this_hospital}"
                </p>
              </motion.div>
            ))}
          </div>
          
          <button className="w-full mt-4 flex items-center justify-center text-sm font-medium text-teal-400 hover:text-teal-300 py-2 transition-colors">
            View All {providers.length} Providers <ChevronRight size={16} className="ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}
