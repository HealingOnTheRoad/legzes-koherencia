const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function mad(values) {
  if (!values.length) return 0;
  const center = median(values);
  return median(values.map(value => Math.abs(value - center)));
}

/**
 * Conservative interval screening for a camera-PPG prototype.
 * It does not interpolate rejected beats and it never labels the result as ECG NN data.
 */
export function filterIntervals(intervals) {
  const plausible = intervals.map((item, index) => ({ ...item, sourceIndex: index }))
    .filter(item => Number.isFinite(item.ms) && item.ms >= 300 && item.ms <= 2000);
  const plausibleSet = new Set(plausible.map(item => item.sourceIndex));
  const accepted = [];
  const rejected = [];

  intervals.forEach((item, index) => {
    if (!plausibleSet.has(index)) {
      rejected.push({ ...item, reason: "physiological-range" });
      return;
    }
    const neighbours = plausible
      .filter(other => other.sourceIndex !== index && Math.abs(other.sourceIndex - index) <= 2)
      .map(other => other.ms);
    if (neighbours.length < 2) {
      accepted.push({ ...item, sourceIndex: index });
      return;
    }
    const localMedian = median(neighbours);
    const deviation = Math.abs(item.ms - localMedian);
    const ratio = item.ms / localMedian;
    const isLikelyMissedOrExtraBeat = ratio > 1.8 || ratio < 0.55;
    const isLocalOutlier = deviation > Math.max(220, localMedian * 0.35);
    if (isLikelyMissedOrExtraBeat || isLocalOutlier) {
      rejected.push({ ...item, reason: "local-outlier" });
    } else {
      accepted.push({ ...item, sourceIndex: index });
    }
  });

  return {
    accepted,
    rejected,
    acceptanceRatio: intervals.length ? accepted.length / intervals.length : 0
  };
}

