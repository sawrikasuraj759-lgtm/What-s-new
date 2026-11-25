import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  AppTab, 
  ThemeMode, 
  UserProfile, 
  Transaction, 
  CoinPack, 
  BotDeployment, 
  BotTemplate, 
  AppNotification, 
  ToastItem,
  PairingSession,
  ServerBotState,
  ServerBotLog,
  ServerBotConfig,
  PurchaseRequest,
  BillingConfigData,
  SubscriptionSummary,
  ManualPaymentRequestItem,
  SubscriptionNotificationItem
} from '../types';
import { 
  INITIAL_USER, 
  INITIAL_TRANSACTIONS, 
  INITIAL_NOTIFICATIONS,
  BOT_TEMPLATES 
} from '../data/initialData';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signInWithCredential,
  GoogleAuthProvider,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  OperationType,
  handleFirestoreError,
  FirebaseUser
} from '../firebase';
import { soundFX } from '../utils/sound';
import { getStoredSessionToken, setStoredSessionToken, withAuthHeaders } from '../utils/authHeaders';

interface AppContextType {
  // Auth Gate
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithGoogleCredential: (idToken: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<boolean>;
  signupWithEmail: (name: string, email: string, pass: string) => Promise<boolean>;
  logout: () => Promise<void>;

  // User Profile & Coins
  user: UserProfile;
  updateUser: (partial: Partial<UserProfile>) => void;
  coins: number;
  addCoins: (amount: number, reason: string, category?: Transaction['category']) => void;
  transactions: Transaction[];
  redeemPromoCode: (code: string) => { success: boolean; message: string };
  claimDailyCoins: () => { success: boolean; message: string };
  cooldownSeconds: number;
  isClaimReady: boolean;

  // Real WhatsApp Server Engine State
  serverBotState: ServerBotState | null;
  serverLogs: ServerBotLog[];
  isBackendConnected: boolean;
  refreshBotStatus: () => Promise<void>;
  startBot: (phone?: string) => Promise<{ success: boolean; message: string }>;
  stopBot: () => Promise<{ success: boolean; message: string }>;
  restartBot: (id?: string) => Promise<void>;
  toggleBotState: (id?: string) => Promise<void>;
  deleteBot: (id?: string) => Promise<void> | void;
  updateBotEnv: (id: string, env: Record<string, string>) => void;
  updateBotConfig: (config: Partial<ServerBotConfig>) => Promise<void>;
  clearSession: () => Promise<{ success: boolean; message: string }>;

  // WhatsApp Pairing State
  pairingSession: PairingSession | null;
  generatePairCode: (phone: string, customCode?: string) => Promise<{ success: boolean; code?: string; rawCode?: string; isCustom?: boolean; brandedCode?: string; message: string }>;
  generateQrCode: (forceNew?: boolean) => Promise<{ success: boolean; message: string }>;
  linkAndDeployPairedBot: (customName?: string) => Promise<{ success: boolean; message: string }>;
  deployBot: (template: BotTemplate, name: string, env: Record<string, string>) => Promise<{ success: boolean; message: string }>;

  // Bot Instances
  bots: BotDeployment[];
  botUnlockClaim: boolean;
  unlockBotClaim: () => void;

  // Navigation & Theme
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;

  // Modals
  openDeployModal: boolean;
  setOpenDeployModal: (open: boolean) => void;
  selectedTemplateForDeploy: BotTemplate | null;
  setSelectedTemplateForDeploy: (tpl: BotTemplate | null) => void;
  openCoinModal: boolean;
  setOpenCoinModal: (open: boolean) => void;
  selectedCoinPack: CoinPack | null;
  setSelectedCoinPack: (pack: CoinPack | null) => void;
  openTerminalBot: BotDeployment | null;
  setOpenTerminalBot: (bot: BotDeployment | null) => void;
  openSupportModal: boolean;
  setOpenSupportModal: (open: boolean) => void;
  openProModal: boolean;
  setOpenProModal: (open: boolean) => void;
  planToPurchase: 'mini' | 'pro' | 'business' | null;
  setPlanToPurchase: (plan: 'mini' | 'pro' | 'business' | null) => void;
  openInviteModal: boolean;
  setOpenInviteModal: (open: boolean) => void;
  openDeleteAccountModal: boolean;
  setOpenDeleteAccountModal: (open: boolean) => void;
  openEditBotModal: boolean;
  setOpenEditBotModal: (open: boolean) => void;

  // Notifications & Toasts
  notifications: AppNotification[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toasts: ToastItem[];
  addToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  removeToast: (id: string) => void;
  upgradeToPro: () => void;
  changePlan: (plan: 'mini' | 'pro' | 'business') => Promise<void>;
  purchasePlan: (plan: 'mini' | 'pro' | 'business') => Promise<{ success: boolean; message: string; needCoins?: boolean }>;
  syncBotProfilePic: (customLogoUrl?: string) => Promise<void>;
  resetQuotas: () => Promise<void>;
  resetAccountData: () => void;

  // Admin, Auth Token & Subscription State
  authToken: string;
  isAdmin: boolean;
  adminWhatsappNumber: string;
  userPurchaseRequests: PurchaseRequest[];
  subscriptionSummary: SubscriptionSummary | null;
  subscriptionRequests: ManualPaymentRequestItem[];
  billingConfig: BillingConfigData | null;
  subscriptionNotifications: SubscriptionNotificationItem[];
  selectedSubscriptionTier: 'pro' | 'business';
  setSelectedSubscriptionTier: (tier: 'pro' | 'business') => void;
  navigateToSubscription: (tier?: 'pro' | 'business') => void;
  refreshSubscription: () => Promise<void>;
  submitManualSubscriptionPayment: (payload: {
    packageId: 'pro' | 'business';
    transactionReference: string;
    paymentDate: string;
    receiptBase64: string;
    notes?: string;
  }) => Promise<{ success: boolean; message: string; request?: ManualPaymentRequestItem | null }>;
  markSubscriptionNotificationRead: (id: string) => Promise<void>;
  submitPurchaseRequest: (item: {
    itemType: 'plan' | 'coin_pack';
    itemName: string;
    planId?: 'pro' | 'business';
    coinAmount?: number;
    priceLkr: number;
    priceFormatted?: string;
  }) => Promise<{ success: boolean; request?: PurchaseRequest; message: string; whatsappUrl?: string }>;
  refreshUserPurchases: () => Promise<void>;
  effectiveUserId: string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const PROMO_CODES: Record<string, number> = {
  'YASHI-LAUNCH': 20,
  'HASHI-LAUNCH': 20,
  'YASHI-PRO': 25,
  'BONUS50': 50,
  'FREEBOT': 10,
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [currentFirebaseUser, setCurrentFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authToken, setAuthTokenState] = useState<string>(() => getStoredSessionToken());

  const setAuthToken = useCallback((token: string | null) => {
    const clean = token && token.trim() ? token.trim() : '';
    setStoredSessionToken(clean || null);
    setAuthTokenState(clean);
  }, []);

  const [user, setUser] = useState<UserProfile>(INITIAL_USER);
  const [coins, setCoins] = useState<number>(5);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [redeemedCodes, setRedeemedCodes] = useState<string[]>([]);
  const [botUnlockClaim, setBotUnlockClaim] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [subscriptionRequests, setSubscriptionRequests] = useState<ManualPaymentRequestItem[]>([]);
  const [billingConfig, setBillingConfig] = useState<BillingConfigData | null>(null);
  const [subscriptionNotifications, setSubscriptionNotifications] = useState<SubscriptionNotificationItem[]>([]);
  const [selectedSubscriptionTier, setSelectedSubscriptionTier] = useState<'pro' | 'business'>('pro');

  const navigateToSubscription = useCallback((tier?: 'pro' | 'business') => {
    if (tier === 'pro' || tier === 'business') {
      setSelectedSubscriptionTier(tier);
    }
    setActiveTab('subscription');
  }, []);

  // Compute effective user ID for multi-tenant bot sessions and storage
  const effectiveUserId = React.useMemo(() => {
    if (currentFirebaseUser?.uid) {
      return currentFirebaseUser.uid;
    }
    if (isAuthenticated && user?.email) {
      return `user_${user.email.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    }
    return 'guest';
  }, [currentFirebaseUser?.uid, isAuthenticated, user?.email]);

  const getBotHeaders = useCallback((extra: Record<string, string> = {}) => {
    return withAuthHeaders({
      'x-user-id': effectiveUserId,
      ...extra,
    });
  }, [effectiveUserId]);

  // Real Server Engine State (isolated per customer)
  const [serverBotState, setServerBotState] = useState<ServerBotState | null>(null);
  const [serverLogs, setServerLogs] = useState<ServerBotLog[]>([]);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);

  // Pairing Session State (isolated per customer)
  const [pairingSession, setPairingSession] = useState<PairingSession | null>(null);
  const wasOnlineRef = useRef<boolean>(false);

  // Cooldown timer - 24 hours (86400 seconds)
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('yashi_last_claim_timestamp');
      if (stored) {
        const last = parseInt(stored, 10);
        if (!isNaN(last) && last > 0) {
          const elapsed = Math.floor((Date.now() - last) / 1000);
          return Math.max(0, 86400 - elapsed);
        }
      }
    } catch {
      // fallback
    }
    return 0; // ready for the first daily claim!
  });

  // Real 1-second interval ticker for 24-hour daily coin cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  // Modals
  const [openDeployModal, setOpenDeployModal] = useState<boolean>(false);
  const [selectedTemplateForDeploy, setSelectedTemplateForDeploy] = useState<BotTemplate | null>(null);
  const [openCoinModal, setOpenCoinModal] = useState<boolean>(false);
  const [selectedCoinPack, setSelectedCoinPack] = useState<CoinPack | null>(null);
  const [openTerminalBot, setOpenTerminalBot] = useState<BotDeployment | null>(null);
  const [openSupportModal, setOpenSupportModal] = useState<boolean>(false);
  const [openProModal, setOpenProModal] = useState<boolean>(false);
  const [planToPurchase, setPlanToPurchase] = useState<'mini' | 'pro' | 'business' | null>(null);
  const [openInviteModal, setOpenInviteModal] = useState<boolean>(false);
  const [openDeleteAccountModal, setOpenDeleteAccountModal] = useState<boolean>(false);
  const [openEditBotModal, setOpenEditBotModal] = useState<boolean>(false);

  // Notifications & Toasts
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const confettiCannonRef = useRef<((opts?: any) => Promise<void> | void) | null>(null);

  const triggerConfetti = () => {
    try {
      const confettiMod: any = typeof confetti === 'function' ? confetti : (confetti as any)?.default || confetti;
      if (!confettiCannonRef.current && typeof confettiMod?.create === 'function') {
        confettiCannonRef.current = confettiMod.create(undefined as any, {
          resize: true,
          useWorker: false,
        });
      }
      const fire = confettiCannonRef.current || (typeof confettiMod === 'function' ? confettiMod : null);
      if (typeof fire === 'function') {
        Promise.resolve(
          fire({
            particleCount: 65,
            spread: 75,
            origin: { y: 0.6 },
            colors: ['#00d084', '#10b981', '#38bdf8', '#ffffff'],
            disableForReducedMotion: true,
          })
        ).catch(() => {});
      }
    } catch {
      // Safe guard against iframe/canvas errors
    }
  };

  // Subscription & Billing Fetchers
  const fetchPublicBillingConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions/config');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setBillingConfig(json.data);
        }
      }
    } catch {
      // ignore transient network errors
    }
  }, []);

  const applyServerSubscriptionToUser = useCallback((sub: SubscriptionSummary | null | undefined) => {
    if (!sub) return;
    setSubscriptionSummary(sub);
    const serverPlan: 'mini' | 'pro' | 'business' =
      sub.plan === 'business' ? 'business' : sub.plan === 'pro' ? 'pro' : 'mini';
    const slots = serverPlan === 'business' ? 25 : serverPlan === 'pro' ? 5 : 1;
    setUser((prev) => ({
      ...prev,
      plan: serverPlan,
      botSlotsTotal: slots,
      ownedPlans: serverPlan === 'mini' ? ['mini'] : ['mini', serverPlan],
    }));
  }, []);

  const refreshSubscription = useCallback(async () => {
    await fetchPublicBillingConfig();
    const token = authToken || getStoredSessionToken();
    if (!token) return;
    try {
      const res = await fetch('/api/subscriptions/me', {
        headers: withAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.billingConfig) {
            setBillingConfig(json.data.billingConfig);
          }
          if (Array.isArray(json.data.requests)) {
            setSubscriptionRequests(json.data.requests);
          }
          if (Array.isArray(json.data.notifications)) {
            setSubscriptionNotifications(json.data.notifications);
          }
          if (json.data.subscription) {
            applyServerSubscriptionToUser(json.data.subscription);
          }
        }
      }
    } catch {
      // ignore transient errors
    }
  }, [authToken, fetchPublicBillingConfig, applyServerSubscriptionToUser]);

  const establishBackendSession = useCallback(async (params: {
    idToken?: string;
    email?: string;
    username?: string;
    uid?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (json.success && json.token) {
        setAuthToken(json.token);
        if (json.subscription) {
          applyServerSubscriptionToUser(json.subscription);
        }
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }, [setAuthToken, applyServerSubscriptionToUser]);

  // Load public billing config on initial boot
  useEffect(() => {
    fetchPublicBillingConfig();
  }, [fetchPublicBillingConfig]);

  // Periodically refresh subscription & expiry state while authenticated
  useEffect(() => {
    if (!isAuthenticated || !authToken) return;
    refreshSubscription();
    const subInterval = setInterval(refreshSubscription, 30000);
    return () => clearInterval(subInterval);
  }, [isAuthenticated, authToken, refreshSubscription]);

  // Real Backend Status Polling - Isolated per Customer
  const refreshBotStatus = useCallback(async () => {
    const token = authToken || getStoredSessionToken();
    if (!isAuthenticated || !token) {
      setServerBotState(null);
      setServerLogs([]);
      return;
    }
    try {
      const res = await fetch('/api/bot/status', {
        headers: getBotHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setServerBotState(json.data);
          setIsBackendConnected(true);

          // Detect online transition
          if (json.data.isOnline && !wasOnlineRef.current) {
            wasOnlineRef.current = true;
            soundFX.playSuccess();
            triggerConfetti();
            addToast(`🎉 WhatsApp Connected Successfully! Bot is now active 24/7.`, 'success');
          } else if (!json.data.isOnline) {
            wasOnlineRef.current = false;
          }

          // Sync pairing session if backend generated code
          if (json.data.pairingCode) {
            setPairingSession((prev) => ({
              phoneNumber: json.data.pairedNumber || prev?.phoneNumber || '',
              pairCode: json.data.pairingCode,
              status: json.data.isOnline ? 'linked' : 'ready',
              generatedAt: prev?.generatedAt || Date.now(),
              expiresInSeconds: prev?.expiresInSeconds && prev.expiresInSeconds > 0 ? prev.expiresInSeconds : 120,
            }));
          } else if (json.data.isOnline) {
            setPairingSession((prev) => prev ? { ...prev, status: 'linked' } : null);
          }
        }
      } else {
        setIsBackendConnected(false);
      }
    } catch {
      setIsBackendConnected(false);
    }
  }, [isAuthenticated, authToken, getBotHeaders, addToast]);

  // Real Backend Logs Polling - Isolated per Customer
  const fetchLogs = useCallback(async () => {
    const token = authToken || getStoredSessionToken();
    if (!isAuthenticated || !token) {
      setServerLogs([]);
      return;
    }
    try {
      const res = await fetch('/api/bot/logs', {
        headers: getBotHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setServerLogs(json.data);
        }
      }
    } catch {
      // ignore
    }
  }, [isAuthenticated, authToken, getBotHeaders]);

  // Poll server state every 1.2s ONLY for authenticated user's bot once token is ready
  useEffect(() => {
    if (!isAuthenticated || !authToken) {
      if (!isAuthenticated) {
        setServerBotState(null);
        setServerLogs([]);
        setPairingSession(null);
        wasOnlineRef.current = false;
      }
      return;
    }
    let isCancelled = false;
    let inFlight = false;

    const runFastPulse = async () => {
      if (inFlight || isCancelled) return;
      inFlight = true;
      try {
        fetch('/api/keepalive', { method: 'GET', keepalive: true }).catch(() => {});
        await refreshBotStatus();
        await fetchLogs();
      } catch {} finally {
        inFlight = false;
      }
    };

    runFastPulse();
    const interval = setInterval(runFastPulse, 1200);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [isAuthenticated, authToken, refreshBotStatus, fetchLogs]);

  // Global lightweight background keepalive ping (runs on any page of website)
  useEffect(() => {
    const kaInterval = setInterval(() => {
      fetch('/api/keepalive', { method: 'GET', keepalive: true }).catch(() => {});
    }, 2500);
    return () => clearInterval(kaInterval);
  }, []);

  // Real Firebase Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsAuthLoading(false);
      if (fbUser) {
        setCurrentFirebaseUser(fbUser);
        setIsAuthenticated(true);

        const email = fbUser.email || '';
        const name = fbUser.displayName || email.split('@')[0] || 'User';
        const isGoogle = fbUser.providerData.some((p) => p.providerId === 'google.com');

        let idToken: string | undefined;
        try {
          idToken = await fbUser.getIdToken();
        } catch {}

        setUser({
          username: name,
          email,
          isVerified: fbUser.emailVerified || isGoogle,
          signInMethod: isGoogle ? 'GOOGLE' : 'EMAIL',
          plan: 'mini',
          ownedPlans: ['mini'],
          botSlotsUsed: 0,
          botSlotsTotal: 1,
          avatarLetter: name.charAt(0).toUpperCase(),
          emailNotifications: true,
          productUpdates: false,
        });

        await establishBackendSession({
          idToken,
          email,
          username: name,
          uid: fbUser.uid,
        });

        if (fbUser.emailVerified) {
          try {
            const userDocRef = doc(db, 'users', fbUser.uid);
            const snap = await getDoc(userDocRef);
            if (snap.exists()) {
              const data = snap.data();
              setUser((prev) => ({
                ...prev,
                username: data.username || name,
                email: data.email || email,
                avatarLetter: (data.username || name).charAt(0).toUpperCase(),
              }));
              if (typeof data.coins === 'number') {
                setCoins(data.coins);
              }
              if (typeof data.lastDailyClaim === 'number') {
                const elapsed = Math.floor((Date.now() - data.lastDailyClaim) / 1000);
                setCooldownSeconds(Math.max(0, 86400 - elapsed));
              }
            } else {
              const newUserProfile = {
                uid: fbUser.uid,
                username: name,
                email: email.toLowerCase(),
                plan: 'mini',
                coins: 5,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              };
              await setDoc(userDocRef, newUserProfile);
              setCoins(5);
            }
          } catch (err: any) {
            handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}`, true);
          }
        }
      } else {
        try {
          localStorage.removeItem('yashi_cached_session');
        } catch {}
        setAuthToken(null);
        setCurrentFirebaseUser(null);
        setIsAuthenticated(false);
        setUser(INITIAL_USER);
        setSubscriptionSummary(null);
        setSubscriptionRequests([]);
        setSubscriptionNotifications([]);
        setServerBotState(null);
        setServerLogs([]);
        setPairingSession(null);
        wasOnlineRef.current = false;
      }
    });

