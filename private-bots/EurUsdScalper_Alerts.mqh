//+------------------------------------------------------------------+
//|                                                  Alerts.mqh      |
//|  Popup, sound, and push notifications for EA events.             |
//+------------------------------------------------------------------+
#ifndef __EUS_ALERTS_MQH__
#define __EUS_ALERTS_MQH__

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
      string msg = StringFormat("[%s] DAILY LOSS LIMIT HIT (P&L=%.2f) — new trades disabled for today",
                                m_symbol, dailyPnL);
      Send(msg);
     }

   void NotifyNewsPause(const string desc)
     {
      string msg = StringFormat("[%s] NEWS PAUSE — %s", m_symbol, desc);
      Send(msg);
     }
  };

#endif // __EUS_ALERTS_MQH__
