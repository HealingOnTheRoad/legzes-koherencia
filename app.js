import { PPGProcessor } from "./ppg-core.mjs";

const $ = id => document.getElementById(id);

let inhale = 5.5;
let exhale = 5.5;
let breathing = false;
let phaseStart = 0;
let phaseDuration = 0;
let phaseName = "inhale";
let raf = null;
let audioContext = null;

function fmt(value, digits = 1) {
  return Number(value).toFixed(digits).replace(".", ",");
}

function updateCycle() {
  const total = inhale + exhale;
  const rate = 60 / total;
  $("inhaleValue").textContent = `${fmt(inhale)} mp`;
  $("exhaleValue").textContent = `${fmt(exhale)} mp`;
  $("rpmValue").textContent = `${fmt(rate, 2)} / perc`;
  $("inhaleSetting").textContent = `${fmt(inhale)} mp`;
  $("exhaleSetting").textContent = `${fmt(exhale)} mp`;
  const valid = total >= 60 / 6.5 && total <= 60 / 4.5;
  $("cycleValidation").classList.toggle("invalid", !valid);
  $("cycleValidation").textContent = valid
    ? `Teljes ciklus: ${fmt(total)} mp · ${fmt(rate, 2)} légzés/perc. A két szakasz külön állítható.`
    : `A teljes ciklus jelenleg ${fmt(total)} mp (${fmt(rate, 2)} légzés/perc). A folytatáshoz állítsd 9,2–13,3 mp közé.`;
  $("startBtn").disabled = breathing || !valid;
}

function getAudioContext() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

function gong(frequency = 440, duration = 1.15) {
  try {
    const context = getAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration + 0.05);
  } catch (error) {
    console.warn("Audio unavailable", error);
  }
}

