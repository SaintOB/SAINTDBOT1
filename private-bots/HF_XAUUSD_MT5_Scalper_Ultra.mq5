#property strict
#property version   "3.00"
#property description "Team.Saintfx HF Scalper Ultra 2026: ATR-adaptive scalper with today's full safety suite."

#include <Trade/Trade.mqh>
CTrade trade;

input group "=== Identity ==="
input string InpAuthorName                   = "Team.Saintfx HF Scalper Ultra 2026";

input group "=== Core ==="
input string InpSymbol                       = "";    // Leave blank to auto-use chart symbol
input ulong  InpMagic                        = 750014;
input int    InpMinSecondsBetweenTrades      = 1;
input int    InpMaxOpenPositions             = 1;
input bool   InpUseRiskPercent               = true;
input double InpRiskPercentPerTrade          = 0.40;
input double InpFixedLots                    = 0.01;

input group "=== Precision Entry Engine ==="
input int    InpFastEMAPeriod                = 8;
input int    InpSlowEMAPeriod                = 21;
input int    InpRSIPeriod                    = 7;
input double InpRSIBuyMin                    = 55.0;
input double InpRSISellMax                   = 45.0;
input int    InpPullbackTolerancePoints      = 40;
input int    InpMaxSpreadPoints              = 55;

input group "=== Higher Timeframe Trend Filter (M15) ==="
input bool   InpUseM15Filter                 = true;
input int    InpM15EMAPeriod                 = 50;

input group "=== Volatility Regime (ATR M1) — wider Ultra stops ==="
input int    InpATRPeriod                    = 14;
input int    InpATRMinPoints                 = 20;
input int    InpATRMaxPoints                 = 450;
input double InpSL_ATR_Multiplier            = 0.85;
input double InpTP_ATR_Multiplier            = 1.35;
input int    InpMinSLPoints                  = 80;
input int    InpMinTPPoints                  = 120;
input int    InpMaxSLPoints                  = 280;
input int    InpMaxTPPoints                  = 500;
input bool   InpEnforceSLNotBiggerThanTP     = true;

input group "=== Hyper-Scalp Exits ==="
input int    InpQuickProfitClosePoints       = 20;
input bool   InpUltraFastMode                = true;
input int    InpMicroTakePoints              = 18;
input double InpPartialClosePercent          = 50.0;
input bool   InpCloseOnOppositeSignal        = true;
input int    InpQuickLossClosePoints         = 35;   // Close immediately if trade moves this far against you
input int    InpMaxTradeAgeMinutes           = 20;   // Force-close any trade still open after N minutes
input int    InpBreakEvenTriggerPoints       = 10;
input int    InpBreakEvenLockPoints          = 3;
input int    InpTrailingStartPoints          = 15;
input int    InpTrailingStepPoints           = 6;

input group "=== Risk Management ==="
input double InpDailyLossLimitPercent        = 8.0;   // Halt if day loss exceeds % of session-start balance
input double InpSessionFloorPercent          = 20.0;  // HARD HALT if balance drops % from EA-attach balance
input double InpMaxDrawdownPercent           = 5.0;   // Halt if live unrealised DD exceeds %
input double InpMinFreeMarginPercent         = 150.0; // Block entry if margin headroom too tight
input int    InpMaxConsecutiveLosses         = 3;     // Pause after N losses in a row
input int    InpPauseMinutesAfterLossStreak  = 10;    // Minutes to pause after loss streak
input int    InpLossStreakReduceAfter        = 2;     // Reduce lot size after N consecutive losses
input double InpLossStreakRiskReduction      = 0.50;  // Multiply risk by this after streak (0.5 = half size)

input group "=== Session Filter ==="
input bool   InpUseSessionFilter             = true;
input int    InpSessionStartHourServer       = 6;
input int    InpSessionEndHourServer         = 22;

input group "=== Daily Trade Cap ==="
input int    InpMaxTradesPerDay              = 20;

int      hFastEMA = INVALID_HANDLE;
int      hSlowEMA = INVALID_HANDLE;
int      hRSI     = INVALID_HANDLE;
int      hATR     = INVALID_HANDLE;
int      hM15EMA  = INVALID_HANDLE;

