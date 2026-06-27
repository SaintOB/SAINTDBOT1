import { getAppId, getSocketURL } from '@/components/shared';

export interface DigitPickResult {
    digit: number;
    frequency: number;
    allFrequencies: { digit: number; count: number; pct: number }[];
    symbol: string;
    label: string;
    ticksAnalyzed: number;
}

export interface IndexAnalysis {
    symbol: string;
    label: string;
    evenCount: number;
    oddCount: number;
    total: number;
    balanceScore: number;
    alternationScore: number;
    totalScore: number;
    currentStreak: number;
    currentSide: 'EVEN' | 'ODD';
}

export interface MarketAnalysisResult {
    bestSymbol: string;
    bestLabel: string;
    analyses: IndexAnalysis[];
    reason: string;
}

const EVEN_ODD_SYMBOLS = [
    { symbol: '1HZ10V', label: 'Volatility 10 (1s)' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s)' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s)' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s)' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s)' },
];

const TICK_COUNT = 100;

type TickQuote = string | number;

function getLastDigit(quote: TickQuote): number {
    const str = String(quote).trim();

    // Keep only digits so we capture the true final quoted digit,
    // regardless of how many decimal places Deriv sends for that symbol.
    const digitsOnly = str.replace(/\D/g, '');

    if (!digitsOnly) return 0;

    return parseInt(digitsOnly[digitsOnly.length - 1], 10);
}

function analyzeSymbol(symbol: string, label: string, ticks: TickQuote[]): IndexAnalysis {
    const sides: Array<'EVEN' | 'ODD'> = ticks.map(t => {
        const d = getLastDigit(t);
        return d % 2 === 0 ? 'EVEN' : 'ODD';
    });

    const evenCount = sides.filter(s => s === 'EVEN').length;
    const oddCount = sides.length - evenCount;

    const balanceScore = 100 - Math.abs(evenCount - oddCount) * (100 / sides.length);

    let alternations = 0;
    for (let i = 1; i < sides.length; i++) {
        if (sides[i] !== sides[i - 1]) alternations++;
    }
    const alternationScore = (alternations / (sides.length - 1)) * 100;

    const totalScore = balanceScore * 0.4 + alternationScore * 0.6;

    let currentStreak = 1;
    const lastSide = sides[sides.length - 1];
    for (let i = sides.length - 2; i >= 0; i--) {
        if (sides[i] === lastSide) currentStreak++;
        else break;
    }

    return {
        symbol,
        label,
        evenCount,
        oddCount,
        total: sides.length,
        balanceScore,
        alternationScore,
        totalScore,
        currentStreak,
        currentSide: lastSide,
    };
}

function fetchTickHistory(
    ws: WebSocket,
    symbol: string,
    reqId: number,
    count: number = TICK_COUNT
): Promise<TickQuote[]> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout for ${symbol}`)), 20000);

        const handler = (event: MessageEvent) => {
            const data = JSON.parse(event.data);
            if (data.req_id === reqId && data.msg_type === 'history') {
                clearTimeout(timeout);
                ws.removeEventListener('message', handler);
                const prices: TickQuote[] = data.history?.prices ?? [];
                resolve(prices);
            }
        };

        ws.addEventListener('message', handler);

        ws.send(
            JSON.stringify({
                ticks_history: symbol,
                end: 'latest',
                count,
                style: 'ticks',
                req_id: reqId,
            })
        );
    });
}

const DIGIT_SYMBOLS = [
    { symbol: '1HZ10V', label: 'Volatility 10 (1s)' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s)' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s)' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s)' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s)' },
];

function openWs(): Promise<WebSocket> {
    const serverUrl = String(getSocketURL()).replace(/[^a-zA-Z0-9.]/g, '');
    const appId = String(getAppId() ?? '36300').replace(/[^a-zA-Z0-9]/g, '');
    const wsUrl = `wss://${serverUrl}/websockets/v3?app_id=${appId}&l=en&brand=deriv`;
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => resolve(ws);
        ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });
}

/**
 * Analyse digit frequencies across all 5 volatility (1s) indices and pick
 * the best digit for Matches (coldest digit on the most balanced index) or
 * Differs (hottest digit on the most balanced index).
 */
