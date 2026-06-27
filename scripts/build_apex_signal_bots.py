#!/usr/bin/env python3
"""
Generates two signal-gated Apex 2026 bots:
  - Saint_E_O_Apex_AutoPilot_2026.xml   (default V75 1s)
  - Saint_E_O_Apex_VIXPicker_2026.xml   (default V100 1s)

10.6% Even/Odd green-semicircle rule:
  Buy DIGITEVEN/DIGITODD only when the highest-frequency digit of the last
  100 ticks sits on a parity group AND >= 3 OTHER digits in that same group
  are also at >= 10.6% (i.e. >= 4 of the 5 group digits at threshold).

Apex safety stack preserved:
  Stake $0.35, Martingale 1.7x, TP $3 / SL $3, hard stop after 4 losses,
  profit-lock at 75% of peak.

Counting strategy (Blockly has no count-occurrences primitive):
  CountList = [0]*10
  for digit in DigitList:
      CountList[digit + 1] += 1   # Blockly lists are 1-indexed
  Then iterate index 0..9 reading CountList[i+1].
"""
import os

VARS = [
    ("v_takeprofit",  "TakeProfit"),
    ("v_stoploss",    "StopLoss"),
    ("v_martingale",  "Martingale"),
    ("v_initstake",   "InitialStake"),
    ("v_stake",       "Stake"),
    ("v_lossstreak",  "LossStreak"),
    ("v_peakprofit",  "PeakProfit"),
    ("v_digitlist",   "DigitList"),
    ("v_listlen",     "ListLen"),
    ("v_threshold",   "Threshold"),
    ("v_countlist",   "CountList"),
    ("v_maxdigit",    "MaxDigit"),
    ("v_maxcount",    "MaxCount"),
    ("v_d",           "d"),
    ("v_item",        "item"),
    ("v_count",       "Count"),
    ("v_qualifying",  "Qualifying"),
    ("v_signalside",  "SignalSide"),
    ("v_isodd",       "IsOdd"),
]


