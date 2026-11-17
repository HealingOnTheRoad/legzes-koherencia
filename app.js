// Heart Coherence v0.3 — experimental camera PPG and paced-breathing analysis.
const $=id=>document.getElementById(id), clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), fmt=(x,d=1)=>Number(x).toFixed(d).replace(".",",");
let inhale=5.5,exhale=5.5,breathing=false,phase="inhale",phaseStart=0,phaseDur=0,raf=0,scanRunning=false,scanTimer=null,autoMode=false;
let stream=null,track=null,videoSamples=[],ibiRaw=[],ibiClean=[],peakTimes=[],frameRaf=0,signal=[],lastCandidate=0,prevFiltered=0,prevPrev=0,baseline=0,noise=0;
let metrics={quality:0,rmssd:null,sdnn:null,bpm:null,amp:null,lock:null,r2:null,n:0};
let history=[]; // {t, ibi}; timestamps in ms
const audio=(f)=>{try{const c=new(window.AudioContext||webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.frequency.value=f;o.type="sine";g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.035,c.currentTime+.08);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+1.1);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+1.15);o.onended=()=>c.close()}catch(e){}};
function updateTimes(){ $("inhaleValue").textContent=fmt(inhale)+" mp";$("exhaleValue").textContent=fmt(exhale)+" mp";$("rpmValue").textContent=fmt(60/(inhale+exhale),2)+" / perc"; }
function phaseStartNow(p){phase=p;phaseStart=performance.now();phaseDur=(p==="inhale"?inhale:exhale)*1000;$("phase").textContent=p==="inhale"?"Belégzés":"Kilégzés";$("orb").className="orb "+p;audio(p==="inhale"?510:390);if(raf)cancelAnimationFrame(raf);const tick=now=>{if(!breathing)return;let elapsed=now-phaseStart,left=Math.max(0,(phaseDur-elapsed)/1000);$("countdown").textContent=fmt(left);if(elapsed>=phaseDur){phaseStartNow(p==="inhale"?"exhale":"inhale");return}raf=requestAnimationFrame(tick)};raf=requestAnimationFrame(tick);}
$("startBtn").onclick=()=>{if(breathing)return;breathing=true;$("startBtn").disabled=true;$("stopBtn").disabled=false;$("status").textContent="Légzés aktív";phaseStartNow("inhale")};
$("stopBtn").onclick=()=>{breathing=false;cancelAnimationFrame(raf);$("startBtn").disabled=false;$("stopBtn").disabled=true;$("status").textContent="Szünet";$("phase").textContent="Szünet";$("countdown").textContent="—";$("orb").className="orb";};
updateTimes();