export async function pickBestDigit(
    mode: 'matches' | 'differs',
    onProgress?: (label: string, done: number, total: number) => void
): Promise<DigitPickResult> {
    const symbols = DIGIT_SYMBOLS;
    const ws = await openWs();

    try {
        let bestResult: DigitPickResult | null = null;
        let bestBalance = -1;

        for (let i = 0; i < symbols.length; i++) {
            const { symbol, label } = symbols[i];
            onProgress?.(label, i, symbols.length);

            const ticks = await fetchTickHistory(ws, symbol, 100 + i);
            if (ticks.length < 30) continue;

            const counts = Array(10).fill(0);
            for (const tick of ticks) {
                const d = getLastDigit(tick);
                counts[d]++;
            }
            const total = ticks.length;
            const allFrequencies = counts.map((count, digit) => ({
                digit,
                count,
                pct: (count / total) * 100,
            }));

            // balance = how close to uniform (10% each); higher = more balanced
            const maxDev = allFrequencies.reduce((mx, f) => Math.max(mx, Math.abs(f.pct - 10)), 0);
            const balance = 100 - maxDev * 5;

            if (balance > bestBalance) {
                bestBalance = balance;
                const sorted = [...allFrequencies].sort((a, b) => a.pct - b.pct);
                const picked = mode === 'matches' ? sorted[0] : sorted[sorted.length - 1];
                bestResult = {
                    digit: picked.digit,
                    frequency: picked.pct,
                    allFrequencies,
                    symbol,
                    label,
                    ticksAnalyzed: total,
                };
            }
        }

        ws.close();

        if (!bestResult) throw new Error('No tick data received');
        onProgress?.('Done', symbols.length, symbols.length);
        return bestResult;
    } catch (err) {
        ws.close();
        throw err;
    }
}

async function runEvenOddScan(
    tickCount: number,
    onProgress?: (label: string, done: number, total: number) => void
): Promise<MarketAnalysisResult> {
    const serverUrl = String(getSocketURL()).replace(/[^a-zA-Z0-9.]/g, '');
    const appId = String(getAppId() ?? '36300').replace(/[^a-zA-Z0-9]/g, '');
    const wsUrl = `wss://${serverUrl}/websockets/v3?app_id=${appId}&l=en&brand=deriv`;

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);

        ws.onopen = async () => {
            try {
                const analyses: IndexAnalysis[] = [];

                for (let i = 0; i < EVEN_ODD_SYMBOLS.length; i++) {
                    const { symbol, label } = EVEN_ODD_SYMBOLS[i];
                    onProgress?.(label, i, EVEN_ODD_SYMBOLS.length);
                    const ticks = await fetchTickHistory(ws, symbol, i + 1, tickCount);
                    if (ticks.length > 10) {
                        analyses.push(analyzeSymbol(symbol, label, ticks));
                    }
                }

                ws.close();

                if (analyses.length === 0) {
                    reject(new Error('No data received from API'));
                    return;
                }

                analyses.sort((a, b) => b.totalScore - a.totalScore);
                const best = analyses[0];

                const reason = `${best.label} scored highest with ${best.alternationScore.toFixed(0)}% alternation rate and ${best.balanceScore.toFixed(0)}% balance (${best.evenCount}E/${best.oddCount}O out of ${best.total} ticks). Current streak: ${best.currentStreak}x ${best.currentSide}.`;

                resolve({
                    bestSymbol: best.symbol,
                    bestLabel: best.label,
                    analyses,
                    reason,
                });
            } catch (err) {
                ws.close();
                reject(err);
            }
        };

        ws.onerror = () => {
            ws.close();
            reject(new Error('WebSocket connection failed'));
        };
    });
}

export async function analyzeEvenOddMarkets(
    onProgress?: (label: string, done: number, total: number) => void
): Promise<MarketAnalysisResult> {
    return runEvenOddScan(100, onProgress);
}

export async function analyzeEvenOddMarketsDeep(
    onProgress?: (label: string, done: number, total: number) => void
): Promise<MarketAnalysisResult> {
    return runEvenOddScan(300, onProgress);
}

export interface OUIndexAnalysis {
    symbol: string;
    label: string;
    overCount: number;
    underCount: number;
    total: number;
    overPct: number;
    underPct: number;
    skew: number;
    recommendation: 'OVER' | 'UNDER';
    currentStreak: number;
    currentStreakSide: 'OVER' | 'UNDER';
}

export interface OUMarketAnalysisResult {
    bestSymbol: string;
    bestLabel: string;
    bestDirection: 'DIGITOVER' | 'DIGITUNDER';
    analyses: OUIndexAnalysis[];
    reason: string;
}

/**
 * Dedicated scanner for the Over 5 / Under 6 SmartGrid bot.
 * Evaluates each index for two specific barriers:
 *   - OVER 5: digits > 5 (6, 7, 8, 9) — natural probability 40%
 *   - UNDER 6: digits < 6 (0, 1, 2, 3, 4, 5) — natural probability 60%
 * Picks the direction whose recent hit-rate most exceeds its expected probability.
 */
