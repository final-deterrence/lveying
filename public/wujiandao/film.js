// Both the director and the projector render an already-authorized stage snapshot.
// This frame has no draw API, credentials, keyboard handlers or independent lottery state.
import dialogueLines from './dialogue.js';
const screen = document.querySelector('main');
const canvas = screen.querySelector('canvas');
const ctx = canvas.getContext('2d');
const live = screen.querySelector('[role=status]');
const board = screen.querySelector('ol');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = { counts: {third:30, second:10, first:3, grand:1}, draws: {} };
const ticket = number => number == null ? '·······' : String(number).padStart(7, '0');
let current = null, art = 'radio', stamp = performance.now(), previousFrame = null;
let departedAge = 0, animateReveal = false, visible = true, frame = 0, timer = 0, lastPaint = -Infinity;
let deck = [], deckSignature = '', cueStartedAt = 0;
const wrapIndex = (n,length) => ((n % length) + length) % length;
const laneBeat = (feed,lane) => Math.floor(feed.beats + lane * .37);
const typewriter = '"Consolas","Cascadia Mono",monospace';

function passingDeck(view) {
  const min = view.minNumber, max = view.maxNumber;
  const excluded = Array.from(new Set(view.excluded.filter(n => n >= min && n <= max))).sort((a,b) => a-b);
  const signature = [min,max,...excluded].join(',');
  if (signature === deckSignature) return;
  deckSignature = signature;
  const total = max - min + 1 - excluded.length;
  const random = seeded(7879 + excluded.length + min + max);
  // Sample ranks without replacement, even for a seven-digit pool. Materialize only the scrolling strip.
  const chosen = new Set();
  for (let j = Math.max(0,total-2048); j < total; j++) {
    const rank = Math.floor(random()*(j+1)); chosen.add(chosen.has(rank) ? j : rank);
  }
  const ranks = Array.from(chosen).sort((a,b) => a-b);
  let skipped = 0;
  deck = ranks.map(rank => {
    while (skipped < excluded.length && excluded[skipped] <= min + rank + skipped) skipped++;
    return ticket(min + rank + skipped);
  });
  for (let i=deck.length-1; i>0; i--) {
    const j=Math.floor(random()*(i+1)); [deck[i],deck[j]]=[deck[j],deck[i]];
  }
}
function candidateStream(key,seconds) {
  const beat = key==='third' ? cipherBeatSeconds : awardTiming[key].beat;
  return { deck, travel: reduced.matches ? 0 : seconds, beats: seconds / (reduced.matches ? 1 : beat) };
}
function runningTicket(feed,lane,lanes,position) {
  const count = Math.ceil(((feed?.deck?.length ?? 0)-lane)/lanes);
  if (count <= 0) return '';
  return feed.deck[lane + lanes*wrapIndex(position+7*laneBeat(feed,lane),count)];
}

function exitPicture() {
  const image = bitmap(canvas.width,canvas.height);
  image.getContext('2d').drawImage(canvas,0,0);
  if (screen.dataset.shot==='cipher-brief') image.readerEntry=lastReaderFrame || {time:0,framing:null};
  if (screen.dataset.shot==='call') image.pickup=livePickup;
  if (screen.dataset.shot==='rail') image.roofAge=liveRoofAge;
  if (screen.dataset.shot==='splice'||screen.dataset.shot==='archive') image.printPose=livePrintPose;
  return image;
}
function present(view) {
  if (!view?.film) return;
  const key = view.award;
  const hero = view.film === 'done-0';
  const numbers = hero ? view.heroNumbers : view.slots;
  const isDraw = view.film.startsWith('roll-');
  const result = hero ? numbers.length > 0 : isDraw && numbers.some(n => n !== null);
  const phase = result ? 'result' : isDraw ? 'roll' : 'scene';
  const id = result ? 'done-'+key : hero ? 'roof' : view.film;
  const now = performance.now();
  const changed = current?.id !== id || cueStartedAt !== view.cueStartedAt;
  if (changed) {
    const liveStop = current?.view === 'roll' && current.prize === key && result && Date.now()-view.cueStartedAt < 3000;
    if (liveStop) { if (key==='third') captureCipherCue(); else recordAwardCue(); }
    animateReveal = liveStop && !reduced.matches;
    departedAge = (now-stamp)/1000;
    previousFrame = current && !result && !reduced.matches ? exitPicture() : null;
    cueStartedAt = view.cueStartedAt;
    stamp = now - (cueStartedAt ? Math.max(0, Date.now()-cueStartedAt) : 0);
    if (phase === 'roll') {
      liveCipherFeed=null; liveCipherCue=null; lastAwardFeed=null; awardCue=null;
      if (key==='grand') roofRollOrigin=previousFrame?.roofAge>=roofPushFrom ? previousFrame.roofAge : roofRollAt;
    }
    current = {id, prize:key, view: phase==='scene' ? undefined : phase};
  }
  state.counts = view.counts;
  if (result) state.draws[key] = numbers;
  passingDeck(view);
  art = {third:'radio',second:'archive',first:'phone',grand:'roof'}[key];
  screen.dataset.scene = view.film; screen.dataset.view = phase;
  canvas.setAttribute('aria-label',view.title || ({third:'截获密电',second:'机密档案',first:'秘密接头',grand:'天台对峙'}[key]));
  const labels = result ? numbers.filter(n=>n!==null).map(ticket) : [];
  if (board.dataset.values !== labels.join(',')) {
    board.dataset.values=labels.join(',');
    board.replaceChildren(...labels.map(n=>{ const cell=document.createElement('li'); cell.textContent=n; return cell; }));
  }
  if (changed) live.textContent = result ? (view.title || '特等奖')+'已揭晓' : '';
  startPaint();
}
function resultDuration() {
  const key=current.prize;
  return key==='third' ? (liveCipherCue?.delay??0)+(state.counts.third>1?cipherLastStop:0)
    : awardTiming[key].hold+(animateReveal&&awardCue?.key===key?awardCue.lead:0);
}
function paint(now) {
  if (!current || !ctx) return;
  ctx.setTransform(canvas.width/WIDTH,0,0,canvas.height/HEIGHT,0,0);
  ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  const age=Math.max(0,(now-stamp)/1000), still=reduced.matches, key=current.prize;
  const shot=liveShot(current.id);
  if(current.view==='roll') {
    const feed=candidateStream(key,age);
    if(key==='grand')feed.travel=still?roofRollAt:roofRollOrigin+age;
    if(key==='third')liveCipherFeed=feed;else lastAwardFeed=feed;
    rollingFrame(ctx,key,still?2:age,state.counts[key],feed,still?null:previousFrame);
  } else if(current.view==='result') {
    const duration=resultDuration();
    drawOutcome(ctx,key,state.draws[key],animateReveal?Math.min(age,duration):duration,departedAge);
  } else {
    const local=still?(shot==='rail'?roofPushTo:8):age;
    const angle=current.id==='ring'?86:mix(86,129,smooth(local/1.02));
    showShot(ctx,shot,local,still?2.2:age,angle,previousFrame,departedAge,age,false);
    if(shot!=='rail')finishFilm(ctx,age,still);
  }
  screen.dataset.shot=shot; soundCue(shot,age,current.view||'scene');
  if(previousFrame&&age>(current.id==='interval'?2.8:1.7))previousFrame=null;
}
function tick(now) {
  frame=0;
  if(!current || !visible || document.hidden)return;
  const age=(now-stamp)/1000;
  const hold=current.view==='result'&&(!animateReveal||age>=resultDuration())
    || current.id==='interval'&&age>=2.8 || current.id==='end'&&age>=4.5;
  if(hold || now-lastPaint>=1000/30-1){paint(now); lastPaint=now;}
  if(!hold && !reduced.matches)frame=requestAnimationFrame(tick);
  else if(reduced.matches && current.view==='roll')timer=setTimeout(startPaint,1000);
}
function startPaint(){
  clearTimeout(timer);
  if(frame)cancelAnimationFrame(frame);
  lastPaint=-Infinity;
  frame=requestAnimationFrame(tick);
}
function resize(){
  const dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.max(1,Math.round(screen.clientWidth*dpr)); canvas.height=Math.max(1,Math.round(screen.clientHeight*dpr));
  startPaint();
}

