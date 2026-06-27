import React, { useEffect, useRef, useState, useCallback } from 'react';
import { generateOAuthURL } from '@/components/shared';
import { useApiBase } from '@/hooks/useApiBase';
import './analysis-tool.scss';

const APP_ID = 36300;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}&l=en&brand=deriv`;
const HISTORY_SIZE = 1000;
const DDS_THRESHOLD = 10.5;
const DDS_MIN_TICKS = 30;
const DDS_MIN_OTHER_PASSING = 3; // needs 4 of 5 digits in the group (highest + 3 others)
// "Patience" variant — lower threshold but ALL 4 other digits must qualify (5 of 5)
const DDS_P_THRESHOLD = 10.3;
const DDS_P_MIN_OTHER = 4;   // all 4 other digits must qualify → 5 of 5 total
const RF_HITRATE_STORAGE_KEY = 'sat_rf_hitrate_v1';
const HITRATE_MAX_PER_MARKET = 200;
// Quotes buffer per market — must support all RF analysis windows (ratio + vol + EMA50)
const RF_QUOTES_BUFFER = 250;

const MARKETS = [
    { symbol: '1HZ100V', name: 'V100 (1s)', pipSize: 2 },
    { symbol: '1HZ75V',  name: 'V75 (1s)',  pipSize: 2 },
    { symbol: '1HZ50V',  name: 'V50 (1s)',  pipSize: 2 },
    { symbol: '1HZ25V',  name: 'V25 (1s)',  pipSize: 2 },
    { symbol: '1HZ10V',  name: 'V10 (1s)',  pipSize: 2 },
    { symbol: 'R_100',   name: 'V100',      pipSize: 2 },
    { symbol: 'R_75',    name: 'V75',       pipSize: 2 },
    { symbol: 'R_50',    name: 'V50',       pipSize: 4 },
    { symbol: 'R_25',    name: 'V25',       pipSize: 4 },
    { symbol: 'R_10',    name: 'V10',       pipSize: 4 },
];

const EVEN_DIGITS = [0, 2, 4, 6, 8];
const ODD_DIGITS  = [1, 3, 5, 7, 9];

interface MarketState {
    symbol: string;
    name: string;
    pipSize: number;
    digits: number[];
    quotes: number[];
    lastQuote: number | null;
    lastDigit: number | null;
    connected: boolean;
    tickSeq: number; // monotonic counter: total live ticks ever received for this symbol
}

// Only scan markets that are structurally suitable for flip-on-loss + martingale R/F.
// V100 excluded — too volatile, too streaky, blows through hard stops.
// (1s) variants excluded — too noisy for trend-based Rise/Fall; regular VIX
// (2-sec ticks) gives cleaner trend reads. Regular V75 is a classic
// Rise/Fall trender and stays in the scan.
const RF_SCAN_SYMBOLS = ['R_75', 'R_50', 'R_25', 'R_10'] as const;
const RF_RATIO_WINDOW = 100;
const RF_VOL_WINDOW = 50;
const RF_TREND_FAST = 20;   // fast EMA window
const RF_TREND_SLOW = 50;   // slow EMA window
const RF_STREAK_OVERDUE = 5;
const RF_GO_THRESHOLD = 65;        // fires when conditions are solidly good (not perfect)
const RF_AVOID_THRESHOLD = 35;
// Each component must clear its own minimum to be eligible for GO
// (no compensating a weak trend with a great ratio).
const RF_MIN_RATIO = 10;   // 33% of 30
const RF_MIN_VOL = 10;     // 40% of 25
const RF_MIN_STREAK = 4;   // passes even with no current streak (score=4); streak still adds points
const RF_MIN_TREND = 10;   // 40% of 25
// Live hit-rate gating: after this many tracked outcomes, require ≥ this win rate to keep firing GO.
const RF_HITRATE_MIN_SAMPLES = 8;
const RF_HITRATE_MIN_WINRATE = 0.50;

// Per-market healthy volatility bands (avg abs tick move).
// Calibrated empirically — calmer markets need lower bands.
const RF_VOL_BANDS: Record<string, { min: number; max: number }> = {
    'R_10': { min: 0.008, max: 0.08 },
    'R_25': { min: 0.020, max: 0.16 },
    'R_50': { min: 0.040, max: 0.32 },
    'R_75': { min: 0.060, max: 0.48 },
};

interface RFScore {
    symbol: string;
    name: string;
    ticks: number;
    risePct: number;
    fallPct: number;
    streak: number;
    streakSide: 'RISE' | 'FALL' | '';
    avgMove: number;
    trendStrength: number; // 0 = flat, higher = stronger trend
    ratioScore: number;
    volScore: number;
    streakScore: number;
    trendScore: number;
    score: number;         // 0-100 overall
    state: 'GO' | 'WAIT' | 'AVOID' | 'COLLECTING';
    suggestedSide: 'CALL' | 'PUT' | null;
    headline: string;
    detail: string;
}

function ema(values: number[], period: number): number {
    if (values.length === 0) return 0;
    const k = 2 / (period + 1);
    let e = values[0];
    for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
    return e;
}

function scoreRFMarket(
    market: MarketState | undefined,
    name: string,
    symbol: string,
    hitRateEntries: RFHitRateEntry[] = [],
): RFScore {
    const band = RF_VOL_BANDS[symbol] ?? { min: 0.01, max: 0.2 };
    const empty: RFScore = {
        symbol, name, ticks: 0, risePct: 0, fallPct: 0, streak: 0, streakSide: '',
        avgMove: 0, trendStrength: 0,
        ratioScore: 0, volScore: 0, streakScore: 0, trendScore: 0,
        score: 0, state: 'COLLECTING', suggestedSide: null,
        headline: 'Collecting ticks…',
        detail: `Need at least ${RF_TREND_SLOW + 5} ticks to evaluate.`,
    };
    if (!market || market.quotes.length < RF_TREND_SLOW + 5) {
        return { ...empty, ticks: market?.quotes.length ?? 0 };
    }

    const q = market.quotes;

    // 1. Rise/Fall ratio (last 100 ticks)
    const ratioSlice = q.slice(-(RF_RATIO_WINDOW + 1));
    let rises = 0, falls = 0;
    for (let i = 1; i < ratioSlice.length; i++) {
        if (ratioSlice[i] > ratioSlice[i - 1]) rises++;
        else if (ratioSlice[i] < ratioSlice[i - 1]) falls++;
    }
    const total = rises + falls;
    const risePct = total > 0 ? (rises / total) * 100 : 50;
    const fallPct = 100 - risePct;
    const ratioDist = Math.abs(50 - risePct); // 0 = perfect balance
    // 30 pts at 0 distance, scales to 0 at distance >= 15
    const ratioScore = Math.max(0, 30 - (ratioDist / 15) * 30);

    // 2. Volatility (last 50 ticks avg abs move)
    const volSlice = q.slice(-(RF_VOL_WINDOW + 1));
    let moveSum = 0, moveCount = 0;
    for (let i = 1; i < volSlice.length; i++) {
        moveSum += Math.abs(volSlice[i] - volSlice[i - 1]);
        moveCount++;
    }
    const avgMove = moveCount > 0 ? moveSum / moveCount : 0;
    let volScore = 0;
    if (avgMove >= band.min && avgMove <= band.max) {
        // Inside band — perfect score = 25
        volScore = 25;
    } else if (avgMove < band.min) {
        // Below band — scales down (0 at half the min)
        volScore = Math.max(0, 25 * (avgMove / band.min) * 0.5);
    } else {
        // Above band — scales down (0 at 2× max)
        const over = (avgMove - band.max) / band.max;
        volScore = Math.max(0, 25 * (1 - over));
    }

    // 3. Streak (current run in one direction)
    let streak = 0;
    let streakSide: 'RISE' | 'FALL' | '' = '';
    for (let i = q.length - 1; i > 0; i--) {
        const dir = q[i] > q[i - 1] ? 'RISE' : q[i] < q[i - 1] ? 'FALL' : '';
        if (dir === '') break;
        if (streakSide === '') streakSide = dir;
        if (dir === streakSide) streak++;
        else break;
    }
    // Stricter streak scoring — no free baseline points.
    let streakScore = 0;
    if (streak >= RF_STREAK_OVERDUE) streakScore = 20;        // overdue reversal
    else if (streak === 4) streakScore = 14;                   // close to overdue
    else if (streak === 3) streakScore = 10;                   // building up
    else streakScore = 4;                                      // not enough to base a flip on

    // 4. Trend filter (EMA20 vs EMA50 distance, normalized by avg move)
    const trendSlice = q.slice(-(RF_TREND_SLOW + 5));
    const fastEma = ema(trendSlice.slice(-RF_TREND_FAST), RF_TREND_FAST);
    const slowEma = ema(trendSlice, RF_TREND_SLOW);
    const trendStrength = avgMove > 0 ? Math.abs(fastEma - slowEma) / avgMove : 0;
    // 25 pts when trendStrength <= 1 (flat/choppy), 0 at >= 5 (strong trend)
    const trendScore = Math.max(0, 25 - (trendStrength / 5) * 25);

    const score = Math.round(ratioScore + volScore + streakScore + trendScore);

    // Live hit-rate gate: after enough tracked outcomes, block GO when win-rate
    // is below the floor so a market that's actually losing money on us stops
    // being recommended regardless of its theoretical score.
    const settledHits = hitRateEntries.filter(e => e.correct !== null);
    const winRate = settledHits.length > 0
        ? settledHits.filter(e => e.correct === true).length / settledHits.length
        : null;
    const hitRateBlocks =
        settledHits.length >= RF_HITRATE_MIN_SAMPLES &&
        winRate !== null &&
        winRate < RF_HITRATE_MIN_WINRATE;

    // Component gates — every pillar must clear its own minimum to qualify for GO.
    // Prevents a great ratio from masking a dangerous trend, etc.
    const componentGatesPass =
        ratioScore >= RF_MIN_RATIO &&
        volScore >= RF_MIN_VOL &&
        streakScore >= RF_MIN_STREAK &&
        trendScore >= RF_MIN_TREND;

    let state: RFScore['state'] = 'WAIT';
    if (score >= RF_GO_THRESHOLD && componentGatesPass && !hitRateBlocks) state = 'GO';
    else if (score < RF_AVOID_THRESHOLD) state = 'AVOID';

    // Side suggestion: contrarian on overdue streak; otherwise follow short-term EMA bias
    let suggestedSide: 'CALL' | 'PUT' | null = null;
    if (state === 'GO') {
        if (streak >= RF_STREAK_OVERDUE && streakSide) {
            suggestedSide = streakSide === 'FALL' ? 'CALL' : 'PUT';
        } else {
            suggestedSide = fastEma >= slowEma ? 'CALL' : 'PUT';
        }
    }

    // Build human-readable verdict
    let headline: string;
    let detail: string;
    if (state === 'GO') {
        if (streak >= RF_STREAK_OVERDUE && streakSide) {
            headline = `${streak}× ${streakSide} streak — conditions favor reversal`;
            detail = `Score ${score}/100. All four pillars clear. Suggested side: ${suggestedSide}. Conditions only — no guarantee, run small.`;
        } else {
            headline = `All four pillars clear`;
            detail = `Score ${score}/100. Rise/Fall ${Math.round(risePct)}/${Math.round(fallPct)}, low trend, healthy volatility. Suggested side: ${suggestedSide}. Conditions only — no guarantee, run small.`;
        }
    } else if (state === 'AVOID') {
        if (avgMove < band.min) {
            headline = 'Market too quiet';
            detail = `Score ${score}/100. Avg tick move ${avgMove.toFixed(4)} < ${band.min}. Bot will stall.`;
        } else if (avgMove > band.max) {
            headline = 'Market too volatile';
            detail = `Score ${score}/100. Avg tick move ${avgMove.toFixed(4)} > ${band.max}. Direction-flip becomes coin-toss.`;
        } else if (trendStrength >= 4) {
            headline = `Strong trend detected`;
            detail = `Score ${score}/100. EMA spread ${trendStrength.toFixed(1)}× normal. Flip-on-loss dies in trends.`;
        } else {
            headline = 'Conditions unfavorable';
            detail = `Score ${score}/100. Multiple indicators off. Wait for a cleaner setup.`;
        }
    } else if (hitRateBlocks && winRate !== null) {
        headline = 'Live track record poor — holding';
        detail = `Score ${score}/100, but tool has been right only ${Math.round(winRate * 100)}% of the last ${settledHits.length} signals here. Standing down until accuracy recovers.`;
    } else if (score >= RF_GO_THRESHOLD && !componentGatesPass) {
        // Identify the weakest pillar so the user knows exactly why we held back.
        const gaps: string[] = [];
        if (ratioScore < RF_MIN_RATIO) gaps.push('Rise/Fall ratio is skewed');
        if (volScore < RF_MIN_VOL) gaps.push(avgMove < band.min ? 'volatility too low' : 'volatility too high');
        if (streakScore < RF_MIN_STREAK) gaps.push('no streak setup');
        if (trendScore < RF_MIN_TREND) gaps.push('trend is too strong');
        headline = 'Score high but a pillar is weak';
        detail = `Score ${score}/100 — held because ${gaps.join(' + ')}. Waiting for all four conditions to align.`;
    } else {
        headline = 'Mixed conditions';
        detail = `Score ${score}/100. Borderline — hold for higher-probability entry.`;
    }

    return {
        symbol, name, ticks: q.length,
        risePct, fallPct, streak, streakSide, avgMove, trendStrength,
        ratioScore, volScore, streakScore, trendScore, score,
        state, suggestedSide, headline, detail,
    };
}

interface DigitInfo {
    digit: number;
    count: number;
    pct: number;
    qualifies: boolean;
    isLow: boolean;
}

const SIGNAL_HOLD_MS = 8_000;

interface DDSSignal {
    market: string;
    symbol: string;
    side: 'EVEN' | 'ODD';
    lowDigit: number;
    lowDigitPct: number;
    qualifying: DigitInfo[];
    allGroupDigits: DigitInfo[];
    qualifyingCount: number;
    strength: 'CONFIRMED';
    totalTicks: number;
    fired: boolean;
}

function getLastDigit(quote: number, pipSize: number): number {
    const str = quote.toFixed(pipSize);
    return parseInt(str[str.length - 1]);
}

interface RFHitRateEntry {
    timestamp: number;
    side: 'CALL' | 'PUT';
    correct: boolean | null;
}

function loadRFHitRates(): Record<string, RFHitRateEntry[]> {
    try {
        const raw = localStorage.getItem(RF_HITRATE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveRFHitRates(data: Record<string, RFHitRateEntry[]>): void {
    try { localStorage.setItem(RF_HITRATE_STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

function computeDDSSignal(
    market: MarketState,
    threshold = DDS_THRESHOLD,
    minOther = DDS_MIN_OTHER_PASSING,
): DDSSignal {
    const n = Math.min(market.digits.length, HISTORY_SIZE);
    const slice = market.digits.slice(-n);
    const freq = new Array(10).fill(0);
    slice.forEach(d => freq[d]++);

    const buildInfo = (grp: number[]): DigitInfo[] =>
        grp.map(d => {
            const pct = n > 0 ? (freq[d] / n) * 100 : 0;
            return { digit: d, count: freq[d], pct, qualifies: pct >= threshold, isLow: false };
        });

    let highestDigit = 0;
    for (let d = 1; d < 10; d++) if (freq[d] > freq[highestDigit]) highestDigit = d;

    const checkGroup = (grp: number[], side: 'EVEN' | 'ODD'): DDSSignal | null => {
        const infos = buildInfo(grp);
        const passing = infos.filter(d => d.qualifies);
        const highestInGroup = grp.includes(highestDigit);

        // Fires when the green semi-circle (highest digit) sits over an EVEN/ODD digit
        // AND at least minOther other digits in that group are also at threshold%+.
        const otherPassing = passing.filter(d => d.digit !== highestDigit).length;
        if (highestInGroup && otherPassing >= minOther) {
            const weakest = infos.reduce((a, b) => (a.pct < b.pct ? a : b));
            const strength: 'CONFIRMED' = 'CONFIRMED';
            return {
                market: market.name,
                symbol: market.symbol,
                side,
                lowDigit: weakest.digit,
                lowDigitPct: weakest.pct,
                qualifying: infos.filter(d => d.qualifies),
                allGroupDigits: infos,
                qualifyingCount: passing.length,
                strength,
                totalTicks: n,
                fired: true,
            };
        }
        return null;
    };

    const evenSignal = n >= DDS_MIN_TICKS ? checkGroup(EVEN_DIGITS, 'EVEN') : null;
    const oddSignal  = n >= DDS_MIN_TICKS ? checkGroup(ODD_DIGITS, 'ODD') : null;

    if (evenSignal && oddSignal) {
        return evenSignal.qualifyingCount >= oddSignal.qualifyingCount ? evenSignal : oddSignal;
    }

    return evenSignal ?? oddSignal ?? {
        market: market.name,
        symbol: market.symbol,
        side: 'EVEN',
        lowDigit: -1,
        lowDigitPct: 0,
        qualifying: [],
        allGroupDigits: [],
        qualifyingCount: 0,
        strength: 'CONFIRMED',
        totalTicks: n,
        fired: false,
    };
}

const SignalAlert = ({ signals }: { signals: DDSSignal[] }) => {
    const active = signals.filter(s => s.fired);
    if (active.length === 0) return null;

    return (
        <div className='sat__dds-alerts'>
            {active.map((sig, idx) => (
                <div key={`${sig.symbol}-${idx}`} className={`sat__dds-alert sat__dds-alert--${sig.side.toLowerCase()}`}>
                    <div className='sat__dds-alert-header'>
                        <span className='sat__dds-alert-pulse' />
                        <span className='sat__dds-alert-tag'>
                            DDS SIGNAL · {sig.strength}
                        </span>
                        <span className='sat__dds-alert-market'>{sig.market}</span>
                    </div>
                    <div className='sat__dds-alert-body'>
                        <div className='sat__dds-alert-call'>
                            BET <span className={`sat__dds-alert-side sat__dds-alert-side--${sig.side.toLowerCase()}`}>{sig.side}</span>
                        </div>
                        <div className='sat__dds-alert-reason'>
                            {sig.qualifyingCount} of 5 {sig.side.toLowerCase()} digits at ≥{DDS_THRESHOLD}%
                            · digit <strong>{sig.lowDigit}</strong> is cold ({sig.lowDigitPct.toFixed(1)}%)
                        </div>
                        <div className='sat__dds-alert-digits'>
                            {sig.allGroupDigits.map(d => (
                                <div
                                    key={d.digit}
                                    className={`sat__dds-digit ${d.isLow ? 'sat__dds-digit--low' : d.qualifies ? 'sat__dds-digit--pass' : 'sat__dds-digit--mid'}`}
                                >
                                    <span className='sat__dds-digit-num'>{d.digit}</span>
                                    <span className='sat__dds-digit-pct'>{d.pct.toFixed(1)}%</span>
                                    {d.qualifies && !d.isLow && <span className='sat__dds-digit-check'>✓</span>}
                                    {d.isLow && <span className='sat__dds-digit-cold'>↓</span>}
                                </div>
                            ))}
                        </div>
                        <div className='sat__dds-alert-meta'>
                            Sample: {sig.totalTicks} ticks · Threshold: {DDS_THRESHOLD}%
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const DDSSummaryRow = ({ signal, isTop }: { signal: DDSSignal; isTop: boolean }) => {
    if (!signal.fired) {
        return (
            <div className='sat__dds-row sat__dds-row--idle'>
                <span className='sat__dds-row-market'>{signal.market}</span>
                <span className='sat__dds-row-status'>
                    {signal.totalTicks < DDS_MIN_TICKS
                        ? `${signal.totalTicks}/${DDS_MIN_TICKS} ticks`
                        : 'no signal'}
                </span>
                <div className='sat__dds-row-bars'>
                    {signal.allGroupDigits.length > 0
                        ? signal.allGroupDigits.map(d => (
                              <div key={d.digit} className='sat__dds-row-bar-wrap'>
                                  <div
                                      className='sat__dds-row-bar'
                                      style={{
                                          height: `${Math.min(d.pct / 20 * 100, 100)}%`,
                                          opacity: 0.35,
                                      }}
                                  />
                              </div>
                          ))
                        : null}
                </div>
            </div>
        );
    }

    return (
        <div className={`sat__dds-row sat__dds-row--${signal.side.toLowerCase()} ${isTop ? 'sat__dds-row--top' : ''}`}>
            <span className='sat__dds-row-market'>{signal.market}</span>
            <span className={`sat__dds-row-call sat__dds-row-call--${signal.side.toLowerCase()}`}>
                {signal.side}
            </span>
            <div className='sat__dds-row-bars'>
                {signal.allGroupDigits.map(d => (
                    <div key={d.digit} className='sat__dds-row-bar-wrap'>
                        <span className='sat__dds-row-bar-label'>{d.digit}</span>
                        <div
                            className={`sat__dds-row-bar ${d.isLow ? 'sat__dds-row-bar--low' : d.qualifies ? 'sat__dds-row-bar--pass' : ''}`}
                            style={{ height: `${Math.min(d.pct / 20 * 100, 100)}%` }}
                        />
                        <span className='sat__dds-row-bar-pct'>{d.pct.toFixed(0)}%</span>
                    </div>
                ))}
                <div className='sat__dds-row-threshold' />
            </div>
            <span className='sat__dds-row-strength'>{signal.strength}</span>
        </div>
    );
};

const AnalysisTool = () => {
    const { activeLoginid, isAuthorizing } = useApiBase();
    const isLoggedIn = Boolean(activeLoginid);

    const [markets, setMarkets] = useState<MarketState[]>(
        MARKETS.map(m => ({ ...m, digits: [], quotes: [], lastQuote: null, lastDigit: null, connected: false, tickSeq: 0 }))
    );
    const [connStatus, setConnStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
    const [tickCount, setTickCount] = useState(0);
    const [activeTab, setActiveTab] = useState<'dds' | 'ddsp' | 'rf'>('dds');
    const [ddsSoundEnabled, setDdsSoundEnabled] = useState<boolean>(() => {
        const v = localStorage.getItem('sat_sound_dds') ?? localStorage.getItem('sat_sound');
        return v !== '0';
    });
    const [rfSoundEnabled, setRfSoundEnabled] = useState<boolean>(() => {
        const v = localStorage.getItem('sat_sound_rf') ?? localStorage.getItem('sat_sound');
        return v !== '0';
    });
    const [rfHitRates, setRfHitRates] = useState<Record<string, RFHitRateEntry[]>>(() => loadRFHitRates());
    const wsRef = useRef<WebSocket | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const ddsAudioRef = useRef<HTMLAudioElement | null>(null);
    const rfAudioRef = useRef<HTMLAudioElement | null>(null);
    // Custom alert sounds — fetched as ArrayBuffer on mount and decoded
    // lazily into AudioBuffers the first time we play them (decoding
    // requires an AudioContext, which on iOS can only be created after a
    // user gesture). Playing via the AudioContext is far more reliable
    // than HTMLAudioElement.play() which silently fails on many browsers.
    const ddsBytesRef = useRef<ArrayBuffer | null>(null);
    const rfBytesRef = useRef<ArrayBuffer | null>(null);
    const ddsBufferRef = useRef<AudioBuffer | null>(null);
    const rfBufferRef = useRef<AudioBuffer | null>(null);
    const lastDDSSignalKeyRef = useRef<string>('');
    const lastDDSPSignalKeyRef = useRef<string>('');
    const lastRFSignalKeyRef = useRef<string>('');
    const pendingRFSignalsRef = useRef<Record<string, { side: 'CALL' | 'PUT'; entryQuote: number }>>({});
    const recordRFOutcomeRef = useRef<(symbol: string, side: 'CALL' | 'PUT', correct: boolean | null) => void>(() => {});
    const stickyDDSRef = useRef<Record<string, { signal: DDSSignal; expiresAt: number }>>({});
    const stickyDDSPRef = useRef<Record<string, { signal: DDSSignal; expiresAt: number }>>({});

    useEffect(() => { localStorage.setItem('sat_sound_dds', ddsSoundEnabled ? '1' : '0'); }, [ddsSoundEnabled]);
    useEffect(() => { localStorage.setItem('sat_sound_rf', rfSoundEnabled ? '1' : '0'); }, [rfSoundEnabled]);

    const ensureAudioCtx = useCallback((): AudioContext | null => {
        try {
            if (!audioCtxRef.current) {
                const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
                if (!Ctx) return null;
                audioCtxRef.current = new Ctx();
            }
            const ctx = audioCtxRef.current!;
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            return ctx;
        } catch { return null; }
    }, []);

    // Helper — play a decoded AudioBuffer through the shared AudioContext,
    // decoding the cached bytes on demand if we haven't decoded them yet.
    const playBuffer = useCallback((
        bufferRef: { current: AudioBuffer | null },
        bytesRef: { current: ArrayBuffer | null },
        htmlFallback: HTMLAudioElement | null,
        url: string,
        htmlSetter: (a: HTMLAudioElement) => void,
        volume = 0.7,
    ) => {
        const ctx = ensureAudioCtx();
        const tryHtmlFallback = () => {
            try {
                let a = htmlFallback;
                if (!a) {
                    a = new Audio(url);
                    a.preload = 'auto';
                    a.volume = volume;
                    htmlSetter(a);
                }
                a.currentTime = 0;
                a.play().catch(() => {/* ignore */});
            } catch { /* ignore */ }
        };
        if (!ctx) { tryHtmlFallback(); return; }
        const playDecoded = (buf: AudioBuffer) => {
            try {
                const src = ctx.createBufferSource();
                src.buffer = buf;
                const gain = ctx.createGain();
                gain.gain.value = volume;
                src.connect(gain).connect(ctx.destination);
                src.start();
            } catch { tryHtmlFallback(); }
        };
        if (bufferRef.current) { playDecoded(bufferRef.current); return; }
        if (bytesRef.current) {
            // Decode now (lazy) — copy because decodeAudioData consumes the buffer
            ctx.decodeAudioData(bytesRef.current.slice(0))
                .then(buf => { bufferRef.current = buf; playDecoded(buf); })
                .catch(() => tryHtmlFallback());
            return;
        }
        // Bytes not yet fetched — fall back to <audio> element this once
        tryHtmlFallback();
    }, [ensureAudioCtx]);

    const playDDSAlert = useCallback(() => {
        if (!ddsSoundEnabled) return;
        playBuffer(
            ddsBufferRef,
            ddsBytesRef,
            ddsAudioRef.current,
            '/sounds/dds-alert.wav',
            (a) => { ddsAudioRef.current = a; },
        );
    }, [ddsSoundEnabled, playBuffer]);

    const playRFAlert = useCallback(() => {
        if (!rfSoundEnabled) return;
        playBuffer(
            rfBufferRef,
            rfBytesRef,
            rfAudioRef.current,
            '/sounds/rf-alert.mp3',
            (a) => { rfAudioRef.current = a; },
        );
    }, [rfSoundEnabled, playBuffer]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            try { audioCtxRef.current?.close(); } catch { /* ignore */ }
            audioCtxRef.current = null;
            try { ddsAudioRef.current?.pause(); } catch { /* ignore */ }
            ddsAudioRef.current = null;
            try { rfAudioRef.current?.pause(); } catch { /* ignore */ }
            rfAudioRef.current = null;
        };
    }, []);

    // Pre-fetch the custom alert sound files as raw bytes on mount. We do
    // NOT touch the AudioContext here — iOS Safari refuses to construct
    // one before the first user gesture. Decoding happens lazily inside
    // playBuffer the first time an alert actually fires.
    useEffect(() => {
        let cancelled = false;
        fetch('/sounds/dds-alert.wav')
            .then(r => (r.ok ? r.arrayBuffer() : null))
            .then(buf => { if (!cancelled && buf) ddsBytesRef.current = buf; })
            .catch(() => {/* ignore */});
        fetch('/sounds/rf-alert.mp3')
            .then(r => (r.ok ? r.arrayBuffer() : null))
            .then(buf => { if (!cancelled && buf) rfBytesRef.current = buf; })
            .catch(() => {/* ignore */});
        return () => { cancelled = true; };
    }, []);

    // Resume the AudioContext on the first user gesture. Browsers
    // (particularly iOS Safari and PWAs) keep new AudioContexts in
    // 'suspended' state until a user gesture explicitly resumes them.
    // We also pre-decode buffers here so subsequent plays are instant.
    useEffect(() => {
        const unlock = () => {
            const ctx = ensureAudioCtx();
            if (!ctx) return;
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            if (!ddsBufferRef.current && ddsBytesRef.current) {
                ctx.decodeAudioData(ddsBytesRef.current.slice(0))
                    .then(buf => { ddsBufferRef.current = buf; })
                    .catch(() => {/* ignore */});
            }
            if (!rfBufferRef.current && rfBytesRef.current) {
                ctx.decodeAudioData(rfBytesRef.current.slice(0))
                    .then(buf => { rfBufferRef.current = buf; })
                    .catch(() => {/* ignore */});
            }
        };
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('touchstart', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [ensureAudioCtx]);

    const recordRFOutcome = useCallback((symbol: string, side: 'CALL' | 'PUT', correct: boolean | null) => {
        setRfHitRates(prev => {
            const list = prev[symbol] ? [...prev[symbol]] : [];
            list.push({ timestamp: Date.now(), side, correct });
            const trimmed = list.slice(-HITRATE_MAX_PER_MARKET);
            const next = { ...prev, [symbol]: trimmed };
            saveRFHitRates(next);
            return next;
        });
    }, []);
    useEffect(() => { recordRFOutcomeRef.current = recordRFOutcome; }, [recordRFOutcome]);

    const connect = useCallback(() => {
        if (!isLoggedIn) return;
        setConnStatus('connecting');
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnStatus('live');
            MARKETS.forEach(m => {
                // Request the last HISTORY_SIZE ticks immediately, then subscribe to live ticks
                ws.send(JSON.stringify({
                    ticks_history: m.symbol,
                    end: 'latest',
                    count: HISTORY_SIZE,
                    style: 'ticks',
                    subscribe: 1,
                }));
            });
        };

        ws.onmessage = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            if (data.history && data.echo_req) {
                const symbol = data.echo_req.ticks_history;
                const market = MARKETS.find(m => m.symbol === symbol);
                if (!market) return;
                const prices: number[] = data.history.prices || [];
                // CRITICAL: use authoritative pip_size from API response, not hardcoded.
                // Hardcoded values were wrong for some V indices, causing wrong last-digit
                // extraction and percentages that didn't match Deriv's market panel.
                let pip = data.pip_size;
                if (typeof pip !== 'number' || pip < 0) {
                    // Fallback: derive pip_size from the prices themselves (max decimals seen).
                    let maxDec = 0;
                    for (const p of prices) {
                        const s = String(p);
                        const dot = s.indexOf('.');
                        if (dot >= 0) maxDec = Math.max(maxDec, s.length - dot - 1);
                    }
                    pip = maxDec || market.pipSize;
                }
                const digits = prices.map(p => getLastDigit(p, pip));
                setMarkets(prev => prev.map(m => {
                    if (m.symbol !== symbol) return m;
                    return {
                        ...m,
                        pipSize: pip, // remember authoritative value for live ticks
                        digits: digits.slice(-HISTORY_SIZE),
                        quotes: prices.slice(-RF_QUOTES_BUFFER),
                        lastQuote: prices[prices.length - 1] ?? m.lastQuote,
                        lastDigit: digits[digits.length - 1] ?? m.lastDigit,
                        connected: true,
                        tickSeq: digits.length,
                    };
                }));
                return;
            }
            if (data.tick) {
                const { symbol, quote, pip_size } = data.tick;
                const market = MARKETS.find(m => m.symbol === symbol);
                if (!market) return;

                // Settle any pending RF hit-rate signal for this symbol against THIS new tick.
                const pendingRF = pendingRFSignalsRef.current[symbol];

                setMarkets(prev => prev.map(m => {
                    if (m.symbol !== symbol) return m;
                    // Use the live tick's authoritative pip_size; fall back to the value
                    // we cached from history. Persist it so subsequent ticks stay accurate.
                    const effectivePip = (typeof pip_size === 'number' ? pip_size : m.pipSize);
                    const digit = getLastDigit(quote, effectivePip);

                    if (pendingRF) {
                        // Strict next-tick settlement: always clear pending on the
                        // very next tick. Tie prices count as null (untracked) — they
                        // don't tell us if the signal was right, but the slot is freed
                        // so the next BEST GO can re-arm immediately.
                        let correct: boolean | null = null;
                        if (quote > pendingRF.entryQuote) correct = pendingRF.side === 'CALL';
                        else if (quote < pendingRF.entryQuote) correct = pendingRF.side === 'PUT';
                        recordRFOutcomeRef.current(symbol, pendingRF.side, correct);
                        delete pendingRFSignalsRef.current[symbol];
                    }

                    return {
                        ...m,
                        pipSize: effectivePip,
                        digits: [...m.digits, digit].slice(-HISTORY_SIZE),
                        quotes: [...m.quotes, quote].slice(-RF_QUOTES_BUFFER),
                        lastQuote: quote,
                        lastDigit: digit,
                        connected: true,
                        tickSeq: m.tickSeq + 1,
                    };
                }));
                setTickCount(c => c + 1);
            }
        };

        ws.onclose = () => {
            setConnStatus('reconnecting');
            setMarkets(prev => prev.map(m => ({ ...m, connected: false })));
            setTimeout(connect, 3000);
        };

        ws.onerror = () => ws.close();
    }, [isLoggedIn]);

    useEffect(() => {
        if (!isLoggedIn) return;
        connect();
        return () => { wsRef.current?.close(); };
    }, [connect, isLoggedIn]);

    // Score every R/F-suitable market (V10/V25/V50). Sort by score descending.
    const rfScores: RFScore[] = RF_SCAN_SYMBOLS.map(sym => {
        const m = markets.find(mk => mk.symbol === sym);
        const meta = MARKETS.find(mk => mk.symbol === sym);
        return scoreRFMarket(m, meta?.name ?? sym, sym, rfHitRates[sym] ?? []);
    }).sort((a, b) => b.score - a.score);
    const bestRF = rfScores[0] ?? null;
    const bestRFGo = bestRF && bestRF.state === 'GO' ? bestRF : null;
    const bestRFSym = bestRFGo?.symbol ?? null;
    const bestRFSide = bestRFGo?.suggestedSide ?? null;
    const bestRFEntryQuote =
        bestRFSym ? markets.find(mk => mk.symbol === bestRFSym)?.lastQuote ?? null : null;

    // Arm RF tracking ONLY in a committed effect (no render-phase mutation).
    // Re-arms whenever the BEST market or side changes AND there is no pending
    // signal already in flight for that symbol — a settled pending clears itself
    // (see WS handler), allowing the same symbol/side to re-arm next time.
    useEffect(() => {
        if (!bestRFSym || !bestRFSide || typeof bestRFEntryQuote !== 'number') return;
        if (pendingRFSignalsRef.current[bestRFSym]) return; // already tracking
        pendingRFSignalsRef.current[bestRFSym] = {
            side: bestRFSide,
            entryQuote: bestRFEntryQuote,
        };
    }, [bestRFSym, bestRFSide, bestRFEntryQuote]);

    // Ring the RF alert immediately when a new GO signal appears (or side flips).
    // Also re-rings every 2 minutes while the same GO stays active, so a
    // long-running browser keeps getting reminded — not just the first fire.
    const RF_REPEAT_MS = 2 * 60 * 1000;
    const rfAlertKey = bestRFGo ? `${bestRFGo.symbol}:${bestRFGo.suggestedSide}` : '';
    const lastRFAlertTimeRef = useRef<number>(0);
    // Immediate alert on new/changed key
    useEffect(() => {
        if (!rfAlertKey) {
            lastRFSignalKeyRef.current = '';
            lastRFAlertTimeRef.current = 0;
            return;
        }
        if (rfAlertKey === lastRFSignalKeyRef.current) return;
        lastRFSignalKeyRef.current = rfAlertKey;
        lastRFAlertTimeRef.current = Date.now();
        playRFAlert();
    }, [rfAlertKey, playRFAlert]);
    // Repeat alert every 2 min while the same GO persists
    useEffect(() => {
        if (!rfAlertKey) return;
        const interval = setInterval(() => {
            if (!rfAlertKey) return;
            if (Date.now() - lastRFAlertTimeRef.current >= RF_REPEAT_MS) {
                lastRFAlertTimeRef.current = Date.now();
                playRFAlert();
            }
        }, 30_000); // check every 30s, fire when 2 min elapsed
        return () => clearInterval(interval);
    }, [rfAlertKey, playRFAlert, RF_REPEAT_MS]);

    // Restrict DDS scanning to the cleanest E/O markets to minimize fake signals.
    // V75 (1s), V100 (1s), V50 (1s) have the highest alternation + balanced parity.
    const DDS_EO_SYMBOLS = ['1HZ75V', '1HZ100V', '1HZ50V', '1HZ25V'];
    const rawDDSSignals = markets.filter(m => DDS_EO_SYMBOLS.includes(m.symbol)).map(m => computeDDSSignal(m));
    const now = Date.now();
    const ddsSignals = rawDDSSignals.map(sig => {
        if (sig.fired) {
            stickyDDSRef.current[sig.symbol] = { signal: sig, expiresAt: now + SIGNAL_HOLD_MS };
            return sig;
        }
        const sticky = stickyDDSRef.current[sig.symbol];
        if (sticky && sticky.expiresAt > now) {
            return sticky.signal;
        }
        if (sticky) delete stickyDDSRef.current[sig.symbol];
        return sig;
    });
    const firedSignals = ddsSignals.filter(s => s.fired);

    // Build a stable key of currently-firing DDS signals; ring the alert when it
    // changes (new market fires or side flips). De-duped so the same active
    // signal does not re-trigger on every tick.
    const ddsAlertKey = firedSignals
        .map(s => `${s.symbol}:${s.side}:${s.strength}`)
        .sort()
        .join('|');
    useEffect(() => {
        if (!ddsAlertKey) { lastDDSSignalKeyRef.current = ''; return; }
        if (ddsAlertKey === lastDDSSignalKeyRef.current) return;
        lastDDSSignalKeyRef.current = ddsAlertKey;
        playDDSAlert();
    }, [ddsAlertKey, playDDSAlert]);

    // — — — DDS Patience: ALL 5 digits in the parity group at DDS_P_THRESHOLD%+ — — —
    const rawDDSPSignals = markets
        .filter(m => DDS_EO_SYMBOLS.includes(m.symbol))
        .map(m => computeDDSSignal(m, DDS_P_THRESHOLD, DDS_P_MIN_OTHER));
    const ddsPSignals = rawDDSPSignals.map(sig => {
        if (sig.fired) {
            stickyDDSPRef.current[sig.symbol] = { signal: sig, expiresAt: now + SIGNAL_HOLD_MS };
            return sig;
        }
        const sticky = stickyDDSPRef.current[sig.symbol];
        if (sticky && sticky.expiresAt > now) return sticky.signal;
        if (sticky) delete stickyDDSPRef.current[sig.symbol];
        return sig;
    });
    const firedDDSPSignals = ddsPSignals.filter(s => s.fired);
    const ddsPAlertKey = firedDDSPSignals.map(s => `${s.symbol}:${s.side}`).sort().join('|');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        if (!ddsPAlertKey) { lastDDSPSignalKeyRef.current = ''; return; }
        if (ddsPAlertKey === lastDDSPSignalKeyRef.current) return;
        lastDDSPSignalKeyRef.current = ddsPAlertKey;
        playDDSAlert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ddsPAlertKey]);
    const sortedDDSP = [...ddsPSignals].sort((a, b) => {
        if (a.fired && !b.fired) return -1;
        if (!a.fired && b.fired) return 1;
        return 0;
    });

    const sortedDDS = [...ddsSignals].sort((a, b) => {
        if (a.fired && !b.fired) return -1;
        if (!a.fired && b.fired) return 1;
        return b.qualifyingCount - a.qualifyingCount;
    });

    if (!isLoggedIn) {
        return (
            <div className='sat'>
                <div className='sat__locked'>
                    <div className='sat__locked-badge'>🔒 MEMBERS ONLY</div>
                    <h1 className='sat__locked-title'>Saint Live Signal Engine</h1>
                    <p className='sat__locked-sub'>
                        The Analysis Tool is reserved for traders logged in and using the Team.Saintfx bots.
                        Sign in to your Deriv account to unlock real-time digit signals across every Volatility index.
                    </p>
                    <ul className='sat__locked-perks'>
                        <li>📊 Live Even/Odd green semi-circle signals (10.6%+ rule)</li>
                        <li>📈 Last-100-tick distribution monitor across 10 markets</li>
                        <li>🔔 Instant alerts the moment a market lines up</li>
                        <li>🤖 AI confidence-scored bet recommendations</li>
                    </ul>
                    <button
                        className='sat__locked-btn'
                        onClick={() => window.location.replace(generateOAuthURL())}
                        disabled={isAuthorizing}
                    >
                        {isAuthorizing ? 'Checking session…' : 'Log in to unlock'}
                    </button>
                    <p className='sat__locked-foot'>
                        New here? Logging in also opens a free Deriv demo account so you can practice risk-free.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className='sat'>
            <div className='sat__header'>
                <div className='sat__badge'>⬡ SAINT LIVE SIGNAL ENGINE ⬡</div>
                <h1 className='sat__title'>Analysis Tool</h1>
                <p className='sat__sub'>Real-time digit analysis · {HISTORY_SIZE}-tick buffer · All Volatility markets</p>
                <div className='sat__status-row'>
                    <span className={`sat__status sat__status--${connStatus}`}>
                        {connStatus === 'live' ? '● LIVE' : connStatus === 'reconnecting' ? '◌ RECONNECTING...' : '◌ CONNECTING...'}
                    </span>
                    <span className='sat__ticks'>{tickCount} ticks · {MARKETS.length} markets</span>
                    {firedSignals.length > 0 && (
                        <span className='sat__dds-badge-count'>
                            🔔 {firedSignals.length} DDS signal{firedSignals.length > 1 ? 's' : ''} ACTIVE
                        </span>
                    )}
                </div>
            </div>

            <div className='sat__tabs'>
                <button
                    className={`sat__tab ${activeTab === 'dds' ? 'sat__tab--active' : ''}`}
                    onClick={() => setActiveTab('dds')}
                >
                    📊 Digit Distribution Signal
                    {firedSignals.length > 0 && (
                        <span className='sat__tab-dot' />
                    )}
                </button>
                <button
                    className={`sat__tab ${activeTab === 'ddsp' ? 'sat__tab--active' : ''}`}
                    onClick={() => setActiveTab('ddsp')}
                >
                    🎯 DDS Patience
                    {firedDDSPSignals.length > 0 && (
                        <span className='sat__tab-dot' />
                    )}
                </button>
                <button
                    className={`sat__tab ${activeTab === 'rf' ? 'sat__tab--active' : ''}`}
                    onClick={() => setActiveTab('rf')}
                >
                    📈 Rise/Fall Readiness
                    {bestRFGo && <span className='sat__tab-dot' />}
                    {!rfSoundEnabled && <span className='sat__tab-muted' title='Sound muted'>🔕</span>}
                </button>
            </div>

            {activeTab === 'rf' && (
                <div className='sat__rf'>
                    <div className='sat__rf-head'>
                        <div>
                            <div className='sat__rf-tag'>RISE/FALL READINESS · CALMER MARKETS ONLY</div>
                            <h2 className='sat__rf-title'>Best market to trade Rise/Fall right now</h2>
                            <p className='sat__rf-sub'>
                                Scans only the calmer 1-second indices (V10, V25, V50) — the conditions
                                most survivable for flip-on-loss + martingale recovery. V75 / V100 are
                                excluded as too volatile and streaky for this strategy. Updates every tick.
                            </p>
                        </div>
                        <button
                            className={`sat__eo-sound-btn ${rfSoundEnabled ? 'sat__eo-sound-btn--on' : ''}`}
                            onClick={() => {
                                // User gesture — unlock browser audio for this tab.
                                try {
                                    if (!rfAudioRef.current) {
                                        rfAudioRef.current = new Audio('/sounds/rf-alert.mp3');
                                        rfAudioRef.current.preload = 'auto';
                                        rfAudioRef.current.volume = 0.7;
                                    }
                                    const a = rfAudioRef.current;
                                    a.muted = true;
                                    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
                                        .catch(() => { a.muted = false; });
                                } catch { /* ignore */ }
                                setRfSoundEnabled(s => !s);
                            }}
                            title={rfSoundEnabled ? 'R/F sound alerts ON — click to mute' : 'R/F sound alerts OFF — click to enable'}
                        >
                            {rfSoundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
                        </button>
                    </div>

                    <div className='sat__rf-honest'>
                        <strong>Honest note:</strong> Synthetic indices are mathematically ~50/50 — no tool
                        can predict the next tick. This is a <em>condition filter</em>: it only shows GO when
                        all four pillars (ratio, volatility, streak, trend) align AND the live tracked
                        accuracy on that market is holding above 50%. When in doubt, sit out. Run small,
                        respect the hard-stop.
                    </div>

                    {bestRF && (
                        <div className={`sat__rf-best sat__rf-best--${bestRF.state.toLowerCase()}`}>
                            <div className='sat__rf-best-banner'>🏆 BEST MARKET RIGHT NOW</div>
                            <div className='sat__rf-best-row'>
                                <div className='sat__rf-best-market'>
                                    <div className='sat__rf-best-name'>{bestRF.name}</div>
                                    <div className='sat__rf-best-state'>
                                        {bestRF.state === 'GO' && '🟢 GO'}
                                        {bestRF.state === 'WAIT' && '🟡 WAIT'}
                                        {bestRF.state === 'AVOID' && '🔴 AVOID'}
                                        {bestRF.state === 'COLLECTING' && '◌ COLLECTING'}
                                    </div>
                                </div>
                                <div className='sat__rf-best-score'>
                                    <div className='sat__rf-best-score-num'>{bestRF.score}</div>
                                    <div className='sat__rf-best-score-label'>/ 100</div>
                                </div>
                                {bestRF.suggestedSide && (
                                    <div className={`sat__rf-best-side sat__rf-best-side--${bestRF.suggestedSide.toLowerCase()}`}>
                                        <div className='sat__rf-best-side-label'>START</div>
                                        <div className='sat__rf-best-side-val'>
                                            {bestRF.suggestedSide === 'CALL' ? '↑ CALL' : '↓ PUT'}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className='sat__rf-best-headline'>{bestRF.headline}</div>
                            <div className='sat__rf-best-detail'>{bestRF.detail}</div>
                        </div>
                    )}

                    <div className='sat__rf-rank'>
                        {rfScores.map((s, i) => {
                            const stats = (rfHitRates[s.symbol] ?? []).filter(e => e.correct !== null);
                            const wins = stats.filter(e => e.correct === true).length;
                            const pct = stats.length > 0 ? Math.round((wins / stats.length) * 100) : 0;
                            return (
                                <div key={s.symbol} className={`sat__rf-rank-card sat__rf-rank-card--${s.state.toLowerCase()}`}>
                                    <div className='sat__rf-rank-head'>
                                        <span className='sat__rf-rank-pos'>#{i + 1}</span>
                                        <span className='sat__rf-rank-name'>{s.name}</span>
                                        <span className='sat__rf-rank-score'>{s.score}</span>
                                    </div>
                                    <div className='sat__rf-rank-state'>
                                        {s.state === 'GO' && '🟢 GO'}
                                        {s.state === 'WAIT' && '🟡 WAIT'}
                                        {s.state === 'AVOID' && '🔴 AVOID'}
                                        {s.state === 'COLLECTING' && '◌ COLLECTING'}
                                    </div>
                                    <div className='sat__rf-rank-grid'>
                                        <div className='sat__rf-rank-stat'>
                                            <span className='sat__rf-rank-stat-label'>Ratio</span>
                                            <span className='sat__rf-rank-stat-val'>
                                                {Math.round(s.risePct)}/{Math.round(s.fallPct)}
                                            </span>
                                        </div>
                                        <div className='sat__rf-rank-stat'>
                                            <span className='sat__rf-rank-stat-label'>Vol</span>
                                            <span className='sat__rf-rank-stat-val'>{s.avgMove.toFixed(4)}</span>
                                        </div>
                                        <div className='sat__rf-rank-stat'>
                                            <span className='sat__rf-rank-stat-label'>Streak</span>
                                            <span className='sat__rf-rank-stat-val'>
                                                {s.streak > 0 ? `${s.streak}${s.streakSide === 'RISE' ? '↑' : '↓'}` : '—'}
                                            </span>
                                        </div>
                                        <div className='sat__rf-rank-stat'>
                                            <span className='sat__rf-rank-stat-label'>Trend</span>
                                            <span className='sat__rf-rank-stat-val'>{s.trendStrength.toFixed(1)}×</span>
                                        </div>
                                    </div>
                                    <div className='sat__rf-rank-hr'>
                                        <span className='sat__rf-rank-hr-label'>Tracked accuracy</span>
                                        <span className='sat__rf-rank-hr-val'>
                                            {stats.length > 0 ? `${pct}% (${wins}/${stats.length})` : '— no signals yet'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className='sat__rf-how'>
                        <div className='sat__rf-how-title'>HOW THE SCORE WORKS · 0–100</div>
                        <ol className='sat__rf-how-list'>
                            <li><strong>Ratio (30 pts)</strong>: how close last-100-tick rise/fall split is to 50/50. Balanced = flip-on-loss has fair odds.</li>
                            <li><strong>Volatility (25 pts)</strong>: avg tick move inside that market's healthy band. Too quiet = bot stalls; too wild = coin-toss.</li>
                            <li><strong>Streak (20 pts)</strong>: 5+ consecutive same-direction ticks = reversal overdue, bonus points.</li>
                            <li><strong>Trend (25 pts)</strong>: EMA20 vs EMA50 distance (normalized). Low = choppy = flip-on-loss thrives. High = strong trend = death.</li>
                            <li>🟢 GO at score ≥ {RF_GO_THRESHOLD} · 🟡 WAIT between {RF_AVOID_THRESHOLD}–{RF_GO_THRESHOLD - 1} · 🔴 AVOID below {RF_AVOID_THRESHOLD}.</li>
                            <li><strong>All four pillars must clear their own minimums</strong> — no green light if even one is weak.</li>
                            <li><strong>Live hit-rate gate</strong>: after {RF_HITRATE_MIN_SAMPLES}+ tracked signals, GO is suppressed if accuracy drops below {Math.round(RF_HITRATE_MIN_WINRATE * 100)}%.</li>
                            <li>Every GO signal is settled against the next live tick; results stored locally per market.</li>
                        </ol>
                    </div>
                </div>
            )}

            {activeTab === 'dds' && (
                <div className='sat__dds-panel'>
                    <div className='sat__dds-header'>
                        <div className='sat__dds-title-row'>
                            <span className='sat__dds-icon'>📈</span>
                            <div>
                                <h2 className='sat__dds-title'>Even / Odd Sniper — Green Semi-Circle Signal</h2>
                                <p className='sat__dds-desc'>
                                    Fires only when the <strong>green semi-circle</strong> (highest digit) sits over
                                    an even or odd digit AND <strong>at least 3 other digits</strong> in that same group
                                    are also at <strong>{DDS_THRESHOLD}%+</strong>. That's the exact rule you trade
                                    by — the tool watches every Volatility index and pings you the moment it lines up.
                                    Needs {DDS_MIN_TICKS}+ ticks per market.
                                </p>
                            </div>
                        </div>
                        <div className='sat__dds-legend'>
                            <span className='sat__dds-legend-item sat__dds-legend-item--pass'>✓ ≥{DDS_THRESHOLD}%</span>
                            <span className='sat__dds-legend-item sat__dds-legend-item--low'>↓ cold digit</span>
                            <span className='sat__dds-legend-item sat__dds-legend-item--idle'>· below threshold</span>
                            <button
                                className={`sat__eo-sound-btn ${ddsSoundEnabled ? 'sat__eo-sound-btn--on' : ''}`}
                                onClick={() => {
                                    // User gesture — unlock browser audio for this tab.
                                    try {
                                        if (!ddsAudioRef.current) {
                                            ddsAudioRef.current = new Audio('/sounds/dds-alert.wav');
                                            ddsAudioRef.current.preload = 'auto';
                                            ddsAudioRef.current.volume = 0.7;
                                        }
                                        const a = ddsAudioRef.current;
                                        a.muted = true;
                                        a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
                                            .catch(() => { a.muted = false; });
                                    } catch { /* ignore */ }
                                    setDdsSoundEnabled(s => !s);
                                }}
                                title={ddsSoundEnabled ? 'DDS sound alerts ON — click to mute' : 'DDS sound alerts OFF — click to enable'}
                            >
                                {ddsSoundEnabled ? '🔔 Sound ON' : '🔕 Sound OFF'}
                            </button>
                        </div>
                    </div>

                    <SignalAlert signals={ddsSignals} />

                    {firedSignals.length === 0 && (
                        <div className='sat__dds-wait'>
                            <div className='sat__dds-wait-inner'>
                                <div className='sat__spinner' />
                                <div>
                                    <div className='sat__dds-wait-title'>Monitoring {ddsSignals.length} cleanest E/O markets…</div>
                                    <div className='sat__dds-wait-sub'>
                                        Restricted to V75 (1s), V100 (1s), V50 (1s), V25 (1s) — the cleanest 1-second VIXes — to minimize fake signals. Signal fires when the highest digit + 3 others (4 of one parity group) hit {DDS_THRESHOLD}%+.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className='sat__dds-table'>
                        <div className='sat__dds-table-head'>
                            <span>Market</span>
                            <span>Signal</span>
                            <span>Digit distribution (even 0/2/4/6/8 · odd 1/3/5/7/9)</span>
                            <span>State</span>
                        </div>
                        {sortedDDS.map((sig, i) => (
                            <DDSSummaryRow key={sig.symbol} signal={sig} isTop={i === 0 && sig.fired} />
                        ))}
                    </div>

                    <div className='sat__dds-how'>
                        <div className='sat__dds-how-title'>HOW THE SIGNAL WORKS</div>
                        <ol className='sat__dds-how-list'>
                            <li>Tool tracks the last <strong>{HISTORY_SIZE} ticks</strong> per market in real-time.</li>
                            <li>For each tick, the last digit (0–9) is recorded. Even digits: 0,2,4,6,8 · Odd digits: 1,3,5,7,9.</li>
                            <li>Each digit's frequency % is calculated. Expected fair value = 10.0%.</li>
                            <li>
                                Signal fires when the <strong>green semi-circle</strong> sits on an even or odd digit
                                AND <strong>3 or more other digits in that same group</strong> are at
                                <strong> ≥{DDS_THRESHOLD}%</strong> (so 4 of the 5 digits in that parity are hot).
                            </li>
                            <li>Trade the active parity: <span className='sat__dds-how-even'>BET EVEN</span> or <span className='sat__dds-how-odd'>BET ODD</span>.</li>
                        </ol>
                    </div>
                </div>
            )}

            {activeTab === 'ddsp' && (
                <div className='sat__dds'>
                    <SignalAlert signals={sortedDDSP} />
                    <div className='sat__dds-panel'>
                        <div className='sat__dds-title-row'>
                            <span className='sat__dds-icon'>🎯</span>
                            <div>
                                <h2 className='sat__dds-title'>DDS Patience — Full Group Alignment</h2>
                                <p className='sat__dds-desc'>
                                    Fires only when the <strong>green semi-circle</strong> (highest digit) sits over
                                    an even or odd digit AND <strong>all other 4 digits</strong> in that same group
                                    are also at <strong>{DDS_P_THRESHOLD}%+</strong>. That's the exact rule you trade
                                    by — the tool watches every Volatility index and pings you the moment it lines up.
                                    Needs {DDS_MIN_TICKS}+ ticks per market.
                                </p>
                            </div>
                        </div>
                        <div className='sat__dds-legend'>
                            <span className='sat__dds-legend-item sat__dds-legend-item--pass'>✓ ≥{DDS_P_THRESHOLD}%</span>
                            <span className='sat__dds-legend-item sat__dds-legend-item--low'>↓ cold digit</span>
                            <span className='sat__dds-legend-item sat__dds-legend-item--idle'>· below threshold</span>
                        </div>
                        <div className='sat__dds-markets'>
                            {sortedDDSP.map((sig, idx) => (
                                <DDSSummaryRow key={sig.symbol} signal={sig} isTop={idx === 0 && sig.fired} />
                            ))}
                        </div>
                        <div className='sat__dds-wait'>
                            {firedDDSPSignals.length === 0 && (
                                <>
                                    <div className='sat__dds-wait-title'>Monitoring {DDS_EO_SYMBOLS.length} markets for full alignment…</div>
                                    <p className='sat__dds-wait-sub'>
                                        Restricted to V75 (1s), V100 (1s), V50 (1s), V25 (1s). Signal fires only when ALL 5 digits
                                        in one parity group (highest + every other) are at {DDS_P_THRESHOLD}%+. Rarer — but very high confidence.
                                    </p>
                                </>
                            )}
                        </div>
                        <div className='sat__dds-how'>
                            <div className='sat__dds-how-title'>HOW PATIENCE DIFFERS FROM DDS</div>
                            <ol className='sat__dds-how-list'>
                                <li>Standard DDS: highest digit + <strong>3</strong> others at ≥{DDS_THRESHOLD}% (4 of 5 qualify).</li>
                                <li>DDS Patience: highest digit + <strong>ALL 4</strong> others at ≥{DDS_P_THRESHOLD}% — every digit in the group is elevated.</li>
                                <li>Lower threshold ({DDS_P_THRESHOLD}%) but zero exceptions — the entire parity group must be hot.</li>
                                <li>Fires less often, but when it does the bias is <strong>across the whole group</strong>, not just 4 of 5.</li>
                                <li>Trade the active parity: <span className='sat__dds-how-even'>BET EVEN</span> or <span className='sat__dds-how-odd'>BET ODD</span>.</li>
                            </ol>
                        </div>
                    </div>
                </div>
            )}


        </div>
    );
};

export default AnalysisTool;
