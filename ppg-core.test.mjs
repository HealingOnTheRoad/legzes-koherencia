import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIntervals, calculateHrv, PPGProcessor } from './ppg-core.mjs';

test('interval filter rejects a large local artifact', () => {
  const source = [
    { ms: 1000, startIndex: 0, endIndex: 1 },
    { ms: 1020, startIndex: 1, endIndex: 2 },
    { ms: 990, startIndex: 2, endIndex: 3 },
    { ms: 1550, startIndex: 3, endIndex: 4 },
    { ms: 1010, startIndex: 4, endIndex: 5 },
    { ms: 980, startIndex: 5, endIndex: 6 }
  ];
  const result = filterIntervals(source);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].ms, 1550);
  assert.ok(result.acceptanceRatio >= 0.8);
});

test('HRV uses only truly adjacent accepted intervals', () => {
  const intervals = [
    { ms: 1000, startIndex: 0, endIndex: 1 },
    { ms: 1100, startIndex: 1, endIndex: 2 },
    { ms: 900, startIndex: 3, endIndex: 4 }
  ];
  const result = calculateHrv(intervals);
  assert.equal(result.successivePairCount, 1);
  assert.equal(result.rmssd, 100);
  assert.ok(result.sdnn > 0);
});

test('synthetic regular PPG produces plausible pulse intervals', () => {
  const processor = new PPGProcessor();
  const fps = 30;
  const seconds = 75;
  for (let frame = 0; frame < fps * seconds; frame += 1) {
    const t = frame * 1000 / fps;
    const phase = (t % 1000) / 1000;
    const distance = Math.min(phase, 1 - phase);
    const pulse = 0.008 * Math.exp(-(distance ** 2) / (2 * 0.055 ** 2));
    const ratio = 0.46 - pulse;
    const red = ratio * 255;
    const other = (255 - red) / 2;
    processor.pushFrame({ t, red, green: other, blue: other, brightness: 100, clippedFraction: 0 });
  }
  const snapshot = processor.snapshot(75000);
  assert.ok(processor.peaks.length >= 60, `detected ${processor.peaks.length} peaks`);
  assert.ok(snapshot.acceptedIntervalCount >= 30);
  assert.ok(snapshot.bpm > 50 && snapshot.bpm < 70, `bpm=${snapshot.bpm}`);
  assert.ok(snapshot.hrvReady, `reliability=${snapshot.reliability}, quality=${snapshot.quality.score}`);
  assert.ok(snapshot.hrv.rmssd >= 0);
});


test('saturated camera signal does not unlock HRV output', () => {
  const processor = new PPGProcessor();
  const fps = 30;
  for (let frame = 0; frame < fps * 75; frame += 1) {
    const t = frame * 1000 / fps;
    const phase = (t % 1000) / 1000;
    const distance = Math.min(phase, 1 - phase);
    const pulse = 0.008 * Math.exp(-(distance ** 2) / (2 * 0.055 ** 2));
    const ratio = 0.46 - pulse;
    const red = ratio * 255;
    const other = (255 - red) / 2;
    processor.pushFrame({ t, red, green: other, blue: other, brightness: 100, clippedFraction: 0.5 });
  }
  const snapshot = processor.snapshot(75000);
  assert.equal(snapshot.hrvReady, false);
  assert.equal(snapshot.hrv, null);
});