// Camera sample: robust red/green ratio, clipping and frame-to-frame motion indicators.
const cvs=$("sampleCanvas"),cx=cvs.getContext("2d",{willReadFrequently:true});
async function startCamera(){try{if(!navigator.mediaDevices?.getUserMedia)throw Error("A kamera API nem érhető el. HTTPS és támogatott böngésző szükséges.");stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:640},height:{ideal:480},frameRate:{ideal:30,max:30}},audio:false});$("camera").srcObject=stream;await $("camera").play();track=stream.getVideoTracks()[0];let cap=track.getCapabilities?.();if(cap?.torch){try{await track.applyConstraints({advanced:[{torch:true}]})}catch(e){}}videoSamples=[];ibiRaw=[];ibiClean=[];peakTimes=[];history=[];signal=[];baseline=0;noise=0;lastCandidate=0;prevFiltered=prevPrev=0;$("cameraStatus").textContent="Mér";$("cameraBtn").disabled=true;$("cameraStopBtn").disabled=false;frameLoop()}catch(e){alert("Kameraindítás sikertelen: "+e.message)}}
function frameLoop(){if(!stream)return;let v=$("camera");if(v.readyState>=2&&v.videoWidth){cx.drawImage(v,0,0,24,24);let d=cx.getImageData(4,4,16,16).data,r=0,g=0,b=0,clip=0;for(let i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];if(d[i]>248||d[i]<5)clip++}let n=d.length/4;r/=n;g/=n;b/=n;let val=r/(g+1);let t=performance.now();videoSamples.push({t,val,r,g,b,clip:clip/n});if(videoSamples.length>900)videoSamples.shift();processSignal(t,val,clip/n)}frameRaf=requestAnimationFrame(frameLoop)}
function processSignal(t,x,clip){ // EMA detrend + robust adaptive threshold on pulsatile component
  if(!baseline)baseline=x;baseline+=.018*(x-baseline);let y=x-baseline;
  signal.push({t,y,clip});if(signal.length>15)signal.shift();
  if(signal.length<15)return;
  let arr=signal.map(s=>s.y).sort((a,b)=>a-b),med=arr[7],mad=arr.map(v=>Math.abs(v-med)).sort((a,b)=>a-b)[7]||.0001;
  let z=y-med, threshold=Math.max(mad*1.7,.0007);
  let prev=signal[13].y-med, prev2=signal[12].y-med;
  // Local maximum on delayed three-point window; suppress refractory-period duplicates.
  if(prev>prev2&&prev>z&&prev>threshold&&t-lastCandidate>420){
    const pt=signal[13].t;
    if(lastCandidate){let dt=pt-lastCandidate;if(dt>=350&&dt<=1500){ibiRaw.push({t:pt,ibi:dt,amp:prev,mad,clip});if(ibiRaw.length>180)ibiRaw.shift();recalculate();}}
    lastCandidate=pt;
  }
}
function recalculate(){
  const recent=ibiRaw.slice(-40);if(recent.length<5)return;
  // Reject implausible intervals and local outliers against rolling median.
  let accepted=[];
  for(let i=0;i<recent.length;i++){let v=recent[i].ibi,neigh=recent.slice(Math.max(0,i-3),Math.min(recent.length,i+4)).map(q=>q.ibi).sort((a,b)=>a-b),m=neigh[Math.floor(neigh.length/2)];if(v>=350&&v<=1500&&Math.abs(v-m)<=Math.max(180,m*.22))accepted.push(recent[i]);}
  ibiClean=accepted;let vals=accepted.map(q=>q.ibi);if(vals.length<5)return;
  let mean=vals.reduce((a,b)=>a+b,0)/vals.length,diffs=vals.slice(1).map((v,i)=>v-vals[i]),rmssd=Math.sqrt(diffs.reduce((a,b)=>a+b*b,0)/Math.max(1,diffs.length)),sdnn=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,vals.length-1));
  let clipMean=recent.reduce((a,b)=>a+b.clip,0)/recent.length,amp=accepted.reduce((a,b)=>a+Math.abs(b.amp),0)/accepted.length;
  let validRatio=accepted.length/recent.length,quality=clamp(validRatio*(1-clipMean)*clamp(amp/.002,0,1),0,1);
  metrics={quality,rmssd,sdnn,bpm:60000/mean,amp,lock:null,r2:null,n:vals.length};
  history=accepted.map(q=>({t:q.t,ibi:q.ibi}));
  renderMetrics();
}
function renderMetrics(){$("bpm").textContent=metrics.bpm?fmt(metrics.bpm,0):"—";$("rmssd").textContent=metrics.rmssd?fmt(metrics.rmssd,0):"—";$("sdnn").textContent=metrics.sdnn?fmt(metrics.sdnn,0):"—";$("quality").textContent=fmt(metrics.quality*100,0)+"%";$("qualityDetail").textContent=metrics.quality>.7?"Jó":metrics.quality>.4?"Közepes":"Gyenge";$("beats").textContent=metrics.n||"—";$("rsa").textContent=metrics.amp?fmt(metrics.amp*1000,1):"—";$("phaseLock").textContent=metrics.lock==null?"—":fmt(metrics.lock,2);$("fit").textContent=metrics.r2==null?"—":fmt(metrics.r2,2);$("coherenceLabel").textContent=metrics.lock==null?"Nincs értékelés":metrics.quality>.65?"Kísérleti becslés":"Gyenge jelminőség";}
async function stopCamera(){cancelAnimationFrame(frameRaf);if(track){try{await track.applyConstraints({advanced:[{torch:false}]})}catch(e){}}stream?.getTracks().forEach(t=>t.stop());stream=null;track=null;$("camera").srcObject=null;$("cameraStatus").textContent="Kikapcsolva";$("cameraBtn").disabled=false;$("cameraStopBtn").disabled=true;}
$("cameraBtn").onclick=startCamera;$("cameraStopBtn").onclick=stopCamera;