export function calculateHrv(intervals) {
  const values = intervals.map(item => item.ms);
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  const adjacentDiffs = [];
  for (let i = 1; i < intervals.length; i += 1) {
    // Do not calculate a successive difference across an interval that was rejected.
    if (intervals[i - 1].endIndex === intervals[i].startIndex) {
      adjacentDiffs.push(intervals[i].ms - intervals[i - 1].ms);
    }
  }
  const rmssd = adjacentDiffs.length
    ? Math.sqrt(adjacentDiffs.reduce((sum, diff) => sum + diff ** 2, 0) / adjacentDiffs.length)
    : null;
  return {
    meanIbi: mean,
    bpm: 60000 / mean,
    sdnn: Math.sqrt(variance),
    rmssd,
    intervalCount: values.length,
    successivePairCount: adjacentDiffs.length
  };
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export class PPGProcessor {
  constructor() {
    this.samples = [];
    this.signal = [];
    this.peaks = [];
    this.frameIntervals = [];
    this.baseline = null;
    this.smoothed = null;
    this.lastTime = null;
    this.gapCount = 0;
    this.clippedFrames = 0;
    this.totalFrames = 0;
    this.peakSequence = 0;
  }

  reset() {
    this.samples = [];
    this.signal = [];
    this.peaks = [];
    this.frameIntervals = [];
    this.baseline = null;
    this.smoothed = null;
    this.lastTime = null;
    this.gapCount = 0;
    this.clippedFrames = 0;
    this.totalFrames = 0;
    this.peakSequence = 0;
  }

  pushFrame({ t, red, green, blue, clippedFraction = 0, brightness = null }) {
    if (![t, red, green, blue].every(Number.isFinite)) return;
    const total = red + green + blue;
    if (total <= 1) return;

    const dt = this.lastTime === null ? null : t - this.lastTime;
    if (dt !== null && dt > 0) {
      this.frameIntervals.push({ t, dt });
      if (this.frameIntervals.length > 1800) this.frameIntervals.shift();
      if (dt > 250) {
        this.gapCount += 1;
        this.smoothed = null;
        this.signal = [];
      }
    }
    this.lastTime = t;

    const ratio = red / total;
    if (this.baseline === null) this.baseline = ratio;
    const elapsed = dt && dt > 0 ? dt : 33.3;
    const alpha = 1 - Math.exp(-elapsed / 1800);
    this.baseline += alpha * (ratio - this.baseline);

    // Finger PPG often produces a transmitted-red-light dip during systole;
    // invert the detrended red ratio so candidate systolic pulses are maxima.
    const detrended = this.baseline - ratio;
    this.smoothed = this.smoothed === null ? detrended : this.smoothed * 0.35 + detrended * 0.65;
    const sample = {
      t,
      v: this.smoothed,
      red,
      green,
      blue,
      brightness: brightness ?? total / 3,
      clippedFraction: clamp(clippedFraction, 0, 1)
    };
    this.samples.push(sample);
    this.signal.push({ t, v: this.smoothed });
    this.totalFrames += 1;
    if (sample.clippedFraction > 0.1) this.clippedFrames += 1;

    const cutoff = t - 120000;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    while (this.signal.length && this.signal[0].t < t - 12000) this.signal.shift();
    while (this.peaks.length && this.peaks[0].t < cutoff) this.peaks.shift();

    this.#detectPeak();
  }

  #detectPeak() {
    const n = this.signal.length;
    if (n < 3) return;
    const a = this.signal[n - 3];
    const b = this.signal[n - 2];
    const c = this.signal[n - 1];
    if (!(b.v > a.v && b.v >= c.v)) return;

    const recent = this.signal.filter(point => point.t >= b.t - 800);
    const values = recent.map(point => point.v);
    const amplitude = percentile(values, 0.95) - percentile(values, 0.05);
    const differences = [];
    for (let i = 1; i < values.length; i += 1) differences.push(values[i] - values[i - 1]);
    const noise = mad(differences) * 1.4826;
    const preceding = recent.filter(point => point.t <= b.t && point.t >= b.t - 450).map(point => point.v);
    const prominence = b.v - (preceding.length ? Math.min(...preceding) : a.v);
    const threshold = Math.max(0.000008, amplitude * 0.12, noise * 2.2);
    if (prominence < threshold) return;

    const lastPeak = this.peaks[this.peaks.length - 1];
    const candidate = { t: b.t, prominence, index: this.peakSequence++ };
    if (lastPeak) {
      const separation = candidate.t - lastPeak.t;
      if (separation < 320) {
        if (candidate.prominence > lastPeak.prominence) this.peaks[this.peaks.length - 1] = candidate;
        return;
      }
    }
    this.peaks.push(candidate);
  }

  #quality(now) {
    const recentSamples = this.samples.filter(sample => sample.t >= now - 10000);
    const recentFrames = this.frameIntervals.filter(frame => frame.t >= now - 10000).map(frame => frame.dt);
    const meanDt = recentFrames.length ? recentFrames.reduce((a, b) => a + b, 0) / recentFrames.length : 0;
    const dtStd = recentFrames.length > 1
      ? Math.sqrt(recentFrames.reduce((sum, value) => sum + (value - meanDt) ** 2, 0) / (recentFrames.length - 1))
      : 0;
    const fps = meanDt ? 1000 / meanDt : 0;
    const jitter = meanDt ? dtStd / meanDt : 1;
    const clipped = recentSamples.length
      ? recentSamples.filter(sample => sample.clippedFraction > 0.1).length / recentSamples.length
      : 0;
    const brightness = recentSamples.length
      ? recentSamples.reduce((sum, sample) => sum + sample.brightness, 0) / recentSamples.length
      : 0;
    const recentSignal = this.signal.filter(point => point.t >= now - 8000).map(point => point.v);
    const amplitude = recentSignal.length ? percentile(recentSignal, 0.95) - percentile(recentSignal, 0.05) : 0;

    const fpsScore = clamp((fps - 8) / 17 * 100, 0, 100);
    const jitterScore = clamp(100 - jitter * 180, 0, 100);
    const clippingScore = clamp(100 - clipped * 350, 0, 100);
    const amplitudeScore = amplitude < 0.000015 ? 0 : amplitude > 0.025 ? 35 : clamp(45 + Math.log10(amplitude / 0.000015) * 22, 0, 100);
    const brightnessScore = brightness < 8 || brightness > 248 ? 15 : brightness < 18 || brightness > 238 ? 55 : 100;
    const score = Math.round(fpsScore * 0.25 + jitterScore * 0.2 + clippingScore * 0.2 + amplitudeScore * 0.2 + brightnessScore * 0.15);
    let label = "Nincs elegendő adat";
    if (recentSamples.length >= 30) {
      if (score < 45) label = "Gyenge jelminőség";
      else if (score < 65) label = "Változó jelminőség";
      else if (score < 82) label = "Megfelelő technikai jel";
      else label = "Jó technikai jel";
    }
    return { score, label, fps, jitter, clipped, brightness, amplitude, sampleCount: recentSamples.length };
  }

  snapshot(now = performance.now()) {
    const windowStart = now - 60000;
    const windowSamples = this.samples.filter(sample => sample.t >= windowStart);
    const durationSec = windowSamples.length > 1
      ? (windowSamples[windowSamples.length - 1].t - windowSamples[0].t) / 1000
      : 0;
    const peaks = this.peaks;
    const rawIntervals = [];
    for (let i = 1; i < peaks.length; i += 1) {
      const previous = peaks[i - 1];
      const current = peaks[i];
      if (current.t >= windowStart) {
        rawIntervals.push({
          ms: current.t - previous.t,
          startIndex: previous.index,
          endIndex: current.index,
          endTime: current.t
        });
      }
    }
    const filtered = filterIntervals(rawIntervals);
    const quality = this.#quality(now);
    const accepted = filtered.accepted;
    const recentForBpm = accepted.filter(item => item.endTime >= now - 12000);
    const bpmStats = recentForBpm.length >= 4 ? calculateHrv(recentForBpm) : null;

    const enoughDuration = durationSec >= 58;
    const enoughIntervals = accepted.length >= 30;
    const cleanEnough = filtered.acceptanceRatio >= 0.8;
    const signalGoodEnough = quality.score >= 60 && quality.fps >= 12 && quality.clipped < 0.25;
    const hrvReady = enoughDuration && enoughIntervals && cleanEnough && signalGoodEnough;
    const hrv = hrvReady ? calculateHrv(accepted) : null;

    let reliability = "Adatgyűjtés";
    if (quality.sampleCount < 30) reliability = "Jel stabilizálása";
    else if (quality.score < 45) reliability = "Gyenge jel – ellenőrizd az ujjhelyzetet";
    else if (!enoughDuration) reliability = `Adatgyűjtés · ${Math.min(60, Math.floor(durationSec))}/60 mp`;
    else if (!enoughIntervals || !cleanEnough) reliability = "Nem elég tiszta ütésköz – HRV nem közölhető";
    else if (!signalGoodEnough) reliability = "Alacsony technikai megbízhatóság – ismételd meg";
    else if (quality.score >= 82 && filtered.acceptanceRatio >= 0.9) reliability = "Jó jelminőség · rövid ablakos becslés";
    else reliability = "Megfelelő jel · rövid ablakos becslés";

    const bpm = bpmStats && signalGoodEnough ? bpmStats.bpm : null;
    return {
      bpm,
      ibi: bpmStats && signalGoodEnough ? bpmStats.meanIbi : null,
      hrv,
      hrvReady,
      reliability,
      quality,
      durationSec,
      rawIntervalCount: rawIntervals.length,
      acceptedIntervalCount: accepted.length,
      rejectedIntervalCount: filtered.rejected.length,
      acceptanceRatio: filtered.acceptanceRatio,
      sampleRate: quality.fps
    };
  }
}
