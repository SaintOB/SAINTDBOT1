import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { load, save_types } from '@/external/bot-skeleton';
import { generateOAuthURL } from '@/components/shared';
import useIsOwner from '@/hooks/useIsOwner';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import './free-bots.scss';

type BotCategory = 'Over/Under' | 'Rise/Fall' | 'Even/Odd' | 'Differs' | 'Matches';

type Bot = {
    id: string;
    name: string;
    description: string;
    fileName: string;
    category: BotCategory;
    icon: string;
    btnColor?: string;
    ownerOnly?: boolean;
};

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
        btnColor: 'linear-gradient(135deg,#6d28d9 0%,#a855f7 50%,#6d28d9 100%)',
        ownerOnly: true,
    },
    {
        id: 'saint-o6u4-smartgrid',
        name: 'Team.Saintfx Over 5 / Under 6 SmartGrid',
        description:
            'Asymmetric bot. Trades DIGITOVER 5 and DIGITUNDER 6 on separate prediction barriers per side. Scans for strongest market bias, auto-flips side after 2 losses, resets stake on win. Stake $0.35 · 1.7× martingale · hard stop after 4 losses · TP $3 / SL $3 (adjustable).',
        fileName: 'Saint_O5U6_SmartGrid_2026.xml',
        category: 'Over/Under',
        icon: '🎯',
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
            'Dual-signal Over/Under bot on Volatility 10 (1s) Index. Analyses the last 15 ticks for each digit threshold, dynamically switches between two Over-digit predictions. Stake $1 · TP $20 · SL $20 (adjustable).',
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
            'Top-tier 2026 Rise/Fall bot on regular V50 with CALL/PUT side-flip logic. Trades 5-tick contracts at $0.35 with 1.7× martingale recovery. TP $3 · SL $3 (adjustable).',
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
            'Deep-scans volatility indices, picks the highest-scoring market for even/odd trading, then trades with side-flipping on loss and profit lock. Stake $0.35 · 1.7× martingale · TP $3 / SL $3.',
        fileName: 'Saint_EO_Precision_Hunter_2026.xml',
        category: 'Even/Odd',
        icon: '🎯',
        btnColor: 'linear-gradient(135deg,#b8860b 0%,#ffd700 50%,#b8860b 100%)',
    },
    {
        id: 'saint-eo-pro',
        name: 'Team.Saintfx E/O Pro',
        description:
            'Enhanced even/odd bot with automatic side-flipping on loss, profit lock, and 1.7× martingale recovery. Hard stop after 4 losses · TP $3 / SL $3 · Stake $0.35.',
        fileName: 'Saint_EO_Pro_2026.xml',
        category: 'Even/Odd',
        icon: '⚡',
        btnColor: 'linear-gradient(135deg,#16a34a 0%,#22c55e 100%)',
    },
    {
        id: 'saint-eo-complete-05',
        name: 'Team.Saintfx E/O Apex 2026',
        description:
            'Top-tier 2026 even/odd bot on V75 with EVEN/ODD side-flip logic. Trades at $0.35 with 1.7× martingale recovery. TP $3 · SL $3.',
        fileName: 'Saint_E_O_Bot_2026_Complete_0_5.xml',
        category: 'Even/Odd',
        icon: '✨',
        btnColor: 'linear-gradient(135deg,#0ea5e9 0%,#38bdf8 50%,#0ea5e9 100%)',
    },
    {
        id: '7',
        name: 'Team.Saintfx Differs Pro — Original',
        description:
            'Original high-frequency differs bot. Auto-picks the hottest digit from live data. 1.7× martingale · stops after 4 consecutive losses · TP $3 / SL $3.',
        fileName: 'Saint_EO_DiffersPro_2026.xml',
        category: 'Differs',
        icon: '🎲',
        ownerOnly: true,
    },
    {
        id: '8',
        name: 'Team.Saintfx Matches Pro — Original',
        description:
            'Original high-payout matches bot. Auto-picks the coldest digit from live data. 1.7× martingale · stops after 4 consecutive losses · TP $3 / SL $3.',
        fileName: 'Saint_EO_MatchesPro_2026.xml',
        category: 'Matches',
        icon: '🎯',
        ownerOnly: true,
    },
];

const getStoredToken = (): string | null => {
    if (typeof window === 'undefined') return null;
    const direct = localStorage.getItem('authToken');
    if (direct && direct !== 'null' && direct !== 'undefined') return direct;

    try {
        const loginid = localStorage.getItem('active_loginid');
        const accountsList = JSON.parse(localStorage.getItem('accountsList') || '{}');
        if (loginid && accountsList?.[loginid]) return accountsList[loginid];

        const clientAccounts = JSON.parse(localStorage.getItem('clientAccounts') || '{}');
        if (loginid && clientAccounts?.[loginid]?.token) return clientAccounts[loginid].token;
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
        let message = `Failed to load bot (${response.status})`;
        try {
            const data = await response.json();
            if (data?.error) message = data.error;
        } catch {}
        if (response.status === 403) {
            message = 'Your account is not on the access list for this bot platform. Contact Team.Saintfx.';
        }
        throw new Error(message);
    }

    return response.text();
};

