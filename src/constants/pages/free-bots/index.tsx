import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { load, save_types } from '@/external/bot-skeleton';
import {
    analyzeEvenOddMarketsDeep,
    MarketAnalysisResult,
    IndexAnalysis,
    pickBestDigit,
    DigitPickResult,
    analyzeOverUnderMarkets,
    analyzeO6U4Markets,
    OUMarketAnalysisResult,
    OUIndexAnalysis,
} from './market-analyzer';
import useIsOwner from '@/hooks/useIsOwner';
import { useApiBase } from '@/hooks/useApiBase';
import { generateOAuthURL } from '@/components/shared';
import './free-bots.scss';

const getStoredToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    const direct = localStorage.getItem('authToken');
    if (direct) return direct;
    try {
        const loginid = localStorage.getItem('active_loginid');
        const accountsRaw = localStorage.getItem('client.accounts');
        if (loginid && accountsRaw) {
            const accounts = JSON.parse(accountsRaw);
            const acct = accounts && accounts[loginid];
            if (acct && acct.token) return acct.token as string;
        }
    } catch {}
    return null;
};

const fetchBotXml = async (fileName: string): Promise<string> => {
    const token = getStoredToken();
    if (!token) throw new Error('You must sign in with your Deriv account before loading a bot.');
    const response = await fetch(`/api/bot/${encodeURIComponent(fileName)}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
        let msg = `Failed to load bot (${response.status})`;
        try {
            const j = await response.json();
            if (j?.error) msg = j.error;
        } catch {}
        if (response.status === 403)
            msg = 'Your account is not on the access list for this bot platform. Contact Team.Saintfx.';
        throw new Error(msg);
    }
    return response.text();
};

interface Bot {
    id: string;
    name: string;
    description: string;
    fileName: string;
    category: string;
    icon: string;
    requiresAnalysis?: boolean;
    analysisMode?: 'evenodd' | 'overunder' | 'o6u4';
    digitMode?: 'matches' | 'differs';
    btnColor?: string;
    ownerOnly?: boolean;
    lockedForVisitors?: boolean;
}

const BOTS: Bot[] = [
    {
        id: '10',
        name: 'Team.Saintfx Over/Under SmartGrid',
        description:
            'Bets digit Over 4 on Volatility 50 — ~50% win rate. Stake $0.35 · 1.7× martingale recovery · hard stop after 4 consecutive losses · TP $3 / SL $3 (adjustable). Designed to grind steady daily profit with built-in account protection.',
        fileName: 'Saint_OverUnder_SmartGrid_2026.xml',
        category: 'Over/Under',
        icon: '📈',
        ownerOnly: true,
    },
    {
        id: 'saint-ou-pro',
        name: 'Team.Saintfx Over/Under SmartGrid Pro',
        description:
            'Scans all 5 volatility indices, picks the market with the strongest OVER/UNDER bias, then trades it with auto side-flipping after 2 consecutive losses. Stake $0.35 · 1.7× martingale · hard stop after 4 losses · TP $3 / SL $3 (adjustable).',
        fileName: 'Saint_OU_SmartGrid_Pro_2026.xml',
        category: 'Over/Under',
        icon: '🔍',
        requiresAnalysis: true,
        analysisMode: 'overunder',
        btnColor: 'linear-gradient(135deg,#6d28d9 0%,#a855f7 50%,#6d28d9 100%)',
        ownerOnly: true,
    },
    {
        id: 'saint-o6u4-smartgrid',
        name: 'Team.Saintfx Over 5 / Under 6 SmartGrid',
        description:
            'Asymmetric bot. Trades DIGITOVER 5 (barrier 5, 40% win, ~2.5× payout) and DIGITUNDER 6 (barrier 6, 60% win, ~1.67× payout) on separate prediction barriers per side. Scans for strongest market bias, auto-flips side after 2 losses, resets stake on win. Stake $0.35 · 1.7× martingale · hard stop after 4 losses · TP $3 / SL $3 (adjustable).',
        fileName: 'Saint_O5U6_SmartGrid_2026.xml',
        category: 'Over/Under',
        icon: '🎯',
        requiresAnalysis: true,
        analysisMode: 'o6u4',
        btnColor: 'linear-gradient(135deg,#b45309 0%,#f59e0b 50%,#b45309 100%)',
        ownerOnly: true,
    },
    {
        id: 'saint-ou-pro-v6',
        name: 'Team.Saintfx Over/Under Pro V6',
        description:
            'Next-generation Over/Under bot on Volatility 10 (1s) Index. Dual-signal digit analysis with dynamic Over/Under prediction switching. Martingale recovery with state machine. Stake $1 · TP $20 · SL $20 (adjustable).',
        fileName: 'Saint_OU_Pro_V6_2026.xml',
        category: 'Over/Under',
        icon: '📊',
        btnColor: 'linear-gradient(135deg,#7c3aed 0%,#c084fc 50%,#7c3aed 100%)',
        ownerOnly: true,
    },
    {
        id: 'saint-wealth-switcher',
        name: 'Team.Saintfx Wealth Switcher',
        description:
            'Dual-signal Over/Under bot on Volatility 10 (1s) Index. Analyses the last 15 ticks for each digit threshold, dynamically switches between two Over-digit predictions (P1 & P2). Fires OVER when Over N% exceeds the threshold, UNDER when Under N% dominates. Martingale recovery with separate Loss/Win state machine. Stake $1 · TP $20 · SL $20 (adjustable).',
        fileName: 'Saint_WealthSwitcher_2026.xml',
        category: 'Over/Under',
        icon: '💰',
        btnColor: 'linear-gradient(135deg,#059669 0%,#34d399 50%,#059669 100%)',
        ownerOnly: true,
    },
    {
        id: 'saint-rise-fall-apex',
        name: 'Team.Saintfx Rise/Fall Apex 2026',
        description:
            'Top-tier 2026 Rise/Fall bot on regular V50 (2-sec ticks for cleaner trend reads) with CALL/PUT side-flip logic. Trades 5-tick contracts at $0.35 with 1.7× martingale recovery. Hard stop after 4 consecutive losses · Take Profit $3 · Stop Loss $3 (adjustable) · Profit-lock arms once you peak above 70% of TP and locks if you give back to 25% of peak.',
        fileName: 'Saint_Rise_Fall_Apex_2026.xml',
        category: 'Rise/Fall',
        icon: '🚀',
        btnColor: 'linear-gradient(135deg,#0ea5e9 0%,#38bdf8 50%,#0ea5e9 100%)',
        ownerOnly: true,
    },
    {
        id: 'saint-eo-hunter',
        name: 'Team.Saintfx E/O Precision Hunter',
        description:
            'Deep-scans all 5 volatility indices using 300 ticks of live data, picks the highest-scoring market for even/odd trading, then trades with side-flipping on loss and profit lock. Stake $0.35 · 1.7× martingale · hard stop after 4 losses · TP $3 / SL $3 (adjustable).',
        fileName: 'Saint_EO_Precision_Hunter_2026.xml',
        category: 'Even/Odd',
        icon: '🎯',
        requiresAnalysis: true,
        btnColor: 'linear-gradient(135deg,#b8860b 0%,#ffd700 50%,#b8860b 100%)',
    },
    {
        id: 'saint-eo-pro',
        name: 'Team.Saintfx E/O Pro',
        description:
            'Enhanced even/odd bot with automatic side-flipping on loss (EVEN→ODD→EVEN), profit lock that protects gains above $1.50, and 1.7× martingale recovery. Hard stop after 4 losses · TP $3 / SL $3 (adjustable) · Stake $0.35.',
        fileName: 'Saint_EO_Pro_2026.xml',
        category: 'Even/Odd',
        icon: '⚡',
        btnColor: 'linear-gradient(135deg,#16a34a 0%,#22c55e 100%)',
    },
    {
        id: 'saint-eo-complete-05',
        name: 'Team.Saintfx E/O Apex 2026',
        description:
            'Top-tier 2026 even/odd bot on V75 with EVEN/ODD side-flip logic. Trades at $0.35 with 1.7× martingale recovery. Hard stop after 4 consecutive losses · Take Profit $3 · Stop Loss $3 (adjustable) · Profit-lock at 75% protects your peak gains.',
        fileName: 'Saint_E_O_Bot_2026_Complete_0_5.xml',
        category: 'Even/Odd',
        icon: '✨',
        btnColor: 'linear-gradient(135deg,#0ea5e9 0%,#38bdf8 50%,#0ea5e9 100%)',
    },
    {
        id: '7',
        name: 'Team.Saintfx Differs Pro — Original',
        description:
            'Original high-frequency differs bot. Auto-picks the hottest digit from live data. 1.7× martingale · stops after 4 consecutive losses · TP $3 / SL $3 (adjustable).',
        fileName: 'Saint_EO_DiffersPro_2026.xml',
        category: 'Differs',
        icon: '🎲',
        digitMode: 'differs',
        ownerOnly: true,
    },
    {
        id: '8',
        name: 'Team.Saintfx Matches Pro — Original',
        description:
            'Original high-payout matches bot. Auto-picks the coldest digit from live data. 1.7× martingale · stops after 4 consecutive losses · TP $3 / SL $3 (adjustable).',
        fileName: 'Saint_EO_MatchesPro_2026.xml',
        category: 'Matches',
        icon: '🎯',
        digitMode: 'matches',
        ownerOnly: true,
    },
];

interface AnalysisState {
    scanning: string;
    done: number;
    total: number;
}

const ScoreBar = ({ score, color }: { score: number; color: string }) => (
    <div className='free-bots__score-bar-wrap'>
        <div className='free-bots__score-bar' style={{ width: `${Math.max(score, 2)}%`, background: color }} />
        <span className='free-bots__score-val'>{score.toFixed(0)}%</span>
    </div>
);

const AnalysisResultPanel = ({
    result,
    onConfirm,
    onCancel,
}: {
    result: MarketAnalysisResult;
    onConfirm: () => void;
    onCancel: () => void;
}) => (
    <div className='free-bots__analysis-panel'>
        <div className='free-bots__analysis-panel-header'>
            <span className='free-bots__analysis-panel-icon'>📊</span>
            <div>
                <h3 className='free-bots__analysis-panel-title'>Deep Scan Complete</h3>
                <p className='free-bots__analysis-panel-subtitle'>
                    Scanned {result.analyses.length} volatility indices · 300 ticks each · Best market found
                </p>
            </div>
        </div>

        <div className='free-bots__analysis-best'>
            <span className='free-bots__analysis-best-label'>Best index selected</span>
            <span className='free-bots__analysis-best-name'>{result.bestLabel}</span>
        </div>

        <div className='free-bots__analysis-table'>
            {result.analyses.map((a: IndexAnalysis, i: number) => (
                <div
                    key={a.symbol}
                    className={`free-bots__analysis-row ${i === 0 ? 'free-bots__analysis-row--best' : ''}`}
                >
                    <div className='free-bots__analysis-row-header'>
                        <span className='free-bots__analysis-row-label'>
                            {i === 0 && <span className='free-bots__analysis-badge'>BEST</span>}
                            {a.label}
                        </span>
                        <span className='free-bots__analysis-score'>Score {a.totalScore.toFixed(0)}</span>
                    </div>
                    <div className='free-bots__analysis-metrics'>
                        <div className='free-bots__analysis-metric'>
                            <span>Alternation</span>
                            <ScoreBar score={a.alternationScore} color='#4caf50' />
                        </div>
                        <div className='free-bots__analysis-metric'>
                            <span>Balance</span>
                            <ScoreBar score={a.balanceScore} color='#2196f3' />
                        </div>
                        <div className='free-bots__analysis-dist'>
                            <span className='free-bots__analysis-even'>E {a.evenCount}</span>
                            <span className='free-bots__analysis-odd'>O {a.oddCount}</span>
                            <span className='free-bots__analysis-streak'>
                                streak {a.currentStreak}x {a.currentSide}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
        </div>

        <div className='free-bots__analysis-actions'>
            <button className='free-bots__analysis-cancel' onClick={onCancel}>
                Cancel
            </button>
            <button className='free-bots__analysis-confirm' onClick={onConfirm}>
                Trade on {result.bestLabel}
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                    <path d='M5 12h14M12 5l7 7-7 7' />
                </svg>
            </button>
        </div>
    </div>
);

const OUAnalysisResultPanel = ({
    result,
    onConfirm,
    onCancel,
    variant,
}: {
    result: OUMarketAnalysisResult;
    onConfirm: () => void;
    onCancel: () => void;
    variant?: 'overunder' | 'o6u4';
}) => {
    const isO6U4 = variant === 'o6u4';
    const overLabel = isO6U4 ? 'OVER 5' : 'OVER 4';
    const underLabel = isO6U4 ? 'UNDER 6' : 'UNDER 5';
    const bestLabel = result.bestDirection === 'DIGITOVER' ? overLabel : underLabel;
    return (
        <div className='free-bots__analysis-panel'>
            <div className='free-bots__analysis-panel-header'>
                <span className='free-bots__analysis-panel-icon'>📊</span>
                <div>
                    <h3 className='free-bots__analysis-panel-title'>Market Scan Complete</h3>
                    <p className='free-bots__analysis-panel-subtitle'>
                        Scanned {result.analyses.length} volatility indices · 150 ticks each · Best edge found
                    </p>
                </div>
            </div>

            <div className='free-bots__analysis-best'>
                <span className='free-bots__analysis-best-label'>Best index selected</span>
                <span className='free-bots__analysis-best-name'>{result.bestLabel}</span>
                <span
                    className='free-bots__analysis-badge'
                    style={{
                        background:
                            result.bestDirection === 'DIGITOVER'
                                ? 'linear-gradient(135deg,#16a34a,#22c55e)'
                                : 'linear-gradient(135deg,#1d4ed8,#3b82f6)',
                        color: '#fff',
                        padding: '2px 10px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        marginLeft: 8,
                    }}
                >
                    {bestLabel}
                </span>
            </div>

            <p style={{ fontSize: 13, color: '#94a3b8', margin: '8px 0 12px', lineHeight: 1.5 }}>{result.reason}</p>

            <div className='free-bots__analysis-table'>
                {result.analyses.map((a: OUIndexAnalysis, i: number) => (
                    <div
                        key={a.symbol}
                        className={`free-bots__analysis-row ${i === 0 ? 'free-bots__analysis-row--best' : ''}`}
                    >
                        <div className='free-bots__analysis-row-header'>
                            <span className='free-bots__analysis-row-label'>
                                {i === 0 && <span className='free-bots__analysis-badge'>BEST</span>}
                                {a.label}
                            </span>
                            <span className='free-bots__analysis-score'>
                                {a.recommendation} &nbsp;|&nbsp; skew {a.skew.toFixed(1)}%
                            </span>
                        </div>
                        <div className='free-bots__analysis-metrics'>
                            <div className='free-bots__analysis-metric'>
                                <span>{overLabel}</span>
                                <ScoreBar score={a.overPct} color='#22c55e' />
                            </div>
                            <div className='free-bots__analysis-metric'>
                                <span>{underLabel}</span>
                                <ScoreBar score={a.underPct} color='#3b82f6' />
                            </div>
                            <div className='free-bots__analysis-dist'>
                                <span className='free-bots__analysis-even'>OV {a.overCount}</span>
                                <span className='free-bots__analysis-odd'>UN {a.underCount}</span>
                                <span className='free-bots__analysis-streak'>
                                    streak {a.currentStreak}x {a.currentStreakSide}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className='free-bots__analysis-actions'>
                <button className='free-bots__analysis-cancel' onClick={onCancel}>
                    Cancel
                </button>
                <button className='free-bots__analysis-confirm' onClick={onConfirm}>
                    Trade {bestLabel} on {result.bestLabel}
                    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                        <path d='M5 12h14M12 5l7 7-7 7' />
                    </svg>
                </button>
            </div>
        </div>
    );
};

const DigitPickPanel = ({
    result,
    mode,
    onConfirm,
    onCancel,
}: {
    result: DigitPickResult;
    mode: 'matches' | 'differs';
    onConfirm: () => void;
    onCancel: () => void;
}) => {
    const isMatches = mode === 'matches';
    const sorted = [...result.allFrequencies].sort((a, b) => a.pct - b.pct);
    const maxPct = Math.max(...result.allFrequencies.map(f => f.pct));

    return (
        <div className='free-bots__analysis-panel'>
            <div className='free-bots__analysis-panel-header'>
                <span className='free-bots__analysis-panel-icon'>{isMatches ? '🎯' : '🎲'}</span>
                <div>
                    <h3 className='free-bots__analysis-panel-title'>
                        {isMatches ? 'Coldest Digit Selected (Matches)' : 'Hottest Digit Selected (Differs)'}
                    </h3>
                    <p className='free-bots__analysis-panel-subtitle'>
                        Analysed {result.ticksAnalyzed} ticks on {result.label}
                    </p>
                </div>
            </div>

            <div className='free-bots__analysis-best'>
                <span className='free-bots__analysis-best-label'>
                    {isMatches
                        ? 'Target digit (coldest — due to appear)'
                        : 'Target digit (hottest — safest to differ from)'}
                </span>
                <span className='free-bots__analysis-best-name' style={{ fontSize: '2rem' }}>
                    {result.digit}
                    <span style={{ fontSize: '1rem', marginLeft: '8px', opacity: 0.7 }}>
                        ({result.frequency.toFixed(1)}% frequency)
                    </span>
                </span>
            </div>

            <div className='free-bots__digit-grid'>
                {sorted.map(f => (
                    <div
                        key={f.digit}
                        className={`free-bots__digit-cell ${f.digit === result.digit ? 'free-bots__digit-cell--selected' : ''}`}
                    >
                        <div className='free-bots__digit-label'>{f.digit}</div>
                        <div className='free-bots__digit-bar-wrap'>
                            <div
                                className='free-bots__digit-bar'
                                style={{
                                    height: `${(f.pct / maxPct) * 48}px`,
                                    background:
                                        f.digit === result.digit
                                            ? 'var(--saint-gold, #f0b429)'
                                            : 'rgba(255,255,255,0.2)',
                                }}
                            />
                        </div>
                        <div className='free-bots__digit-pct'>{f.pct.toFixed(1)}%</div>
                    </div>
                ))}
            </div>

            <div className='free-bots__analysis-actions'>
                <button className='free-bots__analysis-cancel' onClick={onCancel}>
                    Cancel
                </button>
                <button className='free-bots__analysis-confirm' onClick={onConfirm}>
                    Trade with digit {result.digit}
                    <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                        <path d='M5 12h14M12 5l7 7-7 7' />
                    </svg>
                </button>
            </div>
        </div>
    );
};

const FreeBots = observer(() => {
    const navigate = useNavigate();
    const store = useStore();
    const dashboard = store?.dashboard;
    const isOwner = useIsOwner();
    const { activeLoginid, isAuthorizing } = useApiBase();
    const storedLoginid = typeof window !== 'undefined' ? localStorage.getItem('active_loginid') : null;
    const isLoggedIn = Boolean(activeLoginid || storedLoginid);
    const [loadingBotId, setLoadingBotId] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [analysisState, setAnalysisState] = useState<AnalysisState | null>(null);
    const [analysisResult, setAnalysisResult] = useState<MarketAnalysisResult | null>(null);
    const [ouAnalysisResult, setOuAnalysisResult] = useState<OUMarketAnalysisResult | null>(null);
    const [pendingBot, setPendingBot] = useState<Bot | null>(null);
    const [digitPickResult, setDigitPickResult] = useState<DigitPickResult | null>(null);
    const [publicBotIds, setPublicBotIds] = useState<string[]>([]);
    const [previewBotIds, setPreviewBotIds] = useState<string[]>([]);
    const [deletedBotIds, setDeletedBotIds] = useState<string[]>([]);
    const [visibilityPanelOpen, setVisibilityPanelOpen] = useState(false);
    const [visibilitySaving, setVisibilitySaving] = useState<string | null>(null);
    const [visibilityCloudStatus, setVisibilityCloudStatus] = useState<'saved' | 'failed' | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [accountsPanelOpen, setAccountsPanelOpen] = useState(false);
    const [allowedAccounts, setAllowedAccounts] = useState<string[]>([]);
    const [accountsLoaded, setAccountsLoaded] = useState(false);
    const [accountsSaving, setAccountsSaving] = useState(false);
    const [addAccountInput, setAddAccountInput] = useState('');
    const [confirmRemoveAccount, setConfirmRemoveAccount] = useState<string | null>(null);
    const OWNER_IDS = ['CR2706667', 'CR2824740', 'VRTC4566944'];

    useEffect(() => {
        fetch('/api/bot-visibility')
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data.public)) setPublicBotIds(data.public);
                if (Array.isArray(data.preview)) setPreviewBotIds(data.preview);
                if (Array.isArray(data.deleted)) setDeletedBotIds(data.deleted);
            })
            .catch(() => {});
    }, []);

    const fetchAccounts = () => {
        const token = getStoredToken();
        if (!token) return;
        fetch('/api/accounts', { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data.accounts)) {
                    setAllowedAccounts(data.accounts);
                    setAccountsLoaded(true);
                }
            })
            .catch(() => {});
    };

    useEffect(() => {
        if (isOwner) fetchAccounts();
    }, [isOwner]);

    const postAccounts = async (accounts: string[]) => {
        const token = getStoredToken();
        if (!token) return;
        setAccountsSaving(true);
        try {
            const res = await fetch('/api/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ accounts }),
            });
            const data = await res.json();
            if (Array.isArray(data.accounts)) setAllowedAccounts(data.accounts);
        } catch {}
        setAccountsSaving(false);
    };

    const addAccount = async () => {
        const id = addAccountInput.trim().toUpperCase();
        if (!id || allowedAccounts.includes(id)) {
            setAddAccountInput('');
            return;
        }
        const updated = [...allowedAccounts, id];
        setAllowedAccounts(updated);
        setAddAccountInput('');
        await postAccounts(updated);
    };

    const removeAccount = async (id: string) => {
        setConfirmRemoveAccount(null);
        const updated = allowedAccounts.filter(a => a !== id);
        setAllowedAccounts(updated);
        await postAccounts(updated);
    };

    const postVisibility = async (pub: string[], prev: string[], del: string[]) => {
        const token = getStoredToken();
        if (!token) return;
        try {
            const res = await fetch('/api/bot-visibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ public: pub, preview: prev, deleted: del }),
            });
            const data = await res.json();
            setVisibilityCloudStatus(data.dbSaved ? 'saved' : 'failed');
        } catch {
            setVisibilityCloudStatus('failed');
        }
        setTimeout(() => setVisibilityCloudStatus(null), 4000);
    };

    const getBotState = (botId: string): 'hidden' | 'preview' | 'public' => {
        if (publicBotIds.includes(botId)) return 'public';
        if (previewBotIds.includes(botId)) return 'preview';
        return 'hidden';
    };

    const cycleBotVisibility = async (botId: string) => {
        const current = getBotState(botId);
        const next = current === 'hidden' ? 'preview' : current === 'preview' ? 'public' : 'hidden';
        const newPublic =
            next === 'public'
                ? [...publicBotIds.filter(id => id !== botId), botId]
                : publicBotIds.filter(id => id !== botId);
        const newPreview =
            next === 'preview'
                ? [...previewBotIds.filter(id => id !== botId), botId]
                : previewBotIds.filter(id => id !== botId);
        setPublicBotIds(newPublic);
        setPreviewBotIds(newPreview);
        setVisibilitySaving(botId);
        try {
            await postVisibility(newPublic, newPreview, deletedBotIds);
        } catch {}
        setVisibilitySaving(null);
    };

    const deleteBot = async (botId: string) => {
        setConfirmDeleteId(null);
        const newDeleted = [...deletedBotIds.filter(id => id !== botId), botId];
        const newPublic = publicBotIds.filter(id => id !== botId);
        const newPreview = previewBotIds.filter(id => id !== botId);
        setDeletedBotIds(newDeleted);
        setPublicBotIds(newPublic);
        setPreviewBotIds(newPreview);
        setVisibilitySaving(botId);
        try {
            await postVisibility(newPublic, newPreview, newDeleted);
        } catch {}
        setVisibilitySaving(null);
    };

    const restoreBot = async (botId: string) => {
        const newDeleted = deletedBotIds.filter(id => id !== botId);
        setDeletedBotIds(newDeleted);
        setVisibilitySaving(botId);
        try {
            await postVisibility(publicBotIds, previewBotIds, newDeleted);
        } catch {}
        setVisibilitySaving(null);
    };

    const activeBots = BOTS.filter(bot => !deletedBotIds.includes(bot.id));
    const deletedBots = BOTS.filter(bot => deletedBotIds.includes(bot.id));

    const nothingConfigured = publicBotIds.length === 0 && previewBotIds.length === 0;
    const visibleBots = isOwner
        ? activeBots
        : nothingConfigured
          ? activeBots.filter(bot => !bot.ownerOnly)
          : activeBots.filter(bot => publicBotIds.includes(bot.id) || previewBotIds.includes(bot.id));

    const categories = ['All', ...Array.from(new Set(visibleBots.map(bot => bot.category)))];

    const filteredBots =
        selectedCategory === 'All' ? visibleBots : visibleBots.filter(bot => bot.category === selectedCategory);

    const doLoadBot = async (bot: Bot, xmlContent: string) => {
        await load({
            block_string: xmlContent,
            file_name: bot.name,
            workspace: (window as any).Blockly?.derivWorkspace,
            from: save_types.LOCAL,
            drop_event: null,
            strategy_id: null,
            showIncompatibleStrategyDialog: null,
        });
        dashboard?.setActiveTab(1);
        navigate('/bot-builder');
    };

    const loadBot = async (bot: Bot) => {
        if (bot.requiresAnalysis) {
            setLoadingBotId(bot.id);
            setAnalysisState({ scanning: 'Connecting to Deriv API…', done: 0, total: 5 });
            setPendingBot(bot);

            try {
                if (bot.analysisMode === 'o6u4') {
                    const result = await analyzeO6U4Markets((label, done, total) => {
                        setAnalysisState({ scanning: `Scanning ${label} (Over 5 / Under 6)…`, done, total });
                    });
                    setOuAnalysisResult(result);
                } else if (bot.analysisMode === 'overunder') {
                    const result = await analyzeOverUnderMarkets((label, done, total) => {
                        setAnalysisState({ scanning: `Scanning ${label}…`, done, total });
                    });
                    setOuAnalysisResult(result);
                } else {
                    const result = await analyzeEvenOddMarketsDeep((label, done, total) => {
                        setAnalysisState({ scanning: `Deep-scanning ${label}…`, done, total });
                    });
                    setAnalysisResult(result);
                }
            } catch (err) {
                console.error('Market analysis failed:', err);
                setAnalysisState(null);
                setLoadingBotId(null);
                setPendingBot(null);
            }
            return;
        }

        if (bot.digitMode) {
            setLoadingBotId(bot.id);
            setAnalysisState({ scanning: 'Connecting to Deriv API…', done: 0, total: 5 });
            setPendingBot(bot);

            try {
                const result = await pickBestDigit(bot.digitMode, (label, done, total) => {
                    setAnalysisState({ scanning: `Scanning ${label}…`, done, total });
                });
                setDigitPickResult(result);
            } catch (err) {
                console.error('Digit pick failed:', err);
                setAnalysisState(null);
                setLoadingBotId(null);
                setPendingBot(null);
            }
            return;
        }

        try {
            setLoadingBotId(bot.id);
            let xmlContent = await fetchBotXml(bot.fileName);
            await doLoadBot(bot, xmlContent);
        } catch (error: any) {
            console.error('Error loading bot:', error);
            alert(`Could not load "${bot.name}":\n\n${error?.message || error}`);
        } finally {
            setLoadingBotId(null);
        }
    };

    const confirmAnalysis = async () => {
        if (!pendingBot || !analysisResult) return;
        const bot = pendingBot;
        const bestSymbol = analysisResult.bestSymbol;

        setAnalysisResult(null);
        setAnalysisState({ scanning: 'Loading bot…', done: 5, total: 5 });

        try {
            let xmlContent = await fetchBotXml(bot.fileName);
            xmlContent = xmlContent.replace(/(<field name="SYMBOL_LIST">)[^<]*/g, `$1${bestSymbol}`);
            await doLoadBot(bot, xmlContent);
        } catch (err: any) {
            console.error('Error loading bot after analysis:', err);
            alert(`Could not load "${bot.name}":\n\n${err?.message || err}`);
        } finally {
            setLoadingBotId(null);
            setAnalysisState(null);
            setPendingBot(null);
        }
    };

    const cancelAnalysis = () => {
        setAnalysisResult(null);
        setAnalysisState(null);
        setLoadingBotId(null);
        setPendingBot(null);
    };

    const confirmOUAnalysis = async () => {
        if (!pendingBot || !ouAnalysisResult) return;
        const bot = pendingBot;
        const { bestSymbol, bestDirection } = ouAnalysisResult;
        const direction = bestDirection === 'DIGITOVER' ? 'OVER' : 'UNDER';

        setOuAnalysisResult(null);
        setAnalysisState({ scanning: 'Loading bot…', done: 5, total: 5 });

        try {
            let xmlContent = await fetchBotXml(bot.fileName);
            xmlContent = xmlContent.replace(/(<field name="SYMBOL_LIST">)[^<]*/g, `$1${bestSymbol}`);
            xmlContent = xmlContent.replace('INJECT_DIRECTION', direction);
            await doLoadBot(bot, xmlContent);
        } catch (err: any) {
            console.error('Error loading O/U bot after analysis:', err);
            alert(`Could not load "${bot.name}":\n\n${err?.message || err}`);
        } finally {
            setLoadingBotId(null);
            setAnalysisState(null);
            setPendingBot(null);
        }
    };

    const cancelOUAnalysis = () => {
        setOuAnalysisResult(null);
        setAnalysisState(null);
        setLoadingBotId(null);
        setPendingBot(null);
    };

    const confirmDigitPick = async () => {
        if (!pendingBot || !digitPickResult) return;
        const bot = pendingBot;
        const digit = digitPickResult.digit;

        setDigitPickResult(null);
        setAnalysisState({ scanning: 'Loading bot…', done: 5, total: 5 });

        try {
            let xmlContent = await fetchBotXml(bot.fileName);
            xmlContent = xmlContent.replace(
                /(<value name="PREDICTION">[\s\S]*?<field name="NUM">)\d+(<\/field>)/,
                `$1${digit}$2`
            );
            await doLoadBot(bot, xmlContent);
        } catch (err: any) {
            console.error('Error loading bot after digit pick:', err);
            alert(`Could not load "${bot.name}":\n\n${err?.message || err}`);
        } finally {
            setLoadingBotId(null);
            setAnalysisState(null);
            setPendingBot(null);
        }
    };

    const cancelDigitPick = () => {
        setDigitPickResult(null);
        setAnalysisState(null);
        setLoadingBotId(null);
        setPendingBot(null);
    };

    const isAnalysing = !!loadingBotId && !!analysisState && !analysisResult && !digitPickResult;
    const analysisProgress = analysisState ? Math.round((analysisState.done / analysisState.total) * 100) : 0;

    if (!isLoggedIn) {
        return (
            <div className='free-bots'>
                <div className='free-bots__locked'>
                    <div className='free-bots__locked-badge'>🔒 MEMBERS ONLY</div>
                    <h1 className='free-bots__locked-title'>Saint Bots Vault</h1>
                    <p className='free-bots__locked-sub'>
                        Every bot in this collection is reserved for traders signed in to their Deriv account. Log in to
                        unlock the full Saint Bots library and load any strategy straight into the Bot Builder.
                    </p>
                    <ul className='free-bots__locked-perks'>
                        <li>🤖 Pre-built Even/Odd, Over/Under and Rise/Fall strategies</li>
                        <li>📊 Smart market scanner picks the best index for you</li>
                        <li>🛡️ Built-in martingale recovery, hard-stops and profit lock</li>
                        <li>⚡ One-click loading into the Bot Builder workspace</li>
                    </ul>
                    <button
                        className='free-bots__locked-btn'
                        onClick={() => window.location.replace(generateOAuthURL())}
                        disabled={isAuthorizing}
                    >
                        {isAuthorizing ? 'Checking session…' : 'Log in to unlock'}
                    </button>
                    <p className='free-bots__locked-foot'>
                        New here? Logging in also opens a free Deriv demo account so you can practice risk-free.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className='free-bots'>
            {analysisResult && (
                <div className='free-bots__overlay'>
                    <AnalysisResultPanel
                        result={analysisResult}
                        onConfirm={confirmAnalysis}
                        onCancel={cancelAnalysis}
                    />
                </div>
            )}

            {ouAnalysisResult && (
                <div className='free-bots__overlay'>
                    <OUAnalysisResultPanel
                        result={ouAnalysisResult}
                        onConfirm={confirmOUAnalysis}
                        onCancel={cancelOUAnalysis}
                        variant={pendingBot?.analysisMode as 'overunder' | 'o6u4'}
                    />
                </div>
            )}

            {digitPickResult && pendingBot?.digitMode && (
                <div className='free-bots__overlay'>
                    <DigitPickPanel
                        result={digitPickResult}
                        mode={pendingBot.digitMode}
                        onConfirm={confirmDigitPick}
                        onCancel={cancelDigitPick}
                    />
                </div>
            )}

            <div className='free-bots__header'>
                <h1 className='free-bots__title'>Saint Bots</h1>
                <p className='free-bots__subtitle'>
                    Explore our collection of pre-built trading bots. Click on any bot to load it into the Bot Builder.
                </p>
                <div className='free-bots__social'>
                    <a
                        href='https://www.instagram.com/team.saintfx?igsh=MXZsYmZkdTc2Ym9vYw%3D%3D&utm_source=qr'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='free-bots__social-btn'
                        title='Instagram'
                    >
                        <svg
                            width='20'
                            height='20'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='1.8'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        >
                            <rect x='2' y='2' width='20' height='20' rx='5' ry='5' />
                            <circle cx='12' cy='12' r='4' />
                            <circle cx='17.5' cy='6.5' r='0.5' fill='currentColor' stroke='none' />
                        </svg>
                    </a>
                    <a
                        href='https://www.tiktok.com/@teamsaint_ent?_r=1&_t=ZS-953BkkAykLw'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='free-bots__social-btn'
                        title='TikTok'
                    >
                        <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                            <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z' />
                        </svg>
                    </a>
                    <a
                        href='https://t.me/TEAMSAINTFX'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='free-bots__social-btn'
                        title='Telegram'
                    >
                        <svg width='20' height='20' viewBox='0 0 24 24' fill='currentColor'>
                            <path d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' />
                        </svg>
                    </a>
                </div>
            </div>

            {isOwner && (
                <div className='free-bots__visibility-panel'>
                    <button className='free-bots__visibility-toggle' onClick={() => setVisibilityPanelOpen(v => !v)}>
                        <span>⚙️ Bot Visibility Manager</span>
                        <span className='free-bots__visibility-toggle-arrow'>{visibilityPanelOpen ? '▲' : '▼'}</span>
                    </button>

                    {visibilityPanelOpen && (
                        <div className='free-bots__visibility-body'>
                            <p className='free-bots__visibility-hint'>
                                Click each bot's button to cycle its state. Changes save instantly — no refresh needed.
                            </p>
                            <div className='free-bots__visibility-legend'>
                                <span className='free-bots__vis-legend-item free-bots__vis-legend-item--hidden'>
                                    🔒 Hidden — invisible to visitors
                                </span>
                                <span className='free-bots__vis-legend-item free-bots__vis-legend-item--preview'>
                                    👁️ Preview — visible but locked
                                </span>
                                <span className='free-bots__vis-legend-item free-bots__vis-legend-item--public'>
                                    🌐 Public — visible &amp; usable
                                </span>
                            </div>
                            <div className='free-bots__visibility-grid'>
                                {activeBots.map(bot => {
                                    const state = getBotState(bot.id);
                                    const isSaving = visibilitySaving === bot.id;
                                    const stateLabel =
                                        state === 'public'
                                            ? '🌐 Public'
                                            : state === 'preview'
                                              ? '👁️ Preview'
                                              : '🔒 Hidden';
                                    const nextLabel =
                                        state === 'hidden'
                                            ? '→ Preview'
                                            : state === 'preview'
                                              ? '→ Public'
                                              : '→ Hidden';
                                    const isConfirming = confirmDeleteId === bot.id;
                                    return (
                                        <div key={bot.id} className='free-bots__visibility-row'>
                                            <div className='free-bots__visibility-info'>
                                                <span className='free-bots__visibility-icon'>{bot.icon}</span>
                                                <span className='free-bots__visibility-name'>{bot.name}</span>
                                            </div>
                                            <div className='free-bots__vis-actions'>
                                                <button
                                                    className={`free-bots__vis-state-btn free-bots__vis-state-btn--${state}`}
                                                    disabled={isSaving}
                                                    onClick={() => cycleBotVisibility(bot.id)}
                                                    title={`Click to cycle: ${nextLabel}`}
                                                >
                                                    {isSaving ? '…' : stateLabel}
                                                </button>
                                                {isConfirming ? (
                                                    <div className='free-bots__vis-confirm'>
                                                        <span className='free-bots__vis-confirm-text'>Delete?</span>
                                                        <button
                                                            className='free-bots__vis-confirm-yes'
                                                            onClick={() => deleteBot(bot.id)}
                                                        >
                                                            Yes
                                                        </button>
                                                        <button
                                                            className='free-bots__vis-confirm-no'
                                                            onClick={() => setConfirmDeleteId(null)}
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        className='free-bots__vis-delete-btn'
                                                        disabled={isSaving}
                                                        onClick={() => setConfirmDeleteId(bot.id)}
                                                        title='Remove this bot'
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {deletedBots.length > 0 && (
                                <div className='free-bots__vis-deleted-section'>
                                    <div className='free-bots__vis-deleted-title'>🗑️ Deleted Bots</div>
                                    <div className='free-bots__visibility-grid'>
                                        {deletedBots.map(bot => {
                                            const isSaving = visibilitySaving === bot.id;
                                            return (
                                                <div
                                                    key={bot.id}
                                                    className='free-bots__visibility-row free-bots__visibility-row--deleted'
                                                >
                                                    <div className='free-bots__visibility-info'>
                                                        <span
                                                            className='free-bots__visibility-icon'
                                                            style={{ opacity: 0.4 }}
                                                        >
                                                            {bot.icon}
                                                        </span>
                                                        <span
                                                            className='free-bots__visibility-name'
                                                            style={{ opacity: 0.5, textDecoration: 'line-through' }}
                                                        >
                                                            {bot.name}
                                                        </span>
                                                    </div>
                                                    <button
                                                        className='free-bots__vis-restore-btn'
                                                        disabled={isSaving}
                                                        onClick={() => restoreBot(bot.id)}
                                                    >
                                                        {isSaving ? '…' : '↩ Restore'}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {visibilityCloudStatus === 'saved' && (
                                <div className='free-bots__vis-cloud-status free-bots__vis-cloud-status--saved'>
                                    ☁️ Settings saved to cloud — will persist after republish
                                </div>
                            )}
                            {visibilityCloudStatus === 'failed' && (
                                <div className='free-bots__vis-cloud-status free-bots__vis-cloud-status--failed'>
                                    ⚠️ Cloud save failed — changes may not survive republish
                                </div>
                            )}

                            <button className='free-bots__visibility-refresh' onClick={() => window.location.reload()}>
                                🔄 Hard Refresh Page
                            </button>
                        </div>
                    )}
                </div>
            )}

            {isOwner && (
                <div className='free-bots__visibility-panel'>
                    <button className='free-bots__visibility-toggle' onClick={() => setAccountsPanelOpen(v => !v)}>
                        <span>👥 Account Manager {accountsLoaded ? `(${allowedAccounts.length})` : ''}</span>
                        <span className='free-bots__visibility-toggle-arrow'>{accountsPanelOpen ? '▲' : '▼'}</span>
                    </button>

                    {accountsPanelOpen && (
                        <div className='free-bots__visibility-body'>
                            <p className='free-bots__visibility-hint'>
                                Add or remove Deriv account IDs that are allowed to load bots. Owner accounts are
                                protected and cannot be removed.
                            </p>

                            <div className='free-bots__acct-add-row'>
                                <input
                                    className='free-bots__acct-input'
                                    type='text'
                                    placeholder='e.g. CR1234567'
                                    value={addAccountInput}
                                    disabled={accountsSaving}
                                    onChange={e => setAddAccountInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') addAccount();
                                    }}
                                />
                                <button
                                    className='free-bots__acct-add-btn'
                                    disabled={accountsSaving || !addAccountInput.trim()}
                                    onClick={addAccount}
                                >
                                    {accountsSaving ? '…' : '+ Add'}
                                </button>
                            </div>

                            <div className='free-bots__visibility-grid'>
                                {allowedAccounts.map(id => {
                                    const isProtected = OWNER_IDS.includes(id);
                                    const isConfirming = confirmRemoveAccount === id;
                                    return (
                                        <div key={id} className='free-bots__visibility-row'>
                                            <div className='free-bots__visibility-info'>
                                                <span className='free-bots__visibility-name'>{id}</span>
                                                {isProtected && (
                                                    <span className='free-bots__acct-owner-badge'>👑 Owner</span>
                                                )}
                                            </div>
                                            {!isProtected &&
                                                (isConfirming ? (
                                                    <div className='free-bots__vis-confirm'>
                                                        <span className='free-bots__vis-confirm-text'>Remove?</span>
                                                        <button
                                                            className='free-bots__vis-confirm-yes'
                                                            onClick={() => removeAccount(id)}
                                                        >
                                                            Yes
                                                        </button>
                                                        <button
                                                            className='free-bots__vis-confirm-no'
                                                            onClick={() => setConfirmRemoveAccount(null)}
                                                        >
                                                            No
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        className='free-bots__vis-delete-btn'
                                                        disabled={accountsSaving}
                                                        onClick={() => setConfirmRemoveAccount(id)}
                                                        title='Remove this account'
                                                    >
                                                        🗑️
                                                    </button>
                                                ))}
                                        </div>
                                    );
                                })}
                                {accountsLoaded && allowedAccounts.length === 0 && (
                                    <p className='free-bots__visibility-hint' style={{ margin: '0.5rem 0 0' }}>
                                        No accounts in the allowlist.
                                    </p>
                                )}
                            </div>

                            <button className='free-bots__visibility-refresh' onClick={() => window.location.reload()}>
                                🔄 Hard Refresh Page
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className='free-bots__categories'>
                {categories.map(category => (
                    <button
                        key={category}
                        className={`free-bots__category-btn ${selectedCategory === category ? 'free-bots__category-btn--active' : ''}`}
                        onClick={() => setSelectedCategory(category)}
                    >
                        {category}
                    </button>
                ))}
            </div>

            <div className='free-bots__grid'>
                {filteredBots.map(bot => {
                    const botState = getBotState(bot.id);
                    const isLocked = !isOwner && previewBotIds.includes(bot.id);
                    const isPrivateBot = isOwner && botState === 'hidden';
                    return (
                        <div key={bot.id} className={`free-bots__card ${isLocked ? 'free-bots__card--locked' : ''}`}>
                            {isLocked && (
                                <div className='free-bots__lock-overlay'>
                                    <svg
                                        className='free-bots__lock-icon'
                                        viewBox='0 0 24 24'
                                        fill='none'
                                        stroke='currentColor'
                                        strokeWidth='2.5'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    >
                                        <rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
                                        <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                                    </svg>
                                    <span className='free-bots__lock-label'>Owner Only</span>
                                </div>
                            )}
                            {isOwner && botState !== 'public' && (
                                <div
                                    className={`free-bots__card-private-badge free-bots__card-private-badge--${botState}`}
                                >
                                    {botState === 'preview' ? '👁️ Preview' : '🔒 Hidden'}
                                </div>
                            )}
                            <div className='free-bots__card-header'>
                                <span className='free-bots__card-icon'>{bot.icon}</span>
                                <div className='free-bots__card-badges'>
                                    {bot.digitMode && (
                                        <span
                                            className='free-bots__card-ai-badge'
                                            style={{
                                                background: 'rgba(229,53,53,0.15)',
                                                color: 'var(--saint-red-light, #ff6b6b)',
                                                border: '1px solid rgba(229,53,53,0.3)',
                                            }}
                                        >
                                            AUTO DIGIT
                                        </span>
                                    )}
                                    {bot.icon === '🛡️' && (
                                        <span className='free-bots__card-risk-badge free-bots__card-risk-badge--conservative'>
                                            CONSERVATIVE
                                        </span>
                                    )}
                                    {bot.icon === '⚖️' && (
                                        <span className='free-bots__card-risk-badge free-bots__card-risk-badge--balanced'>
                                            BALANCED
                                        </span>
                                    )}
                                    <span className='free-bots__card-category'>{bot.category}</span>
                                </div>
                            </div>
                            <h3 className='free-bots__card-title'>{bot.name}</h3>
                            <p className='free-bots__card-description'>{bot.description}</p>

                            {isLocked ? (
                                <button className='free-bots__card-btn free-bots__card-btn--locked' disabled>
                                    <svg
                                        width='14'
                                        height='14'
                                        viewBox='0 0 24 24'
                                        fill='none'
                                        stroke='currentColor'
                                        strokeWidth='2.5'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    >
                                        <rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
                                        <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                                    </svg>
                                    <span>✨ Owner Only</span>
                                </button>
                            ) : isAnalysing && loadingBotId === bot.id ? (
                                <div className='free-bots__analysis-progress'>
                                    <div className='free-bots__analysis-progress-text'>
                                        <span className='free-bots__analysis-scanning-dot' />
                                        {analysisState?.scanning}
                                    </div>
                                    <div className='free-bots__analysis-progress-bar-wrap'>
                                        <div
                                            className='free-bots__analysis-progress-bar'
                                            style={{ width: `${analysisProgress}%` }}
                                        />
                                    </div>
                                    <div className='free-bots__analysis-steps'>
                                        {Array.from({ length: analysisState?.total ?? 5 }).map((_, i) => (
                                            <div
                                                key={i}
                                                className={`free-bots__analysis-step ${i < (analysisState?.done ?? 0) ? 'free-bots__analysis-step--done' : i === (analysisState?.done ?? 0) ? 'free-bots__analysis-step--active' : ''}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <button
                                    className='free-bots__card-btn'
                                    style={
                                        bot.btnColor
                                            ? {
                                                  background: bot.btnColor,
                                                  color: bot.btnColor.includes('ffd700') ? '#1a1a1a' : '#ffffff',
                                                  fontWeight: 700,
                                                  textShadow: 'none',
                                              }
                                            : undefined
                                    }
                                    onClick={() => loadBot(bot)}
                                    disabled={loadingBotId === bot.id}
                                >
                                    {loadingBotId === bot.id ? (
                                        <span className='free-bots__card-btn-loading'>Loading...</span>
                                    ) : (
                                        <>
                                            <span>
                                                {bot.requiresAnalysis
                                                    ? 'Deep Scan & Load'
                                                    : bot.digitMode
                                                      ? 'Auto-Pick Digit & Load'
                                                      : 'Load Bot'}
                                            </span>
                                            <svg
                                                width='16'
                                                height='16'
                                                viewBox='0 0 24 24'
                                                fill='none'
                                                stroke='currentColor'
                                                strokeWidth='2'
                                            >
                                                <path d='M5 12h14M12 5l7 7-7 7' />
                                            </svg>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className='free-bots__footer'>
                <p>All bots are provided for educational purposes. Always test with demo accounts first.</p>
            </div>
        </div>
    );
});

export default FreeBots;