function beginPhase(name) {
  phaseName = name;
  phaseDuration = (name === "inhale" ? inhale : exhale) * 1000;
  phaseStart = performance.now();
  $("phase").textContent = name === "inhale" ? "Belégzés" : "Kilégzés";
  $("orb").className = `orb ${name}`;
  $("phaseHint").textContent = "mp";
  gong(name === "inhale" ? 510 : 390, 1.25);
  if (raf) cancelAnimationFrame(raf);
  const tick = now => {
    if (!breathing) return;
    const elapsed = now - phaseStart;
    const left = Math.max(0, (phaseDuration - elapsed) / 1000);
    $("countdown").textContent = fmt(left, 1);
    if (elapsed >= phaseDuration) {
      beginPhase(name === "inhale" ? "exhale" : "inhale");
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

$("inhaleRange").addEventListener("input", event => {
  inhale = Number(event.target.value);
  updateCycle();
});
$("exhaleRange").addEventListener("input", event => {
  exhale = Number(event.target.value);
  updateCycle();
});
$("startBtn").addEventListener("click", () => {
  if (breathing || inhale + exhale < 60 / 6.5 || inhale + exhale > 60 / 4.5) return;
  breathing = true;
  $("stopBtn").disabled = false;
  $("inhaleRange").disabled = true;
  $("exhaleRange").disabled = true;
  $("status").textContent = "Légzésvezetés aktív";
  updateCycle();
  beginPhase("inhale");
});
$("stopBtn").addEventListener("click", () => {
  breathing = false;
  if (raf) cancelAnimationFrame(raf);
  $("stopBtn").disabled = true;
  $("inhaleRange").disabled = false;
  $("exhaleRange").disabled = false;
  $("status").textContent = "Szünetel";
  $("phase").textContent = "Szünet";
  $("countdown").textContent = "—";
  $("orb").className = "orb";
  updateCycle();
});
updateCycle();

// Camera PPG: process per video frame, using actual performance timestamps.
// All raw samples remain in memory only and are discarded when the page is closed.
let stream = null;
let videoTrack = null;
let sampling = false;
let videoFrameHandle = null;
let animationFrameHandle = null;
let lastVideoTime = -1;
let processor = new PPGProcessor();
const video = $("camera");
const canvas = $("sampleCanvas");
const context = canvas.getContext("2d", { willReadFrequently: true });

function renderSnapshot() {
  const result = processor.snapshot(performance.now());
  $("bpm").textContent = result.bpm === null ? "—" : fmt(result.bpm, 0);
  $("ibi").textContent = result.ibi === null ? "—" : fmt(result.ibi, 0);
  $("rmssd").textContent = result.hrv ? fmt(result.hrv.rmssd, 1) : "—";
  $("sdnn").textContent = result.hrv ? fmt(result.hrv.sdnn, 1) : "—";
  $("quality").textContent = result.reliability;
  $("qualityDetail").textContent = `Technikai jelminőség (heurisztikus): ${result.quality.score}/100 · ${fmt(result.sampleRate, 1)} FPS · ${Math.round(result.acceptanceRatio * 100)}% elfogadott ütésköz`;
  $("measurementInfo").textContent = `Mérési ablak: ${Math.floor(result.durationSec)} mp / 60 mp · elfogadott IBI: ${result.acceptedIntervalCount} · kiszűrt: ${result.rejectedIntervalCount}`;
  $("hrvNote").textContent = result.hrv
    ? `Rövid ablakos PPG-alapú PRV-becslés ${result.hrv.intervalCount} elfogadott ütésközből. A többperces, jó minőségű mérés megbízhatóbb; ez nem klinikai érték.`
    : "HRV/PRV csak kb. 60 mp folyamatos, megfelelő minőségű jel és legalább 30 elfogadott ütésköz esetén jelenik meg. A kamerás pulzusból számolt PRV nem azonos az EKG-alapú HRV-vel; az érték nem klinikai mérés.";
}

function processVideoFrame(timestamp) {
  if (!sampling || video.readyState < 2 || !video.videoWidth) return;
  try {
    context.drawImage(video, 0, 0, 64, 64);
    const image = context.getImageData(24, 24, 16, 16);
    const data = image.data;
    let red = 0, green = 0, blue = 0, clippedPixels = 0;
    const pixels = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      red += r; green += g; blue += b;
      if (r >= 252 || g >= 252 || b >= 252 || (r <= 2 && g <= 2 && b <= 2)) clippedPixels += 1;
    }
    red /= pixels; green /= pixels; blue /= pixels;
    const brightness = (red + green + blue) / 3;
    processor.pushFrame({
      t: timestamp,
      red,
      green,
      blue,
      brightness,
      clippedFraction: clippedPixels / pixels
    });
    renderSnapshot();
  } catch (error) {
    console.warn("PPG frame processing failed", error);
  }
}

function scheduleNextFrame() {
  if (!sampling) return;
  if (typeof video.requestVideoFrameCallback === "function") {
    videoFrameHandle = video.requestVideoFrameCallback((now) => {
      processVideoFrame(now);
      scheduleNextFrame();
    });
  } else {
    animationFrameHandle = requestAnimationFrame(now => {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        processVideoFrame(now);
      }
      scheduleNextFrame();
    });
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("A böngésző nem támogatja a kameramérést. HTTPS-kapcsolat és kompatibilis böngésző szükséges.");
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    videoTrack = stream.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities?.();
    if (capabilities?.torch) {
      try {
        await videoTrack.applyConstraints({ advanced: [{ torch: true }] });
        $("cameraStatus").textContent = "Kamera + vaku aktív";
      } catch (error) {
        $("cameraStatus").textContent = "Kamera aktív · vaku nem támogatott";
      }
    } else {
      $("cameraStatus").textContent = "Kamera aktív · vaku nem elérhető";
    }
    processor.reset();
    sampling = true;
    lastVideoTime = -1;
    $("cameraBtn").disabled = true;
    $("cameraStopBtn").disabled = false;
    $("quality").textContent = "Jel gyűjtése";
    $("qualityDetail").textContent = "A jelminőség kiértékelése folyamatban…";
    $("measurementInfo").textContent = "Mérési adatok gyűjtése…";
    scheduleNextFrame();
  } catch (error) {
    alert(`Nem sikerült elindítani a kamerát: ${error.message}\nEllenőrizd a kameraengedélyt, és hogy HTTPS-en nyitottad-e meg az oldalt.`);
    await stopCamera();
  }
}

async function stopCamera() {
  sampling = false;
  if (videoFrameHandle !== null && typeof video.cancelVideoFrameCallback === "function") {
    video.cancelVideoFrameCallback(videoFrameHandle);
  }
  if (animationFrameHandle !== null) cancelAnimationFrame(animationFrameHandle);
  if (videoTrack) {
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: false }] });
    } catch (error) {
      // Torch-off is best effort; stopping the track below releases the camera.
    }
  }
  stream?.getTracks().forEach(track => track.stop());
  stream = null;
  videoTrack = null;
  video.srcObject = null;
  videoFrameHandle = null;
  animationFrameHandle = null;
  $("cameraStatus").textContent = "Kikapcsolva";
  $("cameraBtn").disabled = false;
  $("cameraStopBtn").disabled = true;
}

$("cameraBtn").addEventListener("click", startCamera);
$("cameraStopBtn").addEventListener("click", stopCamera);
window.addEventListener("pagehide", () => {
  sampling = false;
  stream?.getTracks().forEach(track => track.stop());
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
