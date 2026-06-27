//+------------------------------------------------------------------+
//|                                                NewsFilter.mqh    |
//|  Blocks trades around high-impact EUR/USD news events.           |
//|  Primary source: MT5 economic calendar API.                      |
//|  Fallback:       CSV file in MQL5/Files                          |
//|                  Format per line: yyyy.mm.dd HH:MM,CCY,IMPACT    |
//|                  Lines starting with # are ignored.              |
//+------------------------------------------------------------------+
#ifndef __EUS_NEWSFILTER_MQH__
#define __EUS_NEWSFILTER_MQH__

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
         if(n < 3) continue;  // require timestamp,CCY,IMPACT
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

   //--- Try the built-in calendar; returns true if any high-impact EUR/USD event
   //    falls within the [now-after, now+before] window.
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

      //--- 1) Calendar API
      datetime evt = 0;
      string   desc = "";
      if(CheckCalendar(now, evt, desc))
        {
         m_nextEventTime = evt;
         m_nextEventDesc = desc;
         return true;
        }

      //--- 2) CSV fallback (reload daily)
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

#endif // __EUS_NEWSFILTER_MQH__
