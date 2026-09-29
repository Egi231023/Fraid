import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {initMobileControls} from '../v2/mobile.js';

test('touch zoom is cancelled while single-finger scrolling and clicks remain usable', () => {
  const dom = new JSDOM('<button>Open</button>', {pretendToBeVisual:true});
  const {document:doc, Event} = dom.window;
  initMobileControls(doc, dom.window);
  for (const fingers of [1,2]) {
    const event = new Event('touchmove', {bubbles:true,cancelable:true});
    Object.defineProperty(event, 'touches', {value:Array(fingers).fill({})});
    doc.dispatchEvent(event);
    assert.equal(event.defaultPrevented, fingers > 1);
  }
  const gesture = new Event('gesturestart', {cancelable:true});
  doc.dispatchEvent(gesture);
  assert.equal(gesture.defaultPrevented,true);
  let clicks = 0;
  doc.querySelector('button').onclick = () => clicks++;
  doc.querySelector('button').click();
  assert.equal(clicks,1);
  dom.window.close();
});

test('supported haptics are short, and rejected/absent vibration never blocks the UI', () => {
  for (const mode of ['supported','throws','absent']) {
    const dom = new JSDOM('<button><span>Save</span></button><button disabled>Disabled</button>', {pretendToBeVisual:true});
    const {document:doc} = dom.window;
    const pulses = [];
    if (mode !== 'absent') dom.window.navigator.vibrate = duration => {
      if (mode === 'throws') throw Error('Unavailable');
      pulses.push(duration); return true;
    };
    const feedback = initMobileControls(doc, dom.window);
    let clicks = 0;
    doc.querySelector('button').onclick = () => clicks++;
    doc.querySelector('span').click();
    doc.querySelector('[disabled]').click();
    assert.equal(clicks,1);
    assert.doesNotThrow(() => feedback.success());
    assert.deepEqual(pulses,mode === 'supported' ? [10,22] : []);
    dom.window.close();
  }
});
