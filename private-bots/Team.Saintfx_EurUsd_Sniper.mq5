//+------------------------------------------------------------------+
//|                              Team.Saintfx_EurUsd_Sniper.mq5      |
//|                                                                  |
//|        ████████╗███████╗ █████╗ ███╗   ███╗                      |
//|        ╚══██╔══╝██╔════╝██╔══██╗████╗ ████║                      |
//|           ██║   █████╗  ███████║██╔████╔██║                      |
//|           ██║   ██╔══╝  ██╔══██║██║╚██╔╝██║                      |
//|           ██║   ███████╗██║  ██║██║ ╚═╝ ██║                      |
//|           ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝                      |
//|                  S A I N T F X                                   |
//|         "Hunt the pullback. Bank the pip. Repeat."               |
//|                                                                  |
//|     EUR/USD Sniper — single-file scalping EA                     |
//|     EMA pullback + RSI momentum + ATR confirm                    |
//|     Risk Manager + News Filter + Alerts (all inlined)            |
//+------------------------------------------------------------------+
#property copyright "Team.Saintfx"
#property link      "https://saintdbot--saintob.replit.app"
#property version   "1.10"
#property strict
#property description "Team.Saintfx EUR/USD Sniper — Hunt the pullback. Bank the pip. Repeat."
#property description " "
#property description "Single-file scalping EA for EUR/USD (M1/M5)."
#property description "EMA pullback + RSI + ATR signal, dynamic risk %, news filter, smart trailing."

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\SymbolInfo.mqh>

//==================================================================
// Inlined: CRiskManager
//==================================================================
class CRiskManager
  {
private:
   string   m_symbol;
   long     m_magic;
   double   m_riskPct;
   double   m_maxDailyLossPct;
   double   m_maxDailyLossCcy;
   int      m_maxTrades;

   datetime m_dayStart;
   double   m_dayStartBalance;
   double   m_dayRealizedPnL;
   bool     m_dailyAlerted;

   datetime DayStartOf(const datetime t) const
     {
      MqlDateTime mdt;
      TimeToStruct(t, mdt);
      mdt.hour = 0; mdt.min = 0; mdt.sec = 0;
      return StructToTime(mdt);
     }

   void RecomputeRealized()
     {
      m_dayRealizedPnL = 0.0;
      datetime to = TimeCurrent() + 1;
      if(!HistorySelect(m_dayStart, to)) return;
      int total = HistoryDealsTotal();
      for(int i = 0; i < total; ++i)
        {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket == 0) continue;
         if(HistoryDealGetString(ticket, DEAL_SYMBOL) != m_symbol) continue;
         if(HistoryDealGetInteger(ticket, DEAL_MAGIC) != m_magic) continue;
         long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
         m_dayRealizedPnL += HistoryDealGetDouble(ticket, DEAL_PROFIT)
                           + HistoryDealGetDouble(ticket, DEAL_SWAP)
                           + HistoryDealGetDouble(ticket, DEAL_COMMISSION);
        }
     }

