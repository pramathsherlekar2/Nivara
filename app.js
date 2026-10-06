const NIVARA_BUILD='13';
const views=[...document.querySelectorAll('.view')];
const nav=[...document.querySelectorAll('[data-view]')];
const toast=document.getElementById('toast');

function showView(id){
  views.forEach(v=>v.classList.toggle('active',v.id===id));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===id));
  const titles={overview:'Command Center',report:'Report Incident',map:'Risk Map',safezones:'Safe Zones',care:'Nivara Care',simulation:'Scenario Lab'};
  document.getElementById('pageTitle').textContent=titles[id]||'Nivara';
  window.scrollTo({top:0,behavior:'smooth'});
}
nav.forEach(n=>n.addEventListener('click',()=>showView(n.dataset.view)));

const onlineLabel=document.getElementById('networkLabel');
function updateNetwork(){
  const online=navigator.onLine;
  onlineLabel.textContent=online?'Online':'Offline Mode';
  const dot=document.querySelector('.status-dot, .mini-dot');
  if(dot) dot.style.background=online?'var(--accent)':'var(--warn)';
  const connectionText=document.getElementById('connectionText');
  if(connectionText) connectionText.textContent=online?'Systems operational':'Offline — cached systems available';
}
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);updateNetwork();

function notify(msg){toast.textContent=msg;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2800)}

document.querySelectorAll('.care-chip').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.care-chip').forEach(x=>x.classList.remove('selected'));
  btn.classList.add('selected');
}));

// ===== Incident capture, live location and duplicate detection =====
let liveCoords=null;
let liveLocationWatchId=null;
let pendingReport=null;

const locationStatus=document.getElementById('locationStatus');
const locationInput=document.getElementById('location');
const liveLocationBtn=document.getElementById('liveLocationBtn');
const duplicateModal=document.getElementById('duplicateModal');
const duplicateText=document.getElementById('duplicateText');
const duplicateMeta=document.getElementById('duplicateMeta');

function setLocationStatus(message,state=''){
  if(!locationStatus) return;
  locationStatus.className=`location-status ${state}`.trim();
  const span=locationStatus.querySelector('span');
  if(span) span.textContent=message;
}

function formatCoords(coords){
  return `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (±${Math.round(coords.accuracy)}m)`;
}