// Estimate respiratory sinus arrhythmia coupling against the *paced* respiratory phase.
// Linear harmonic regression of IBI against phase; this is a research proxy, not a validated coherence score.
function couplingForWindow(start,end,inh,exh){
 const pts=history.filter(p=>p.t>=start&&p.t<=end);if(pts.length<8||metrics.quality<.55)return null;
 let X=[],Y=[];for(const p of pts){let cyc=inh+exh,rel=((p.t-start)% (cyc*1000))/1000,ang=2*Math.PI*(rel/cyc);X.push([1,Math.sin(ang),Math.cos(ang)]);Y.push(p.ibi)}
 const solve3=A=>{let m=A.map(r=>r.slice());for(let i=0;i<3;i++){let k=i;for(let j=i+1;j<3;j++)if(Math.abs(m[j][i])>Math.abs(m[k][i]))k=j;[m[i],m[k]]=[m[k],m[i]];if(Math.abs(m[i][i])<1e-8)return null;let d=m[i][i];for(let c=i;c<4;c++)m[i][c]/=d;for(let j=0;j<3;j++)if(j!==i){d=m[j][i];for(let c=i;c<4;c++)m[j][c]-=d*m[i][c]}}return m.map(r=>r[3])};
 let A=Array.from({length:3},()=>[0,0,0,0]);for(let i=0;i<X.length;i++)for(let r=0;r<3;r++){A[r][3]+=X[i][r]*Y[i];for(let c=0;c<3;c++)A[r][c]+=X[i][r]*X[i][c]}
 let beta=solve3(A);if(!beta)return null;let avg=Y.reduce((a,b)=>a+b,0)/Y.length,ss=0,err=0;for(let i=0;i<Y.length;i++){let pred=beta[0]+beta[1]*X[i][1]+beta[2]*X[i][2];ss+=(Y[i]-avg)**2;err+=(Y[i]-pred)**2}
 let r2=ss?clamp(1-err/ss,0,1):0,amp=Math.hypot(beta[1],beta[2]),lock=clamp(Math.sqrt(r2),0,1);
 return {amp,r2,lock,n:pts.length,quality:metrics.quality};
}

