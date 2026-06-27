/**
 * Append a trade_again block to the end of AFTERPURCHASE_STACK in the Apex bots
 * so they loop into the next signal evaluation instead of halting after one trade.
 */
const fs = require('fs');

const FILES = [
  'public/bots/Saint_E_O_Apex_AutoPilot_2026.xml',
  'public/bots/Saint_E_O_Apex_VIXPicker_2026.xml',
];

function injectTradeAgain(xml) {
  const stStart = xml.indexOf('<statement name="AFTERPURCHASE_STACK">');
  if (stStart === -1) throw new Error('no AFTERPURCHASE_STACK');
  const stEnd = xml.indexOf('</statement>', stStart);
  if (stEnd === -1) throw new Error('no closing </statement>');

  const region = xml.slice(stStart, stEnd);
  // Find the LAST </block> in this region — that's the terminal block's closer.
  const lastClose = region.lastIndexOf('</block>');
  if (lastClose === -1) throw new Error('no </block> in stack');

  const absLastClose = stStart + lastClose;
  const insertion = `<next>
              <block type="trade_again" id="trade_again_apex"></block>
            </next>
          `;
  return xml.slice(0, absLastClose) + insertion + xml.slice(absLastClose);
}

let allOk = true;
for (const path of FILES) {
  try {
    let xml = fs.readFileSync(path, 'utf8');
    if (xml.includes('trade_again')) {
      console.log('SKIP (already has trade_again):', path);
      continue;
    }
    const out = injectTradeAgain(xml);
    fs.writeFileSync(path, out);
    console.log('appended trade_again:', path);
  } catch (e) {
    allOk = false;
    console.error('FAILED', path, e.message);
  }
}
process.exit(allOk ? 0 : 1);
