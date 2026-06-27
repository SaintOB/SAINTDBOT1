//+------------------------------------------------------------------+
//|                                              RiskManager.mqh     |
//|  Dynamic lot sizing, daily P&L tracker, max-trades guard.        |
//+------------------------------------------------------------------+
#ifndef __EUS_RISKMANAGER_MQH__
#define __EUS_RISKMANAGER_MQH__

class CRiskManager
  {
private:
   string   m_symbol;
   long     m_magic;
   double   m_riskPct;
   double   m_maxDailyLossPct;     // % of balance, 0 = off
   double   m_maxDailyLossCcy;     // account currency, 0 = off
   int      m_maxTrades;

   datetime m_dayStart;            // broker midnight of current day
   double   m_dayStartBalance;     // balance at day rollover
   double   m_dayRealizedPnL;      // realized P&L since rollover (our magic only)
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

   //--- Lot calculation: risk_amount = balance * risk%/100
   //    lots = risk_amount / (slPips * pipValuePerLot)
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
      //--- value of 1 pip per 1.0 lot, in account currency
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

#endif // __EUS_RISKMANAGER_MQH__
