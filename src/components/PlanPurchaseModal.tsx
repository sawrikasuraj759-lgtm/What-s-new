import React from 'react';
import {
  X,
  Crown,
  Building2,
  Check,
  ArrowRight,
  ShieldCheck,
  Landmark,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { PLAN_PRICING } from '../data/initialData';
import { soundFX } from '../utils/sound';

export const PlanPurchaseModal: React.FC = () => {
  const {
    planToPurchase,
    setPlanToPurchase,
    billingConfig,
    navigateToSubscription,
  } = useApp();

  if (!planToPurchase) return null;

  const planInfo = PLAN_PRICING[planToPurchase];
  if (!planInfo) return null;

  const prices = billingConfig?.packagePricesLkr || { mini: 0, pro: 500, business: 1000 };
  const monthlyLkr =
    planToPurchase === 'business'
      ? prices.business
      : planToPurchase === 'pro'
      ? prices.pro
      : 0;

  const handleProceedToBankTransfer = () => {
    soundFX.playClick();
    const targetTier: 'pro' | 'business' = planToPurchase === 'business' ? 'business' : 'pro';
    setPlanToPurchase(null);
    navigateToSubscription(targetTier);
  };

  const handleClose = () => {
    soundFX.playClick();
    setPlanToPurchase(null);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className={`w-full max-w-lg rounded-2xl border p-5 sm:p-6 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto ${
            planToPurchase === 'business'
              ? 'bg-[#09080B] border-[#D4AF37]/50'
              : 'bg-[#060C18] border-cyan-500/40'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                  planToPurchase === 'business'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400'
                }`}
              >
                {planToPurchase === 'business' ? (
                  <Building2 className="w-5 h-5" />
                ) : (
                  <Crown className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  {planInfo.name} Monthly Subscription
                </h3>
                <p className="text-xs text-slate-400">
                  30-day activation upon admin receipt verification
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">Monthly Package Fee</div>
              <div
                className={`text-2xl font-bold font-mono tabular-nums mt-0.5 ${
                  planToPurchase === 'business' ? 'text-amber-300' : 'text-[#00F0FF]'
                }`}
              >
                LKR {monthlyLkr.toLocaleString()}
                <span className="text-xs font-normal text-slate-400"> / 30 days</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Admin Verified</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">Included Benefits</div>
            <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {planInfo.features.map((feat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs text-slate-300 p-2 rounded-xl bg-white/[0.03] border border-white/10"
                >
                  <Check
                    className={`w-3.5 h-3.5 shrink-0 ${
                      planToPurchase === 'business' ? 'text-amber-400' : 'text-cyan-400'
                    }`}
                  />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-1 flex flex-col gap-2.5">
            {planToPurchase !== 'mini' && (
              <button
                type="button"
                onClick={handleProceedToBankTransfer}
                className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  planToPurchase === 'business'
                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] text-[#050507]'
                    : 'bg-gradient-to-r from-[#00F0FF] to-[#A855F7] text-slate-950'
                }`}
              >
                <Landmark className="w-4 h-4" />
                <span>Proceed to Manual Bank Transfer (LKR {monthlyLkr.toLocaleString()})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="w-full py-2.5 text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