datetime g_last_trade_time        = 0;
datetime g_pause_until            = 0;
int      g_day_of_year            = -1;
double   g_day_start_balance      = 0.0;
double   g_initial_balance        = 0.0;   // Set once at EA attach — never reset
int      g_trades_today           = 0;
int      g_consecutive_losses     = 0;
bool     g_daily_halt             = false;
bool     g_session_halt           = false; // Permanent until EA removed
bool     g_last_closed_was_profit = false;

string S()  { return InpSymbol == "" ? _Symbol : InpSymbol; }
double Pt() { return SymbolInfoDouble(S(), SYMBOL_POINT); }

bool IsNewTradingDay()
{
    MqlDateTime t;
    TimeToStruct(TimeCurrent(), t);
    if (g_day_of_year != t.day_of_year)
    {
        g_day_of_year        = t.day_of_year;
        g_day_start_balance  = AccountInfoDouble(ACCOUNT_BALANCE);
        g_trades_today       = 0;
        g_consecutive_losses = 0;
        g_daily_halt         = false;
        g_pause_until        = 0;
        return true;
    }
    return false;
}

double DayPnL()
{
    return AccountInfoDouble(ACCOUNT_BALANCE) - g_day_start_balance;
}

double CurrentDrawdownPercent()
{
    double balance = AccountInfoDouble(ACCOUNT_BALANCE);
    double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
    if (balance <= 0.0) return 0.0;
    return ((balance - equity) / balance) * 100.0;
}

bool SpreadOk()
{
    long spread = 0;
    if (!SymbolInfoInteger(S(), SYMBOL_SPREAD, spread)) return false;
    return (int)spread <= InpMaxSpreadPoints;
}

bool SessionOk()
{
    if (!InpUseSessionFilter) return true;
    MqlDateTime tm;
    TimeToStruct(TimeCurrent(), tm);
    if (InpSessionStartHourServer <= InpSessionEndHourServer)
        return tm.hour >= InpSessionStartHourServer && tm.hour < InpSessionEndHourServer;
    return tm.hour >= InpSessionStartHourServer || tm.hour < InpSessionEndHourServer;
}

bool ReadIndicatorLastTwo(const int handle, double &current, double &prev)
{
    double buff[];
    ArraySetAsSeries(buff, true);
    if (CopyBuffer(handle, 0, 0, 2, buff) < 2) return false;
    current = buff[0];
    prev    = buff[1];
    return true;
}

bool ReadIndicatorLastOne(const int handle, double &current)
{
    double buff[];
    ArraySetAsSeries(buff, true);
    if (CopyBuffer(handle, 0, 0, 1, buff) < 1) return false;
    current = buff[0];
    return true;
}

int ATRPoints()
{
    double atr = 0.0;
    if (!ReadIndicatorLastOne(hATR, atr)) return 0;
    return (int)MathRound(atr / Pt());
}

bool VolatilityRegimeOk()
{
    int atr = ATRPoints();
    if (atr <= 0) return false;
    return atr >= InpATRMinPoints && atr <= InpATRMaxPoints;
}

bool MarginHeadroomOk()
{
    double margin      = AccountInfoDouble(ACCOUNT_MARGIN);
    double free_margin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
    if (margin <= 0.0) return true;
    return (free_margin / margin) * 100.0 >= InpMinFreeMarginPercent;
}

int ClampInt(int value, int low, int high)
{
    if (value < low)  return low;
    if (value > high) return high;
    return value;
}

int DynamicSLPoints()
{
    int sl = (int)MathRound(ATRPoints() * InpSL_ATR_Multiplier);
    return ClampInt(sl, InpMinSLPoints, InpMaxSLPoints);
}

int DynamicTPPoints()
{
    int tp = (int)MathRound(ATRPoints() * InpTP_ATR_Multiplier);
    return ClampInt(tp, InpMinTPPoints, InpMaxTPPoints);
}