// Camera and props
  // Vector outlines sampled from the event's original ticket, in local print coordinates.
  const shoulderProfile=new Path2D("M180,0L217,3L250,10L291,26L321,43L350,73L370,102L371,104L369,105L372,106L379,123L383,146L385,165L385,192L377,229L377,249L384,281L392,302L399,314L399,320L392,330L373,343L370,353L364,363L366,373L352,390L350,402L351,406L347,415L313,444L308,462L307,481L313,513L324,548L345,594L380,641L389,660L388,663L390,668L390,676L383,687L372,692L359,694L314,695L271,705L258,706C192,710 112,714 58,692C41,684 52,666 72,643C109,596 124,537 104,485C92,455 70,432 49,401C15,350 0,284 0,226C-1,155 17,101 52,65C84,31 135,3 180,0Z");
  const WIDTH=1000, HEIGHT=562.5, TAU=Math.PI*2;
  const clamp=n=>Math.max(0,Math.min(1,n));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=n=>{const k=clamp(n);return k*k*(3-2*k);};
  function poly(g,points,fill,stroke,width=1) {
    g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();
    if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=width;g.stroke();}
  }
  function stroke(g,points,color,width=1) {
    g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=color;g.lineWidth=width;g.stroke();
  }
  function seeded(seed) {return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function bitmap(w,h) {const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function voice(u,t) {
    const envelope=.06+.60*Math.exp(-Math.pow((u-.32)/.08,2))+.86*Math.exp(-Math.pow((u-.66)/.12,2));
    return envelope*(.70*Math.sin(63*u-t*7)+.33*Math.sin(138*u+t*4));
  }
  function bevel(x,y,w,h,r) {
    return [[x+r,y],[x+w-r,y],[x+w,y+r],[x+w,y+h-r],[x+w-r,y+h],[x+r,y+h],[x,y+h-r],[x,y+r]];
  }
  const segmentEnds=[
    [[0,0],[4,0]],[[4,0],[4,4]],[[4,4],[4,8]],[[0,8],[4,8]],[[0,4],[0,8]],[[0,0],[0,4]],[[0,4],[4,4]]
  ];
  const digitMaps=[63,6,91,79,102,109,125,7,127,111];
  function tint(hex,delta){
    const color=Number.parseInt(hex.slice(1),16);
    return 'rgb('+[16,8,0].map(shift=>Math.max(0,Math.min(255,((color>>shift)&255)+delta))).join(',')+')';
  }
  function foldingPhone(g,t,angle,ringing,age,identify) {
    const phase=t%2.85;
    const pulse=ringing?(Math.exp(-Math.pow((phase-.33)/.16,2))+.72*Math.exp(-Math.pow((phase-.7)/.15,2))):0;
    const yaw=.55+.045*Math.sin(t*.38),pitch=.52+.02*Math.cos(t*.34);
    const co=Math.cos(yaw),si=Math.sin(yaw),up=Math.sin(pitch),across=Math.cos(pitch);
    const theta=angle*Math.PI/180, cs=Math.cos(theta),sn=Math.sin(theta);
    function project(x,y,z) {
      x*=.88;
      const sx=x*co-z*si,depth=x*si+z*co;
      const k=1.35*820/(820-y*up-depth*across);
      return [766+sx*k+Math.sin(t*59)*pulse*2.4,314+(-y*across+depth*up)*k,y*up+depth*across];
    }
    const deck=(x,z,h=0)=>project(x,h,z);
    const lid=(x,z,h=0)=>project(x,11+z*sn-h*cs,z*cs+h*sn);
    function face(map,points,height,fill,edge,width=1) {poly(g,points.map(([x,z])=>map(x,z,height)),fill,edge,width);}
    function wire(map,points,height,color,width=1) {stroke(g,points.map(([x,z])=>map(x,z,height)),color,width);}
    function prism(map,points,h,depth,top,light,dark){
      const upper=points.map(([x,z])=>map(x,z,h)),lower=points.map(([x,z])=>map(x,z,h-depth));
      const sides=upper.map((p,i)=>{const j=(i+1)%upper.length;return {z:(p[2]+upper[j][2])/2,points:[lower[i],lower[j],upper[j],p],tone:i<3?light:dark};});
      sides.sort((a,b)=>a.z-b.z);
      for(const side of sides)poly(g,side.points,side.tone,'#253a34',.65);
      const far=upper[Math.floor(upper.length/2)],near=upper[0];
      const finish=g.createLinearGradient(near[0],near[1],far[0],far[1]);
      finish.addColorStop(0,tint(top,21));finish.addColorStop(.32,top);finish.addColorStop(.55,tint(top,10));finish.addColorStop(1,tint(top,-23));
      poly(g,upper,finish,'#9eb5a2',1.1);
    }
    prism(deck,bevel(-76,-8,152,186,13),0,13,'#8faaa0','#667f74','#263e37');
    face(deck,bevel(-68,3,136,164,10),.8,'#49625a','#bed0b4',.85);
    for(let i=0;i<7;i++)wire(deck,[[60,67+i*5.5],[65,65+i*5.5]],1.2,'#98aa994f',.85);
    face(deck,bevel(-59,12,118,43,6),1.3,'#273f39','#829a88',.7);
    prism(deck,bevel(-18,18,36,27,6),4.1,2.8,'#c2cdb0','#6d8273','#42544d');
    wire(deck,[[-7,30],[0,25],[7,30]],4.9,'#596e60',1.4);
    for(const x of [-53,29])prism(deck,bevel(x,26,24,11,3),3,1.6,x<0?'#abc394':'#d07966','#7a8d78','#3d544b');
    const keys=[1,2,3,4,5,6,7,8,9,-1,0,-2];
    for(let i=0;i<12;i++){
      const x=-58+(i%3)*40,z=62+Math.floor(i/3)*23;
      prism(deck,bevel(x,z,33,16,3),3.8,2.9,'#304a42','#768b78','#273b33');
      const n=keys[i],kx=x+14,kz=z+4;
      if(n>=0){
        segmentEnds.forEach((s,j)=>{if(digitMaps[n] & (1<<j))wire(deck,s.map(([a,b])=>[kx+a,kz+b]),4.1,'#d3dabe',1);});
      }else if(n===-1){
        wire(deck,[[kx+2,kz],[kx+2,kz+8]],4.1,'#d3dabe',1);
        wire(deck,[[kx-1,kz+2],[kx+5,kz+6]],4.1,'#d3dabe',1);
        wire(deck,[[kx-1,kz+6],[kx+5,kz+2]],4.1,'#d3dabe',1);
      }else{
        for(const offset of [0,3.5]){
          wire(deck,[[kx+offset+1,kz],[kx+offset-1,kz+8]],4.1,'#d3dabe',.85);
          wire(deck,[[kx-2,kz+2+offset],[kx+6,kz+2+offset]],4.1,'#d3dabe',.85);
        }
      }
    }
    for(const x of [-64,24]){
      prism(deck,bevel(x,-4,39,10,2),7.8,5.1,'#a8b4a2','#7a897d','#42534d');
      for(let i=0;i<7;i++)wire(deck,[[x+3+i*5,-2],[x+3+i*5,4]],8,'#53665b',.9);
    }
    for(const x of [-64,62]){face(deck,bevel(x,153,3,3,.8),1.5,'#3a4f47');}
    // The second rigid body rotates around the actual hinge. The LCD is drawn on that same plane.
    const a=lid(-50,30),b=lid(50,30),c=lid(-50,118);
    if((b[0]-a[0])*(c[1]-a[1])>(b[1]-a[1])*(c[0]-a[0])){
      prism(lid,bevel(-76,0,152,166,13),-8,-8,'#626d6b','#929b88','#23363a');
      face(lid,bevel(-68,9,136,149,11),-8.5,'#364749','#87978a',1.1);
      face(lid,bevel(-62,13,124,137,9),-8.7,'#526260','#2f4345',.8);
      for(let j=0;j<25;j++)wire(lid,[[-55,18+j*5],[54,17+j*5]],-8.9,j%4?'#d1d1b517':'#1e323340',.75);
      face(lid,bevel(-29,67,58,13,4),-9.3,'#1a2c31','#aeb6a1',1.2);
      face(lid,bevel(-24,70,48,7,2),-9.5,'#b64437','#de8161',.7);
      wire(lid,[[-22,72],[22,72]],-9.7,'#ffd09a',1.25);
      const transform=g.getTransform();
      coverLampAxis=[lid(-24,73,-10),lid(24,73,-10)].map(([x,y])=>transform.transformPoint({x,y}));
      return;
    }
    prism(lid,bevel(-76,0,152,166,13),0,9,'#afc0ac','#819385','#30453e');
    face(lid,bevel(-68,8,136,145,8),.7,'#3b5148','#50675c',1);
    face(lid,bevel(-57,28,114,99,5),1.2,'#192e27','#c1c9a4',1.2);
    face(lid,bevel(-52,32,104,90,2.3),1.8,'#b1c28b');
    face(lid,[[-51,111],[-51,87],[35,33],[49,33],[51,45]],1.93,'#eef2bd36');
    face(lid,[[-36,121],[-50,121],[51,53],[51,66]],1.93,'#edf1ba1e');
    for(let j=0;j<6;j++)wire(lid,[[-49,38+j*14],[49,38+j*14]],2,'#6e8c6a55',.65);
    for(let j=0;j<4;j++)face(lid,bevel(-44+j*3.9,109,2.8,2.8+j*1.4,.4),2.1,'#4b684d');
    displayLcd(g,lid,t,ringing,age,identify);
    for(let i=0;i<11;i++)face(lid,bevel(-20+i*4,137,2.2,3.5,.5),1.6,'#1a2b24');
  }


// Photography and sound
  // All drawing coordinates are in a 1000 × 562.5 camera gate.
  // Static sets and emulsion are rasterized once. The actors, props, lighting and camera move independently.
  const sets = new Map(), paths = new Map();
  function shape(g, d, fill, edge, width=1) {
    if(!paths.has(d)) paths.set(d,new Path2D(d));
    const p=paths.get(d);
    if(fill){g.fillStyle=fill;g.fill(p);}
    if(edge){g.strokeStyle=edge;g.lineWidth=width;g.stroke(p);}
  }
  function rect(g,x,y,w,h,color){ g.fillStyle=color;g.fillRect(x,y,w,h); }
  function oval(g,x,y,rx,ry,color,angle=0,edge=null,width=1){
    g.beginPath();g.ellipse(x,y,rx,ry,angle,0,TAU);
    if(color){g.fillStyle=color;g.fill();}
    if(edge){g.strokeStyle=edge;g.lineWidth=width;g.stroke();}
  }
  function shades(gradient,colors){for(const [at,ink] of colors) gradient.addColorStop(at,ink);return gradient;}
  function ramp(g,x0,y0,x1,y1,...colors){return shades(g.createLinearGradient(x0,y0,x1,y1),colors);}
  function flare(g,x,y,r,...colors){return shades(g.createRadialGradient(x,y,0,x,y,r),colors);}
  function print(g,text,x,y,font,color,align='left'){
    g.save();g.font=font;g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';g.fillText(text,x,y);g.restore();
  }
  function cached(label,w,h,draw){
    if(!sets.has(label)){const surface=bitmap(w,h);draw(surface.getContext('2d'));sets.set(label,surface);}
    return sets.get(label);
  }
  function set(g,name,draw){g.drawImage(cached(name,1000,563,draw),0,0,WIDTH,HEIGHT);}
  function camera(g,x,y,zoom,roll=0){
    g.translate(x,y);g.rotate(roll);g.scale(zoom,zoom);g.translate(-x,-y);
  }
  function emulsion(){
    return cached('emulsion',192,192,g=>{
      const rnd=seeded(3607),pixels=g.createImageData(192,192);
      for(let i=0;i<pixels.data.length;i+=4){
        const n=rnd()<.5?14:229;
        pixels.data[i]=n;pixels.data[i+1]=n;pixels.data[i+2]=n;
        pixels.data[i+3]=4+Math.floor(12*rnd());
      }
      g.putImageData(pixels,0,0);
    });
  }
  function finishFilm(g,t,still=false){
    g.save();const step=still?0:Math.floor(t*12),xs=step*23%192,ys=step*51%192;
    g.translate(-xs,-ys);g.fillStyle=g.createPattern(emulsion(),'repeat');g.fillRect(0,0,WIDTH+192,HEIGHT+192);g.restore();
    set(g,'lens',p=>{
      rect(p,0,0,1000,563,flare(p,526,267,610,[0,'#07091100'],[.52,'#070b1000'],[.82,'#05080c45'],[1,'#0205099b']));
      rect(p,0,0,1000,76,ramp(p,0,0,0,76,[0,'#06090ea1'],[1,'#06090e00']));
      rect(p,0,415,1000,148,ramp(p,0,415,0,563,[0,'#07090d00'],[1,'#07090e98']));
    });
  }
  const weatherRandom=seeded(8061);
  const drops=Array.from({length:164},()=>({x:weatherRandom()*1170,y:weatherRandom()*675,z:.25+.75*weatherRandom(),speed:125+weatherRandom()*150}));
  function rain(g,t,strength=1,wind=-.22){
    g.save();g.lineCap='round';g.strokeStyle='#c2ded8';
    for(let layer=0;layer<3;layer++){
      g.beginPath();g.globalAlpha=strength*(.11+layer*.06);g.lineWidth=.65+layer*.34;
      for(let i=layer;i<drops.length;i+=3){const d=drops[i],f=t*d.speed*(.55+d.z*.7);
        const x=((d.x+wind*f)%1170+1170)%1170-76, y=(d.y+f)%660-70, length=8+d.z*23;
        g.moveTo(x,y);g.lineTo(x+wind*length,y+length);
      }
      g.stroke();
    }
    g.restore();
  }
  function ripple(g,x,y,progress,r,tone='#b8d0be'){
    g.save();g.globalAlpha*=Math.sin(Math.PI*progress)*.54;
    oval(g,x,y,1+progress*r,.65+progress*r*.13,null,0,tone,.75);g.restore();
  }
  function scratches(g,seed,count,colors,w=1000,h=563){
    const rnd=seeded(seed);
    for(let i=0;i<count;i++){
      const x=rnd()*w,y=rnd()*h;
      stroke(g,[[x,y],[x+1+rnd()*9,y+rnd()*2.4-1.2]],colors[i%colors.length],.35+rnd()*.8);
    }
  }

  function figure(g,x,ground,scale,direction,t,kind='field',walk=0){
    g.save();g.translate(x,ground);g.scale(direction*scale,scale);
    const sw=Math.sin(t*5.7),step=sw*walk*11,hem=4*Math.sin(t*2.3)+2.3*Math.sin(t*3.7),near=kind==='near';
    const dark=near?'#20252a':'#17292d',light=near?'#475052':'#425751',rim=near?'#c9af86':'#a3b5a3';
    const leg=(dx,forward,near)=>{
      const k=dx+forward;
      poly(g,[[dx-10,-78],[dx+8,-77],[k+5,-38],[k+6,-8],[k+14,-5],[k+16,-1],[k+15,1],[k-10,1],[k-11,-4],[k-9,-13],[k-11,-42]],near?dark:'#132025',near?'#5b665f':'#344541',1.05);
    };
    leg(-13,step,false);leg(13,-step,true);
    g.translate(0,-Math.abs(sw)*walk*1.8);
    g.beginPath();g.moveTo(-21,-182);g.quadraticCurveTo(-32,-177,-35,-160);
    g.bezierCurveTo(-38,-133,-29,-111,-36-hem,-84);
    g.lineTo(-44-hem,-62);g.quadraticCurveTo(-23,-55,-8,-61);
    g.lineTo(0,-67);g.lineTo(5,-60);g.lineTo(33,-63);g.lineTo(28,-90);
    g.quadraticCurveTo(20,-120,26,-148);g.quadraticCurveTo(30,-170,15,-182);
    g.lineTo(7,-188);g.lineTo(-11,-188);g.closePath();
    g.fillStyle=ramp(g,-36,-166,30,-74,[0,light],[.45,dark],[.83,'#1c2b2d'],[1,light]);g.fill();
    g.strokeStyle=dark;g.lineWidth=1.4;g.stroke();
    shape(g,'M-23,-179Q-33,-166 -33,-153L-28,-116L-36,-87',null,rim,1.15);
    shape(g,'M-13,-183L-19,-171L-8,-165L-16,-159L5,-132L10,-169L4,-183Z',light,dark,1.2);
    shape(g,'M12,-181L19,-171L17,-160L10,-149L10,-171Z','#6a746a');
    if(near){
      shape(g,'M14,-158Q21,-138 17,-127L5,-107L9,-99L16,-100L28,-120Q32,-135 27,-152Z',light,dark,1.5);
      shape(g,'M7,-105L16,-100L14,-94L9,-92L4,-96L4,-99Z','#847e6c');
    }else{
      shape(g,'M13,-163Q23,-165 25,-151L26,-136L50,-118L46,-111L19,-123Q15,-125 14,-134Z',light,dark,1.4);
      shape(g,'M47,-121L56,-116L61,-115L61,-111L53,-110L45,-112Z','#8c9582');
    }
    stroke(g,[[-21,-111],[-6,-117]],rim,1.2);stroke(g,[[-7,-146],[-5,-98],[-12,-65]],'#7281748a',1);
    for(let i=0;i<3;i++)oval(g,3,-144+i*16,1.45,1.4,'#b2ab87');
    g.drawImage(witnessHead(false),-23,-229,41,53);
    g.restore();
  }
  const photograph={w:504,h:254,targetX:309,targetY:126};
  function antenna(g,x,y,scale,ink,line){
    g.save();g.translate(x,y);g.scale(scale,scale);
    poly(g,[[-36,110],[-8,-40],[8,-40],[36,110],[28,110],[0,-31],[-27,110]],ink);
    for(let i=0;i<6;i++){const a=-27+i*22,b=a+22,w=5+i*4.1;
      stroke(g,[[-w,a],[w+4,b],[-w-4,b],[w,a]],line,1.75);}
    stroke(g,[[0,-39],[0,-86]],line,2);stroke(g,[[-19,-55],[19,-55]],line,2.6);
    for(let i=0;i<5;i++)stroke(g,[[-16+i*8,-62],[-16+i*8,-51]],line,1.1);
    g.restore();
  }
  function archivePrint(){
    return cached('negative',photograph.w,photograph.h,p=>{
      rect(p,0,0,504,254,ramp(p,0,0,504,254,[0,'#35463f'],[.43,'#bdc4a9'],[.74,'#a2aa93'],[1,'#53635a']));
      const rand=seeded(47);
      for(let i=0;i<33;i++){
        const x=i*17-14,y=124+rand()*61,w=9+rand()*15;
        rect(p,x,y,w,254-y,i%3?'#637569':'#7b897a');
        for(let z=0;z<4;z++)if(rand()>.35)rect(p,x+4,y+4+z*7,w*.34,1.5,'#d0cfaf');
      }
      poly(p,[[0,205],[153,188],[275,189],[359,164],[504,149],[504,254],[0,254]],'#3e5149');
      antenna(p,309,139,.72,'#26352f','#46574a');
      stroke(p,[[46,153],[330,127],[505,129]],'#47594d',1.4);
      for(let x=35;x<504;x+=63)stroke(p,[[x,178-x*.08],[x,204-x*.08]],'#46594e',2.6);
      stroke(p,[[1,181],[504,140]],'#293d34',3.3);
      for(let y=0;y<254;y+=3)rect(p,0,y,505,.7,'#1e322c2a');
      scratches(p,291,1150,['#e5dbc531','#17262542'],504,254);
    });
  }

  const dial={x:600,y:247,r:137};
  function receiverSet(p){
    rect(p,0,0,1000,563,ramp(p,-40,-40,970,553,[0,'#121e24'],[.3,'#26413e'],[.63,'#627266'],[1,'#17272b']));
    const slant=ramp(p,0,116,974,312,[0,'#65786f'],[.39,'#2e4644'],[.65,'#83927a'],[1,'#314742']);
    poly(p,[[93,73],[908,4],[1008,438],[63,521]],slant,'#18272a',4);
    poly(p,[[109,88],[894,24],[976,414],[82,490]],null,'#afaf897a',1.5);
    for(let i=0;i<14;i++){const x=111+i*12;
      stroke(p,[[x,134-i],[x-3,322-i*1.1]],'#142d31',5.3);
      stroke(p,[[x+2.4,135-i],[x-.6,319-i*1.1]],'#9ea38b',1);}
    for(const [x,y] of [[116,104],[871,39],[939,403],[104,457]]){
      oval(p,x,y,5,5,'#2c3c39',0,'#a8b09a',1);stroke(p,[[x-2,y+2],[x+2,y-2]],'#0c1c21',1.4);}
    p.save();p.translate(333,181);p.rotate(-.079);rect(p,-67,-35,135,69,'#1a302e');rect(p,-60,-28,121,55,'#bcb791');
    for(let i=0;i<23;i++){const px=-53+i*4.8;
      stroke(p,[[px,-10+px*px*.0019],[px,-16+px*px*.0023]],'#4d594a',i%4?1:1.8);}
    p.restore();
    for(let i=0;i<4;i++){const x=817+i*22,y=253-i*2;
      oval(p,x,y,6,6,'#293c38',0,'#aeb090',1);oval(p,x-1,y-1,2.1,2.1,i===1?'#d49971':'#73877b');}
    oval(p,dial.x+5,dial.y+8,153,153,'#203735');
    oval(p,dial.x,dial.y,150,150,ramp(p,465,105,698,391,[0,'#d4c6a0'],[.24,'#819083'],[.5,'#384f4b'],[.7,'#c2c4a4'],[1,'#58685b']),0,'#1b3031',4);
    oval(p,dial.x,dial.y,140,140,'#24393a',0,'#a4ad8c',2);
    scratches(p,761,1300,['#f1e4ba1b','#0d171c3b']);
  }
  function receiver(g,t,needleAngle){
    set(g,'receiver',receiverSet);
    const {x,y,r}=dial;
    g.save();g.translate(x,y);g.rotate(-.07);
    oval(g,0,0,r,r,ramp(g,-120,-70,129,106,[0,'#344945'],[.4,'#142d30'],[.8,'#34514a'],[1,'#233b39']));
    for(const rr of [119,105,78,65])oval(g,0,0,rr,rr,null,0,rr===105?'#c8c49b':'#788c78',rr===105?1.7:1);
    for(let i=0;i<72;i++){
      const a=i*TAU/72,major=i%6===0;
      stroke(g,[[Math.cos(a)*(major?106:114),Math.sin(a)*(major?106:114)],[Math.cos(a)*124,Math.sin(a)*124]],major?'#e7d7aa':'#9cae90',major?2.4:1.1);
    }
    const angle=needleAngle??(t<2.8?2.55+smooth(t/2.8)*2.62+.04*Math.sin(t*8):5.17+.035*Math.sin(t*1.1));
    g.save();g.rotate(angle);
    poly(g,[[-25,-3],[118,-1.7],[127,0],[118,1.7],[-25,3]],'#e0906e','#543b34',.7);g.restore();
    oval(g,0,0,17,17,'#708574',0,'#cfbf8f',1.6);oval(g,0,0,8,8,'#283f3d');
    g.beginPath();g.arc(0,0,135,0,TAU);g.clip();
    poly(g,[[-152,-25],[-152,-69],[21,-151],[77,-134]],'#cfd5ad1f');
    poly(g,[[-117,118],[-98,132],[147,-24],[143,-45]],'#cfd5ad10');g.restore();
    receiverInstruments(g,t,angle);
    g.save();g.transform(1,0,-.34,1,147+43*Math.sin(t*.38),0);
    rect(g,-110,0,146,563,ramp(g,-110,0,36,0,[0,'#0b172400'],[.27,'#0b17244a'],[.82,'#0b17244a'],[1,'#0b172400']));
    rect(g,368,0,69,563,ramp(g,368,0,437,0,[0,'#e7c17c00'],[.41,'#e7c17c16'],[1,'#e7c17c00']));g.restore();
  }
  function blocks(p,seed,base,widthMin,widthMax,heightMin,heightMax,paint,windows){
    const rnd=seeded(seed);let x=-40;
    while(x<1050){
      const w=widthMin+rnd()*(widthMax-widthMin),y=base-heightMin-rnd()*(heightMax-heightMin);
      rect(p,x,y,w,base-y,paint);
      if(rnd()>.4){const tw=w*(.22+rnd()*.17);rect(p,x+w*.23,y-3-rnd()*10,tw,17,paint);}
      if(rnd()>.76)stroke(p,[[x+w*.68,y-3-rnd()*22],[x+w*.68,y]],paint,1.2);
      for(let wy=y+8;wy<base-4;wy+=8)for(let wx=x+4;wx<x+w-3;wx+=6.2){
        if(rnd()>.69)rect(p,wx,wy,1.8+rnd()*1.7,1.1+rnd(),windows[Math.floor(rnd()*windows.length)]);
      }
      x+=w+1+rnd()*5;
    }
  }
  function harborSky(p){
    rect(p,0,0,1000,563,ramp(p,40,-40,970,580,[0,'#13202e'],[.42,'#40565e'],[.67,'#697776'],[1,'#263a47']));
    rect(p,0,15,1000,456,flare(p,693,213,394,[0,'#d8ae82a0'],[.32,'#c1ad873d'],[.7,'#98a88e19'],[1,'#c2aa8600']));
    blocks(p,221,367,12,36,29,98,'#657b7b',['#b1b59a','#9cae9e','#526d73']);
    blocks(p,475,378,14,39,47,119,'#435e65',['#bfb99b','#93a79a','#6c8b8d']);
    blocks(p,654,396,20,57,45,110,'#304b53',['#c5aa81','#91a79a','#718c8f']);
    antenna(p,804,253,.5,'#3a5055','#435b5c');
    for(const x of [126,578,859]){
      rect(p,x,239+(x%23),4,42,'#8f5c55');
      for(let y=0;y<5;y++)rect(p,x,239+(x%23)+y*8,4,3.2,'#d79778');}
  }
  function officeSet(p){
    rect(p,0,0,1000,563,'#1a2b31');
    p.save();p.beginPath();p.rect(0,0,1000,335);p.clip();
    p.drawImage(streetImage(),66,96,705,332,0,0,1000,349);
    rect(p,0,0,1000,340,ramp(p,0,0,1000,335,[0,'#13353f45'],[.58,'#183b426c'],[1,'#20283c85']));
    for(let i=0;i<18;i++){
      const y=-16+i*21;
      poly(p,[[0,y+33],[1000,y-47],[1000,y-40],[0,y+41]],'#16282d94');
      stroke(p,[[0,y+42],[1000,y-39]],'#9ca99b55',.9);
    }
    for(const x of [91,383,773]){rect(p,x,0,11,341,'#263337');rect(p,x+10,0,1.5,340,'#9b9c86');}
    p.restore();
    poly(p,[[-15,359],[1000,263],[1000,288],[-15,389]],'#2b3436','#6b7569',1.4);
    poly(p,[[-15,387],[1000,287],[1000,563],[0,563]],ramp(p,0,368,960,555,[0,'#344340'],[.42,'#797363'],[.7,'#575849'],[1,'#263234']));
    p.save();p.beginPath();p.moveTo(-5,388);p.lineTo(1000,287);p.lineTo(1000,563);p.lineTo(-5,563);p.clip();
    p.translate(148,456);p.rotate(-.16);p.scale(1,2.2);
    oval(p,0,0,82,85,flare(p,0,0,84,[0,'#e9856a65'],[.34,'#b85c5934'],[1,'#bd605600']));p.restore();
    for(let i=0;i<40;i++){const y=322+i*8.2;
      stroke(p,[[0,y+47],[1000,y-52]],i%5?'#2b302e39':'#bcaa8752',i%4?.7:2);}
    // The base, elbow, arm, reflector and pool of light form a single practical desk lamp.
    oval(p,197,400,73,15,'#233335',-.08);oval(p,193,394,67,11,'#58645a',-.08,'#848a78',1);
    poly(p,[[170,388],[177,383],[163,265],[174,253],[290,167],[287,160],[159,242],[149,256]],'#273b3d','#8b9682',2);
    stroke(p,[[182,385],[170,262],[294,173]],'#a1a48b',2);
    for(const [x,y] of [[162,255],[287,169]])oval(p,x,y,7,7,'#696f61',0,'#b0ad91',1.3);
    shape(p,'M265,161Q278,145 297,153L310,158Q335,156 365,183L259,216Q254,190 265,161Z',ramp(p,260,148,352,211,[0,'#a8a589'],[.35,'#626f60'],[1,'#263a3a']),'#273a39',2);
    oval(p,311,198,56,6,'#dfcb97',-.31,'#a9aa87',1);
    poly(p,[[259,216],[365,183],[771,434],[248,489]],ramp(p,308,201,543,474,[0,'#e7d7a554'],[1,'#ebcf9011']));
    p.save();p.translate(535,416);p.transform(1,-.09,-.54,.56,0,0);p.rotate(.10);
    rect(p,-185,-41,342,115,'#39423bbb');rect(p,-190,-48,342,115,'#a3a58b');
    for(let i=0;i<10;i++)rect(p,-174,-34+i*8,299-(i*31%74),1.6,'#687464');p.restore();
    scratches(p,47,1050,['#f5e1b222','#1c2c3136']);
  }
  function officePhone(g,t,angle,near=0,ringing=false,age=3,identify=false){
    g.save();camera(g,655,292,1.018+.074*near+.009*Math.sin(t*.4));
    set(g,'office',officeSet);
    g.save();g.beginPath();
    for(let i=0;i<15;i++){
      const y=-12+i*21;g.moveTo(17,y+31);g.lineTo(253,y+12);g.lineTo(253,y+24);g.lineTo(17,y+43);g.closePath();
    }
    g.clip();g.globalAlpha=.77;g.translate(150+65*Math.sin(t*.57-.74),295);g.scale(1.06,1.06);pedestrian(g,t*.81);g.restore();
    g.save();g.beginPath();g.rect(0,0,1000,289);g.clip();rain(g,t,.65,-.13);g.restore();
    rect(g,0,0,1000,563,ramp(g,0,0,665,230,[0,'#0e21274d'],[.72,'#19313915'],[1,'#11242200']));
    headlight(g,t);wetGlass(g,t);deskPickup(g,t,!ringing,age);
    poly(g,[[417,395],[608,483],[680,487],[866,354],[765,305],[609,332]],ramp(g,449,468,859,322,[0,'#18282cb6'],[.52,'#162629aa'],[1,'#25333229']));
    oval(g,587,453,53,8,'#202e2c93',.29);
    const bell=t%2.85,buzz=ringing?(Math.exp(-((bell-.33)**2)/.018)+.69*Math.exp(-((bell-.7)**2)/.020)):0;
    g.save();g.translate(692,307+buzz*1.55*Math.sin(t*51));g.rotate(buzz*.013*Math.sin(t*52));g.scale(1.11,1.11);g.translate(-766,-314);
    foldingPhone(g,t,angle,ringing,age,identify);g.restore();
    g.restore();
  }
  function terraceSet(p){
    p.drawImage(cached('harbor',1000,563,harborSky),0,0);
    // Access stairwell, ventilators, rooftop tank and its trellis occupy separate depth planes.
    poly(p,[[-8,184],[118,169],[187,207],[187,347],[-8,384]],'#253940','#72817b',1.3);
    poly(p,[[0,175],[119,161],[194,199],[188,210],[112,183],[0,195]],'#4d5f62','#83938a',1.25);
    poly(p,[[31,211],[91,202],[90,340],[33,352]],'#0f222a','#7f8e82',1.6);
    poly(p,[[36,217],[78,210],[63,333],[36,342]],'#647568');
    poly(p,[[63,335],[90,328],[251,380],[140,390]],'#c9b48732');
    rect(p,979,73,7,270,'#26383f');stroke(p,[[771,0],[797,56],[879,103],[1000,106]],'#26383d',2);
    for(const x of [858,926])stroke(p,[[x,167],[x-13,344]],'#334249',4.8);
    stroke(p,[[850,307],[928,172],[919,303],[862,171]],'#465b5b',2.3);
    shape(p,'M845,111Q848,93 896,91Q939,90 950,108L949,168Q945,178 903,182Q859,182 844,170Z',ramp(p,839,100,954,176,[0,'#253743'],[.43,'#667676'],[.71,'#43565a'],[1,'#253b43']),'#24383e',2);
    oval(p,896,110,52,9,'#687877',0,'#323f45',1.7);
    for(let i=0;i<3;i++){const y=124+i*19;p.beginPath();p.moveTo(845,y);p.quadraticCurveTo(895,y+10,949,y-2);p.strokeStyle='#293d42';p.lineWidth=1.8;p.stroke();}
    for(const x of [951,961])stroke(p,[[x,116],[x-14,313]],'#9ca396',1.3);
    for(let i=0;i<12;i++)stroke(p,[[951-i*1.1,128+i*14],[960-i*1.1,127+i*14]],'#84968d',1);
    poly(p,[[0,372],[1000,288],[1000,563],[0,563]],ramp(p,0,326,455,556,[0,'#526966'],[.4,'#40585a'],[.75,'#2d444e'],[1,'#243742']));
    for(let i=0;i<8;i++){
      const x=-200+i*200;
      stroke(p,[[603+(x-520)*.25,322],[x,564]],'#1e323b80',2.1);
    }
    for(const y of [376,406,452,520])stroke(p,[[0,y+24],[1000,y-54]],'#9fa79346',1.4);
    const r=seeded(601);
    for(let i=0;i<520;i++){const x=r()*1000,y=355+r()*205;
      stroke(p,[[x,y],[x+3+r()*21,y-.65]],i%5?'#a6c1b029':'#dbc09a58',.5+r());}
    scratches(p,611,760,['#bccab117','#1f33373a']);
  }
  const railing=x=>326-.068*x;
  function rail(g){
    for(let x=-25;x<1050;x+=138){const y=railing(x);stroke(g,[[x,y],[x-1,y+51]],'#233b42',5.3);stroke(g,[[x-1,y],[x-2,y+49]],'#b6bbb0',1.05);}
    stroke(g,[[-10,railing(-10)+19],[1010,railing(1010)+19]],'#576e70',2.1);
    stroke(g,[[-10,railing(-10)+1.4],[1010,railing(1010)+1.4]],'#20343e',5.8);
    stroke(g,[[-10,railing(-10)-1],[1010,railing(1010)-1]],'#cad3bc',1.75);
  }
  function shoulder(g,offset,opacity=1){
    g.save();g.globalAlpha*=opacity;g.translate(offset,0);
    shape(g,'M-45,377Q10,358 63,376L108,407Q149,432 213,456Q288,489 343,565L-45,565Z','#101e26');
    g.save();g.translate(-112,5);g.scale(.81,.81);
    g.fillStyle=ramp(g,-35,75,400,453,[0,'#0c1720'],[.58,'#14232c'],[.92,'#1b2b31'],[1,'#39423e']);g.fill(shoulderProfile);
    g.strokeStyle='#6d75679e';g.lineWidth=1.55;g.stroke(shoulderProfile);g.restore();
    shape(g,'M-10,378Q44,367 95,398L141,422L116,437L191,486L177,519',null,'#445249',2.3);
    g.restore();
  }
  function reverseAngle(g,t){
    g.save();camera(g,642,290,1.28+.018*Math.sin(t*.29));set(g,'terrace',terraceSet);rail(g);g.restore();
    figure(g,683,514,1.51,-1,t,'near');
    rain(g,t,.64,-.29);
    shoulder(g,-4+3*Math.sin(t*.35));
  }

  // The center and radius of the radio dial and the paper reel coincide on the edit frame.
  function receiptCut(g,age,sourceAge,clock){
    lastReaderFrame=null;
    const early=sourceAge<beaconCut ? .20 : 0;
    if(age<early){harborShot(g,mix(sourceAge,beaconCut,smooth(age/early)));return;}
    const elapsed=age-early,cut=.78,origin=Math.max(beaconCut,sourceAge);
    const targetX=548,targetY=248,dialZoom=1.48;
    g.save();rect(g,0,0,WIDTH,HEIGHT,'#1b2a2f');
    if(elapsed<cut){
      const u=smooth(elapsed/cut),pose=radioPose(origin);
      const rotation=pose.roll,dx=dial.x-pilot.x,dy=dial.y-pilot.y;
      const x=pose.x+pose.scale*(dx*Math.cos(rotation)-dy*Math.sin(rotation));
      const y=pose.y+pose.scale*(dx*Math.sin(rotation)+dy*Math.cos(rotation));
      const zoom=mix(pose.scale,dialZoom,u);
      g.translate(mix(x,targetX,u),mix(y,targetY,u));g.rotate(rotation*(1-u));g.scale(zoom,zoom);g.translate(-dial.x,-dial.y);
      receiver(g,origin-beaconCut+elapsed,needleAt(origin)+.57*u);
    }else{
      const t=elapsed-cut,u=smooth(t/1.21);
      let framing=fullGate;
      if(u<1){
        const {hub,rim}=readerPack.poses.hero,radius=Math.hypot(rim[0]-hub[0],rim[1]-hub[1]);
        const zoom=mix(dial.r*dialZoom/radius,1,u);
        framing=new DOMMatrix().translate(mix(targetX,hub[0],u),mix(targetY,hub[1],u)).scale(zoom).translate(-hub[0],-hub[1]);
        usePose(g,framing);
      }
      readerCamera(g,t,0,clock,0,null);
      lastReaderFrame={time:t,framing};
    }
    g.restore();
  }

  function splice(g,age,plate){
    const duration=1.42,u=smooth(age/duration);
    archiveFolder(g,age,state.counts.second);
    if(u>=1||!plate)return;
    const edge=mix(-330,1180,u),lean=104,w=191;
    g.save();g.beginPath();g.moveTo(edge+w,0);g.lineTo(1200,0);g.lineTo(1200,563);g.lineTo(edge+w-lean,563);g.closePath();g.clip();
    impressions(g,plate);g.restore();
    g.save();g.transform(1,0,-lean/563,1,edge,0);
    rect(g,0,0,w,563,ramp(g,0,0,w,0,[0,'#281b24'],[.09,'#a05e46'],[.16,'#8c5747'],[.78,'#7d483e'],[.94,'#bd7751'],[1,'#282126']));
    const photo=archivePrint(),travel=(age*473)%135;
    for(let i=-1;i<6;i++){
      const y=i*135-travel;
      rect(g,24,y+4,w-48,116,'#242c29');g.save();g.globalAlpha=.85;
      g.drawImage(photo,36+31*(i+1),14,240,219,29,y+9,w-58,105);g.restore();
      rect(g,26,y+9,w-52,109,'#a74c393b');
    }
    for(let i=-1;i<32;i++){const y=i*24-(age*473)%24;
      rect(g,8,y,8,14,'#182023');rect(g,w-16,y,8,14,'#182023');}
    rect(g,1,0,2.3,563,'#e1ae7d');rect(g,w-4,0,1.8,563,'#edc294');
    g.restore();
  }
  function blinds(g,age,plate,t,angle){
    const turn=age-1.32;
    if(turn<=0){
      cityRain(g,t);
      if(plate&&age<.30){g.save();g.globalAlpha=1-smooth(age/.30);impressions(g,plate);g.restore();}
      return;
    }
    officePhone(g,t,angle,smooth(turn/2.4)*.82,true);
    if(turn>=1.28)return;
    const pitch=563/9;
    g.save();g.beginPath();
    for(let i=0;i<10;i++){
      const u=smooth((turn-i*.052)/.80),h=pitch*(1-u),y=i*pitch;
      if(h>.2)g.rect(0,y,1000,h+.3);
    }
    g.clip();cityRain(g,t);g.restore();
    for(let i=0;i<10;i++){const u=clamp((turn-i*.052)/.8),y=i*pitch+pitch*(1-smooth(u));
      if(u>0&&u<1){rect(g,0,y-3,1000,5,'#0e1a21');rect(g,0,y+1.3,1000,.9,'#a4ad904d');}}
  }
  function callShot(g,age,t,angle,plate){
    const follow=smooth((age-1.0)/2.10);
    g.save();camera(g,mix(680,365,follow),mix(254,358,follow),1.08+.14*follow,-.013*follow);
    officePhone(g,t,angle,.66,false,age,true);g.restore();
    if(plate&&age<.34){g.save();g.globalAlpha=1-smooth(age/.34);impressions(g,plate);g.restore();}
  }
  const roofPushFrom=6.52,roofPushTo=9.76,roofNumbersAt=10.04,roofRollAt=10.60;
  const awardShots={third:['cipher-roll','cipher-lock'],second:['film-roll','silver-print'],first:['carrier-roll','phosphor-print'],grand:['iris-roll','iris-print']};
  function showShot(g,shot,age,t,angle,plate,sourceAge,clock,preview){
    if(shot==='intercept'||shot==='cipher-brief'){
      signalOpening(g,shot,age,sourceAge,clock);
      return;
    }
    switch(shot){
      case 'splice': splice(g,age,plate);break;
      case 'archive': archiveFolder(g,age,state.counts.second);break;
      case 'blinds': blinds(g,age,plate,t,angle);break;
      case 'ring': officePhone(g,t,angle,.5,true);break;
      case 'call': callShot(g,age,t,angle,plate);break;
      case 'break': leavingOffice(g,age,t,plate);break;
      case 'rail': rooftopArrival(g,age,plate,clock,preview);break;
      case 'return': lastLight(g,age,plate);break;
      case 'interval': intermission(g,age,plate);break;
      default: reverseAngle(g,t);
    }
  }
  function liveShot(id){
    if(current.view)return awardShots[current.prize][current.view==='result'?1:0];
    if(id==='incoming')return 'intercept';
    if(id==='brief-3')return 'cipher-brief';
    if(id==='archive')return 'splice';
    if(id==='ring')return 'blinds';
    if(id==='break')return 'break';
    if(id==='roof')return 'rail';
    if(id==='end')return 'return';
    if(id==='interval')return 'interval';
    if(art==='archive')return 'archive';
    if(art==='phone')return 'call';
    return 'reverse';
  }

  function speechLevel(name,age){
    const envelope=dialogueLines[name].envelope,pos=age*20;
    if(pos<0||pos>=envelope.length)return 0;
    const i=Math.floor(pos);
    return mix(envelope[i],envelope[i+1]??0,pos-i)/255;
  }
  let score=null,soundOn=false,lastSoundShot='',lastBell=-1;
  let nextKeyAge=0,keyStroke=0;
  function openScore(){
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return null;
    const context=new Audio(),main=context.createGain(),room=context.createGain(),filter=context.createBiquadFilter();
    main.gain.value=0;main.connect(context.destination);
    const seconds=2,buffer=context.createBuffer(1,context.sampleRate*seconds,context.sampleRate),data=buffer.getChannelData(0),rnd=seeded(716);
    let previous=0;
    for(let i=0;i<data.length;i++){previous=(previous+.115*(rnd()*2-1))*.94;data[i]=previous;}
    const noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
    filter.type='lowpass';filter.frequency.value=530;
    room.gain.value=0;noise.connect(filter).connect(room).connect(main);noise.start();
    const keyBuffer=context.createBuffer(1,Math.ceil(.065*context.sampleRate),context.sampleRate);
    const keyData=keyBuffer.getChannelData(0);
    for(let i=0;i<keyData.length;i++){
      const t=i/context.sampleRate;
      const down=Math.exp(-t*180),up=t<.019?0:Math.exp(-170*(t-.019));
      keyData[i]=(.52*(rnd()*2-1)+.48*Math.sin(t*TAU*938))*down+
        (.28*(rnd()*2-1)+.17*Math.sin(t*TAU*1770))*up;
    }
    return {context,main,room,filter,keyBuffer,voices:new Set(),dialogue:{},ready:null};
  }
  function prepareDialogue(){
    if(!score.ready)score.ready=Promise.allSettled(Object.entries(dialogueLines).map(async ([name,line])=>{
      const data=Uint8Array.from(atob(line.audio),c=>c.charCodeAt(0));
      score.dialogue[name]=await score.context.decodeAudioData(data.buffer);
    }));
    return score.ready;
  }
  function playLine(name,at,age){
    const buffer=score.dialogue[name],offset=Math.max(0,age-at);
    if(!buffer||offset>=buffer.duration)return;
    const c=score.context,start=c.currentTime+Math.max(0,at-age),source=c.createBufferSource(),amp=c.createGain();
    source.buffer=buffer;amp.gain.value=.88;
    playVoice(source,amp,start,start+buffer.duration-offset,offset);
  }
  function playVoice(source,amp,start,end,offset){
    const voice={source,amp};score.voices.add(voice);
    source.connect(amp).connect(score.main);
    if(offset===undefined)source.start(start);else source.start(start,offset);
    source.stop(end);
    source.onended=()=>{score.voices.delete(voice);source.disconnect();amp.disconnect();};
  }
  function tone(hz,endHz,span,volume,type='sine',delay=0){
    const c=score.context,now=c.currentTime+delay,osc=c.createOscillator(),amp=c.createGain();
    osc.type=type;osc.frequency.setValueAtTime(hz,now);osc.frequency.exponentialRampToValueAtTime(endHz,now+span);
    amp.gain.setValueAtTime(.0001,now);amp.gain.exponentialRampToValueAtTime(volume,now+.018);
    amp.gain.exponentialRampToValueAtTime(.0001,now+span);
    playVoice(osc,amp,now,now+span+.02);
  }
  function keyboardSound(age){
    nextKeyAge=Math.max(age,nextKeyAge);
    // A short lookahead keeps the rhythm even when the reduced-motion display paints once a second.
    while(nextKeyAge<age+1.10){
      const c=score.context,at=c.currentTime+nextKeyAge-age;
      const source=c.createBufferSource(),amp=c.createGain();
      source.buffer=score.keyBuffer;source.playbackRate.value=.9+.06*(keyStroke%5);
      amp.gain.value=keyStroke%4===0?.27:.18;
      playVoice(source,amp,at,at+.076);
      nextKeyAge+=mix(.32,.115,smooth(nextKeyAge/5))*(1+.12*Math.sin(keyStroke*2.3));
      keyStroke++;
    }
  }
  function roofFootsteps(age){
    const c=score.context;
    if(!score.footstep){
      const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*.19),c.sampleRate),wave=buffer.getChannelData(0),rnd=seeded(1947);
      let grain=0;
      for(let i=0;i<wave.length;i++){
        const t=i/c.sampleRate,heel=Math.exp(-35*t),toe=Math.max(0,t-.049);
        grain=.70*grain+.30*(rnd()*2-1);
        const tap=Math.sin(TAU*(101*t-70*t*t))*.62+grain*.78;
        const scuff=t>.049?grain*Math.exp(-33*toe)*.8:0;
        wave[i]=Math.min(1,t*720)*(heel*tap+scuff);
      }
      score.footstep=buffer;
    }
    roofFootfalls.forEach((at,i)=>{
      if(at<age)return;
      const when=c.currentTime+at-age,source=c.createBufferSource(),amp=c.createGain();
      source.buffer=score.footstep;source.playbackRate.value=[.94,1.02,.92,1.06][i];
      amp.gain.value=[.13,.17,.22,.16][i];
      playVoice(source,amp,when,when+score.footstep.duration/source.playbackRate.value);
    });
  }
  function releaseVoices(){
    if(!score)return;
    const now=score.context.currentTime;
    for(const {source,amp} of score.voices){
      amp.gain.cancelAndHoldAtTime(now);amp.gain.setTargetAtTime(.0001,now,.009);
      source.stop(now+.035);
    }
    score.voices.clear();
  }
  function soundCue(shot,age,view){
    if(!soundOn||!score||document.hidden||!visible)return;
    const key=shot+'-'+view,now=score.context.currentTime;
    if(key!==lastSoundShot){
      releaseVoices();lastSoundShot=key;lastBell=-1;nextKeyAge=age;keyStroke=0;
      const wind=shot==='rail'||shot==='reverse'||shot==='iris-roll',quiet=view==='result'||shot==='break';
      score.room.gain.setTargetAtTime(quiet?0:wind ? .39 : .15,now,quiet ? .05 : .42);
      score.filter.frequency.setTargetAtTime(wind?820:430,now,.36);
      if(shot==='call')playLine('answer',.20,age);
      if(shot==='break')playLine('roof',.06,age);
      if(shot==='rail'){roofFootsteps(age);playLine('wait',2.64,age);playLine('who',5.42,age);}
      if(view==='result'&&age<.3&&animateReveal){
        const lead=awardCue?.lead??0;
        if(shot==='cipher-lock'){
          const delay=liveCipherCue?.delay??0;
          tone(108,65,.07,.060,'triangle',delay);
          if(state.counts.third>=4)tone(462,535,.056,.029,'sine',delay+cipherMiddleStop);
          if(state.counts.third>1)tone(610,620,.075,.036,'sine',delay+cipherLastStop);
        }else if(shot==='silver-print'){
          tone(791,168,.042,.068,'triangle',lead+.13);tone(331,292,.89,.048,'sine',lead+.40);
          tone(493,461,.56,.022,'sine',lead+1.06);
        }else if(shot==='phosphor-print'){
          for(let i=0;i<Math.min(3,state.counts.first);i++){
            tone(610+i*78,590+i*78,.091,.065,'sine',lead+contactClicks[i]);
            tone(183,88,.047,.052,'triangle',lead+contactClicks[i]+.045);
          }
        }else{
          tone(82,69,.65,.081,'sine',lead+.62);tone(207,203,.40,.040,'sine',lead+.83);
        }
      }
      else if(view==='roll'){
        tone(116,76,.16,.040,'triangle');
        if(shot==='carrier-roll')tone(261,392,.34,.028,'sine',.24);
      }
      else if(shot==='splice'){tone(146,49,.27,.096,'triangle');tone(528,159,.10,.060,'triangle',.17);}
      else if(shot==='intercept'||shot==='cipher-brief'){
        const pulses=shot==='intercept'?[[.04,.07],[.17,.18],[.42,.07],[.64,.18],[.89,.07]]:[[.04,.07],[.19,.07],[.36,.19]];
        for(const [delay,span] of pulses)tone(682,684,span,.068,'sine',delay);
      }
      else if(shot==='break'&&age<.3){
        tone(425,421,.14,.037);tone(174,44,.087,.085,'triangle',4.56);
        tone(93,52,1.63,.079,'sine',5.17);tone(151,61,.13,.05,'triangle',7.07);
      }
      else if(shot==='rail'&&age<.3){
        tone(670,664,.57,.045);tone(989,985,.31,.018,'sine',.02);
        tone(73,48,.76,.043,'sine',.22);
      }
      else if(shot==='call'){tone(496,322,.12,.06,'triangle');}
    }
    if(shot==='cipher-roll')keyboardSound(age);
    if((shot==='ring'||shot==='blinds') && view!=='result'){
      const cycle=Math.floor(age/2.85);
      if(cycle!==lastBell){lastBell=cycle;
        for(const delay of [0,.27]){tone(730,727,.20,.052,'sine',delay);tone(911,904,.17,.044,'sine',delay);}
      }
    }
  }
  function speakerLevel(){
    if(!score)return;
    const on=soundOn&&!document.hidden&&visible;
    if(!on){releaseVoices();lastSoundShot='';}
    score.main.gain.setTargetAtTime(on ? .52 : 0,score.context.currentTime,.038);
  }
  let audioChanging=false;
  async function toggleAudio(){
    if(audioChanging)return;
    audioChanging=true;
    try{
      if(!score)score=openScore();
      if(!score)throw new Error('audio unavailable');
      const target=!soundOn;
      if(target && score.context.state!=='running')await score.context.resume();
      if(target)await prepareDialogue();
      soundOn=target;lastSoundShot='';lastBell=-1;speakerLevel();
      screen.dataset.audio=soundOn?'on':'off';startPaint();
    }catch{live.textContent='当前浏览器无法播放音效。';}
    finally{audioChanging=false;}
  }


