// Figure coordinates are measured from the floor. Positive x is the direction of travel.
const castHeads = {
  short: {
    front: 'M-2 -31 C3.7 -31.8 9.2 -28.9 10.2 -24.8 C10.45 -22.5 9.3 -20.8 9.9 -19.65 Q10.95 -18.62 10.37 -17.85 C10.55 -16.62 11.74 -14.98 12.77 -13.81 Q13.16 -13.16 12.46 -12.82 Q11.45 -12.66 10.64 -12.50 Q10.30 -12.05 10.42 -11.38 Q10.96 -10.88 10.34 -10.42 Q10.00 -10.16 10.24 -9.86 Q10.56 -9.45 9.86 -8.94 Q9.25 -8.56 9.58 -7.45 Q9.70 -6.28 8.08 -5.98 C6.02 -5.60 4.66 -5.36 3.55 -4.25 Q2.58 -2.92 4.05 .65 L6.15 3.92',
    back: 'M-2 -31 C-8.35 -31.25 -12.6 -27.8 -12.7 -21.25 Q-12.55 -18.70 -11.75 -16.40 L-10.65 -13.05 Q-10.20 -10.75 -8.85 -9.50 Q-7.25 -7.90 -7.58 -5.55 Q-7.95 -2.40 -10.45 2.5',
    neck: [2.35, -154.9], tilt: .104, nose: [12.77, -13.81]
  },
  long: {
    front: 'M-2.2 -30.8 C1.8 -31.1 5.7 -29.9 8.2 -27.7 Q9.45 -26.8 9.88 -24.6 Q9.62 -23.5 9.08 -22.55 C9.06 -21.1 9.48 -19.4 10.12 -18.1 Q10.22 -17.55 9.72 -16.85 C10.50 -15.35 11.55 -13.75 12.28 -12.45 Q12.56 -11.92 11.92 -11.52 Q11.10 -11.34 10.38 -11.18 Q10.22 -10.72 10.72 -10.12 Q10.88 -9.82 10.38 -9.52 Q10.02 -9.38 10.20 -9.06 Q10.52 -8.68 10.26 -8.32 Q10.02 -7.92 9.52 -7.62 Q9.96 -7.00 9.86 -6.08 Q9.68 -4.75 8.10 -4.48 C6.25 -4.25 4.72 -4.08 3.92 -3.35 Q3.28 -2.10 3.78 .75 L5.60 4.45',
    back: 'M-2.2 -30.8 C-6.4 -30.7 -9.9 -28.0 -11.1 -23.7 C-11.75 -20.9 -11.50 -17.7 -10.55 -15.0 C-10.00 -13.2 -9.55 -11.6 -9.40 -10.2 Q-8.75 -10.0 -8.20 -9.35 C-8.12 -6.9 -8.25 -3.6 -9.05 .4 Q-9.7 2.6 -11.2 4.6',
    neck: [1.05, -153.3], tilt: .028, nose: [12.35, -12.15]
  }
};

const turnSteps = 72;
function sampleEdge(outline) {
  const edge = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  edge.setAttribute('d', outline);
  const length = edge.getTotalLength();
  return Array.from({length: 145}, (_, i) => {
    const pt = edge.getPointAtLength(length * i / 144);
    return [pt.x, pt.y];
  });
}

// Turn through the back of the skull. Both sides keep their width at mid-turn.
const rearCheek = sampleEdge('M-1 -31.10 C4.41 -31.58 9.56 -29 11.86 -25.68 C14.00 -22.49 13.65 -18.06 12.46 -14.48 C11.76 -11.40 10.47 -9.67 8.49 -8.00 C6.50 -6.18 6.82 -3.41 7.91 -.41 L10.13 3.88');
for (const model of Object.values(castHeads)) {
  model.profile = sampleEdge(model.front);
  model.nape = sampleEdge(model.back);
  model.views = new Map();
}

