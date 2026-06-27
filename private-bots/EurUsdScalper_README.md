# EUR/USD Scalping EA (MT5)

A MetaTrader 5 Expert Advisor that scalps EUR/USD on M1 / M5 using an
EMA-pullback + RSI + ATR confirmation strategy, with advanced risk
management, a high-impact news filter, and multi-channel alerts.

## Files

```
mt5/
├── Experts/
│   └── EurUsdScalper.mq5          # main EA
├── Include/
│   └── EurUsdScalper/
│       ├── RiskManager.mqh        # lot sizing, daily loss, max trades
│       ├── NewsFilter.mqh         # MT5 calendar + CSV fallback
│       └── Alerts.mqh             # popup / sound / push notifications
├── Files/
│   └── news.csv                   # CSV fallback for the news filter
├── README.md                      # this file
└── BACKTESTING.md                 # Strategy Tester guide
```

## Installation

1. In MetaTrader 5, open **File → Open Data Folder**. This is your
   `<DataFolder>` (e.g. `…\AppData\Roaming\MetaQuotes\Terminal\<id>\`).
2. Copy files keeping the layout:
   - `mt5/Experts/EurUsdScalper.mq5`        → `<DataFolder>/MQL5/Experts/EurUsdScalper.mq5`
   - `mt5/Include/EurUsdScalper/*.mqh`      → `<DataFolder>/MQL5/Include/EurUsdScalper/*.mqh`
   - `mt5/Files/news.csv` (optional)        → `<DataFolder>/MQL5/Files/news.csv`
3. Open **MetaEditor (F4)**, navigate to `Experts/EurUsdScalper.mq5`, and
   press **F7** to compile. You should see `0 errors, 0 warnings`.
4. In MT5, refresh the *Navigator → Expert Advisors* list and drag
   **EurUsdScalper** onto a EUR/USD M1 or M5 chart.
5. In the dialog: enable *Algo Trading*, allow *Live trading*, and (if you
   want push alerts) ensure your MetaQuotes ID is set under
   **Tools → Options → Notifications**.

## Inputs (summary)

### General
| Input | Default | Notes |
|---|---|---|
| `InpTimeframe` | `PERIOD_M5` | Use `PERIOD_M1` or `PERIOD_M5` |
| `InpSymbol`    | `EURUSD`   | Match your broker's symbol (e.g. `EURUSD.m`) |
| `InpMagic`     | `20260416` | Identifies this EA's trades |

### Signal
| Input | Default | Notes |
|---|---|---|
| `InpFastEMA` / `InpSlowEMA` | 8 / 21 | Trend filter |
| `InpRsiPeriod` | 14 | RSI period |
| `InpRsiBuyMin` / `InpRsiBuyMax` | 55 / 75 | Long momentum band |
| `InpRsiSellMax` / `InpRsiSellMin` | 45 / 25 | Short momentum band |
| `InpAtrPeriod` | 14 | ATR period |
| `InpAtrMinPips` | 1.5 | Skip dead markets |

### Risk Management
| Input | Default | Notes |
|---|---|---|
| `InpRiskPercent`     | 0.5  | % of balance risked per trade |
| `InpSlMode`          | ATR  | `SL_MODE_ATR` or `SL_MODE_FIXED` |
| `InpAtrSlMult` / `InpAtrTpMult` | 1.5 / 2.0 | When ATR mode |
| `InpFixedSlPips` / `InpFixedTpPips` | 8 / 12 | When fixed mode |
| `InpMaxTrades`       | 1    | Concurrent positions |
| `InpMaxDailyLossPct` | 3.0  | % of balance, 0 = off |
| `InpMaxDailyLossCcy` | 0    | Account currency, 0 = off |

### Trailing Stop
| Input | Default |
|---|---|
| `InpTrailMode` | `TRAIL_MODE_ATR` (`OFF` / `PIPS` / `ATR`) |
| `InpTrailTriggerPips` | 6 |
| `InpTrailStepPips`    | 3 |
| `InpTrailAtrMult`     | 1.0 |

### News Filter
| Input | Default |
|---|---|
| `InpUseNewsFilter` | `true` |
| `InpNewsMinutesBefore` | 15 |
| `InpNewsMinutesAfter`  | 15 |
| `InpNewsCsvFile` | `news.csv` (in `MQL5/Files`) |

The filter first queries MT5's economic calendar (`CalendarValueHistory`)
for **HIGH** importance EUR or USD events. If the calendar is empty
(common on some brokers), it falls back to `news.csv`. CSV format:

```
# Comments start with #
2026.04.16 12:30,USD,HIGH
2026.04.17 09:00,EUR,HIGH
```

### Alerts
| Input | Default |
|---|---|
| `InpAlertPopup` | `true`  |
| `InpAlertSound` | `true`  |
| `InpAlertSoundFile` | `alert.wav` |
| `InpAlertPush`  | `false` |

Alerts fire on: **trade open**, **trade close (incl. SL / TP)**,
**daily loss limit reached**, **news pause**.

> **Daily loss definition:** the cutoff is computed from **realized
> P&L** (closed deals for this EA's magic number, since broker midnight,
> including swap and commission). Floating P&L on open positions is
> **not** counted toward the daily loss limit.

## Safety / Disclaimer

This software is provided **as-is**, without any warranty. It is a coded
trading strategy, not financial advice. Past performance is not
indicative of future results. Always backtest extensively (see
`BACKTESTING.md`) and forward-test on a **demo account** before risking
real funds. You are solely responsible for any losses incurred while
running this EA.