// Interception
  // The harbor beacon and the receiver's pilot lamp share a screen position at the cut.
  const beaconCut=2.35, receiverReady=4.2;
  const beacon={x:292,y:134}, pilot={x:839,y:251}, lampCut={x:495,y:218};
  function harborBackdrop(p){
    rect(p,0,0,1000,563,ramp(p,125,0,792,510,[0,'#122433'],[.32,'#304957'],[.65,'#829497'],[1,'#38505a']));
    rect(p,0,0,1000,410,flare(p,714,247,425,[0,'#d7ba8b88'],[.44,'#c5b28c34'],[1,'#8fb7bb00']));
    p.save();p.translate(418,142);p.rotate(-.10);p.scale(1,.10);
    oval(p,-77,0,401,320,flare(p,-77,0,402,[0,'#a9bcbd2a'],[.44,'#91abaf22'],[1,'#8dabae00']));
    oval(p,168,383,346,225,flare(p,168,383,346,[0,'#b3c3ba19'],[1,'#9eb6b100']));p.restore();
    shape(p,'M-20 310 L39 296 64 301 131 279 157 280 215 255 239 266 286 260 322 275 360 267 402 283 467 263 513 266 562 246 607 263 641 255 689 268 730 241 771 235 807 251 839 250 900 275 944 266 1020 279 1020 369 -20 369Z','#586d73');
    blocks(p,403,353,14,37,24,67,'#536971',['#adb39f','#7b9390','#8a9a92']);
    // Distinct rooflines break through the haze; the empty sky carries the moving aerial.
    shape(p,'M607 351V226L619 224V205L631 212 641 203 653 214 667 219V351Z','#425a62');
    shape(p,'M703 349V212L717 202 727 178 740 189 747 213V349Z','#3d545d');
    shape(p,'M727 178L730 152 731 184 740 189 741 194Z','#748483');
    for(const y of [224,251,278,305])stroke(p,[[706,y],[740,y+26],[709,y+27],[741,y]],'#94a79a88',1.5);
    shape(p,'M801 354V225L811 222 812 198 819 198 820 179 826 177 828 198 835 198 836 220 847 223V354Z','#455b63');
    for(let k=0;k<4;k++)stroke(p,[[807+k*10,230],[807+k*10,316]],'#9daca17a',1.3);
    // The tower faces catch three different amounts of the last light behind the rain.
    poly(p,[[607,226],[628,218],[629,349],[607,349]],'#304c56');
    poly(p,[[629,216],[653,218],[667,222],[667,349],[629,349]],'#526a6c');
    poly(p,[[731,186],[741,198],[747,214],[747,349],[729,349]],'#304b56');
    poly(p,[[824,179],[827,199],[835,200],[835,222],[846,226],[846,348],[825,348]],'#354f59');
    stroke(p,[[611,225],[624,219],[630,215],[653,218]],'#b5baa4',1);
    const lamps=seeded(418);
    for(let floor=0;floor<23;floor++){
      const yy=228+floor*4.5;
      const groups=[[610,626],[632,665],[706,728],[731,744],[804,824],[829,842]];
      for(const [lo,hi] of groups){
        if(lamps()>.61)stroke(p,[[lo,yy],[hi,yy+(lo<630?-.8:.4)]],'#a3b5a26c',.65);
        for(let xx=lo+2;xx<hi-1;xx+=4.5)if(lamps()>.79)rect(p,xx,yy-1,2.1,1.7,lamps()>.71?'#dac693':'#a7b9a7');
      }
    }
    for(let n=0;n<3;n++)stroke(p,[[813+n*4,203],[813+n*4,219]],'#bac4a8',1);
    stroke(p,[[820,181],[825,178],[828,199]],'#bcc2a6',1);
    stroke(p,[[608,265],[625,259],[647,262],[664,269]],'#d6b38b',1.3);
    oval(p,730,154,1.35,1.45,'#d28673');
    blocks(p,72,362,17,43,20,62,'#344d56',['#afa88a','#89a69c','#608180']);
    // The quay and the water meet along the same horizon.
    rect(p,0,355,1000,208,ramp(p,0,355,0,563,[0,'#606e69'],[.10,'#415b60'],[.55,'#304951'],[1,'#122b36']));
    rect(p,0,348,1000,6,'#293f48');rect(p,0,350,1000,1.1,'#a3ac96');
    shape(p,'M872 341L893 332 954 333 966 341Z','#536b6a','#b2b9a1',.95);
    rect(p,876,343,87,2.8,'#243e48');
    for(let i=0;i<8;i++){rect(p,881+i*10.6,343,1.7,8,'#2a4249');rect(p,884+i*10.6,344,4.1,1.35,'#e4c591');}
    const r=seeded(4982);
    for(let i=0;i<95;i++){
      const x=r()*1000,y=347+r()*4,w=.8+r()*3;
      rect(p,x,y,w,1.5,i%4===0?'#deb37e':'#bdc5a9');
    }
    for(let i=0;i<530;i++){
      const y=355+r()*208,x=r()*1000,stretch=(y-350)/160;
      stroke(p,[[x,y],[x+(2+r()*18)*stretch,y-.35]],i%3?'#acba9f21':'#182e393e',.5+stretch*.57);
    }
  }
  const wakeRandom=seeded(312);
  const glints=Array.from({length:145},(_,i)=>({
    x:[138,545,632,724,819,933][i%6],z:wakeRandom(),offset:wakeRandom()-.5,phase:wakeRandom()*TAU
  }));
  function waterLight(g,t){
    for(const f of glints){
      const y=356+f.z*151,drift=Math.sin(t*1.08+f.phase+f.z*9),x=f.x+f.offset*(7+f.z*68)+drift*(1+f.z*4);
      const gleam=(.52+.48*Math.sin(t*1.95+f.phase+f.z*13))*(1-f.z*.66);
      g.fillStyle=f.x===724||f.x===138?'#ecb47d':'#bdd3bb';
      g.globalAlpha=gleam*.49;g.fillRect(x,y,(2.3+f.z*17)*(.68+drift*.26),.7+f.z*1.4);
    }
    g.globalAlpha=1;
  }
  function ferry(g,t){
    const x=542+t*15,y=389+1.4*Math.sin(t*1.8);
    g.save();g.translate(x,y);g.rotate(.006*Math.sin(t*1.7));
    const hull=cached('night-ferry',230,85,p=>{
      shape(p,'M6 53Q46 57 79 55L216 48 211 57 194 65 39 69 14 64Z','#243941','#a1aea0',1.2);
      shape(p,'M23 52L28 39 45 36 51 23 153 19 159 30 187 29 200 47Z','#c2be9e','#455c5d',1.4);
      shape(p,'M32 39L181 31 193 44 27 50Z','#365b54');
      shape(p,'M42 25L52 18 152 14 165 20 158 24Z','#4c6262','#a6b1a0',1.1);
      for(let j=0;j<12;j++)rect(p,49+j*10,27-j*.36,6.1,6,j%4===1?'#687e70':'#e2c491');
      for(let j=0;j<16;j++)rect(p,34+j*9.6,40-j*.43,5.8,5.5,j%5===0?'#84907a':'#d5b486');
      stroke(p,[[40,54],[199,46]],'#caa373',1.3);
      stroke(p,[[127,19],[126,6],[136,11]],'#546562',1.1);
      for(let k=0;k<6;k++)stroke(p,[[43+k*23,54-k*.95],[43+k*23,50-k*.95]],'#93a89a',.85);
      shape(p,'M126 6L136 9 127 12Z','#9e6253');
      oval(p,199,45,2.4,2,'#e8b57c');
    });
    g.save();g.translate(0,10);g.scale(1,-.27);g.globalAlpha=.17;g.drawImage(hull,-112,-65);g.restore();
    stroke(g,[[-110,3],[-136,4],[-157,3],[-181,5]],'#c0c9b16b',1.6);
    stroke(g,[[-94,6],[-122,8],[-148,8],[-168,10]],'#b1bca43c',1.2);
    for(let i=0;i<6;i++){
      const u=(i/6+t*.22)%1;
      stroke(g,[[-85-u*96,3+u*5],[-79-u*92,4+u*6],[-72-u*90,4.5+u*6]],'#c6c5a65e',.85);
    }
    g.drawImage(hull,-112,-65);
    oval(g,87,-20,8,8,flare(g,87,-20,8,[0,'#f4bd879f'],[.22,'#db9e6773'],[1,'#e7a47000']));g.restore();
  }
  function mastPlate(p){
    // Foreground relay on a wet pier: two angle irons, ladders, insulators and tensioned stays.
    const steel=ramp(p,185,380,342,452,[0,'#10232e'],[.56,'#253841'],[.8,'#192d37'],[1,'#566665']);
    poly(p,[[187,532],[280,179],[288,176],[204,532]],steel,'#243843',1.5);
    poly(p,[[310,532],[295,175],[303,177],[328,532]],steel,'#182c36',1.6);
    for(let n=0;n<11;n++){
      const y=206+n*31,a=279-(y-182)*.245,b=298+(y-182)*.060;
      poly(p,[[a,y],[b+1.5,y+28],[b+1.7,y+33],[a-1.3,y+5]],'#293c43');
      stroke(p,[[a-5,y+30],[b,y],[a,y]],'#72817a',1.15);
      stroke(p,[[a,y],[b,y]],'#283e46',2.25);
    }
    for(const x of [281,287])stroke(p,[[x,192],[x-34,486]],'#4e605e',1.2);
    for(let i=0;i<21;i++)stroke(p,[[281-i*1.54,200+i*13.9],[287-i*1.54,200+i*13.9]],'#768077',1);
    for(const [x,y] of [[36,547],[498,528],[694,505]])stroke(p,[[292,180],[x,y]],'#233b45b5',1);
    rect(p,289.5,134,4.7,49,'#253a44');stroke(p,[[268,159],[318,157]],'#596b6b',2.2);
    for(let i=0;i<5;i++)stroke(p,[[269+i*11,154-i*.36],[269+i*11,163-i*.36]],'#435a61',1.4);
    poly(p,[[250,194],[315,190],[316,196],[248,201]],'#2d424a','#809087',1);
    rect(p,283,146,18,5,'#324752');rect(p,285,141,14,5,'#76847e');
    // A near bollard and its mooring line establish the scale of the vessel across the channel.
    shape(p,'M-10 510Q55 485 115 502L135 496Q164 475 182 462L182 468Q131 527 93 522L-10 539Z','#142833');
    shape(p,'M7 508L15 485Q17 479 28 479H57Q66 482 68 488L77 505Z','#192d37','#596863',1.7);
    shape(p,'M-20 530Q100 508 190 519L255 503 342 507 381 523 461 525 527 563H-20Z',ramp(p,0,497,210,563,[0,'#4f6161'],[.20,'#2b4047'],[1,'#132630']));
  }
  function lampGlow(g,x,y,r,intensity){
    g.save();g.globalAlpha=intensity;
    oval(g,x,y,r*4,r*4,flare(g,x,y,r*4,[0,'#ffc08aa8'],[.26,'#e8955b67'],[1,'#c7774d00']));
    oval(g,x,y,r,r,ramp(g,x-r,y-r,x+r,y+r,[0,'#ffe6a8'],[.27,'#ecac71'],[.72,'#c97854'],[1,'#935744']));
    oval(g,x-r*.26,y-r*.30,r*.26,r*.18,'#ffedbc');g.restore();
  }
  function harborShot(g,t,push=smooth((t-.52)/(beaconCut-.52)),light=.69+.31*smooth((t-1.44)/.68)){
    g.save();camera(g,585,245,1.02+.17*push,-.008*push);
    set(g,'rain-harbor',harborBackdrop);waterLight(g,t);ferry(g,t);rain(g,t,.35,-.22);g.restore();
    g.save();
    g.translate(mix(beacon.x,lampCut.x,push),mix(beacon.y,lampCut.y,push));
    const scale=mix(1,2.85,push);g.scale(scale,scale);g.translate(-beacon.x,-beacon.y);
    set(g,'relay-pier',mastPlate);
    lampGlow(g,beacon.x,beacon.y,6.4,light);g.restore();
    rain(g,t,.41,-.27);
  }

  function radioPose(age){
    const u=smooth((age-beaconCut)/(receiverReady-beaconCut));
    return {x:mix(lampCut.x,825,u),y:mix(lampCut.y,245,u),scale:mix(2.85,1.05,u),roll:mix(-.074,-.027,u)};
  }
  function needleAt(age){
    const t=Math.max(0,age-beaconCut);
    const search=smooth(t/.90),settle=smooth((t-.86)/.94);
    return 3.65+2.18*search-.74*settle+.14*Math.exp(-1.8*t)*Math.sin(16*t)+.012*Math.sin(t*1.8);
  }
  function throughPilot(g,pose){
    g.translate(pose.x,pose.y);g.rotate(pose.roll);g.scale(pose.scale,pose.scale);g.translate(-pilot.x,-pilot.y);
  }
  function reception(g,age){
    if(age<beaconCut){harborShot(g,age);return;}
    const pose=radioPose(age),t=age-beaconCut;
    g.save();rect(g,0,0,WIDTH,HEIGHT,'#1b2a2f');throughPilot(g,pose);
    receiver(g,t,needleAt(age));
    g.restore();
  }
  function tubeWindow(p){
    rect(p,0,0,258,138,'#1b292c');rect(p,3,3,252,130,ramp(p,0,0,64,137,[0,'#152127'],[.53,'#28302e'],[1,'#4f4937']));
    for(const [x,scale] of [[47,.87],[130,1.13],[211,.92]]){
      p.save();p.translate(x,123);p.scale(scale,scale);
      const shell='M-17 -7L-19 -17Q-23 -32 -22 -59Q-21 -76 -15 -82Q-10 -86 -6 -87L-3 -93 1 -94 3 -87Q16 -85 20 -69Q24 -43 20 -20L16 -8Z';
      shape(p,shell,ramp(p,-24,-60,24,-46,[0,'#233434'],[.13,'#627270'],[.26,'#374341'],[.46,'#524736'],[.71,'#4c5144'],[.91,'#788078'],[1,'#344843']),'#93988a',1.1);
      for(let k=0;k<3;k++){
        const px=-10+k*9;
        rect(p,px-2.4,-61,4,38,k===1?'#3b3e39':'#454a42');
        stroke(p,[[px,-11],[px+1,-34],[px+2,-62]],'#b59269',.8);
      }
      for(let y=-62;y<-25;y+=4.5){stroke(p,[[-11,y],[10,y+2.8]],'#9a8c6e',.8);}
      shape(p,'M-18 -37Q-20 -68 -14 -76M13 -75Q19 -64 18 -47',null,'#bbc0a8a8',1.65);
      rect(p,-20,-11,40,7,'#3b3630');rect(p,-20,-10,40,1.6,'#968576');
      for(let k=0;k<5;k++)rect(p,-14+k*7,-4,2.5,6,'#9d896b');p.restore();
    }
    rect(p,5,128,248,2.2,'#8d876d');rect(p,0,0,258,2,'#15292e');
  }
  function receiverInstruments(g,t,angle){
    const locked=smooth((t-.75)/1.14);
    g.save();g.translate(133,224);g.transform(1,-.075,-.025,1,0,0);
    g.drawImage(cached('receiver-valves',258,138,tubeWindow),0,0);
    for(const [x,y] of [[47,85],[130,74],[211,83]]){
      const h=.73+.13*Math.sin(t*4+x*.4)+.09*locked;
      g.save();g.globalAlpha=h;
      oval(g,x,y,22,33,flare(g,x,y,34,[0,'#ffb470a5'],[.44,'#d3783f61'],[1,'#b66a3a00']));
      stroke(g,[[x-7,y+12],[x-5,y-9],[x-3,y+8],[x,y-15],[x+2,y+8],[x+5,y-7],[x+7,y+10]],'#ffc383',1.1);
      g.restore();
    }
    poly(g,[[4,76],[4,50],[92,4],[136,4]],'#cdd4b518');g.restore();
    // The little moving-coil meter and the phosphor display respond to the same moment of lock.
    g.save();g.translate(333,181);g.rotate(-.079);
    const a=mix(-1.94,-1.13,locked)+.22*(1-locked)*Math.sin(t*14)+.035*Math.sin(8*t);
    stroke(g,[[0,23],[Math.cos(a)*45,23+Math.sin(a)*45]],'#a3543d',2);g.restore();
    g.save();g.translate(468,409);g.transform(1,-.081,0,1,0,0);
    rect(g,-104,-26,216,52,'#1d322f');rect(g,-99,-21,206,42,'#182c2c');
    for(let i=-81;i<103;i+=23)rect(g,i,-19,.75,38,'#58756a57');
    for(const y of [-12,0,12])rect(g,-97,y,202,.75,'#58756a57');
    const wave=[];
    for(let i=0;i<=125;i++){
      const u=i/125,packet=(u+t*.24)%1;
      const staticNoise=(Math.sin(u*163+t*17)+.48*Math.sin(u*257-t*11))*5;
      const carrier=11*Math.sin(packet*114)*Math.exp(-Math.pow((packet-.57)/.119,2));
      wave.push([-96+201*u,mix(staticNoise,carrier,locked)]);
    }
    stroke(g,wave,'#80a784',2.6);stroke(g,wave,'#c1d0a1',1);g.restore();
    lampGlow(g,pilot.x,pilot.y,6.4,.83+.17*Math.sin((angle-3.4)*1.25));
  }

  function headlight(g,t){
    // A pair of lamps passes the wet office window and casts slatted light onto the desk.
    const sweep=(t+1.2)%10.4,along=sweep/6.8,x=-240+1150*along,y=230-.063*x;
    const level=smooth(sweep/.85)*(1-smooth((sweep-5.5)/1.32));
    if(level<=0)return;
    g.save();g.globalAlpha=.8*level;g.beginPath();g.rect(0,0,1000,287);g.clip();
    for(const dx of [0,22]){
      oval(g,x+dx,y,58,16,flare(g,x+dx,y,57,[0,'#fce0a8'],[.13,'#d7a473bd'],[.52,'#c490633e'],[1,'#cc975f00']));
      stroke(g,[[x+dx-17,y+1],[x+dx+7,y-.8]],'#eadcb081',1.1);
    }
    g.restore();g.save();g.globalAlpha=.53*level;
    const foot=85+1020*along;
    g.beginPath();g.moveTo(0,391);g.lineTo(1000,288);g.lineTo(1000,563);g.lineTo(0,563);g.closePath();g.clip();
    g.beginPath();for(let i=-3;i<10;i++){
      const yy=315+i*34;
      g.moveTo(-20,yy+46);g.lineTo(1020,yy-49);g.lineTo(1020,yy-38);g.lineTo(-20,yy+62);g.closePath();
    }g.clip();
    rect(g,0,286,1000,277,ramp(g,foot-195,0,foot+195,0,[0,'#e1c18b00'],[.32,'#e1c58f2e'],[.54,'#ead3a072'],[.79,'#cfb58430'],[1,'#c2a67e00']));g.restore();
  }
  const glassRandom=seeded(801);
  const beads=Array.from({length:40},()=>({x:glassRandom()*986,y:glassRandom()*295,r:.8+glassRandom()*2.2,pace:2+glassRandom()*12,phase:glassRandom()*TAU}));
  function wetGlass(g,t){
    g.save();g.beginPath();g.rect(0,0,1000,281);g.clip();
    for(const bead of beads){
      const y=(bead.y+t*bead.pace+Math.sin(t*1.3+bead.phase)*1.7)%294-7,x=bead.x+Math.sin(y*.056+bead.phase)*1.45;
      const r=bead.r;
      stroke(g,[[x+.5,y-4*r],[x-.3,y-2*r],[x,y]],'#bed3c24d',.75);
      oval(g,x,y,r,r*1.35,'#24484c8a');oval(g,x-.34*r,y-.44*r,r*.43,r*.61,'#c1cdb09c');
    }
    g.restore();
  }
  function lastLight(g,age,plate){
    if(age<.58){
      if(plate)g.drawImage(plate,0,0,WIDTH,HEIGHT);
      else if(state.draws.grand)drawOutcome(g,'grand',state.draws.grand,revealSettle,0);
      else roofTake(g,roofRollAt);
      const travel=smooth(age/.56);
      rect(g,0,0,1000,218*travel,'#0a1921');rect(g,0,HEIGHT-(HEIGHT-218)*travel,1000,(HEIGHT-218)*travel,'#0a1921');
      return;
    }
    const unwind=smooth((age-.58)/2.75),light=1-smooth((age-1.92)/1.01);
    harborShot(g,5+Math.min(age,4.5),.67*(1-unwind),light);
    if(age<1.29){
      const cover=1-smooth((age-.58)/.71);
      rect(g,0,0,1000,218*cover,'#0a1921');rect(g,0,HEIGHT-(HEIGHT-218)*cover,1000,(HEIGHT-218)*cover,'#0a1921');
    }
  }


// Handset
  let stageWidth=1000, stageHeight=562.5;
  // Sample one handset and three radio arcs on the LCD's own square-pixel grid.
  function handsetSegments(){
    const grid=bitmap(32,32).getContext('2d'),groups=[[],[],[],[]];
    const handset=new Path2D('M5 4 Q7 2 10 4 L13 10 Q14 12 10 14 Q12 19 18 22 L21 18 Q22 17 25 19 L29 22 Q30 24 27 27 Q25 30 21 28 Q9 25 4 14 Q1 7 5 4Z');
    for(let row=0;row<32;row++)for(let col=0;col<32;col++){
      if(grid.isPointInPath(handset,col+.5,row+.5)){groups[0].push([col,row]);continue;}
      const x=col-16,y=14-row;
      if(x<1||y<1)continue;
      const r=Math.hypot(x,y);
      for(let i=1;i<4;i++)if(Math.abs(r-(i*4+.6))<.85)groups[i].push([col,row]);
    }
    return groups;
  }
  const callSegments=handsetSegments();
  function lcdPixels(g,lid,points,t,pull,alpha,tilt,amplitude){
    if(alpha<=0)return;
    const step=1.65,foot=step*.93,dots=new Path2D(),sn=Math.sin(tilt),cs=Math.cos(tilt);
    for(const [col,row] of points){
      const dx=(col-15.5)*step,dy=(15.5-row)*step;
      const x=mix(dx*cs-dy*sn,dx*1.68,pull),u=clamp((x+43)/86);
      const z=mix(78+dx*sn+dy*cs,85+amplitude*voice(u,t),pull);
      const a=lid(x-foot/2,z+foot/2,2.43),b=lid(x+foot/2,z+foot/2,2.43);
      const c=lid(x+foot/2,z-foot/2,2.43),d=lid(x-foot/2,z-foot/2,2.43);
      dots.moveTo(a[0],a[1]);dots.lineTo(b[0],b[1]);dots.lineTo(c[0],c[1]);dots.lineTo(d[0],d[1]);dots.closePath();
    }
    g.save();g.globalAlpha=alpha;g.fillStyle='#213a2b';g.fill(dots);g.restore();
  }
  function displayLcd(g,lid,t,ringing,age,identify){

    const p=ringing?0:smooth(age/.84),amplitude=3+16*speechLevel(identify?'answer':'roof',age-(identify?.20:.06));
    if(p<1){
      const beat=t%2.85;
      const ring=Math.exp(-((beat-.33)**2)/.028)+.75*Math.exp(-((beat-.70)**2)/.026);
      const tilt=ringing ? .13*ring*Math.sin(28*t) : 0;
      lcdPixels(g,lid,callSegments[0],t,p,1-p*.8,tilt,amplitude);
      for(let i=1;i<4;i++){
        const delay=(i-1)*.095;
        const echo=Math.exp(-((beat-.33-delay)**2)/.034)+.8*Math.exp(-((beat-.70-delay)**2)/.037);
        lcdPixels(g,lid,callSegments[i],t,p,(1-p)*Math.min(1,.14+.86*echo),0,amplitude);
      }
    }
    if(p>0){
      const wave=[];
      for(let i=0;i<=100;i++)wave.push(lid(-43+86*i/100,85+amplitude*voice(i/100,t),2.43));
      g.save();g.globalAlpha=p;stroke(g,wave,'#314c36',1.67);g.restore();
      if(identify){
        const sweep=(t*.48)%1,x=-42+84*sweep;
        g.save();g.globalAlpha=.74*smooth((p-.72)/.28);
        stroke(g,[lid(x,60,2.43),lid(x,80+amplitude*voice(sweep,t),2.43)],'#526e4d',1.05);
        stroke(g,[lid(x-2.1,61,2.43),lid(x,64,2.43),lid(x+2.1,61,2.43)],'#3f583e',1.15);g.restore();
      }
    }
  }


// Street
  // The street is one piece of original scenery. The contact prints and camera lens photograph it again.
  function streetFacade(g,nearX,farX,top,farTop,bottom,farBottom,columns,rows,seed,wall){
    const random=seeded(seed);
    const at=(u,v)=>[mix(nearX,farX,u),mix(mix(top,farTop,u),mix(bottom,farBottom,u),v)];
    poly(g,[at(0,0),at(1,0),at(1,1),at(0,1)],wall);
    for(let row=0;row<rows;row++){
      const v=(row+.13)/rows;
      stroke(g,[at(0,v+.07/rows),at(1,v+.07/rows)],'#91c9c24d',1.25);
      for(let col=0;col<columns;col++){
        const u=(col+.09)/columns,ru=(col+.78)/columns,rv=v+.54/rows;
        const n=random(),color=n>.94?'#e8bc85':n>.81?'#99c9b6':n>.60?'#517d78':n>.28?'#274d54':'#162e39';
        poly(g,[at(u,v),at(ru,v),at(ru,rv),at(u,rv)],color);
        if(n>.83)stroke(g,[at(u,(v+rv)/2),at(ru,(v+rv)/2)],'#354f4e',1.35);
        if(col%3===1 && row%4===0){
          const sill=rv+.14/rows;
          poly(g,[at(u-.15/columns,rv),at(ru+.12/columns,rv),at(ru+.12/columns,sill),at(u-.15/columns,sill)],'#101f28');
          stroke(g,[at(u-.15/columns,rv),at(ru+.12/columns,rv)],'#88978b',1.1);
        }
      }
    }
    for(let i=0;i<=columns;i+=3)stroke(g,[at(i/columns,0),at(i/columns,1)],'#0a1b25',2);
    stroke(g,[at(1,0),at(1,1)],'#769e957a',1.3);
  }
  function streetPlate(g){
    rect(g,0,0,1000,563,ramp(g,0,0,854,491,[0,'#061821'],[.44,'#24565a'],[.68,'#8eaa95'],[1,'#243f4d']));
    rect(g,0,0,1000,420,flare(g,665,233,360,[0,'#f8c394c9'],[.26,'#e1ab794c'],[1,'#eeaa6700']));
    const r=seeded(472510);
    for(let i=0;i<34;i++){
      const x=336+i*13,y=97+r()*149,w=12+r()*19;
      rect(g,x,y,w,315-y,i%4?'#576f70':'#3a6066');
      for(let f=y+5;f<300;f+=8)if(r()>.37)rect(g,x+2,f,w-5,1.2,'#c4bb9777');
    }
    streetFacade(g,315,540,8,118,379,306,8,18,437,'#34535a');
    streetFacade(g,792,665,-31,112,351,290,6,26,430,'#3a5654');
    streetFacade(g,970,786,-101,38,379,343,8,21,308,'#253e43');
    streetFacade(g,1054,948,-110,-34,393,376,6,18,812,'#142f38');
    streetFacade(g,-36,278,-235,-9,455,371,10,16,18,'#193740');
    streetFacade(g,292,404,-21,63,371,335,6,17,560,'#203f47');
    // A pair of bent neon tubes, their metal returns and the sign's wall brackets.
    for(const [x,y] of [[148,56],[145,184]]){stroke(g,[[61,y+4],[x,y]],'#0b222b',6);stroke(g,[[73,y+28],[x,y]],'#263e45',3);}
    poly(g,[[139,29],[187,35],[180,248],[131,258]],'#17232b','#395155',2);
    const tubing=[[149,45],[175,49],[171,227],[144,234],[149,45]];
    g.save();g.shadowColor='#ff5c45';g.shadowBlur=20;stroke(g,tubing,'#de4639',8);g.restore();
    stroke(g,tubing,'#ffa071',3.5);
    stroke(g,[[155,62],[152,209]],'#ff624b',3.5);
    for(const [x,y,w] of [[285,179,31],[413,223,30],[774,178,81],[854,244,134]]){
      poly(g,[[x,y],[x+w,y-4],[x+w,y+7],[x,y+10]],'#071e29');
      g.save();g.shadowBlur=8;g.shadowColor='#64e4ce';stroke(g,[[x+3,y+5],[x+w-3,y+1]],'#80cbbb',2.8);g.restore();
    }
    shape(g,'M0 267L191 287 256 284 289 301 403 290 431 310 537 294V344L0 465Z','#122831');
    for(let i=0;i<16;i++){
      const x=12+i*31,y=313+(505-x)*.10;
      rect(g,x,y,19,18+i%3*4,i%5?'#2c4547':'#a27f62');
      stroke(g,[[x-4,y+26],[x+21,y+24]],'#78918470',1.2);
    }
    // Corrugated awning and a small shop spill a warm band of light onto the pavement.
    poly(g,[[-33,251],[89,266],[119,286],[-21,284]],'#18383b','#5b8780',1.4);
    for(let j=0;j<12;j++)stroke(g,[[j*10-19,256+j],[j*12-20,283]],'#89a09552',1.35);
    rect(g,0,306,78,61,ramp(g,0,306,70,367,[0,'#655349'],[.32,'#c69a73'],[.72,'#9b7259'],[1,'#4c5250']));
    for(const x of [7,29,61])rect(g,x,303,3,68,'#273c42');
    stroke(g,[[0,372],[78,365]],'#d7a270',2.2);
    for(const x of [201,238]){
      stroke(g,[[x,0],[x+2,73],[x-3,78],[x-3,245],[x-9,250],[x-8,291]],'#263d43',3.8);
      stroke(g,[[x+1,80],[x+1,240]],'#78a099',.9);
    }
    poly(g,[[0,454],[554,292],[665,284],[1000,381],[1000,563],[0,563]],ramp(g,510,286,515,563,[0,'#899487'],[.13,'#41616a'],[.5,'#163b48'],[1,'#091e2b']));
    g.save();g.beginPath();g.moveTo(0,454);g.lineTo(554,292);g.lineTo(665,284);g.lineTo(1000,381);g.lineTo(1000,563);g.lineTo(0,563);g.closePath();g.clip();
    for(const [x,y,width,height,light] of [[179,478,112,155,'#ef66576b'],[75,520,91,74,'#db9c6e61'],[824,448,98,132,'#72c6ae56']]){
      g.save();g.translate(x,y);g.scale(width/height,1);oval(g,0,0,height,height,flare(g,0,0,height,[0,light],[.43,light.slice(0,7)+'25'],[1,light.slice(0,7)+'00']));g.restore();
    }
    g.restore();
    for(let i=0;i<1700;i++){
      const z=r(),y=296+z*275,origin=[130,268,445,630,815,935][i%6];
      const x=mix(611,origin,z*1.65)+(r()-.5)*(48+135*z),w=1+r()*(3+32*z);
      if(x<0||x>1000)continue;
      rect(g,x,y,w,.5+r()*1.5,z>.35&&i%6===0?'#f0806581':i%7===0?'#e5bd8b79':i%3?'#78b9b349':'#0e26394d');
    }
    for(const [end,shade] of [[-177,'#ecb49b'],[-138,'#4c7a7b'],[480,'#bac8a6'],[517,'#31545a']]){
      stroke(g,[[615,291],[end,563]],'#102b36',4.5);stroke(g,[[615,291],[end,563]],shade,1.5);
    }
    for(const [y,w] of [[381,59],[412,91],[455,142],[504,178]]){
      const x=944-(y-370)*.68;poly(g,[[x,y],[x+w*.64,y-9],[x+w*.91,y-6],[x+14,y+6]],'#adbbab53');
    }
    shape(g,'M-30 40Q308 131 634 188Q873 170 1035 140M213 -18Q415 95 637 186M391 -26Q506 104 638 184',null,'#132a32',1.65);
    for(const [x,y] of [[266,100],[415,142],[827,177]]){
      shape(g,'M'+x+' '+y+'q7 17 13 0',null,'#20363c',1.2);
    }
  }
  function streetImage(){return cached('neon-street',1000,563,streetPlate);}
  function pedestrian(g,t){
    const step=Math.sin(t*4.1),lift=Math.cos(t*8.2)*1.15;
    g.save();g.translate(0,lift);
    // A coat, hand and folded collar remain readable as silhouettes through the viewfinder.
    stroke(g,[[1,-72],[14,-38],[20+step*13,-7]],'#0d202b',8.4);
    stroke(g,[[-6,-66],[-10,-36],[-12-step*12,-4]],'#192c34',8.6);
    stroke(g,[[18+step*13,-5],[27+step*13,-3]],'#0b1b24',5.5);
    stroke(g,[[-15-step*12,-3],[-4-step*12,-2]],'#12232c',5.4);
    g.drawImage(witnessHead(true),-15,-127,35,39);
    shape(g,'M-5 -96L7 -92L12 -83L17 -57L24 -38L19 -31L-3 -28L-24 -33L-17 -46L-23 -46L-15 -80Z',ramp(g,-19,-72,20,-49,[0,'#18333d'],[.48,'#32494c'],[.78,'#334444'],[1,'#182f38']),'#152733',1.25);
    shape(g,'M-12 -89L-3 -98L7 -92L2 -86L9 -80L3 -78L-2 -57Z',ramp(g,-10,-96,8,-66,[0,'#86938a'],[.45,'#56665f'],[1,'#2d4649']));
    shape(g,'M-15 -83Q-16 -88 -10 -92Q-5 -93 -1 -92L-6 -87',null,'#a0aa9882',1.1);
    shape(g,'M8 -83Q11 -70 7 -55M-17 -45Q-10 -42 -5 -44M11 -45L16 -41',null,'#1a353c',1.15);
    for(const y of [-66,-57,-48])oval(g,4,y,.72,.8,'#999788');
    shape(g,'M-12 -88Q-19 -75 -18 -62L-23 -39M-9 -56L-17 -31M9 -56L19 -34',null,'#7b908680',1.2);
    shape(g,'M8 -88Q11 -82 13 -73L17 -61L14 -57Q12 -65 8 -68Z','#1b343c');
    shape(g,'M-9 -56L-15 -49L-12 -47L-5 -54M9 -48L16 -43M-3 -30L1 -38L3 -46',null,'#132b359e',.95);
    shape(g,'M-14 -81Q-20 -71 -15 -65L-8 -67M9 -70Q11 -62 14 -60M-8 -49L-4 -53',null,'#99a79980',.68);
    shape(g,'M-11 -86Q-17 -83 -18 -73L-19 -64Q-18 -61 -14 -59L-7 -53L-2 -57L-11 -67L-8 -78Z',ramp(g,-19,-83,-1,-56,[0,'#536460'],[.48,'#2b4146'],[1,'#455954']),'#34484c',.62);
    shape(g,'M-7 -54L-2 -57L0 -55L-3 -51Z','#998b72');
    shape(g,'M-10 -49L-1 -56L1 -55L-8 -48Z','#1c313b','#73837b',.55);
    g.restore();
  }
  function rainyWalker(g,x,y,scale,t,facing=1){
    g.save();g.translate(x,y);g.scale(scale*facing,scale);
    g.save();g.beginPath();
    for(let i=0;i<19;i++)g.rect(-94,i*3.9,188,2.8+(i%3)*.32);
    g.clip();g.scale(1,-.39);g.globalAlpha*=.28;pedestrian(g,t);g.restore();
    pedestrian(g,t);g.restore();
  }
  function cityRain(g,t){
    g.save();camera(g,634,262,1.014+.026*Math.sin(t*.48),-.012);
    g.drawImage(streetImage(),0,0,WIDTH,HEIGHT);
    const light=clamp((Math.sin(t*.84)+1)*.5),glow=.42+.27*light;
    g.save();g.globalCompositeOperation='screen';g.globalAlpha=glow;
    rect(g,0,0,480,458,flare(g,152,155,185,[0,'#ff643a75'],[.37,'#df40333a'],[1,'#c2363100']));
    const x=575+59*Math.sin(t*.72-.6),y=307-Math.sin(t*.72-.6)*3;
    for(const dx of [0,20]){
      oval(g,x+dx,y,30,12,flare(g,x+dx,y,30,[0,'#ffe1a6'],[.24,'#eb9e5d99'],[1,'#bb664300']));
      stroke(g,[[x+dx,y],[x+dx-67,y+175]],'#e0bd7b4f',3);
    }
    g.restore();
    rainyWalker(g,306+38*Math.sin(t*.62),421,.91,t);
    rain(g,t,.85,-.29);
    for(let i=0;i<13;i++){const z=(i*17%13)/13;ripple(g,46+(i*167)%910,376+z*176,(t*.68+i*.173)%1,7+z*19);}
    g.restore();
  }
  function tramBody(p){
    rect(p,0,0,1420,563,ramp(p,0,0,100,563,[0,'#0a242e'],[.2,'#4e6865'],[.46,'#153b41'],[.71,'#234340'],[1,'#071b26']));
    for(const [top,height] of [[8,142],[222,162]]){
      for(let i=0;i<13;i++){
        const x=i*112-18;rect(p,x,top,101,height,'#0c242c');
        rect(p,x+5,top+5,90,height-10,ramp(p,x,top,x+72,top+height,[0,'#d9ba8c'],[.39,'#a49f83'],[.8,'#627f77'],[1,'#375956']));
        const sx=x+28+(i*11)%44,sy=top+height*.64;
        oval(p,sx,sy,11+(i%3),15,'#384b4a',-.14);
        shape(p,'M'+(sx-23)+' '+(top+height-7)+'Q'+(sx-21)+' '+(sy+13)+' '+sx+' '+(sy+11)+'Q'+(sx+13)+' '+(sy+12)+' '+(sx+23)+' '+(top+height-7)+'Z','#354a48');
        poly(p,[[x+7,top+18],[x+6,top+57],[x+78,top+5],[x+30,top+5]],'#eef3d025');
        rect(p,x+47,top+5,3,height-10,'#566966');
      }
    }
    rect(p,0,169,1420,11,'#d7bc92');rect(p,0,182,1420,3,'#a5634c');
    rect(p,0,399,1420,5,'#a2b39d');rect(p,0,416,1420,118,ramp(p,0,414,0,534,[0,'#204442'],[.66,'#172f34'],[1,'#19313a']));
    for(let k=0;k<5;k++)rect(p,0,447+k*15,1420,1,'#63857b4f');
    for(let x=46;x<1420;x+=112)rect(p,x,432,1.2,95,'#75948558');
  }
  const streetCut=1.72;
  function openingStreet(g,age){
    if(age<streetCut)cityRain(g,age);
    else reception(g,age-streetCut);
    if(age<.73||age>2.49)return;
    const x=mix(1075,-1480,(age-.73)/1.76);
    g.save();g.translate(x,0);g.drawImage(cached('crossing-tram',1420,563,tramBody),0,0);
    rect(g,0,0,1420,563,ramp(g,0,0,1420,86,[0,'#0d1b2699'],[.44,'#0b1b240a'],[.88,'#142b2b30'],[1,'#06141e97']));g.restore();
  }