function faceAt(model, index) {
  if (model.views.has(index)) return model.views.get(index);
  const yaw = 2 * index / turnSteps - 1, extent = Math.abs(yaw);
  const side = sign => {
    const profile = yaw * sign > 0, edge = profile ? model.profile : model.nape;
    return edge.map(([x, y], i) => {
      const [cx, cy] = rearCheek[i];
      return [sign * (cx + extent * ((profile ? x : -x) - cx)), cy + extent * (y - cy)];
    });
  };
  const outline = [...side(1), ...side(-1).reverse()], result = new Path2D();
  result.moveTo(...outline[0]);
  for (let i = 1; i < outline.length - 1; i++) {
    const [x, y] = outline[i], next = outline[i + 1];
    result.quadraticCurveTo(x, y, (x + next[0]) / 2, (y + next[1]) / 2);
  }
  result.closePath();
  model.views.set(index, result);
  return result;
}

const fedoraViews = Array.from({length: turnSteps + 1}, (_, index) => {
  const yaw = index * 2 / turnSteps - 1, p = new Path2D();
  const brim = 18.5 + 2.05 * Math.abs(yaw), slope = 2.65 * yaw;
  p.moveTo(-brim,-24.0-slope);
  p.quadraticCurveTo(-brim-.91,-26.2-slope,-18.8,-25.42-slope);
  p.quadraticCurveTo(-16.80,-24.69-slope,-13.46,-25.32-slope*.64);
  p.bezierCurveTo(-12.50,-27.02-slope*.62,-11.30,-32.68-slope*.41,-9.52,-34.55-slope*.23);
  p.bezierCurveTo(-7.37,-36.01-slope*.20,-3.56,-34.48,.21+yaw*1.1,-34.83);
  p.bezierCurveTo(3.26+yaw*1.3,-35.12,6.88,-36.66,9.82,-35.71+slope*.31);
  p.quadraticCurveTo(12.14,-33.70+slope*.37,13.42,-26.12+slope*.76);
  p.bezierCurveTo(15.07,-25.35+slope*.74,19.54,-23.92+slope,brim+1.3,-22.22+slope);
  p.quadraticCurveTo(brim+2.66,-20.69+slope,brim+.04,-20.76+slope);
  p.bezierCurveTo(14.85,-20.82+slope,6.18,-21.57,0,-21.08);
  p.bezierCurveTo(-9.97,-20.84,-17.92,-20.99-slope,-brim,-24.0-slope);p.closePath();
  return p;
});

export function noseAtRest(kind, pose) {
  const {neck, nose, tilt} = castHeads[kind];
  const visitor = kind==='long' && pose;
  const pitch = visitor ? pose.torsoPitch??0 : 0;
  const angle = visitor ? tilt+(pose.nod??0)-.72*pitch : tilt;
  const c=Math.cos(angle), s=Math.sin(angle);
  const x=neck[0]+nose[0]*c-nose[1]*s, y=neck[1]+nose[0]*s+nose[1]*c;
  if(!visitor)return [x,y];
  // The lens tracks the face after the same weight transfer used to draw the actor.
  const chestY=visitorHipHeight-.70*(pose.breath??0)+y;
  return [(pose.hips??0)+x*Math.cos(pitch)-chestY*Math.sin(pitch),
    visitorHipY(pose)+x*Math.sin(pitch)+chestY*Math.cos(pitch)];
}

const heelPivot = -5.7, toePivot = 11.8;
const shoe = new Path2D('M-5.3 -8.2 Q-6.15 -6.8 -6.12 -3.27 L-6.32 -.62 Q-5.17 .29 -2.26 .15 L-1.68 -.56 Q.2 -.38 3.92 .13 Q9.1 .45 12.38 -.66 Q13.48 -1.05 12.76 -2.04 Q11.3 -3.59 7.55 -3.88 Q5.26 -4.01 3.07 -6.7 L2.23 -8.55Z');
const visitorShoe = new Path2D('M-5.4 -8.4 Q-6.59 -7.70 -6.63 -4.07 L-6.66 -.82 Q-6.36 .06 -5.34 .10 L-1.83 .10 L-1.19 -.48 Q1.20 -.49 3.19 -.01 C5.66 .54 10.57 .41 13.02 -.62 Q14.02 -1.00 13.62 -2.20 Q13.11 -3.73 10.81 -3.86 C7.48 -4.12 5.86 -4.74 3.55 -7.70 L2.69 -9.02Z');