public:
   void Init(const string symbol, const long magic, const double riskPct,
             const double maxDailyLossPct, const double maxDailyLossCcy,
             const int maxTrades)
     {
      m_symbol           = symbol;
      m_magic            = magic;
      m_riskPct          = riskPct;
      m_maxDailyLossPct  = maxDailyLossPct;
      m_maxDailyLossCcy  = maxDailyLossCcy;
      m_maxTrades        = maxTrades;
      m_dayStart         = DayStartOf(TimeCurrent());
      m_dayStartBalance  = AccountInfoDouble(ACCOUNT_BALANCE);
      m_dayRealizedPnL   = 0.0;
      m_dailyAlerted     = false;
      RecomputeRealized();
     }

   void UpdateDaily()
     {
      datetime today = DayStartOf(TimeCurrent());
      if(today != m_dayStart)
        {
         m_dayStart        = today;
         m_dayStartBalance = AccountInfoDouble(ACCOUNT_BALANCE);
         m_dayRealizedPnL  = 0.0;
         m_dailyAlerted    = false;
        }
      RecomputeRealized();
     }

   double DailyPnL() const { return m_dayRealizedPnL; }

   bool IsDailyLossHit() const
     {
      if(m_dayRealizedPnL >= 0.0) return false;
      double loss = -m_dayRealizedPnL;
      if(m_maxDailyLossCcy > 0.0 && loss >= m_maxDailyLossCcy) return true;
      if(m_maxDailyLossPct > 0.0 && m_dayStartBalance > 0.0 &&
         loss >= m_dayStartBalance * (m_maxDailyLossPct / 100.0))
         return true;
      return false;
     }

   bool AlertedDaily() const { return m_dailyAlerted; }
   void MarkDailyAlerted()   { m_dailyAlerted = true; }

   double CalcLot(const double slPips) const
     {
      if(slPips <= 0.0) return 0.0;
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double riskAmount = balance * (m_riskPct / 100.0);
      if(riskAmount <= 0.0) return 0.0;

      double tickValue = SymbolInfoDouble(m_symbol, SYMBOL_TRADE_TICK_VALUE);
      double tickSize  = SymbolInfoDouble(m_symbol, SYMBOL_TRADE_TICK_SIZE);
      double point     = SymbolInfoDouble(m_symbol, SYMBOL_POINT);
      int    digits    = (int)SymbolInfoInteger(m_symbol, SYMBOL_DIGITS);
      if(tickValue <= 0.0 || tickSize <= 0.0 || point <= 0.0) return 0.0;

      double pipSize = (digits == 3 || digits == 5) ? point * 10.0 : point;
      double pipValuePerLot = (pipSize / tickSize) * tickValue;
      if(pipValuePerLot <= 0.0) return 0.0;

      double lots = riskAmount / (slPips * pipValuePerLot);

      double minLot  = SymbolInfoDouble(m_symbol, SYMBOL_VOLUME_MIN);
      double maxLot  = SymbolInfoDouble(m_symbol, SYMBOL_VOLUME_MAX);
      double stepLot = SymbolInfoDouble(m_symbol, SYMBOL_VOLUME_STEP);
      if(stepLot <= 0.0) stepLot = 0.01;

      lots = MathFloor(lots / stepLot) * stepLot;
      if(lots < minLot) return 0.0;
      if(lots > maxLot) lots = maxLot;
      return NormalizeDouble(lots, 2);
     }
  };