// Rooftop
  // The pilot light on the closed handset cuts to a practical lamp in the lift.
  const liftArrival=3.48,spliceAt=1.16,lampX=546,lampY=64;
  let coverLampAxis=null;
  function rounded(g,x,y,w,h,r,fill,edge,width=1){
    g.beginPath();g.roundRect(x,y,w,h,r);
    if(fill){g.fillStyle=fill;g.fill();}
    if(edge){g.strokeStyle=edge;g.lineWidth=width;g.stroke();}
  }
  function liftLeaf(right){
    const w=350,h=432,port=right?116:246;
    return cached(right?'lift-leaf-r':'lift-leaf-l',w,h,p=>{
      const light=right?72:248;
      rect(p,0,0,w,h,ramp(p,0,-25,w,70,[0,right?'#716952':'#293e40'],[.11,'#55605a'],[.28,'#697169'],[.47,'#4b5754'],[.77,'#334646'],[.91,right?'#3c4743':'#686e61'],[1,right?'#263a3a':'#454d44']));
      rect(p,0,0,w,h,ramp(p,0,0,0,h,[0,'#122326c8'],[.14,'#26363030'],[.45,'#d5b47726'],[.66,'#8a93840e'],[.91,'#132d3489'],[1,'#18252b']));
      const rnd=seeded(right?3721:1313);
      for(let i=0;i<2350;i++){
        const x=rnd()*w,y=rnd()*h;
        rect(p,x,y,2+rnd()*40,.22+rnd()*.54,i%3?'#d3c5a521':'#152c304a');
      }
      for(const y of [319,363,407]){
        rect(p,2,y,w-4,2,'#26363896');rect(p,2,y+2,w-4,.8,'#b9b9a16c');
      }
      // Beaded moulding, gasket and a through-cut for the actual moving view behind the wired glass.
      rounded(p,port-10,51,84,192,28,'#213333','#909286',1.8);
      rounded(p,port-7,54,78,186,26,ramp(p,port-7,138,port+72,148,[0,'#424d45'],[.15,'#b8ad8f'],[.28,'#595e50'],[.70,'#35423e'],[.91,'#adad96'],[1,'#46534b']));
      rounded(p,port-3,58,70,178,22,'#14282c','#c2bba136',1.2);
      p.save();p.globalCompositeOperation='destination-out';rounded(p,port,61,64,172,20,'#000');p.restore();
      p.save();p.beginPath();p.roundRect(port,61,64,172,20);p.clip();
      rect(p,port,60,64,174,ramp(p,port,61,port+59,234,[0,'#88acaa65'],[.31,'#354c4d3b'],[.65,'#758a8162'],[1,'#142c2f70']));
      for(let i=-21;i<22;i++){
        const dx=port+i*13.5;
        for(const dir of [-1,1]){
          stroke(p,[[dx,57],[dx+dir*120,238]],'#10282bb0',1.5);
          stroke(p,[[dx+.75,57],[dx+dir*120+.75,238]],'#b6c2ac66',.55);
        }
      }
      poly(p,[[port-4,81],[port+66,151],[port+66,170],[port-4,98]],'#f0ddab13');
      p.restore();
      for(const y of [58,236])for(const x of [port-2,port+66]){
        oval(p,x,y,1.7,1.7,'#243636',0,'#a3a897',.6);
        stroke(p,[[x-.8,y+.8],[x+.8,y-.8]],'#9d9b87',.65);
      }
      for(let i=0;i<42;i++){
        const x=light-96+rnd()*172,y=257+rnd()*98;
        stroke(p,[[x,y],[x+1+rnd()*12,y-1-rnd()*3]],i%3?'#d2c7a844':'#1f393b66',.55);
      }
      if(right){
        rect(p,6,0,91,h,ramp(p,6,0,97,0,[0,'#35423f'],[.07,'#adb09b'],[.18,'#778a80'],[.52,'#899489'],[.83,'#c1bda4'],[.98,'#5b6c65'],[1,'#3a4e4c']));
        stroke(p,[[96,0],[92,432]],'#d2cbb070',1.35);
      }
      const edge=right?1:w-4;
      rect(p,edge,0,3,h,'#161f24');rect(p,edge+(right?3:-1),0,1,h,'#c3c2a7');
    });
  }
  function elevatorFrame(p){
    const left=[[0,0],[200,78],[200,522],[0,568]],right=[[895,78],[1000,35],[1000,563],[895,522]];
    poly(p,left,ramp(p,-10,125,220,163,[0,'#15282f'],[.18,'#304445'],[.52,'#697265'],[.78,'#444e46'],[1,'#1d3336']));
    poly(p,right,ramp(p,896,40,1014,74,[0,'#1f3235'],[.2,'#77776a'],[.71,'#414c49'],[1,'#182e32']));
    p.save();p.beginPath();p.moveTo(0,0);for(const point of left.slice(1))p.lineTo(...point);p.closePath();p.clip();
    for(let i=0;i<11;i++){
      const x=6+i*20;stroke(p,[[x,0],[x,563]],i%3?'#d5c9a518':'#142a315e',i%3?.8:2.5);
    }
    const bracket=ramp(p,0,315,0,335,[0,'#b7b9a3'],[.19,'#d0cdb0'],[.42,'#8e9585'],[.64,'#455553'],[1,'#233b3f']);
    poly(p,[[-10,327],[162,315],[164,320],[-10,341]],'#17282e');
    poly(p,[[-10,318],[163,310],[165,316],[-10,330]],bracket,'#394c4f',1.5);
    p.restore();
    poly(p,[[0,0],[1000,0],[1000,37],[895,98],[196,98],[0,18]],ramp(p,0,0,0,102,[0,'#0b1a20'],[.33,'#283c40'],[.69,'#434c46'],[1,'#202d2c']));
    for(const x of [49,119,937])stroke(p,[[x,0],[x<500?x+167:x-74,88]],'#9ba38b4d',1.25);
    // An inset tungsten ceiling tube supplies the warm bounce on both door leaves.
    shape(p,'M162 1H781L756 19H218Z','#17262a','#70786c',1.2);
    shape(p,'M185 2H765L749 12H216Z','#d1c1a2');
    shape(p,'M202 2H755L748 7H217Z','#f2dfb7');
    for(let i=0;i<19;i++){const x=205+i*28;stroke(p,[[x,1],[x+3,12]],'#7d807878',.9);}
    for(const x of [183,894]){
      rect(p,x,90,13,440,ramp(p,x,40,x+13,40,[0,'#192b30'],[.32,'#808779'],[.52,'#a7aa92'],[.64,'#3e4e4a'],[1,'#293b3d']));
    }
    rect(p,194,94,703,5,'#b3b09a');rect(p,196,98,698,4,'#1c3032');
    poly(p,[[0,565],[192,519],[898,519],[1000,559],[1000,565]],ramp(p,0,514,0,563,[0,'#a5aa99'],[.24,'#535e59'],[.63,'#26383d'],[1,'#23373c']));
    for(let i=0;i<5;i++)stroke(p,[[183-i*10,523+i*2.8],[908+i*5,523+i*2.8]],i%2?'#b6b4a0':'#15292f',i%2?.9:2.0);
    rounded(p,lampX-44,lampY-11,88,22,9,'#1a272a','#9a9782',1.25);
    rounded(p,lampX-36,lampY-6,72,11.5,4.5,'#77352f','#a76b55',1.1);
    rounded(p,lampX-32,lampY-3.5,64,7,3,'#c4533d');
    stroke(p,[[lampX-29,lampY-1],[lampX+29,lampY-1]],'#f6b484',1.65);
    for(let x=lampX-28;x<=lampX+28;x+=3.5)rect(p,x,lampY-3.5,.7,7,'#582b2a94');
    // A worn control plate catches a little of the overhead light, outside the audience's eyeline.
    poly(p,[[81,203],[118,210],[118,274],[81,271]],'#293b3e','#929788',1.1);
    for(const y of [225,250]){
      oval(p,100,y,7.4,8.1,'#1d3135',-.12,'#a5a68f',1.25);
      const direction=y===225?1:-1;
      stroke(p,[[97,y+direction],[100,y-2*direction],[103,y+direction]],y===225?'#daae77':'#6a7c75',1.2);
    }
  }
  function shaftWall(g,distance){
    rect(g,181,91,727,441,ramp(g,200,0,865,0,[0,'#19292f'],[.34,'#32494d'],[.64,'#1c3238'],[1,'#182b35']));
    for(let row=-2;row<=4;row++){
      const y=98+row*148+distance%148;
      rect(g,196,y,702,11,'#111f28');rect(g,193,y+12,710,3,'#617570');
      for(const x of [408,581]){
        rect(g,x,y+32,107,37,'#26383b');rect(g,x+4,y+36,97,26,'#ad8f66');
        rect(g,x+5,y+39,92,9,'#d7ba89');rect(g,x+45,y+33,6,35,'#34494b');
      }
    }
  }
  function carFront(g,opening,travel=0,roofTime=null){
    const slide=342*opening;
    g.save();g.beginPath();g.rect(194,96,704,431);g.clip();
    for(const right of [false,true]){
      const x=right?lampX+slide:lampX-350-slide;
      g.drawImage(liftLeaf(right),x,98);
      if(right&&roofTime!==null&&opening>0){
        g.save();g.translate(x,98);g.globalAlpha*=smooth(opening/.30);
        silhouetteTerrace.mirror(g,roofTime,opening);g.restore();
      }
      // Light from the shaft passes down the metal as well as behind the wired windows.
      if(travel>0){
        const spot=140+(travel%148),col=right?x+122:x+237;
        g.save();g.globalAlpha=.20*Math.min(1,travel/48);
        rect(g,col-57,spot-45,177,90,flare(g,col+23,spot,100,[0,'#fbbe747d'],[.5,'#dfab6845'],[1,'#cf9c6c00']));g.restore();
      }
    }
    g.restore();g.drawImage(cached('lift-cabin',1000,563,elevatorFrame),0,0,WIDTH,HEIGHT);
  }
  function leavingOffice(g,age,t,plate){
    const hangup=3.95;
    if(age>=hangup){liftToRoof(g,age-hangup,t);return;}
    const pulse=speechLevel('roof',age-.06),end=smooth((age-3.45)/.5);
    g.save();camera(g,640,287,1.08-.08*smooth(age/1.05));
    officePhone(g,t,129,1,false,age,false);g.restore();
    if(pulse>.03){
      g.save();g.globalAlpha=pulse*.18;rect(g,0,0,1000,563,flare(g,659,318,285,[0,'#b5cb8b38'],[1,'#73907900']));g.restore();
    }
    if(end>0){g.save();g.globalAlpha=end*.13;rect(g,0,0,1000,563,'#13252c');g.restore();}
    if(plate&&age<.45){g.save();g.globalAlpha=1-smooth(age/.45);impressions(g,plate);g.restore();}
  }
  function liftToRoof(g,age,t){
    if(age>=liftArrival){
      const plate=cached('lift-at-stop',1000,563,p=>{silhouetteTerrace.draw(p,0);carFront(p,0);});
      g.drawImage(plate,0,0,WIDTH,HEIGHT);return;
    }
    if(age<spliceAt){
      const source=cached('folding-handset-frame',1000,563,()=>{}),p=source.getContext('2d');
      p.setTransform(1,0,0,1,0,0);
      const fold=smooth((age-.17)/.48),spring=age>.65?4.1*Math.exp(-20*(age-.65))*Math.sin(32*(age-.65)):0;
      officePhone(p,t,Math.max(.4,mix(129,.4,fold)+spring),1,false,3,false);
      const u=smooth((age-.66)/(spliceAt-.66));
      g.save();
      if(u>0&&coverLampAxis){
        const [a,b]=coverLampAxis,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
        const zoom=Math.pow(171/Math.hypot(b.x-a.x,b.y-a.y),u);
        g.translate(mix(mx,500,u),mix(my,229,u));g.rotate(-Math.atan2(b.y-a.y,b.x-a.x)*u);
        g.scale(zoom,zoom);g.translate(-mx,-my);
      }
      g.drawImage(source,0,0,WIDTH,HEIGHT);g.restore();

      return;
    }
    const pull=smooth((age-spliceAt)/1.06),ride=clamp((age-spliceAt)/(liftArrival-spliceAt));
    const travel=692*(1-(1-ride)**1.73),outside=smooth((ride-.72)/.24);
    g.save();g.translate(mix(500,lampX,pull),mix(229,lampY,pull));
    const zoom=mix(171/64,1,pull);g.scale(zoom,zoom);g.translate(-lampX,-lampY);
    if(outside>0)silhouetteTerrace.draw(g,0);
    if(outside<1){g.save();g.globalAlpha=1-outside;shaftWall(g,travel);g.restore();}
    carFront(g,0,outside<1?travel*(1-outside):0);g.restore();
  }

  const roofFootStart=.68,roofFootStop=3.38;
  const roofFootfalls=[.27,.58,.85,1].map(beat=>mix(roofFootStart,roofFootStop,beat));
  let liveRoofAge=0,roofRollOrigin=roofRollAt;
  const silhouetteTerrace=(()=>{
    const ease = (t, from, to) => smooth((t - from) / (to - from));

// Animated outlines must not enter the static path cache.
function movingShape(g, d, fill, edge = null, width = 1) {
  const path = new Path2D(d);
  if (fill) { g.fillStyle = fill; g.fill(path); }
  if (edge) { g.strokeStyle = edge; g.lineWidth = width; g.stroke(path); }
}

function backgroundHarbor() {
  return cached('stage-harbor', 1000, 563, midnightHarbor);
}

function aggregate(p, seed, count, top, height, palette) {
  const r = seeded(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * 1030 - 15, y = top + r() * height;
    const size = .25 + 1.1 * r();
    p.fillStyle = palette[i % palette.length];
    p.fillRect(x, y, size * (1 + 1.1 * r()), size);
  }
}

function floorRings(g, t, dropsOnFloor, tint) {
  g.save();
  g.lineCap = 'round';
  for (const d of dropsOnFloor) {
    const age = ((t + d.phase) / d.interval) % 1;
    if (age > .8) continue;
    const u = age / .8;
    g.globalAlpha = Math.sin(Math.PI * Math.sqrt(u)) * d.opacity;
    g.strokeStyle = tint;
    g.lineWidth = .55 + .5 * (1 - u);
    g.beginPath();
    g.ellipse(d.x, d.y, 1 + d.size * u, .6 + d.size * d.flat * u, -.03, .12, 4.1);
    g.stroke();
    g.beginPath();
    g.ellipse(d.x, d.y, 1 + d.size * u * .79, .4 + d.size * d.flat * u * .79, -.03, 4.25, 6.22);
    g.stroke();
  }
  g.restore();
}

function scatteredDrops(seed, count, y0, y1, maxSize) {
  const r = seeded(seed);
  return Array.from({length:count}, () => ({
    x:r() * 1040 - 20, y:mix(y0, y1, r()), phase:r() * 8, interval:1 + r() * 2,
    size:5 + r() * maxSize, flat:.12 + r() * .13, opacity:.11 + r() * .29
  }));
}

const clothes = {
  night: {far:'#152630', leg:'#253b43', boot:'#14252d', sole:'#405051', coat:'#30434a', side:'#233740', fold:'#496066', hair:'#182b34', skin:'#37454a', hand:'#52605d', piping:'#9ba69888'},
  submerged: {far:'#183038', leg:'#233b41', boot:'#192d35', sole:'#475956', coat:'#2a4145', side:'#20373f', fold:'#354d4e', hair:'#1b313a', skin:'#30464b', hand:'#3d5151', piping:'#78928a5e'},
  ink: {far:'#172a33', leg:'#192c35', boot:'#172a32', sole:'#354746', coat:'#1a2c34', side:'#152730', fold:'#263a40', hair:'#162830', skin:'#213138', hand:'#26373c', piping:'#8c8f7566'},
  shade: {far:'#14262a', leg:'#14262a', boot:'#14262a', sole:'#14262a', coat:'#14262a', side:'#14262a', fold:'#14262a', hair:'#14262a', skin:'#14262a', hand:'#14262a', piping:null}
};

function head(g, x, y, yaw, tied, palette, tilt = 0, profile = null) {
  g.save(); g.translate(x, y); g.rotate(tilt); g.scale(.93,.91);
  if(profile){profile(g,tied,palette);g.restore();return;}
  if (tied) {
    const knotX = -10.4 * yaw;
    oval(g,knotX,-12.2,6.4,5.9,palette.hair,-.2);
  }
  const front = Math.abs(yaw);
  g.scale(yaw < 0 ? -1 : 1, 1);
  movingShape(g,`M-10 -23 C-11 -33 -4 -39 2 -37 C9 -36 11 -30 10.4 -25
    Q10 -22 ${10.4+front} -20 L${10.6+4.2*front} -15.8 Q${12.2+front} -14 ${10.3+front} -14
    C10 -11.2 10.6 -8 8 -6.8 Q6.2 -4.8 3.2 -5.3 Q2 -1 5 6.2 L-7 7 L-8 -7.8 Q-12 -15 -10 -23Z`,palette.skin);
  const edge = 5.3 + 4.6 * (1 - front);
  movingShape(g, tied
    ? `M-10.2 -5 Q-9 -12 -12 -17 C-15 -25 -11 -34 -4 -37 C2.8 -40.5 11 -35.6 11.9 -28.3
       Q10.4 -29 9.5 -30 C9.2 -23 ${edge} -21 ${edge-1} -15 Q3 -7 -2 -4 L-6 -6 L-7 -3Z`
    : `M-10.5 -4 C-10.1 -10 -13.2 -13 -12.8 -17 C-15 -22 -14 -28 -11.5 -32
       L-12.8 -31 Q-9 -37 -4 -37.4 Q1.9 -40.2 6 -37.2 Q12.5 -35.7 12 -29 L10 -30
       Q9.5 -25 ${edge} -21 L${edge-1.5} -15 Q2 -8 -3.6 -6 L-5 -7 L-8 -4Z`,palette.hair);
  if (palette.piping) shape(g,'M-10 -31.5 Q-6.2 -36.6 -.4 -37.1',null,palette.piping,.64);
  g.restore();
}

function leg(g, hip, knee, ankle, palette, near) {
  const [h, hy] = hip, [k, ky] = knee, [a, ay] = ankle;
  movingShape(g,`M${h-8.1} ${hy} Q${h-9.4} ${hy+13} ${k-7.1} ${ky-7}
    Q${k-8.5} ${ky-1} ${k-6.2} ${ky+4} Q${k-5.8} ${ky+15} ${a-5.9} ${ay-8}
    L${a-6.8} ${ay-4.5} Q${a-.8} ${ay-1.5} ${a+5.6} ${ay-4.4} L${a+4.9} ${ay-8.6}
    Q${k+7.1} ${ky+17} ${k+6.7} ${ky+2} Q${k+7.5} ${ky-7} ${h+8.3} ${hy+1}Z`,near?palette.leg:palette.far);
  if(near && palette.piping) movingShape(g,`M${k-4.5} ${ky-.7} l5 2.1 -3.3 .1 M${a-4.3} ${ay-7} l7.1 1.2`,null,palette.sole,.66);
  g.save(); g.translate(a,ay);
  shape(g,'M-4.9 -5 Q-.5 -4.6 4.7 -6.8 L6.6 -4.1 Q9 -2 14.7 -1.7 Q18.3 -.6 17.4 1.6 Q11.6 3.1 5 2.6 L.3 2.1 L-5.2 2.9 Q-6.6 1.6 -4.9 -5Z',palette.boot);
  if (palette.piping) shape(g,'M-4.7 2.5 L.1 1.9 Q10.5 3.4 17.3 1.6',null,palette.sole,.85);
  g.restore();
}

function shortJacket(g, pose, t, p) {
  const turn = pose.turn, rest = pose.rest;
  const weight = 2.9 * turn;
  leg(g,[-5,-91],[-8.5,-48],[-15,0],p,false);
  leg(g,[6,-91],[8+weight,-49],[10,0],p,true);
  g.save();
  if (pose.glance !== undefined) {
    // Pivot the jacket at the hips. The nearer shoulder follows the head and the feet stay planted.
    g.translate(weight*.72,-89-.45*Math.sin(t));
    g.transform(.87+.17*Math.sin(Math.PI*turn),.022*(1-2*turn),.14-.24*turn,1,0,0);
    g.translate(0,89);
    turningHead(g,3+2*rest,-155,pose.glance,p,pose.profile);
  } else {
    g.translate(weight, -.55 * Math.sin(t) - turn);
    g.rotate(-.047 + .065 * turn);
    head(g,3+2*rest,-155,pose.look ?? (-.83+.99*rest),false,p,.045 + rest*.047);
  }
  shape(g,`M-5 -156 L3 -160 L13 -153 L19 -146 C21 -138 15 -124 14 -113 Q14 -97 17 -88
    Q11 -84 2 -85 L-6 -87 L-20 -85 Q-24 -86 -23 -90 L-18 -109 Q-20 -124 -24 -132
    C-25 -141 -21 -147 -15 -150Z`,p.coat);
  shape(g,`M-16 -148 Q-25 -141 -23 -132 L-17 -111 L-18 -99 L-14 -91 L-8 -92 L-8 -98
    Q-10 -104 -9 -112 L-12 -130 Q-11 -139 -7 -145Z`,p.side);
  shape(g,'M-20 -129 Q-15 -119 -13 -113 L-10 -103 L-7 -104 L-9 -117Z',p.fold);
  shape(g,'M-10 -152 L-5 -158 Q1 -156 7 -155 L12 -151 L6 -148Z',p.fold);
  if (p.piping) {
    shape(g,'M-5.7 -157.5 Q-.7 -156.6 5 -155.3 M-20 -144 Q-22 -140 -22 -137',null,p.piping,.85);
    shape(g,'M-17 -89 Q-10 -90 -5 -89 M4 -88 L11 -89',null,p.piping,.65);
  }
  const elbowX=mix(19,29,rest), elbowY=mix(-117,-110,rest);
  const handX=mix(4,53,rest), handY=mix(-104,-111,rest);
  movingShape(g,`M9 -148 C15 -151 20 -146 20.2 -139 Q19 -129 ${elbowX+3.5} ${elbowY-3.8}
    Q${elbowX+5.7} ${elbowY-1.5} ${handX+1} ${handY-3.2} L${handX+2} ${handY+2.6}
    Q${elbowX-1} ${elbowY+5.4} ${elbowX-3} ${elbowY+3.2} Q9 -119 10 -133 Q8 -139 9 -148Z`,p.side);
  movingShape(g,`M${handX} ${handY-2.4} Q${handX+3.3} ${handY-4} ${handX+5} ${handY-2.7}
    L${handX+7} ${handY-.6} L${handX+6.3} ${handY+1.5} L${handX+1.4} ${handY+2.4}Z`,p.hand);
  if(p.piping) movingShape(g,`M17 -139 Q16 -128 ${elbowX} ${elbowY-.5} Q${elbowX+2} ${elbowY+.8} ${handX-1.7} ${handY-.2}`,null,p.piping,.56);
  g.restore();
}

function turningHead(g,x,y,glance,p,profile) {
  const yaw=2*glance-1,l=Math.max(0,-yaw),r=Math.max(0,yaw);
  g.save();g.translate(x+2.2*yaw,y+1.6*Math.sin(Math.PI*glance));g.rotate(.10-.18*glance);g.scale(.94,.92);
  if(profile){profile(g,false,p);g.restore();return;}
  movingShape(g,`M-7 -32 C-2 -40 7 -39 10.1 -32 Q13 -27 10.8 -22
    Q11 -19 ${10.8+4*r} -16 Q${11.1+1.5*r} -14.5 10.8 -14 Q10 -7.4 6.7 -6.5
    L3.6 -4.7 L5.2 5.8 L-6 6.3 L-6.4 -5 Q-10 -6 -10.5 -12.8
    L${-11-1.2*l} -14.2 Q${-13-2.4*l} -15.4 ${-11.3-1.2*l} -18 Q-11 -20 -11.5 -24 Q-12 -29 -7 -32Z`,p.skin);
  movingShape(g,`M-12 -23 C-14 -29 -10 -35 -4.8 -37.1 Q1.4 -40.2 6 -36.9 Q11 -35 12 -29.8
    L10.8 -30.5 Q${11.7-4*r} -21 ${10.1-6.1*r} -13 Q${8-2*r} -8 3 -5
    L1.4 -6 L-.3 -3.8 L-2.2 -5.4 L-4.3 -3.9 Q${-10+5*l} -7.6 ${-11+6.1*l} -13
    Q${-12+4.6*l} -19 -12 -23Z`,p.hair);
  if(p.piping)shape(g,'M-8.6 -33.9 Q-4.5 -37.7 -.9 -37.5',null,p.piping,.7);
  g.restore();
}

// Each stride has a planted foot. The last, shorter stride brings the coat to rest.
function walk(t, from, to, start, end, scale, facing) {
  const u = clamp((t-start)/(end-start));
  const a1=ease(u,0,.27), b1=ease(u,.25,.58), a2=ease(u,.56,.85), b2=ease(u,.83,1);
  const a=mix(from,to,.44*a1+.56*a2)-6*scale*facing;
  const b=mix(from,to,.72*b1+.28*b2)+8*scale*facing;
  const cx=(a+b)/2;
  const foot=(x,lift)=>[(x-cx)/(scale*facing),-lift];
  return {x:cx, a:foot(a,7*Math.sin(Math.PI*a1)+7*Math.sin(Math.PI*a2)),
    b:foot(b,8*Math.sin(Math.PI*b1)+3.5*Math.sin(Math.PI*b2)), stride:(a-b)/(scale*facing)+14};
}

function longCoat(g, pose, t, p) {
  const a=pose.a || [-6,0], b=pose.b || [8,0];
  const swing=pose.stride || 0, bob=(a[1]+b[1])*.12;
  leg(g,[-4,-91+bob],[(a[0]-4)*.47+2.2,-45+a[1]*.72],a,p,false);
  leg(g,[5,-90+bob],[(b[0]+5)*.5+1.4,-45+b[1]*.69],b,p,true);
  g.save();g.translate(0,bob);
  const draft=1.7*Math.sin(2.15*t)+.52*Math.sin(4.7*t)+Math.min(5,Math.abs(swing)*.10);
  head(g,1.3,-152,.68+pose.turn*.24,true,p,.018,pose.profile);
  movingShape(g,`M-6 -153 Q-18 -150 -21 -143 C-23 -135 -20 -119 -19 -103
    Q-20 -82 ${-31-draft} -60 Q-22 -55 -9 -57 L-2 -61 L2 -57 Q12 -54 ${24+draft*.4} -59
    L19 -83 Q15 -106 17 -122 Q23 -139 18 -145 Q12 -151 7 -153 L3 -157Z`,p.coat);
  shape(g,'M-17 -144 Q-22 -137 -20 -125 L-19 -102 L-25 -71 L-20 -70 L-13 -97 L-10 -119 Q-8 -134 -8 -144Z',p.side);
  shape(g,'M6 -152 L11 -151 L16 -145 L10 -143 L13 -138 L5 -126 L7 -141 L3 -147Z',p.fold);
  shape(g,'M-11 -150 Q-5 -150 2 -155 L5 -157 L6 -151 L1 -145Z',p.fold);
  const wx=-7+swing*.18, wy=-93+Math.max(0,-swing)*.04;
  movingShape(g,`M-10 -143 C-17 -145 -19 -136 -18 -130 L-15 -112 Q-14 -105 ${wx-3.5} ${wy+1}
    Q${wx} ${wy+2.8} ${wx+3.1} ${wy-1} L-7 -116 L-6 -134 Q-6 -140 -10 -143Z`,p.side);
  movingShape(g,`M${wx-2.5} ${wy} L${wx+2} ${wy-1.6} Q${wx+5} ${wy+1} ${wx+5.5} ${wy+5.2}
    L${wx+3.1} ${wy+8} L${wx+.4} ${wy+7} L${wx-1.7} ${wy+4.4}Z`,p.hand);
  if(p.piping){
    shape(g,'M-19 -143 Q-16 -147 -9 -149 M3 -155 L5 -156 M14 -146 L17 -144',null,p.piping,.82);
    shape(g,'M-16 -118 L-14 -110 M7 -101 Q9 -86 15 -71',null,p.fold,.8);
  }
  g.restore();
}

function person(g, kind, x, footY, scale, facing, pose, t, palette) {
  g.save();g.translate(x,footY);g.scale(scale*facing,scale);
  g.lineCap='round';g.lineJoin='round';
  if(kind==='short') shortJacket(g,pose,t,palette);
  else longCoat(g,pose,t,palette);
  g.restore();
}

function castOnFloor(g,kind,x,y,scale,facing,pose,t,dx,dy,opacity) {
  // Render an opaque silhouette first so overlapping limbs cast a single shadow.
  const mask=cached('temporary-cast',230,238,()=>{}), p=mask.getContext('2d');
  p.clearRect(0,0,mask.width,mask.height);
  person(p,kind,102,209,1,facing,pose,t,clothes.shade);
  g.save();g.globalAlpha*=opacity;g.translate(x,y);g.transform(scale,0,dx*scale,dy*scale,0,0);
  g.drawImage(mask,-102,-209);g.restore();
}

const backlotRain=scatteredDrops(6007,28,360,552,18);

function glassBank(p) {
  rect(p,0,0,1000,563,ramp(p,0,0,932,447,[0,'#273e49'],[.26,'#587278'],[.66,'#9aada4'],[1,'#b5b7a2']));
  p.save();p.globalAlpha=.34;
  p.drawImage(backgroundHarbor(),0,43,1000,262,0,-9,1000,214);p.restore();
  shape(p,'M0 148 L56 139 L61 124 L74 124 L75 139 L111 135 L121 108 L126 106 L134 133 L249 130 L255 112 L268 112 L271 129 L422 120 L431 115 L439 118 L632 108 L849 92 L1005 89 L1005 196 L0 213Z','#465c619e');
  shape(p,'M-16 8 Q289 126 614 43 M605 42 Q823 93 1025 37',null,'#384c4e',1.5);
  shape(p,'M0 15 Q258 113 490 74',null,'#687674a3',.75);
  for(const [x,y] of [[178,102],[866,64],[922,106]]){
    stroke(p,[[x,y+79],[x,y-22]],'#45595a',1.45);
    stroke(p,[[x-17,y],[x+21,y-2]],'#3c5154',1.2);
    for(let j=-1;j<=2;j++)stroke(p,[[x+j*7,y-6],[x+j*7+1,y+7]],'#556465',.9);
  }
  poly(p,[[0,365],[1000,310],[1000,563],[0,563]],ramp(p,10,316,271,574,[0,'#869793'],[.47,'#698383'],[1,'#354f59']));
  poly(p,[[-10,394],[816,331],[963,329],[677,563],[0,563]],ramp(p,648,322,318,560,[0,'#d3d0a888'],[.57,'#c2ba9770'],[1,'#8eaaa33d']));
  const light=seeded(9121);
  for(let i=0;i<1800;i++){
    const y=335+light()*237,z=(y-335)/237;
    const origin=[122,215,396,580,715,853][i%6],x=origin-204*z+(light()+light()-1)*(30+100*z);
    stroke(p,[[x,y],[x+2+light()*(7+29*z),y-.7]],i%5?'#ced1ac48':'#36545b73',.45+light()*1.1);
  }
  for(const x of [-75,105,270,461,673,890,1074]){
    stroke(p,[[x+88,334],[x-85,563]],'#3a535862',1.9);
    stroke(p,[[x+89.5,334],[x-83,563]],'#acb4a25c',.9);
  }
  for(const y of [414,461,525]){
    stroke(p,[[0,y+13],[1000,y-44]],'#344e576e',2.2);
    stroke(p,[[0,y+14.8],[1000,y-42.7]],'#bac0a677',.9);
  }
  aggregate(p,811,4400,337,225,['#e0d9ba25','#233c4b44','#a5b1a52c']);

  p.save();p.transform(1,-.061,0,1,14,162);
  rect(p,-26,-10,1026,202,'#293d43');
  rect(p,0,0,822,183,ramp(p,0,-10,813,201,[0,'#97aeaa'],[.22,'#adc3b9'],[.46,'#b5c4a9'],[.69,'#e4d7ac'],[.89,'#b9bda5'],[1,'#829d9b']));
  rect(p,0,0,822,183,ramp(p,0,-4,0,184,[0,'#465c6177'],[.28,'#bac5af05'],[.72,'#e5d9b132'],[1,'#526f747f']));
  // An exterior fire escape breaks up the transmission of light through the glass.
  p.save();p.beginPath();p.rect(0,0,822,183);p.clip();
  poly(p,[[-42,200],[161,-20],[179,-20],[-22,201]],'#425d635c');
  poly(p,[[73,203],[277,-21],[292,-21],[89,204]],'#48626945');
  for(let i=-3;i<11;i++){
    const x=18+i*21,y=176-i*21;
    poly(p,[[x,y],[x+111,y-4],[x+118,y-12],[x+8,y-7]],'#51696a54');
  }
  poly(p,[[559,211],[710,-27],[724,-26],[575,211]],'#65757048');
  const r=seeded(8832);
  for(let x=-1;x<826;x+=3.7){
    rect(p,x,0,.8,183,r()>.54?'#38595a40':'#5c757433');
    rect(p,x+1.2,0,.8,183,'#e2e4c949');
  }
  for(let i=0;i<174;i++){
    const x=r()*822,y=r()*140;
    stroke(p,[[x,y],[x+.5,y+2+r()*20]],'#e8e9d242',.55+r()*.6);
  }
  p.restore();
  for(const x of [0,130,281,431,582,711,818]){
    rect(p,x-3,0,8,183,'#344b50');rect(p,x+3,0,2,183,'#84948a');
    rect(p,x-4,0,1.6,183,'#b8bc9b');
  }
  for(const y of [61,141]){
    rect(p,-2,y,825,3.5,'#597172');rect(p,-2,y+3,825,.9,'#d0d1af');
  }
  rect(p,822,0,195,183,ramp(p,825,0,1010,184,[0,'#607579'],[.43,'#3c535b'],[1,'#293f49']));
  for(let i=0;i<12;i++) {
    rect(p,835+i*15,0,2.1,183,'#354c55');rect(p,838+i*15,0,.8,182,'#86918b65');
  }
  rect(p,-15,-14,1036,9,'#20343c');rect(p,-11,-6,1034,3.2,'#a0aaa0');
  rect(p,-8,-2,1030,3,'#495e60');
  rect(p,-8,183,1032,9,'#344b50');rect(p,-8,184,1033,1.7,'#afb4a0');
  rect(p,-8,192,1032,4,'#273f48');p.restore();
  shape(p,'M0 367 L1000 306',null,'#213b4380',2.2);
}

function fan(g,t) {
  g.save();g.translate(919,205);g.transform(1,-.06,0,1,0,0);
  oval(g,0,0,39,38,'#314952',0,'#778982',2.2);
  oval(g,0,.4,34,33,'#293f47');
  g.save(); g.rotate(t*.57);
  for(let k=0;k<4;k++){
    shape(g,'M2 -3 Q10 -24 26 -21 Q33 -16 32 -8 Q22 -3 5 3Z','#536768');
    g.rotate(Math.PI/2);
  }
  g.restore();
  for(const radius of [10,18,26,32])oval(g,0,0,radius,radius*.98,null,0,'#82918788',.85);
  for(let j=0;j<6;j++){
    const a=j*Math.PI/3;stroke(g,[[2*Math.cos(a),2*Math.sin(a)],[34*Math.cos(a),33*Math.sin(a)]],'#263e469e',1.35);
  }
  oval(g,0,0,5,5,'#6f807d'); g.restore();
}


    // The first lens looks down the length of the plant room. Rectify its actual glass elevation
// so the cut can see the same windows from two different positions on the roof.
function windowElevation(){
  return cached('roof-window-elevation',1000,210,p=>{
    p.transform(1,.061,0,1,-14,-148-.061*14);
    p.drawImage(cached('frosted-bank',1000,563,glassBank),0,0);
  });
}
function landingSet(p){
  p.translate(155,38);
  p.drawImage(backgroundHarbor(),-155,-38,1410,662);
  const vanX=1410,vanY=203,nearX=215;
  const project=u=>1/(1+1.42*u);
  const toX=d=>vanX+(nearX-vanX)*d, toY=(y,d)=>vanY+(y-vanY)*d;
  poly(p,[[-155,393],[1180,258],[1260,250],[1260,655],[-155,655]],ramp(p,350,291,620,615,[0,'#83938c'],[.32,'#61787b'],[1,'#354c56']));
  poly(p,[[229,388],[912,285],[777,406],[318,648],[-95,648]],ramp(p,712,248,414,585,[0,'#e2cd9e70'],[.58,'#c4bf963d'],[1,'#80948e12']));
  const grain=seeded(8941);
  for(let i=0;i<1400;i++){
    const x=grain()*1390-150,y=311+grain()*324;
    if(y<399-x*.14)continue;
    stroke(p,[[x,y],[x+2+grain()*19,y-.3-grain()]],i%4?'#d6d1b334':'#263e4b4a',.5+grain()*.84);
  }
  for(const x of [-350,-99,175,540,885,1090])stroke(p,[[vanX,vanY],[x,638]],'#2d48515e',1.4);
  for(const y of [426,489,567])stroke(p,[[-155,y+22],[1126,y-63]],'#b0b4a353',1.65);
  // A painted end wall, cable run and sill establish the corner the camera will round.
  poly(p,[[-155,143],[nearX,91],[nearX,398],[-155,447]],ramp(p,-150,115,219,362,[0,'#20333d'],[.74,'#43565a'],[1,'#69766e']));
  for(let x=-120;x<205;x+=26)stroke(p,[[x,140-(x+155)*.14],[x,447-(x+155)*.13]],'#283c4564',1.4);
  shape(p,'M-130 286 L115 252 Q125 249 125 237 V164 Q125 154 133 153 L212 141',null,'#263a42',6);
  shape(p,'M-130 283 L115 249 Q122 249 122 236 V165 Q122 151 132 150 L212 138',null,'#98a29691',1.4);
  const sheet=windowElevation(),far=project(1);
  // Sample each destination column on its own perspective ray; straight sills stay straight.
  const depth=x=>(vanX-x)/(vanX-nearX),sourceX=d=>1000*(1/d-1)/1.42;
  for(let x=nearX;x<Math.ceil(toX(far));x++){
    const d=depth(x+.5),left=sourceX(depth(x));
    const width=Math.min(1000-left,sourceX(depth(x+1))-left);
    if(width>0)p.drawImage(sheet,left,0,width,210,x,toY(91,d),1,294*d);
  }
  stroke(p,[[nearX,91],[toX(far),toY(91,far)]],'#adb5a2',2.1);
  stroke(p,[[nearX,386],[toX(far),toY(386,far)]],'#314751',4);
  // The equipment return masks the arriving visitor from the lift, but not from the side lens.
  poly(p,[[847,192],[1076,146],[1250,168],[1250,387],[851,349]],ramp(p,849,185,1130,384,[0,'#425b62'],[.54,'#344b53'],[1,'#243b45']));
  poly(p,[[847,192],[1076,146],[1082,150],[851,199]],'#87968b');
  for(let j=0;j<11;j++)stroke(p,[[871,226+j*6],[1010,204+j*6.5]],j%2?'#283e49':'#647778',2.3);
}

const steelStrip=new Path2D('M7 1 L96 1 L92 431 L9 431Z');
function mirror(g,t,opening){
  const gait=arrival(t,0),x=126-opening*136+(gait.x-145)*.34;
  g.save();g.clip(steelStrip);
  // Door travel and the walk move the reflection through a fixed strip of folded metal.
  const shift=opening*46;
  for(const folded of [true,false]){
    g.save();g.beginPath();g.rect(folded?0:35,-2,folded?35:68,436);g.clip();
    if(folded)g.transform(.67,.07,0,1,11.55,-2.45);
    g.save();g.globalAlpha*=.66;g.translate(131+shift,0);g.transform(-.82,-.055,-.025,1,0,0);
    g.drawImage(windowElevation(),270,0,370,210,-65,105,268,182);g.restore();
    rect(g,-16,0,123,432,ramp(g,0,5,0,429,[0,'#22383c8c'],[.32,'#e1d4ab20'],[.66,'#b5bba62b'],[.68,'#88998a70'],[1,'#43595a9c']));
    g.translate(x,327);g.transform(.92,-.035,-.034,1,0,0);
    castOnFloor(g,'long',0,0,.96,1,gait,t,-.30,-.17,.36);
    person(g,'long',0,0,.96,1,gait,t,clothes.ink);g.restore();
  }
  rect(g,3,0,32,432,ramp(g,3,0,35,0,[0,'#263e4365'],[.80,'#b2baa72b'],[1,'#d5d0af5c']));
  const gloss=95-opening*118;
  rect(g,5,0,92,432,ramp(g,6,0,95,0,[0,'#283c3d72'],[.14,'#d5d5bd4a'],[.37,'#aeb9a92b'],[.7,'#71867b36'],[.90,'#e4dec18e'],[1,'#253a3e66']));
  poly(g,[[gloss+12,0],[gloss+19,0],[gloss-2,432],[gloss-10,432]],'#eff0d347');
  for(let y=13;y<430;y+=6.7)stroke(g,[[7,y],[95,y-.8]],'#d9d8be20',.48);
  g.restore();
}

function cameraMark(t){
  const lx=233,pan=ease(t,2.20,6.40);
  const follow=ease(t,1.82,3.53)*(1-ease(t,4.67,6.44));
  return {lx,end:744,x:mix(492,1.035*lx-20,pan),y:mix(425,1.035*427-7,pan),
    scale:mix(1.28,1.22*1.035,pan)+.245*follow};
}
function doorView(g,mark){
  const zoom=mark.scale/1.30;
  g.save();g.translate(mark.x-500*zoom,mark.y-428*zoom);g.scale(zoom,zoom);
  g.drawImage(cached('plant-room-end',1410,664,landingSet),-155,-38);g.restore();
}
function headTurn(t){
  return {glance:ease(t,3.60,5.38),turn:ease(t,3.79,5.55),rest:.20*(1-ease(t,3.87,5.49))};
}
function jamb(g,x,travel){
  g.save();g.transform(1-.10*travel,0,-.041,1,x,0);
  g.drawImage(cached('roof-jamb-face',136,570,p=>{
    rect(p,0,0,136,570,ramp(p,0,0,136,0,[0,'#203039'],[.06,'#54605c'],[.11,'#8e927a'],[.15,'#475353'],[.25,'#2c4148'],[.73,'#192e38'],[.91,'#293e43'],[.96,'#798277'],[1,'#152c35']));
    rect(p,23,0,2,570,'#182f3699');rect(p,114,0,2.5,570,'#65756973');
    for(const y of [98,355,432]){
      oval(p,30,y,3.4,4.1,'#273b43',0,'#899080',.8);
      stroke(p,[[28.5,y+1],[31.5,y-1]],'#7d877a',.85);
    }
    aggregate(p,7351,14000,0,570,['#e3dcc026','#1127303b']);
  }),-64,-3);
  const glint=mix(-47,-36,travel);
  rect(g,glint,-2,3.2,570,ramp(g,glint,0,glint+3.2,0,[0,'#b7b59c00'],[.5,'#c7bda04b'],[1,'#c7bda000']));
  g.restore();
}

    // Both profiles are drawn on the head joints of the two stage actors, in the same model units.
// The hair, nape and collar still meet when the lens reaches the close-up.
function profile(g,tied,p){
  if(tied){
    shape(g,`M-11 -22.5 C-13 -30 -8 -37.7 -.7 -37.9 C5.1 -38.2 9.8 -33.9 10.4 -29.1
      C10.7 -26.5 10.3 -24.6 11.5 -22.7 Q12 -21.7 11.5 -21.1
      C11.5 -19.3 13.8 -17.8 15 -16.4 Q15.5 -15.6 14.6 -15.1 L12.3 -14.5
      Q11.7 -14 12 -13.1 Q12.6 -12.5 12.2 -12 L11.6 -11.7
      Q12.1 -11.2 11.95 -10.7 Q11.8 -10.2 11.1 -10 L10.9 -8 Q10.7 -5.4 8.2 -5.45
      C6.2 -5.45 4.4 -6.35 3.1 -6.8 C1.9 -6.35 2.55 -1.7 3.35 .7 Q4.3 3.9 6.2 6.4 L-7.8 7.4 Q-6.9 1.1 -8.8 -6.5
      C-13.3 -10.1 -13.4 -17.2 -11 -22.5Z`,p.skin);
    shape(g,`M-10.7 -9.2 C-12.9 -7.4 -16.6 -8.4 -17.6 -11.3 C-18.4 -14.2 -16.9 -16.9 -14 -17.5
      Q-13.2 -18 -13.1 -20.5 C-14.9 -27.7 -11.1 -34.6 -6.3 -36.8
      C-.6 -39.9 6.2 -37.9 9.3 -33.6 Q10.6 -31.35 10.4 -29.3 Q9.95 -29.8 9.5 -30.2
      C8.1 -25.3 4 -22.1 1.8 -17 C.2 -13 -3.6 -8.3 -7.8 -6.4 L-8 -8.3Z`,p.hair);
  }else{
    shape(g,`M-11.8 -23 C-13.1 -31.3 -7.2 -37.8 -.5 -38 C4.9 -38.5 9.7 -34.8 10.5 -30.1
      C10.9 -27.3 10.7 -25.1 12.1 -23.3 Q12.6 -22.4 12.1 -21.8 Q11.7 -21.2 12 -20.5
      C12.8 -19.1 15 -17.4 15.95 -16.2 Q16.5 -15.2 15.2 -14.8 L12.8 -14.5
      Q12 -14.1 12.15 -13.4 L12.8 -12.4 Q13.05 -12 12.4 -11.7 L11.95 -11.45
      Q12.55 -11.1 12.4 -10.5 Q12.25 -10 11.55 -9.8 Q10.95 -9.35 11.1 -8.45
      C11.45 -6.5 10.3 -5.25 8.3 -5.4 C6.2 -5.4 4.2 -6.2 2.2 -6.85
      C1.1 -6.4 .9 -3.2 1.55 -.8 Q2.35 3.1 5.9 5.8 L-7.5 7.1
      Q-6.1 1 -7.2 -5.3 C-11.3 -8.9 -13.4 -15.1 -11.8 -23Z`,p.skin);
    shape(g,`M-8.2 -5.3 Q-8.4 -8.1 -10.3 -10.1 L-9.9 -8.9 C-13.5 -12.4 -14.1 -17.2 -13 -21.4
      C-15 -27.6 -12 -33.8 -7.9 -35.7 L-8.65 -35.55 Q-5.4 -38.9 -.8 -38.6
      C3.3 -39.2 6.8 -37.6 8.25 -36.25 C10.4 -35.25 11.9 -33.4 11.55 -31.35
      Q10.95 -31.85 10.45 -31.8 Q10.95 -30.5 10.65 -29.45 L10 -30.1 C8.4 -26.6 4.6 -23.5 3.7 -18.7
      Q3 -13.7 .3 -11.4 L.1 -13.6 Q-2 -9.8 -5.1 -8 L-5.5 -9.3Z`,p.hair);
  }
}

const portraitInk=Array.from({length:49},(_,i)=>{
  const keep=1-i/48;
  return Object.fromEntries(Object.entries(clothes.ink).map(([key,color])=>{
    if(key==='piping'&&keep===0)return [key,null];
    const tint=color.slice(1).match(/../g).map(c=>Math.round(parseInt(c,16)*keep).toString(16).padStart(2,'0')).join('');
    return [key,'#'+tint];
  }));
});

function smokedWindow(p){
  const glass=cached('frosted-bank',1000,563,glassBank);
  p.save();p.filter='blur(2.6px)';p.drawImage(glass,0,0);
  p.filter='blur(.85px)';p.globalAlpha=.12;p.drawImage(glass,0,0);p.restore();
  p.save();p.globalCompositeOperation='multiply';
  rect(p,0,0,1000,563,ramp(p,358,193,690,272,[0,'#889f9a'],[.37,'#607d7a'],[.62,'#506e6c'],[1,'#9a9d7b']));
  p.restore();
  rect(p,0,0,1000,563,flare(p,605,190,96,[0,'#d7bf8a45'],[.46,'#b5b39316'],[1,'#849a8b00']));
  rect(p,0,0,1000,563,flare(p,439,219,86,[0,'#7fa9a63b'],[.5,'#638c8b17'],[1,'#638c8b00']));
}

// Measured nose positions in each settled actor's local coordinates. Projecting around the
// nose leaves the same line of sight in both the two-shot and the final large profiles.
function portraitMark(near,wideX,wideY,wideScale,push){
  const direction=near?1:-1;
  const nx=direction*(near?26.78:15.52),ny=near?-171.58:-166.67;
  const scale=Math.pow(mix(Math.sqrt(wideScale),Math.sqrt(near?12.25:10.48),push),2);
  const nxScreen=mix(wideX+wideScale*nx,near?271:771,push);
  const nyScreen=mix(wideY+wideScale*ny,near?316:265,push);
  return {x:nxScreen-scale*nx,y:nyScreen-scale*ny,scale};
}

function portraitTake(g,t){
  const push=ease(t,roofPushFrom,roofPushTo),wide=cameraMark(roofPushFrom);
  const roomScale=wide.scale/1.22,roomX=wide.x-wide.lx*roomScale,roomY=wide.y-427*roomScale;
  const visitor=arrival(t,wide.end),far=portraitMark(false,roomX+visitor.x*roomScale,roomY+409*roomScale,1.14*roomScale,push);
  const near=portraitMark(true,wide.x,wide.y,wide.scale,push);
  const focus=smooth((push-.035)/.90),lens=roomScale*Math.pow(4.12,push);
  g.save();g.translate(mix(roomX+518*roomScale,521,push),mix(roomY+230*roomScale,262,push));
  g.scale(lens,lens);g.translate(-518,-230);
  if(focus<1){set(g,'frosted-bank',glassBank);fan(g,t);}
  if(focus>0){g.save();g.globalAlpha=focus;set(g,'portrait-window',smokedWindow);g.restore();}
  if(push<.40)floorRings(g,t,backlotRain,'#e6dfba');g.restore();
  const stillPose=headTurn(roofPushFrom),shadow=1-smooth(push/.40);
  if(shadow>0){
    castOnFloor(g,'long',far.x,far.y,far.scale,-1,visitor,t,1.46,-.35,.67*shadow);
    castOnFloor(g,'long',far.x,far.y,far.scale,-1,visitor,t,-.045,-.25,.17*shadow);
    castOnFloor(g,'short',near.x,near.y,near.scale,1,stillPose,t,.99,-.33,.58*shadow);
    castOnFloor(g,'short',near.x,near.y,near.scale,1,stillPose,t,-.055,-.24,.16*shadow);
  }
  if(push<.70)rain(g,t,.25*(1-smooth(push/.70)),-.28);
  finishFilm(g,t,reduced.matches);
  const ink=portraitInk[Math.round(48*smooth(push/.88))];
  person(g,'long',far.x,far.y,far.scale,-1,{...visitor,profile},t,ink);
  person(g,'short',near.x,near.y,near.scale,1,{...stillPose,profile},roofPushFrom,ink);
}

    function arrival(t,end){
      return {...walk(t,end+144,end,roofFootStart,roofFootStop,1.14,-1),turn:ease(t,3.52,5.14)};
    }
    function wetFootsteps(g,t,end){
      for(const [i,at] of roofFootfalls.entries()){
        const age=t-at;
        if(age<=0||age>=1.42)continue;
        const step=arrival(at,end),x=step.x-step[i%2?'b':'a'][0]*1.14,phase=age/1.42;
        g.save();g.globalAlpha=.46*(1-phase)*Math.min(1,age*32);
        g.strokeStyle='#d3d3ac';g.lineWidth=.9;g.beginPath();
        g.ellipse(x,410,2+28*Math.sqrt(phase),.8+4.3*Math.sqrt(phase),-.045,.15,4.9);
        g.stroke();g.restore();
      }
    }
    // The post and its rail sit close to the lens. The fluting on the building is further back.
    function post(g,x,withRail=true){
      g.save();g.transform(1,0,-.026,1,x,0);
      if(withRail){
        const rail=ramp(g,0,379,0,393,[0,'#6d7970'],[.18,'#42565a'],[.7,'#21383e'],[1,'#132b34']);
        shape(g,'M-465 345 L-17 376 L-17 389 L-465 356Z',rail);
        shape(g,'M-464 345 L-17 375',null,'#a1a48a9c',1.6);
      }
      rect(g,-47,-2,82,568,ramp(g,-47,0,35,0,[0,'#23373b'],[.10,'#425353'],[.15,'#33474b'],[.31,'#273a40'],[.82,'#172d35'],[1,'#354a4c']));
      rect(g,-49,-2,6,568,'#263d42');rect(g,30,-2,5,568,'#718078');
      rect(g,36,-2,2,568,'#bbbaa077');rect(g,-36,-2,1.2,568,'#72817a76');
      for(const y of [102,359,431]){
        oval(g,-32,y,3,3.6,'#1c323a',0,'#697870',.8);
        stroke(g,[[-33.5,y+1],[-30.6,y-.8]],'#82918797',.65);
      }
      g.restore();
    }
    function sideView(g,t,mark){
      const scale=mark.scale/1.22,swing=1+.23*(1-ease(t,4.13,5.86));
      const tx=mark.x-mark.lx*scale*swing;
      g.save();g.translate(tx,mark.y-427*scale);g.scale(scale*swing,scale);
      if(tx>0){
        g.save();g.scale(-1,1);
        const bank=cached('frosted-bank',1000,563,glassBank);
        g.drawImage(bank,0,0,330,563,0,0,330,563);
        rect(g,0,0,330,563,'#22394339');g.restore();
      }
      set(g,'frosted-bank',glassBank);fan(g,t);
      const visitor=arrival(t,mark.end);
      castOnFloor(g,'long',visitor.x,409,1.14,-1,visitor,t,1.46,-.35,.67);
      castOnFloor(g,'long',visitor.x,409,1.14,-1,visitor,t,-.045,-.25,.17);
      floorRings(g,t,backlotRain,'#e6dfba');wetFootsteps(g,t,mark.end);
      g.translate(visitor.x,409);g.scale(1/swing,1);
      person(g,'long',0,0,1.14,-1,visitor,t,clothes.ink);g.restore();
    }
    function draw(g,t){
      const mark=cameraMark(t),pose=headTurn(t);
      const cut=ease(t,3.46,5.34),edge=mix(1100,-92,cut);
      if(cut<1)doorView(g,mark);
      if(cut>0){
        g.save();
        if(cut<1){
          g.beginPath();g.moveTo(edge,0);g.lineTo(1002,0);g.lineTo(1002,HEIGHT+2);g.lineTo(edge-.041*HEIGHT,HEIGHT+2);g.closePath();g.clip();
        }
        sideView(g,t,mark);g.restore();
      }
      // Both lenses share this exact actor projection and pose, even while the jamb covers the cut.
      castOnFloor(g,'short',mark.x,mark.y,mark.scale,1,pose,t,mix(.59,.99,cut),-.33,.58);
      castOnFloor(g,'short',mark.x,mark.y,mark.scale,1,pose,t,-.055,-.24,.16);
      person(g,'short',mark.x,mark.y,mark.scale,1,pose,t,clothes.ink);
      rain(g,t,.25,-.28);
      if(cut>0&&cut<1)jamb(g,edge,cut);
    }
    return {draw,post,mirror,portraitTake};
  })();
  function roofTake(g,age){
    if(age>roofPushFrom){silhouetteTerrace.portraitTake(g,Math.min(age,roofPushTo));return;}
    silhouetteTerrace.draw(g,age);
    const walkOut=smooth((age-1.80)/1.63);
    if(walkOut<1){
      const opening=.46*smooth((age-.18)/1.23)+.54*smooth((age-1.70)/1.13);
      g.save();camera(g,548,280,1+1.20*walkOut);
      carFront(g,opening,0,age);g.restore();
    }
    finishFilm(g,age,reduced.matches);
  }
  function rooftopArrival(g,age,plate,clock,preview){
    const open=reduced.matches?0:smooth((age-roofNumbersAt)/(roofRollAt-roofNumbersAt));
    roofTake(g,age);
    if(open>0){
      const feed=candidateStream('grand',clock,preview);
      identityNumbers(g,state.counts.grand,age,feed,null,null,open);
    }
    if(plate&&age<.35){g.save();g.globalAlpha=1-smooth(age/.35);impressions(g,plate);g.restore();}
    if(g===ctx)liveRoofAge=age;
  }


