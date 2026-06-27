/**
 * Fix the malformed trade_again injection in the two Apex bots.
 *
 * Bug: previous injector inserted <next><block type="trade_again"/></next>
 * before the OUTER </block> of the after-purchase win-branch chain. That
 * outer block (ap_reset_ls) already had a <next> child, producing two
 * consecutive <next> siblings — invalid Blockly XML, which makes the
 * loader bail out with "XML file contains unsupported elements."
 *
 * Fix: relocate the trade_again <next> INSIDE the terminal child block
 * (ap_reset_stake) where it belongs.
 */
const fs = require('fs');

const FILES = [
  'public/bots/Saint_E_O_Apex_AutoPilot_2026.xml',
  'public/bots/Saint_E_O_Apex_VIXPicker_2026.xml',
];

const BROKEN = `              <block type="variables_set" id="ap_reset_stake">
                <field name="VAR" id="v_stake">Stake</field>
                <value name="VALUE"><block type="variables_get" id="ap_g_is"><field name="VAR" id="v_initstake">InitialStake</field></block></value>
              </block>
            </next>
          <next>
              <block type="trade_again" id="trade_again_apex"></block>
            </next>
          </block>`;

const FIXED = `              <block type="variables_set" id="ap_reset_stake">
                <field name="VAR" id="v_stake">Stake</field>
                <value name="VALUE"><block type="variables_get" id="ap_g_is"><field name="VAR" id="v_initstake">InitialStake</field></block></value>
                <next>
                  <block type="trade_again" id="trade_again_apex"></block>
                </next>
              </block>
            </next>
          </block>`;

let allOk = true;
for (const path of FILES) {
  const xml = fs.readFileSync(path, 'utf8');
  if (!xml.includes(BROKEN)) {
    console.error('PATTERN NOT FOUND in', path);
    allOk = false;
    continue;
  }
  fs.writeFileSync(path, xml.replace(BROKEN, FIXED));
  console.log('repaired:', path);
}
process.exit(allOk ? 0 : 1);