export function soleContact(foot, pitch=0) {
  const load = Math.min(1, Math.abs(pitch) / .16);
  const pressurePoint = pitch >= 0 ? toePivot : heelPivot;
  return foot[0] + 2 + (pressurePoint - 2) * load*load*(3-2*load);
}

function trouserLeg(g, hipX, hipY, foot, pitch, visitor, near, support=0, light=0) {
  const pivot = pitch >= 0 ? toePivot : heelPivot, c = Math.cos(pitch), s = Math.sin(pitch);
  const ankleX = foot[0] + pivot - pivot*c + 7.5*s, ankleY = foot[1] - pivot*s - 7.5*c;
  const dx = ankleX - hipX, dy = ankleY - hipY, reach = Math.max(1, Math.hypot(dx, dy));
  const thigh = visitor ? 44.8 : 46.4, shin = visitor ? 41.8 : 42.2;
  const along = Math.min(reach, (thigh*thigh - shin*shin + reach*reach)/(2*reach));
  const lifted = Math.min(1, -foot[1]/12);
  const bend = Math.sqrt(Math.max(0, thigh*thigh - along*along)) * (visitor ? .38+.44*lifted-.18*support : .46+.38*lifted);
  const kx = hipX + (dx*along + dy*bend)/reach, ky = hipY + (dy*along - dx*bend)/reach;
  const knee = visitor ? 6.25 : 6.55, hem = visitor ? 4.90 : 5.15;
  const p = new Path2D();
  if (visitor) {
    // Tailored straight-taper dress trousers with subtle knee drape and crisp shoe break.
    p.moveTo(hipX-8.2,hipY-3);
    p.bezierCurveTo(hipX-9.6,hipY+13,kx-knee-.9,ky-10,kx-knee,ky-.2);
    p.bezierCurveTo(kx-knee-.6,ky+11,ankleX-hem-.2,ankleY-9.5,ankleX-hem-.4,ankleY-2.6);
    p.lineTo(ankleX-hem+.1,ankleY+.4);p.quadraticCurveTo(ankleX+.7,ankleY+1.6,ankleX+hem+1.0,ankleY+1.0);
    p.quadraticCurveTo(ankleX+hem+1.1,ankleY-.6,ankleX+hem+.3,ankleY-2.8);
    p.bezierCurveTo(ankleX+hem-.1,ankleY-10.5,kx+knee-.1,ky+11,kx+knee+.1,ky+.8);
    p.bezierCurveTo(kx+knee+1.0,ky-8.5,hipX+8.5,hipY+11,hipX+7.8,hipY-3);
  } else {
    p.moveTo(hipX-8.0,hipY-1);
    p.bezierCurveTo(hipX-9.3,hipY+12,kx-knee-1.0,ky-8.3,kx-knee,ky+.6);
    p.bezierCurveTo(kx-knee-1.0,ky+13,ankleX-hem+.5,ankleY-7,ankleX-hem,ankleY-2.5);
    p.lineTo(ankleX-hem-.4,ankleY+.75);
    p.quadraticCurveTo(ankleX,ankleY+1.9,ankleX+hem+.35,ankleY+1.0);
    p.quadraticCurveTo(ankleX+hem+.9,ankleY-.25,ankleX+hem-.35,ankleY-2.7);
    p.bezierCurveTo(ankleX+hem-.05,ankleY-9,kx+knee+.2,ky+13,kx+knee,ky+.75);
    p.quadraticCurveTo(kx+knee+1.2,ky-6.2,hipX+7.8,hipY-1);
  }
  p.closePath(); g.fill(p);
  if (near && visitor) reflectedCloth(g,p,'#384647',.12*light);
  g.save(); g.translate(foot[0]+pivot,foot[1]); g.rotate(pitch); g.translate(-pivot,0);
  const flat = Math.max(0, 1 - Math.abs(pitch)/.18 + Math.min(0, foot[1]/10));
  g.scale(near ? 1 : 1-.20*flat, 1); g.fill(visitor ? visitorShoe : shoe); g.restore();
}