// Number plates
  function photoFrame(index,negative=false){
    return cached('evidence-'+index+'-'+Number(negative),432,242,p=>{
      p.save();p.scale(.432,242/563);
      if(index===0 || index===3){camera(p,index?165:624,index?210:275,index?1.87:1.05);cityRain(p,index*.7+.5);}
      else if(index===1){reverseAngle(p,5.65);}
      else {harborShot(p,1,.17,.84);}
      p.restore();
      const pixels=p.getImageData(0,0,432,242),data=pixels.data;
      const low=negative?[23,27,36]:[13,37,44],high=negative?[226,178,129]:[219,207,166];
      for(let i=0;i<data.length;i+=4){
        const l=(.29*data[i]+.56*data[i+1]+.15*data[i+2])/255;
        const k=negative?clamp(1.13-1.55*l):clamp(l*1.62-.10);
        for(let c=0;c<3;c++)data[i+c]=mix(low[c],high[c],k);
      }
      p.putImageData(pixels,0,0);
    });
  }
  // Each stock keeps one surface at its current quota, including the two emulsion states.
  const materialPlates=new Map();
  function materialPlate(g,key,count,draw){
    let plate=materialPlates.get(draw);
    if(!plate||plate.count!==count){
      const surface=bitmap(1400,788),p=surface.getContext('2d');
      p.scale(surface.width/WIDTH,surface.height/HEIGHT);
      draw(p,ticketLayout(key,count),count);
      plate={surface,count};materialPlates.set(draw,plate);
    }
    g.drawImage(plate.surface,0,0,WIDTH,HEIGHT);
  }
  function seatAt(m,i){
    const row=Math.floor(i/m.cols),shift=row===m.rows-1?(m.lastShift||0):0;
    return [m.left+(i%m.cols+.5+shift)*m.w,m.top+(row+.5)*m.h];
  }
  function candidateAt(feed,m,i){return runningTicket(feed,Math.floor(i/m.cols),m.rows+2,i%m.cols);}
  function serialType(g,number,x,y,font,width,color){
    g.font=font;g.textAlign='center';g.textBaseline='middle';g.fillStyle=color;g.fillText(number,x,y,width);
  }
  function machineScrew(g,x,y,r,angle){
    g.save();g.translate(x,y);g.rotate(angle);
    oval(g,.5,1,r+1,r+1,'#080d0eaa');oval(g,0,0,r,r,ramp(g,-r,-r,r,r,[0,'#a29f8b'],[.43,'#515956'],[1,'#202b2d']),0,'#192022',.7);
    stroke(g,[[-r*.64,0],[r*.64,0]],'#172022',Math.max(.8,r*.28));g.restore();
  }
  function contactLamp(g,x,y,r,on,warm){
    const hot=warm?'#ffd49b':'#d7f0bf',idle=warm?'#744032':'#415b50';
    if(on>.01){g.save();g.globalAlpha*=on;oval(g,x,y,r*3.4,r*3.4,flare(g,x,y,r*3.4,[0,warm?'#e78348a6':'#88c79883'],[1,'#00000000']));g.restore();}
    oval(g,x,y,r+1.6,r+1.6,'#1d2323',0,'#817866',.9);oval(g,x,y,r,r,idle);
    g.save();g.globalAlpha*=on;oval(g,x,y,r*.83,r*.83,hot);g.restore();
    oval(g,x-r*.28,y-r*.32,r*.27,r*.16,'#ffffff70',-.4);
  }