//==================================================================
// Inlined: CNewsFilter
//==================================================================
class CNewsFilter
  {
private:
   bool       m_enabled;
   int        m_minBefore;
   int        m_minAfter;
   string     m_csvFile;

   datetime   m_csvTimes[];
   bool       m_csvLoaded;
   datetime   m_csvLoadedAt;

   datetime   m_nextEventTime;
   string     m_nextEventDesc;

   datetime   m_lastAlertAt;

   void LoadCsv()
     {
      ArrayResize(m_csvTimes, 0);
      m_csvLoaded   = true;
      m_csvLoadedAt = TimeCurrent();
      if(StringLen(m_csvFile) == 0) return;

      int h = FileOpen(m_csvFile, FILE_READ | FILE_TXT | FILE_ANSI);
      if(h == INVALID_HANDLE) { Print("News CSV not found: ", m_csvFile); return; }

      while(!FileIsEnding(h))
        {
         string line = FileReadString(h);
         if(StringLen(line) == 0) continue;
         if(StringGetCharacter(line, 0) == '#') continue;
         string parts[];
         int n = StringSplit(line, ',', parts);
         if(n < 3) continue;
         string ts  = parts[0]; StringTrimLeft(ts);  StringTrimRight(ts);
         string ccy = parts[1]; StringTrimLeft(ccy); StringTrimRight(ccy);
         string imp = parts[2]; StringTrimLeft(imp); StringTrimRight(imp);
         StringToUpper(ccy); StringToUpper(imp);
         if(ccy != "EUR" && ccy != "USD") continue;
         if(imp != "HIGH") continue;
         datetime t = StringToTime(ts);
         if(t > 0)
           {
            int sz = ArraySize(m_csvTimes);
            ArrayResize(m_csvTimes, sz + 1);
            m_csvTimes[sz] = t;
           }
        }
      FileClose(h);
      PrintFormat("News CSV loaded %d entries from %s", ArraySize(m_csvTimes), m_csvFile);
     }

   bool CheckCalendar(const datetime now, datetime &nextEvtOut, string &nextDescOut)
     {
      datetime from = now - m_minAfter * 60;
      datetime to   = now + m_minBefore * 60;
      MqlCalendarValue values[];
      int got = CalendarValueHistory(values, from, to, NULL, NULL);
      if(got <= 0) return false;
      for(int i = 0; i < got; ++i)
        {
         MqlCalendarEvent ev;
         if(!CalendarEventById(values[i].event_id, ev)) continue;
         if(ev.importance != CALENDAR_IMPORTANCE_HIGH) continue;
         MqlCalendarCountry ctry;
         if(!CalendarCountryById(ev.country_id, ctry)) continue;
         string code = ctry.currency;
         if(code != "EUR" && code != "USD") continue;
         nextEvtOut  = values[i].time;
         nextDescOut = StringFormat("%s %s", code, ev.name);
         return true;
        }
      return false;
     }

public:
   void Init(const bool enabled, const int minutesBefore, const int minutesAfter,
             const string csvFile)
     {
      m_enabled      = enabled;
      m_minBefore    = minutesBefore;
      m_minAfter     = minutesAfter;
      m_csvFile      = csvFile;
      m_csvLoaded    = false;
      m_lastAlertAt  = 0;
      m_nextEventTime= 0;
      m_nextEventDesc= "";
      ArrayResize(m_csvTimes, 0);
     }

   bool IsBlocked(const datetime now)
     {
      if(!m_enabled) return false;

      datetime evt = 0;
      string   desc = "";
      if(CheckCalendar(now, evt, desc))
        {
         m_nextEventTime = evt;
         m_nextEventDesc = desc;
         return true;
        }

      if(!m_csvLoaded || (now - m_csvLoadedAt) > 24 * 3600)
         LoadCsv();

      int n = ArraySize(m_csvTimes);
      for(int i = 0; i < n; ++i)
        {
         datetime t = m_csvTimes[i];
         if(now >= t - m_minBefore * 60 && now <= t + m_minAfter * 60)
           {
            m_nextEventTime = t;
            m_nextEventDesc = "CSV event @ " + TimeToString(t, TIME_DATE | TIME_MINUTES);
            return true;
           }
        }
      return false;
     }

   bool   AlertedRecently()
     {
      datetime now = TimeCurrent();
      return (m_lastAlertAt != 0 && (now - m_lastAlertAt) < 300);
     }
   void   MarkAlerted() { m_lastAlertAt = TimeCurrent(); }
   string NextEventDescription() const { return m_nextEventDesc; }
  };

