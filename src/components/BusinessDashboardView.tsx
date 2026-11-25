import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Crown,
  KeyRound,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  Send,
  Settings,
  ShieldAlert,
  Smartphone,
  Store,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { withAuthHeaders } from '../utils/authHeaders';
import { sendPayApkToWhatsApp } from '../utils/apkDownload';
import { soundFX } from '../utils/sound';
import { BusinessBotView } from './BusinessBotView';
import { SubscriptionPurchaseView } from './SubscriptionPurchaseView';

type BusinessNavSection =
  | 'overview'
  | 'store'
  | 'auto-orders'
  | 'pay'
  | 'connect'
  | 'subscription';

interface BusinessOverviewMetrics {
  storeOrdersCount: number;
  storeRevenueLkr: number;
  connectedDevicesCount: number;
  pendingAutoOrders: number;
  businessBotOnline: boolean;
  businessBotNumber: string | null;
}

export const BusinessDashboardView: React.FC = () => {
  const {
    user,
    isAdmin,
    effectiveUserId,
    subscriptionSummary,
    setActiveTab,
    navigateToSubscription,
    logout,
    addToast,
  } = useApp();

  const [navSection, setNavSection] = useState<BusinessNavSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [metrics, setMetrics] = useState<BusinessOverviewMetrics>({
    storeOrdersCount: 0,
    storeRevenueLkr: 0,
    connectedDevicesCount: 0,
    pendingAutoOrders: 0,
    businessBotOnline: false,
    businessBotNumber: null,
  });
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [sendingApk, setSendingApk] = useState(false);
  const [sendingKey, setSendingKey] = useState(false);

  const businessBotUserId = `${effectiveUserId || 'primary'}__business`;
  const hasBusinessAccess = isAdmin || user.plan === 'business';
  const daysRemaining = subscriptionSummary?.daysRemaining ?? 0;

  const loadExecutiveMetrics = useCallback(async () => {
    if (!hasBusinessAccess) return;
    setLoadingMetrics(true);
    try {
      const headers = withAuthHeaders({
        'x-user-id': businessBotUserId,
      });

      const [storeRes, payRes, autoRes, statusRes] = await Promise.all([
        fetch('/api/business-store', { headers }).catch(() => null),
        fetch('/api/business/pay/status', { headers }).catch(() => null),
        fetch('/api/auto-orders/dashboard', { headers }).catch(() => null),
        fetch('/api/bot/status', { headers }).catch(() => null),
      ]);

      let storeOrdersCount = 0;
      let storeRevenueLkr = 0;
      if (storeRes && storeRes.ok) {
        const d = await storeRes.json();
        const orders = Array.isArray(d?.data?.orders) ? d.data.orders : [];
        storeOrdersCount = orders.length;
        storeRevenueLkr = orders
          .filter((o: any) => o.status === 'PAID' || o.status === 'DELIVERED')
          .reduce((sum: number, o: any) => sum + Number(o.totalLkr || o.amountLkr || 0), 0);
      }

      let connectedDevicesCount = 0;
      if (payRes && payRes.ok) {
        const d = await payRes.json();
        const devices = Array.isArray(d?.data?.devices) ? d.data.devices : [];
        connectedDevicesCount = devices.filter((dev: any) => dev.status !== 'revoked').length;
      }

      let pendingAutoOrders = 0;
      if (autoRes && autoRes.ok) {
        const d = await autoRes.json();
        const orders = Array.isArray(d?.data?.orders) ? d.data.orders : [];
        pendingAutoOrders = orders.filter(
          (o: any) => o.status === 'PENDING' || o.status === 'PROCESSING'
        ).length;
      }

      let businessBotOnline = false;
      let businessBotNumber: string | null = null;
      if (statusRes && statusRes.ok) {
        const d = await statusRes.json();
        businessBotOnline = Boolean(d?.data?.isOnline);
        businessBotNumber = d?.data?.pairedNumber || null;
      }

      setMetrics({
        storeOrdersCount,
        storeRevenueLkr,
        connectedDevicesCount,
        pendingAutoOrders,
        businessBotOnline,
        businessBotNumber,
      });
    } finally {
      setLoadingMetrics(false);
    }
  }, [hasBusinessAccess, businessBotUserId]);

  useEffect(() => {
    void loadExecutiveMetrics();
  }, [loadExecutiveMetrics]);

  const handleSendPayApk = async () => {
    if (sendingApk) return;
    soundFX.playClick();
    setSendingApk(true);
    try {
      const res = await sendPayApkToWhatsApp(businessBotUserId);
      addToast(res.message, res.success ? 'success' : 'error');
    } finally {
      setSendingApk(false);
    }
  };

  const handleSendPayKey = async () => {
    if (sendingKey) return;
    soundFX.playClick();
    setSendingKey(true);
    try {
      const res = await fetch('/api/business/pay/send-key-whatsapp', {
        method: 'POST',
        headers: withAuthHeaders({
          'Content-Type': 'application/json',
          'x-user-id': businessBotUserId,
        }),
        body: JSON.stringify({ userId: businessBotUserId }),
      });
      const data = await res.json();
      addToast(data.message || 'Pay key processed', data.success ? 'success' : 'error');
    } catch {
      addToast('Failed to send Pay Key to WhatsApp', 'error');
    } finally {
      setSendingKey(false);
    }
  };

  if (!hasBusinessAccess) {
    return (
      <div className="min-h-screen bg-[#050507] text-[#F5EFE6] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-[#D4AF37]/35 bg-[#0B0B10] p-6 text-center space-y-4">
          <Building2 className="w-10 h-10 text-[#D4AF37] mx-auto" />
          <h1
            className="text-2xl font-bold text-[#F6E3B4]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Business Suite Access Required
          </h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            This luxury Black &amp; Gold workspace unlocks exclusively after admin verification of a BUSINESS monthly subscription.
          </p>
          <button
            type="button"
            onClick={() => navigateToSubscription('business')}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] text-[#050507] font-bold text-xs uppercase tracking-wider cursor-pointer"
          >
            Purchase BUSINESS Subscription
          </button>
        </div>
      </div>
    );
  }

  const navItems: { id: BusinessNavSection; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Executive Overview', icon: LayoutDashboard },
    { id: 'store', label: 'Business Bot Store', icon: Store },
    { id: 'auto-orders', label: 'Glory Auto-Orders', icon: Zap },
    { id: 'pay', label: 'YASHI Pay APK', icon: Smartphone },
    { id: 'connect', label: 'Business WhatsApp', icon: LinkIcon },
    { id: 'subscription', label: 'Billing & Renewal', icon: CreditCard },
  ];

  const renderSidebar = () => (
    <div className="flex flex-col h-full w-64 bg-[#07070A] border-r border-[#D4AF37]/20 p-5 justify-between">
      <div className="space-y-6">
        {/* Luxury Brand Header */}
        <div className="pb-4 border-b border-[#D4AF37]/15">
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#D4AF37] font-semibold">
            Private Enterprise
          </div>
          <h2
            className="text-2xl font-bold text-[#F6E3B4] tracking-tight mt-0.5"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            YASHI HALLS
          </h2>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            BUSINESS · {daysRemaining > 0 ? `${daysRemaining}d left` : 'Active'}
          </div>
        </div>

        {/* Independent Business Navigation */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = navSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  soundFX.playClick();
                  setNavSection(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] text-[#050507] font-bold shadow-[0_6px_20px_rgba(212,175,55,0.25)]'
                    : 'text-slate-300 hover:text-[#F6E3B4] hover:bg-[#141218]'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#050507]' : 'text-[#D4AF37]'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Platform Links */}
      <div className="pt-4 border-t border-[#D4AF37]/15 space-y-1.5 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('deployments')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-400 hover:text-[#F6E3B4] hover:bg-[#141218] transition-colors text-left cursor-pointer"
        >
          <Crown className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
          <span>Main Bot &amp; Pairing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-400 hover:text-[#F6E3B4] hover:bg-[#141218] transition-colors text-left cursor-pointer"
        >
          <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Account Settings</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-amber-300 hover:bg-amber-500/10 transition-colors text-left font-semibold cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Admin Console</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => logout()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050507] text-[#F5EFE6] flex flex-col lg:flex-row">
      {/* Desktop Independent Gold Sidebar */}
      <aside className="hidden lg:block shrink-0 sticky top-0 h-screen">
        {renderSidebar()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />
          <div className="relative z-10 h-full">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#141218] text-amber-300"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebar()}
          </div>
        </div>
      )}

      {/* Main Business Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Independent Top Bar */}
        <header className="sticky top-0 z-30 bg-[#07070A]/95 backdrop-blur-md border-b border-[#D4AF37]/20 px-4 sm:px-7 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-[#D4AF37]/30 bg-[#111015] text-[#D4AF37] cursor-pointer"
              aria-label="Open business navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1
                className="text-xl sm:text-2xl font-bold text-[#F6E3B4] truncate"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                {navItems.find((i) => i.id === navSection)?.label || 'Executive Overview'}
              </h1>
              <div className="text-xs text-slate-400 truncate">
                {user.email} · Business Enterprise Workspace
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={loadExecutiveMetrics}
              disabled={loadingMetrics}
              className="px-3.5 py-2 rounded-xl border border-[#D4AF37]/30 bg-[#111015] hover:bg-[#19161D] text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
            <button
              type="button"
              onClick={() => setNavSection('subscription')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] text-[#050507] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {daysRemaining > 0 ? `${daysRemaining} Days Left` : 'Manage Plan'}
            </button>
          </div>
        </header>

        {/* Mobile Section Pills Bar */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto px-4 py-2.5 bg-[#09090D] border-b border-[#D4AF37]/15">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNavSection(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                navSection === item.id
                  ? 'bg-[#D4AF37] text-[#050507] font-bold'
                  : 'bg-[#121117] text-slate-300 border border-[#D4AF37]/15'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Section Body */}
        <div className="p-4 sm:p-7 flex-1">
          {navSection === 'overview' && (
            <div className="max-w-6xl mx-auto space-y-6">
              {subscriptionSummary?.isExpiringSoon && subscriptionSummary?.renewalReminderMessage && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{subscriptionSummary.renewalReminderMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNavSection('subscription')}
                    className="px-3.5 py-1.5 rounded-lg bg-[#D4AF37] text-[#050507] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Renew BUSINESS
                  </button>
                </div>
              )}

              {/* 4 Luxury Black & Gold KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#0B0B10] p-5 space-y-2">
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Business Revenue</span>
                    <Package className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[#FBBF24]">
                    LKR {metrics.storeRevenueLkr.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {metrics.storeOrdersCount} Store Orders
                  </div>
                </div>

                <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#0B0B10] p-5 space-y-2">
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Connected Pay Devices</span>
                    <Smartphone className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-white">
                    {metrics.connectedDevicesCount}
                  </div>
                  <div className="text-[11px] text-slate-400">YASHI HALLS Pay v2.0.0</div>
                </div>

                <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#0B0B10] p-5 space-y-2">
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Pending Auto-Orders</span>
                    <Zap className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-white">
                    {metrics.pendingAutoOrders}
                  </div>
                  <div className="text-[11px] text-slate-400">FFGlory Queue</div>
                </div>

                <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#0B0B10] p-5 space-y-2">
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Subscription Validity</span>
                    <Crown className="w-4 h-4 text-[#D4AF37]" />
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-[#F6E3B4]">
                    {daysRemaining > 0 ? `${daysRemaining} Days` : 'Active'}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {subscriptionSummary?.expiresAt
                      ? `Until ${new Date(subscriptionSummary.expiresAt).toLocaleDateString()}`
                      : 'Enterprise Tier'}
                  </div>
                </div>
              </div>

              {/* Business Bot Operations & Pay Quick Dispatch */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 rounded-2xl border border-[#D4AF37]/25 bg-[#0B0B10] p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3">
                    <div>
                      <h2
                        className="text-xl font-bold text-[#F6E3B4]"
                        style={{ fontFamily: "'Cormorant Garamond', serif" }}
                      >
                        Business Bot Command Desk
                      </h2>
                      <p className="text-xs text-slate-400">
                        {metrics.businessBotOnline
                          ? `Connected as +${metrics.businessBotNumber || 'Active'}`
                          : 'Connect your dedicated Business WhatsApp session'}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-mono font-bold ${
                        metrics.businessBotOnline ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {metrics.businessBotOnline ? 'ONLINE' : 'STANDBY'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNavSection('store')}
                      className="p-4 rounded-xl border border-[#D4AF37]/25 bg-[#121117] hover:border-[#D4AF37] text-left space-y-1 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-[#F6E3B4] flex items-center gap-2">
                        <Store className="w-4 h-4 text-[#D4AF37]" />
                        <span>Manage Bot Store</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Products, categories, bank accounts &amp; customer checkout
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNavSection('auto-orders')}
                      className="p-4 rounded-xl border border-[#D4AF37]/25 bg-[#121117] hover:border-[#D4AF37] text-left space-y-1 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-[#F6E3B4] flex items-center gap-2">
                        <Zap className="w-4 h-4 text-[#D4AF37]" />
                        <span>Glory Bot Auto-Orders</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Automated FFGlory fulfillment &amp; Pay bank matching
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNavSection('pay')}
                      className="p-4 rounded-xl border border-[#D4AF37]/25 bg-[#121117] hover:border-[#D4AF37] text-left space-y-1 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-[#F6E3B4] flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-[#D4AF37]" />
                        <span>YASHI HALLS Pay App</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Android SMS/notification listener, APK &amp; connection keys
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNavSection('connect')}
                      className="p-4 rounded-xl border border-[#D4AF37]/25 bg-[#121117] hover:border-[#D4AF37] text-left space-y-1 transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-[#F6E3B4] flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-[#D4AF37]" />
                        <span>Business WhatsApp Pairing</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Dedicated Business Baileys pairing code &amp; QR session
                      </p>
                    </button>
                  </div>
                </div>

                {/* Quick .payapk & .paykey Actions */}
                <div className="lg:col-span-5 rounded-2xl border border-[#D4AF37]/25 bg-[#0B0B10] p-6 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h2
                      className="text-xl font-bold text-[#F6E3B4]"
                      style={{ fontFamily: "'Cormorant Garamond', serif" }}
                    >
                      YASHI Pay Quick Dispatch
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Send the YASHI HALLS Pay Android APK or generate and deliver a fresh linking key straight to your Business WhatsApp chat.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      onClick={handleSendPayApk}
                      disabled={sendingApk}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FBBF24] text-[#050507] font-bold text-xs flex items-center justify-between cursor-pointer disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        <span>{sendingApk ? 'Sending APK...' : 'Send Pay APK to WhatsApp'}</span>
                      </span>
                      <span className="font-mono text-[11px]">.payapk</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSendPayKey}
                      disabled={sendingKey}
                      className="w-full py-3 px-4 rounded-xl border border-[#D4AF37]/40 bg-[#141218] hover:bg-[#1C1922] text-[#F6E3B4] font-bold text-xs flex items-center justify-between cursor-pointer disabled:opacity-60"
                    >
                      <span className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                        <span>{sendingKey ? 'Dispatching Key...' : 'Send Pay Key to WhatsApp'}</span>
                      </span>
                      <span className="font-mono text-[11px]">.paykey</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {navSection === 'store' && <BusinessBotView embedded initialSection="store" />}
          {navSection === 'auto-orders' && <BusinessBotView embedded initialSection="auto-orders" />}
          {navSection === 'pay' && <BusinessBotView embedded initialSection="pay" />}
          {navSection === 'connect' && <BusinessBotView embedded initialSection="connect" />}
          {navSection === 'subscription' && <SubscriptionPurchaseView luxuryTheme />}
        </div>
      </div>
    </div>
  );
};
