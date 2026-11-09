const $ = id => document.getElementById(id);

let inhale = 5.5, exhale = 5.5;
let breathing = false, phaseTimer = null, phaseStart = 0, phaseDuration = 0;
let phaseName = "inhale", raf = null;

function fmt(n, digits=1){ return Number(n).toFixed(digits).replace(".", ","); }
function updateCycle(){
  $("inhaleValue").textContent = `${fmt(inhale)} mp`;
  $("exhaleValue").textContent = `${fmt(exhale)} mp`;
  $("rpmValue").textContent = `${fmt(60/(inhale+exhale),2)} / perc`;
}
function gong(freq=440, duration=1.1){
  try{
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type="sine"; osc.frequency.value=freq;
    gain.gain.setValueAtTime(0.0001,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045,ctx.currentTime+0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+duration);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime+duration+0.05);
    osc.onended=()=>ctx.close();
  }catch(e){ console.warn("Audio unavailable",e); }
}
function beginPhase(name){
  phaseName=name;
  phaseDuration=(name==="inhale"?inhale:exhale)*1000;
  phaseStart=performance.now();
  $("phase").textContent=name==="inhale"?"Belégzés":"Kilégzés";
  $("orb").className=`orb ${name}`;
  $("phaseHint").textContent="mp";
  gong(name==="inhale"?510:390,1.25);
  if(raf) cancelAnimationFrame(raf);
  const tick=now=>{
    if(!breathing)return;
    const elapsed=now-phaseStart, left=Math.max(0,(phaseDuration-elapsed)/1000);
    $("countdown").textContent=fmt(left,1);
    if(elapsed>=phaseDuration){ beginPhase(name==="inhale"?"exhale":"inhale"); return; }
    raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
}
$("startBtn").addEventListener("click",()=>{
  if(breathing)return;
  breathing=true; $("startBtn").disabled=true; $("stopBtn").disabled=false;
  $("status").textContent="Légzésvezetés aktív"; beginPhase("inhale");
});
$("stopBtn").addEventListener("click",()=>{
  breathing=false; cancelAnimationFrame(raf);
  $("startBtn").disabled=false; $("stopBtn").disabled=true;
  $("status").textContent="Szünetel"; $("phase").textContent="Szünet";
  $("countdown").textContent="—"; $("orb").className="orb";
});
updateCycle();

// Camera PPG prototype: red-channel intensity sampled from a tiny center crop.
// Beat timing and HRV are estimates; motion, pressure, lighting and camera pipeline can corrupt them.
let stream=null, videoTrack=null, sampling=false, sampleRaf=null;
let samples=[], peaks=[], ibiValues=[], lastPeakTime=0, lastSignal=0, signalHistory=[];
const canvas=$("sampleCanvas"), ctx=canvas.getContext("2d",{willReadFrequently:true});
async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){ alert("A böngésző nem támogatja a kamerás mérést. HTTPS-kapcsolat és kompatibilis böngésző szükséges."); return; }
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:640},height:{ideal:480}},audio:false});
    $("camera").srcObject=stream; await $("camera").play();
    videoTrack=stream.getVideoTracks()[0];
    const caps=videoTrack.getCapabilities?.();
    if(caps?.torch){ try{await videoTrack.applyConstraints({advanced:[{torch:true}]});}catch(e){console.warn("Torch unavailable",e);} }
    sampling=true; samples=[]; peaks=[]; ibiValues=[]; lastPeakTime=0; signalHistory=[];
    $("cameraStatus").textContent="Mérés folyamatban";
    $("quality").textContent="Jel gyűjtése";
    $("cameraBtn").disabled=true; $("cameraStopBtn").disabled=false;
    sampleFrame();
  }catch(err){
    alert("Nem sikerült elindítani a kamerát: "+err.message+"\nEllenőrizd a kameraengedélyt, és hogy HTTPS-en vagy-e.");
  }
}
function sampleFrame(){
  if(!sampling)return;
  const v=$("camera");
  if(v.readyState>=2 && v.videoWidth){
    ctx.drawImage(v,0,0,32,32);
    const d=ctx.getImageData(8,8,16,16).data;
    let red=0;
    for(let i=0;i<d.length;i+=4) red+=d[i];
    red/=d.length/4;
    const now=performance.now();
    samples.push({t:now,v:red});
    if(samples.length>360) samples.shift();
    signalHistory.push(red); if(signalHistory.length>15)signalHistory.shift();
    // Lightweight detrending + local maxima. This is a prototype detector, not a validated clinical algorithm.
    if(signalHistory.length===15){
      const mean=signalHistory.reduce((a,b)=>a+b,0)/15;
      const centered=red-mean;
      const prev=signalHistory[13]-mean;
      if(lastSignal>prev && lastSignal>centered && lastSignal>0.35){
        const peakTime=now-100; // approximate center of the 3-sample maximum
        if(lastPeakTime && peakTime-lastPeakTime>350 && peakTime-lastPeakTime<1500){
          const ibi=peakTime-lastPeakTime;
          ibiValues.push(ibi); if(ibiValues.length>60)ibiValues.shift();
          renderMetrics();
        }
        lastPeakTime=peakTime;
      }
      lastSignal=centered;
    }
  }
  sampleRaf=requestAnimationFrame(sampleFrame);
}
function renderMetrics(){
  const vals=ibiValues.filter(x=>x>=350&&x<=1500);
  if(vals.length<4)return;
  const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
  const bpm=60000/mean;
  const diffs=[]; for(let i=1;i<vals.length;i++)diffs.push(vals[i]-vals[i-1]);
  const rmssd=Math.sqrt(diffs.reduce((a,b)=>a+b*b,0)/diffs.length);
  const variance=vals.reduce((a,b)=>a+(b-mean)**2,0)/(vals.length-1);
  $("bpm").textContent=fmt(bpm,0);
  $("ibi").textContent=fmt(mean,0);
  $("rmssd").textContent=fmt(rmssd,0);
  $("sdnn").textContent=fmt(Math.sqrt(variance),0);
  $("quality").textContent=vals.length>=20?"Előzetes becslés":"Kevés adat";
}
async function stopCamera(){
  sampling=false; if(sampleRaf)cancelAnimationFrame(sampleRaf);
  if(videoTrack){
    try{await videoTrack.applyConstraints({advanced:[{torch:false}]});}catch(e){}
  }
  stream?.getTracks().forEach(t=>t.stop()); stream=null; videoTrack=null;
  $("camera").srcObject=null;
  $("cameraStatus").textContent="Kikapcsolva";
  $("cameraBtn").disabled=false; $("cameraStopBtn").disabled=true;
}
$("cameraBtn").addEventListener("click",startCamera);
$("cameraStopBtn").addEventListener("click",stopCamera);

if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
}