//==================================================================
// Inlined: CAlertsModule
//==================================================================
class CAlertsModule
  {
private:
   bool   m_popup;
   bool   m_sound;
   string m_soundFile;
   bool   m_push;
   string m_symbol;

   void Send(const string msg)
     {
      if(m_popup) Alert(msg);
      else        Print(msg);
      if(m_sound && StringLen(m_soundFile) > 0) PlaySound(m_soundFile);
      if(m_push)  SendNotification(msg);
     }

public:
   void Init(const bool popup, const bool sound, const string soundFile,
             const bool push, const string symbol)
     {
      m_popup     = popup;
      m_sound     = sound;
      m_soundFile = soundFile;
      m_push      = push;
      m_symbol    = symbol;
     }

   void NotifyTradeOpen(const bool isLong, const double lots, const double entry,
                        const double sl, const double tp)
     {
      string side = (isLong ? "BUY" : "SELL");
      string msg = StringFormat("[%s] %s OPEN %.2f lots @ %.5f SL=%.5f TP=%.5f",
                                m_symbol, side, lots, entry, sl, tp);
      Send(msg);
     }

   void NotifyTradeClose(const double profit, const string reason)
     {
      string msg = StringFormat("[%s] CLOSE (%s) P&L=%.2f %s",
                                m_symbol, reason, profit,
                                AccountInfoString(ACCOUNT_CURRENCY));
      Send(msg);
     }

   void NotifyDailyLossHit(const double dailyPnL)
     {
      string msg = StringFormat("[%s] DAILY LOSS LIMIT HIT (P&L=%.2f) - new trades disabled for today",
                                m_symbol, dailyPnL);
      Send(msg);
     }

   void NotifyNewsPause(const string desc)
     {
      string msg = StringFormat("[%s] NEWS PAUSE - %s", m_symbol, desc);
      Send(msg);
     }
  };

//==================================================================
// Enums and inputs
//==================================================================
enum ENUM_SL_MODE
  {
   SL_MODE_ATR    = 0,
   SL_MODE_FIXED  = 1
  };

enum ENUM_TRAIL_MODE
  {
   TRAIL_MODE_OFF   = 0,
   TRAIL_MODE_PIPS  = 1,
   TRAIL_MODE_ATR   = 2
  };

input group              "=== General ==="
input ENUM_TIMEFRAMES    InpTimeframe          = PERIOD_M5;
input string             InpSymbol             = "EURUSD";
input long               InpMagic              = 20260416;
input string             InpComment            = "Saintfx_Sniper";

input group              "=== Signal ==="
input int                InpFastEMA            = 8;
input int                InpSlowEMA            = 21;
input int                InpRsiPeriod          = 14;
input double             InpRsiBuyMin          = 55.0;
input double             InpRsiBuyMax          = 75.0;
input double             InpRsiSellMax         = 45.0;
input double             InpRsiSellMin         = 25.0;
input int                InpAtrPeriod          = 14;
input double             InpAtrMinPips         = 1.5;

input group              "=== Risk Management ==="
input double             InpRiskPercent        = 0.5;
input ENUM_SL_MODE       InpSlMode             = SL_MODE_ATR;
input double             InpAtrSlMult          = 1.5;
input double             InpAtrTpMult          = 2.0;
input double             InpFixedSlPips        = 8.0;
input double             InpFixedTpPips        = 12.0;
input int                InpMaxTrades          = 1;
input double             InpMaxDailyLossPct    = 3.0;
input double             InpMaxDailyLossCcy    = 0.0;

input group              "=== Trailing Stop ==="
input ENUM_TRAIL_MODE    InpTrailMode          = TRAIL_MODE_ATR;
input double             InpTrailTriggerPips   = 6.0;
input double             InpTrailStepPips      = 3.0;
input double             InpTrailAtrMult       = 1.0;

input group              "=== News Filter ==="
input bool               InpUseNewsFilter      = true;
input int                InpNewsMinutesBefore  = 15;
input int                InpNewsMinutesAfter   = 15;
input string             InpNewsCsvFile        = "news.csv";

input group              "=== Alerts ==="
input bool               InpAlertPopup         = true;
input bool               InpAlertSound         = true;
input string             InpAlertSoundFile     = "alert.wav";
input bool               InpAlertPush          = false;

//==================================================================
// Globals
//==================================================================
CTrade            trade;
CPositionInfo     pos;
CSymbolInfo       sym;
CRiskManager      risk;
CNewsFilter       news;
CAlertsModule     alerts;

int               hFastEMA = INVALID_HANDLE;
int               hSlowEMA = INVALID_HANDLE;
int               hRSI     = INVALID_HANDLE;
int               hATR     = INVALID_HANDLE;

