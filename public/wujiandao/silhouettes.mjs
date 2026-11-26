// Figure coordinates are measured from the floor. Positive x is the direction of travel.
const castHeads = {
  short: {
    front: 'M-2 -31 C3.7 -31.8 9.2 -28.9 10.2 -24.8 C10.45 -22.5 9.3 -20.8 9.9 -19.65 Q11 -18.62 10.37 -17.85 C10.5 -16.68 11.74 -15.01 12.77 -13.81 Q13.17 -13.16 12.48 -12.83 L10.64 -12.59 L10.30 -11.39 Q10.94 -10.91 10.31 -10.50 L10.00 -10.22 L10.35 -9.56 L9.65 -8.99 Q9.18 -8.67 9.56 -7.54 Q9.72 -6.36 8.07 -6.02 C5.96 -5.64 4.61 -5.43 3.49 -4.34 Q2.47 -3.01 4.10 .66 L6.42 3.92',
    back: 'M-2 -31 C-8.55 -31.31 -13.0 -27.9 -13.1 -21.25 Q-12.98 -18.75 -12.20 -16.46 L-11.03 -13.10 Q-10.57 -10.77 -9.07 -9.55 Q-7.16 -7.94 -7.52 -5.63 Q-7.92 -2.41 -10.94 2.5',
    neck: [2.35, -154.9], tilt: .104, nose: [12.77, -13.81]
  },
  long: {
    front: 'M-2.2 -31.1 C1.9 -31.4 5.9 -30.2 8.4 -27.9 Q9.85 -26.6 10.30 -24.5 Q9.95 -23.5 9.18 -22.55 C9.12 -21.1 9.50 -19.4 10.14 -18.1 Q10.24 -17.55 9.72 -16.85 C10.50 -15.35 11.55 -13.75 12.28 -12.45 Q12.56 -11.92 11.92 -11.52 L10.38 -11.20 Q10.22 -10.72 10.74 -10.12 Q10.90 -9.82 10.40 -9.52 L9.88 -9.36 Q10.46 -8.98 10.28 -8.38 Q10.05 -7.95 9.52 -7.62 Q9.98 -7.02 9.88 -6.08 Q9.70 -4.75 8.10 -4.48 C6.25 -4.25 4.72 -4.08 3.92 -3.35 Q3.28 -2.10 3.78 .75 L5.60 4.45',
    back: 'M-2.2 -31.1 C-6.8 -31.0 -10.5 -28.4 -11.7 -24.1 C-12.35 -21.3 -12.05 -18.0 -11.05 -15.2 C-10.45 -13.4 -10.0 -11.7 -9.85 -10.3 Q-9.15 -10.1 -8.50 -9.45 C-8.42 -7.0 -8.52 -3.6 -9.35 .4 Q-10.0 2.6 -11.5 4.6',
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
  const knee = visitor ? 6.95 : 7.0, hem = visitor ? 5.60 : 5.70;
  const p = new Path2D();
  if (visitor) {
    // Clean straight-cut dress trousers with a subtle knee drape and crisp shoe break.
    p.moveTo(hipX-9.1,hipY-3);
    p.bezierCurveTo(hipX-10.8,hipY+13,kx-knee-1.1,ky-10,kx-knee,ky-.2);
    p.bezierCurveTo(kx-knee-.8,ky+11,ankleX-hem-.3,ankleY-9.5,ankleX-hem-.6,ankleY-2.6);
    p.lineTo(ankleX-hem+.1,ankleY+.4);p.quadraticCurveTo(ankleX+.9,ankleY+1.8,ankleX+hem+1.3,ankleY+1.1);
    p.quadraticCurveTo(ankleX+hem+1.4,ankleY-.6,ankleX+hem+.4,ankleY-2.8);
    p.bezierCurveTo(ankleX+hem-.2,ankleY-10.5,kx+knee-.1,ky+11,kx+knee+.1,ky+.8);
    p.bezierCurveTo(kx+knee+1.2,ky-8.5,hipX+9.6,hipY+11,hipX+8.8,hipY-3);
  } else {
    p.moveTo(hipX-8.7,hipY-1);
    p.bezierCurveTo(hipX-10.2,hipY+12,kx-knee-1.2,ky-8.3,kx-knee,ky+.6);
    p.bezierCurveTo(kx-knee-1.25,ky+13,ankleX-hem+.6,ankleY-7,ankleX-hem,ankleY-2.5);
    p.lineTo(ankleX-hem-.6,ankleY+.75);
    p.quadraticCurveTo(ankleX,ankleY+2.1,ankleX+hem+.35,ankleY+1.1);
    p.quadraticCurveTo(ankleX+hem+1.05,ankleY-.25,ankleX+hem-.40,ankleY-2.7);
    p.bezierCurveTo(ankleX+hem-.05,ankleY-9,kx+knee+.2,ky+13,kx+knee,ky+.75);
    p.quadraticCurveTo(kx+knee+1.5,ky-6.2,hipX+8.75,hipY-1);
  }
  p.closePath(); g.fill(p);
  if (near && visitor) reflectedCloth(g,p,'#384647',.12*light);
  g.save(); g.translate(foot[0]+pivot,foot[1]); g.rotate(pitch); g.translate(-pivot,0);
  const flat = Math.max(0, 1 - Math.abs(pitch)/.18 + Math.min(0, foot[1]/10));
  g.scale(near ? 1 : 1-.20*flat, 1); g.fill(visitor ? visitorShoe : shoe); g.restore();
}

function overcoat(g, wind) {
  const p = new Path2D();
  p.moveTo(-10.8,-160.2);p.lineTo(-4.8,-158.6);p.lineTo(3.7,-157.8);p.lineTo(10.8,-159.8);
  p.lineTo(12.2,-154.1);p.quadraticCurveTo(17,-151.8,23,-148.2);
  p.quadraticCurveTo(26,-144.9,24.5,-137.7);p.quadraticCurveTo(19.5,-122.1,17.4,-106.9);
  p.quadraticCurveTo(20.0,-86.6,25.6,-56);p.quadraticCurveTo(21,-53.6,14.1,-53.0);
  p.lineTo(8.6,-61.7);p.lineTo(9.5,-52.2);p.quadraticCurveTo(-6.5,-48.5,-17.0,-48.7);
  p.lineTo(-15.4,-73);p.lineTo(-21.6-wind*.53,-48.3);p.quadraticCurveTo(-30-wind,-48.8,-35.7-wind,-51.4);
  p.bezierCurveTo(-27-wind*.57,-77.2,-20.7,-93.0,-21.0,-111.0);
  p.quadraticCurveTo(-23.8,-129.4,-28.2,-140.6);p.quadraticCurveTo(-29,-148.5,-20.2,-151.8);
  p.lineTo(-12.4,-154.8);p.closePath();
  g.fill(p);
}

// Tailored stand-collar jacket: crisp collar edge, squared shoulder, structured hem above dress trousers.
const visitorJacket = new Path2D(
  'M-11.2 -154.6 L-5.4 -153.2 Q-.2 -151.6 6.4 -150.1 L7.4 -148.7 '
  +'Q11.5 -146.6 15.2 -142.0 Q17.2 -139.0 17.3 -133.2 '
  +'C17.4 -126.4 16.5 -115.2 15.8 -105.0 L15.5 -91.8 L14.8 -88.2 '
  +'Q7.0 -87.0 -1.2 -87.3 Q-9.5 -87.5 -15.6 -89.1 '
  +'L-15.4 -92.6 C-16.2 -101.5 -17.0 -111.5 -18.2 -122.5 '
  +'C-19.5 -133.0 -19.8 -141.5 -17.6 -147.2 Q-15.6 -150.6 -11.8 -152.0 Z');
const waistSeat = new Path2D('M-11.6 -8.4 Q0 -11.0 11.4 -8.6 L12.6 2.1 Q10.8 9.8 4.8 12.4 L1.8 13.8 Q-3.6 11.4 -9.4 10.0 Q-13.8 6.8 -13.2 1.6Z');
const visitorFacing = new Path2D('M-10.4 -153.8 L-5.0 -152.4 Q.2 -150.8 6.5 -149.4 L11.5 -145.8 L10.7 -144.6 L6.0 -148.1 Q.0 -149.6 -5.4 -151.2 L-10.4 -152.6 Z');
const visitorPocket = new Path2D('M-2.2 -96.4 Q2.6 -99.8 7.2 -103.6 L7.9 -102.9 Q3.3 -98.8 -1.6 -95.4Z');
const pocketOpening = new Path2D('M-75 -205 H76 V-145 L7.2 -103.6 Q2.6 -99.8 -2.2 -96.4 L-75 -56Z');
const foldedLapel = new Path2D('M-10.4 -159.2 L-6.2 -157.4 L-7.6 -150.8 L-4.4 -151.4 L-1.2 -136.0 L-6.0 -150.2 L-9.2 -149.4 L-7.8 -156.6Z M-19 -93 Q-19.6 -71.7 -27.5 -53.2 Q-21.8 -74 -19 -93Z');
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
}

