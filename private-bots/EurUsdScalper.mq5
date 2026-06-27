//+------------------------------------------------------------------+
//|                                              EurUsdScalper.mq5   |
//|                          EUR/USD M1/M5 Scalping Expert Advisor   |
//|                                                                  |
//|  Strategy summary                                                |
//|  ----------------                                                |
//|  Primary entry logic: EMA pullback + RSI filter + ATR confirm.   |
//|    * Trend filter: Fast EMA (default 8) vs Slow EMA (default 21).|
//|      - Long bias  when FastEMA > SlowEMA                         |
//|      - Short bias when FastEMA < SlowEMA                         |
//|    * Pullback trigger: price closes back through the Fast EMA    |
//|      in the direction of the prevailing bias.                    |
//|    * Momentum filter: RSI(14) above/below configurable mid-band  |
//|      thresholds (default 55 / 45) confirms momentum, while a     |
//|      hard cap (>75 or <25) blocks chasing extreme moves.         |
//|    * Volatility confirm: ATR(14) must be above a minimum value   |
//|      (in pips) to avoid dead-market scalps and to size SL/TP.    |
//|                                                                  |
//|  Designed and tuned for EUR/USD on M1 and M5 (timeframe is an    |
//|  input). Drop into <DataFolder>/MQL5/Experts and compile.        |
//+------------------------------------------------------------------+
#property copyright "EurUsdScalper"
#property link      ""
#property version   "1.00"
#property strict
#property description "EUR/USD M1/M5 scalping EA: EMA pullback + RSI + ATR with advanced risk management, news filter, and alerts."

#include <Trade\Trade.mqh>
#include <Trade\PositionInfo.mqh>
#include <Trade\SymbolInfo.mqh>
#include <EurUsdScalper\RiskManager.mqh>
#include <EurUsdScalper\NewsFilter.mqh>
#include <EurUsdScalper\Alerts.mqh>

//--- Enums
enum ENUM_SL_MODE
  {
   SL_MODE_ATR    = 0,  // ATR-based stop loss / take profit
   SL_MODE_FIXED  = 1   // Fixed pip stop loss / take profit
  };

enum ENUM_TRAIL_MODE
  {
   TRAIL_MODE_OFF   = 0, // Trailing disabled
   TRAIL_MODE_PIPS  = 1, // Fixed pips trailing
   TRAIL_MODE_ATR   = 2  // ATR multiple trailing
  };

//--- Inputs : general
input group              "=== General ==="
input ENUM_TIMEFRAMES    InpTimeframe          = PERIOD_M5;     // Working timeframe (M1 or M5)
input string             InpSymbol             = "EURUSD";      // Trading symbol (EUR/USD)
input long               InpMagic              = 20260416;      // Magic number
input string             InpComment            = "EUScalp";     // Order comment

//--- Inputs : signal
input group              "=== Signal ==="
input int                InpFastEMA            = 8;             // Fast EMA period
input int                InpSlowEMA            = 21;            // Slow EMA period
input int                InpRsiPeriod          = 14;            // RSI period
input double             InpRsiBuyMin          = 55.0;          // RSI minimum for long
input double             InpRsiBuyMax          = 75.0;          // RSI hard cap for long
input double             InpRsiSellMax         = 45.0;          // RSI maximum for short
input double             InpRsiSellMin         = 25.0;          // RSI hard cap for short
input int                InpAtrPeriod          = 14;            // ATR period
input double             InpAtrMinPips         = 1.5;           // Minimum ATR in pips to trade

//--- Inputs : risk & sizing
input group              "=== Risk Management ==="
input double             InpRiskPercent        = 0.5;           // Risk % of balance per trade
input ENUM_SL_MODE       InpSlMode             = SL_MODE_ATR;   // SL/TP mode
input double             InpAtrSlMult          = 1.5;           // ATR multiple for SL
input double             InpAtrTpMult          = 2.0;           // ATR multiple for TP
input double             InpFixedSlPips        = 8.0;           // Fixed SL (pips)
input double             InpFixedTpPips        = 12.0;          // Fixed TP (pips)
input int                InpMaxTrades          = 1;             // Max concurrent open trades
input double             InpMaxDailyLossPct    = 3.0;           // Max daily loss (% of balance, 0=off)
input double             InpMaxDailyLossCcy    = 0.0;           // Max daily loss (account currency, 0=off)

//--- Inputs : trailing
input group              "=== Trailing Stop ==="
input ENUM_TRAIL_MODE    InpTrailMode          = TRAIL_MODE_ATR;// Trailing mode
input double             InpTrailTriggerPips   = 6.0;           // Trigger distance (pips)
input double             InpTrailStepPips      = 3.0;           // Step (pips)
input double             InpTrailAtrMult       = 1.0;           // ATR multiple (when ATR mode)

//--- Inputs : news filter
input group              "=== News Filter ==="
input bool               InpUseNewsFilter      = true;          // Enable news filter
input int                InpNewsMinutesBefore  = 15;            // Block trades N minutes before news
input int                InpNewsMinutesAfter   = 15;            // Block trades N minutes after news
input string             InpNewsCsvFile        = "news.csv";    // CSV fallback in MQL5/Files (yyyy.mm.dd HH:MM,CCY,IMPACT)

