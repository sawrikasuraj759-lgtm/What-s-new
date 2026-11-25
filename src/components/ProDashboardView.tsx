import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Clock,
  Crown,
  Gauge,
  LayoutGrid,
  Link as LinkIcon,
  Music,
  PhoneCall,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sliders,
  Square,
  Terminal,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { soundFX } from '../utils/sound';
import { CyberBotHologram } from './CyberBotHologram';
import { WhatsAppMenuInteractivePreview } from './WhatsAppMenuInteractivePreview';

export const ProDashboardView: React.FC = () => {
  const {
    bots,
    serverBotState,
    subscriptionSummary,
    billingConfig,
    restartBot,
    toggleBotState,
    stopBot,
    setOpenTerminalBot,
    setActiveTab,
    updateBotConfig,
    setOpenEditBotModal,
    navigateToSubscription,
  } = useApp();

  const isOnline = serverBotState?.isOnline ?? false;
  const maxSlots = 5;
  const runningCount = isOnline ? 1 : 0;
  const uptimeMinutes = Math.floor((serverBotState?.uptimeSeconds || 0) / 60);
  const uptimeSeconds = (serverBotState?.uptimeSeconds || 0) % 60;
  const uptimeDisplay = isOnline ? `${uptimeMinutes}m ${uptimeSeconds}s` : 'Offline';
  const latencyDisplay = isOnline ? `${serverBotState?.lastPingMs ?? 0} ms` : '—';

  const mediaUsed = serverBotState?.quotas?.mediaRequestsUsed || 0;
  const mediaMax = serverBotState?.quotas?.mediaQuotaMax || 1000;
  const aiUsed = serverBotState?.quotas?.aiRequestsUsed || 0;
  const aiMax = serverBotState?.quotas?.aiQuotaMax || 5000;
  const mediaPercent = Math.min(100, Math.round((mediaUsed / mediaMax) * 100));
  const aiPercent = Math.min(100, Math.round((aiUsed / aiMax) * 100));

  const daysRemaining = subscriptionSummary?.daysRemaining ?? 30;
  const bizPriceLkr = billingConfig?.packagePricesLkr?.business ?? 1000;

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-5 py-4 sm:py-6 space-y-5 pb-28">
      {/* PRO Expiry & Status Top Banner */}
      <div className="rounded-2xl border border-[#00F0FF]/35 bg-[#040611] p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-[0_0_30px_rgba(0,240,255,0.08)]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-300 font-mono tabular-nums">
            <Crown className="w-4 h-4 text-[#00F0FF]" />
            <span className="font-bold">PRO ACTIVE</span>
            <span aria-hidden="true">·</span>
            <span>{daysRemaining} DAYS LEFT</span>
            {subscriptionSummary?.expiresAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400">
                  Expires {new Date(subscriptionSummary.expiresAt).toLocaleDateString()}
                </span>
              </>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            YASHI HALLS <span className="text-[#00F0FF]">PRO</span>{' '}
            <span className="text-[#A855F7]">Command Workspace</span>
          </h1>
          <p className="text-xs text-slate-400">
            5 multi-session containers, Anti-Link defense, Anti-Spam rate guard, and expanded daily AI/media capacity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              navigateToSubscription('pro');
            }}
            className="px-4 py-2 rounded-xl border border-[#00F0FF]/40 bg-[#080F24] hover:bg-[#0D1A3A] text-cyan-300 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Manage / Renew PRO
          </button>
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              navigateToSubscription('business');
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#A855F7] text-slate-950 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Upgrade to BUSINESS · LKR {bizPriceLkr.toLocaleString()}
          </button>
        </div>
      </div>

      {subscriptionSummary?.isExpiringSoon && subscriptionSummary?.renewalReminderMessage && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{subscriptionSummary.renewalReminderMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => navigateToSubscription('pro')}
            className="px-3.5 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Renew PRO
          </button>
        </div>
      )}

      {/* Hero Status & Bot Controller */}
      <div className="rounded-2xl border border-purple-500/35 bg-gradient-to-br from-[#070B1E] via-[#050816] to-[#0B0922] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-3 max-w-xl">
          <div className="flex items-center gap-2 text-xs font-mono">
            <Activity className={`w-4 h-4 ${isOnline ? 'text-[#00F0FF]' : 'text-slate-400'}`} />
            <span className={isOnline ? 'text-[#00F0FF] font-bold' : 'text-slate-400 font-bold'}>
              {isOnline ? 'BOT ONLINE' : 'BOT OFFLINE'}
            </span>
            {isOnline && serverBotState?.pairedNumber && (
              <span className="text-slate-400">· +{serverBotState.pairedNumber}</span>
            )}
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">
            {isOnline
              ? `${serverBotState?.config.botName || 'YASHI HALLS PRO'} is running with Pro security automation enabled.`
              : 'Pair your WhatsApp device to start your 24/7 Pro container cluster.'}
          </p>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setActiveTab('deployments');
              }}
              className="px-4 py-2 rounded-xl bg-[#00F0FF] hover:bg-cyan-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>{isOnline ? 'Manage Pairing' : 'Pair WhatsApp'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setOpenEditBotModal(true);
              }}
              className="px-4 py-2 rounded-xl border border-purple-500/40 bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edit Bot &amp; Logo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                restartBot();
              }}
              className="px-3.5 py-2 rounded-xl border border-white/15 bg-[#0A1024] hover:bg-[#111B3A] text-cyan-300 text-xs font-mono font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                if (isOnline) stopBot();
                else toggleBotState();
              }}
              className={`px-3.5 py-2 rounded-xl border text-xs font-mono font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                isOnline
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                  : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {isOnline ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Stop' : 'Start'}</span>
            </button>
          </div>
        </div>

        <div className="self-center md:self-auto shrink-0">
          <CyberBotHologram size="sm" isOnline={isOnline} />
        </div>
      </div>

      {/* 4 Telemetry Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-[#19284A] bg-[#060B1A] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Container Status</span>
            <Bot className="w-4 h-4 text-[#00F0FF]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-white">
            {isOnline ? 'ONLINE' : 'STANDBY'}
          </div>
          <div className="text-[11px] text-cyan-300/80">24/7 Pro Cluster</div>
        </div>

        <div className="rounded-2xl border border-[#281C4D] bg-[#080A1C] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Bot Slots</span>
            <Zap className="w-4 h-4 text-[#A855F7]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-white">
            {runningCount} <span className="text-xs font-normal text-slate-400">/ {maxSlots}</span>
          </div>
          <div className="text-[11px] text-purple-300/80">Multi-session enabled</div>
        </div>

        <div className="rounded-2xl border border-[#19284A] bg-[#060B1A] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Worker Uptime</span>
            <Clock className="w-4 h-4 text-[#00F0FF]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-white">{uptimeDisplay}</div>
          <div className="text-[11px] text-slate-400">Current session</div>
        </div>

        <div className="rounded-2xl border border-[#281C4D] bg-[#080A1C] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Socket Latency</span>
            <Gauge className="w-4 h-4 text-[#A855F7]" />
          </div>
          <div className="text-xl font-bold font-mono tabular-nums text-white">{latencyDisplay}</div>
          <div className="text-[11px] text-slate-400">Gateway ping</div>
        </div>
      </div>

      {/* Pro Quotas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#19284A] bg-[#060B1A] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Music className="w-4 h-4 text-[#00F0FF]" />
              <span className="text-xs sm:text-sm font-bold text-white">Media Downloads Quota</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-cyan-300 font-bold">
              {mediaUsed.toLocaleString()} / {mediaMax.toLocaleString()}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#0C1530] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#00F0FF] to-[#3B82F6] rounded-full transition-all"
              style={{ width: `${mediaPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#281C4D] bg-[#080A1C] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Brain className="w-4 h-4 text-[#A855F7]" />
              <span className="text-xs sm:text-sm font-bold text-white">AI Queries Quota</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-purple-300 font-bold">
              {aiUsed.toLocaleString()} / {aiMax.toLocaleString()}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#130E2B] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#A855F7] to-[#EC4899] rounded-full transition-all"
              style={{ width: `${aiPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Full Pro Automation Controls */}
      <div className="rounded-2xl border border-purple-500/30 bg-[#060A18] p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#00F0FF]" />
            <h2 className="text-sm font-bold text-white">PRO Automation &amp; Defense Controls</h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Prefix: '{serverBotState?.config.prefix || '.'}'
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              updateBotConfig({
                mode: serverBotState?.config.mode === 'public' ? 'private' : 'public',
              });
            }}
            className="p-3 rounded-xl border border-[#1A2A4A] bg-[#091024] hover:border-cyan-400/50 text-left cursor-pointer"
          >
            <div className="text-[11px] text-slate-400">Operating Mode</div>
            <div className="text-xs font-bold text-cyan-300 capitalize mt-1">
              {serverBotState?.config.mode || 'Public'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              updateBotConfig({ antiLink: !serverBotState?.config.antiLink });
            }}
            className={`p-3 rounded-xl border text-left cursor-pointer ${
              serverBotState?.config.antiLink
                ? 'border-[#00F0FF]/50 bg-cyan-500/10 text-white'
                : 'border-[#1A2A4A] bg-[#091024] text-slate-300'
            }`}
          >
            <div className="text-[11px] text-slate-400">Anti-Link Defense</div>
            <div className="text-xs font-bold mt-1">
              {serverBotState?.config.antiLink ? 'Enabled' : 'Disabled'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              updateBotConfig({ antiSpam: !serverBotState?.config.antiSpam });
            }}
            className={`p-3 rounded-xl border text-left cursor-pointer ${
              serverBotState?.config.antiSpam
                ? 'border-[#A855F7]/50 bg-purple-500/10 text-white'
                : 'border-[#1A2A4A] bg-[#091024] text-slate-300'
            }`}
          >
            <div className="text-[11px] text-slate-400">Anti-Spam Guard</div>
            <div className="text-xs font-bold mt-1">
              {serverBotState?.config.antiSpam ? 'Enabled' : 'Disabled'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              updateBotConfig({ autoReadStatus: !serverBotState?.config.autoReadStatus });
            }}
            className={`p-3 rounded-xl border text-left cursor-pointer ${
              serverBotState?.config.autoReadStatus
                ? 'border-[#00F0FF]/50 bg-cyan-500/10 text-white'
                : 'border-[#1A2A4A] bg-[#091024] text-slate-300'
            }`}
          >
            <div className="text-[11px] text-slate-400">Auto Story Viewer</div>
            <div className="text-xs font-bold mt-1">
              {serverBotState?.config.autoReadStatus ? 'Active' : 'Off'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              soundFX.playClick();
              updateBotConfig({
                callDetectorEnabled: !(serverBotState?.config?.callDetectorEnabled ?? true),
              });
            }}
            className={`p-3 rounded-xl border text-left cursor-pointer ${
              serverBotState?.config?.callDetectorEnabled ?? true
                ? 'border-purple-500/50 bg-purple-500/10 text-white'
                : 'border-[#1A2A4A] bg-[#091024] text-slate-300'
            }`}
          >
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <PhoneCall className="w-3 h-3" />
              <span>Call Detector</span>
            </div>
            <div className="text-xs font-bold mt-1">
              {serverBotState?.config?.callDetectorEnabled ?? true ? 'Detector ON' : 'Detector OFF'}
            </div>
          </button>
        </div>

        {/* Navigation Links & Bot Logs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className="px-3 py-1.5 rounded-lg bg-[#0B142C] hover:bg-[#122044] border border-cyan-500/30 text-xs text-cyan-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>PRO Templates</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="px-3 py-1.5 rounded-lg bg-[#0B142C] hover:bg-[#122044] border border-purple-500/30 text-xs text-purple-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Voice &amp; Settings</span>
            </button>
          </div>

          {bots[0] && (
            <button
              type="button"
              onClick={() => {
                soundFX.playClick();
                setOpenTerminalBot(bots[0]);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#0B142C] border border-white/15 text-xs font-mono text-white inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span>Open Terminal Logs</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive WhatsApp Preview */}
      <WhatsAppMenuInteractivePreview />
    </div>
  );
};
