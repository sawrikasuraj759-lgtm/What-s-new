import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Check,
  Clock,
  Copy,
  CreditCard,
  Crown,
  Eye,
  FileCheck2,
  Landmark,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { withAuthHeaders } from '../utils/authHeaders';
import { soundFX } from '../utils/sound';
import { ManualPaymentRequestItem } from '../types';

interface SubscriptionPurchaseViewProps {
  luxuryTheme?: boolean;
}

const DEFAULT_BANK = {
  bankName: 'NSB (National Savings Bank)',
  accountName: 'A.M.Y.N Alahakoon',
  accountNumber: '100156103618',
  branchName: 'eZ Cash: 074 386 5934',
  swiftOrCode: '',
  instructions:
    'NSB (100156103618 - A.M.Y.N Alahakoon) හෝ Dialog eZ Cash (074 386 5934) වෙත නිවැරදි මුදල ගෙවා Payment Reference අංකය සමඟ Receipt (Screenshot / Photo) එක Upload කරන්න.',
};

export const SubscriptionPurchaseView: React.FC<SubscriptionPurchaseViewProps> = ({
  luxuryTheme = false,
}) => {
  const {
    user,
    subscriptionSummary,
    subscriptionRequests,
    billingConfig,
    subscriptionNotifications,
    selectedSubscriptionTier,
    setSelectedSubscriptionTier,
    submitManualSubscriptionPayment,
    markSubscriptionNotificationRead,
    refreshSubscription,
    addToast,
  } = useApp();

  const checkoutFormRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedPackage, setSelectedPackage] = useState<'pro' | 'business'>(
    selectedSubscriptionTier || 'pro'
  );
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [receiptBase64, setReceiptBase64] = useState('');
  const [receiptFileName, setReceiptFileName] = useState('');
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedEzCash, setCopiedEzCash] = useState(false);

  // Authenticated Blob Receipt Modal
  const [viewingRequest, setViewingRequest] = useState<ManualPaymentRequestItem | null>(null);
  const [receiptBlobUrl, setReceiptBlobUrl] = useState<string | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptFetchError, setReceiptFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedSubscriptionTier === 'pro' || selectedSubscriptionTier === 'business') {
      setSelectedPackage(selectedSubscriptionTier);
    }
  }, [selectedSubscriptionTier]);

  useEffect(() => {
    return () => {
      if (receiptBlobUrl) {
        URL.revokeObjectURL(receiptBlobUrl);
      }
    };
  }, [receiptBlobUrl]);

  const prices = billingConfig?.packagePricesLkr || { mini: 0, pro: 500, business: 1000 };
  const bankDetails = billingConfig?.bankDetails || DEFAULT_BANK;
  const currentPlan = subscriptionSummary?.plan || user.plan || 'mini';
  const currentStatus = subscriptionSummary?.status || (currentPlan === 'mini' ? 'FREE' : 'ACTIVE');
  const daysRemaining = subscriptionSummary?.daysRemaining ?? 0;
  const unreadSubNotifs = subscriptionNotifications.filter((n) => !n.read);

  const selectedAmountLkr = selectedPackage === 'business' ? prices.business : prices.pro;

  const handleSelectPackage = (pkg: 'pro' | 'business') => {
    soundFX.playClick();
    setSelectedPackage(pkg);
    setSelectedSubscriptionTier(pkg);
    setSubmitError(null);
    setSubmitSuccess(null);
    checkoutFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const ezCashMatch = String(bankDetails.branchName || '').match(/0\d{2}[\s-]?\d{3}[\s-]?\d{4}/);
  const ezCashDisplay = ezCashMatch
    ? ezCashMatch[0]
    : !bankDetails.branchName || /ez\s*cash/i.test(bankDetails.branchName)
      ? '074 386 5934'
      : '';
  const ezCashRaw = ezCashDisplay.replace(/\D/g, '');

  const handleCopyAccount = () => {
    soundFX.playClick();
    navigator.clipboard.writeText(bankDetails.accountNumber || '');
    setCopiedAccount(true);
    addToast('Bank account number copied', 'success');
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleCopyEzCash = () => {
    if (!ezCashRaw) return;
    soundFX.playClick();
    navigator.clipboard.writeText(ezCashRaw);
    setCopiedEzCash(true);
    addToast('Dialog eZ Cash number copied', 'success');
    setTimeout(() => setCopiedEzCash(false), 2000);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReceiptError(null);
    setSubmitError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setReceiptError('Unsupported file type. Upload a PNG, JPG, or WEBP screenshot.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setReceiptError('Receipt image exceeds 5MB maximum file size.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setReceiptError('Could not read the selected image.');
        return;
      }
      setReceiptBase64(result);
      setReceiptFileName(file.name);
    };
    reader.onerror = () => {
      setReceiptError('Failed to read receipt image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!transactionReference.trim() || transactionReference.trim().length < 4) {
      setSubmitError('Enter a valid bank transfer transaction reference (at least 4 characters).');
      return;
    }
    if (!paymentDate) {
      setSubmitError('Select the payment date.');
      return;
    }
    if (!receiptBase64) {
      setSubmitError('Upload a screenshot of your bank transfer receipt.');
      return;
    }

    soundFX.playClick();
    setIsSubmitting(true);
    const res = await submitManualSubscriptionPayment({
      packageId: selectedPackage,
      transactionReference: transactionReference.trim(),
      paymentDate,
      receiptBase64,
      notes: notes.trim() || undefined,
    });
    setIsSubmitting(false);

    if (res.success) {
      soundFX.playSuccess();
      setSubmitSuccess(
        `Payment request submitted (${res.request?.orderRef || 'PENDING'}). An admin will verify your receipt before activating ${selectedPackage.toUpperCase()} for 30 days.`
      );
      setTransactionReference('');
      setNotes('');
      setReceiptBase64('');
      setReceiptFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } else {
      setSubmitError(res.message || 'Unable to submit payment request.');
    }
  };

  const handleOpenReceiptModal = async (req: ManualPaymentRequestItem) => {
    soundFX.playClick();
    if (receiptBlobUrl) {
      URL.revokeObjectURL(receiptBlobUrl);
      setReceiptBlobUrl(null);
    }
    setViewingRequest(req);
    setReceiptLoading(true);
    setReceiptFetchError(null);

    try {
      const res = await fetch(req.receiptUrl, {
        headers: withAuthHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Unable to load receipt image (${res.status})`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setReceiptBlobUrl(objUrl);
    } catch (err: any) {
      setReceiptFetchError(err?.message || 'Failed to load receipt screenshot.');
    } finally {
      setReceiptLoading(false);
    }
  };

  const closeReceiptModal = () => {
    if (receiptBlobUrl) {
      URL.revokeObjectURL(receiptBlobUrl);
      setReceiptBlobUrl(null);
    }
    setViewingRequest(null);
    setReceiptFetchError(null);
  };

  const handleManualRefresh = async () => {
    soundFX.playClick();
    setIsRefreshing(true);
    await refreshSubscription();
    setIsRefreshing(false);
  };

  // Surface styling depending on standalone dark vs Business luxury gold context
  const surfaceBg = luxuryTheme ? 'bg-[#0C0B0E]' : 'bg-[#060C18]';
  const subSurfaceBg = luxuryTheme ? 'bg-[#121016]' : 'bg-[#091224]';
  const borderHairline = luxuryTheme ? 'border-amber-500/25' : 'border-[#14253E]';
  const primaryAccentBtn = luxuryTheme
    ? 'bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] hover:from-[#E5C158] hover:to-[#FCD34D] text-[#050507]'
    : 'bg-gradient-to-r from-[#00F0FF] to-[#A855F7] hover:opacity-95 text-slate-950';

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-5 py-4 sm:py-6 space-y-6 pb-28">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="space-y-1">
          <h1
            className={`text-2xl sm:text-3xl font-bold tracking-tight ${
              luxuryTheme ? 'text-[#F6E3B4]' : 'text-white'
            }`}
            style={luxuryTheme ? { fontFamily: "'Cormorant Garamond', serif" } : undefined}
          >
            Monthly Subscription &amp; Bank Transfer
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Select PRO or BUSINESS, transfer the exact LKR monthly fee, and upload your receipt for manual verification.
          </p>
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className={`self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            luxuryTheme
              ? 'bg-[#141219] border-amber-500/30 text-amber-200 hover:bg-amber-500/10'
              : 'bg-[#091426] border-[#1A2D49] text-cyan-300 hover:border-cyan-400/50'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Active Subscription Status Banner & Countdown */}
      <div className={`rounded-2xl border p-5 ${surfaceBg} ${borderHairline} space-y-4`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Current Package</span>
              <span aria-hidden="true">·</span>
              <span
                className={`font-semibold ${
                  currentStatus === 'ACTIVE'
                    ? 'text-emerald-400'
                    : currentStatus === 'EXPIRED'
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {currentStatus}
              </span>
              {subscriptionSummary?.paymentReference && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">Ref: {subscriptionSummary.paymentReference}</span>
                </>
              )}
            </div>

            <div className="flex items-baseline gap-3">
              <h2 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-tight">
                YASHI HALLS {currentPlan}
              </h2>
              {currentPlan === 'mini' && (
                <span className="text-xs font-mono text-emerald-400">Free Forever</span>
              )}
            </div>

            {subscriptionSummary?.activatedAt && subscriptionSummary?.expiresAt && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
                <span>
                  Activated: {new Date(subscriptionSummary.activatedAt).toLocaleDateString()}
                </span>
                <span>
                  Expires: {new Date(subscriptionSummary.expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          {/* Days Remaining Counter */}
          <div className={`rounded-xl border px-5 py-3.5 ${subSurfaceBg} ${borderHairline} flex items-center gap-4 shrink-0`}>
            <Clock
              className={`w-5 h-5 shrink-0 ${
                currentPlan === 'mini'
                  ? 'text-slate-400'
                  : subscriptionSummary?.isExpiringSoon
                  ? 'text-amber-400'
                  : luxuryTheme
                  ? 'text-amber-300'
                  : 'text-cyan-400'
              }`}
            />
            <div>
              <div className="text-[11px] text-slate-400">Subscription Validity</div>
              <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-white">
                {currentPlan === 'mini'
                  ? 'Unlimited (Free)'
                  : `${daysRemaining} ${daysRemaining === 1 ? 'Day' : 'Days'} Left`}
              </div>
            </div>
          </div>
        </div>

        {/* Expiry or Renewal Reminder Warning */}
        {subscriptionSummary?.renewalReminderMessage && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>{subscriptionSummary.renewalReminderMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => handleSelectPackage(currentPlan === 'business' ? 'business' : 'pro')}
              className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              Renew Now
            </button>
          </div>
        )}

        {/* Unread Subscription Notifications */}
        {unreadSubNotifs.length > 0 && (
          <div className="space-y-2 pt-1">
            {unreadSubNotifs.map((n) => (
              <div
                key={n.id}
                className="rounded-xl border border-cyan-500/30 bg-[#081529] px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="font-semibold text-white">{n.title}: </span>
                  <span className="text-slate-300">{n.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => markSubscriptionNotificationRead(n.id)}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3-Tier Package Selection Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* MINI */}
        <div
          className={`rounded-2xl border p-5 flex flex-col justify-between space-y-5 ${surfaceBg} ${
            currentPlan === 'mini' ? 'border-emerald-500/50' : borderHairline
          }`}
        >
          <div className="space-y-3">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>Starter Workspace</span>
              <span className="font-mono">Free Forever</span>
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>MINI</span>
            </h3>
            <div className="text-2xl font-bold font-mono tabular-nums text-white">
              LKR 0 <span className="text-xs font-normal text-slate-400">/ month</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-300 pt-2 border-t border-white/10">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>1 WhatsApp Bot Slot</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>50 Media &amp; 100 AI Requests / Day</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Basic Dashboard &amp; Pairing Tools</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <Lock className="w-3.5 h-3.5 shrink-0" />
                <span>No Anti-Link / Anti-Spam Guard</span>
              </li>
            </ul>
          </div>

          <div className="py-2.5 px-4 rounded-xl border border-white/10 text-center text-xs font-semibold text-slate-400">
            {currentPlan === 'mini' ? 'Current Default Plan' : 'Fallback After Expiry'}
          </div>
        </div>

        {/* PRO */}
        <div
          className={`rounded-2xl border p-5 flex flex-col justify-between space-y-5 bg-[#070B19] ${
            selectedPackage === 'pro'
              ? 'border-[#00F0FF] shadow-[0_0_25px_rgba(0,240,255,0.16)]'
              : 'border-purple-500/35'
          }`}
        >
          <div className="space-y-3">
            <div className="text-xs text-cyan-300 flex items-center justify-between">
              <span>Pro Automation</span>
              <span className="font-mono">30-Day Access</span>
            </div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#00F0FF] shrink-0" />
              <span>PRO</span>
            </h3>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#00F0FF]">
              LKR {prices.pro.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">/ month</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-200 pt-2 border-t border-purple-500/25">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                <span>Dedicated Neon Cyan &amp; Purple Pro Dashboard</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                <span>5 Bot Slots &amp; 1,000 Media / 5,000 AI Daily</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                <span>Anti-Link Defense &amp; Anti-Spam Rate Limiter</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                <span>Auto Story Viewer &amp; Call Auto-Reply</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => handleSelectPackage('pro')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              selectedPackage === 'pro'
                ? 'bg-gradient-to-r from-[#00F0FF] to-[#A855F7] text-slate-950'
                : 'bg-[#0E1830] hover:bg-[#152445] text-cyan-300 border border-cyan-500/40'
            }`}
          >
            {currentPlan === 'pro'
              ? 'Renew PRO (LKR ' + prices.pro.toLocaleString() + ')'
              : selectedPackage === 'pro'
              ? 'Selected for Payment'
              : 'Select PRO Package'}
          </button>
        </div>

        {/* BUSINESS */}
        <div
          className={`rounded-2xl border p-5 flex flex-col justify-between space-y-5 bg-[#08070B] ${
            selectedPackage === 'business'
              ? 'border-[#D4AF37] shadow-[0_0_25px_rgba(212,175,55,0.18)]'
              : 'border-amber-500/30'
          }`}
        >
          <div className="space-y-3">
            <div className="text-xs text-amber-300/90 flex items-center justify-between">
              <span>Enterprise Suite</span>
              <span className="font-mono">30-Day Access</span>
            </div>
            <h3 className="text-lg font-bold text-[#F6E3B4] flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>BUSINESS</span>
            </h3>
            <div className="text-2xl font-bold font-mono tabular-nums text-[#FBBF24]">
              LKR {prices.business.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">/ month</span>
            </div>
            <ul className="space-y-2 text-xs text-slate-200 pt-2 border-t border-amber-500/20">
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>Exclusive Luxury Black &amp; Gold Business Dashboard</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>25 Bot Slots &amp; Unlimited Media / AI Quotas</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>Business Store, YASHI Pay APK &amp; Glory Bot Orders</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span>Independent Business Sidebar &amp; Operations Hub</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => handleSelectPackage('business')}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              selectedPackage === 'business'
                ? 'bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] text-[#050507]'
                : 'bg-[#16130B] hover:bg-[#221D10] text-amber-300 border border-amber-500/40'
            }`}
          >
            {currentPlan === 'business'
              ? 'Renew BUSINESS (LKR ' + prices.business.toLocaleString() + ')'
              : selectedPackage === 'business'
              ? 'Selected for Payment'
              : 'Select BUSINESS Package'}
          </button>
        </div>
      </div>

      {/* Bank Details + Receipt Upload Grid */}
      <div ref={checkoutFormRef} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Bank Account Details */}
        <div className={`lg:col-span-5 rounded-2xl border p-5 ${surfaceBg} ${borderHairline} space-y-4`}>
          <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
            <Landmark className={`w-5 h-5 ${luxuryTheme ? 'text-amber-400' : 'text-cyan-400'}`} />
            <div>
              <h3 className="text-base font-bold text-white">Bank Transfer Details</h3>
              <p className="text-xs text-slate-400">Transfer the exact LKR amount below</p>
            </div>
          </div>

          {/* Exact Amount Highlight */}
          <div
            className={`rounded-xl border p-4 ${
              selectedPackage === 'business'
                ? 'bg-[#141008] border-amber-500/40'
                : 'bg-[#08142B] border-cyan-500/40'
            }`}
          >
            <div className="text-xs text-slate-400">
              Amount Due for {selectedPackage.toUpperCase()} (30 Days)
            </div>
            <div
              className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                selectedPackage === 'business' ? 'text-amber-300' : 'text-[#00F0FF]'
              }`}
            >
              LKR {selectedAmountLkr.toLocaleString()}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-white/10 bg-[#050a14]">
            <img
              src="/assets/aistudio/IMG-20261128-WA0036_3f07aefc.jpg"
              alt="Dialog eZ Cash 074 386 5934 and NSB 100156103618 A.M.Y.N Alahakoon"
              className="w-full h-auto object-cover scale-[1.06]"
            />
          </div>

          <dl className="space-y-3 text-xs">
            <div className="flex items-center justify-between gap-2 py-2 border-b border-white/5">
              <dt className="text-slate-400">Bank Name</dt>
              <dd className="font-semibold text-white text-right">{bankDetails.bankName}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-2 border-b border-white/5">
              <dt className="text-slate-400">Account Holder</dt>
              <dd className="font-semibold text-white text-right">{bankDetails.accountName}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 py-2 border-b border-white/5">
              <dt className="text-slate-400">Account Number</dt>
              <dd className="flex items-center gap-2 font-mono font-bold text-white">
                <span>{bankDetails.accountNumber}</span>
                <button
                  type="button"
                  onClick={handleCopyAccount}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
                  title="Copy Account Number"
                >
                  {copiedAccount ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </dd>
            </div>
            {ezCashDisplay ? (
              <div className="flex items-center justify-between gap-2 py-2 border-b border-white/5">
                <dt className="text-slate-400">Dialog eZ Cash</dt>
                <dd className="flex items-center gap-2 font-mono font-bold text-amber-300">
                  <span>{ezCashDisplay}</span>
                  <button
                    type="button"
                    onClick={handleCopyEzCash}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
                    title="Copy eZ Cash Number"
                  >
                    {copiedEzCash ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </dd>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 py-2 border-b border-white/5">
                <dt className="text-slate-400">Branch / Wallet</dt>
                <dd className="font-semibold text-white text-right">{bankDetails.branchName}</dd>
              </div>
            )}
            {bankDetails.swiftOrCode && (
              <div className="flex items-center justify-between gap-2 py-2 border-b border-white/5">
                <dt className="text-slate-400">SWIFT / Bank Code</dt>
                <dd className="font-mono text-white text-right">{bankDetails.swiftOrCode}</dd>
              </div>
            )}
          </dl>

          {bankDetails.instructions && (
            <div className={`rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed ${subSurfaceBg}`}>
              {bankDetails.instructions}
            </div>
          )}
        </div>

        {/* Right: Manual Receipt Submission Form */}
        <form
          onSubmit={handleSubmitPayment}
          className={`lg:col-span-7 rounded-2xl border p-5 ${surfaceBg} ${borderHairline} space-y-4`}
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <CreditCard className={`w-5 h-5 ${luxuryTheme ? 'text-amber-400' : 'text-purple-400'}`} />
              <div>
                <h3 className="text-base font-bold text-white">Submit Payment Receipt</h3>
                <p className="text-xs text-slate-400">
                  Saved as PENDING until verified by an authorized admin
                </p>
              </div>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          </div>

          {submitError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-200 flex items-start gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{submitSuccess}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">Package</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPackage('pro')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    selectedPackage === 'pro'
                      ? 'border-[#00F0FF] bg-cyan-500/15 text-[#00F0FF]'
                      : 'border-white/10 bg-black/30 text-slate-400 hover:text-white'
                  }`}
                >
                  PRO · LKR {prices.pro.toLocaleString()}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPackage('business')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    selectedPackage === 'business'
                      ? 'border-[#D4AF37] bg-amber-500/15 text-amber-300'
                      : 'border-white/10 bg-black/30 text-slate-400 hover:text-white'
                  }`}
                >
                  BIZ · LKR {prices.business.toLocaleString()}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="paymentDate" className="text-xs font-semibold text-slate-300 block">
                Payment Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="paymentDate"
                  type="date"
                  value={paymentDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/40 pl-9 pr-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="transactionReference" className="text-xs font-semibold text-slate-300 block">
              Bank Transaction Reference / Receipt Number
            </label>
            <input
              id="transactionReference"
              type="text"
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
              placeholder="e.g. BOC-20261125-88412"
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Payment Receipt Screenshot (PNG, JPG, WEBP · Max 5MB)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleReceiptFileChange}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-dashed border-white/25 hover:border-cyan-400/60 bg-black/30 p-4 cursor-pointer transition-colors"
            >
              {receiptBase64 ? (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <img
                    src={receiptBase64}
                    alt="Receipt preview"
                    className="w-24 h-24 object-cover rounded-lg border border-white/15 shrink-0"
                  />
                  <div className="text-center sm:text-left space-y-1 min-w-0">
                    <div className="text-xs font-semibold text-emerald-400 truncate">
                      {receiptFileName || 'Receipt screenshot attached'}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Click to replace screenshot before submitting
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-3 text-center space-y-1.5">
                  <Upload className="w-6 h-6 text-slate-400" />
                  <div className="text-xs font-semibold text-white">
                    Upload Bank Transfer Receipt Screenshot
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Duplicate receipts and transaction references are automatically blocked
                  </div>
                </div>
              )}
            </div>
            {receiptError && <p className="text-xs text-rose-400">{receiptError}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="paymentNotes" className="text-xs font-semibold text-slate-300 block">
              Optional Note (Bank / Sender Name)
            </label>
            <input
              id="paymentNotes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note for admin verification"
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3 px-5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:opacity-60 ${primaryAccentBtn}`}
          >
            {isSubmitting
              ? 'Submitting Receipt...'
              : `Submit Payment Request · LKR ${selectedAmountLkr.toLocaleString()}`}
          </button>
        </form>
      </div>

      {/* My Payment Requests History */}
      <div className={`rounded-2xl border p-5 ${surfaceBg} ${borderHairline} space-y-4`}>
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h3 className="text-base font-bold text-white">My Payment Requests</h3>
            <p className="text-xs text-slate-400">
              Track verification status and 30-day activation dates
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">
            {subscriptionRequests.length} total
          </span>
        </div>

        {subscriptionRequests.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No bank transfer submissions yet. Select PRO or BUSINESS above to submit your first receipt.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-white/10">
                <tr>
                  <th className="py-2.5 pr-4 font-semibold">Order</th>
                  <th className="py-2.5 pr-4 font-semibold">Package</th>
                  <th className="py-2.5 pr-4 font-semibold">Amount</th>
                  <th className="py-2.5 pr-4 font-semibold">Reference</th>
                  <th className="py-2.5 pr-4 font-semibold">Payment Date</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 text-right font-semibold">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {subscriptionRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 font-mono text-white whitespace-nowrap">{req.orderRef}</td>
                    <td className="py-3 pr-4 font-semibold uppercase text-white whitespace-nowrap">
                      {req.packageId}
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums text-amber-300 whitespace-nowrap">
                      LKR {req.expectedAmountLkr.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-300">
                      <div>{req.transactionReference}</div>
                      {req.rejectionReason && (
                        <div className="text-[11px] text-rose-400 mt-0.5">
                          Reason: {req.rejectionReason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {req.paymentDate}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`font-mono font-bold ${
                          req.status === 'APPROVED'
                            ? 'text-emerald-400'
                            : req.status === 'REJECTED'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenReceiptModal(req)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:border-cyan-400/50 text-xs text-slate-200 hover:text-white cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Authenticated Receipt Modal */}
      {viewingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#080E1C] p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h4 className="text-sm font-bold text-white">
                  Receipt · {viewingRequest.orderRef}
                </h4>
                <p className="text-xs text-slate-400 font-mono">
                  Ref: {viewingRequest.transactionReference} · LKR{' '}
                  {viewingRequest.expectedAmountLkr.toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReceiptModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/50 p-3 min-h-[220px] flex items-center justify-center">
              {receiptLoading && (
                <div className="text-xs text-slate-400">Loading receipt image...</div>
              )}
              {!receiptLoading && receiptFetchError && (
                <div className="text-xs text-rose-400">{receiptFetchError}</div>
              )}
              {!receiptLoading && receiptBlobUrl && (
                <img
                  src={receiptBlobUrl}
                  alt={`Receipt ${viewingRequest.transactionReference}`}
                  className="max-h-[60vh] w-auto rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