// Contact sheet
  function archiveStock(p,m,count){
    rect(p,0,0,1000,563,ramp(p,0,0,930,560,[0,'#531c26'],[.25,'#823932'],[.66,'#40252b'],[1,'#211a23']));
    rounded(p,16,11,968,540,9,'#261a1d','#aa7055',2);
    rounded(p,25,18,950,527,5,ramp(p,27,12,970,523,[0,'#9b7960'],[.025,'#443a34'],[.25,'#443334'],[.80,'#3d2c2c'],[1,'#986348']),'#271d22',1.7);
    rect(p,42,32,916,493,'#1b161b');
    rect(p,49,37,902,486,ramp(p,30,40,930,517,[0,'#c76b53'],[.16,'#883e33'],[.52,'#48282a'],[.86,'#904033'],[1,'#bd6953']));
    for(let j=0;j<38;j++){
      const x=58+j*23.4;
      for(const y of [44,493]){
        rounded(p,x,y,13,9,2.2,'#201c20','#a879595e',.8);
        rect(p,x+1,y+8,10,.8,'#ffc08b8c');
      }
    }
    rect(p,58,65,884,419,'#211e23');
    emulsionFrames(p,m,count,false);
    for(const x of [29,970])for(const y of [27,536])machineScrew(p,x,y,4.7,(x+y)*.15);
    for(const x of [91,767]){
      rounded(p,x,12,141,12,2.6,'#1f2325','#ae8d70',.9);
      rect(p,x+15,13,108,3,ramp(p,x,13,x+130,13,[0,'#5f6158'],[.43,'#c1a68b'],[1,'#67655b']));
      for(let i=0;i<22;i++)rect(p,x+16+i*5,19,1.4,3,'#7e7364');
    }
    scratches(p,2081,610,['#b4916916','#0c121530']);
  }
  function emulsionFrames(p,m,count,fixed=true){
    const rng=seeded(913);
    for(let i=0;i<count;i++){
      const [cx,cy]=seatAt(m,i),x=cx-m.w/2+2.4,y=cy-m.h/2+2.4,w=m.w-4.8,h=m.h-4.8;
      p.save();p.beginPath();p.rect(x,y,w,h);p.clip();rect(p,x,y,w,h,'#191c22');
      const img=photoFrame([2,0,3,1,0,2,1][i%7],!fixed&&i%3===1);
      const scale=Math.max(w/img.width,h/img.height)*(1+rng()*.39),aw=img.width*scale,ah=img.height*scale;
      p.drawImage(img,x-(aw-w)*rng(),y-(ah-h)*rng(),aw,ah);
      const wash=fixed
        ?ramp(p,x,y,x+w*.52,y+h,[0,'#26383f44'],[.39,'#121d28ac'],[.72,'#151926bb'],[1,'#55646440'])
        :ramp(p,x,y,x+w*.52,y+h,[0,'#411c2988'],[.40,'#241521b8'],[.71,'#1b151ddb'],[1,'#74382e6b']);
      rect(p,x,y,w,h,wash);
      rect(p,x,y,w,1.4,'#e5c9a690');
      const cut=Math.min(11,w*.08,h*.15);
      for(const k of [-1,1]){
        const px=k<0?x+3:x+w-3,py=k<0?y+3:y+h-3;
        stroke(p,[[px-k*cut,py],[px,py],[px,py-k*cut]],'#d3bda57c',1.1);
      }
      p.restore();
    }
  }
  function filmEdgeCodes(g,m,feed,time,alpha){
    if(alpha<=0||!feed?.deck)return;
    g.save();g.globalAlpha*=alpha;
    for(let lane=0;lane<2;lane++){
      const y=lane?468:80,shift=wrapIndex(time*(lane?10:-9),60),step=Math.floor(time*(lane?10:-9)/60);
      g.save();g.beginPath();g.rect(60,y-11,880,22);g.clip();
      for(let j=-1;j<16;j++){
        const x=70+j*60+shift;if(x<68||x>932)continue;
        serialType(g,runningTicket(feed,m.rows+lane,m.rows+2,j-step),x,y,'500 14px '+typewriter,51,lane?'#be9b7f':'#d8b69a');
      }
      g.restore();
    }
    g.restore();
  }
  function contactPrint(g,count,time,feed,values,age){
    materialPlate(g,'second',count,archiveStock);
    const m=ticketLayout('second',count),rolling=age===null;
    const sweep=rolling?0:clamp((age-.13)/1.62),tip=mix(-.14,1.14,sweep);
    let wetEdge=null;
    if(sweep>0){
      g.save();g.beginPath();g.rect(m.left,m.top,m.right-m.left,m.bottom-m.top);g.clip();
      if(sweep<1){
        const w=m.right-m.left,h=m.bottom-m.top;
        wetEdge=new Path2D();
        for(let j=0;j<=42;j++){
          const v=j/42,y=m.top+v*h,x=m.left+(tip-v*.22)*w/.78+Math.sin(v*15+age*3)*3;
          if(j)wetEdge.lineTo(x,y);else wetEdge.moveTo(x,y);
        }
        const soaked=new Path2D(wetEdge);
        soaked.lineTo(m.left-205,m.bottom);soaked.lineTo(m.left-205,m.top);soaked.closePath();g.clip(soaked);
      }
      materialPlate(g,'second',count,emulsionFrames);g.restore();
    }
    const mode=rolling?1:1-smooth((age-.17)/1.12);
    filmEdgeCodes(g,m,feed,time,mode*.80);
    for(let i=0;i<count;i++){
      const [x,y]=seatAt(m,i),axis=.78*(x-m.left)/(m.right-m.left)+.22*(y-m.top)/(m.bottom-m.top);
      const developed=rolling?0:smooth((tip-axis+.09)/.16);
      const font='600 '+m.size+'px "Bahnschrift","Arial",sans-serif';
      if(developed<1&&feed?.deck){
        g.save();g.globalAlpha*=1-developed;
        serialType(g,candidateAt(feed,m,i),x,y,font,m.w*.89,'#dec3a6');g.restore();
      }
      if(developed>0){
        g.save();g.globalAlpha*=developed;
        serialType(g,ticket(values[i]),x,y,font,m.w*.89,'#f3e4c7');g.restore();
      }
    }
    // The meniscus crosses the same local coordinate used to develop each frame.
    g.save();g.beginPath();g.rect(m.left,m.top,m.right-m.left,m.bottom-m.top);g.clip();
    if(wetEdge){
      for(const [width,ink] of [[22,'#eb8a5226'],[5,'#e6a2606b'],[1.25,'#ffe2ad']]){
        g.strokeStyle=ink;g.lineWidth=width;g.stroke(wetEdge);
      }
    }else if(rolling){
      const x=m.left+(m.right-m.left)*(.5+.47*Math.sin(time*.45));
      rect(g,x-55,m.top,110,m.bottom-m.top,ramp(g,x-55,0,x+55,0,[0,'#e19a6c00'],[.5,'#de925517'],[1,'#e19a6c00']));
    }
    g.restore();contactLamp(g,498,531,3.4,rolling?.45+.35*Math.sin(time*1.7):sweep,true);
  }
  function archiveTable(p){
    rect(p,0,0,1000,563,ramp(p,24,2,892,557,[0,'#341722'],[.32,'#753431'],[.69,'#512329'],[1,'#1a151c']));
    for(let i=0;i<35;i++)stroke(p,[[i*46-390,570],[i*46+212,-4]],i%4?'#21151d49':'#be705a26',i%4?.8:2);
    p.save();p.translate(54,51);p.rotate(-.25);
    rounded(p,-49,-28,253,70,9,'#24191c','#a56f51',2);
    rounded(p,-37,-16,227,45,7,ramp(p,0,-16,0,29,[0,'#4f1d28'],[.29,'#bd3b36'],[.63,'#ff8a6b'],[1,'#a43034']));
    for(let i=0;i<19;i++)rect(p,-35+i*12,-20,4.5,56,'#412523');p.restore();
    // A film can and loose leader leave recognizable silhouettes beyond the file.
    p.save();p.translate(934,99);p.rotate(.2);p.scale(1,.75);
    for(const [r,c] of [[98,'#1c171d'],[94,'#776452'],[91,'#302d2e'],[82,'#6a554b'],[78,'#363038']])oval(p,0,0,r,r,c,0,'#a193725e',1.25);
    for(let j=0;j<5;j++){const a=j*TAU/5;oval(p,Math.cos(a)*47,Math.sin(a)*47,23,13,'#211e25',a,'#8d7563',1.1);}p.restore();
    p.save();p.translate(129,478);p.rotate(-.34);
    for(let j=0;j<6;j++){rect(p,j*55,-21,54,49,'#70372c');rect(p,j*55+4,-13,46,30,'#22212a');
      for(let k=0;k<3;k++){rect(p,j*55+6+k*16,-18,7,3.5,'#d3986e');rect(p,j*55+6+k*16,20,7,3.5,'#cc956f');}}
    p.restore();scratches(p,632,1150,['#f0bc8324','#110b144e']);
    rect(p,0,0,1000,563,flare(p,455,214,685,[0,'#bf5e3013'],[.64,'#120d1505'],[1,'#090711a3']));
  }
  function archiveFolder(g,age,count,insert=null){
    set(g,'archive-table',archiveTable);
    const lamp=.80+.13*Math.sin(age*1.71)+.05*Math.sin(age*5.7);
    g.save();g.globalAlpha=lamp;rect(g,0,0,470,313,flare(g,92,34,303,[0,'#ec533d61'],[.48,'#d8383926'],[1,'#bc283800']));g.restore();
    const open=smooth((age-.46)/2.0),hold=smooth((age-1)/2.45);
    g.save();g.translate(511+10*hold,296-9*hold);g.rotate(-.12+.048*hold);g.scale(.81+.045*hold,.81+.045*hold);
    rounded(g,-449,-241,889,503,9,'#120e13aa');
    shape(g,'M-452 -222Q-452 -237 -433 -238L-251 -238L-229 -258L-65 -258L-46 -236L429 -236Q447 -236 447 -218V236H-452Z',ramp(g,-405,-230,422,212,[0,'#d5ae83'],[.5,'#8f7257'],[1,'#ba8b62']),'#49332d',2);
    g.save();g.translate(-397,-203);g.scale(.791,.719);
    if(g===ctx)livePrintPose=surfacePose(g,[0,0],[WIDTH,0],[0,HEIGHT]);
    if(insert)impressions(g,insert);else contactPrint(g,count,1.6,null,null,null);
    // The negative catches a moving oblique reflection of the safelight as the cover turns.
    g.save();g.beginPath();g.rect(49,36,902,485);g.clip();
    const rake=535*(1-open)+77+23*Math.sin(age*.56);
    g.transform(1,0,-.30,1,0,0);
    rect(g,rake,-8,155,571,ramp(g,rake,0,rake+155,0,[0,'#e69f8100'],[.62,'#e68c6a24'],[.65,'#ffe0b629'],[1,'#e59f8200']));
    g.restore();g.restore();
    // A steel spring clip bridges the upper edge of the exposed negative and the folder.
    g.save();g.translate(312,-207);g.rotate(.04);
    rounded(g,-28,-10,57,17,3.3,'#312d2c','#bfa68a',1);
    rect(g,-23,-7,47,7,ramp(g,0,-7,0,1,[0,'#84796a'],[.37,'#cfbda0'],[1,'#474441']));
    shape(g,'M-16 -7L-20 -25Q-20 -32 -13 -32H12Q19 -32 18 -25L15 -7',null,'#3e3b36',3.1);
    shape(g,'M-16 -8L-19 -25Q-19 -31 -13 -31H12Q18 -31 17 -25L14 -8',null,'#c6b9a1',1.4);g.restore();
    const cs=Math.cos(open*2.53),lift=Math.sin(open*2.53);
    g.save();g.translate(-453,0);g.transform(cs,-lift*.097,0,1,0,0);
    if(Math.abs(cs)>.006){
      rounded(g,0,-232,893,477,9,ramp(g,0,-220,823,241,[0,'#b08a66'],[.34,'#ceb18c'],[.79,'#a18264'],[1,'#785640']),'#593c30',2.2);
      for(let j=0;j<4;j++)stroke(g,[[9+j*3,-226],[9+j*3,236]],j%2?'#e0c094':'#87674e',1.2);
      if(cs>0){
        g.save();g.translate(82,-118);g.rotate(-.029);
        g.font='700 43px "Bahnschrift","Arial",sans-serif';g.fillStyle='#784739';g.fillText('MISSION 2',0,0);
        rect(g,0,11,197,2,'#865142');g.restore();
        rect(g,601,-188,229,58,'#b3a187');g.fillStyle='#766a58';
        for(let i=0;i<42;i++)g.fillRect(619+i*4.4,-176,1+(i*11%3),29);
        for(const y of [-46,45]){
          oval(g,713,y,20,20,'#674139',0,'#b08c65',2);oval(g,713,y,4.5,4.5,'#b49b76');
        }
        g.save();g.globalAlpha=1-smooth(open/.55);
        shape(g,'M694 -52Q696 -72 716 -64Q743 -54 724 -34L702 30Q687 46 705 60Q730 66 734 46L719 -35Q709 -46 695 -44',null,'#6f3430',3.2);g.restore();
      }
    }
    g.restore();g.restore();
  }


// Line monitor
  function speakerMesh(g,x,y,w,h,pitch){
    g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
    for(let j=0;j<h/pitch;j++)for(let i=0;i<w/pitch;i++){
      const px=x+i*pitch+(j%2)*pitch*.5,py=y+j*pitch;
      oval(g,px,py+1.1,pitch*.27,pitch*.24,'#8d95814d');oval(g,px,py,pitch*.27,pitch*.24,'#141c20');
    }
    g.restore();
  }
  function meterBezel(g,x,y,w,h){
    rounded(g,x,y,w,h,4.2,'#182020','#888a77',1.9);
    rounded(g,x+4,y+3,w-8,h-7,2.8,ramp(g,x,y,x+w*.3,y+h,[0,'#8f8976'],[.32,'#dbca9f'],[.81,'#bba678'],[1,'#6a6758']));
    const cx=x+w*.5,cy=y+h*1.36,r=h*1.04;
    g.save();g.beginPath();g.rect(x+4,y+4,w-8,h-9);g.clip();
    for(let j=0;j<=30;j++){
      const a=-2.37+j*1.60/30,small=j%5?3:7;
      stroke(g,[[cx+Math.cos(a)*(r-small),cy+Math.sin(a)*(r-small)],[cx+Math.cos(a)*r,cy+Math.sin(a)*r]],j>22?'#aa513b':'#504e46',j%5?1:1.8);
    }
    g.beginPath();g.arc(cx,cy,r+2,-1.15,-.77);g.strokeStyle='#944938';g.lineWidth=3;g.stroke();
    rect(g,x+5,y+5,w-10,6,'#514d424a');g.restore();
  }
  function meterNeedle(g,x,y,w,h,level){
    const a=-2.35+1.56*clamp(level),cx=x+w*.5,cy=y+h*1.36,r=h*1.09;
    g.save();g.beginPath();g.rect(x+5,y+4,w-10,h-10);g.clip();
    const px=cx+r*Math.cos(a),py=cy+r*Math.sin(a);
    stroke(g,[[cx+2,cy],[px+2,py+1]],'#524b4960',2.4);stroke(g,[[cx,cy],[px,py]],'#673c35',1.6);g.restore();
  }
  function rotary(g,x,y,r){
    for(let i=0;i<19;i++){
      const a=2.37+i*4.6/18;stroke(g,[[x+(r+4)*Math.cos(a),y+(r+4)*Math.sin(a)],[x+(r+6.6)*Math.cos(a),y+(r+6.6)*Math.sin(a)]],'#bcaf8d99',1);
    }
    oval(g,x+1,y+3,r+1,r,'#142024');oval(g,x,y,r,r,ramp(g,x-r,y-r,x+r,y+r,[0,'#8c8d79'],[.36,'#404b49'],[1,'#1b262c']),0,'#a8a68c',1);
    for(let i=0;i<24;i++){const a=i*TAU/24;stroke(g,[[x+(r-4)*Math.cos(a),y+(r-4)*Math.sin(a)],[x+(r-1)*Math.cos(a),y+(r-1)*Math.sin(a)]],'#172327b2',1.5);}
    stroke(g,[[x-r*.15,y-r*.39],[x-r*.34,y-r*.80]],'#e2cf9c',2.5);
  }
  function switchboardStock(p,m,count){
    rect(p,0,0,1000,563,ramp(p,13,0,958,560,[0,'#242d31'],[.13,'#454c4b'],[.47,'#2b3639'],[.85,'#4d514a'],[1,'#191f25']));
    for(const x of [11,955]){
      rounded(p,x,15,35,532,7,ramp(p,x,0,x+35,0,[0,'#202528'],[.28,'#656b60'],[.62,'#434c48'],[1,'#272c30']),'#151e20',1.7);
      for(const y of [47,506]){rounded(p,x+9,y-5,17,10,4,'#1a2022','#797c6b',.85);machineScrew(p,x+17,y,3.8,(x+y)*.032);}
      speakerMesh(p,x+9,150,17,215,5);
    }
    rounded(p,51,19,898,521,5,'#263335','#7c8575',1.5);
    rounded(p,62,30,876,111,3,ramp(p,30,0,802,160,[0,'#404741'],[.6,'#434943'],[1,'#273539']),'#1e2a2c',2.2);
    meterBezel(p,80,45,129,74);meterBezel(p,219,45,129,74);
    rounded(p,365,44,410,77,3,'#111f25','#818674',1);
    rect(p,370,49,400,67,ramp(p,370,49,770,116,[0,'#223c3b'],[.70,'#152c32'],[1,'#11282c']));
    for(let x=377;x<771;x+=12.5)rect(p,x,49,.65,67,'#98af813e');
    for(let y=56;y<116;y+=12)rect(p,371,y,398,.7,'#a2b28b31');
    for(const x of [817,883])rotary(p,x,82,19);
    rounded(p,64,150,872,291,4,'#162529','#687669',1.4);
    for(let i=0;i<count;i++){
      const [cx,cy]=seatAt(m,i),x=cx-m.w/2+2,y=cy-m.h/2+2,w=m.w-4,h=m.h-4;
      rounded(p,x,y,w,h,Math.min(5,h*.09),ramp(p,x,y,x+w*.6,y+h,[0,'#162b2c'],[.45,'#243f39'],[.82,'#213c37'],[1,'#15292b']),'#5e6f5e',1);
      rect(p,x+3,y+3,w-6,2.5,'#0c2025');
      p.save();p.beginPath();p.rect(x+4,y+4,w-8,h-8);p.clip();
      for(let j=0;j<h;j+=4.2)rect(p,x,y+j,w,.75,'#091f244f');
      if(count<=6){
        shape(p,'M'+(x+4)+' '+(y+9)+'L'+(x+w*.78)+' '+(y+3)+'L'+(x+w*.42)+' '+(y+15)+'L'+(x+4)+' '+(y+23)+'Z','#d2d6b912');
        for(let j=0;j<28;j++){const at=x+12+j*(w-24)/27;rect(p,at,y+h-13,1,j%3?2:4,'#8ca88b62');}
      }
      p.restore();
    }
    rounded(p,65,449,870,64,2,ramp(p,0,449,0,513,[0,'#33382f'],[.14,'#828575'],[.38,'#b2ac8e'],[.62,'#a2a185'],[.88,'#868777'],[1,'#363c36']),'#151f22',2);
    for(const x of [68,913]){
      rounded(p,x,447,20,68,4,ramp(p,x,448,x+20,448,[0,'#222c2d'],[.22,'#888c79'],[.5,'#505c55'],[1,'#19272a']));
      for(let y=451;y<511;y+=4)rect(p,x+3,y,14,.9,'#1e2c31');
    }
    for(const x of [60,939])for(const y of [26,532])machineScrew(p,x,y,3.5,x*.03);
    scratches(p,825,800,['#b8baa318','#0c151829']);
  }
  function exchangeWave(g,x,y,w,h,time,gain,color){
    const pts=[];
    for(let j=0;j<=160;j++){
      const u=j/160,v=voice(u,time)+.17*Math.sin(u*41+time*2)*Math.sin(u*Math.PI);
      pts.push([x+u*w,y+h*v*gain]);
    }
    stroke(g,pts,color,1.55);
  }
  const contactClicks=[.24,.84,1.44];
  function channelFor(i,count){return Math.floor(i*Math.min(3,count)/count);}
  function lineMonitor(g,count,time,feed,values,age){
    materialPlate(g,'first',count,switchboardStock);
    const m=ticketLayout('first',count),rolling=age===null;
    const activity=rolling?1:1-smooth((age-.15)/1.43);
    meterNeedle(g,80,45,129,74,.21+activity*(.48+.19*Math.sin(time*3.2)));
    meterNeedle(g,219,45,129,74,.19+activity*(.40+.26*Math.sin(time*4.1+.8)));
    exchangeWave(g,373,82,394,22,time,activity*.92+.055,'#c0d2a1');
    for(let i=0;i<count;i++){
      const [x,y]=seatAt(m,i),lane=channelFor(i,count),at=contactClicks[lane];
      const locked=!rolling&&age>=at,settle=locked?smooth((age-at)/.27):0;
      const code=locked?ticket(values[i]):feed?.deck?candidateAt(feed,m,i):null;
      if(!code)continue;
      if(count<=6){
        const width=m.w*.70,baseline=y-m.h*.28;
        exchangeWave(g,x-width*.5,baseline,width,Math.min(12,m.h*.085),time+lane*2.13,locked?(1-settle)*.6+.035:.77,'#96ad82');
      }
      g.save();g.globalAlpha*=.10;glassTicket(g,'8888888',x,y,m.size,'#b6cca4');g.restore();
      if(locked&&settle<1){g.save();g.globalAlpha*=1-settle;g.shadowColor='#e8edb4';g.shadowBlur=7;glassTicket(g,code,x,y,m.size,'#f2edac');g.restore();}
      glassTicket(g,code,x,y,m.size,locked?'#dbf5bb':'#c1cf97');
      const r=Math.min(4.2,m.h*.06);
      contactLamp(g,x-m.w*.40,y-m.h*.34,r,locked?1:.18+.32*(1+Math.sin(time*2.4+lane))*.5,false);
    }
    for(let i=0;i<Math.min(3,count);i++)contactLamp(g,453+i*44,132,3.1,rolling?.30+.2*Math.sin(time*2+i):smooth((age-contactClicks[i])/.12),false);
    const tape=rolling?1:1-smooth((age-.47)/.86);
    g.save();g.beginPath();g.rect(91,450,818,62);g.clip();
    if(tape>0&&feed?.deck){
      g.globalAlpha*=tape*.88;
      for(let lane=0;lane<2;lane++){
        const scroll=time*(lane?14:-19),shift=wrapIndex(scroll,65),index=Math.floor(scroll/65);
        for(let j=-1;j<14;j++){
          const x=95+j*65+shift;if(x<102||x>898)continue;
          serialType(g,runningTicket(feed,m.rows+lane,m.rows+2,j-index),x,467+lane*24,'600 16px '+typewriter,54,'#343b35');
        }
      }
    }
    if(tape<1){g.globalAlpha=1-tape;exchangeWave(g,94,482,814,12,1.24,1,'#414d40');}
    g.restore();
  }
  function deskPickup(g,t,connected,level){
    // The same pick-up jack and pilot are seen again on the full receiver.
    const lead=connected?smooth(level):0;
    g.save();g.lineCap='round';
    const cable='M684 416C635 442 648 479 558 474S454 419 421 431C389 444 392 466 353 463L308 455';
    shape(g,cable,null,'#17232699',7.9);shape(g,cable,null,'#303d39',4.1);shape(g,cable,null,'#b8ad826e',1);
    const desk=g===ctx?surfacePose(g,[0,0],[WIDTH,0],[0,HEIGHT]):null;
    g.translate(222,426);g.transform(1,-.046,-.24,.70,0,0);
    poly(g,[[-91,-45],[102,-45],[112,47],[109,62],[-85,62],[-95,48]],'#243134','#111e21',2);
    rounded(g,-94,-53,203,105,7,ramp(g,-90,-54,99,53,[0,'#6b7468'],[.24,'#515d55'],[.75,'#354744'],[1,'#6a6a59']),'#9b9c83',1.6);
    meterBezel(g,-74,-34,87,48);meterNeedle(g,-74,-34,87,48,.15+lead*(.52+.21*Math.sin(t*3.1)));
    speakerMesh(g,24,-32,64,29,4);rotary(g,40,22,11);contactLamp(g,78,18,4,lead,false);
    for(const x of [-82,96])for(const y of [-41,39])machineScrew(g,x,y,2.3,.4);
    for(const y of [26,33])rect(g,-70,y,70,2,'#2a3936');
    if(desk){
      // Register the desk gauge to the first meter on the rack, including perspective and camera framing.
      const gauge=(x,y)=>[-74+(x-80)*87/129,-34+(y-45)*48/74];
      livePickup={desk,gauge:surfacePose(g,gauge(0,0),gauge(WIDTH,0),gauge(0,HEIGHT))};
    }
    g.restore();
  }


// Identity check
  function midnightHarbor(p){
    rect(p,0,0,1000,563,ramp(p,0,0,704,560,[0,'#111e34'],[.28,'#263e54'],[.57,'#546877'],[.76,'#696b73'],[1,'#263441']));
    rect(p,0,0,1000,563,flare(p,689,227,457,[0,'#cfa98274'],[.38,'#96757829'],[1,'#4a566000']));
    const rng=seeded(4289);
    for(let layer=0;layer<3;layer++){
      let x=-40;
      while(x<1025){
        const w=10+rng()*(16+layer*12),h=20+rng()*(31+layer*16),base=259+layer*29+rng()*13;
        const y=base-h;
        rect(p,x,y,w,h+35,['#536172','#354e5d','#293e4e'][layer]);
        rect(p,x+w*.69,y,w*.31,h+34,['#4d5e70','#344957','#273847'][layer]);
        if(w>24)rect(p,x+w*.22,y-4-rng()*6,w*.36,12,['#4e6171','#3d5360','#334352'][layer]);
        for(let k=3;k<w-3;k+=4.1)for(let l=6;l<h;l+=6.9){
          if(rng()<.41)rect(p,x+k,y+l,1.2+rng()*2.4,1.4,['#dbb18686','#a0c9c88c','#d783718b','#b8a89b77'][Math.floor(rng()*4)]);
        }
        if(layer===2)stroke(p,[[x,y+1],[x+w,y+1]],'#bc998460',1);
        x+=w+1.5+rng()*6;
      }
    }
    for(const [x,h] of [[197,155],[236,175],[654,99],[785,138]]){
      const w=16+x%19,y=304-h;
      rect(p,x,y,w,h,'#304253');poly(p,[[x,y],[x+w*.45,y-9],[x+w,y],[x+w,304],[x+w*.63,305],[x+w*.63,y+4]],'#263849');
      stroke(p,[[x+2,y+3],[x+2,y+h-2]],'#c1998c7a',1.2);
      for(let j=8;j<h-3;j+=7)rect(p,x+3,y+j,w-7,1.2,j%3?'#a7bfc275':'#d9b68b8c');
    }
    // A stepped mast and a braced tower read through the rain from both reverse angles.
    poly(p,[[313,268],[313,201],[320,201],[320,171],[329,162],[329,145],[334,141],[341,169],[345,176],[345,268]],'#354957');
    stroke(p,[[329,147],[332,122],[333,144]],'#596875',1.2);
    for(let y=182;y<250;y+=6)rect(p,321,y,16,.85,y%4?'#af9d878c':'#7496a3');
    poly(p,[[698,282],[698,173],[710,155],[724,178],[735,178],[735,282]],'#364652');
    for(let y=178;y<273;y+=22){
      stroke(p,[[699,y+21],[722,y],[701,y]],'#b7bab06b',1.15);
      stroke(p,[[703,y],[724,y+20],[735,y+8]],'#87989e77',.9);
    }
    for(const [x,y] of [[332,122],[709,155],[644,212]]){oval(p,x,y,2.2,1.8,'#d7836c66');rect(p,x-.65,y-.5,1.3,1,'#efaf87');}
    rect(p,0,282,1000,79,ramp(p,0,282,0,361,[0,'#7d8a9200'],[.46,'#8c909c48'],[1,'#6d818b14']));
    poly(p,[[0,335],[1000,309],[1000,563],[0,563]],ramp(p,0,326,827,572,[0,'#2a3d48'],[.41,'#3f515b'],[.77,'#334550'],[1,'#222f3d']));
    for(let k=0;k<22;k++){
      const x=rng()*1000,y=342+rng()*210,w=26+rng()*135;
      oval(p,x,y,w,1.3+rng()*2.7,k%3?'#1029377a':'#c2aa8a53',-.039);
    }
    for(let k=0;k<430;k++){
      const x=rng()*1000,y=334+rng()*225;stroke(p,[[x,y],[x+2+rng()*21,y-.6]],k%5?'#b0bfbd28':'#d1ad8d50',rng()+.45);
    }
    for(let i=-2;i<9;i++)stroke(p,[[445+i*58,321],[i*211-133,563]],'#12283769',1.5);
    for(const [x,y,w] of [[25,388,118],[787,362,97],[240,514,117]]){
      poly(p,[[x,y],[x+w,y-4],[x+w+12,y-1],[x+7,y+5]],'#172c36','#88999657',.8);
      for(let i=0;i<12;i++)stroke(p,[[x+6+i*w/12,y+.8-i*.27],[x+8+i*w/12,y+3.1-i*.27]],'#72868a74',1.05);
    }
    // Long rain rails frame the actors horizontally. The utility beacon sits behind the right shoulder.
    for(const x of [32,185,341,498,658,828,976])stroke(p,[[x,256-x*.019],[x+1,332-x*.019]],'#253440',3);
    for(const yy of [252,276]){
      stroke(p,[[0,yy],[1000,yy-19]],'#192b39',4);stroke(p,[[0,yy-2],[1000,yy-21]],'#b1ada183',1);
    }
    antenna(p,765,192,.56,'#293a45','#657781');
    shape(p,'M758 164Q739 197 710 185M776 172Q832 220 911 190',null,'#374952',1);
    rect(p,0,0,1000,563,flare(p,515,235,635,[0,'#07152600'],[.64,'#101c2d0c'],[1,'#0813218a']));
  }
  // The reverse shots and the distant walkers use the same unlit head shapes.
  function witnessHead(tiedHair) {
    return cached(tiedHair ? 'roof-head-knot' : 'roof-head-crop', 180, 210, p => {
      p.translate(-80, -62);
      p.lineCap = 'round';
      p.lineJoin = 'round';

      const profile = tiedHair
        ? 'M124 151 C119 115 140 88 169 87 C196 86 210 101 214 119 C217 133 215 145 218 153 Q216 163 224 178 Q232 188 223 190 L218 192 Q215 197 217 202 Q214 205 213 212 Q212 226 202 229 L191 231 L186 245 L207 265 L130 254 L122 207 Z'
        : 'M119 151 C116 118 137 96 168 93 C193 91 210 104 216 122 L220 146 Q225 155 222 161 Q222 171 229 182 Q237 191 230 194 L224 196 Q221 201 222 206 L219 211 Q218 226 211 233 Q205 238 193 237 L196 253 L129 250 L128 211 Z';
      shape(p, profile, ramp(p,175,184,235,167,[0,'#1b2a33'],[.72,'#24313a'],[.93,'#323e43'],[1,tiedHair?'#475457':'#514f46']));
      shape(p, profile, flare(p,238,172,47,[0,tiedHair?'#a6b4b16b':'#b8a1856b'],[.44,'#87958f33'],[1,'#79889800']));

      if (tiedHair) {
        shape(p,'M121 167 C111 164 102 168 99 174 C88 178 85 190 90 200 C92 211 104 218 114 214 C124 212 131 202 129 191 Q131 176 121 167 Z',
          ramp(p,93,206,120,169,[0,'#14212c'],[.78,'#263843'],[1,'#3c4a51']));
        shape(p,'M119 202 Q124 192 122 178 C108 163 105 143 109 125 C110 103 126 85 148 78 C170 67 195 76 209 87 Q225 101 220 122 Q216 113 211 108 C207 130 194 147 186 164 C179 180 173 197 163 207 Q155 218 146 222 L146 213 L138 222 L137 214 Q130 221 128 224 L128 213 Z',
          ramp(p,118,194,199,78,[0,'#14222d'],[.61,'#1c2c37'],[1,'#2a3944']));
        shape(p,'M122 104 C136 83 160 75 181 78 Q198 80 208 89 M91 187 Q87 198 100 207',null,'#83969680',1.35);
        shape(p,'M143 145 C158 126 186 110 195 94',null,'#53687467',1.15);
      } else {
        shape(p,'M128 221 C124 209 115 203 113 194 Q103 183 103 171 L106 175 C97 161 96 143 100 127 C101 111 107 101 120 92 L113 95 C124 82 138 78 152 78 C170 71 190 77 203 84 C214 84 224 94 226 103 L220 100 Q226 111 221 124 L217 117 C214 141 209 159 204 177 C200 192 192 204 181 213 L181 206 Q171 220 161 222 L162 215 Q152 226 144 225 L145 218 L136 224 L135 217 Z',
          ramp(p,115,203,199,85,[0,'#16232d'],[.64,'#1e2d36'],[1,'#2c3a40']));
        shape(p,'M117 97 C131 84 149 79 164 80 M171 78 Q192 77 204 86 M219 96 L223 103',null,'#8e937977',1.25);
        shape(p,'M117 144 C128 128 141 118 157 110 M163 108 Q184 101 194 92',null,'#54646b56',1.15);
      }
    });
  }

  function rooftopReflections(g,m,feed,time,alpha){
    if(alpha<=0||!feed?.deck)return;
    const left=m.left+2,right=m.right-2,pitch=43;
    g.save();g.beginPath();g.rect(left,0,right-left,HEIGHT);g.clip();
    for(let row=0;row<2;row++){
      const move=time*(row?-12:16),phase=wrapIndex(move,pitch),off=Math.floor(move/pitch);
      for(let j=-1;j<Math.ceil((right-left)/pitch);j++){
        const x=left+j*pitch+phase;if(x<left||x>right)continue;
        const edge=clamp(Math.min(x-left,right-x)/43);
        g.globalAlpha=alpha*edge*(row?.59:.67);
        const y=(row?m.bottom+15:m.top-14)-(x-521)*.012;
        serialType(g,runningTicket(feed,m.rows+row,m.rows+2,j-off),x,y,'500 13px '+typewriter,pitch-6,row?'#b9c6b9':'#d4d8c5');
      }
    }
    g.restore();
  }

  function identityFrame(g,count,time,feed,values,age,open=1){
    roofTake(g,time);
    if(open>0)identityNumbers(g,count,time,feed,values,age,open);
  }
  function identityNumbers(g,count,time,feed,values,age,open){
    const m=ticketLayout('grand',count),rolling=age===null;
    rooftopReflections(g,m,feed,time,open*(rolling?1:1-smooth((age-.13)/.57)));
    const font='600 '+m.size+'px "Bahnschrift","Arial",sans-serif';
    for(let i=0;i<count;i++){
      const [x,y]=seatAt(m,i);
      const word=feed?.deck?candidateAt(feed,m,i):null;
      const winner=rolling?null:ticket(values[i]);
      // Draw one string in one seat throughout. Each wheel catches in turn on the caller's cue.
      const firstStop=count===1?.17:.48+.11*(i%Math.min(4,count))/Math.min(4,count);
      const caught=rolling?0:Math.min(winner.length,Math.max(0,1+Math.floor((age-firstStop)/.049)));
      const digits=caught===winner?.length||!word?winner:rolling?word:winner.slice(0,caught)+word.slice(caught);
      if(!digits)continue;
      g.save();g.globalAlpha=open;g.shadowColor='#112128a3';g.shadowBlur=3;
      serialType(g,digits,x,y,font,m.w*.94,caught===winner?.length?'#f1e6cd':'#e6e4d3');g.restore();
    }
  }