def build_xml(symbol: str, qualifying_min: int = 4, init_msg: str = "") -> str:
    vars_xml = "\n    ".join(
        f'<variable id="{vid}">{name}</variable>' for vid, name in VARS
    )

    return f'''<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">
  <variables>
    {vars_xml}
  </variables>

  <block type="trade_definition" id="td_root" deletable="false" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="td_market" deletable="false" movable="false">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">{symbol}</field>
        <next>
          <block type="trade_definition_tradetype" id="td_tt" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">digits</field>
            <field name="TRADETYPE_LIST">evenodd</field>
            <next>
              <block type="trade_definition_contracttype" id="td_ct" deletable="false" movable="false">
                <field name="TYPE_LIST">both</field>
                <next>
                  <block type="trade_definition_candleinterval" id="td_ci" deletable="false" movable="false">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                    <next>
                      <block type="trade_definition_restartbuysell" id="td_rbs" deletable="false" movable="false">
                        <field name="TIME_MACHINE_ENABLED">FALSE</field>
                        <next>
                          <block type="trade_definition_restartonerror" id="td_roe" deletable="false" movable="false">
                            <field name="RESTARTONERROR">TRUE</field>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="INITIALIZATION">
      <block type="variables_set" id="init_tp">
        <field name="VAR" id="v_takeprofit">TakeProfit</field>
        <value name="VALUE"><block type="math_number" id="n_tp"><field name="NUM">3</field></block></value>
        <next>
          <block type="variables_set" id="init_sl">
            <field name="VAR" id="v_stoploss">StopLoss</field>
            <value name="VALUE"><block type="math_number" id="n_sl"><field name="NUM">3</field></block></value>
            <next>
              <block type="variables_set" id="init_mg">
                <field name="VAR" id="v_martingale">Martingale</field>
                <value name="VALUE"><block type="math_number" id="n_mg"><field name="NUM">1.7</field></block></value>
                <next>
                  <block type="variables_set" id="init_is">
                    <field name="VAR" id="v_initstake">InitialStake</field>
                    <value name="VALUE"><block type="math_number" id="n_is"><field name="NUM">0.35</field></block></value>
                    <next>
                      <block type="variables_set" id="init_st">
                        <field name="VAR" id="v_stake">Stake</field>
                        <value name="VALUE"><block type="variables_get" id="g_is_init"><field name="VAR" id="v_initstake">InitialStake</field></block></value>
                        <next>
                          <block type="variables_set" id="init_ls">
                            <field name="VAR" id="v_lossstreak">LossStreak</field>
                            <value name="VALUE"><block type="math_number" id="n_ls0"><field name="NUM">0</field></block></value>
                            <next>
                              <block type="variables_set" id="init_pp">
                                <field name="VAR" id="v_peakprofit">PeakProfit</field>
                                <value name="VALUE"><block type="math_number" id="n_pp0"><field name="NUM">0</field></block></value>
                                <next>
                                  <block type="variables_set" id="init_ss">
                                    <field name="VAR" id="v_signalside">SignalSide</field>
                                    <value name="VALUE"><block type="text" id="t_init_empty"><field name="TEXT"></field></block></value>
                                    <next>
                                      <block type="notify" id="init_notify">
                                        <field name="NOTIFICATION_TYPE">success</field>
                                        <field name="NOTIFICATION_SOUND">silent</field>
                                        <value name="MESSAGE"><block type="text" id="t_init_msg"><field name="TEXT">{init_msg}</field></block></value>
                                      </block>
                                    </next>
                                  </block>
                                </next>
                              </block>
                            </next>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions" id="td_to">
        <mutation xmlns="http://www.w3.org/1999/xhtml" has_first_barrier="false" has_second_barrier="false" has_prediction="false"></mutation>
        <field name="DURATIONTYPE_LIST">t</field>
        <field name="CURRENCY_LIST">USD</field>
        <value name="DURATION"><shadow type="math_number_positive" id="sh_dur"><field name="NUM">1</field></shadow></value>
        <value name="AMOUNT">
          <shadow type="math_number_positive" id="sh_amt"><field name="NUM">0.35</field></shadow>
          <block type="variables_get" id="g_stake_to"><field name="VAR" id="v_stake">Stake</field></block>
        </value>
      </block>
    </statement>
  </block>

  <block type="during_purchase" id="dp_root" collapsed="true" x="900" y="0">
    <statement name="DURING_PURCHASE_STACK">
      <block type="controls_if" id="dp_if">
        <value name="IF0"><block type="check_sell" id="dp_check"></block></value>
      </block>
    </statement>
  </block>

  <block type="after_purchase" id="ap_root" collapsed="true" x="900" y="120">
    <statement name="AFTERPURCHASE_STACK">
      <block type="controls_if" id="ap_winloss">
        <mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>
        <value name="IF0"><block type="contract_check_result" id="ap_iswin"><field name="CHECK_RESULT">win</field></block></value>
        <statement name="DO0">
          <block type="variables_set" id="ap_reset_ls">
            <field name="VAR" id="v_lossstreak">LossStreak</field>
            <value name="VALUE"><block type="math_number" id="ap_zero1"><field name="NUM">0</field></block></value>
            <next>
              <block type="variables_set" id="ap_reset_stake">
                <field name="VAR" id="v_stake">Stake</field>
                <value name="VALUE"><block type="variables_get" id="ap_g_is"><field name="VAR" id="v_initstake">InitialStake</field></block></value>
              </block>
            </next>
          </block>
        </statement>
        <statement name="ELSE">
          <block type="math_change" id="ap_inc_ls">
            <field name="VAR" id="v_lossstreak">LossStreak</field>
            <value name="DELTA"><shadow type="math_number" id="ap_one"><field name="NUM">1</field></shadow></value>
            <next>
              <block type="variables_set" id="ap_mg_stake">
                <field name="VAR" id="v_stake">Stake</field>
                <value name="VALUE">
                  <block type="math_arithmetic" id="ap_mg_mul">
                    <field name="OP">MULTIPLY</field>
                    <value name="A"><block type="variables_get" id="ap_g_stake"><field name="VAR" id="v_stake">Stake</field></block></value>
                    <value name="B"><block type="variables_get" id="ap_g_mg"><field name="VAR" id="v_martingale">Martingale</field></block></value>
                  </block>
                </value>
              </block>
            </next>
          </block>
        </statement>
        <next>
          <block type="controls_if" id="ap_peak_upd">
            <value name="IF0">
              <block type="logic_compare" id="ap_peak_cmp">
                <field name="OP">GT</field>
                <value name="A"><block type="total_profit" id="ap_tp_now"></block></value>
                <value name="B"><block type="variables_get" id="ap_g_peak"><field name="VAR" id="v_peakprofit">PeakProfit</field></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="variables_set" id="ap_set_peak">
                <field name="VAR" id="v_peakprofit">PeakProfit</field>
                <value name="VALUE"><block type="total_profit" id="ap_tp_set"></block></value>
              </block>
            </statement>
            <next>
              <block type="controls_if" id="ap_hardstop">
                <value name="IF0">
                  <block type="logic_compare" id="ap_hs_cmp">
                    <field name="OP">GTE</field>
                    <value name="A"><block type="variables_get" id="ap_g_ls"><field name="VAR" id="v_lossstreak">LossStreak</field></block></value>
                    <value name="B"><block type="math_number" id="ap_n_4"><field name="NUM">4</field></block></value>
                  </block>
                </value>
                <statement name="DO0">
                  <block type="notify" id="ap_hs_notify">
                    <field name="NOTIFICATION_TYPE">error</field>
                    <field name="NOTIFICATION_SOUND">silent</field>
                    <value name="MESSAGE"><block type="text" id="ap_hs_text"><field name="TEXT">Hard stop: 4 consecutive losses.</field></block></value>
                  </block>
                </statement>
                <next>
                  <block type="controls_if" id="ap_tpsl">
                    <mutation xmlns="http://www.w3.org/1999/xhtml" elseif="2"></mutation>
                    <value name="IF0">
                      <block type="logic_compare" id="ap_tp_cmp">
                        <field name="OP">GTE</field>
                        <value name="A"><block type="total_profit" id="ap_tp_v1"></block></value>
                        <value name="B"><block type="variables_get" id="ap_g_tp"><field name="VAR" id="v_takeprofit">TakeProfit</field></block></value>
                      </block>
                    </value>
                    <statement name="DO0">
                      <block type="notify" id="ap_tp_notify">
                        <field name="NOTIFICATION_TYPE">success</field>
                        <field name="NOTIFICATION_SOUND">silent</field>
                        <value name="MESSAGE"><block type="text" id="ap_tp_text"><field name="TEXT">Take Profit hit. Stopping bot.</field></block></value>
                      </block>
                    </statement>
                    <value name="IF1">
                      <block type="logic_compare" id="ap_sl_cmp">
                        <field name="OP">LTE</field>
                        <value name="A"><block type="total_profit" id="ap_tp_v2"></block></value>
                        <value name="B">
                          <block type="math_arithmetic" id="ap_sl_neg">
                            <field name="OP">MULTIPLY</field>
                            <value name="A"><block type="math_number" id="ap_n_neg1"><field name="NUM">-1</field></block></value>
                            <value name="B"><block type="variables_get" id="ap_g_sl"><field name="VAR" id="v_stoploss">StopLoss</field></block></value>
                          </block>
                        </value>
                      </block>
                    </value>
                    <statement name="DO1">
                      <block type="notify" id="ap_sl_notify">
                        <field name="NOTIFICATION_TYPE">error</field>
                        <field name="NOTIFICATION_SOUND">silent</field>
                        <value name="MESSAGE"><block type="text" id="ap_sl_text"><field name="TEXT">Stop Loss hit. Stopping bot.</field></block></value>
                      </block>
                    </statement>
                    <value name="IF2">
                      <block type="logic_operation" id="ap_pl_and">
                        <field name="OP">AND</field>
                        <value name="A">
                          <block type="logic_compare" id="ap_pl_pos">
                            <field name="OP">GT</field>
                            <value name="A"><block type="variables_get" id="ap_g_peak2"><field name="VAR" id="v_peakprofit">PeakProfit</field></block></value>
                            <value name="B"><block type="math_number" id="ap_n_zero"><field name="NUM">0</field></block></value>
                          </block>
                        </value>
                        <value name="B">
                          <block type="logic_compare" id="ap_pl_cmp">
                            <field name="OP">LTE</field>
                            <value name="A"><block type="total_profit" id="ap_tp_v3"></block></value>
                            <value name="B">
                              <block type="math_arithmetic" id="ap_pl_mul">
                                <field name="OP">MULTIPLY</field>
                                <value name="A"><block type="variables_get" id="ap_g_peak3"><field name="VAR" id="v_peakprofit">PeakProfit</field></block></value>
                                <value name="B"><block type="math_number" id="ap_n_75"><field name="NUM">0.65</field></block></value>
                              </block>
                            </value>
                          </block>
                        </value>
                      </block>
                    </value>
                    <statement name="DO2">
                      <block type="notify" id="ap_pl_notify">
                        <field name="NOTIFICATION_TYPE">warn</field>
                        <field name="NOTIFICATION_SOUND">silent</field>
                        <value name="MESSAGE"><block type="text" id="ap_pl_text"><field name="TEXT">Profit-lock triggered (peak fell to 65%). Stopping bot.</field></block></value>
                      </block>
                    </statement>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
  </block>

  <block type="before_purchase" id="bp_root" deletable="false" x="0" y="800">
    <statement name="BEFOREPURCHASE_STACK">

      <block type="variables_set" id="bp_setlist">
        <field name="VAR" id="v_digitlist">DigitList</field>
        <value name="VALUE">
          <block type="lists_getSublist" id="bp_sublist">
            <mutation xmlns="http://www.w3.org/1999/xhtml" at1="true" at2="false"></mutation>
            <field name="WHERE1">FROM_END</field>
            <field name="WHERE2">LAST</field>
            <value name="LIST"><block type="lastDigitList" id="bp_ldl"></block></value>
            <value name="AT1"><block type="math_number" id="bp_n100"><field name="NUM">100</field></block></value>
          </block>
        </value>
        <next>

      <block type="variables_set" id="bp_setlen">
        <field name="VAR" id="v_listlen">ListLen</field>
        <value name="VALUE">
          <block type="lists_length" id="bp_llen">
            <value name="VALUE"><block type="variables_get" id="bp_g_dl1"><field name="VAR" id="v_digitlist">DigitList</field></block></value>
          </block>
        </value>
        <next>

      <block type="variables_set" id="bp_reset_ss">
        <field name="VAR" id="v_signalside">SignalSide</field>
        <value name="VALUE"><block type="text" id="bp_empty"><field name="TEXT"></field></block></value>
        <next>

      <block type="controls_if" id="bp_if_enough">
        <value name="IF0">
          <block type="logic_compare" id="bp_len_cmp">
            <field name="OP">GTE</field>
            <value name="A"><block type="variables_get" id="bp_g_ll"><field name="VAR" id="v_listlen">ListLen</field></block></value>
            <value name="B"><block type="math_number" id="bp_n40"><field name="NUM">100</field></block></value>
          </block>
        </value>
        <statement name="DO0">

          <block type="variables_set" id="bp_set_thr">
            <field name="VAR" id="v_threshold">Threshold</field>
            <value name="VALUE">
              <block type="math_arithmetic" id="bp_thr_div">
                <field name="OP">DIVIDE</field>
                <value name="A">
                  <block type="math_arithmetic" id="bp_thr_mul">
                    <field name="OP">MULTIPLY</field>
                    <value name="A"><block type="variables_get" id="bp_g_ll2"><field name="VAR" id="v_listlen">ListLen</field></block></value>
                    <value name="B"><block type="math_number" id="bp_n106"><field name="NUM">10.6</field></block></value>
                  </block>
                </value>
                <value name="B"><block type="math_number" id="bp_n100b"><field name="NUM">100</field></block></value>
              </block>
            </value>
            <next>

          <block type="variables_set" id="bp_init_cl">
            <field name="VAR" id="v_countlist">CountList</field>
            <value name="VALUE">
              <block type="lists_repeat" id="bp_cl_rep">
                <value name="ITEM"><block type="math_number" id="bp_cl_zero"><field name="NUM">0</field></block></value>
                <value name="NUM"><block type="math_number" id="bp_cl_ten"><field name="NUM">10</field></block></value>
              </block>
            </value>
            <next>

          <block type="controls_forEach" id="bp_for_tally">
            <field name="VAR" id="v_item">item</field>
            <value name="LIST"><block type="variables_get" id="bp_g_dl_tally"><field name="VAR" id="v_digitlist">DigitList</field></block></value>
            <statement name="DO">
              <block type="lists_setIndex" id="bp_cl_set">
                <mutation xmlns="http://www.w3.org/1999/xhtml" at="true"></mutation>
                <field name="MODE">SET</field>
                <field name="WHERE">FROM_START</field>
                <value name="LIST"><block type="variables_get" id="bp_g_cl1"><field name="VAR" id="v_countlist">CountList</field></block></value>
                <value name="AT">
                  <block type="math_arithmetic" id="bp_cl_idx">
                    <field name="OP">ADD</field>
                    <value name="A"><block type="variables_get" id="bp_g_item"><field name="VAR" id="v_item">item</field></block></value>
                    <value name="B"><block type="math_number" id="bp_cl_one"><field name="NUM">1</field></block></value>
                  </block>
                </value>
                <value name="TO">
                  <block type="math_arithmetic" id="bp_cl_inc">
                    <field name="OP">ADD</field>
                    <value name="A">
                      <block type="lists_getIndex" id="bp_cl_get_inc">
                        <mutation xmlns="http://www.w3.org/1999/xhtml" statement="false" at="true"></mutation>
                        <field name="MODE">GET</field>
                        <field name="WHERE">FROM_START</field>
                        <value name="VALUE"><block type="variables_get" id="bp_g_cl2"><field name="VAR" id="v_countlist">CountList</field></block></value>
                        <value name="AT">
                          <block type="math_arithmetic" id="bp_cl_idx2">
                            <field name="OP">ADD</field>
                            <value name="A"><block type="variables_get" id="bp_g_item2"><field name="VAR" id="v_item">item</field></block></value>
                            <value name="B"><block type="math_number" id="bp_cl_one2"><field name="NUM">1</field></block></value>
                          </block>
                        </value>
                      </block>
                    </value>
                    <value name="B"><block type="math_number" id="bp_cl_one3"><field name="NUM">1</field></block></value>
                  </block>
                </value>
              </block>
            </statement>
            <next>

          <block type="variables_set" id="bp_init_md">
            <field name="VAR" id="v_maxdigit">MaxDigit</field>
            <value name="VALUE"><block type="math_number" id="bp_neg1a"><field name="NUM">0</field></block></value>
            <next>
          <block type="variables_set" id="bp_init_mc">
            <field name="VAR" id="v_maxcount">MaxCount</field>
            <value name="VALUE"><block type="math_number" id="bp_neg1b"><field name="NUM">-1</field></block></value>
            <next>

          <block type="controls_for" id="bp_for_max">
            <field name="VAR" id="v_d">d</field>
            <value name="FROM"><shadow type="math_number" id="bp_for_from1"><field name="NUM">0</field></shadow></value>
            <value name="TO"><shadow type="math_number" id="bp_for_to1"><field name="NUM">9</field></shadow></value>
            <value name="BY"><shadow type="math_number" id="bp_for_by1"><field name="NUM">1</field></shadow></value>
            <statement name="DO">
              <block type="variables_set" id="bp_set_cnt">
                <field name="VAR" id="v_count">Count</field>
                <value name="VALUE">
                  <block type="lists_getIndex" id="bp_cl_get_max">
                    <mutation xmlns="http://www.w3.org/1999/xhtml" statement="false" at="true"></mutation>
                    <field name="MODE">GET</field>
                    <field name="WHERE">FROM_START</field>
                    <value name="VALUE"><block type="variables_get" id="bp_g_cl3"><field name="VAR" id="v_countlist">CountList</field></block></value>
                    <value name="AT">
                      <block type="math_arithmetic" id="bp_cl_idx3">
                        <field name="OP">ADD</field>
                        <value name="A"><block type="variables_get" id="bp_g_d_max"><field name="VAR" id="v_d">d</field></block></value>
                        <value name="B"><block type="math_number" id="bp_cl_one4"><field name="NUM">1</field></block></value>
                      </block>
                    </value>
                  </block>
                </value>
                <next>
                  <block type="controls_if" id="bp_if_max">
                    <value name="IF0">
                      <block type="logic_compare" id="bp_max_cmp">
                        <field name="OP">GT</field>
                        <value name="A"><block type="variables_get" id="bp_g_cnt1"><field name="VAR" id="v_count">Count</field></block></value>
                        <value name="B"><block type="variables_get" id="bp_g_mc1"><field name="VAR" id="v_maxcount">MaxCount</field></block></value>
                      </block>
                    </value>
                    <statement name="DO0">
                      <block type="variables_set" id="bp_set_mc">
                        <field name="VAR" id="v_maxcount">MaxCount</field>
                        <value name="VALUE"><block type="variables_get" id="bp_g_cnt2"><field name="VAR" id="v_count">Count</field></block></value>
                        <next>
                          <block type="variables_set" id="bp_set_md">
                            <field name="VAR" id="v_maxdigit">MaxDigit</field>
                            <value name="VALUE"><block type="variables_get" id="bp_g_d2"><field name="VAR" id="v_d">d</field></block></value>
                          </block>
                        </next>
                      </block>
                    </statement>
                  </block>
                </next>
              </block>
            </statement>
            <next>

          <block type="variables_set" id="bp_set_iso">
            <field name="VAR" id="v_isodd">IsOdd</field>
            <value name="VALUE">
              <block type="math_modulo" id="bp_mod">
                <value name="DIVIDEND"><block type="variables_get" id="bp_g_md"><field name="VAR" id="v_maxdigit">MaxDigit</field></block></value>
                <value name="DIVISOR"><block type="math_number" id="bp_n2"><field name="NUM">2</field></block></value>
              </block>
            </value>
            <next>

          <block type="variables_set" id="bp_init_q">
            <field name="VAR" id="v_qualifying">Qualifying</field>
            <value name="VALUE"><block type="math_number" id="bp_qzero"><field name="NUM">0</field></block></value>
            <next>

          <block type="controls_for" id="bp_for_q">
            <field name="VAR" id="v_d">d</field>
            <value name="FROM"><shadow type="math_number" id="bp_for_from2"><field name="NUM">0</field></shadow></value>
            <value name="TO"><shadow type="math_number" id="bp_for_to2"><field name="NUM">9</field></shadow></value>
            <value name="BY"><shadow type="math_number" id="bp_for_by2"><field name="NUM">1</field></shadow></value>
            <statement name="DO">
              <block type="controls_if" id="bp_if_parity">
                <value name="IF0">
                  <block type="logic_compare" id="bp_par_cmp">
                    <field name="OP">EQ</field>
                    <value name="A">
                      <block type="math_modulo" id="bp_par_mod">
                        <value name="DIVIDEND"><block type="variables_get" id="bp_g_d3"><field name="VAR" id="v_d">d</field></block></value>
                        <value name="DIVISOR"><block type="math_number" id="bp_n2b"><field name="NUM">2</field></block></value>
                      </block>
                    </value>
                    <value name="B"><block type="variables_get" id="bp_g_iso"><field name="VAR" id="v_isodd">IsOdd</field></block></value>
                  </block>
                </value>
                <statement name="DO0">
                  <block type="variables_set" id="bp_set_cnt2">
                    <field name="VAR" id="v_count">Count</field>
                    <value name="VALUE">
                      <block type="lists_getIndex" id="bp_cl_get_q">
                        <mutation xmlns="http://www.w3.org/1999/xhtml" statement="false" at="true"></mutation>
                        <field name="MODE">GET</field>
                        <field name="WHERE">FROM_START</field>
                        <value name="VALUE"><block type="variables_get" id="bp_g_cl4"><field name="VAR" id="v_countlist">CountList</field></block></value>
                        <value name="AT">
                          <block type="math_arithmetic" id="bp_cl_idx4">
                            <field name="OP">ADD</field>
                            <value name="A"><block type="variables_get" id="bp_g_d_q"><field name="VAR" id="v_d">d</field></block></value>
                            <value name="B"><block type="math_number" id="bp_cl_one5"><field name="NUM">1</field></block></value>
                          </block>
                        </value>
                      </block>
                    </value>
                    <next>
                      <block type="controls_if" id="bp_if_thr">
                        <value name="IF0">
                          <block type="logic_compare" id="bp_thr_cmp">
                            <field name="OP">GTE</field>
                            <value name="A"><block type="variables_get" id="bp_g_cnt3"><field name="VAR" id="v_count">Count</field></block></value>
                            <value name="B"><block type="variables_get" id="bp_g_thr"><field name="VAR" id="v_threshold">Threshold</field></block></value>
                          </block>
                        </value>
                        <statement name="DO0">
                          <block type="math_change" id="bp_q_inc">
                            <field name="VAR" id="v_qualifying">Qualifying</field>
                            <value name="DELTA"><shadow type="math_number" id="bp_q_one"><field name="NUM">1</field></shadow></value>
                          </block>
                        </statement>
                      </block>
                    </next>
                  </block>
                </statement>
              </block>
            </statement>
            <next>

          <block type="controls_if" id="bp_if_fire">
            <value name="IF0">
              <block type="logic_compare" id="bp_fire_cmp">
                <field name="OP">GTE</field>
                <value name="A"><block type="variables_get" id="bp_g_q"><field name="VAR" id="v_qualifying">Qualifying</field></block></value>
                <value name="B"><block type="math_number" id="bp_n4"><field name="NUM">{qualifying_min}</field></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="controls_if" id="bp_if_side">
                <mutation xmlns="http://www.w3.org/1999/xhtml" else="1"></mutation>
                <value name="IF0">
                  <block type="logic_compare" id="bp_side_cmp">
                    <field name="OP">EQ</field>
                    <value name="A"><block type="variables_get" id="bp_g_iso2"><field name="VAR" id="v_isodd">IsOdd</field></block></value>
                    <value name="B"><block type="math_number" id="bp_n0"><field name="NUM">0</field></block></value>
                  </block>
                </value>
                <statement name="DO0">
                  <block type="variables_set" id="bp_set_even">
                    <field name="VAR" id="v_signalside">SignalSide</field>
                    <value name="VALUE"><block type="text" id="bp_t_even"><field name="TEXT">DIGITEVEN</field></block></value>
                  </block>
                </statement>
                <statement name="ELSE">
                  <block type="variables_set" id="bp_set_odd">
                    <field name="VAR" id="v_signalside">SignalSide</field>
                    <value name="VALUE"><block type="text" id="bp_t_odd"><field name="TEXT">DIGITODD</field></block></value>
                  </block>
                </statement>
              </block>
            </statement>
          </block>

          </next></block>
          </next></block>
          </next></block>
          </next></block>
          </next></block>
          </next></block>
          </next></block>
          </next></block>
          </next></block>

        </statement>
        <next>
          <block type="controls_if" id="bp_purchase_if">
            <mutation xmlns="http://www.w3.org/1999/xhtml" elseif="1"></mutation>
            <value name="IF0">
              <block type="logic_compare" id="bp_buy_even_cmp">
                <field name="OP">EQ</field>
                <value name="A"><block type="variables_get" id="bp_g_ss1"><field name="VAR" id="v_signalside">SignalSide</field></block></value>
                <value name="B"><block type="text" id="bp_t_even2"><field name="TEXT">DIGITEVEN</field></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="purchase" id="bp_buy_even"><field name="PURCHASE_LIST">DIGITEVEN</field></block>
            </statement>
            <value name="IF1">
              <block type="logic_compare" id="bp_buy_odd_cmp">
                <field name="OP">EQ</field>
                <value name="A"><block type="variables_get" id="bp_g_ss2"><field name="VAR" id="v_signalside">SignalSide</field></block></value>
                <value name="B"><block type="text" id="bp_t_odd2"><field name="TEXT">DIGITODD</field></block></value>
              </block>
            </value>
            <statement name="DO1">
              <block type="purchase" id="bp_buy_odd"><field name="PURCHASE_LIST">DIGITODD</field></block>
            </statement>
          </block>
        </next>
      </block>

      </next></block>
      </next></block>
      </next></block>

    </statement>
  </block>
</xml>
'''


def main():
    out_dir = "public/bots"
    targets = [
        ("Saint_E_O_Apex_AutoPilot_2026.xml", "1HZ75V", 4,
         "Apex AutoPilot armed (V75 1s default). 10.6% rule, 4-of-5 trigger. Approved VIXes: V75 1s, V100 1s, V25 1s."),
        ("Saint_E_O_Apex_VIXPicker_2026.xml", "1HZ100V", 5,
         "Apex VIX Picker armed (V100 1s default). STRICT 10.6% rule, 5-of-5 trigger - fewer but higher-confidence signals. Approved VIXes: V75 1s, V100 1s, V25 1s."),
    ]
    for fname, sym, qmin, msg in targets:
        path = os.path.join(out_dir, fname)
        xml = build_xml(sym, qmin, msg)
        with open(path, "w") as f:
            f.write(xml)
        print(f"wrote {path} ({len(xml)} bytes, symbol {sym}, qualifying_min={qmin})")


if __name__ == "__main__":
    main()