const SocialLinks = () => (
    <div className='free-bots__socials'>
        <a href='https://www.instagram.com/teamsaint_ent/' target='_blank' rel='noopener noreferrer' className='free-bots__social-btn'>
            Instagram
        </a>
        <a href='https://www.tiktok.com/@teamsaint_ent?_r=1&_t=ZS-953BkkAykLw' target='_blank' rel='noopener noreferrer' className='free-bots__social-btn'>
            TikTok
        </a>
        <a href='https://t.me/TEAMSAINTFX' target='_blank' rel='noopener noreferrer' className='free-bots__social-btn'>
            Telegram
        </a>
    </div>
);

const LoginCard = () => (
    <div className='free-bots free-bots--login'>
        <div className='free-bots__login-card'>
            <div className='free-bots__login-icon'>⌾</div>
            <h1>SAINTDBOT</h1>
            <div className='free-bots__tagline'>CONSISTENCY IS 🔑</div>
            <p>Team.SaintFX automated trading platform. Log in with your Deriv account to access the bot builder.</p>
            <p>We only request access to identify your Deriv account and place trades when you choose. We cannot withdraw funds or see your password.</p>
            <button
                className='free-bots__login-btn'
                onClick={() => {
                    window.location.replace(generateOAuthURL());
                }}
            >
                Log in with Deriv
            </button>
            <SocialLinks />
            <div className='free-bots__login-footer'>Powered by Deriv API · Team.SaintFX © 2026</div>
        </div>
    </div>
);

const FreeBots = observer(() => {
    const navigate = useNavigate();
    const store = useStore();
    const dashboard = store?.dashboard;
    const isOwner = useIsOwner();
    const { activeLoginid } = useApiBase();
    const storedLoginid = typeof window !== 'undefined' ? localStorage.getItem('active_loginid') : null;
    const storedToken = typeof window !== 'undefined' ? getStoredToken() : null;
    const isLoggedIn = Boolean(activeLoginid || (storedLoginid && storedToken));
    const [loadingBotId, setLoadingBotId] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [error, setError] = useState('');

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (new URLSearchParams(window.location.search).get('login') === 'success') {
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    const visibleBots = isOwner ? BOTS : BOTS.filter(bot => !bot.ownerOnly);
    const categories = ['All', ...Array.from(new Set(visibleBots.map(bot => bot.category)))];
    const filteredBots = selectedCategory === 'All' ? visibleBots : visibleBots.filter(bot => bot.category === selectedCategory);

    const loadBot = async (bot: Bot) => {
        setError('');
        setLoadingBotId(bot.id);
        try {
            const xmlContent = await fetchBotXml(bot.fileName);
            await load({
                block_string: xmlContent,
                file_name: bot.name,
                workspace: (window as any).Blockly?.derivWorkspace,
                from: save_types.LOCAL,
                drop_event: null,
                strategy_id: null,
                showIncompatibleStrategyDialog: null,
            });

            sessionStorage.setItem('saint_loaded_bot', bot.id);
            sessionStorage.setItem('saint_loaded_bot_name', bot.name);
            dashboard?.setActiveTab?.(1);
            navigate('/bot-builder?login=success&from=saint-bots');
        } catch (err: any) {
            const message = err?.message || String(err);
            setError(message);
            alert(`Could not load "${bot.name}":\n\n${message}`);
        } finally {
            setLoadingBotId(null);
        }
    };

    if (!isLoggedIn) return <LoginCard />;

    return (
        <div className='free-bots'>
            <div className='free-bots__hero'>
                <h1>Saint Bots</h1>
                <SocialLinks />
            </div>

            {error && <div className='free-bots__error'>{error}</div>}

            {isOwner && (
                <div className='free-bots__visibility-panel'>
                    <button className='free-bots__visibility-toggle'>⚙ Bot Visibility Manager</button>
                    <button className='free-bots__visibility-toggle'>👥 Account Manager</button>
                </div>
            )}

            <div className='free-bots__categories'>
                {categories.map(category => (
                    <button
                        key={category}
                        className={`free-bots__category ${selectedCategory === category ? 'free-bots__category--active' : ''}`}
                        onClick={() => setSelectedCategory(category)}
                    >
                        {category}
                    </button>
                ))}
            </div>

            <div className='free-bots__grid'>
                {filteredBots.map(bot => (
                    <div key={bot.id} className='free-bots__card'>
                        <div className='free-bots__card-icon'>{bot.icon}</div>
                        <span className='free-bots__badge'>{bot.category}</span>
                        <h2>{bot.name}</h2>
                        <p>{bot.description}</p>
                        <button
                            className='free-bots__load-btn'
                            style={bot.btnColor ? { background: bot.btnColor } : undefined}
                            disabled={loadingBotId === bot.id}
                            onClick={() => loadBot(bot)}
                        >
                            {loadingBotId === bot.id ? 'Loading…' : 'Load Bot'} →
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
});

export default FreeBots;
