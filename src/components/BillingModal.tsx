import React from 'react';
import {
  X,
  Crown,
  Check,
  Bot,
  Lock,
  Building2,
  Landmark,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { APP_CONFIG } from '../data/initialData';
import { soundFX } from '../utils/sound';

export const BillingModal: React.FC = () => {
  const {
    openProModal,
    setOpenProModal,
    user,
    billingConfig,
    subscriptionSummary,
    navigateToSubscription,
  } = useApp();

  if (!openProModal) return null;

  const prices = billingConfig?.packagePricesLkr || { mini: 0, pro: 500, business: 1000 };
  const activePlan = subscriptionSummary?.plan || user.plan;

  const handleGoToSubscription = (tier: 'pro' | 'business') => {
    soundFX.playClick();
    setOpenProModal(false);
    navigateToSubscription(tier);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-4xl rounded-2xl bg-[#070E1D] border border-cyan-500/35 p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-cyan-500/40 bg-[#101A2E] shrink-0 p-1">
              <img
                src={APP_CONFIG.logoUrl}
                alt="YASHI HALLS Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                YASHI HALLS Monthly Packages
              </h3>
              <p className="text-xs text-slate-400">
                MINI is free forever · PRO and BUSINESS activate for 30 days after bank receipt approval
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              setOpenProModal(false);
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* MINI */}
          <div
            className={`p-5 rounded-2xl border ${
              activePlan === 'mini' ? 'border-emerald-500/60 bg-[#0D1725]' : 'border-white/10 bg-[#0A111D]'
            } flex flex-col justify-between space-y-4`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white flex items-center gap-1.5">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <span>MINI</span>
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">Free Forever</span>
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-white">LKR 0 / mo</div>
              <div className="space-y-2 text-xs text-slate-300 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>1 Bot Slot · Basic Dashboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>50 Media &amp; 100 AI / Day</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>No Anti-Link / Anti-Spam</span>
                </div>
              </div>
            </div>

            <div className="py-2.5 rounded-xl border border-white/10 text-center text-xs font-semibold text-slate-400">
              {activePlan === 'mini' ? 'Active Plan' : 'Free Default Tier'}
            </div>
          </div>

          {/* PRO */}
          <div
            className={`p-5 rounded-2xl border ${
              activePlan === 'pro'
                ? 'border-[#00F0FF] bg-[#0B172B]'
                : 'border-cyan-500/35 bg-[#0A1324]'
            } flex flex-col justify-between space-y-4`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-[#00F0FF]" />
                  <span>PRO</span>
                </span>
                <span className="text-xs font-mono font-bold text-cyan-300">30 Days</span>
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#00F0FF]">
                LKR {prices.pro.toLocaleString()} / mo
              </div>
              <div className="space-y-2 text-xs text-slate-200 pt-2 border-t border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Futuristic Neon Cyan &amp; Purple Dashboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>5 Bot Slots · 1,000 Media · 5,000 AI / Day</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Anti-Link Defense &amp; Anti-Spam Rate Guard</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleGoToSubscription('pro')}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#A855F7] text-slate-950 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>{activePlan === 'pro' ? 'Renew PRO' : 'Purchase via Bank Transfer'}</span>
            </button>
          </div>

          {/* BUSINESS */}
          <div
            className={`p-5 rounded-2xl border ${
              activePlan === 'business'
                ? 'border-[#D4AF37] bg-[#141008]'
                : 'border-amber-500/35 bg-[#0F0D09]'
            } flex flex-col justify-between space-y-4`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#F6E3B4] flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>BUSINESS</span>
                </span>
                <span className="text-xs font-mono font-bold text-amber-300">30 Days</span>
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-[#FBBF24]">
                LKR {prices.business.toLocaleString()} / mo
              </div>
              <div className="space-y-2 text-xs text-slate-200 pt-2 border-t border-amber-500/20">
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Luxury Black &amp; Gold Business Workspace</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>25 Bot Slots · Unlimited Quotas</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>Store, YASHI Pay APK &amp; Glory Auto-Orders</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleGoToSubscription('business')}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] text-[#050507] text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Landmark className="w-3.5 h-3.5" />
              <span>{activePlan === 'business' ? 'Renew BUSINESS' : 'Purchase via Bank Transfer'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