function overcoat(g, wind, light=0) {
  const p = new Path2D();
  // Tailored long noir wool overcoat: clean upturned collar, structured shoulder, waist taper and natural hem slope.
  p.moveTo(-10.5,-157.5);
  p.quadraticCurveTo(-4.2,-156.0,2.8,-155.4);
  p.lineTo(9.4,-156.5);
  p.lineTo(10.5,-151.8);
  p.quadraticCurveTo(14.2,-149.2,16.8,-144.6);
  p.quadraticCurveTo(18.0,-140.2,17.2,-130.8);
  p.bezierCurveTo(16.4,-121.0,15.3,-111.5,14.8,-102.5);
  p.bezierCurveTo(15.0,-88.5,16.0,-70.0,17.0+wind*.25,-50.8);
  p.quadraticCurveTo(9.8,-49.4,1.2,-48.8);
  p.quadraticCurveTo(-9.5,-48.2,-19.4-wind*1.0,-47.8);
  p.bezierCurveTo(-18.2-wind*.42,-65.5,-16.5,-84.0,-15.5,-103.0);
  p.bezierCurveTo(-15.0,-114.5,-16.6,-127.0,-17.6,-138.2);
  p.quadraticCurveTo(-18.2,-145.2,-14.8,-149.8);
  p.quadraticCurveTo(-12.4,-152.5,-10.5,-157.5);
  p.closePath();
  g.fill(p);
  if (light > 0) {
    // Subtle directional sheen along the wool drape (clipped inside, no hard wireframe outline).
    const sheen = new Path2D();
    sheen.moveTo(-17.4,-138.0);
    sheen.bezierCurveTo(-16.4,-126.5,-14.9,-114.0,-15.3,-102.8);
    sheen.bezierCurveTo(-16.3,-84.0,-17.8,-66.0,-19.0-wind*.95,-48.2);
    sheen.lineTo(-14.2-wind*.65,-48.4);
    sheen.bezierCurveTo(-13.4,-66.0,-12.2,-84.0,-11.5,-102.8);
    sheen.bezierCurveTo(-11.2,-114.0,-12.6,-126.5,-13.4,-138.0);
    sheen.closePath();
    g.save(); g.clip(p); reflectedCloth(g,sheen,'#3d4f50',.16*light); g.restore();
  }
  return p;
}

// Tailored stand-collar jacket: seamless back collar, poised chest, athletic waist taper, crisp hem above dress trousers.
const visitorJacket = new Path2D(
  'M-9.2 -152.6 L-4.5 -151.6 Q.4 -150.4 6.4 -149.4 L7.4 -148.0 '
  +'Q10.8 -146.2 13.4 -141.6 Q14.8 -138.2 14.5 -131.5 '
  +'C14.3 -123.5 13.6 -113.0 13.0 -103.5 L13.1 -90.2 Q12.9 -88.2 11.4 -88.0 '
  +'Q4.6 -87.4 -2.2 -87.6 Q-9.4 -87.8 -13.8 -89.0 '
  +'L-13.8 -92.5 C-13.6 -100.5 -13.3 -108.5 -14.6 -118.5 '
  +'C-16.0 -129.0 -16.8 -138.8 -15.2 -145.2 Q-13.2 -149.2 -9.2 -152.6 Z');