datetime          gLastBarTime = 0;
double            gPipSize     = 0.0;

//==================================================================
// Helpers
//==================================================================
double PipSize()
  {
   int    digits = (int)SymbolInfoInteger(InpSymbol, SYMBOL_DIGITS);
   double point  = SymbolInfoDouble(InpSymbol,  SYMBOL_POINT);
   if(digits == 3 || digits == 5)
      return point * 10.0;
   return point;
  }

double PipsToPrice(const double pips) { return pips * gPipSize; }
double PriceToPips(const double price){ return (gPipSize > 0.0 ? price / gPipSize : 0.0); }

bool IsNewBar()
  {
   datetime t = iTime(InpSymbol, InpTimeframe, 0);
   if(t == 0) return false;
   if(t == gLastBarTime) return false;
   gLastBarTime = t;
   return true;
  }

int CountOurPositions()
  {
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; --i)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!pos.SelectByTicket(ticket)) continue;
      if(pos.Symbol() != InpSymbol) continue;
      if(pos.Magic()  != InpMagic)  continue;
      ++n;
     }
   return n;
  }

//==================================================================
// OnInit / OnDeinit
//==================================================================
int OnInit()
  {
   if(InpTimeframe != PERIOD_M1 && InpTimeframe != PERIOD_M5)
      Print("Warning: EA is tuned for M1/M5; using a different timeframe.");

   if(!sym.Name(InpSymbol))
     {
      Print("Symbol not available: ", InpSymbol);
      return INIT_FAILED;
     }
   sym.Refresh();
   sym.RefreshRates();

   gPipSize = PipSize();
   if(gPipSize <= 0.0)
     {
      Print("Invalid pip size for ", InpSymbol);
      return INIT_FAILED;
     }

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetTypeFillingBySymbol(InpSymbol);
   trade.SetDeviationInPoints(10);
   trade.SetAsyncMode(false);

   hFastEMA = iMA(InpSymbol, InpTimeframe, InpFastEMA, 0, MODE_EMA, PRICE_CLOSE);
   hSlowEMA = iMA(InpSymbol, InpTimeframe, InpSlowEMA, 0, MODE_EMA, PRICE_CLOSE);
   hRSI     = iRSI(InpSymbol, InpTimeframe, InpRsiPeriod, PRICE_CLOSE);
   hATR     = iATR(InpSymbol, InpTimeframe, InpAtrPeriod);

   if(hFastEMA == INVALID_HANDLE || hSlowEMA == INVALID_HANDLE ||
      hRSI     == INVALID_HANDLE || hATR     == INVALID_HANDLE)
     {
      Print("Failed to create indicator handles");
      return INIT_FAILED;
     }

   risk.Init(InpSymbol, InpMagic, InpRiskPercent,
             InpMaxDailyLossPct, InpMaxDailyLossCcy, InpMaxTrades);

   news.Init(InpUseNewsFilter, InpNewsMinutesBefore, InpNewsMinutesAfter, InpNewsCsvFile);

   alerts.Init(InpAlertPopup, InpAlertSound, InpAlertSoundFile, InpAlertPush, InpSymbol);

   PrintFormat("Team.Saintfx EUR/USD Sniper armed on %s %s | Pip=%.5f | Risk=%.2f%% | Hunt the pullback.",
               InpSymbol, EnumToString(InpTimeframe), gPipSize, InpRiskPercent);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   if(hFastEMA != INVALID_HANDLE) IndicatorRelease(hFastEMA);
   if(hSlowEMA != INVALID_HANDLE) IndicatorRelease(hSlowEMA);
   if(hRSI     != INVALID_HANDLE) IndicatorRelease(hRSI);
   if(hATR     != INVALID_HANDLE) IndicatorRelease(hATR);
  }