double NormalizeLots(double lots)
{
    double min_lot = SymbolInfoDouble(S(), SYMBOL_VOLUME_MIN);
    double max_lot = SymbolInfoDouble(S(), SYMBOL_VOLUME_MAX);
    double step    = SymbolInfoDouble(S(), SYMBOL_VOLUME_STEP);
    lots = MathMax(lots, min_lot);
    lots = MathMin(lots, max_lot);
    if (step <= 0.0) return lots;
    lots = MathFloor(lots / step) * step;
    return NormalizeDouble(lots, 2);
}

double CalcRiskLots(const int sl_points)
{
    double risk_pct = InpRiskPercentPerTrade;

    // Reduce size during a losing streak
    if (g_consecutive_losses >= InpLossStreakReduceAfter)
        risk_pct *= InpLossStreakRiskReduction;

    if (!InpUseRiskPercent) return NormalizeLots(InpFixedLots);

    double risk_money              = AccountInfoDouble(ACCOUNT_BALANCE) * (risk_pct / 100.0);
    double tick_value              = SymbolInfoDouble(S(), SYMBOL_TRADE_TICK_VALUE);
    double tick_size               = SymbolInfoDouble(S(), SYMBOL_TRADE_TICK_SIZE);
    if (tick_value <= 0.0 || tick_size <= 0.0 || sl_points <= 0)
        return NormalizeLots(InpFixedLots);
    double value_per_point_per_lot = tick_value * (Pt() / tick_size);
    if (value_per_point_per_lot <= 0.0)
        return NormalizeLots(InpFixedLots);
    double lots = risk_money / (sl_points * value_per_point_per_lot);
    return NormalizeLots(lots);
}