const waistSeat = new Path2D('M-10.4 -8.2 Q0 -10.5 10.2 -8.2 L11.2 1.8 Q9.6 8.8 4.4 11.4 L1.6 12.6 Q-3.2 10.4 -8.4 9.2 Q-12.2 6.2 -11.8 1.4Z');
const visitorFacing = new Path2D('M-8.8 -152.0 L-4.4 -151.0 Q.5 -149.8 6.4 -148.8 L10.6 -145.4 L9.8 -144.3 L5.8 -147.6 Q.3 -148.8 -4.6 -150.0 L-8.8 -151.0 Z');
const visitorPocket = new Path2D('M-1.8 -95.2 Q2.6 -98.4 7.0 -102.0 L7.6 -101.3 Q3.2 -97.4 -1.2 -94.2Z');
const pocketOpening = new Path2D('M-75 -205 H76 V-145 L7.0 -102.0 Q2.6 -98.4 -1.8 -95.2 L-75 -56Z');
const foldedLapel = new Path2D('M-9.2 -156.4 L-5.2 -155.0 L-6.4 -149.0 L-3.4 -149.6 L-.2 -134.8 L-5.0 -148.4 L-8.0 -147.8 L-6.8 -154.0Z M-11.8 -98.2 Q-7.2 -97.0 -2.0 -96.6 L-2.2 -95.7 Q-7.3 -96.0 -12.0 -97.2Z');
const relaxedHand = new Path2D('M-2.17 -1.12 Q-2.40 .78 -2.70 2.07 Q-3.08 3.55 -2.56 5.07 L-1.06 8.19 Q-.65 8.94 .12 8.63 Q.84 8.75 1.26 8.00 L2.32 5.93 Q2.81 4.95 2.56 3.60 L2.30 2.73 Q3.40 3.26 3.85 2.55 Q4.05 2.09 3.27 1.25 L2.29 -.17 L1.86 -1.48Z');

function sleeve(g, sx, sy, ex, ey, wx, wy, cap, cuff) {
  const upper = Math.hypot(ex-sx,ey-sy), lower = Math.hypot(wx-ex,wy-ey);
  const ux = (ey-sy)/upper, uy = (sx-ex)/upper, vx = (wy-ey)/lower, vy = (ex-wx)/lower;
  const mx = (ux+vx)*.5, my = (uy+vy)*.5, elbow = cap*.83;
  const p = new Path2D();
  p.moveTo(sx-ux*cap,sy-uy*cap);
  p.quadraticCurveTo((sx+ex)*.5-ux*cap,(sy+ey)*.5-uy*cap,ex-mx*elbow,ey-my*elbow);
  p.quadraticCurveTo((ex+wx)*.5-vx*(cuff+.65),(ey+wy)*.5-vy*(cuff+.65),wx-vx*cuff,wy-vy*cuff);
  p.lineTo(wx+vx*cuff,wy+vy*cuff);
  p.quadraticCurveTo((ex+wx)*.5+vx*(cuff+1.1),(ey+wy)*.5+vy*(cuff+1.1),ex+mx*(elbow+.65),ey+my*(elbow+.65));
  p.quadraticCurveTo(ex+ux*(elbow+.9),ey-5+uy*elbow,sx+ux*cap,sy+uy*cap);
  p.quadraticCurveTo(sx,sy-cap*1.31,sx-ux*cap,sy-uy*cap); p.closePath(); g.fill(p);
  return p;
}

function reflectedCloth(g, path, shade, light) {
  if (light <= 0) return;
  g.save();g.globalAlpha *= light;g.fillStyle=shade;g.fill(path);g.restore();
}