//==================================================================
// Indicator readers
//==================================================================
bool ReadIndicators(double &fastEma, double &slowEma, double &rsi, double &atr,
                    double &prevClose, double &lastClose, double &prevFastEma)
  {
   double bufF[3], bufS[3], bufR[3], bufA[1];
   if(CopyBuffer(hFastEMA, 0, 0, 3, bufF) != 3) return false;
   if(CopyBuffer(hSlowEMA, 0, 0, 3, bufS) != 3) return false;
   if(CopyBuffer(hRSI,     0, 0, 3, bufR) != 3) return false;
   if(CopyBuffer(hATR,     0, 1, 1, bufA) != 1) return false;

   fastEma     = bufF[1];
   slowEma     = bufS[1];
   rsi         = bufR[1];
   atr         = bufA[0];
   prevFastEma = bufF[2];

   double closes[3];
   if(CopyClose(InpSymbol, InpTimeframe, 0, 3, closes) != 3) return false;
   lastClose = closes[1];
   prevClose = closes[2];
   return true;
  }

int EvaluateSignal(double &atrOut)
  {
   double fastEma, slowEma, rsi, atr, prevClose, lastClose, prevFastEma;
   if(!ReadIndicators(fastEma, slowEma, rsi, atr, prevClose, lastClose, prevFastEma))
      return 0;

   atrOut = atr;
   double atrPips = PriceToPips(atr);
   if(atrPips < InpAtrMinPips) return 0;

   bool trendUp   = (fastEma > slowEma);
   bool trendDn   = (fastEma < slowEma);
   bool rsiLongOk = (rsi >= InpRsiBuyMin && rsi <= InpRsiBuyMax);
   bool rsiShortOk= (rsi <= InpRsiSellMax && rsi >= InpRsiSellMin);

   bool pullbackLong  = (prevClose < prevFastEma) && (lastClose > fastEma);
   bool pullbackShort = (prevClose > prevFastEma) && (lastClose < fastEma);

   if(trendUp && rsiLongOk  && pullbackLong)  return +1;
   if(trendDn && rsiShortOk && pullbackShort) return -1;
   return 0;
  }

void ComputeSlTp(const int dir, const double entry, const double atr,
                 double &slPrice, double &tpPrice, double &slPips)
  {
   double slDistPips, tpDistPips;
   if(InpSlMode == SL_MODE_ATR)
     {
      slDistPips = PriceToPips(atr) * InpAtrSlMult;
      tpDistPips = PriceToPips(atr) * InpAtrTpMult;
     }
   else
     {
      slDistPips = InpFixedSlPips;
      tpDistPips = InpFixedTpPips;
     }
   long   stopsLevel = SymbolInfoInteger(InpSymbol, SYMBOL_TRADE_STOPS_LEVEL);
   double minDist    = stopsLevel * SymbolInfoDouble(InpSymbol, SYMBOL_POINT);
   double slDist = MathMax(PipsToPrice(slDistPips), minDist + gPipSize);
   double tpDist = MathMax(PipsToPrice(tpDistPips), minDist + gPipSize);

   if(dir > 0)
     {
      slPrice = entry - slDist;
      tpPrice = entry + tpDist;
     }
   else
     {
      slPrice = entry + slDist;
      tpPrice = entry - tpDist;
     }
   slPips = PriceToPips(slDist);
  }