// Reader rig
// The transport is built in the XY plane. The operator sees it from +Z.
// The CRT aperture is shared by the physical camera and the live phosphor compositor.
const readerAperture = {x: -.63, y: -1.21, z: .784, width: 3.58, height: 3.58 * 9 / 16};
const readerPushSeconds = 1.55;

function makeReaderRig(T, output) {
  const renderer = new T.WebGLRenderer({canvas:output, alpha:false, antialias:true, powerPreference:'low-power'});
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.24;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0x122326);
  scene.fog = new T.Fog(0x22393c,19,34);
  const camera = new T.OrthographicCamera(-6,6,3.375,-3.375,.1,100);
  const enclosure = new T.Group();
  scene.add(enclosure);
  const tau = Math.PI * 2;
  const vector = (x,y,z) => new T.Vector3(x,y,z);
  let seed = 87139;
  const rand = () => ((seed = (Math.imul(seed,1664525) + 1013904223) >>> 0) / 4294967296);
  function texture(w,h,paint) {
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    paint(canvas.getContext('2d'),w,h);
    const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return map;
  }
  const mat = (color, roughness, metalness=0, more={}) => new T.MeshStandardMaterial({color,roughness,metalness,...more});
  const grain = texture(256,256,(g,w,h)=>{
    const px=g.createImageData(w,h);
    for(let i=0;i<px.data.length;i+=4){const tone=192+rand()*49;px.data.set([tone,tone,tone,255],i);}
    g.putImageData(px,0,0);
  });
  grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(3,3);
  const enamel=mat(0x345353,.44,.37,{map:grain});
  const panel=mat(0x566c66,.49,.34,{map:grain});
  const edge=mat(0x677c77,.35,.67);
  const dark=mat(0x152426,.45,.55);
  const rubber=mat(0x141c1d,.77,.035,{map:grain});
  const nickel=mat(0x98a9a5,.29,.90);
  const polished=mat(0xbac3b8,.19,.94);
  const bronze=mat(0xae7843,.31,.76);
  const chrome=mat(0xc7bfa1,.27,.89);
  const copper=mat(0x794838,.42,.69);
  const coil=mat(0x99774d,.68,.08);
  const ivory=mat(0xb9ae8d,.43,.14);
  const red=mat(0x733d30,.31,.30);
  const amber=mat(0xb87635,.23,.19,{emissive:0xdf651a,emissiveIntensity:.7});
  const green=mat(0x8aaf89,.24,.22,{emissive:0x71ac86,emissiveIntensity:.52});
  const glass=mat(0x102726,.20,.4);
  const metalCache=new Map();
  function mesh(parent,geo,material,x=0,y=0,z=0){
    const part=new T.Mesh(geo,material);
    part.position.set(x,y,z);part.castShadow=true;part.receiveShadow=true;parent.add(part);return part;
  }
  function roundedPath(path,w,h,r,clockwise=false) {
    const x=-w/2,y=-h/2,a=w/2,b=h/2;
    if(clockwise){
      path.moveTo(x+r,y);path.quadraticCurveTo(x,y,x,y+r);path.lineTo(x,b-r);
      path.quadraticCurveTo(x,b,x+r,b);path.lineTo(a-r,b);path.quadraticCurveTo(a,b,a,b-r);
      path.lineTo(a,y+r);path.quadraticCurveTo(a,y,a-r,y);path.lineTo(x+r,y);
    }else{
      path.moveTo(x+r,y);path.lineTo(a-r,y);path.quadraticCurveTo(a,y,a,y+r);path.lineTo(a,b-r);
      path.quadraticCurveTo(a,b,a-r,b);path.lineTo(x+r,b);path.quadraticCurveTo(x,b,x,b-r);
      path.lineTo(x,y+r);path.quadraticCurveTo(x,y,x+r,y);
    }
    path.closePath();return path;
  }
  function extrusion(shape,depth,bevel,segments=3) {
    return new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,
      bevelSegments:segments,curveSegments:32,steps:1});
  }
  // z is the rear face, not the center, so the edges of neighbouring castings mate.
  function block(parent,x,y,z,w,h,d,r,material,bevel=.025){
    const key=[w,h,d,r,bevel].join('/');
    if(!metalCache.has(key))metalCache.set(key,extrusion(roundedPath(new T.Shape(),w,h,r),d,bevel));
    return mesh(parent,metalCache.get(key),material,x,y,z);
  }
  function rim(parent,x,y,z,w,h,openingW,openingH,corner,d,material,bevel=.025){
    const path=roundedPath(new T.Shape(),w,h,corner);
    path.holes.push(roundedPath(new T.Path(),openingW,openingH,Math.max(.035,corner*.72),true));
    return mesh(parent,extrusion(path,d,bevel),material,x,y,z);
  }
  function drum(parent,x,y,z,r,depth,material,segments=48){
    const key='c/'+[r,depth,segments].join('/');
    if(!metalCache.has(key)){const geo=new T.CylinderGeometry(r,r,depth,segments);geo.rotateX(Math.PI/2);metalCache.set(key,geo);}
    return mesh(parent,metalCache.get(key),material,x,y,z);
  }
  function torus(parent,x,y,z,r,tube,material){
    const key='t/'+r+'/'+tube;
    if(!metalCache.has(key))metalCache.set(key,new T.TorusGeometry(r,tube,7,72));
    return mesh(parent,metalCache.get(key),material,x,y,z);
  }
  function cable(parent,points,r,material,segments=28){
    const line=new T.CatmullRomCurve3(points.map(v=>vector(...v)));
    return mesh(parent,new T.TubeGeometry(line,segments,r,7,false),material);
  }
  function screw(parent,x,y,z,r=.065,angle=.45){
    drum(parent,x,y,z,r,.033,nickel,24);
    const slot=block(parent,x,y,z+.018,r*1.34,r*.21,.004,r*.09,dark,.002);slot.rotation.z=angle;
  }
  function decal(parent,tex,x,y,z,w,h){
    const ink=mat(0xffffff,.77,.08,{map:tex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    const part=mesh(parent,new T.PlaneGeometry(w,h),ink,x,y,z);
    part.castShadow=false;return part;
  }

  // Broad practical lights produce real reflections in the spun metal, Bakelite and glass.
  const studio=new T.Scene();studio.background=new T.Color(0x465455);
  function softbox(x,y,z,w,h,color,power) {
    const card=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({color:new T.Color(color).multiplyScalar(power),side:T.DoubleSide}));
    card.position.set(x,y,z);card.lookAt(0,0,0);studio.add(card);
  }
  softbox(-6,6,5,7.5,2.1,0xffd6a0,5.0);
  softbox(5,3,2,2.1,7.8,0xa6dfe5,3.4);
  softbox(1,-2,7,6,.75,0xe6c8a3,1.75);
  softbox(-2,-.7,7.2,3.8,5.0,0xf6d9ac,3.5);
  const pmrem=new T.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(studio,.035);scene.environment=environment.texture;
  scene.environmentIntensity=1.1;
  pmrem.dispose();studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  scene.add(new T.HemisphereLight(0xb9dada,0x45392f,1.0));
  const key=new T.DirectionalLight(0xffdaad,1.85);key.position.set(-4.5,7,7.5);
  key.castShadow=true;key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-7.8,right:7.8,top:6,bottom:-6,near:.3,far:27});
  key.shadow.normalBias=.018;key.shadow.bias=-.00015;scene.add(key);
  const rimLight=new T.DirectionalLight(0x8fd4e1,2.0);rimLight.position.set(5,3,-1);scene.add(rimLight);
  const deskLamp=new T.PointLight(0xffcb9c,37,20);deskLamp.position.set(-3.6,3.8,4.8);scene.add(deskLamp);
  const windowBounce=new T.PointLight(0x9dd9df,23,18);windowBounce.position.set(5.3,2.7,3.2);scene.add(windowBounce);

  // Bench, rubber isolation feet, rear cable loom and the cool window beyond the bench.
  const wood=texture(768,192,(g,w,h)=>{
    g.fillStyle='#635246';g.fillRect(0,0,w,h);
    for(let i=0;i<1400;i++){const y=rand()*h;g.strokeStyle=rand()<.48?'rgba(24,16,13,.13)':'rgba(212,175,120,.10)';
      g.lineWidth=.25+rand()*1.3;g.beginPath();g.moveTo(0,y);g.bezierCurveTo(w*.4,y-1-rand()*3,w*.7,y+4*rand(),w,y+2);g.stroke();}
  });
  wood.wrapS=wood.wrapT=T.RepeatWrapping;wood.repeat.set(2.2,2);
  const desk=mesh(scene,new T.BoxGeometry(35,.34,13),mat(0xb1a68a,.55,.11,{map:wood}),0,-3.03,0);
  desk.castShadow=false;
  const wall=mat(0x243739,.84,.08);
  block(scene,0,3,-6.3,31,13,.18,.1,wall,.03);
  const windowMat=mat(0x385d67,.47,.21,{emissive:0x315b64,emissiveIntensity:.52});
  block(scene,-4,2.2,-5.95,9.4,4.4,.05,.06,windowMat);
  for(let i=0;i<9;i++){
    const slat=block(scene,-4,.43+i*.46,-5.81,9.4,.16,.14,.01,dark,.01);slat.rotation.z=-.017;
  }
  for(let i=0;i<3;i++)cable(scene,[[4.65,-1.7+i*.19,-.85],[5.25,-2.56+i*.12,-1.4],[6.1,-2.78,-2.4],[4.98+i*.3,-2.8,-3.8],[7.5,-2.65,-5.1]],.078,rubber);
  for(const x of [-3.93,3.93]){
    block(enclosure,x,-2.67,-.63,1.18,.35,1.38,.11,rubber,.055);
    block(enclosure,x,-2.47,-.6,1.02,.10,1.10,.07,dark,.027);
  }
  block(enclosure,0,.01,-1.52,10.25,5.00,1.52,.28,enamel,.12);
  block(enclosure,0,.04,.04,10.11,4.91,.11,.23,rubber,.045);
  const paintSkin=texture(1000,490,(g,w,h)=>{
    const wash=g.createLinearGradient(0,0,w,h);wash.addColorStop(0,'#d3cec0');wash.addColorStop(.33,'#e3e4d7');wash.addColorStop(.72,'#b7c4bf');wash.addColorStop(1,'#879d9e');
    g.fillStyle=wash;g.fillRect(0,0,w,h);
    for(let i=0;i<72000;i++){g.fillStyle=rand()<.53?'rgba(36,46,41,.115)':'rgba(248,236,212,.135)';g.fillRect(rand()*w,rand()*h,1+rand(),1);}
    for(let i=0;i<2000;i++){const x=rand()*w,y=rand()*h;
      if(x>28&&x<w-28&&y>24&&y<h-24&&rand()>.15)continue;
      g.strokeStyle=rand()<.55?'rgba(16,32,32,.34)':'rgba(242,230,204,.52)';g.lineWidth=.5+rand();g.beginPath();g.moveTo(x,y);g.lineTo(x+1+rand()*8,y+rand()*3-1.5);g.stroke();}
    for(const [x,y,r] of [[209,147,119],[442,131,90],[580,335,119],[812,154,113],[135,388,64]]){
      const wear=g.createRadialGradient(x,y,r*.65,x,y,r*1.13);wear.addColorStop(0,'rgba(55,43,27,0)');wear.addColorStop(.8,'rgba(50,47,32,.19)');wear.addColorStop(1,'rgba(56,48,28,0)');
      g.fillStyle=wear;g.fillRect(x-r*1.2,y-r*1.2,r*2.4,r*2.4);
    }
  });
  const frontMat=panel.clone();frontMat.map=paintSkin;frontMat.bumpMap=grain;frontMat.bumpScale=.017;
  const front=block(enclosure,0,.04,.16,9.99,4.82,.10,.20,frontMat,.039);
  const fp=front.geometry.attributes.position,fu=front.geometry.attributes.uv;
  for(let i=0;i<fp.count;i++)fu.setXY(i,.5+fp.getX(i)/10,.5+fp.getY(i)/4.9);
  for(let i=0;i<11;i++){
    const slot=block(enclosure,5.235,.95-i*.19,-.70,.94,.062,.025,.029,dark,.012);slot.rotation.y=Math.PI/2;
  }
  for(const x of [-4.79,4.79])for(const y of [-2.17,2.25])screw(enclosure,x,y,.31,.091,x*y);
  // A folded protective handle and an inset transport bay, rather than a flat rectangular face.
  for(const x of [-4.64,4.66]){
    for(const y of [-1.45,1.55])block(enclosure,x,y,.3,.30,.37,.17,.075,dark);
    cable(enclosure,[[x,-1.45,.39],[x,-1.45,.7],[x,-1.28,.88],[x,1.37,.88],[x,1.55,.70],[x,1.55,.39]],.092,nickel,24);
  }
  block(enclosure,-1.58,.94,.27,5.33,2.15,.075,.18,dark,.033);
  block(enclosure,-1.58,.94,.345,5.17,2.01,.05,.14,enamel,.027);
  for(const x of [-4.01,.84])for(const y of [.02,1.84])screw(enclosure,x,y,.418,.048);
  const stencil=texture(560,92,(g)=>{
    const letters={
      M:[45,'M4 72V9L22 48 40 9V72'], I:[14,'M7 9V72'],
      S:[39,'M34 16Q30 9 21 9H13Q5 9 5 19V29Q5 35 13 39L25 44Q34 48 34 56V62Q34 72 24 72H14Q6 72 3 64'],
      O:[42,'M16 9H26Q36 9 36 20V61Q36 72 25 72H16Q5 72 5 61V20Q5 9 16 9Z'],
      N:[42,'M5 72V9L36 72V9'], '1':[29,'M5 21L19 10V72M8 72H29']};
    g.translate(6,4);g.scale(1.18,1);g.strokeStyle='#eadfc3';g.lineWidth=7;g.lineJoin='bevel';g.lineCap='butt';
    for(const ch of 'MISSION 1'){
      if(ch===' '){g.translate(19,0);continue;}
      const [width,path]=letters[ch];g.stroke(new Path2D(path));
      if(ch==='O'||ch==='S'){g.save();g.globalCompositeOperation='destination-out';g.fillRect(18,4,2.8,73);g.restore();}
      g.translate(width+9,0);
    }
    g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-out';
    for(let i=0;i<550;i++){g.globalAlpha=.17+rand()*.63;g.fillRect(rand()*485,9+rand()*69,1+rand()*3,1);}
  });
  decal(enclosure,stencil,-3.08,2.28,.31,2.42,.36);
  // The double-flanged reels have open, bevelled kidney slots and visible paper windings behind them.
  const rotors=[];
  function reel(x,y,r,slots,faceMaterial,phase){
    drum(enclosure,x,y,.49,r*.89,.20,dark);
    const rotor=new T.Group();rotor.position.set(x,y,.53);enclosure.add(rotor);
    drum(rotor,0,0,.08,r*.88,.09,nickel);
    drum(rotor,0,0,.23,r*.81,.31,coil);
    for(let k=0;k<9;k++)torus(rotor,0,0,.389,(.40+k*.049)*r,.0065, k%3===0?bronze:coil);
    const face=new T.Shape();face.absarc(0,0,r,0,tau,false);
    for(let i=0;i<slots;i++){
      const a=i*tau/slots+.14,half=tau/slots*.29,inner=.39*r,outer=.82*r;
      const point=(radius,angle)=>[radius*Math.cos(angle),radius*Math.sin(angle)];
      const hole=new T.Path();hole.moveTo(...point(inner,a-half+.12));
      hole.absarc(0,0,inner,a-half+.12,a+half-.12,false);
      hole.quadraticCurveTo(...point(inner,a+half),...point(inner+.08*r,a+half));
      hole.lineTo(...point(outer-.10*r,a+half));
      hole.quadraticCurveTo(...point(outer,a+half),...point(outer,a+half-.13));
      hole.absarc(0,0,outer,a+half-.13,a-half+.13,true);
      hole.quadraticCurveTo(...point(outer,a-half),...point(outer-.10*r,a-half));
      hole.lineTo(...point(inner+.08*r,a-half));
      hole.quadraticCurveTo(...point(inner,a-half),...point(inner,a-half+.12));
      hole.closePath();face.holes.push(hole);
    }
    const brushed=texture(512,512,(g,w,h)=>{
      const pixels=g.createImageData(w,h);
      for(let v=0;v<h;v++)for(let u=0;u<w;u++){
        const dx=u-w/2,dy=v-h/2,radius=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
        const reflection=.5+.5*Math.cos(2*(a+.71)+.11*Math.sin(radius*.032));
        const level=100+104*reflection**2+15*Math.sin(radius*2.86)+rand()*19;
        pixels.data.set([level,level,level,255],(v*w+u)*4);
      }
      g.putImageData(pixels,0,0);
    });
    const skin=faceMaterial.clone();skin.map=brushed;skin.color.multiplyScalar(1.25);
    const faceGeo=extrusion(face,.047,.018);
    const pos=faceGeo.getAttribute('position'),uvs=faceGeo.getAttribute('uv');
    for(let i=0;i<pos.count;i++)uvs.setXY(i,.5+pos.getX(i)/(2.05*r),.5+pos.getY(i)/(2.05*r));
    mesh(rotor,faceGeo,skin,0,0,.405);
    torus(rotor,0,0,.45,r*.964,.013,polished);torus(rotor,0,0,.451,r*.908,.008,dark);
    drum(rotor,0,0,.48,.27*r,.12,dark);torus(rotor,0,0,.536,r*.237,.02,chrome);
    drum(rotor,0,0,.556,.152*r,.10,bronze,12);
    const wing=block(rotor,0,0,.61,.40*r,.072,.052,.032,polished,.018);wing.rotation.z=.38;
    torus(rotor,0,0,.544,r*.203,.009,polished);
    for(let i=0;i<slots;i++){const a=(i+.48)*tau/slots;screw(rotor,r*.303*Math.cos(a),r*.303*Math.sin(a),.467,.03,a);}
    rotors.push({rotor,r,phase});return rotor;
  }
  reel(-2.89,.96,1.04,5,nickel,0);
  reel(-.53,1.12,.83,3,chrome,.42);

  const crt=readerAperture;
  const tubeHousing=mat(0x242e2f,.39,.46);
  block(enclosure,crt.x,crt.y,.28,4.20,2.32,.20,.22,dark,.04);
  rim(enclosure,crt.x,crt.y,.48,4.10,2.29,3.76,2.10,.145,.16,tubeHousing,.047);
  rim(enclosure,crt.x,crt.y,.65,3.78,2.13,3.57,2.00,.12,.085,rubber,.026);
  block(enclosure,crt.x,crt.y,.728,crt.width+.015,crt.height+.012,.047,.107,glass,.012);
  for(const x of [crt.x-1.98,crt.x+1.98])for(const y of [crt.y-.99,crt.y+.99])screw(enclosure,x,y,.68,.043,.83);
  // Right-hand read head and drive. The perforated ribbon threads beneath its pressure bridge.
  block(enclosure,2.78,.77,.295,2.75,2.78,.11,.17,dark,.028);
  block(enclosure,2.78,.82,.409,2.58,2.56,.09,.105,panel,.025);
  for(const x of [1.65,3.91])for(const y of [-.27,1.92])screw(enclosure,x,y,.52,.058,x+.5);
  const guideParts=[];
  function guide(x,y,r,z=.7){
    drum(enclosure,x,y,z-.10,r*1.28,.065,nickel);
    drum(enclosure,x,y,z+.03,r,.21,rubber);
    drum(enclosure,x,y,z+.155,r*1.23,.047,bronze);
    drum(enclosure,x,y,z+.196,r*.60,.035,nickel);
    const witness=block(enclosure,x,y,z+.22,r*.78,.018,.009,.005,dark,.003);
    guideParts.push({witness,r});
  }
  guide(1.31,1.63,.166,.70);guide(3.82,.03,.15,.73);guide(2.35,-.04,.125,.72);
  const tapeTexture=texture(512,80,(g,w,h)=>{
    g.fillStyle='#e7c990';g.fillRect(0,0,w,h);
    for(let i=0;i<18000;i++){g.fillStyle=rand()<.5?'rgba(128,78,41,.16)':'rgba(255,248,208,.22)';g.fillRect(rand()*w,rand()*h,1.2,.85);}
    g.fillStyle='#ad7351';g.fillRect(0,4,w,1.5);
    const bytes='MISSION1 SIGNAL ';
    g.globalCompositeOperation='destination-out';
    for(let col=0;col<32;col++){
      const code=bytes.charCodeAt(col%bytes.length);
      for(let bit=0;bit<7;bit++)if((code>>bit)&1){g.beginPath();g.arc(8+col*16,12+bit*8,3.0,0,tau);g.fill();}
      g.beginPath();g.arc(8+col*16,70,2.0,0,tau);g.fill();
    }
  });
  tapeTexture.wrapS=T.RepeatWrapping;
  const tapeMat=mat(0xffffff,.82,.025,{map:tapeTexture,alphaTest:.48,side:T.DoubleSide});
  const threading=[[-2.96,1.82,.76],[-2.29,1.86,.77],[-1.07,1.91,.77],[.27,1.91,.79],
    [1.25,1.81,.82],[1.47,1.70,.85],[1.66,1.47,.90],[2.30,1.16,.92],[2.91,.83,.94],[3.47,.52,.95],[3.95,.15,.93],
    [3.99,-.03,.90],[3.84,-.17,.88],[3.37,-.24,.85],[2.70,-.22,.83],[2.32,-.18,.83],[2.17,-.06,.81],[1.81,.18,.79],[.92,.30,.77],[-.49,.45,.76]];
  const track=new T.CatmullRomCurve3(threading.map(a=>vector(...a)),false,'centripetal');
  const vertices=[],uv=[],indices=[],length=track.getLength(),steps=130;
  for(let j=0;j<=steps;j++){
    const u=j/steps,p=track.getPointAt(u),t=track.getTangentAt(u);
    const twist=Math.max(0,Math.min(1,Math.min((u-.28)*9,(.83-u)*9)));
    const width=vector(-t.y*twist,t.x*twist,.92-.80*twist).normalize().multiplyScalar(.148);
    vertices.push(...p.clone().sub(width).toArray(),...p.clone().add(width).toArray());uv.push(u*length/3.8,0,u*length/3.8,1);
    if(j){const k=j*2;indices.push(k-2,k-1,k,k,k-1,k+1);}
  }
  const ribbon=new T.BufferGeometry();
  ribbon.setAttribute('position',new T.Float32BufferAttribute(vertices,3));ribbon.setAttribute('uv',new T.Float32BufferAttribute(uv,2));ribbon.setIndex(indices);ribbon.computeVertexNormals();
  mesh(enclosure,ribbon,tapeMat);
  const readerHead=new T.Group();readerHead.position.set(2.87,.82,.55);readerHead.rotation.z=-.48;enclosure.add(readerHead);
  block(readerHead,0,0,0,1.1,.57,.19,.09,rubber);
  for(const y of [-.265,.265])block(readerHead,0,y,.17,1.1,.115,.32,.045,bronze,.018);
  block(readerHead,0,0,.485,.28,.65,.085,.053,nickel,.022);
  for(let i=0;i<7;i++)block(readerHead,.24,(i-3)*.063,.33,.21,.028,.066,.01,copper,.008);
  for(const y of [-.22,.22])screw(readerHead,0,y,.59,.046,.66);
  const spring=[];
  for(let j=0;j<=116;j++){const u=j/116,a=u*tau*9;
    spring.push([1.85+.76*u,1.79+.053*Math.cos(a),.64+.053*Math.sin(a)]);}
  cable(enclosure,spring,.012,polished,138);
  for(const x of [1.81,2.65])drum(enclosure,x,1.79,.60,.083,.16,nickel);
  block(enclosure,3.37,1.68,.53,.58,.21,.07,.039,rubber);
  block(enclosure,3.37,1.68,.608,.44,.11,.057,.028,amber,.016);
  // Switch bank, knurled gain control, louvres and jewelled pilot lamps.
  block(enclosure,3.00,-1.58,.292,2.52,1.18,.08,.105,dark);
  for(const [i,material] of [ivory,ivory,red].entries()){
    const x=2.00+i*.36;
    block(enclosure,x,-1.68,.38,.28,.44,.095,.04,rubber,.012);
    const cap=block(enclosure,x,-1.66,.45,.22,.36,.16,.03,material,.028);cap.rotation.x=.09;
  }
  function knurled(x,y,r){
    drum(enclosure,x,y,.49,r*1.19,.07,nickel);drum(enclosure,x,y,.64,r,.26,dark);
    for(let i=0;i<28;i++){const a=i*tau/28;
      const rib=block(enclosure,x+r*.94*Math.cos(a),y+r*.94*Math.sin(a),.54,.027,r*.14,.20,.007,rubber,.005);rib.rotation.z=a;}
    drum(enclosure,x,y,.80,r*.87,.065,panel);torus(enclosure,x,y,.845,r*.71,.012,nickel);
    block(enclosure,x+.06,y+.11,.844,.025,.13,.01,.007,ivory,.002).rotation.z=-.47;
  }
  knurled(3.85,-1.6,.30);
  for(const [i,lamp] of [amber,green].entries()){
    const x=2.08+i*.42,y=-1.18;
    drum(enclosure,x,y,.39,.107,.08,chrome);drum(enclosure,x,y,.452,.072,.065,lamp);
    torus(enclosure,x,y,.472,.081,.012,dark);
  }
  for(let i=0;i<4;i++)block(enclosure,-3.68,-.35-i*.123,.293,.81,.043,.02,.018,dark,.008);
  const meterDial=texture(256,256,(g)=>{
    const grd=g.createLinearGradient(0,0,0,256);grd.addColorStop(0,'#796d57');grd.addColorStop(.35,'#e6cf9e');grd.addColorStop(1,'#bca37a');
    g.fillStyle=grd;g.fillRect(0,0,256,256);
    for(let i=0;i<=30;i++){const a=(-.88+i*1.76/30)-Math.PI/2;g.strokeStyle=i>24?'#994735':'#35413d';g.lineWidth=i%5?2:4;
      g.beginPath();g.moveTo(128+Math.cos(a)*106,173+Math.sin(a)*106);g.lineTo(128+Math.cos(a)*(i%5?98:87),173+Math.sin(a)*(i%5?98:87));g.stroke();}
    g.strokeStyle='#6d3329';g.lineWidth=4;g.beginPath();g.moveTo(128,173);g.lineTo(172,75);g.stroke();
    g.fillStyle='#504c40';g.beginPath();g.arc(128,176,12,0,tau);g.fill();
    g.fillStyle='rgba(255,250,212,.17)';g.beginPath();g.moveTo(0,110);g.lineTo(247,0);g.lineTo(257,23);g.lineTo(0,142);g.fill();
  });
  drum(enclosure,-3.64,-1.30,.37,.40,.14,dark);torus(enclosure,-3.64,-1.30,.47,.34,.047,chrome);
  const meter=mesh(enclosure,new T.CircleGeometry(.325,56),mat(0xffffff,.36,.10,{map:meterDial}),-3.64,-1.30,.465);meter.castShadow=false;
  const jackX=-3.66,jackY=-2.02;
  drum(enclosure,jackX,jackY,.40,.19,.17,nickel,12);drum(enclosure,jackX,jackY,.54,.135,.23,rubber);
  cable(enclosure,[[jackX,jackY,.64],[-3.66,-2.2,1.03],[-3.95,-2.71,1.29],[-4.72,-2.88,1.75],[-5.74,-2.87,2.0],[-7,-2.87,1.34]],.053,rubber);
  for(let i=0;i<5;i++)torus(enclosure,jackX,jackY,.49+i*.05,.134-i*.004,.012,dark);

  // Merge fixed fittings by material. Moving reel geometry is batched in its own pivot space.
  function batch(parent,excluded) {
    parent.updateWorldMatrix(true,true);
    const inverse=parent.matrixWorld.clone().invert(),groups=new Map(),relative=new T.Matrix4();
    const walk=node=>{
      if(excluded.has(node))return;
      if(node.isMesh&&!node.material.transparent){
        const id=node.material.uuid+'/'+node.castShadow;
        if(!groups.has(id))groups.set(id,[]);
        groups.get(id).push(node);
      }
      for(const child of node.children)walk(child);
    };
    for(const child of parent.children)walk(child);
    for(const group of groups.values()){
      if(group.length<2)continue;
      const positions=[],normals=[],uvs=[];
      for(const part of group){
        relative.multiplyMatrices(inverse,part.matrixWorld);
        const geo=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
        geo.applyMatrix4(relative);
        for(const [list,key] of [[positions,'position'],[normals,'normal'],[uvs,'uv']]){
          const data=geo.getAttribute(key).array;for(let i=0;i<data.length;i++)list.push(data[i]);
        }
        part.removeFromParent();geo.dispose();
      }
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
      geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
      mesh(parent,geo,group[0].material).castShadow=group[0].castShadow;
    }
  }
  const moving=new Set([...rotors.map(o=>o.rotor),...guideParts.map(o=>o.witness)]);
  for(const {rotor} of rotors)batch(rotor,new Set());
  batch(enclosure,moving);
  const heroTarget=vector(-.03,-.12,.25),tubeCenter=vector(crt.x,crt.y,crt.z);
  const heroEye=vector(4.9,3.45,15),faceEye=vector(0,0,15);
  let pixelWidth=0,pixelHeight=0;
  function imagePoint(x,y,z){
    const p=vector(x,y,z).project(camera);
    return [(p.x+1)*500,(1-p.y)*281.25];
  }
  function photograph(time,focus,w,h,loopPhase=null){
    if(w!==pixelWidth||h!==pixelHeight){renderer.setSize(w,h,false);pixelWidth=w;pixelHeight=h;}
    const width=12.12*Math.pow(crt.width/12.12,focus);
    camera.left=-width/2;camera.right=width/2;camera.top=width*9/32;camera.bottom=-camera.top;
    const target=heroTarget.clone().lerp(tubeCenter,focus);
    camera.position.copy(heroEye).lerp(faceEye,focus).add(target);
    camera.up.set(0,1,0);camera.lookAt(target);camera.rotateZ(.022*(1-focus));camera.updateProjectionMatrix();camera.updateMatrixWorld();
    const travel=time*.38;
    for(const {rotor,r,phase} of rotors)rotor.rotation.z=phase-(loopPhase===null?travel/(r*.81):tau*loopPhase);
    for(const {witness,r} of guideParts)witness.rotation.z=-(loopPhase===null?travel/r:tau*4*loopPhase);
    tapeTexture.offset.x=-(loopPhase===null?travel/3.8:loopPhase);
    amber.emissiveIntensity=.62+.19*Math.sin(loopPhase===null?time*4.3:tau*loopPhase);
    renderer.render(scene,camera);
    const x=crt.x-crt.width/2,y=crt.y+crt.height/2;
    return {glass:[imagePoint(x,y,crt.z),imagePoint(x+crt.width,y,crt.z),imagePoint(x,y-crt.height,crt.z)],
      hub:imagePoint(-2.89,.96,.98),rim:imagePoint(-1.85,.96,.98)};
  }
  return {photograph,canvas:output};
}