// Resonance scan: 3x3 grid, randomized order to reduce order effects; each stage records only after settling.
function settings(){let vals=["inhMin","inhMax","exMin","exMax","stageLength"].map(id=>Number($(id).value));if(vals.some(v=>!Number.isFinite(v)))throw Error("Ellenőrizd a tesztbeállításokat.");let [a,b,c,d,dur]=vals;if(a<4||b>7||c<4||d>7||a>b||c>d||dur<30||dur>120)throw Error("Határok: 4–7 mp, szakasz: 30–120 mp.");return {a,b,c,d,dur}}
function wait(ms){return new Promise(res=>scanTimer=setTimeout(res,ms))}
function setBreath(i,e){inhale=i;exhale=e;updateTimes()}
function shuffle(a){for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
async function runScan(){if(!stream){alert("Előbb indítsd el a kamerás pulzusmérést.");return}if(scanRunning)return;let s;try{s=settings()}catch(e){alert(e.message);return}
 scanRunning=true;$("scanBtn").disabled=true;$("autoBtn").disabled=true;$("scanResults").textContent="";let combos=shuffle([.0,.5,1].flatMap(i=>[.0,.5,1].map(j=>({i:s.a+(s.b-s.a)*i,e:s.c+(s.d-s.c)*j}))));let results=[];
 try{for(let k=0;k<combos.length;k++){let q=combos[k];setBreath(q.i,q.e);if(!breathing){breathing=true;$("startBtn").disabled=true;$("stopBtn").disabled=false}phaseStartNow("inhale");$("scanStatus").textContent=`Teszt ${k+1}/9 · ${fmt(q.i)} mp be / ${fmt(q.e)} mp ki`;let start=performance.now();await wait(10000);let measureStart=performance.now();await wait(Math.max(20000,s.dur*1000-10000));let m=couplingForWindow(measureStart,performance.now(),q.i,q.e);if(m)results.push({...q,...m});}
 }catch(e){$("scanStatus").textContent="A teszt megszakadt: "+e.message}
 scanRunning=false;$("scanBtn").disabled=false;$("autoBtn").disabled=false;
 if(results.length){results.sort((a,b)=>(b.quality*b.r2*b.amp)-(a.quality*a.r2*a.amp));let best=results[0];setBreath(best.i,best.e);$("scanStatus").textContent=`Teszt kész. Legígéretesebb kombináció: ${fmt(best.i)} mp belégzés + ${fmt(best.e)} mp kilégzés.`;$("scanResults").textContent=results.map((r,i)=>`${i+1}. ${fmt(r.i)} + ${fmt(r.e)} mp | RSA ${fmt(r.amp,1)} ms | illeszkedés ${fmt(r.r2,2)} | jel ${fmt(r.quality*100,0)}%`).join("\n")+"\n\nEz előzetes, vezetett légzéshez viszonyított becslés; nem klinikai rezonancia-meghatározás.";}else{$("scanStatus").textContent="Nem volt elegendő jó minőségű adat. Próbáld újra nyugodtabb kézzel, stabil ujjnyomással."}
}
$("scanBtn").onclick=runScan;

// Independent coordinate-style fine tuning around selected candidate. One parameter changes at a time.
async function runAdaptive(){if(!stream){alert("Előbb indítsd el a kamerás pulzusmérést.");return}if(scanRunning)return;scanRunning=true;$("autoBtn").disabled=true;$("scanBtn").disabled=true;let best={i:inhale,e:exhale,score:-1};try{for(let round=0;round<3;round++){for(let axis of ["i","e"]){let candidates=[-.2,0,.2].map(d=>({i:clamp(best.i+(axis==="i"?d:0),4,7),e:clamp(best.e+(axis==="e"?d:0),4,7)}));for(let q of candidates){setBreath(q.i,q.e);if(!breathing){breathing=true;$("startBtn").disabled=true;$("stopBtn").disabled=false}phaseStartNow("inhale");$("scanStatus").textContent=`Adaptív finomhangolás ${round+1}/3 · ${axis==="i"?"belégzés":"kilégzés"}`;await wait(8000);let t=performance.now();await wait(30000);let m=couplingForWindow(t,performance.now(),q.i,q.e);if(m){let score=m.quality*m.r2*m.amp;if(score>best.score)best={i:q.i,e:q.e,score,...m}}}}}setBreath(best.i,best.e);$("scanStatus").textContent=best.score>=0?`Finomhangolás kész: ${fmt(best.i)} mp belégzés + ${fmt(best.e)} mp kilégzés.`:"Nem volt elég jó minőségű adat az optimalizáláshoz.";}finally{scanRunning=false;$("autoBtn").disabled=false;$("scanBtn").disabled=false}}
$("autoBtn").onclick=runAdaptive;
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));