void TryEnter(const int dir, const double atr)
  {
   if(CountOurPositions() >= InpMaxTrades) return;

   sym.RefreshRates();
   double entry  = (dir > 0 ? sym.Ask() : sym.Bid());
   double slPrice, tpPrice, slPips;
   ComputeSlTp(dir, entry, atr, slPrice, tpPrice, slPips);

   double lots = risk.CalcLot(slPips);
   if(lots <= 0.0)
     {
      Print("Lot calc returned 0 - skipping entry");
      return;
     }

   bool ok = false;
   if(dir > 0)
      ok = trade.Buy (lots, InpSymbol, entry, slPrice, tpPrice, InpComment);
   else
      ok = trade.Sell(lots, InpSymbol, entry, slPrice, tpPrice, InpComment);

   if(ok)
     {
      alerts.NotifyTradeOpen(dir > 0, lots, entry, slPrice, tpPrice);
     }
   else
     {
      PrintFormat("Order failed: ret=%u %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
     }
  }

void ManageTrailing(const double atr)
  {
   if(InpTrailMode == TRAIL_MODE_OFF) return;

   double trailDist;
   if(InpTrailMode == TRAIL_MODE_ATR)
      trailDist = atr * InpTrailAtrMult;
   else
      trailDist = PipsToPrice(InpTrailStepPips);

   double triggerDist = PipsToPrice(InpTrailTriggerPips);
   sym.RefreshRates();

   for(int i = PositionsTotal() - 1; i >= 0; --i)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!pos.SelectByTicket(ticket)) continue;
      if(pos.Symbol() != InpSymbol) continue;
      if(pos.Magic()  != InpMagic)  continue;

      double openPrice = pos.PriceOpen();
      double curSL     = pos.StopLoss();
      double curTP     = pos.TakeProfit();

      if(pos.PositionType() == POSITION_TYPE_BUY)
        {
         double bid = sym.Bid();
         if(bid - openPrice < triggerDist) continue;
         double newSL = bid - trailDist;
         if(newSL > openPrice && (curSL == 0.0 || newSL > curSL + gPipSize * 0.5))
            trade.PositionModify(ticket, NormalizeDouble(newSL, sym.Digits()), curTP);
        }
      else if(pos.PositionType() == POSITION_TYPE_SELL)
        {
         double ask = sym.Ask();
         if(openPrice - ask < triggerDist) continue;
         double newSL = ask + trailDist;
         if(newSL < openPrice && (curSL == 0.0 || newSL < curSL - gPipSize * 0.5))
            trade.PositionModify(ticket, NormalizeDouble(newSL, sym.Digits()), curTP);
        }
     }
  }

//==================================================================
// OnTick
//==================================================================
void OnTick()
  {
   risk.UpdateDaily();
   bool dailyBlocked = risk.IsDailyLossHit();
   if(dailyBlocked && !risk.AlertedDaily())
     {
      alerts.NotifyDailyLossHit(risk.DailyPnL());
      risk.MarkDailyAlerted();
     }

   double atrNow[1];
   double atr = 0.0;
   if(CopyBuffer(hATR, 0, 1, 1, atrNow) == 1)
     {
      atr = atrNow[0];
      ManageTrailing(atr);
     }

   if(!IsNewBar()) return;
   if(dailyBlocked) return;

   if(news.IsBlocked(TimeCurrent()))
     {
      if(!news.AlertedRecently())
        {
         alerts.NotifyNewsPause(news.NextEventDescription());
         news.MarkAlerted();
        }
      return;
     }

   double atrSig = 0.0;
   int sig = EvaluateSignal(atrSig);
   if(sig == 0) return;
   TryEnter(sig, atrSig);
  }

//==================================================================
// OnTradeTransaction
//==================================================================
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(trans.symbol != InpSymbol) return;

   ulong dealTicket = trans.deal;
   if(dealTicket == 0) return;
   if(!HistoryDealSelect(dealTicket)) return;

   long magic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
   if(magic != InpMagic) return;

   long entryType = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   if(entryType != DEAL_ENTRY_OUT && entryType != DEAL_ENTRY_INOUT) return;

   double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT)
                 + HistoryDealGetDouble(dealTicket, DEAL_SWAP)
                 + HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
   long   reason = HistoryDealGetInteger(dealTicket, DEAL_REASON);

   string reasonStr = "manual/other";
   if(reason == DEAL_REASON_SL) reasonStr = "stop loss";
   else if(reason == DEAL_REASON_TP) reasonStr = "take profit";
   else if(reason == DEAL_REASON_EXPERT) reasonStr = "expert";
   else if(reason == DEAL_REASON_SO) reasonStr = "stop out";

   alerts.NotifyTradeClose(profit, reasonStr);
  }