    return () => unsubscribe();
  }, [establishBackendSession, setAuthToken]);

  // Live Dynamic Custom CSS & Branding Injection from Admin Settings
  useEffect(() => {
    const applyLiveSiteDesign = async () => {
      try {
        const res = await fetch('/api/site-design');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const { primaryColor, secondaryColor, accentColor, backgroundColor, cardBackgroundColor, customCss } = json.data;
            let el = document.getElementById('yashi-admin-live-css') as HTMLStyleElement | null;
            if (!el) {
              el = document.createElement('style');
              el.id = 'yashi-admin-live-css';
              document.head.appendChild(el);
            }
            const rootVars = `
:root {
  --yashi-primary: ${primaryColor || '#00f0ff'};
  --yashi-secondary: ${secondaryColor || '#a855f7'};
  --yashi-accent: ${accentColor || '#3b82f6'};
  --yashi-bg: ${backgroundColor || '#020612'};
  --yashi-card-bg: ${cardBackgroundColor || '#060c18'};
}
`;
            el.textContent = `${rootVars}\n${customCss || ''}`;
          }
        }
      } catch (e) {
        // quiet ignore
      }
    };

    applyLiveSiteDesign();
    const handleUpdate = () => applyLiveSiteDesign();
    window.addEventListener('yashi-design-updated', handleUpdate);
    return () => window.removeEventListener('yashi-design-updated', handleUpdate);
  }, []);

  // Derived Real Bot Deployment based on Server Engine State
  const bots: BotDeployment[] = React.useMemo(() => {
    if (!serverBotState || serverBotState.connectionStatus === 'disconnected') {
      return [];
    }

    const logMessages = serverLogs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`);
    const uptimeStr = serverBotState.uptimeSeconds > 0
      ? `${Math.floor(serverBotState.uptimeSeconds / 60)}m ${serverBotState.uptimeSeconds % 60}s`
      : 'Starting...';

    const statusMap: Record<string, BotDeployment['status']> = {
      connected: 'running',
      connecting: 'deploying',
      reconnecting: 'rebuilding',
      qr_ready: 'deploying',
      pairing_code_ready: 'deploying',
      disconnected: 'stopped',
    };

    return [
      {
        id: 'bot-yashi-pro-instance',
        name: serverBotState.config.botName.toUpperCase().replace(/\s+/g, '-'),
        templateName: serverBotState.config.plan === 'pro' ? 'YASHI HALLS PRO WhatsApp Bot' : 'YASHI HALLS MINI WhatsApp Bot',
        platform: 'WhatsApp',
        status: statusMap[serverBotState.connectionStatus] || 'running',
        uptime: uptimeStr,
        cpu: serverBotState.isOnline ? 1.8 : 0.0,
        ramUsedMb: serverBotState.isOnline ? 142 : 45,
        ramMaxMb: serverBotState.config.plan === 'pro' || user.plan === 'pro' ? 2048 : 512,
        port: 3001,
        region: 'ap-southeast-1 (Colombo/Singapore)',
        env: {
          SESSION_ID: serverBotState.pairedNumber ? `YASHI~${serverBotState.pairedNumber}` : '',
          PREFIX: serverBotState.config.prefix,
          OWNER_NUMBER: serverBotState.config.ownerNumber,
          MODE: serverBotState.config.mode,
          AUTO_READ_STATUS: String(serverBotState.config.autoReadStatus),
          BOT_NAME: serverBotState.config.botName,
        },
        logs: logMessages.length > 0 ? logMessages : ['[SYSTEM] Bot engine active. Awaiting logs...'],
      },
    ];
  }, [serverBotState, serverLogs, user.plan]);

  // Actions connecting directly to Node.js Baileys Backend (Tenant Isolated)
  const startBot = async (phone?: string): Promise<{ success: boolean; message: string }> => {
    try {
      addToast('Starting WhatsApp Bot Engine...', 'info');
      const res = await fetch('/api/bot/start', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ phoneNumber: phone, userId: effectiveUserId }),
      });
      const data = await res.json();
      await refreshBotStatus();
      if (data.success) {
        addToast(data.message || 'Bot engine started', 'success');
      } else {
        addToast(data.message || 'Failed to start bot', 'error');
      }
      return data;
    } catch (err: any) {
      addToast(err?.message || 'Error communicating with backend', 'error');
      return { success: false, message: err?.message || 'Server error' };
    }
  };

  const stopBot = async (): Promise<{ success: boolean; message: string }> => {
    try {
      addToast('Stopping WhatsApp Bot Engine...', 'info');
      const res = await fetch('/api/bot/stop', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId: effectiveUserId }),
      });
      const data = await res.json();
      await refreshBotStatus();
      addToast(data.message || 'Bot stopped', 'info');
      return data;
    } catch (err: any) {
      addToast(err?.message || 'Failed to stop bot', 'error');
      return { success: false, message: err?.message || 'Server error' };
    }
  };

  const restartBot = async (id?: string) => {
    try {
      addToast('Restarting WhatsApp Bot Engine...', 'info');
      soundFX.playClick();
      const res = await fetch('/api/bot/restart', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId: effectiveUserId }),
      });
      const data = await res.json();
      await refreshBotStatus();
      if (data.success) {
        soundFX.playSuccess();
        addToast('Bot restarted and reconnected successfully!', 'success');
      } else {
        addToast(data.message || 'Restart error', 'error');
      }
    } catch (err: any) {
      addToast(err?.message || 'Restart failed', 'error');
    }
  };

  const toggleBotState = async (id?: string) => {
    soundFX.playClick();
    if (serverBotState && serverBotState.connectionStatus !== 'disconnected') {
      await stopBot();
    } else {
      await startBot();
    }
  };

  const deleteBot = async (id?: string) => {
    soundFX.playClick();
    addToast('Stopping and deleting bot container...', 'info');
    await stopBot();
    await clearSession();
    setPairingSession(null);
    await refreshBotStatus();
    addToast('Bot deployment completely removed and deleted.', 'success');
  };

  const updateBotEnv = (id: string, env: Record<string, string>) => {
    updateBotConfig({
      prefix: env.PREFIX,
      ownerNumber: env.OWNER_NUMBER,
      botName: env.BOT_NAME,
      mode: (env.MODE as 'public' | 'private') || 'public',
    });
  };

  const updateBotConfig = async (newConfig: Partial<ServerBotConfig>) => {
    try {
      const res = await fetch('/api/bot/config', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...newConfig, userId: effectiveUserId }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('Bot configuration updated and applied live.', 'success');
        await refreshBotStatus();
      }
    } catch (err: any) {
      addToast('Failed to update bot config', 'error');
    }
  };

  const clearSession = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/bot/clear-session', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId: effectiveUserId }),
      });
      const data = await res.json();
      setPairingSession(null);
      await refreshBotStatus();
      addToast('WhatsApp session cleared. Ready for fresh pairing.', 'info');
      return data;
    } catch (err: any) {
      return { success: false, message: err?.message || 'Error' };
    }
  };

  // Real Phone Pairing Code Generator
  const generatePairCode = async (
    phone: string,
    customCode?: string
  ): Promise<{ success: boolean; code?: string; rawCode?: string; isCustom?: boolean; brandedCode?: string; message: string }> => {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0') && cleanPhone.length === 10) {
      cleanPhone = '94' + cleanPhone.slice(1);
    }
    if (cleanPhone.length < 8) {
      addToast('Please enter a valid WhatsApp number (e.g. 0740712934 or 94740712934)', 'error');
      return { success: false, message: 'Invalid phone number format' };
    }

    setPairingSession({
      phoneNumber: cleanPhone,
      pairCode: '',
      status: 'generating',
      generatedAt: Date.now(),
      expiresInSeconds: 120,
    });
    setServerBotState((prev: any) =>
      prev ? { ...prev, pairingCode: null, connectionStatus: 'connecting' } : null
    );

    try {
      const payload: Record<string, any> = {
        phoneNumber: cleanPhone,
        userId: effectiveUserId,
      };
      if (customCode && typeof customCode === 'string') {
        payload.customCode = customCode;
      }

      const res = await fetch('/api/bot/pair/code', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {}
      }

      // If code was returned directly
      if (data && data.success && data.code) {
        setPairingSession({
          phoneNumber: cleanPhone,
          pairCode: data.code,
          status: 'ready',
          generatedAt: Date.now(),
          expiresInSeconds: 120,
        });
        setServerBotState((prev: any) =>
          prev
            ? { ...prev, pairingCode: data.code, connectionStatus: 'pairing_code_ready' }
            : ({ pairingCode: data.code, connectionStatus: 'pairing_code_ready' } as any)
        );
        soundFX.playSuccess();
        triggerConfetti();
        addToast(`👑 WhatsApp Pairing Code ready: ${data.code}`, 'success');
        return data;
      }

      // Fast polling fallback in case socket handshake took 1-2 seconds
      addToast('Connecting to WhatsApp gateway...', 'info');
      let foundCode = false;
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 800));
        try {
          const statusRes = await fetch('/api/bot/status', {
            headers: getBotHeaders(),
          });
          if (statusRes.ok) {
            const statusJson = await statusRes.json();
            if (statusJson.success && statusJson.data?.pairingCode) {
              const code = statusJson.data.pairingCode;
              setPairingSession({
                phoneNumber: cleanPhone,
                pairCode: code,
                status: 'ready',
                generatedAt: Date.now(),
                expiresInSeconds: 120,
              });
              setServerBotState(statusJson.data);
              soundFX.playSuccess();
              triggerConfetti();
              addToast(`👑 WhatsApp Pairing Code ready: ${code}`, 'success');
              foundCode = true;
              return { success: true, code, rawCode: code.replace(/-/g, ''), message: 'Pairing code ready.' };
            }
          }
        } catch {}
      }

      if (!foundCode) {
        setPairingSession(null);
        addToast('කෝඩ් එක ලබාගැනීමට නොහැකි විය. කරුණාකර නැවත "Generate Pairing Code" ඔබන්න.', 'error');
        return { success: false, message: 'Timed out' };
      }
      return { success: true, message: 'Done' };
    } catch (err: any) {
      console.warn('Pairing error:', err);
      await refreshBotStatus();
      addToast(err?.message || 'Pairing error occurred. Please try again.', 'error');
      return { success: false, message: err?.message || 'Please try again' };
    }
  };

  // Real QR Code Generator
  const generateQrCode = useCallback(async (forceNew = false): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch("/api/bot/pair/qr", {
        method: "POST",
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId: effectiveUserId, forceNew }),
      });
      let data: any = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {}
      }
      if (data && data.success && data.qr) {
        setServerBotState((prev: any) => prev ? { ...prev, qrCodeDataUrl: data.qr, connectionStatus: 'qr_ready' } : ({ qrCodeDataUrl: data.qr, connectionStatus: 'qr_ready' } as any));
        soundFX.playSuccess();
        return { success: true, message: 'QR Code ready.' };
      }
      await refreshBotStatus();
      // Poll fallback for QR code image
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 600));
        const statusRes = await fetch('/api/bot/status', {
          headers: getBotHeaders(),
        });
        if (statusRes.ok) {
          const sJson = await statusRes.json();
          if (sJson.data?.qrCodeDataUrl) {
            setServerBotState(sJson.data);
            break;
          }
        }
      }
      return data || { success: true, message: 'QR Code requested' };
    } catch (err: any) {
      await refreshBotStatus();
      return { success: false, message: "Network error" };
    }
  }, [getBotHeaders, effectiveUserId, refreshBotStatus]);

  const linkAndDeployPairedBot = async (customName?: string): Promise<{ success: boolean; message: string }> => {
    soundFX.playClick();
    addToast('Deploying YASHI HALLS PRO 24/7 container...', 'info');
    const res = await startBot(pairingSession?.phoneNumber);
    if (res.success) {
      soundFX.playSuccess();
      triggerConfetti();
      addToast('YASHI HALLS PRO container launched successfully!', 'success');
      setActiveTab('deployments');
    }
    return res;
  };

  const deployBot = async (template: BotTemplate, name: string, env: Record<string, string>) => {
    const isProTemplate = template.id.includes('pro');
    if (isProTemplate && user.plan === 'mini' && coins < template.costCoins) {
      return { 
        success: false, 
        message: `Insufficient coins. Deploying ${template.name} requires ${template.costCoins} coins, you have ${coins}.` 
      };
    }

    // Deduct coins if required
    if (template.costCoins > 0) {
      setCoins((prev) => Math.max(0, prev - template.costCoins));
      const now = new Date();
      const timeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      setTransactions((prev) => [
        {
          id: `tx-${Date.now()}`,
          title: `Deploy ${name}`,
          date: timeStr,
          amount: -template.costCoins,
          category: 'deploy',
        },
        ...prev,
      ]);
    }

    // Switch engine to match deployed template tier
    const targetPlan: 'mini' | 'pro' = isProTemplate ? 'pro' : 'mini';
    await changePlan(targetPlan);

    const startRes = await startBot(env.OWNER_NUMBER || pairingSession?.phoneNumber);
    if (startRes.success) {
      triggerConfetti();
      addToast(`Bot ${name} (${targetPlan.toUpperCase()}) deployed successfully to 24/7 cluster!`, 'success');
    }
    return startRes;
  };

  // Cooldown countdown
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Pairing session countdown
  useEffect(() => {
    if (!pairingSession || pairingSession.status !== 'ready' || pairingSession.expiresInSeconds <= 0) return;
    const interval = setInterval(() => {
      setPairingSession((prev) => {
        if (!prev) return null;
        if (prev.expiresInSeconds <= 1) {
          return { ...prev, expiresInSeconds: 0, status: 'idle' };
        }
        return { ...prev, expiresInSeconds: prev.expiresInSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingSession]);

  // Sync Theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-mode');
      root.classList.remove('dark');
    } else {
      root.classList.remove('light-mode');
      root.classList.add('dark');
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    addToast(`Theme switched to ${newTheme}`, 'info');
  };

  // Auth Methods (Real Google & Email/Password Authentication Only)
  const loginWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      addToast(`Signed in with Google as ${fbUser.displayName || fbUser.email}!`, 'success');
      soundFX.playSuccess();
      triggerConfetti();
    } catch (err: unknown) {
      console.warn('Google Sign-in status:', (err as { code?: string })?.code || err);
      const code = (err as { code?: string })?.code || '';
      const msg = (err as { message?: string })?.message || '';
      if (code === 'auth/popup-blocked') {
        addToast('Google login popup was blocked by browser. Please allow popups.', 'error');
      } else if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') {
        addToast('Google Sign-In was closed before completion.', 'info');
      } else if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        addToast('Google Sign-In domain is not yet authorized in Firebase Console.', 'error');
      } else {
        addToast(msg || 'Google Sign-In failed. Please try again.', 'error');
      }
      throw err;
    }
  };

  const loginWithGoogleCredential = async (idToken: string) => {
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      const fbUser = result.user;
      addToast(`Signed in with Google as ${fbUser.displayName || fbUser.email}!`, 'success');
      soundFX.playSuccess();
      triggerConfetti();
    } catch (err: unknown) {
      console.error('Google Sign-in Credential Error:', err);
      addToast('Google Sign-In failed. Please try again.', 'error');
      throw err;
    }
  };

  const loginWithEmail = async (email: string, pass: string): Promise<boolean> => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !pass) {
      const errMsg = 'Please enter both your email address and password.';
      addToast(errMsg, 'error');
      throw new Error(errMsg);
    }

    try {
      const result = await signInWithEmailAndPassword(auth, cleanEmail, pass);
      addToast(`Welcome back, ${result.user.displayName || cleanEmail}!`, 'success');
      soundFX.playSuccess();
      triggerConfetti();
      return true;
    } catch (err: unknown) {
      console.error('Email Login Error:', err);
      const code = (err as { code?: string })?.code || '';
      let friendly = 'Sign-in failed. Please check your email and password.';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        friendly = 'Invalid email or password. If you do not have an account yet, please use Create Account.';
      } else if (code === 'auth/invalid-email') {
        friendly = 'Please enter a valid email address.';
      } else if (code === 'auth/too-many-requests') {
        friendly = 'Too many failed attempts. Please wait a moment and try again.';
      } else if (code === 'auth/operation-not-allowed') {
        friendly = 'Email/Password sign-in is not enabled in Firebase Authentication.';
      }
      addToast(friendly, 'error');
      throw new Error(friendly);
    }
  };

  const signupWithEmail = async (name: string, email: string, pass: string): Promise<boolean> => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !cleanEmail || !pass) {
      const errMsg = 'Please fill all required fields.';
      addToast(errMsg, 'error');
      throw new Error(errMsg);
    }
    if (pass.length < 6) {
      const errMsg = 'Password must be at least 6 characters.';
      addToast(errMsg, 'error');
      throw new Error(errMsg);
    }
    try {
      const result = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
      await updateProfile(result.user, { displayName: cleanName });
      setUser((prev) => ({
        ...prev,
        username: cleanName,
        avatarLetter: cleanName.charAt(0).toUpperCase(),
      }));
      addToast(`Account created for ${cleanName}! +5 free coins credited.`, 'success');
      soundFX.playSuccess();
      triggerConfetti();
      return true;
    } catch (err: unknown) {
      console.error('Email Signup Error:', err);
      const code = (err as { code?: string })?.code || '';
      let friendly = (err as { message?: string })?.message || 'Registration failed.';
      if (code === 'auth/email-already-in-use') {
        friendly = 'This email is already registered. Please sign in instead.';
      } else if (code === 'auth/invalid-email') {
        friendly = 'Please enter a valid email address.';
      } else if (code === 'auth/weak-password') {
        friendly = 'Password must be at least 6 characters.';
      } else if (code === 'auth/operation-not-allowed') {
        friendly = 'Email/Password sign-up is not enabled in Firebase Authentication.';
      }
      addToast(friendly, 'error');
      throw new Error(friendly);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      try {
        localStorage.removeItem('yashi_cached_session');
      } catch {}
      setAuthToken(null);
      setIsAuthenticated(false);
      setCurrentFirebaseUser(null);
      setUser(INITIAL_USER);
      setSubscriptionSummary(null);
      setSubscriptionRequests([]);
      setSubscriptionNotifications([]);
      setServerBotState(null);
      setServerLogs([]);
      setPairingSession(null);
      wasOnlineRef.current = false;
      addToast('Signed out from YASHI HALLS successfully.', 'info');
    }
  };

  const updateUser = async (partial: Partial<UserProfile>) => {
    const safeClientPartial: Partial<UserProfile> = { ...partial };
    delete (safeClientPartial as any).plan;
    delete (safeClientPartial as any).ownedPlans;
    delete (safeClientPartial as any).botSlotsTotal;
    setUser((prev) => ({ ...prev, ...safeClientPartial }));

    if (currentFirebaseUser?.emailVerified && typeof safeClientPartial.username === 'string') {
      try {
        await setDoc(
          doc(db, 'users', currentFirebaseUser.uid),
          { username: safeClientPartial.username, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentFirebaseUser.uid}`, true);
      }
    }

    fetch('/api/admin/customers/sync', {
      method: 'POST',
      headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        username: safeClientPartial.username || user.username,
        botStatus: serverBotState?.isOnline ? 'online' : 'none',
      }),
    }).catch(() => {});

    addToast('Account profile updated successfully', 'success');
  };

  const addCoins = (amount: number, title: string, category: Transaction['category'] = 'purchase') => {
    setCoins((prev) => prev + amount);

    const now = new Date();
    const timeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
      now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    setTransactions((prev) => [
      {
        id: `tx-${Date.now()}`,
        title,
        date: timeStr,
        amount,
        category,
      },
      ...prev,
    ]);

    if (amount > 0) {
      triggerConfetti();
    }
  };

  const claimDailyCoins = () => {
    if (cooldownSeconds > 0) {
      addToast('Daily coin reward is on cooldown. Please wait 24 hours.', 'error');
      return { success: false, message: 'Cooldown active' };
    }
    addCoins(1, 'Daily coin reward (+1 coin)', 'claim');
    const now = Date.now();
    try {
      localStorage.setItem('yashi_last_claim_timestamp', String(now));
    } catch {
      // ignore
    }
    if (currentFirebaseUser?.emailVerified) {
      setDoc(
        doc(db, 'users', currentFirebaseUser.uid),
        { lastDailyClaim: now, updatedAt: serverTimestamp() },
        { merge: true }
      ).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `users/${currentFirebaseUser.uid}`, true));
    }
    setCooldownSeconds(24 * 3600);
    soundFX.playSuccess();
    triggerConfetti();
    addToast('+1 Daily Coin claimed! Come back in 24 hours.', 'success');
    return { success: true, message: '+1 coin claimed successfully' };
  };

  const redeemPromoCode = (code: string) => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      return { success: false, message: 'Please enter a promo code' };
    }
    if (redeemedCodes.includes(cleanCode)) {
      return { success: false, message: 'This code has already been redeemed on your account' };
    }
    const reward = PROMO_CODES[cleanCode];
    if (reward) {
      setRedeemedCodes((prev) => [...prev, cleanCode]);
      addCoins(reward, `Promo code redeemed (${cleanCode})`, 'promo');
      addToast(`Promo code applied! +${reward} coins added to wallet.`, 'success');
      return { success: true, message: `Redeemed successfully! +${reward} coins.` };
    }
    return { success: false, message: 'Invalid or expired promo code' };
  };

  const unlockBotClaim = () => {
    if (botUnlockClaim) return;
    setBotUnlockClaim(true);
    addToast('Bot Claim feature unlocked! You can now send .claim to your bot.', 'success');
    triggerConfetti();
  };

  const markSubscriptionNotificationRead = useCallback(async (id: string) => {
    setSubscriptionNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await fetch(`/api/subscriptions/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
        headers: withAuthHeaders(),
      });
    } catch {}
  }, []);

  const submitManualSubscriptionPayment = useCallback(async (payload: {
    packageId: 'pro' | 'business';
    transactionReference: string;
    paymentDate: string;
    receiptBase64: string;
    notes?: string;
  }): Promise<{ success: boolean; message: string; request?: ManualPaymentRequestItem | null }> => {
    try {
      soundFX.playClick();
      const res = await fetch('/api/subscriptions/requests', {
        method: 'POST',
        headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        soundFX.playSuccess();
        triggerConfetti();
        addToast(json.message || 'Payment receipt submitted for admin verification.', 'success');
        await refreshSubscription();
        return { success: true, message: json.message, request: json.request || null };
      }
      addToast(json.message || 'Failed to submit payment receipt.', 'error');
      return { success: false, message: json.message || 'Failed to submit payment receipt.' };
    } catch (err: any) {
      const msg = err?.message || 'Network error while uploading receipt.';
      addToast(msg, 'error');
      return { success: false, message: msg };
    }
  }, [addToast, refreshSubscription]);

  const mergedNotifications: AppNotification[] = React.useMemo(() => {
    const subMapped: AppNotification[] = subscriptionNotifications.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      time: new Date(n.createdAt).toLocaleString(),
      read: n.read,
      type: n.type,
    }));
    return [...subMapped, ...notifications];
  }, [subscriptionNotifications, notifications]);

  const markNotificationRead = (id: string) => {
    if (id.startsWith('subnotif-')) {
      void markSubscriptionNotificationRead(id);
      return;
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    subscriptionNotifications.forEach((n) => {
      if (!n.read) void markSubscriptionNotificationRead(n.id);
    });
    addToast('All notifications marked as read', 'info');
  };

  const changePlan = async (targetPlan: 'mini' | 'pro' | 'business') => {
    soundFX.playClick();
    if (user.plan === targetPlan) return;

    const serverActivePlan = subscriptionSummary?.plan || 'mini';

    // MINI is always free
    if (targetPlan === 'mini') {
      try {
        setUser((prev) => ({
          ...prev,
          plan: 'mini',
          botSlotsTotal: 1,
        }));
        const res = await fetch('/api/bot/plan', {
          method: 'POST',
          headers: getBotHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ plan: 'mini', userId: effectiveUserId }),
        });
        const data = await res.json();
        if (data.success) {
          addToast('Switched to YASHI HALLS MINI (Free) engine mode.', 'info');
          await refreshBotStatus();
        }
      } catch (err: any) {
        addToast(err?.message || 'Failed to update plan', 'error');
      }
      return;
    }

    // Paid tiers require an active server-verified subscription
    const hasServerEntitlement =
      serverActivePlan === 'business' || (serverActivePlan === 'pro' && targetPlan === 'pro');
    if (!hasServerEntitlement) {
      addToast(
        `${targetPlan.toUpperCase()} requires an active monthly subscription via manual bank transfer & admin approval.`,
        'info'
      );
      setPlanToPurchase(null);
      navigateToSubscription(targetPlan);
      return;
    }

    try {
      const slots = targetPlan === 'business' ? 25 : 5;
      const res = await fetch('/api/bot/plan', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ plan: targetPlan, userId: effectiveUserId }),
      });
      const data = await res.json();
      if (data.success) {
        setUser((prev) => ({
          ...prev,
          plan: targetPlan,
          botSlotsTotal: slots,
        }));
        addToast(`Activated ${targetPlan.toUpperCase()} tier.`, 'success');
        await refreshBotStatus();
      } else {
        addToast(data.message || 'Active subscription required on server.', 'error');
        navigateToSubscription(targetPlan);
      }
    } catch (err: any) {
      addToast(err?.message || 'Failed to update plan', 'error');
    }
  };

  const purchasePlan = async (targetPlan: 'mini' | 'pro' | 'business'): Promise<{ success: boolean; message: string; needCoins?: boolean }> => {
    if (targetPlan === 'mini') {
      await changePlan('mini');
      setPlanToPurchase(null);
      return { success: true, message: 'Activated MINI Plan' };
    }
    setPlanToPurchase(null);
    navigateToSubscription(targetPlan);
    addToast(`Complete manual bank transfer to activate ${targetPlan.toUpperCase()} for 30 days.`, 'info');
    return {
      success: false,
      message: 'Redirected to Manual Bank Transfer subscription checkout.',
    };
  };

  const syncBotProfilePic = async (customLogoUrl?: string) => {
    try {
      soundFX.playClick();
      addToast('Updating WhatsApp bot profile image...', 'info');
      const res = await fetch('/api/bot/sync-profile-pic', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId: effectiveUserId, logoUrl: customLogoUrl }),
      });
      const data = await res.json();
      if (data.success) {
        soundFX.playSuccess();
        addToast('✅ WhatsApp Bot profile picture updated successfully!', 'success');
        await refreshBotStatus();
      } else {
        addToast(data.message || 'Profile picture sync is ready when bot connects.', 'info');
      }
    } catch {
      addToast('Failed to sync profile picture', 'error');
    }
  };

  const resetQuotas = async () => {
    try {
      const res = await fetch('/api/bot/reset-quotas', {
        method: 'POST',
        headers: getBotHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId: effectiveUserId }),
      });
      const data = await res.json();
      if (data.success) {
        addToast('Daily quotas reset successfully!', 'success');
        await refreshBotStatus();
      }
    } catch {
      addToast('Failed to reset quotas', 'error');
    }
  };

  const upgradeToPro = () => {
    navigateToSubscription('pro');
  };

  const resetAccountData = () => {
    stopBot();
    clearSession();
    setCoins(0);
    setTransactions([]);
    setUser((prev) => ({
      ...prev,
      botSlotsUsed: 0,
    }));
    addToast('Account wiped and reset successfully', 'info');
  };

  // --- ADMIN AND MANUAL PURCHASE REQUESTS ---
  const ADMIN_EMAILS = [
    'sawrikasuraj9@gmail.com',
    'sawrikasuraj759@gmail.com',
    'epavenav@gmail.com'
  ];
  const isAdmin = Boolean(
    user.email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(user.email.trim().toLowerCase())
  );

  const [adminWhatsappNumber, setAdminWhatsappNumber] = useState<string>('0740712934');
  const [userPurchaseRequests, setUserPurchaseRequests] = useState<PurchaseRequest[]>([]);

  const refreshUserPurchases = useCallback(async () => {
    const token = authToken || getStoredSessionToken();
    if (!user.email || !token) return;
    try {
      const res = await fetch(`/api/purchase-requests/user/${encodeURIComponent(user.email)}`, {
        headers: withAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setUserPurchaseRequests(json.data);
        }
      }

      const profileRes = await fetch(`/api/customer/profile/${encodeURIComponent(user.email)}`, {
        headers: withAuthHeaders(),
      });
      if (profileRes.ok) {
        const profJson = await profileRes.json();
        if (profJson.success && profJson.customer) {
          const c = profJson.customer;
          if (typeof c.coins === 'number' && c.coins !== coins) {
            setCoins(c.coins);
          }
        }
      }
    } catch {
      // ignore
    }
  }, [user.email, authToken, coins]);

  useEffect(() => {
    if (isAuthenticated && authToken && user.email) {
      refreshUserPurchases();
    }
  }, [isAuthenticated, authToken, user.email, refreshUserPurchases]);

  const submitPurchaseRequest = async (item: {
    itemType: 'plan' | 'coin_pack';
    itemName: string;
    planId?: 'pro' | 'business';
    coinAmount?: number;
    priceLkr: number;
    priceFormatted?: string;
  }): Promise<{ success: boolean; request?: PurchaseRequest; message: string; whatsappUrl?: string }> => {
    try {
      soundFX.playClick();
      const res = await fetch('/api/purchase-requests/create', {
        method: 'POST',
        headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          customerId: currentFirebaseUser?.uid || `cust-${Date.now()}`,
          customerEmail: user.email,
          customerName: user.username,
          itemType: item.itemType,
          itemName: item.itemName,
          planId: item.planId,
          coinAmount: item.coinAmount,
          priceLkr: item.priceLkr,
          priceFormatted: item.priceFormatted || `Rs ${item.priceLkr.toLocaleString()}`,
        }),
      });

      const data = await res.json();
      if (data.success && data.request) {
        soundFX.playSuccess();
        triggerConfetti();
        if (data.adminWhatsapp) {
          setAdminWhatsappNumber(data.adminWhatsapp);
        }

        const refId = data.request.referenceId;
        const targetPhone = (data.adminWhatsapp || adminWhatsappNumber || '0740712934').replace(/\D/g, '');
        const cleanWa = targetPhone.startsWith('0') ? '94' + targetPhone.slice(1) : targetPhone;

        const prefilledText = encodeURIComponent(
          `*YASHI HALLS Purchase Request*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Customer:* ${user.username} (${user.email})\n` +
          `📦 *Item:* ${item.itemName}\n` +
          `💰 *Amount:* Rs ${item.priceLkr.toLocaleString()}\n` +
          `🔖 *Reference ID:* ${refId}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Hello Admin, I have submitted a purchase request on YASHI HALLS website. Please verify my payment and approve my request!`
        );

        const waUrl = `https://wa.me/${cleanWa}?text=${prefilledText}`;
        await refreshUserPurchases();
        addToast(`Purchase request created! Ref: ${refId}. WhatsApp opened.`, 'success');

        return {
          success: true,
          request: data.request,
          whatsappUrl: waUrl,
          message: data.message,
        };
      } else {
        addToast(data.message || 'Failed to submit purchase request', 'error');
        return { success: false, message: data.message || 'Submission error' };
      }
    } catch (err: any) {
      addToast(err?.message || 'Network error submitting purchase request', 'error');
      return { success: false, message: err?.message || 'Network error' };
    }
  };

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        isAuthLoading,
        loginWithGoogle,
        loginWithGoogleCredential,
        loginWithEmail,
        signupWithEmail,
        logout,
        user,
        updateUser,
        coins,
        addCoins,
        transactions,
        redeemPromoCode,
        claimDailyCoins,
        cooldownSeconds,
        isClaimReady: cooldownSeconds <= 0,
        serverBotState,
        serverLogs,
        isBackendConnected,
        refreshBotStatus,
        startBot,
        stopBot,
        restartBot,
        toggleBotState,
        deleteBot,
        updateBotEnv,
        updateBotConfig,
        clearSession,
        bots,
        deployBot,
        pairingSession,
        generatePairCode,
        generateQrCode,
        linkAndDeployPairedBot,
        botUnlockClaim,
        unlockBotClaim,
        activeTab,
        setActiveTab,
        theme,
        setTheme,
        isSidebarOpen,
        setIsSidebarOpen,
        openDeployModal,
        setOpenDeployModal,
        selectedTemplateForDeploy,
        setSelectedTemplateForDeploy,
        openCoinModal,
        setOpenCoinModal,
        selectedCoinPack,
        setSelectedCoinPack,
        openTerminalBot,
        setOpenTerminalBot,
        openSupportModal,
        setOpenSupportModal,
        openProModal,
        setOpenProModal,
        planToPurchase,
        setPlanToPurchase,
        openInviteModal,
        setOpenInviteModal,
        openDeleteAccountModal,
        setOpenDeleteAccountModal,
        openEditBotModal,
        setOpenEditBotModal,
        notifications: mergedNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        toasts,
        addToast,
        removeToast,
        upgradeToPro,
        changePlan,
        purchasePlan,
        syncBotProfilePic,
        resetQuotas,
        resetAccountData,
        authToken,
        isAdmin,
        adminWhatsappNumber,
        userPurchaseRequests,
        subscriptionSummary,
        subscriptionRequests,
        billingConfig,
        subscriptionNotifications,
        selectedSubscriptionTier,
        setSelectedSubscriptionTier,
        navigateToSubscription,
        refreshSubscription,
        submitManualSubscriptionPayment,
        markSubscriptionNotificationRead,
        submitPurchaseRequest,
        refreshUserPurchases,
        effectiveUserId,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