function visitorArm(g, near, pose, light) {
  const direction = near ? 1 : -1;
  const phase = direction*(pose.swing ?? 0), trail = direction*(pose.armTrail ?? pose.swing ?? 0);
  const pocket = near ? (pose.pocket ?? 0) : 0, turn = pose.turn ?? 1;
  const sx = (near ? -5.0-1.6*turn : 2.8+1.2*turn) + 1.15*phase;
  const sy = (near ? -142.2+.6*pocket : -141.0) + .40*phase;
  const relaxed = pose.restWeight ?? 0;
  const hangUpper = (near ? -.07 : -.04) + .24*phase;
  const hangLower = (near ? .22 : .13-.07*relaxed) + .29*trail + .08*Math.max(0,phase);
  const upper = hangUpper+(-.18-hangUpper)*pocket;
  const lower = hangLower+(.72-hangLower)*pocket;
  const ax=Math.sin(upper), ay=Math.cos(upper), bx=Math.sin(lower), by=Math.cos(lower);
  const ex=sx+25.5*ax, ey=sy+25.5*ay, wx=ex+23.0*bx, wy=ey+23.0*by;
  const nx=(ay+by)*.5, ny=-(ax+bx)*.5, cuff=near?3.85:3.45, cap=near?5.8:4.9;
  const p=new Path2D();
  p.moveTo(sx-cap*ay,sy+cap*ax-.4);
  p.bezierCurveTo(sx-(cap+1.4)*ay+5*ax,sy+(cap+1.4)*ax+5*ay,ex-5.4*ay-6.5*ax,ey+5.4*ax-6.5*ay,
    ex-5.2*nx-.6*ax,ey-5.2*ny-.6*ay);
  p.quadraticCurveTo(ex-5.4*nx+2.2*bx,ey-5.4*ny+2.2*by,ex-5.0*by+5.0*bx,ey+5.0*bx+5.0*by);
  p.quadraticCurveTo(wx-4.6*by-5.5*bx,wy+4.6*bx-5.5*by,wx-cuff*by-.5*bx,wy+cuff*bx-.5*by);
  p.lineTo(wx-(cuff-.4)*by+.6*bx,wy+(cuff-.4)*bx+.6*by);
  p.quadraticCurveTo(wx+.25*bx,wy+.25*by,wx+cuff*by+.25*bx,wy-cuff*bx+.25*by);
  p.quadraticCurveTo(wx+(cuff+1.2)*by-7.5*bx,wy-(cuff+1.2)*bx-7.5*by,ex+4.8*nx+2.0*bx,ey+4.8*ny+2.0*by);
  p.quadraticCurveTo(ex+5.2*ay,ey-5.2*ax-3.4,sx+(cap-.3)*ay+4.0*ax,sy-(cap-.3)*ax+4.0*ay);
  p.bezierCurveTo(sx+cap*ay,sy-4.2,sx-3.0*ay,sy-(near?5.8:4.9),sx-cap*ay,sy+cap*ax-.4);
  p.closePath();
  g.save();
  if(pocket>0){
    const clearance=36*(1-pocket);
    g.translate(0,clearance);g.clip(pocketOpening);g.translate(0,-clearance);
  }
  g.translate(wx,wy);g.rotate(-lower);g.fill(relaxedHand);
  reflectedCloth(g,relaxedHand,'#5a655c',light*(near?.18:.08));g.restore();
  g.fill(p);
  if (near && light>0) {
    const fold=new Path2D();
    fold.moveTo(sx-4.8*ay+6*ax,sy+4.8*ax+6*ay);
    fold.quadraticCurveTo(ex-5.8*ay-6*ax,ey+5.8*ax-6*ay,ex-4.8*nx,ey-4.8*ny);
    fold.quadraticCurveTo(ex-4.6*by+6*bx,ey+4.6*bx+6*by,wx-3.3*by,wy+3.3*bx);
    fold.quadraticCurveTo(ex-2.8*by+5*bx,ey+2.8*bx+5*by,ex-3.0*nx,ey-3.0*ny);
    fold.quadraticCurveTo(ex-4.3*ay-7*ax,ey+4.3*ax-7*ay,sx-4.8*ay+6*ax,sy+4.8*ax+6*ay);
    g.save();g.clip(p);reflectedCloth(g,fold,'#445453',light*.20);g.restore();
  }
}