function startLiveLocation(){
  if(!navigator.geolocation){
    setLocationStatus('Geolocation is not supported by this browser.','error');
    notify('Live location is not supported on this device/browser.');
    return;
  }
  if(liveLocationWatchId!==null){
    navigator.geolocation.clearWatch(liveLocationWatchId);
    liveLocationWatchId=null;
    liveCoords=null;
    liveLocationBtn.textContent='⌖ Use Live Location';
    setLocationStatus('Live location is off');
    notify('Live location stopped.');
    return;
  }
  setLocationStatus('Requesting device location…');
  liveLocationWatchId=navigator.geolocation.watchPosition(position=>{
    liveCoords={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
    locationInput.value=`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
    setLocationStatus(`Live location active · ${formatCoords(position.coords)}`,'live');
    liveLocationBtn.textContent='◉ Live Location On';
  },error=>{
    liveLocationWatchId=null;
    liveCoords=null;
    liveLocationBtn.textContent='⌖ Use Live Location';
    const message=error.code===1?'Location permission was denied. Enable it in browser settings.':error.code===2?'Location is currently unavailable.':'Location request timed out.';
    setLocationStatus(message,'error');
    notify(message);
  },{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
}

liveLocationBtn?.addEventListener('click',startLiveLocation);

function normalizeText(text){
  return (text||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}
function tokenSet(text){return new Set(normalizeText(text).split(' ').filter(w=>w.length>2));}
function textSimilarity(a,b){
  const A=tokenSet(a),B=tokenSet(b);
  if(!A.size||!B.size) return 0;
  let common=0; A.forEach(x=>{if(B.has(x)) common++});
  return common/(A.size+B.size-common);
}
function distanceMeters(a,b){
  if(!a||!b) return Infinity;
  const R=6371000,rad=x=>x*Math.PI/180;
  const dLat=rad(b.latitude-a.latitude),dLon=rad(b.longitude-a.longitude);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function getSavedReports(){
  try{return JSON.parse(localStorage.getItem('nivara-reports')||'[]')}catch{return []}
}
function findPossibleDuplicate(report){
  const reports=getSavedReports();
  const now=Date.now();
  const candidates=reports.filter(r=>r.type===report.type && now-(r.timestamp||0)<24*60*60*1000);
  let best=null;
  candidates.forEach(r=>{
    const distance=distanceMeters(report.coords,r.coords);
    const similarity=textSimilarity(report.description,r.description);
    const sameLocation=normalizeText(report.location)&&normalizeText(report.location)===normalizeText(r.location);
    const likely=(distance<=300 && similarity>=0.15)||(distance<=120 && similarity>=0.05)||sameLocation&&similarity>=0.3;
    if(likely && (!best || (distance<best.distance && similarity>=best.similarity*0.7))) best={report:r,distance,similarity};
  });
  return best;
}
function saveReport(report){
  const reports=getSavedReports();
  reports.unshift(report);
  localStorage.setItem('nivara-reports',JSON.stringify(reports.slice(0,100)));
  const queue=document.getElementById('queueCount');
  if(queue) queue.textContent=String(parseInt(queue.textContent||'0')+1).padStart(2,'0');

  if(report.aiAnalysis){
    renderGemmaAnalysis(report.aiAnalysis);
    setAIStatus('GEMMA 4 ANALYSIS READY','ready');
    notify('Incident saved with Gemma 4 assessment.');
    return;
  }

  const risk=report.type==='Flood'?86:report.type==='Earthquake'?92:report.type==='Landslide'?89:report.type==='Fire'?82:74;
  document.getElementById('previewTitle').textContent=`${report.type} incident ready`;
  document.getElementById('previewText').textContent=`Nivara captured the ${report.type.toLowerCase()} report${report.description?' and its description':''} near ${report.location}. Duplicate screening has been applied before saving this incident.`;
  document.getElementById('previewRisk').textContent=`${risk}/100`;
  document.getElementById('previewConfidence').textContent=report.duplicateOverride?'Human verified':'Prototype';
  document.getElementById('previewStatus').textContent=navigator.onLine?'Ready to sync':'Saved locally';
  notify(navigator.onLine?'Incident captured — ready for AI analysis.':'Incident saved offline — will sync when connected.');
}
function finalizeReport(report){
  const duplicate=findPossibleDuplicate(report);
  if(duplicate){
    pendingReport=report;
    const distance=Number.isFinite(duplicate.distance)?`${Math.round(duplicate.distance)} m away`:'same named location';
    const similarity=Math.round(duplicate.similarity*100);
    duplicateText.textContent=`A ${report.type.toLowerCase()} report from the last 24 hours looks similar. Nivara uses time, type, location and description similarity to reduce duplicate reports.`;
    duplicateMeta.innerHTML=`<b>Possible match:</b> ${distance} · <b>Description similarity:</b> ${similarity}%`;
    openModal(duplicateModal);
    return;
  }
  saveReport(report);
}

async function fileToDataUrl(file, maxSize=1600, quality=.82){
  if(!file) return null;
  if(!file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
  const source=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error||new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
  return await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      const scale=Math.min(1,maxSize/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx){resolve(source);return;}
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      resolve(canvas.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>reject(new Error('Could not decode the selected image.'));
    img.src=source;
  });
}

function setAIStatus(label, state='ready'){
  const el=document.getElementById('aiStatus');
  if(!el)return;
  el.innerHTML=`<i></i> ${escapeHtml(label)}`;
  el.dataset.state=state;
}

function renderGemmaAnalysis(analysis){
  const title=document.getElementById('previewTitle');
  const text=document.getElementById('previewText');
  const risk=document.getElementById('previewRisk');
  const confidence=document.getElementById('previewConfidence');
  const status=document.getElementById('previewStatus');
  const evidence=document.getElementById('previewEvidence');
  if(!analysis)return;
  title.textContent=analysis.title||'Incident assessment';
  text.textContent=analysis.summary||'Gemma returned an assessment for responder review.';
  risk.textContent=analysis.risk||'MODERATE';
  confidence.textContent=Number.isFinite(Number(analysis.confidence))?`${Math.round(Number(analysis.confidence))}%`:'—';
  status.textContent='Gemma analyzed';
  const evidenceText=[...(analysis.evidence||[]),...(analysis.actions||[])].slice(0,2).join(' • ');
  evidence.textContent=evidenceText||'Evidence and recommended actions returned by Gemma 4. Human verification remains required.';
}

async function analyzeIncidentWithGemma(payload){
  const imageFile=document.getElementById('image')?.files?.[0];
  const imageData=imageFile?await fileToDataUrl(imageFile):null;
  setAIStatus('ANALYZING WITH GEMMA 4','loading');
  try{
    const response=await fetch('/api/analyze-incident',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...payload,imageData,imageMime:'image/jpeg'})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.message||'Gemma backend unavailable');
    renderGemmaAnalysis(result.analysis);
    setAIStatus('GEMMA 4 ANALYSIS READY','ready');
    notify('Gemma 4 analyzed the incident evidence.');
    return result.analysis;
  }catch(err){
    setAIStatus('OFFLINE FALLBACK','offline');
    document.getElementById('previewTitle').textContent='Local assessment ready';
    document.getElementById('previewText').textContent='Gemma is unavailable right now, so Nivara will save the report locally and keep the incident ready for later AI analysis.';
    document.getElementById('previewRisk').textContent='PENDING';
    document.getElementById('previewConfidence').textContent='—';
    document.getElementById('previewStatus').textContent='Local draft';
    document.getElementById('previewEvidence').textContent='AI analysis was skipped safely. Connect the Gemma backend to analyze this evidence.';
    return null;
  }
}

// Primary evidence uploader: click, preview, drag/drop, validation and remove.
const evidenceInput=document.getElementById('image');
const evidenceDropzone=document.getElementById('evidenceDropzone');
const evidenceSelected=document.getElementById('evidenceSelected');
const evidencePreview=document.getElementById('evidencePreview');
const evidenceName=document.getElementById('evidenceName');
const evidenceMeta=document.getElementById('evidenceMeta');
const evidenceRemove=document.getElementById('evidenceRemove');

function setEvidenceFile(file){
  if(!file) return false;
  if(!file.type?.startsWith('image/')){ notify('Please choose a valid image (JPG, PNG, WEBP or GIF).'); return false; }
  if(file.size>12*1024*1024){ notify('That photo is larger than 12 MB. Please choose a smaller image.'); return false; }

  try{
    const dt=new DataTransfer();
    dt.items.add(file);
    if(evidenceInput) evidenceInput.files=dt.files;
  }catch(err){
    console.warn('Could not assign dropped file to input:',err);
  }

  if(evidencePreview){
    if(evidencePreview.dataset.objectUrl) URL.revokeObjectURL(evidencePreview.dataset.objectUrl);
    const url=URL.createObjectURL(file);
    evidencePreview.dataset.objectUrl=url;
    evidencePreview.src=url;
    evidencePreview.style.display='block';
  }
  if(evidenceName) evidenceName.textContent=file.name;
  if(evidenceMeta) evidenceMeta.textContent=`${(file.size/1024/1024).toFixed(1)} MB · Ready for Gemma analysis`;
  if(evidenceSelected) evidenceSelected.hidden=false;
  notify('Evidence photo selected.');
  return true;
}

function openEvidencePicker(){
  if(evidenceInput) evidenceInput.click();
}

evidenceInput?.addEventListener('change',()=>setEvidenceFile(evidenceInput.files?.[0]));

// The label already makes the area clickable, but this also makes the whole dropzone reliable.
evidenceDropzone?.addEventListener('click',e=>{
  // The transparent native file input handles clicks itself. Avoid opening
  // the picker twice when the click originated on that input.
  if(e.target===evidenceInput || e.target.closest('#evidenceRemove') || e.target.closest('#evidenceSelected')) return;
  e.preventDefault();
  e.stopPropagation();
  openEvidencePicker();
});

evidenceDropzone?.addEventListener('dragenter',e=>{
  e.preventDefault();
  e.stopPropagation();
  evidenceDropzone.classList.add('dragover');
});
evidenceDropzone?.addEventListener('dragover',e=>{
  e.preventDefault();
  e.stopPropagation();
  if(e.dataTransfer) e.dataTransfer.dropEffect='copy';
  evidenceDropzone.classList.add('dragover');
});
evidenceDropzone?.addEventListener('dragleave',e=>{
  e.preventDefault();
  if(!evidenceDropzone.contains(e.relatedTarget)) evidenceDropzone.classList.remove('dragover');
});
evidenceDropzone?.addEventListener('drop',e=>{
  e.preventDefault();
  e.stopPropagation();
  evidenceDropzone.classList.remove('dragover');
  setEvidenceFile(e.dataTransfer?.files?.[0]);
});

// Capture-level fallback for browsers where the nested <label> intercepts the drop event.
document.addEventListener('dragover',e=>{
  const zone=e.target.closest?.('#evidenceDropzone');
  if(zone){ e.preventDefault(); e.dataTransfer.dropEffect='copy'; }
},{capture:true});
document.addEventListener('drop',e=>{
  const zone=e.target.closest?.('#evidenceDropzone');
  if(!zone) return;
  e.preventDefault();
  e.stopPropagation();
  zone.classList.remove('dragover');
  setEvidenceFile(e.dataTransfer?.files?.[0]);
},{capture:true});

evidenceRemove?.addEventListener('click',e=>{
  e.preventDefault();
  e.stopPropagation();
  if(evidenceInput) evidenceInput.value='';
  if(evidenceSelected) evidenceSelected.hidden=true;
  if(evidencePreview){
    if(evidencePreview.dataset.objectUrl) URL.revokeObjectURL(evidencePreview.dataset.objectUrl);
    evidencePreview.dataset.objectUrl='';
    evidencePreview.removeAttribute('src');
  }
  notify('Evidence photo removed.');
});

document.getElementById('reportForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const submitBtn=e.currentTarget.querySelector('button[type="submit"]');
  if(submitBtn){submitBtn.disabled=true;submitBtn.innerHTML='Analyzing evidence… <span>◌</span>';}
  try{
    const type=document.getElementById('type').value;
    const desc=document.getElementById('description').value.trim();
    const location=document.getElementById('location').value.trim()||'Location pending';
    const care=document.querySelector('.care-chip.selected')?.dataset.care||'standard';
    const base={id:crypto.randomUUID?.()||String(Date.now()),type,description:desc,location,city:currentMapCity,care,coords:liveCoords?{latitude:liveCoords.latitude,longitude:liveCoords.longitude}:null,accuracy:liveCoords?.accuracy||null,timestamp:Date.now(),duplicateOverride:false};
    const analysis=await analyzeIncidentWithGemma({type,description:desc,location,care});
    if(analysis){base.aiAnalysis=analysis;base.aiModel='gemma-4-26b-a4b-it';}
    finalizeReport(base);
  }finally{
    if(submitBtn){submitBtn.disabled=false;submitBtn.innerHTML='Analyze & Save Incident <span>↗</span>';}
  }
});

document.getElementById('duplicateSubmit')?.addEventListener('click',()=>{
  if(!pendingReport) return;
  pendingReport.duplicateOverride=true;
  const report=pendingReport; pendingReport=null; closeModal(duplicateModal); saveReport(report);
});
document.getElementById('duplicateCancel')?.addEventListener('click',()=>{pendingReport=null;closeModal(duplicateModal);notify('Report kept as a draft — nothing was submitted.');});



// Nivara Care — real interactive modes
const careFeatureButtons = [...document.querySelectorAll('.care-feature')];
const carePanel = document.getElementById('careActivePanel');
const careModeTitle = document.getElementById('careModeTitle');
const careModeText = document.getElementById('careModeText');
const careActions = document.getElementById('careActions');
const careDeactivate = document.getElementById('careDeactivate');

const careModes = {
  senior: {
    title: 'Senior Mode',
    text: 'Larger controls, simpler guidance and a quick way to request assistance are now enabled.',
    actions: [
      ['🔊 Read Guidance Aloud','Use your browser voice to read the current safety guidance.','read'],
      ['🆘 Request Help','Open the emergency report flow with Senior selected.','help'],
      ['🗺️ Accessible Route','Open Safe Zones and prioritize accessible shelter guidance.','safezones']
    ]
  },
  child: {
    title: 'Child / Guardian Mode',
    text: 'A simplified help path is enabled. A child can ask for help while a guardian can guide the next step.',
    actions: [
      ['🆘 I Need Help','Open the simplified emergency reporting flow.','help'],
      ['👨‍👩‍👧 Guardian Guidance','Show a short guardian safety message.','guardian'],
      ['🔊 Read Instructions','Read the safety instructions aloud.','read']
    ]
  },
  accessibility: {
    title: 'Accessibility Mode',
    text: 'Higher-contrast controls, stronger focus states and clearer interaction paths are now prioritized.',
    actions: [
      ['🔎 Larger Controls','Increase the interface scale for easier interaction.','large'],
      ['🔊 Read Guidance','Use browser text-to-speech for safety guidance.','read'],
      ['🧭 Clear Navigation','Return to the Command Center with simplified navigation.','home']
    ]
  }
};

function setCareMode(mode, announce=true){
  const data=careModes[mode];
  if(!data) return;
  document.body.classList.remove('care-senior','care-child','care-accessibility');
  document.body.classList.add(`care-${mode}`);
  document.body.dataset.careMode=mode;
  careFeatureButtons.forEach(b=>{
    const active=b.dataset.careFeature===mode;
    b.classList.toggle('active-feature',active);
    b.innerHTML=active ? '✓ Active <span>→</span>' : ({senior:'Activate Senior Mode',child:'Open Child Mode',accessibility:'Set Preferences'}[b.dataset.careFeature]+' <span>→</span>');
  });
  document.querySelectorAll('[data-care-card]').forEach(card=>card.classList.toggle('care-selected',card.dataset.careCard===mode));
  if(carePanel){
    carePanel.hidden=false;
    careModeTitle.textContent=data.title;
    careModeText.textContent=data.text;
    careActions.innerHTML=data.actions.map(([title,desc,action])=>`<button type="button" class="care-action" data-care-action="${action}"><strong>${title}</strong><small>${desc}</small></button>`).join('');
  }
  // Keep the Report Incident care selector synchronized.
  document.querySelectorAll('.care-chip').forEach(chip=>chip.classList.toggle('selected',chip.dataset.care===mode));
  localStorage.setItem('nivara-care-mode',mode);
  if(announce) notify(`${data.title} activated.`);
}

function clearCareMode(announce=true){
  document.body.classList.remove('care-senior','care-child','care-accessibility');
  delete document.body.dataset.careMode;
  careFeatureButtons.forEach(b=>{
    b.classList.remove('active-feature');
    b.innerHTML=({senior:'Activate Senior Mode',child:'Open Child Mode',accessibility:'Set Preferences'}[b.dataset.careFeature]+' <span>→</span>');
  });
  document.querySelectorAll('[data-care-card]').forEach(card=>card.classList.remove('care-selected'));
  if(carePanel) carePanel.hidden=true;
  localStorage.removeItem('nivara-care-mode');
  if(announce) notify('Nivara Care mode deactivated.');
}

careFeatureButtons.forEach(btn=>btn.addEventListener('click',()=>{
  const mode=btn.dataset.careFeature;
  const current=document.body.dataset.careMode;
  if(current===mode) clearCareMode(); else setCareMode(mode);
}));
careDeactivate?.addEventListener('click',()=>clearCareMode());
careActions?.addEventListener('click',e=>{
  const action=e.target.closest('[data-care-action]')?.dataset.careAction;
  if(!action) return;
  if(action==='help'){
    showView('report');
    const mode=document.body.dataset.careMode;
    document.querySelectorAll('.care-chip').forEach(chip=>chip.classList.toggle('selected',chip.dataset.care===mode));
    notify('Emergency report opened with your Care mode selected.');
  } else if(action==='map'){
    showView('safezones');
    notify('Safe Zones opened — review safer locations and shelter capacity.');
  } else if(action==='home'){
    showView('overview');
    notify('Command Center opened.');
  } else if(action==='guardian'){
    const modal=document.getElementById('careGuidanceModal');
    const title=document.getElementById('careGuidanceTitle');
    const body=document.getElementById('careGuidanceBody');
    showGuardianGuidance();
  } else if(action==='read'){
    const text=`${careModeTitle?.textContent||'Nivara Care'} is active. ${careModeText?.textContent||''} Stay together, follow verified safe routes, and follow official emergency instructions.`;
    if('speechSynthesis' in window){ window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text); u.lang='en-IN'; window.speechSynthesis.speak(u); notify('Reading Care instructions aloud.'); }
    else { const modal=document.getElementById('careGuidanceModal'); const title=document.getElementById('careGuidanceTitle'); const body=document.getElementById('careGuidanceBody'); if(title)title.textContent='Safety Instructions'; if(body)body.innerHTML='<p>Stay together, follow verified safe routes, and follow official emergency instructions.</p>'; if(modal)modal.classList.add('open'); }
  } else if(action==='large'){
    document.body.classList.toggle('care-large');
    notify(document.body.classList.contains('care-large')?'Larger controls enabled.':'Larger controls disabled.');
  }
});


// Guardian contact profile: stored locally on the device for offline Care support.
const guardianForm = document.getElementById('guardianForm');
const guardianDetails = document.getElementById('guardianDetails');
const editGuardianBtn = document.getElementById('editGuardianBtn');
const cancelGuardianBtn = document.getElementById('cancelGuardianBtn');
const guardianFields = {
  name: document.getElementById('guardianName'),
  phone: document.getElementById('guardianPhone'),
  relation: document.getElementById('guardianRelation'),
  extra: document.getElementById('guardianExtra')
};

function getGuardianProfile(){
  try { return JSON.parse(localStorage.getItem('nivara-guardian') || 'null'); }
  catch { return null; }
}
function renderGuardianProfile(){
  const g=getGuardianProfile();
  if(!guardianDetails) return;
  if(!g || (!g.name && !g.phone)){
    guardianDetails.innerHTML='<div class="guardian-detail-row"><strong>Status</strong><span>No guardian details saved. Add a trusted contact so Child / Guardian Mode can show who to contact.</span></div>';
    return;
  }
  guardianDetails.innerHTML=`
    <div class="guardian-detail-row"><strong>Name</strong><span>${escapeHtml(g.name || 'Not provided')}</span></div>
    <div class="guardian-detail-row"><strong>Phone</strong><span>${escapeHtml(g.phone || 'Not provided')}</span></div>
    <div class="guardian-detail-row"><strong>Relation</strong><span>${escapeHtml(g.relation || 'Guardian')}</span></div>
    ${g.extra ? `<div class="guardian-detail-row"><strong>Details</strong><span>${escapeHtml(g.extra)}</span></div>` : ''}
    <div class="guardian-detail-row"><strong>Quick action</strong><span><a href="tel:${escapeHtml(g.phone || '')}" class="secondary guardian-call">☎ Call Guardian</a></span></div>`;
}
function openGuardianEditor(){
  const g=getGuardianProfile() || {};
  Object.entries(guardianFields).forEach(([k,el])=>{ if(el) el.value=g[k]||''; });
  if(guardianForm){ guardianForm.hidden=false; setTimeout(()=>guardianForm.querySelector('input')?.focus(),0); }
}
function closeGuardianEditor(){ if(guardianForm) guardianForm.hidden=true; }
editGuardianBtn?.addEventListener('click',openGuardianEditor);
cancelGuardianBtn?.addEventListener('click',closeGuardianEditor);
guardianForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const g={name:guardianFields.name?.value.trim(),phone:guardianFields.phone?.value.trim(),relation:guardianFields.relation?.value.trim(),extra:guardianFields.extra?.value.trim()};
  if(!g.name || !g.phone){ notify('Guardian name and phone number are required.'); return; }
  localStorage.setItem('nivara-guardian',JSON.stringify(g));
  renderGuardianProfile(); closeGuardianEditor(); notify('Guardian details submitted and saved on this device.');
});
renderGuardianProfile();

function showGuardianGuidance(){
  const modal=document.getElementById('careGuidanceModal');
  const title=document.getElementById('careGuidanceTitle');
  const body=document.getElementById('careGuidanceBody');
  const g=getGuardianProfile();
  if(title) title.textContent='Guardian Guidance & Contact';
  if(body) body.innerHTML=`
    <div class="guidance-grid">
      <div class="guidance-card">
        <span class="eyebrow">FOR THE CHILD</span>
        <h4>Stay with a trusted adult</h4>
        <ul>
          <li>Do not leave the group alone.</li>
          <li>Move only toward verified safer areas.</li>
          <li>Keep your phone available and follow official instructions.</li>
          <li>If separated, use <strong>I Need Help</strong> and share your location when safe.</li>
        </ul>
      </div>
      <div class="guidance-card">
        <span class="eyebrow">FOR THE GUARDIAN</span>
        <h4>Keep the child together and visible</h4>
        <ul>
          <li>Stay calm and keep the child close.</li>
          <li>Carry identification, essential medicines and water if available.</li>
          <li>Use verified shelters and routes shown by Nivara.</li>
          <li>Do not rely on an AI assessment as a substitute for official emergency instructions.</li>
        </ul>
      </div>
    </div>
    ${g ? '<p class="notice-success">✓ A trusted guardian contact is saved on this device. Use Edit Details below to update it.</p>' : '<p class="notice-warning">No guardian contact is saved yet. Tap <strong>Edit Details</strong> to add a trusted contact for the Child / Guardian workflow.</p>'}`;
  if(modal) openModal(modal);
  renderGuardianProfile();
  // Keep the submission controls visible inside Guardian Guidance so the user does not have to discover a second step.
  openGuardianEditor();
}

const savedCareMode=localStorage.getItem('nivara-care-mode');
if(savedCareMode && careModes[savedCareMode]) setCareMode(savedCareMode,false);

// Make every data-view action work, including hero and quick-action buttons.
document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// Give the Report Emergency action a clear destination.
const alertButton = document.querySelector('.alert-btn');
if (alertButton) alertButton.addEventListener('click', () => showView('report'));

// Make the cached-map control visibly respond.
document.querySelectorAll('.map-toolbar .secondary').forEach(btn => {
  btn.addEventListener('click', () => notify('Cached situation map loaded — available for offline use.'));
});
document.getElementById('modeBtn').addEventListener('click',()=>{
  const b=document.getElementById('modeBtn');
  b.textContent=b.textContent.includes('Citizen')?'Responder Mode':'Citizen Mode';
  notify(`${b.textContent} activated`);
});

const intensity=document.getElementById('intensity');
const scenarioType=document.getElementById('scenarioType');
const scenarioExposure=document.getElementById('scenarioExposure');
let lastScenarioRun=null;

function updateScenarioPreview(run=false){
  const v=+(intensity?.value||6);
  const exposure=scenarioExposure?.value||'Medium';
  const type=scenarioType?.value||'Flood';
  const exposureBoost=exposure==='High'?10:exposure==='Low'?-7:0;
  const risk=Math.min(99,Math.max(8,38+v*6+exposureBoost));
  const zones=Math.max(1,Math.ceil(v/2)+(exposure==='High'?1:0));
  const priority=risk>=88?'CRITICAL':risk>=68?'HIGH':risk>=45?'MODERATE':'LOW';
  if(document.getElementById('intensityValue')) document.getElementById('intensityValue').textContent=`${v}/10`;
  if(document.getElementById('simRisk')) document.getElementById('simRisk').textContent=risk;
  if(document.getElementById('simZones')) document.getElementById('simZones').textContent=zones;
  if(document.getElementById('simPriority')) document.getElementById('simPriority').textContent=priority;

  if(run){
    const baseline=lastScenarioRun || {risk: Math.min(99,Math.max(8,38+6*6)), zones:3, priority:'HIGH'};
    const riskDelta=risk-baseline.risk;
    const zoneDelta=zones-baseline.zones;
    const headline=document.getElementById('scenarioHeadline');
    const summary=document.getElementById('scenarioSummary');
    const brief=document.getElementById('scenarioBrief');
    const deltaText=riskDelta===0?'same as baseline':`${riskDelta>0?'+':''}${riskDelta} risk points vs baseline`;
    if(headline) headline.textContent=`${type} · ${priority} planning scenario`;
    if(summary) summary.textContent=`Scenario run at ${v}/10 intensity with ${exposure.toLowerCase()} exposure: projected risk ${risk}/100 across approximately ${zones} affected zone${zones===1?'':'s'} (${deltaText}).`;
    if(brief) brief.innerHTML=`<b>Scenario run complete · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</b><span>Risk change: <strong>${riskDelta>0?'+':''}${riskDelta}</strong> points · Zone change: <strong>${zoneDelta>0?'+':''}${zoneDelta}</strong>.</span><span>1. Verify the highest-risk locations first.</span><span>2. Check vulnerable-person and access requests.</span><span>3. Reassess safe-zone and route availability as conditions change.</span>`;
    lastScenarioRun={v:r, exposure, type, risk, zones, priority};
  }
  return {v,exposure,type,risk,zones,priority};
}

intensity?.addEventListener('input',()=>updateScenarioPreview(false));
scenarioType?.addEventListener('change',()=>updateScenarioPreview(false));
scenarioExposure?.addEventListener('change',()=>updateScenarioPreview(false));

function runWhatIfScenario(){
  const result=updateScenarioPreview(true);
  const brief=document.getElementById('scenarioBrief');
  const headline=document.getElementById('scenarioHeadline');
  const summary=document.getElementById('scenarioSummary');
  if(headline) headline.textContent=`${result.type} · ${result.priority} planning scenario`;
  if(summary) summary.textContent=`Simulation complete: ${result.v}/10 hazard intensity with ${result.exposure.toLowerCase()} exposure produces a prototype risk of ${result.risk}/100 across approximately ${result.zones} affected zone${result.zones===1?'':'s'}.`;
  if(brief){
    brief.classList.add('scenario-ran');
    brief.innerHTML=`<b>✓ What-If simulation completed</b><span><strong>${result.priority}</strong> priority · Projected risk <strong>${result.risk}/100</strong> · ${result.zones} affected zone${result.zones===1?'':'s'}</span><span>1. Verify the highest-risk locations first.</span><span>2. Check vulnerable-person and access requests.</span><span>3. Reassess safe-zone and route availability as conditions change.</span>`;
    brief.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  const runBtn=document.getElementById('runScenarioBtn');
  if(runBtn){runBtn.dataset.lastRun=new Date().toISOString(); runBtn.innerHTML='✓ Simulation Complete <span>↻ Run Again</span>';}
  notify(`What-If simulation complete: ${result.priority} risk (${result.risk}/100).`);
  return result;
}
window.runWhatIfScenario=runWhatIfScenario;

// One deterministic handler prevents duplicate/cached UI bindings from causing missed clicks.
document.getElementById('runScenarioBtn')?.addEventListener('click',e=>{
  e.preventDefault(); e.stopPropagation(); runWhatIfScenario();
});

document.getElementById('aiScenarioBtn')?.addEventListener('click',async()=>{
  const sc=updateScenarioPreview(true);
  const btn=document.getElementById('aiScenarioBtn');
  if(btn)btn.disabled=true;
  try{
    const r=await fetch('/api/analyze-scenario',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sc)});
    const data=await r.json();
    if(data.ok&&data.briefing){
      document.getElementById('scenarioBrief').innerHTML=`<b>Gemma 4 planning briefing</b><span>${escapeHtml(data.briefing.summary||'AI briefing generated.')}</span>${(data.briefing.priorities||[]).slice(0,3).map(x=>`<span>• ${escapeHtml(x)}</span>`).join('')}`;
      notify('Gemma 4 scenario briefing generated.');
    } else notify(data.message||'AI briefing unavailable; local simulation remains available.');
  }catch(e){notify('AI briefing unavailable; local simulation remains available.');}
  if(btn)btn.disabled=false;
});
updateScenarioPreview(false);

if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));


// Theme personalization — saved locally so the interface choice survives refresh/offline use.
const themeBtn = document.getElementById('themeBtn');
const themeModal = document.getElementById('themeModal');
const signInBtn = document.getElementById('signInBtn');
const signInModal = document.getElementById('signInModal');
const themeNames = {cyan:'Ocean Cyan',violet:'Electric Violet',blue:'Rescue Blue',green:'Safety Green',amber:'Emergency Amber',rose:'Signal Rose'};

function openModal(el){ if(!el) return; el.classList.add('open'); el.setAttribute('aria-hidden','false'); }
function closeModal(el){ if(!el) return; el.classList.remove('open'); el.setAttribute('aria-hidden','true'); }

themeBtn?.addEventListener('click',()=>openModal(themeModal));
signInBtn?.addEventListener('click',()=>{ if(localStorage.getItem('nivara-user')){ localStorage.removeItem('nivara-user'); sessionStorage.removeItem('nivara-user'); updateSignedInState(); notify('Signed out from this device.'); } else { openModal(signInModal); } });
document.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>closeModal(document.getElementById(btn.dataset.closeModal))));
document.querySelectorAll('.modal-backdrop').forEach(backdrop=>backdrop.addEventListener('click',e=>{if(e.target===backdrop) closeModal(backdrop)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal(themeModal);closeModal(signInModal);closeModal(duplicateModal);}});

function applyTheme(theme, announce=false){
  const allowed=['cyan','violet','blue','green','amber','rose'];
  theme=allowed.includes(theme)?theme:'cyan';
  document.body.classList.remove('theme-custom',...allowed.map(x=>'theme-'+x));
  const presets={cyan:['#51e5d4','#22b9ca'],violet:['#9b8cff','#6e5bff'],blue:['#4aa8ff','#2877ff'],green:['#52e39a','#18b878'],amber:['#ffb45e','#ff7f32'],rose:['#ff6f91','#ff416c']};
  document.documentElement.style.setProperty('--accent',presets[theme][0]);
  document.documentElement.style.setProperty('--accent2',presets[theme][1]);
  document.documentElement.style.setProperty('--theme-tint',`color-mix(in srgb, ${presets[theme][0]} 6%, transparent)`);
  document.body.classList.add('theme-'+theme);
  document.querySelectorAll('.theme-swatch').forEach(x=>x.classList.toggle('selected',x.dataset.theme===theme));
  const picker=document.getElementById('customThemeColor'); if(picker) picker.value=presets[theme][0];
  localStorage.setItem('nivara-theme',theme);
  localStorage.removeItem('nivara-custom-color');
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta){meta.content=presets[theme][0];}
  if(announce) notify(`${themeNames[theme]} theme applied.`);
}

function hexToRgb(hex){const n=parseInt(hex.slice(1),16);return {r:(n>>16)&255,g:(n>>8)&255,b:n&255};}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');}
function companionColor(color){const {r,g,b}=hexToRgb(color);return rgbToHex(r*0.72+18,g*0.72+18,b*0.72+18);}
function applyCustomColor(color, announce=true){
  if(!/^#[0-9a-fA-F]{6}$/.test(color)) return;
  const allowed=['cyan','violet','blue','green','amber','rose'];
  document.body.classList.remove('theme-custom',...allowed.map(x=>'theme-'+x));
  document.body.classList.add('theme-custom');
  document.documentElement.style.setProperty('--accent',color);
  document.documentElement.style.setProperty('--accent2',companionColor(color));
  document.documentElement.style.setProperty('--theme-tint',`color-mix(in srgb, ${color} 6%, transparent)`);
  document.querySelectorAll('.theme-swatch').forEach(x=>x.classList.remove('selected'));
  localStorage.setItem('nivara-custom-color',color);
  localStorage.removeItem('nivara-theme');
  const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.content=color;
  if(announce) notify('Custom color applied to the full Nivara interface.');
}

document.querySelectorAll('.theme-swatch').forEach(btn=>btn.addEventListener('click',()=>applyTheme(btn.dataset.theme,true)));
document.getElementById('customThemeColor')?.addEventListener('input',e=>applyCustomColor(e.target.value));
const savedCustomColor=localStorage.getItem('nivara-custom-color'); if(savedCustomColor) applyCustomColor(savedCustomColor,false); else applyTheme(localStorage.getItem('nivara-theme')||'cyan',false);

// Demo sign-in — intentionally local-only for the prototype. No real authentication is performed.
const storedUser = localStorage.getItem('nivara-user');
function updateSignedInState(){
  const user=localStorage.getItem('nivara-user') || sessionStorage.getItem('nivara-user');
  if(!signInBtn) return;
  if(user){
    const email=user;
    const initials=(email.split('@')[0].replace(/[^a-zA-Z]/g,'').slice(0,2)||'NU').toUpperCase();
    signInBtn.innerHTML=`<span>●</span> ${initials}`;
    signInBtn.title=`Signed in as ${email}. Click to sign out.`;
    signInBtn.classList.add('signed-in');
  } else {
    signInBtn.innerHTML='<span>↪</span> Sign In';
    signInBtn.title='Sign in to Nivara';
    signInBtn.classList.remove('signed-in');
  }
}

// Sign-in methods: email/password, mobile OTP and demo social providers.
let activeAuthMethod='email';
let demoOtp='';
document.querySelectorAll('.auth-tab').forEach(tab=>tab.addEventListener('click',()=>{
  activeAuthMethod=tab.dataset.authTab;
  document.querySelectorAll('.auth-tab').forEach(t=>t.classList.toggle('active',t===tab));
  document.querySelectorAll('.auth-panel').forEach(p=>p.classList.toggle('active',p.id===`${activeAuthMethod}AuthPanel`));
  const btn=document.getElementById('emailSignInBtn');
  if(btn) btn.innerHTML=activeAuthMethod==='phone'?'Verify & Sign In <span>→</span>':'Sign In <span>→</span>';
}));

document.getElementById('sendOtpBtn')?.addEventListener('click',()=>{
  const phone=document.getElementById('signinPhone').value.trim();
  if(!/^[+0-9][0-9 ()-]{7,18}$/.test(phone)){ notify('Enter a valid mobile number first.'); return; }
  demoOtp='123456';
  document.getElementById('otpRow').hidden=false;
  document.getElementById('otpStatus').textContent='Demo OTP: 123456';
  notify('OTP sent. For this prototype, use 123456.');
});

document.getElementById('signInForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const remember=document.getElementById('rememberMe').checked;
  let identity='';
  if(activeAuthMethod==='phone'){
    const phone=document.getElementById('signinPhone').value.trim();
    const otp=document.getElementById('signinOtp').value.trim();
    if(!phone || !demoOtp || otp!==demoOtp){ notify('Enter the mobile number and the demo OTP 123456.'); return; }
    identity=phone;
  } else {
    const email=document.getElementById('signinEmail').value.trim();
    const password=document.getElementById('signinPassword').value;
    if(!email || !password){ notify('Enter your email and password.'); return; }
    identity=email;
  }
  if(remember) localStorage.setItem('nivara-user',identity); else sessionStorage.setItem('nivara-user',identity);
  closeModal(signInModal); updateSignedInState();
  notify(`Welcome to Nivara, ${identity}.`);
  e.target.reset(); document.getElementById('otpRow').hidden=true; demoOtp='';
});

document.querySelectorAll('.social-auth').forEach(btn=>btn.addEventListener('click',()=>{
  const provider=btn.dataset.provider;
  const identity=`${provider.toLowerCase()}@nivara.demo`;
  localStorage.setItem('nivara-user',identity);
  closeModal(signInModal); updateSignedInState();
  notify(`Signed in with ${provider} (demo mode).`);
}));

updateSignedInState();

// ===== Nivara v6: voice reporting =====
const voiceBtn=document.getElementById('voiceReportBtn');
const voiceStatus=document.getElementById('voiceStatus');
const descriptionInput=document.getElementById('description');
let recognition=null;
let listening=false;
if(voiceBtn){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ voiceBtn.disabled=true; voiceBtn.title='Voice reporting is not supported in this browser'; if(voiceStatus) voiceStatus.textContent='Voice reporting is unavailable in this browser.'; }
  else{
    recognition=new SR(); recognition.continuous=true; recognition.interimResults=true; recognition.lang='en-IN';
    let voiceBaseText='';
    recognition.onstart=()=>{listening=true;voiceBaseText=descriptionInput.value.trim();voiceBtn.classList.add('listening');voiceBtn.innerHTML='<span class="voice-icon">⏹</span><span class="voice-label">Stop Listening</span>';voiceStatus.textContent='Listening… speak naturally. Tap again to stop.';notify('Voice reporting started.');};
    recognition.onend=()=>{listening=false;voiceBtn.classList.remove('listening');voiceBtn.innerHTML='<span class="voice-icon">🎙</span><span class="voice-label">Voice Report</span>';if(voiceStatus)voiceStatus.textContent='Voice report ready. You can edit the transcript before submitting.';};
    recognition.onerror=e=>{if(voiceStatus)voiceStatus.textContent=`Voice reporting error: ${e.error}. You can type the report manually.`;notify(`Voice reporting: ${e.error}`);};
    recognition.onresult=e=>{
      let transcript='';
      for(let i=e.resultIndex;i<e.results.length;i++) transcript+=e.results[i][0].transcript;
      transcript=transcript.trim();
      if(transcript) descriptionInput.value=(voiceBaseText?voiceBaseText+' ':'')+transcript;
    };
    voiceBtn.addEventListener('click',()=>{try{if(listening) recognition.stop(); else recognition.start();}catch(err){notify('Voice reporting could not start.');}});
  }
}

// ===== Notifications center + optional browser notifications =====
const notificationBtn=document.getElementById('notificationBtn');
const notificationPanel=document.getElementById('notificationPanel');
const notificationList=document.getElementById('notificationList');
const notificationCount=document.getElementById('notificationCount');
const enableNotificationsBtn=document.getElementById('enableNotificationsBtn');
let notifications=JSON.parse(localStorage.getItem('nivara-notifications')||'[]');
function renderNotifications(){
  if(!notificationList) return;
  if(!notifications.length){notificationList.innerHTML='<div class="notification-item"><b>No new notifications</b><small>Important incident and hotspot updates will appear here.</small></div>';}else notificationList.innerHTML=notifications.slice(0,12).map(n=>`<div class="notification-item"><b>${escapeHtml(n.title)}</b><small>${escapeHtml(n.text)} · ${new Date(n.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>`).join('');
  if(notificationCount){notificationCount.textContent=Math.min(notifications.length,99);notificationCount.style.display=notifications.length?'grid':'none';}
}
function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function addNotification(title,text,system=true){
  notifications.unshift({title,text,time:Date.now()});notifications=notifications.slice(0,30);localStorage.setItem('nivara-notifications',JSON.stringify(notifications));renderNotifications();
  if(system && 'Notification' in window && Notification.permission==='granted') new Notification(`Nivara · ${title}`,{body:text});
}
const originalNotify=notify;
notify=function(msg){originalNotify(msg);if(/incident|hotspot|verification|resolved|report|mode/i.test(msg)) addNotification('Nivara update',msg,true);};
notificationBtn?.addEventListener('click',e=>{e.stopPropagation();notificationPanel?.classList.toggle('open');});
document.addEventListener('click',e=>{if(notificationPanel?.classList.contains('open')&&!notificationPanel.contains(e.target)&&e.target!==notificationBtn)notificationPanel.classList.remove('open');});
enableNotificationsBtn?.addEventListener('click',async()=>{if(!('Notification' in window)){notify('Browser notifications are not supported.');return;}const p=await Notification.requestPermission();notify(p==='granted'?'Browser alerts enabled.':'Browser alerts were not enabled.');});
renderNotifications();

// ===== Before / After verification =====
const beforeInput=document.getElementById('beforeImage');
const afterInput=document.getElementById('afterImage');
const beforePreview=document.getElementById('beforePreview');
const afterPreview=document.getElementById('afterPreview');
const verifyResult=document.getElementById('verificationResult');
function previewFile(input,target){const file=input?.files?.[0];if(!file||!target)return null;const url=URL.createObjectURL(file);target.innerHTML=`<img src="${url}" alt="Evidence preview">`;return file;}
beforeInput?.addEventListener('change',()=>previewFile(beforeInput,beforePreview));
afterInput?.addEventListener('change',()=>previewFile(afterInput,afterPreview));
function loadImage(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=URL.createObjectURL(file);});}
async function compareEvidence(){
  const before=beforeInput?.files?.[0], after=afterInput?.files?.[0];
  if(!before||!after){verifyResult.innerHTML='Verification status: <strong>Please select both before and after images.</strong>';notify('Add both before and after evidence first.');return;}
  verifyResult.innerHTML='Verification status: <strong>Comparing visual evidence…</strong>';
  try{
    const [a,b]=await Promise.all([loadImage(before),loadImage(after)]);
    const size=32,ca=document.createElement('canvas'),cb=document.createElement('canvas');ca.width=cb.width=size;ca.height=cb.height=size;
    const xa=ca.getContext('2d',{willReadFrequently:true}),xb=cb.getContext('2d',{willReadFrequently:true});xa.drawImage(a,0,0,size,size);xb.drawImage(b,0,0,size,size);
    const da=xa.getImageData(0,0,size,size).data,db=xb.getImageData(0,0,size,size).data;let diff=0;
    for(let i=0;i<da.length;i+=4) diff+=(Math.abs(da[i]-db[i])+Math.abs(da[i+1]-db[i+1])+Math.abs(da[i+2]-db[i+2]))/3;
    const score=Math.round((diff/(size*size))/255*100); const label=score>35?'Significant visual change detected — review resolution.':score>15?'Moderate visual change detected — human verification recommended.':'Low visual change detected — incident may still be unresolved.';
    verifyResult.innerHTML=`Verification status: <strong>${label}</strong> <span>(${score}% visual difference)</span>`;
    addNotification('Before/after verification',label,false);notify('Before/after evidence comparison complete.');
  }catch(e){verifyResult.innerHTML='Verification status: <strong>Could not compare images. Please review manually.</strong>';}
}
document.getElementById('verifyBtn')?.addEventListener('click',compareEvidence);

// ===== Hotspot detection =====
const demoHotspots=[{name:'Zone 04',count:17,risk:94,issue:'Flooding'},{name:'Hill Road',count:6,risk:88,issue:'Landslide'}];
function detectHotspots(){
  const reports=getSavedReports();
  const groups={};
  reports.forEach(r=>{const key=(r.location||'Unknown').toLowerCase().trim();if(!key)return;(groups[key]??=[]).push(r);});
  const localHotspots=Object.entries(groups).filter(([,arr])=>arr.length>=3).map(([name,arr])=>({name,count:arr.length,risk:Math.min(98,65+arr.length*6),issue:arr[0].type}));
  const hotspots=[...localHotspots,...demoHotspots].sort((a,b)=>b.risk-a.risk);const top=hotspots[0];
  const title=document.getElementById('hotspotTitle'),text=document.getElementById('hotspotText');
  if(top){title.textContent=`High-risk hotspot detected · ${top.name}`;text.textContent=`${top.count} related ${top.issue.toLowerCase()} reports are clustering here. Estimated prototype risk ${top.risk}/100.`;}
}
detectHotspots();

// ===== Search and filter registry =====
const demoIncidents=[
 {issue:'Potholes',location:'Vijay Nagar Road',severity:'High',status:'Open',reports:12},
 {issue:'Drainage',location:'Main Junction',severity:'Critical',status:'In Progress',reports:11},
 {issue:'Flooding',location:'Zone 04',severity:'Critical',status:'Open',reports:17},
 {issue:'Road Damage',location:'Palasia Link Road',severity:'High',status:'In Progress',reports:8},
 {issue:'Streetlight',location:'Sector B',severity:'Low',status:'Open',reports:4},
 {issue:'Landslide',location:'Hill Road',severity:'High',status:'Open',reports:6},
 {issue:'Fire',location:'Industrial Area',severity:'Critical',status:'Resolved',reports:5},
 {issue:'Earthquake',location:'Central Zone',severity:'High',status:'Resolved',reports:3},
 {issue:'Storm',location:'Ring Road',severity:'Low',status:'In Progress',reports:9}
];
const cityIncidentAreas={
  Pune:['Kothrud','Hadapsar','Baner','Hinjawadi','Viman Nagar'],
  Mumbai:['Andheri','Bandra','Kurla','Dadar','Powai'],
  'New Delhi':['Dwarka','Rohini','Saket','Karol Bagh','Connaught Place'],
  Indore:['Vijay Nagar','Palasia','Bhawarkua','Rau','Scheme No. 54'],
  Bengaluru:['Whitefield','Indiranagar','Koramangala','Electronic City','Hebbal'],
  Hyderabad:['Hitech City','Banjara Hills','Kukatpally','Secunderabad','Gachibowli'],
  Chennai:['Adyar','Velachery','T Nagar','Anna Nagar','OMR'],
  Kolkata:['Salt Lake','New Town','Park Street','Howrah','Dum Dum'],
  Jaipur:['Malviya Nagar','Vaishali Nagar','Mansarovar','C-Scheme','Jagatpura'],
  Ahmedabad:['Navrangpura','Satellite','Maninagar','Bopal','Vastrapur']
};
let currentMapCity='Indore';
function cityFromMapLabel(label=''){
  const first=(String(label).split(',')[0]||'').trim();
  if(!first) return currentMapCity || 'Selected Area';
  const known=Object.keys(cityIncidentAreas).find(c=>first.toLowerCase().includes(c.toLowerCase()));
  return known || first;
}
function registryForCity(city){
  const selected=String(city||'Selected Area').trim() || 'Selected Area';
  const areas=cityIncidentAreas[selected] || [
    'Central District','Main Road','Market Area','Transit Hub','Low-Lying Zone'
  ];
  return demoIncidents.map((x,i)=>({
    ...x,
    location: cityIncidentAreas[selected] ? areas[i%areas.length] : `${areas[i%areas.length]}, ${selected}`,
    sourceLabel: cityIncidentAreas[selected] ? `${selected} demo intelligence` : `Demo intelligence for ${selected}`
  }));
}
const registry=document.getElementById('incidentRegistry');
function reportBelongsToCity(report, city){
  if(!report) return false;
  if(report.city) return report.city === city;
  const location=String(report.location||'').toLowerCase();
  const cityName=String(city||'').toLowerCase();
  return location.includes(cityName);
}
function registryData(){
  const saved=getSavedReports().filter(r=>reportBelongsToCity(r,currentMapCity));
  return [...registryForCity(currentMapCity),...saved.map(r=>({issue:r.type||'Other',location:r.location||'Unknown',severity:r.risk>=90?'Critical':r.risk>=75?'High':'Low',status:r.duplicateOverride?'Open':'In Progress',reports:1}))];
}
function renderRegistry(){
  if(!registry)return;
  const cityLabel=document.getElementById('mapPlaceLabel');
  const selectedCity=currentMapCity||'Selected Area';
const q=(document.getElementById('incidentSearch')?.value||'').toLowerCase().trim(),issue=document.getElementById('issueFilter')?.value||'all',sev=document.getElementById('severityFilter')?.value||'all',status=document.getElementById('statusFilter')?.value||'all';
  const data=registryData().filter(x=>(!q||`${x.issue} ${x.location} ${x.status}`.toLowerCase().includes(q))&&(issue==='all'||x.issue===issue)&&(sev==='all'||x.severity===sev)&&(status==='all'||x.status===status));
  registry.innerHTML=data.length?data.map(x=>`<div class="registry-item"><span class="registry-sev ${x.severity.toLowerCase()}"></span><div><b>${escapeHtml(x.issue)} · ${escapeHtml(x.location)}</b><small>${x.reports} report${x.reports===1?'':'s'} · ${escapeHtml(x.sourceLabel||'incident intelligence')}</small></div><span class="severity-chip">${x.severity}</span><span class="status-chip">${escapeHtml(x.status)}</span></div>`).join(''):'<div class="panel glass" style="padding:18px;color:#71879b;font-size:9px">No incidents match these filters.</div>';
  const count=document.getElementById('filterCount');if(count)count.textContent=`${data.length} incident${data.length===1?'':'s'}`;
}
['incidentSearch','issueFilter','severityFilter','statusFilter'].forEach(id=>document.getElementById(id)?.addEventListener('input',renderRegistry));
['issueFilter','severityFilter','statusFilter'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderRegistry));
renderRegistry();
document.getElementById('cachedMapBtn')?.addEventListener('click',()=>notify('Cached situation map loaded — available offline.'));




// Safe-zone actions: show dedicated safe-zone view instead of redirecting to the Risk Map.
document.querySelectorAll('[data-view="safezones"]').forEach(btn=>btn.addEventListener('click',()=>showView('safezones')));
document.querySelectorAll('.safezone-route').forEach(btn=>btn.addEventListener('click',()=>{
  const zone=btn.dataset.zone||'selected safe zone';
  const originText=(mapPlaceLabel?.textContent && !/Demo Operations View|Indore, Madhya Pradesh, India/i.test(mapPlaceLabel.textContent))
    ? mapPlaceLabel.textContent : '';
  const destination=encodeURIComponent(zone + (originText ? ', ' + originText : ''));
  const routeUrl=`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  // Use a normal navigation fallback rather than relying only on popup windows.
  const routeWindow=window.open(routeUrl,'_blank');
  if(!routeWindow){
    const routeModal=document.getElementById('routeModal');
    const routeLink=document.getElementById('routeLink');
    if(routeLink) routeLink.href=routeUrl;
    if(routeModal) routeModal.classList.add('open');
    else window.location.href=routeUrl;
  }
  notify(`Opening route to ${zone}.`);
}));
document.getElementById('routeModalClose')?.addEventListener('click',()=>document.getElementById('routeModal')?.classList.remove('open'));

// ===== Interactive Disaster Operation Map + Location Search =====
const mapSearchInput=document.getElementById('mapLocationSearch');
const mapSearchBtn=document.getElementById('mapLocationSearchBtn');
const mapLocateBtn=document.getElementById('mapLocateBtn');
const mapSearchStatus=document.getElementById('mapSearchStatus');
const mapPlaceLabel=document.getElementById('mapPlaceLabel');
let operationMap=null;
let searchedLocationMarker=null;
let userLocationMarker=null;
let operationIncidentLayer=null;

const locationFallbacks={
  'mumbai':[19.0760,72.8777,'Mumbai, Maharashtra, India'],
  'delhi':[28.6139,77.2090,'New Delhi, India'],
  'new delhi':[28.6139,77.2090,'New Delhi, India'],
  'indore':[22.7196,75.8577,'Indore, Madhya Pradesh, India'],
  'bengaluru':[12.9716,77.5946,'Bengaluru, Karnataka, India'],
  'bangalore':[12.9716,77.5946,'Bengaluru, Karnataka, India'],
  'pune':[18.5204,73.8567,'Pune, Maharashtra, India'],
  'hyderabad':[17.3850,78.4867,'Hyderabad, Telangana, India'],
  'kolkata':[22.5726,88.3639,'Kolkata, West Bengal, India'],
  'chennai':[13.0827,80.2707,'Chennai, Tamil Nadu, India'],
  'jaipur':[26.9124,75.7873,'Jaipur, Rajasthan, India'],
  'ahmedabad':[23.0225,72.5714,'Ahmedabad, Gujarat, India']
};

function setMapStatus(message,type=''){
  if(!mapSearchStatus)return;
  mapSearchStatus.className='map-search-status'+(type?' '+type:'');
  mapSearchStatus.innerHTML=`<span class="mini-dot"></span><span>${escapeHtml(message)}</span>`;
}
function makeMarkerIcon(type='incident'){
  if(!window.L)return null;
  const cls=type==='hotspot'?'nivara-map-marker nivara-hotspot-marker':'nivara-map-marker';
  return L.divIcon({className:'',html:`<div class="${cls}">${type==='hotspot'?'!':'!'}</div>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-15]});
}
function makeUserIcon(){return L.divIcon({className:'',html:'<div class="nivara-user-marker"></div>',iconSize:[18,18],iconAnchor:[9,9]});}
function renderDemoMapIncidents(lat,lng,label){
  if(!operationMap||!window.L)return;
  lastMapCenter=[lat,lng];
  if(operationIncidentLayer)operationIncidentLayer.clearLayers();
  if(demoEventsToggle && !demoEventsToggle.checked){ if(liveEventsToggle?.checked)loadLivePublicEvents(lat,lng); return; }
  operationIncidentLayer=L.layerGroup().addTo(operationMap);
  const demo=[
    [-0.018,0.012,'Flooding','Critical','Open'],
    [0.011,-0.016,'Drainage','High','In Progress'],
    [0.024,0.022,'Road Damage','High','Open'],
    [-0.009,-0.028,'Potholes','Low','Open'],
    [0.032,-0.004,'Storm','Critical','In Progress']
  ];
  demo.forEach(([dlat,dlng,issue,severity,status],i)=>{
    const marker=L.marker([lat+dlat,lng+dlng],{icon:makeMarkerIcon(i===0?'hotspot':'incident')}).addTo(operationIncidentLayer);
    marker.bindPopup(`<b>${escapeHtml(issue)} · ${escapeHtml(label)}</b><br><span>${escapeHtml(severity)} severity · ${escapeHtml(status)}</span><br><small>Demo intelligence — verify before response.</small>`);
  });
  L.circle([lat+dLat(0.018),lng+dLng(0.012)],{radius:1800,color:'#ff5872',fillColor:'#ff5872',fillOpacity:.09,weight:2}).addTo(operationIncidentLayer);
  if(liveEventsToggle?.checked)loadLivePublicEvents(lat,lng);
}
function dLat(km){return km/111;} function dLng(km,lat=20){return km/(111*Math.cos(lat*Math.PI/180));}
let liveEventLayer=null;
const liveEventsToggle=document.getElementById('liveEventsToggle');
const demoEventsToggle=document.getElementById('demoEventsToggle');
const liveEventsStatus=document.getElementById('liveEventsStatus');
function liveIcon(){return L.divIcon({className:'',html:'<div class=\"live-event-marker\">E</div>',iconSize:[30,30],iconAnchor:[15,15]});}
function haversineKm(a,b,c,d){const R=6371,toR=x=>x*Math.PI/180;const p1=toR(a),p2=toR(c),dp=toR(c-a),dl=toR(d-b);const q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
async function loadLivePublicEvents(lat,lng){
  if(!operationMap||!window.L||!liveEventsToggle?.checked)return;
  if(liveEventLayer)liveEventLayer.clearLayers(); else liveEventLayer=L.layerGroup().addTo(operationMap);
  if(liveEventsStatus)liveEventsStatus.textContent='Loading live public events…';
  let count=0;
  try{
    const url='https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
    const r=await fetch(url); if(!r.ok)throw new Error('USGS unavailable'); const data=await r.json();
    (data.features||[]).forEach(f=>{const [elng,elat,depth]=f.geometry.coordinates; const km=haversineKm(lat,lng,elat,elng); if(km>300)return; const mag=Number(f.properties.mag||0); const marker=L.marker([elat,elng],{icon:liveIcon()}).addTo(liveEventLayer); marker.bindPopup(`<b>Verified public event · Earthquake</b><br>Magnitude ${mag.toFixed(1)} · ${Math.round(km)} km from searched area<br><small>Source: USGS · ${new Date(f.properties.time).toLocaleString()}</small>`); count++;});
    if(liveEventsStatus)liveEventsStatus.textContent=count?`Showing ${count} USGS earthquake event${count===1?'':'s'} within 300 km. Blue E markers are live public data.`:'No USGS earthquake events found within 300 km today.';
  }catch(e){if(liveEventsStatus)liveEventsStatus.textContent='Live public feed unavailable. Demo intelligence remains available.';}
}
liveEventsToggle?.addEventListener('change',()=>{if(liveEventsToggle.checked)loadLivePublicEvents(lastMapCenter?.[0],lastMapCenter?.[1]); else if(liveEventLayer)liveEventLayer.clearLayers();});
demoEventsToggle?.addEventListener('change',()=>{if(lastMapCenter)renderDemoMapIncidents(lastMapCenter[0],lastMapCenter[1],mapPlaceLabel?.textContent||'selected area');});
let lastMapCenter=null;
function setMapPlace(lat,lng,label,source='location search'){
  if(!operationMap||!window.L)return;
  operationMap.setView([lat,lng],12,{animate:true});
  if(userLocationMarker){operationMap.removeLayer(userLocationMarker);userLocationMarker=null;}
  if(searchedLocationMarker)operationMap.removeLayer(searchedLocationMarker);
  searchedLocationMarker=L.marker([lat,lng]).addTo(operationMap).bindPopup(`<b>${escapeHtml(label)}</b><br><small>Map centered by ${escapeHtml(source)}.</small>`).openPopup();
  mapPlaceLabel.textContent=label;
  currentMapCity=cityFromMapLabel(label);
  renderDemoMapIncidents(lat,lng,label);
  renderRegistry();
}
async function searchMapLocation(query){
  const q=query.trim();
  if(!q){setMapStatus('Enter a city or place, for example “Mumbai”.','error');return;}
  setMapStatus(`Searching for ${q}…`,'loading');
  const key=q.toLowerCase().replace(/\s+/g,' ').trim();
  const normalizedKey=key.replace(/,.*$/,'').trim();
  const fallback=locationFallbacks[key] || locationFallbacks[normalizedKey];
  if(fallback){
    const [lat,lng,label]=fallback;
    setMapPlace(lat,lng,label,'location search');
    setTimeout(()=>operationMap?.invalidateSize(),100);
    setMapStatus(`${label} found. Showing the operation map for this area.`);
    notify(`Map centered on ${label}.`);
    return;
  }
  try{
    const geocodeQuery=/\b(india|india)$/i.test(q)?q:`${q}, India`;
    const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(geocodeQuery)}`;
    const response=await fetch(url,{headers:{'Accept':'application/json'}});
    if(!response.ok)throw new Error('Geocoding request failed');
    const results=await response.json();
    if(!results.length)throw new Error('Location not found');
    const r=results[0];
    const lat=Number(r.lat),lng=Number(r.lon),label=r.display_name||q;
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) throw new Error('Invalid coordinates');
    setMapPlace(lat,lng,label,'location search');
    setMapStatus(`${label} found. Showing the operation map for this area.`);
    notify(`Map centered on ${label}.`);
  }catch(err){
    setMapStatus('Location could not be found. Try a city name such as Mumbai, Delhi or Indore.','error');
    notify('Map location search failed — check your connection or try a simpler place name.');
  }
}
function initOperationMap(){
  if(!window.L||!document.getElementById('operationMap'))return;
  operationMap=L.map('operationMap',{zoomControl:true,scrollWheelZoom:true}).setView([22.7196,75.8577],12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(operationMap);
  setMapPlace(22.7196,75.8577,'Indore, Madhya Pradesh, India','default demo view');
  setTimeout(()=>operationMap.invalidateSize(),250);
  window.addEventListener('resize',()=>operationMap?.invalidateSize());
}
mapSearchBtn?.addEventListener('click',()=>searchMapLocation(mapSearchInput?.value||''));
mapSearchInput?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchMapLocation(mapSearchInput.value);}});
mapLocateBtn?.addEventListener('click',()=>{
  if(!navigator.geolocation){setMapStatus('Live location is not supported by this browser.','error');return;}
  setMapStatus('Requesting your live location…','loading');
  navigator.geolocation.getCurrentPosition(pos=>{
    const {latitude,longitude,accuracy}=pos.coords;
    if(operationMap){operationMap.setView([latitude,longitude],15,{animate:true});if(userLocationMarker)operationMap.removeLayer(userLocationMarker);userLocationMarker=L.marker([latitude,longitude],{icon:makeUserIcon()}).addTo(operationMap).bindPopup('<b>Your live location</b><br><small>Used only to center the map.</small>').openPopup();mapPlaceLabel.textContent='Your live location';renderDemoMapIncidents(latitude,longitude,'Your area');}
    setMapStatus(`Live location found. Accuracy ±${Math.round(accuracy)} m.`);
  },()=>setMapStatus('Location permission was denied or unavailable.','error'),{enableHighAccuracy:true,timeout:10000,maximumAge:10000});
});
initOperationMap();

// ===== Dark / light mode =====
const themeModeBtn=document.getElementById('themeModeBtn');
function applyDisplayMode(mode,announce=false){
  document.body.classList.toggle('light-mode',mode==='light');
  if(themeModeBtn){themeModeBtn.innerHTML=mode==='light'?'<span>☾</span> Dark':'<span>☼</span> Light';themeModeBtn.title=mode==='light'?'Switch to dark mode':'Switch to light mode';}
  localStorage.setItem('nivara-display-mode',mode);
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=mode==='light'?'#f3f7fb':getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#07111f';
  if(announce)notify(`${mode==='light'?'Light':'Dark'} mode enabled.`);
}
themeModeBtn?.addEventListener('click',()=>applyDisplayMode(document.body.classList.contains('light-mode')?'dark':'light',true));
applyDisplayMode(localStorage.getItem('nivara-display-mode')||'dark',false);