// Reader camera
const readerPack=window.wujianReaderAssets;
const readerPhotos=[];
let readerAtlas=null,readerRig=null,readerWarm=false,readerLive=null,lastReaderFrame=null;

function readerTexture(encoded){
  const img=new Image();img.src='data:image/webp;base64,'+encoded;
  img.decode().then(startPaint,()=>{});
  return img;
}
function warmReader(){
  if(readerWarm)return;
  readerWarm=true;
  for(const data of readerPack.plates)readerPhotos.push(readerTexture(data));
  readerAtlas=readerTexture(readerPack.atlas);
  // The photographic version is available immediately, including on software-rendered projectors.
  const prepare=async()=>{
    let url=null;
    try{
      if(typeof DecompressionStream!=='function')return;
      const surface=document.createElement('canvas');
      const gl=surface.getContext('webgl2',{alpha:false,antialias:true,powerPreference:'low-power',failIfMajorPerformanceCaveat:true});
      if(!gl)return;
      const debug=gl.getExtension('WEBGL_debug_renderer_info');
      if(debug&&/swiftshader|llvmpipe|software|basic render/i.test(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))){
        gl.getExtension('WEBGL_lose_context')?.loseContext();return;
      }
      const packed=Uint8Array.from(atob(readerPack.engine),c=>c.charCodeAt(0));
      const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'));
      url=URL.createObjectURL(new Blob([await new Response(stream).arrayBuffer()],{type:'text/javascript'}));
      const T=await import(url);
      surface.addEventListener('webglcontextlost',()=>{readerRig=null;readerLive=false;startPaint();});
      const rig=makeReaderRig(T,surface);
      rig.photograph(0,0,256,144);
      readerRig=rig;
    }catch{/* The same calibrated photographs cover unavailable WebGL and restricted module loading. */}
    finally{if(url)URL.revokeObjectURL(url);}
  };
  if(window.requestIdleCallback)window.requestIdleCallback(prepare,{timeout:1400});
  else window.setTimeout(prepare,60);
}
function readerMatrix(corners){
  const [a,b,c]=corners;
  return new DOMMatrix([(b[0]-a[0])/WIDTH,(b[1]-a[1])/WIDTH,(c[0]-a[0])/HEIGHT,(c[1]-a[1])/HEIGHT,a[0],a[1]]);
}
function movingTransport(g,time){
  if(!readerAtlas?.naturalWidth)return;
  const {poses,tile,box}=readerPack,[w,h,columns]=tile,[x,y,right,bottom]=box;
  const frame=Math.floor(time*10)%poses.frameCount;
  g.drawImage(readerAtlas,(frame%columns)*w,Math.floor(frame/columns)*h,w,h,
    x*WIDTH/poses.width,y*HEIGHT/poses.height,(right-x)*WIDTH/poses.width,(bottom-y)*HEIGHT/poses.height);
}
function readerPhotographs(g,time,focus){
  const stops=readerPack.poses.dolly;
  const left=Math.min(stops.length-2,Math.floor(focus*(stops.length-1))),right=left+1;
  const amount=(focus-stops[left].focus)/(stops[right].focus-stops[left].focus);
  const pose=blendPose(readerMatrix(stops[left].glass),readerMatrix(stops[right].glass),amount);
  function place(index,alpha){
    const image=readerPhotos[index];
    if(!image?.naturalWidth||alpha<=0)return;
    g.save();g.globalAlpha*=alpha;
    usePose(g,pose.multiply(readerMatrix(stops[index].glass).inverse()));
    impressions(g,image);
    if(index===0)movingTransport(g,time);
    g.restore();
  }
  // Register both photographs on the actual glass. Foreground fittings exhibit their own parallax.
  rect(g,0,0,WIDTH,HEIGHT,'#142026');
  place(left,1);
  if(right<readerPhotos.length)place(right,smooth(amount));
  return pose;
}
function readerCamera(g,time,focus,clock,count,feed){
  warmReader();
  if(readerLive===null&&(readerRig||readerPhotos[0]?.naturalWidth))readerLive=Boolean(readerRig);
  let pose;
  if(readerLive&&readerRig){
    try{
      const w=Math.max(512,Math.min(1700,canvas.width)),h=Math.round(w*9/16);
      const frame=readerRig.photograph(time,focus,w,h);
      impressions(g,readerRig.canvas);pose=readerMatrix(frame.glass);
    }catch{readerLive=false;}
  }
  if(!pose)pose=readerPhotographs(g,time,focus);
  g.save();usePose(g,pose);
  const rounding=29*(1-focus);
  g.beginPath();g.roundRect(0,0,WIDTH,HEIGHT,rounding);g.clip();
  cipherDisplay(g,clock,count,feed,focus);
  // A warm practical and the window reflect across the curved glass until the lens squares up.
  if(focus<1){
    g.globalAlpha=.38*(1-focus);
    shape(g,'M-40,132Q262,19 625,10L699,9Q285,49 -40,164Z',
      ramp(g,150,53,438,107,[0,'#e4d8b47d'],[.35,'#c5d8cc60'],[1,'#526b5e00']));
    oval(g,878,76,77,21,flare(g,878,76,75,[0,'#e2a76970'],[1,'#c89c5a00']),-.25);
  }
  g.restore();
}
function readerPush(g,plate,age,count,feed){
  const entry=plate.readerEntry;
  const focus=smooth((age-.08)/(readerPushSeconds-.08));
  g.save();
  if(entry.framing)usePose(g,blendPose(entry.framing,fullGate,smooth(age/.63)));
  readerCamera(g,entry.time+age,focus,feed.travel,count,feed);
  g.restore();
  if(focus<1){
    g.save();g.globalAlpha=1-focus;finishFilm(g,entry.time+age);g.restore();
  }
  const leading=entry.framing ? .14 : .32;
  if(age<leading){g.save();g.globalAlpha=1-smooth(age/leading);impressions(g,plate);g.restore();}
}


// Cipher
  // One phosphor surface carries the incoming transmission, the cipher and its decoded list.
  const cipherInk = '#d7f8da';
  const cipherFace = '"Cascadia Mono",Consolas,monospace';
  const cipherSigns = '#@?%&/+';
  const spectrumRows = 24, spectrumSamples = 144;
  const spectrum = Array.from({length:spectrumRows}, (_,row) => {
    const depth = row / (spectrumRows - 1);
    const noise = seeded(7192 + row * 37);
    return Float32Array.from({length:spectrumSamples}, (_,index) => {
      const x = index / (spectrumSamples - 1);
      const peak = (center,width) => Math.exp(-(((x-center)/width)**2));
      const carrier = peak(.40 + depth*.16,.049) + .54*peak(.36 + depth*.12,.019);
      const sideband = .48*peak(.69 - depth*.07,.029) + .28*peak(.73 + depth*.06,.066);
      const ripple = .06*Math.sin(x*49-depth*7) + .038*Math.sin(x*123+row*.25);
      const envelope = Math.sin(x*Math.PI)**.70;
      return Math.max(0,(carrier + sideband + .12 + ripple) * (.78+noise()*.28) * envelope);
    });
  });

  function terminalGlass(g) {
    rect(g,0,0,g.canvas.width,g.canvas.height,'#030c09');
    rect(g,9,8,982,546,ramp(g,78,0,924,541,[0,'#12392b'],[.28,'#09271d'],[.65,'#061d16'],[1,'#102c21']));
    rect(g,9,8,982,546,flare(g,484,228,640,[0,'#1b523624'],[.63,'#07271b00'],[1,'#010704c4']));
    g.fillStyle='#02130b3b';
    for(let y=10;y<554;y+=3)g.fillRect(9,y,982,.7);
    stroke(g,[[10,548],[10,15],[17,8],[985,8]],'#44705a83',1.4);
    stroke(g,[[16,554],[984,554],[990,547],[990,14]],'#446c5880',1.1);
    for(const x of [34,966]){
      for(let y=42;y<=522;y+=16){
        const length=(y-42)%64===0?8:3;
        rect(g,x<500?x:x-length,y,length,1,'#5b957459');
      }
    }
    const grain = g.createPattern(emulsion(),'repeat');
    g.globalAlpha=.52;g.fillStyle=grain;g.fillRect(10,9,980,544);g.globalAlpha=1;
  }

  function signalLandscape(g,x,y,w,h,time,strength) {
    g.save();g.translate(x,y);
    const opacity=g.globalAlpha;
    const sweep=(time*.17+.32)%1;
    const beam=g.createLinearGradient(0,0,w,0);
    for(const [at,ink] of [[0,'#36674f'],[.24,'#54ae7d'],[.49,'#b9f5a8'],[.60,'#dcf8b7'],[.79,'#83d997'],[1,'#47775b']])beam.addColorStop(at,ink);
    // Work in screen units so the traces stay hairline-sharp at both camera distances.
    for(let row=0;row<spectrumRows;row++){
      const z=row/(spectrumRows-1),line=spectrum[row];
      const left=(1-z)*w*.083, width=w*(.86+.14*z);
      const base=h*(.36+.63*z),amplitude=h*(.36+.48*z)*strength;
      const drift=Math.round(2.8*Math.sin(time*.87+z*2.4));
      const path=new Path2D();
      for(let i=0;i<spectrumSamples;i++){
        const u=i/(spectrumSamples-1),j=Math.min(spectrumSamples-1,Math.max(0,i+drift));
        const beat=.86+.14*Math.sin(time*2.7+u*8-z*3);
        const py=base-amplitude*line[j]*beat,px=left+u*width;
        if(i===0)path.moveTo(px,py);else path.lineTo(px,py);
      }
      const face=new Path2D(path);face.lineTo(left+width,base+1);face.lineTo(left,base+1);face.closePath();
      g.fillStyle='#0a261c';g.fill(face);
      g.strokeStyle=beam;g.globalAlpha=opacity*(.38+.59*z);g.lineWidth=.63+.43*z;g.stroke(path);g.globalAlpha=opacity;
    }
    const gate=w*(.20+.60*sweep);
    rect(g,gate,h*.17,1,h*.84,'#f0c57a86');
    poly(g,[[gate-3,h*.14],[gate+3,h*.14],[gate,h*.14+5]],'#edc579');
    rect(g,0,h+1,w,1,'#80bf9059');
    g.restore();
  }

  const cipherBeatSeconds=.70, cipherMiddleStop=.55, cipherLastStop=1.20;
  let cipherStops=[], liveCipherFeed=null, liveCipherCue=null;

  function stopTimes(count){
    if(cipherStops.length===count)return cipherStops;
    const positions=Array.from({length:count},(_,i)=>i);
    // Shuffle screen positions only. The committed winning numbers and their order stay independent.
    const random=seeded(97133+count);
    for(let i=count-1;i>0;i--){
      const j=Math.floor(random()*(i+1));
      [positions[i],positions[j]]=[positions[j],positions[i]];
    }
    const first=Math.ceil(count/2),middle=first+Math.floor((count-first)/2);
    cipherStops=new Array(count);
    positions.forEach((cell,rank)=>{cipherStops[cell]=rank<first?0:rank<middle?cipherMiddleStop:cipherLastStop;});
    return cipherStops;
  }

  function captureCipherCue(){
    const rollAge=Math.max(0,(performance.now()-stamp)/1000);
    const feed=liveCipherFeed||candidateStream('third',performance.now()/1000,false);
    const plate=!reduced.matches&&rollAge<readerPushSeconds&&previousFrame?.readerEntry?previousFrame:null;
    const delay=plate?readerPushSeconds-rollAge:0;
    liveCipherCue={feed,rollAge,plate,delay};
    state.cipherStopTime=feed.travel+delay;
  }
  function readerScope(g,time,open,strength=1){
    const x=mix(65,267,open),y=mix(72,21,open),w=mix(870,637,open),h=mix(403,102,open);
    const sweep=(time*.31+.26)%1;
    g.save();g.translate(x,y);
    for(let i=0;i<=12;i++)rect(g,w*i/12,0,.9,h,i%3===0?'#84b59752':'#659e7d27');
    for(let i=0;i<=6;i++)rect(g,0,h*i/6,w,.85,i===3?'#93cba05c':'#74ac862e');
    const signal=new Path2D();
    for(let i=0;i<=330;i++){
      const u=i/330,packet=u-.48-.083*Math.sin(time*1.10);
      const envelope=Math.exp(-packet*packet*94);
      const amp=(Math.sin(u*78+time*3.2)+.46*Math.sin(u*150-time*2.6))*.57*envelope+
        .15*Math.sin(u*157-time*5)*Math.exp(-((u-.76)**2)*260)+.02*Math.sin(u*34+time*2);
      const v=h*(.52-.48*strength*amp);
      if(i)signal.lineTo(w*u,v);else signal.moveTo(0,v);
    }
    g.lineJoin='round';
    for(const [weight,ink] of [[8,'#76f7a31f'],[4,'#93f9ac5e'],[1.85,'#c4ffd5']]){
      g.lineWidth=weight;g.strokeStyle=ink;g.stroke(signal);
    }
    const sx=w*sweep;
    rect(g,sx-w*.16,0,w*.16,h,ramp(g,sx-w*.16,0,sx,0,[0,'#6ceaa100'],[1,'#6ceaa11f']));
    rect(g,sx,0,1.65,h,'#bef0b89c');
    g.restore();
  }

  function cipherRules(g,m) {
    const x=m.left-9,right=m.right+9;
    for(let row=0;row<=m.rows;row++){
      const y=m.top+row*m.h;
      rect(g,x,y,right-x,1,row===0||row===m.rows?'#799a6e88':'#73a88732');
      for(let col=0;col<=m.cols;col++){
        const at=m.left+col*m.w;
        rect(g,at,y-2,1,5,'#8cbb8f70');
      }
    }
    for(const a of [x,right])for(const b of [m.top,m.bottom]){
      const signX=a===x?1:-1,signY=b===m.top?1:-1;
      stroke(g,[[a+signX*10,b],[a,b],[a,b+signY*7]],'#b1ce99',1.5);
    }
  }

  function cipherMask(value,keep,salt) {
    let out=value.slice(0,keep);
    let bits=Math.imul(Number(value)+1,2654435761)^Math.imul(salt+1,2246822519);
    for(let i=keep;i<value.length;i++){
      bits=Math.imul(bits^(bits>>>15),1540483477)>>>0;
      out+=cipherSigns[bits%cipherSigns.length];
    }
    return out;
  }

  // A keyed carrier leaves a pulse train at the foot of the glass.
  function keyedCarrier(g,time,level){
    const x=66,y=533,w=868,pitch=13.4,phase=(time*34)%pitch,offset=Math.floor(time*34/pitch);
    g.save();g.beginPath();g.rect(x,y-13,w,21);g.clip();
    rect(g,x,y,w,1,'#54846578');
    g.beginPath();g.moveTo(x,y);
    for(let i=-1;i<67;i++){
      const at=x+i*pitch-phase;
      const n=(i+offset+72)%17;
      const high=n%3===1?4.5:8.2;
      const length=n%4===2?pitch*.76:pitch*.28;
      if(n===4||n===11||n===12)continue;
      g.lineTo(at,y);g.lineTo(at,y-level*high);g.lineTo(at+length,y-level*high);g.lineTo(at+length,y);
    }
    g.lineTo(x+w,y);g.strokeStyle='#96c39599';g.lineWidth=1.15;g.stroke();g.restore();
  }

  function cipherCells(g,m,count,feed,time) {
    const scan=(time*.21+.29)%1;
    const scanY=m.top+(m.bottom-m.top)*scan;
    g.save();
    rect(g,m.left-8,scanY-23,m.right-m.left+16,27,ramp(g,0,scanY-23,0,scanY+4,[0,'#65c48800'],[.86,'#65c48820'],[1,'#73ec972c']));
    rect(g,m.left-8,scanY+4,m.right-m.left+16,1,'#9cde9763');
    poly(g,[[m.left-19,scanY],[m.left-12,scanY+4],[m.left-19,scanY+8]],'#e5bc73');
    g.font='600 '+m.size+'px '+cipherFace;g.textAlign='center';g.textBaseline='middle';
    // With few seats there is room above and below each reel to show the passing candidates.
    const echoes=count<13?Math.max(1,Math.floor(m.w/91)):0;
    const stops=feed.winners?stopTimes(count):null;
    for(let i=0;i<count;i++){
      const col=i%m.cols,row=Math.floor(i/m.cols);
      const cx=m.left+(col+.5)*m.w,cy=m.top+(row+.5)*m.h;
      let code;
      if(stops&&feed.lockAge>=stops[i]){
        code=ticket(feed.winners[i]);
        g.fillStyle=cipherInk;
      }else{
        const value=runningTicket(feed,row,m.rows,col);
        if(echoes){
          const small=Math.min(17,m.size*.3),dy=m.h*.35;
          g.save();g.globalAlpha*=.23;g.font='500 '+small+'px '+cipherFace;g.fillStyle='#a3d9b6';
          for(let band=0;band<2;band++)for(let j=0;j<echoes;j++){
            const lane=m.cols+(band*m.cols+col)*echoes+j;
            const x=m.left+m.w*(col+(j+.5)/echoes);
            g.fillText(runningTicket(feed,row,m.rows,lane),x,cy+(band?dy:-dy),m.w/echoes*.9);
          }
          g.restore();
        }
        const tick=laneBeat(feed,row);
        const corrupt=count>1&&(i*7+tick)%11<3;
        code=corrupt?cipherMask(value,(i+tick)%3,(i*13+tick)%53):value;
        const light=Math.exp(-(((cy-scanY)/m.h)**2));
        g.fillStyle=corrupt?'#edc886':light>.50?'#d2f9cd':(i+tick)%5===1?'#78b994':'#a3d9b6';
      }
      g.fillText(code,cx,cy,m.w*.90);
    }
    g.restore();
  }

  function signalOpening(g,shot,age,sourceAge,clock) {
    const incoming=shot==='intercept';
    warmReader();
    if(incoming){readerLive=null;lastReaderFrame=null;reception(g,age);}
    else receiptCut(g,age,sourceAge,reduced.matches?1.35:clock);
    if(incoming && age<.45 && !reduced.matches){
      const fade=1-smooth((age-.12)/.33);
      rect(g,0,0,WIDTH,HEIGHT,'rgba(1,7,5,'+fade+')');
      const line=236+7*Math.sin(age*35);
      g.save();g.globalAlpha=.72*(1-smooth(age/.36));
      for(let i=0;i<19;i++)rect(g,48+i*48,line+((i*7)%3),12+(i*13)%36,1.2,'#c1e9c9');
      g.restore();
    }
  }

  function cipherDisplay(g,time,count,feed,focus) {
    set(g,'cipher-glass',terminalGlass);
    const open=smooth((focus-.38)/.62);
    readerScope(g,time,open);
    if(!feed)return;
    const gain=smooth((focus-.88)/.12);
    if(gain<=0)return;
    const m=ticketLayout('third',count);
    g.save();g.globalAlpha=gain;
    signalLandscape(g,71,29,167,77,time,.65);
    cipherRules(g,m);cipherCells(g,m,count,feed,time);keyedCarrier(g,time,.81);
    g.restore();
  }

  function stopCipher(g,values,age,previewClock){
    const cue=previewClock===null&&animateReveal?liveCipherCue:null;
    const delay=cue?.delay??0;
    const feed=previewClock===null?cue?.feed:candidateStream('third',previewClock,true);
    // A quick second press can land during the camera move. Finish the same push with its original plate.
    if(cue?.plate&&age<delay){
      readerPush(g,cue.plate,cue.rollAge+age,values.length,{
        ...feed,travel:feed.travel+age,beats:feed.beats+age/cipherBeatSeconds
      });
      return;
    }
    if(cue?.plate)cue.plate=null;
    const duration=values.length===1?0:cipherLastStop;
    const lockAge=age>=delay+duration?duration:Math.max(0,age-delay);
    const time=(previewClock??state.cipherStopTime??0)+lockAge;
    // Start at the live cadence and ease the remaining reels to half-speed before the final stop.
    const coastBeats=lockAge/cipherBeatSeconds*(1-.25*lockAge/cipherLastStop);
    const remainingBeats=(feed?.beats??0)+delay/cipherBeatSeconds+coastBeats;
    cipherDisplay(g,time,values.length,{deck:feed?.deck,beats:remainingBeats,winners:values,lockAge},1);
    glassGrain(g);
  }


// Camera transitions
  let livePrintPose=null,livePickup=null;
  const fullGate=new DOMMatrix();
  function surfacePose(g,topLeft,topRight,bottomLeft){
    const toStage=new DOMMatrix().scale(WIDTH/g.canvas.width,HEIGHT/g.canvas.height).multiply(g.getTransform());
    const [a,b,c]=[topLeft,topRight,bottomLeft].map(([x,y])=>toStage.transformPoint({x,y}));
    return new DOMMatrix([(b.x-a.x)/WIDTH,(b.y-a.y)/WIDTH,(c.x-a.x)/HEIGHT,(c.y-a.y)/HEIGHT,a.x,a.y]);
  }
  function blendPose(a,b,t){
    return new DOMMatrix(['a','b','c','d','e','f'].map(k=>mix(a[k],b[k],t)));
  }
  function usePose(g,m){g.transform(m.a,m.b,m.c,m.d,m.e,m.f);}

  let transferGate=null;
  function awardEntry(g,key,plate,age){
    const u=smooth(age/awardTiming[key].entry);
    if(plate.printPose||plate.pickup){
      if(!transferGate||transferGate.width!==g.canvas.width||transferGate.height!==g.canvas.height)transferGate=bitmap(g.canvas.width,g.canvas.height);
      transferGate.getContext('2d').drawImage(g.canvas,0,0);
    }
    if(key==='second'&&plate.printPose){
      impressions(g,plate);
      const pose=blendPose(plate.printPose,fullGate,smooth((age-.10)/1.19));
      g.save();usePose(g,pose);g.translate(0,-24*Math.sin(Math.PI*u));
      g.globalAlpha=smooth(age/.28);
      rect(g,-3,-3,1006,569,'#131316');impressions(g,transferGate);g.restore();return;
    }
    if(key==='first'&&plate.pickup){
      impressions(g,plate);
      if(age<.43){
        const path=new Path2D('M684 416C635 442 648 479 558 474S454 419 421 431C389 444 392 466 353 463L308 455');
        g.save();usePose(g,plate.pickup.desk);g.setLineDash([32,550]);g.lineDashOffset=32-471*clamp(age/.40);
        g.lineWidth=2.3;g.strokeStyle='#f5df9a';g.shadowColor='#d9bb69';g.shadowBlur=4;g.stroke(path);g.restore();
      }
      const open=smooth((age-.29)/.94),travel=smooth((age-.26)/.99);
      if(age>.24){
        g.save();usePose(g,blendPose(plate.pickup.gauge,fullGate,travel));
        const x=mix(80,-6,open),y=mix(45,-5,open),right=mix(209,1006,open),bottom=mix(119,568,open);
        g.beginPath();g.roundRect(x,y,right-x,bottom-y,4*(1-open));g.clip();
        g.globalAlpha=smooth((age-.24)/.22);impressions(g,transferGate);
        if(open<1){
          g.globalAlpha=Math.sin(Math.PI*open)*.62;const front=right-12;
          rect(g,front-34,y,36,bottom-y,ramp(g,front-34,0,front+2,0,[0,'#e0c18400'],[.89,'#d2ba8642'],[1,'#e8dfac99']));
        }
        g.restore();
      }
      return;
    }
    // The skyline and both eyelines are retained while the reflected numbers become visible.
    g.save();g.globalAlpha=1-u;impressions(g,plate);g.restore();
  }



// Award exposures
  const revealSettle=2.15;
  function ticketLayout(key,n){
    if(key==='grand'){
      const left=293,right=749,top=n===1?157:n<=4?146:82,bottom=n===1?369:n<=4?381:424;
      const width=right-left,height=bottom-top;
      const fit=cols=>Math.min(width/cols/4.4,height/Math.ceil(n/cols)*.79);
      let cols=n<=2?n:2;
      for(let c=3;n>4&&c<=n;c++)if(fit(c)>fit(cols))cols=c;
      const rows=Math.ceil(n/cols);
      return {left,right,top,bottom,cols,rows,w:width/cols,h:height/rows,
        size:Math.min(n===1?131:108,fit(cols)),lastShift:(rows*cols-n)/2};
    }
    const cols=n<=3?n:n===4?2:n<=6?3:n<=12?Math.ceil(n/2):n<=30?Math.min(6,Math.ceil(Math.sqrt(n*1.2))):Math.ceil(Math.sqrt(n*1.35));
    const rows=Math.ceil(n/cols);
    const areas={third:[73,927,152,505],second:[61,939,97,452],first:[70,930,154,437]};
    const [left,right,top,bottom]=areas[key],w=(right-left)/cols,h=(bottom-top)/rows;
    const max=key==='first'?106:122;
    const size=Math.min(max,w/(key==='third'?4.65:4.4),h*(key==='second'?.69:.79));
    return {cols,rows,left,right,top,bottom,w,h,size};
  }
  const glowSegments=[
    [[3,1],[17,1],[19,3],[16.9,5],[3.2,5],[1.1,3]],
    [[17.4,5.3],[19.4,3.3],[20.5,5],[19.3,16],[17.1,18.3],[15.5,16.2]],
    [[16.9,19.9],[18.9,18.1],[19.9,20],[18.6,31.6],[16.5,33.9],[15.1,32]],
    [[2.2,32.7],[15.1,32.7],[17,34.8],[14.9,36.5],[1.2,36.5],[-.2,34.7]],
    [[.5,20.2],[2.4,18.7],[4,20.4],[2.9,31.4],[.8,33.4],[-.7,31.5]],
    [[2.4,5.4],[4.5,3.5],[5.8,5.1],[4.6,16.6],[2.8,18.2],[1.1,16.4]],
    [[3,16.9],[15.9,16.9],[17.8,18.7],[15.6,20.6],[3,20.6],[1.4,18.7]]
  ];
  function glassTicket(g,value,x,y,size,color){
    const scale=size/47;
    g.save();g.translate(x-((value.length*25-4)*scale)/2,y-18.5*scale);g.scale(scale,scale);
    for(const char of value){
      const mask=digitMaps[Number(char)];
      for(let j=0;j<7;j++)if(mask&(1<<j))poly(g,glowSegments[j],color);
      g.translate(25,0);
    }
    g.restore();
  }

  function impressions(g,image,x=0,y=0){g.drawImage(image,x,y,WIDTH,HEIGHT);}
  function glassGrain(g){
    g.save();g.globalAlpha=.39;g.fillStyle=g.createPattern(emulsion(),'repeat');g.fillRect(0,0,WIDTH,HEIGHT);g.restore();
  }


  const awardTiming={
    second:{beat:.74,entry:1.35,hold:1.94},
    first:{beat:.72,entry:1.29,hold:1.86},
    grand:{beat:.53,entry:1.05,hold:1.62}
  };
  let lastAwardFeed=null,awardCue=null;
  function recordAwardCue(){
    const key=current.prize,timing=awardTiming[key],age=Math.max(0,(performance.now()-stamp)/1000);
    const feed=lastAwardFeed||candidateStream(key,performance.now()/1000,false);
    if(key==='grand'&&!lastAwardFeed)feed.travel=roofRollOrigin+age;
    const plate=!reduced.matches&&previousFrame&&age<timing.entry?previousFrame:null;
    let lead=plate?timing.entry-age:0;
    if(key==='grand'&&(roofRollOrigin<roofRollAt||plate?.roofAge>=roofPushFrom))lead=Math.max(0,roofRollAt-feed.travel);
    awardCue={key,feed,plate,rollAge:age,lead};
    state.exposureTimes={...state.exposureTimes,[key]:feed.travel+lead};
  }
  function awardFace(g,key,n,time,feed,values,age){
    if(key==='second')contactPrint(g,n,time,feed,values,age);
    else if(key==='first')lineMonitor(g,n,time,feed,values,age);
    else {identityFrame(g,n,time,feed,values,age);return;}
    glassGrain(g);
  }
  function rollingFrame(g,key,t,n,feed,plate){
    if(key==='third'){
      if(plate?.readerEntry&&t<readerPushSeconds){readerPush(g,plate,t,n,feed);return;}
      cipherDisplay(g,feed.travel,n,feed,1);glassGrain(g);return;
    }
    if(key==='grand'){
      const carried=Number.isFinite(plate?.roofAge)&&plate.roofAge>=roofPushFrom;
      const open=smooth((feed.travel-roofNumbersAt)/(roofRollAt-roofNumbersAt))*(plate&&!carried?smooth(t/.64):1);
      identityFrame(g,n,feed.travel,feed,null,null,open);
      if(plate && t<awardTiming.grand.entry){
        if(Number.isFinite(plate.roofAge) && !carried){
          // If the operator skips the approach, a close post carries the cut across the lens.
          const edge=mix(1082,-72,smooth(t/awardTiming.grand.entry));
          g.save();g.beginPath();g.rect(0,0,Math.max(0,edge),HEIGHT);g.clip();
          roofTake(g,plate.roofAge+t);
          if(t<.20){g.globalAlpha=1-smooth(t/.20);impressions(g,plate);}g.restore();
          silhouetteTerrace.post(g,edge,false);
        }else if(!Number.isFinite(plate.roofAge))awardEntry(g,key,plate,t);
      }
      return;
    }
    awardFace(g,key,n,feed.travel,feed,null,null);
    if(plate&&t<awardTiming[key].entry)awardEntry(g,key,plate,t);
  }
  function drawOutcome(g,key,values,age,rollAge,plate=null,previewClock=null){
    if(key==='third'){stopCipher(g,values,age,previewClock);return;}
    const timing=awardTiming[key],cue=previewClock===null&&animateReveal&&awardCue?.key===key?awardCue:null;
    const lead=cue?.lead??0,feed=previewClock===null?cue?.feed:candidateStream(key,previewClock,true);
    if(cue&&age<lead&&(cue.plate||key==='grand')){
      rollingFrame(g,key,cue.rollAge+age,values.length,{...feed,travel:feed.travel+age,beats:feed.beats+age/timing.beat},cue.plate);
      return;
    }
    if(cue?.plate)cue.plate=null;
    const elapsed=age>=lead+timing.hold?timing.hold:Math.max(0,age-lead);
    const coast=key==='grand'?Math.min(.30,elapsed)*(1-Math.min(.30,elapsed)/.60):elapsed*(1-.47*elapsed/timing.hold);
    const anchor=state.exposureTimes?.[key]??(key==='grand'?roofRollAt:0);
    const time=(key==='grand'?Math.max(roofNumbersAt,anchor):anchor)+coast;
    const passing=feed?{...feed,travel:time,beats:feed.beats+(lead+coast)/timing.beat}:null;
    awardFace(g,key,values.length,time,passing,values,elapsed);
  }
  function intermission(g,age,plate){
    const lift=smooth(age/.93),cover=smooth((age-.89)/1.85);
    archiveFolder(g,3.50*(1-cover),state.counts.second,plate);
    if(plate&&lift<1&&livePrintPose){
      g.save();usePose(g,blendPose(fullGate,livePrintPose,lift));
      impressions(g,plate);g.restore();
    }
  }

new ResizeObserver(resize).observe(screen);
new IntersectionObserver(entries => { visible=entries[0].isIntersecting; speakerLevel(); startPaint(); }).observe(screen);
document.addEventListener('visibilitychange', () => { speakerLevel(); startPaint(); });
reduced.addEventListener('change', startPaint);
resize();
window.wujianFilm = { present, toggleAudio };