const standingBack = [-17.4,0], standingFront = [5.2,0];
const visitorHipHeight=92.8;
function visitorHipY(pose){
  return -visitorHipHeight-2.15*(pose.restWeight??0)-(pose.rise??0)+.75*(pose.settle??0);
}
export function drawFigure(g,kind,x,footY,scale,facing,pose,t,ink,clothLight=0) {
  const visitor = kind === 'long', model = castHeads[kind];
  const turn = pose.turn ?? 1, swing = pose.swing ?? 0;
  const a = pose.a ?? standingBack, b = pose.b ?? standingFront;
  const hips = pose.hips ?? 0, breath = pose.breath ?? 0;
  const hipHeight = visitor ? visitorHipHeight : 94, weight = visitor ? (pose.restWeight ?? 0) : 0;
  const hipY = visitor ? visitorHipY(pose) : -94-(pose.rise??0)+1.65*(pose.settle??0);
  const pitch = visitor ? (pose.torsoPitch ?? 0) : .70*(pose.shoulder ?? 0);
  g.save(); g.translate(x,footY); g.scale(facing*scale,scale); g.fillStyle=ink;
  trouserLeg(g,hips-(visitor?4.4:5.8),hipY+.15+1.15*weight,a,pose.aPitch ?? 0,visitor,false);
  if (visitor) {
    g.save();g.translate(hips,hipY);g.fill(waistSeat);g.restore();
  }
  trouserLeg(g,hips+(visitor?3.25:5.6),hipY-.5-.55*weight,b,pose.bPitch ?? 0,visitor,true,weight,clothLight);
  g.translate(hips,hipY);
  if (!visitor) g.transform(1-.045*(pose.weight ?? 0),0,-.012+.72*(pose.lean ?? 0),1,0,0);
  g.rotate(pitch); g.translate(0,hipHeight-.70*breath);
  g.save(); g.scale(visitor ? .87+.13*turn : .90+.08*Math.sin(turn*Math.PI),1);
  if (visitor) {
    visitorArm(g,false,pose,clothLight); g.fill(visitorJacket);
    reflectedCloth(g,visitorFacing,'#465654',.28*clothLight);
    reflectedCloth(g,visitorPocket,'#455350',.30*clothLight);
    visitorArm(g,true,pose,clothLight);
  } else {
    sleeve(g,4.0,-141.5,7.8+3.2*swing,-116,9.5+4.4*swing,-96,5.0,3.5);
    overcoat(g,(pose.hem ?? 0)*.76,clothLight);
    reflectedCloth(g,foldedLapel,'#3e4f4f',.32*clothLight);
    const nearArm = sleeve(g,-7.8,-141.5,-13.6-3.2*swing,-114.5,-1.2-4.4*swing,-96.2,6.0,4.0);
    if (clothLight > 0) {
      const crease = new Path2D();
      crease.moveTo(-12.5,-136.5);
      crease.quadraticCurveTo(-18.6-3.2*swing,-116.5,-17.8-3.2*swing,-114.0);
      crease.quadraticCurveTo(-12.2-3.6*swing,-105.0,-4.5-4.4*swing,-95.5);
      crease.lineTo(-1.8-4.4*swing,-97.2);
      crease.quadraticCurveTo(-9.6-3.6*swing,-106.5,-14.6-3.2*swing,-114.5);
      crease.quadraticCurveTo(-15.0-3.2*swing,-117.0,-9.8,-136.5);
      crease.closePath();
      g.save(); g.clip(nearArm); reflectedCloth(g,crease,'#445554',.22*clothLight); g.restore();
    }
  }
  g.restore();
  const yaw = visitor ? .53+.47*(pose.glance ?? turn) : .98*(2*(pose.glance ?? 1)-1);
  const index = Math.round((1+Math.max(-1,Math.min(1,yaw)))*turnSteps/2);
  g.translate(...model.neck);
  const tilt = visitor ? (pose.nod ?? 0)-.72*pitch : .85*(pose.nod ?? 0)+.037*(1-turn);
  g.rotate(model.tilt+tilt);
  g.fill(faceAt(model,index));
  if (!visitor) g.fill(fedoraViews[index]);
  g.restore();
}