function reflectedCloth(g, path, shade, light) {
  if (light <= 0) return;
  g.save();g.globalAlpha *= light;g.fillStyle=shade;g.fill(path);g.restore();
}

function visitorArm(g, near, pose, light) {
  const direction = near ? 1 : -1;
  const phase = direction*(pose.swing ?? 0), trail = direction*(pose.armTrail ?? pose.swing ?? 0);
  const pocket = near ? (pose.pocket ?? 0) : 0, turn = pose.turn ?? 1;
  const sx = (near ? -6.0-2.4*turn : 3.2+1.6*turn) + 1.15*phase;
  const sy = (near ? -143.0+1.0*pocket : -141.5) + .40*phase;
  const relaxed = pose.restWeight ?? 0;
  const hangUpper = (near ? -.09 : -.05) + .25*phase;
  const hangLower = (near ? .24 : .14-.08*relaxed) + .30*trail + .08*Math.max(0,phase);
  const upper = hangUpper+(-.27-hangUpper)*pocket;
  const lower = hangLower+(.84-hangLower)*pocket;
  const ax=Math.sin(upper), ay=Math.cos(upper), bx=Math.sin(lower), by=Math.cos(lower);
  const ex=sx+26.8*ax, ey=sy+26.8*ay, wx=ex+23.8*bx, wy=ey+23.8*by;
  const nx=(ay+by)*.5, ny=-(ax+bx)*.5, cuff=near?4.15:3.70, cap=near?6.5:5.4;
  const p=new Path2D();
  p.moveTo(sx-cap*ay,sy+cap*ax-.4);
  p.bezierCurveTo(sx-(cap+1.8)*ay+5*ax,sy+(cap+1.8)*ax+5*ay,ex-6.4*ay-7*ax,ey+6.4*ax-7*ay,
    ex-6.2*nx-.8*ax,ey-6.2*ny-.8*ay);
  p.quadraticCurveTo(ex-6.4*nx+2.2*bx,ey-6.4*ny+2.2*by,ex-5.6*by+5.0*bx,ey+5.6*bx+5.0*by);
  p.quadraticCurveTo(wx-5.0*by-5.5*bx,wy+5.0*bx-5.5*by,wx-cuff*by-.5*bx,wy+cuff*bx-.5*by);
  p.lineTo(wx-(cuff-.4)*by+.6*bx,wy+(cuff-.4)*bx+.6*by);
  p.quadraticCurveTo(wx+.25*bx,wy+.25*by,wx+cuff*by+.25*bx,wy-cuff*bx+.25*by);
  p.quadraticCurveTo(wx+(cuff+1.4)*by-8.0*bx,wy-(cuff+1.4)*bx-8.0*by,ex+5.3*nx+2.0*bx,ey+5.3*ny+2.0*by);
  p.quadraticCurveTo(ex+5.8*ay,ey-5.8*ax-3.6,sx+(cap-.3)*ay+4.0*ax,sy-(cap-.3)*ax+4.0*ay);
  p.bezierCurveTo(sx+cap*ay,sy-4.4,sx-3.2*ay,sy-(near?6.2:5.2),sx-cap*ay,sy+cap*ax-.4);
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
    fold.moveTo(sx-5.4*ay+6*ax,sy+5.4*ax+6*ay);
    fold.quadraticCurveTo(ex-6.8*ay-6*ax,ey+6.8*ax-6*ay,ex-5.7*nx,ey-5.7*ny);
    fold.quadraticCurveTo(ex-5.3*by+6*bx,ey+5.3*bx+6*by,wx-3.6*by,wy+3.6*bx);
    fold.quadraticCurveTo(ex-3.2*by+5*bx,ey+3.2*bx+5*by,ex-3.5*nx,ey-3.5*ny);
    fold.quadraticCurveTo(ex-5.1*ay-7*ax,ey+5.1*ax-7*ay,sx-5.4*ay+6*ax,sy+5.4*ax+6*ay);
    g.save();g.clip(p);reflectedCloth(g,fold,'#445453',light*.18);g.restore();
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
  trouserLeg(g,hips-(visitor?4.6:6.35),hipY+.15+1.15*weight,a,pose.aPitch ?? 0,visitor,false);
  if (visitor) {
    g.save();g.translate(hips,hipY);g.fill(waistSeat);g.restore();
  }
  trouserLeg(g,hips+(visitor?3.45:6.15),hipY-.5-.55*weight,b,pose.bPitch ?? 0,visitor,true,weight,clothLight);
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
    sleeve(g,-17,-142,-22.4-3.6*swing,-118,-16.2-4.8*swing,-99,7.6,4.2);
    overcoat(g,(pose.hem ?? 0)*.76);
    reflectedCloth(g,foldedLapel,'#3b4b4b',.34*clothLight);
    const free = pose.release ?? 0;
    sleeve(g,17,-143,27.8+free,-118,12.1,-110.1+free,7.8,5);
  }
  g.restore();
  const yaw = visitor ? .53+.47*(pose.glance ?? turn) : .98*(2*(pose.glance ?? 1)-1);
  const index = Math.round((1+Math.max(-1,Math.min(1,yaw)))*turnSteps/2);
  g.translate(...model.neck);
  const tilt = visitor ? (pose.nod ?? 0)-.72*pitch : .85*(pose.nod ?? 0)+.037*(1-turn);
  g.rotate(model.tilt+tilt); g.fill(faceAt(model,index));
  if (!visitor) g.fill(fedoraViews[index]);
  g.restore();
}