export async function analyzeO6U4Markets(
    onProgress?: (label: string, done: number, total: number) => void
): Promise<OUMarketAnalysisResult> {
    const ws = await openWs();

    try {
        const analyses: OUIndexAnalysis[] = [];

        for (let i = 0; i < EVEN_ODD_SYMBOLS.length; i++) {
            const { symbol, label } = EVEN_ODD_SYMBOLS[i];
            onProgress?.(label, i, EVEN_ODD_SYMBOLS.length);

            const ticks = await fetchTickHistory(ws, symbol, i + 1, 150);
            if (ticks.length < 30) continue;

            const digits = ticks.map(getLastDigit);
            const total = digits.length;

            // Barrier-specific counts
            const over5Count = digits.filter(d => d > 5).length; // 6, 7, 8, 9 — expected 40%
            const under6Count = digits.filter(d => d < 6).length; // 0, 1, 2, 3, 4, 5 — expected 60%

            const over5Rate = over5Count / total;
            const under6Rate = under6Count / total;

            // Edge = how much the recent rate exceeds the natural probability
            const over5Edge = over5Rate - 0.4;
            const under6Edge = under6Rate - 0.6;

            // Direction with the stronger positive edge wins
            const recommendation: 'OVER' | 'UNDER' = over5Edge >= under6Edge ? 'OVER' : 'UNDER';

            // skew used for sorting: higher = stronger edge (in percentage points)
            const skew = Math.max(over5Edge, under6Edge) * 100;

            const overPct = over5Rate * 100;
            const underPct = under6Rate * 100;

            // Current streak for the recommended side
            const sides: Array<'OVER' | 'UNDER'> = digits.map(d =>
                recommendation === 'OVER' ? (d > 5 ? 'OVER' : 'UNDER') : d < 6 ? 'UNDER' : 'OVER'
            );
            const lastSide = sides[sides.length - 1];
            let currentStreak = 1;
            for (let j = sides.length - 2; j >= 0; j--) {
                if (sides[j] === lastSide) currentStreak++;
                else break;
            }

            analyses.push({
                symbol,
                label,
                overCount: over5Count,
                underCount: under6Count,
                total,
                overPct,
                underPct,
                skew,
                recommendation,
                currentStreak,
                currentStreakSide: lastSide,
            });
        }

        ws.close();

        if (analyses.length === 0) throw new Error('No data received from API');
        onProgress?.('Done', EVEN_ODD_SYMBOLS.length, EVEN_ODD_SYMBOLS.length);

        analyses.sort((a, b) => b.skew - a.skew);
        const best = analyses[0];

        const direction = best.recommendation === 'OVER' ? 'Over 5' : 'Under 6';
        const winPct = best.recommendation === 'OVER' ? best.overPct : best.underPct;
        const expected = best.recommendation === 'OVER' ? 40 : 60;
        const edge = Math.max(winPct - expected, 0).toFixed(1);
        const reason = `${best.label} has the strongest edge for ${direction}: ${winPct.toFixed(1)}% of the last ${best.total} digits hit the target vs ${expected}% expected (+${edge}% edge). Betting ${best.recommendation === 'OVER' ? 'DIGITOVER 5' : 'DIGITUNDER 6'}.`;

        return {
            bestSymbol: best.symbol,
            bestLabel: best.label,
            bestDirection: best.recommendation === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER',
            analyses,
            reason,
        };
    } catch (err) {
        ws.close();
        throw err;
    }
}

export async function analyzeOverUnderMarkets(
    onProgress?: (label: string, done: number, total: number) => void
): Promise<OUMarketAnalysisResult> {
    const ws = await openWs();

    try {
        const analyses: OUIndexAnalysis[] = [];

        for (let i = 0; i < EVEN_ODD_SYMBOLS.length; i++) {
            const { symbol, label } = EVEN_ODD_SYMBOLS[i];
            onProgress?.(label, i, EVEN_ODD_SYMBOLS.length);

            const ticks = await fetchTickHistory(ws, symbol, i + 1, 150);
            if (ticks.length < 30) continue;

            const digits = ticks.map(getLastDigit);
            const overCount = digits.filter(d => d > 4).length;
            const underCount = digits.length - overCount;
            const total = digits.length;
            const overPct = (overCount / total) * 100;
            const underPct = (underCount / total) * 100;
            const skew = Math.abs(overPct - 50);
            const recommendation: 'OVER' | 'UNDER' = overCount >= underCount ? 'OVER' : 'UNDER';

            const sides = digits.map(d => (d > 4 ? 'OVER' : 'UNDER')) as Array<'OVER' | 'UNDER'>;
            const lastSide = sides[sides.length - 1];
            let currentStreak = 1;
            for (let j = sides.length - 2; j >= 0; j--) {
                if (sides[j] === lastSide) currentStreak++;
                else break;
            }

            analyses.push({
                symbol,
                label,
                overCount,
                underCount,
                total,
                overPct,
                underPct,
                skew,
                recommendation,
                currentStreak,
                currentStreakSide: lastSide,
            });
        }

        ws.close();

        if (analyses.length === 0) throw new Error('No data received from API');
        onProgress?.('Done', EVEN_ODD_SYMBOLS.length, EVEN_ODD_SYMBOLS.length);

        analyses.sort((a, b) => b.skew - a.skew);
        const best = analyses[0];

        const winPct = best.recommendation === 'OVER' ? best.overPct : best.underPct;
        const reason = `${best.label} has the strongest edge: ${winPct.toFixed(1)}% of the last ${best.total} digits landed ${best.recommendation} 4. Betting ${best.recommendation}.`;

        return {
            bestSymbol: best.symbol,
            bestLabel: best.label,
            bestDirection: best.recommendation === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER',
            analyses,
            reason,
        };
    } catch (err) {
        ws.close();
        throw err;
    }
}