int CountOpenPositions()
{
    int count = 0;
    for (int i = PositionsTotal() - 1; i >= 0; --i)
    {
        if (PositionGetSymbol(i) == "") continue;
        if (PositionGetString(POSITION_SYMBOL) != S()) continue;
        if ((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
        count++;
    }
    return count;
}

bool GetPosition(double &open_price, double &sl, double &tp, long &type, ulong &ticket)
{
    for (int i = PositionsTotal() - 1; i >= 0; --i)
    {
        if (PositionGetSymbol(i) == "") continue;
        if (PositionGetString(POSITION_SYMBOL) != S()) continue;
        if ((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
        open_price = PositionGetDouble(POSITION_PRICE_OPEN);
        sl         = PositionGetDouble(POSITION_SL);
        tp         = PositionGetDouble(POSITION_TP);
        type       = PositionGetInteger(POSITION_TYPE);
        ticket     = (ulong)PositionGetInteger(POSITION_TICKET);
        return true;
    }
    return false;
}

bool PartialClosePosition(const ulong ticket, const double close_percent)
{
    if (!PositionSelectByTicket(ticket)) return false;
    double volume     = PositionGetDouble(POSITION_VOLUME);
    double min_lot    = SymbolInfoDouble(S(), SYMBOL_VOLUME_MIN);
    double step       = SymbolInfoDouble(S(), SYMBOL_VOLUME_STEP);
    double close_lots = volume * (close_percent / 100.0);
    if (step > 0.0) close_lots = MathFloor(close_lots / step) * step;
    close_lots = NormalizeDouble(close_lots, 2);
    if (close_lots < min_lot || close_lots >= volume) return false;
    return trade.PositionClosePartial(ticket, close_lots);
}

int Signal()
{
    double f0, f1, s0, s1, r0, r1;
    if (!ReadIndicatorLastTwo(hFastEMA, f0, f1)) return 0;
    if (!ReadIndicatorLastTwo(hSlowEMA, s0, s1)) return 0;
    if (!ReadIndicatorLastTwo(hRSI, r0, r1))     return 0;

    MqlTick tick;
    if (!SymbolInfoTick(S(), tick)) return 0;

    double point = Pt();

    bool m15_trend_up   = true;
    bool m15_trend_down = true;
    if (InpUseM15Filter)
    {
        double m0, m1;
        if (!ReadIndicatorLastTwo(hM15EMA, m0, m1)) return 0;
        m15_trend_up   = (m0 > m1);
        m15_trend_down = (m0 < m1);
    }

    bool up_trend   = f0 > s0 && f0 > f1;
    bool down_trend = f0 < s0 && f0 < f1;

    bool buy_pullback  = MathAbs((tick.bid - f0) / point) <= InpPullbackTolerancePoints;
    bool sell_pullback = MathAbs((tick.ask - f0) / point) <= InpPullbackTolerancePoints;

    if (up_trend   && buy_pullback  && r0 >= InpRSIBuyMin  && m15_trend_up)   return  1;
    if (down_trend && sell_pullback && r0 <= InpRSISellMax && m15_trend_down)  return -1;
    return 0;
}

bool CanTradeNow()
{
    if (g_session_halt) return false;
    if (g_daily_halt) return false;
    if (TimeCurrent() < g_pause_until) return false;
    if (!SessionOk()) return false;
    if (!SpreadOk()) return false;
    if (!VolatilityRegimeOk()) return false;
    if (!MarginHeadroomOk()) return false;
    if (CurrentDrawdownPercent() >= InpMaxDrawdownPercent) return false;
    if (g_trades_today >= InpMaxTradesPerDay) return false;
    return true;
}

void ManageOpenPosition()
{
    double open_price, sl, tp;
    long type;
    ulong ticket;
    if (!GetPosition(open_price, sl, tp, type, ticket)) return;

    MqlTick tick;
    if (!SymbolInfoTick(S(), tick)) return;

    double point    = Pt();
    double price    = (type == POSITION_TYPE_BUY) ? tick.bid : tick.ask;
    double move_pts = (type == POSITION_TYPE_BUY)
        ? (price - open_price) / point
        : (open_price - price) / point;

    // Quick loss cut — mirror of quick profit, prevents large losses
    if (move_pts <= -MathAbs(InpQuickLossClosePoints))
    {
        trade.PositionClose(ticket);
        return;
    }

    // Max age — kill stale trades before gaps or overnight moves can hurt
    datetime open_time = (datetime)PositionGetInteger(POSITION_TIME);
    if (InpMaxTradeAgeMinutes > 0 &&
        (int)(TimeCurrent() - open_time) >= InpMaxTradeAgeMinutes * 60)
    {
        trade.PositionClose(ticket);
        return;
    }

    if (move_pts >= InpQuickProfitClosePoints)
    {
        trade.PositionClose(ticket);
        return;
    }

    if (InpUltraFastMode && move_pts >= InpMicroTakePoints)
        PartialClosePosition(ticket, InpPartialClosePercent);

    if (InpCloseOnOppositeSignal)
    {
        int sig = Signal();
        if ((type == POSITION_TYPE_BUY  && sig < 0) ||
            (type == POSITION_TYPE_SELL && sig > 0))
        {
            trade.PositionClose(ticket);
            return;
        }
    }

    double new_sl = sl;

    if (move_pts >= InpBreakEvenTriggerPoints)
    {
        double be_sl = (type == POSITION_TYPE_BUY)
            ? open_price + InpBreakEvenLockPoints * point
            : open_price - InpBreakEvenLockPoints * point;
        if (type == POSITION_TYPE_BUY)
            new_sl = MathMax(new_sl, be_sl);
        else if (new_sl == 0.0)
            new_sl = be_sl;
        else
            new_sl = MathMin(new_sl, be_sl);
    }

    if (move_pts >= InpTrailingStartPoints)
    {
        double trail_sl = (type == POSITION_TYPE_BUY)
            ? price - InpTrailingStepPoints * point
            : price + InpTrailingStepPoints * point;
        if (type == POSITION_TYPE_BUY)
            new_sl = MathMax(new_sl, trail_sl);
        else if (new_sl == 0.0)
            new_sl = trail_sl;
        else
            new_sl = MathMin(new_sl, trail_sl);
    }

    if (new_sl != sl)
        trade.PositionModify(ticket, NormalizeDouble(new_sl, (int)SymbolInfoInteger(S(), SYMBOL_DIGITS)), tp);
}

void TryOpenTrade()
{
    if (!CanTradeNow()) return;
    if (CountOpenPositions() >= InpMaxOpenPositions) return;

    int cooldown = InpMinSecondsBetweenTrades;
    if (InpUltraFastMode && g_last_closed_was_profit) cooldown = 0;
    if ((int)(TimeCurrent() - g_last_trade_time) < cooldown) return;

    int sig = Signal();
    if (sig == 0) return;

    int sl_points = DynamicSLPoints();
    int tp_points = DynamicTPPoints();

    if (InpEnforceSLNotBiggerThanTP && sl_points > tp_points)
        sl_points = tp_points;

    double lots = CalcRiskLots(sl_points);
    if (lots <= 0.0) return;

    MqlTick tick;
    if (!SymbolInfoTick(S(), tick)) return;

    double point  = Pt();
    int    digits = (int)SymbolInfoInteger(S(), SYMBOL_DIGITS);
    double sl, tp;
    bool   sent = false;

    trade.SetExpertMagicNumber(InpMagic);
    trade.SetTypeFillingBySymbol(S());
    trade.SetDeviationInPoints(15);

    if (sig > 0)
    {
        sl   = tick.ask - sl_points * point;
        tp   = tick.ask + tp_points * point;
        sent = trade.Buy(lots, S(), tick.ask,
                         NormalizeDouble(sl, digits), NormalizeDouble(tp, digits), "TSFX_ULTRA");
    }
    else
    {
        sl   = tick.bid + sl_points * point;
        tp   = tick.bid - tp_points * point;
        sent = trade.Sell(lots, S(), tick.bid,
                          NormalizeDouble(sl, digits), NormalizeDouble(tp, digits), "TSFX_ULTRA");
    }

    if (sent)
    {
        g_last_trade_time = TimeCurrent();
        g_trades_today++;
    }
}

void CloseAllPositions()
{
    for (int i = PositionsTotal() - 1; i >= 0; --i)
    {
        if (PositionGetSymbol(i) == "") continue;
        if (PositionGetString(POSITION_SYMBOL) != S()) continue;
        if ((ulong)PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;
        trade.PositionClose((ulong)PositionGetInteger(POSITION_TICKET));
    }
}

void EnforceDailyProtection()
{
    double balance = AccountInfoDouble(ACCOUNT_BALANCE);

    // Session floor: permanent halt if balance dropped X% from EA-attach balance
    if (g_initial_balance > 0.0)
    {
        double session_loss_pct = ((g_initial_balance - balance) / g_initial_balance) * 100.0;
        if (session_loss_pct >= InpSessionFloorPercent)
        {
            g_session_halt = true;
            g_daily_halt   = true;
            CloseAllPositions();
            Print(StringFormat("SESSION FLOOR HIT: balance dropped %.1f%% from %.2f to %.2f. EA halted permanently.",
                               session_loss_pct, g_initial_balance, balance));
            return;
        }
    }

    // Daily loss limit: % of session-start balance
    double daily_limit = g_day_start_balance * (InpDailyLossLimitPercent / 100.0);
    if (DayPnL() <= -MathAbs(daily_limit))
    {
        g_daily_halt = true;
        CloseAllPositions();
        Print(StringFormat("DAILY HALT: day loss %.2f exceeded %.1f%% limit.", DayPnL(), InpDailyLossLimitPercent));
    }
}

int OnInit()
{
    if (!SymbolSelect(S(), true))
    {
        Print("Failed to select symbol: ", S());
        return INIT_FAILED;
    }

    g_initial_balance   = AccountInfoDouble(ACCOUNT_BALANCE);
    g_day_start_balance = g_initial_balance;

    hFastEMA = iMA(S(), PERIOD_M1,  InpFastEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
    hSlowEMA = iMA(S(), PERIOD_M1,  InpSlowEMAPeriod, 0, MODE_EMA, PRICE_CLOSE);
    hRSI     = iRSI(S(), PERIOD_M1, InpRSIPeriod, PRICE_CLOSE);
    hATR     = iATR(S(), PERIOD_M1, InpATRPeriod);
    hM15EMA  = iMA(S(), PERIOD_M15, InpM15EMAPeriod, 0, MODE_EMA, PRICE_CLOSE);

    if (hFastEMA == INVALID_HANDLE || hSlowEMA == INVALID_HANDLE ||
        hRSI     == INVALID_HANDLE || hATR     == INVALID_HANDLE ||
        hM15EMA  == INVALID_HANDLE)
    {
        Print("Indicator handle creation failed.");
        return INIT_FAILED;
    }

    string banner = StringFormat(
        "Team.Saintfx HF Scalper Ultra 2026 | %s | Magic: %d | Risk: %.2f%% | StreakReduce: after %d losses -> %.0f%%",
        S(), (int)InpMagic, InpRiskPercentPerTrade, InpLossStreakReduceAfter,
        InpLossStreakRiskReduction * 100.0);
    Print(banner);
    Comment(banner);

    IsNewTradingDay();
    return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
    Comment("");
    if (hFastEMA != INVALID_HANDLE) IndicatorRelease(hFastEMA);
    if (hSlowEMA != INVALID_HANDLE) IndicatorRelease(hSlowEMA);
    if (hRSI     != INVALID_HANDLE) IndicatorRelease(hRSI);
    if (hATR     != INVALID_HANDLE) IndicatorRelease(hATR);
    if (hM15EMA  != INVALID_HANDLE) IndicatorRelease(hM15EMA);
}

void OnTick()
{
    IsNewTradingDay();
    EnforceDailyProtection();

    if (g_session_halt)
    {
        Comment(StringFormat("SESSION FLOOR HIT - EA HALTED. Balance dropped %.1f%% from %.2f. Remove EA to reset.",
                             ((g_initial_balance - AccountInfoDouble(ACCOUNT_BALANCE)) / g_initial_balance) * 100.0,
                             g_initial_balance));
        return;
    }
    if (g_daily_halt)
    {
        Comment(StringFormat("DAILY HALT: %.1f%% day-loss limit reached. Resumes tomorrow.", InpDailyLossLimitPercent));
        return;
    }

    ManageOpenPosition();
    TryOpenTrade();

    string streak_info = g_consecutive_losses >= InpLossStreakReduceAfter
        ? StringFormat("REDUCED SIZE (%d losses)", g_consecutive_losses)
        : StringFormat("Full size (%d losses)", g_consecutive_losses);

    string status = StringFormat(
        "Team.Saintfx HF Scalper Ultra 2026 | %s | Magic:%d | Trades:%d/%d | DD:%.2f%% | Pause:%s | Risk: %s",
        S(),
        (int)InpMagic,
        g_trades_today,
        InpMaxTradesPerDay,
        CurrentDrawdownPercent(),
        (TimeCurrent() < g_pause_until ? "ON" : "OFF"),
        streak_info);
    Comment(status);
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest     &request,
                        const MqlTradeResult      &result)
{
    if (trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
    if (trans.symbol != S()) return;
    ulong deal = trans.deal;
    if (deal == 0) return;
    if ((ulong)HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagic) return;
    ENUM_DEAL_ENTRY entry_type = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(deal, DEAL_ENTRY);
    if (entry_type != DEAL_ENTRY_OUT) return;

    double profit = HistoryDealGetDouble(deal, DEAL_PROFIT)
                  + HistoryDealGetDouble(deal, DEAL_SWAP)
                  + HistoryDealGetDouble(deal, DEAL_COMMISSION);

    if (profit < 0.0)
    {
        g_last_closed_was_profit = false;
        g_consecutive_losses++;
        if (g_consecutive_losses >= InpMaxConsecutiveLosses)
        {
            g_pause_until        = TimeCurrent() + InpPauseMinutesAfterLossStreak * 60;
            g_consecutive_losses = 0;
            Print(StringFormat("Loss streak hit. Pausing %d minutes.", InpPauseMinutesAfterLossStreak));
        }
    }
    else
    {
        g_last_closed_was_profit = true;
        g_consecutive_losses     = 0;  // Win resets streak -> full size restored
    }
}