//--- Inputs : alerts
input group              "=== Alerts ==="
input bool               InpAlertPopup         = true;          // Popup alerts
input bool               InpAlertSound         = true;          // Sound alerts
input string             InpAlertSoundFile     = "alert.wav";   // Sound file
input bool               InpAlertPush          = false;         // Push notifications

//--- Globals
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
double            gPipSize     = 0.0;     // 1 pip in price units (0.0001 for 5-digit it's 10*point)

//+------------------------------------------------------------------+
//| Helpers                                                          |
//+------------------------------------------------------------------+
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

//+------------------------------------------------------------------+
//| OnInit                                                           |
//+------------------------------------------------------------------+
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

   PrintFormat("EurUsdScalper initialized on %s %s. Pip=%.5f Risk%%=%.2f",
               InpSymbol, EnumToString(InpTimeframe), gPipSize, InpRiskPercent);
   return INIT_SUCCEEDED;
  }

//+------------------------------------------------------------------+
//| OnDeinit                                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   if(hFastEMA != INVALID_HANDLE) IndicatorRelease(hFastEMA);
   if(hSlowEMA != INVALID_HANDLE) IndicatorRelease(hSlowEMA);
   if(hRSI     != INVALID_HANDLE) IndicatorRelease(hRSI);
   if(hATR     != INVALID_HANDLE) IndicatorRelease(hATR);
  }

//+------------------------------------------------------------------+
//| Indicator readers (return false on failure)                      |
//+------------------------------------------------------------------+
bool ReadIndicators(double &fastEma, double &slowEma, double &rsi, double &atr,
                    double &prevClose, double &lastClose, double &prevFastEma)
  {
   double bufF[3], bufS[3], bufR[3], bufA[1];
   if(CopyBuffer(hFastEMA, 0, 0, 3, bufF) != 3) return false;
   if(CopyBuffer(hSlowEMA, 0, 0, 3, bufS) != 3) return false;
   if(CopyBuffer(hRSI,     0, 0, 3, bufR) != 3) return false;
   if(CopyBuffer(hATR,     0, 1, 1, bufA) != 1) return false;

   //--- We use bar index 1 (last closed) for signals to avoid repaint
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

//+------------------------------------------------------------------+
//| Signal evaluation                                                |
//|  returns +1 long, -1 short, 0 none                               |
//+------------------------------------------------------------------+
int EvaluateSignal(double &atrOut)
  {
   double fastEma, slowEma, rsi, atr, prevClose, lastClose, prevFastEma;
   if(!ReadIndicators(fastEma, slowEma, rsi, atr, prevClose, lastClose, prevFastEma))
      return 0;

   atrOut = atr;
   double atrPips = PriceToPips(atr);
   if(atrPips < InpAtrMinPips) return 0;

   //--- Long: trend up, RSI in momentum band, pullback through fast EMA
   bool trendUp   = (fastEma > slowEma);
   bool trendDn   = (fastEma < slowEma);
   bool rsiLongOk = (rsi >= InpRsiBuyMin && rsi <= InpRsiBuyMax);
   bool rsiShortOk= (rsi <= InpRsiSellMax && rsi >= InpRsiSellMin);

   //--- Pullback: previous bar closed below fast EMA, current closed above (long)
   bool pullbackLong  = (prevClose < prevFastEma) && (lastClose > fastEma);
   bool pullbackShort = (prevClose > prevFastEma) && (lastClose < fastEma);

   if(trendUp && rsiLongOk  && pullbackLong)  return +1;
   if(trendDn && rsiShortOk && pullbackShort) return -1;
   return 0;
  }

//+------------------------------------------------------------------+
//| Compute SL/TP prices for a new entry                             |
//+------------------------------------------------------------------+
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
   //--- enforce broker minimum stop distance
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

//+------------------------------------------------------------------+
//| Place a market order                                             |
//+------------------------------------------------------------------+
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
      Print("Lot calc returned 0 — skipping entry");
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

//+------------------------------------------------------------------+
//| Trailing stop manager                                            |
//+------------------------------------------------------------------+
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

//+------------------------------------------------------------------+
//| OnTick                                                           |
//+------------------------------------------------------------------+
void OnTick()
  {
   //--- daily P&L update + cutoff
   risk.UpdateDaily();
   bool dailyBlocked = risk.IsDailyLossHit();
   if(dailyBlocked && !risk.AlertedDaily())
     {
      alerts.NotifyDailyLossHit(risk.DailyPnL());
      risk.MarkDailyAlerted();
     }

   //--- manage trailing every tick
   double atrNow[1];
   double atr = 0.0;
   if(CopyBuffer(hATR, 0, 1, 1, atrNow) == 1)
     {
      atr = atrNow[0];
      ManageTrailing(atr);
     }

   //--- only evaluate entries on a new bar of the working timeframe
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

//+------------------------------------------------------------------+
//| OnTradeTransaction — fires on close / SL / TP hits               |
//+------------------------------------------------------------------+
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
//+------------------------------------------------------------------+
