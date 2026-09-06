/** Double-precision document geometry; radians internally, drawing units throughout. */
export const TAU = Math.PI * 2;
export const EPS = 1e-9;
export const point = (x=0,y=0) => ({x,y});
export const add = (a,b) => point(a.x+b.x,a.y+b.y);
export const sub = (a,b) => point(a.x-b.x,a.y-b.y);
export const mul = (a,k) => point(a.x*k,a.y*k);
export const dot = (a,b) => a.x*b.x+a.y*b.y;
export const cross = (a,b) => a.x*b.y-a.y*b.x;
export const length = a => Math.hypot(a.x,a.y);
export const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
export const midpoint = (a,b) => mul(add(a,b),.5);
export const angle = (a,b) => Math.atan2(b.y-a.y,b.x-a.x);
export const normalizeAngle = a => ((a%TAU)+TAU)%TAU;
export const clone = a => structuredClone(a);
export const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
export const fmt = (n,digits=2) => Number.isFinite(n) ? Number(n.toFixed(digits)).toLocaleString('en-US',{maximumFractionDigits:digits}) : '—';
export const id = () => globalThis.crypto?.randomUUID?.() ?? `e${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
export function closestOnSegment(p,a,b) {
  const v=sub(b,a), d=dot(v,v), t=d<EPS?0:Math.max(0,Math.min(1,dot(sub(p,a),v)/d));
  return add(a,mul(v,t));
}
export function lineIntersection(a,b,c,d,segments=true) {
  const r=sub(b,a),s=sub(d,c),div=cross(r,s);
  if(Math.abs(div)<EPS)return null;
  const q=sub(c,a), t=cross(q,s)/div,u=cross(q,r)/div;
  if(segments&&(t < -EPS || t > 1+EPS || u < -EPS || u > 1+EPS))return null;
  return {...add(a,mul(r,t)),t,u};
}
export function circumcircle(a,b,c) {
  const u=sub(b,a),v=sub(c,a),d=2*cross(u,v);
  if(Math.abs(d)<EPS)return null;
  const uu=dot(u,u),vv=dot(v,v);
  const center=add(a,point((v.y*uu-u.y*vv)/d,(u.x*vv-v.x*uu)/d));
  return {center,radius:distance(center,a)};
}
export function arcThrough(a,b,c) {
  const circle=circumcircle(a,b,c);if(!circle)return null;
  let start=angle(circle.center,a),end=angle(circle.center,c);
  if(normalizeAngle(angle(circle.center,b)-start)>normalizeAngle(end-start)) [start,end]=[end,start];
  return {type:'ARC',...circle,start,end};
}
export function bulgeArc(a,b,bulge) {
  if(Math.abs(bulge)<EPS||distance(a,b)<EPS)return null;
  const v=sub(b,a), d=length(v), center=add(midpoint(a,b),mul(point(-v.y/d,v.x/d),d*(1-bulge*bulge)/(4*bulge)));
  return {center,radius:distance(center,a),start:angle(center,a),sweep:4*Math.atan(bulge)};
}
export function sampleArc(center,radius,start,sweep,tolerance=.5) {
  if(!Number.isFinite(radius)||radius<EPS)return [center];
  const step=Math.max(.005,2*Math.acos(Math.max(-1,Math.min(1,1-Math.max(tolerance,EPS)/radius))));
  const count=Math.max(2,Math.min(4096,Math.ceil(Math.abs(sweep)/step)));
  return Array.from({length:count+1},(_,i)=>point(center.x+radius*Math.cos(start+sweep*i/count),center.y+radius*Math.sin(start+sweep*i/count)));
}
function sampleSpline(e,tolerance) {
  const pts=e.controlPoints?.length?e.controlPoints:e.fitPoints??[];
  if(pts.length<2)return pts.slice();
  if(!e.controlPoints?.length)return pts.slice();
  const p=Math.min(Math.max(1,e.degree??3),pts.length-1), n=pts.length-1;
  let knots=e.knots??[];
  if(knots.length!==n+p+2){knots=Array.from({length:n+p+2},(_,i)=>i<=p?0:i>=n+1?1:(i-p)/(n+1-p));}
  const lo=knots[p],hi=knots[n+1]; if(!(hi>lo))return pts.slice();
  const evalAt=u=>{
    let k=n;for(let i=p;i<=n;i++)if(u>=knots[i]&&u<knots[i+1]){k=i;break;}
    const d=Array.from({length:p+1},(_,j)=>{const index=k-p+j,w=e.weights?.[index]??1;return [pts[index].x*w,pts[index].y*w,w];});
    for(let r=1;r<=p;r++)for(let j=p;j>=r;j--){const i=k-p+j,den=knots[i+p-r+1]-knots[i],a=Math.abs(den)<EPS?0:(u-knots[i])/den;for(let c=0;c<3;c++)d[j][c]=(1-a)*d[j-1][c]+a*d[j][c];}
    return Math.abs(d[p][2])<EPS?point(d[p][0],d[p][1]):point(d[p][0]/d[p][2],d[p][1]/d[p][2]);
  };
  const out=[evalAt(lo)];
  const split=(a,b,pa,pb,depth)=>{const u=(a+b)/2,pm=evalAt(u),q1=evalAt((3*a+b)/4),q3=evalAt((a+3*b)/4);if(depth<10&&Math.max(distance(pm,closestOnSegment(pm,pa,pb)),distance(q1,closestOnSegment(q1,pa,pb)),distance(q3,closestOnSegment(q3,pa,pb)))>tolerance){split(a,u,pa,pm,depth+1);split(u,b,pm,pb,depth+1);}else out.push(pb);};
  const unique=[...new Set(knots.filter(k=>k>=lo&&k<=hi))];
  for(let i=1;i<unique.length;i++)split(unique[i-1],unique[i],evalAt(unique[i-1]),evalAt(unique[i]),0);
  return out;
}
export function polylinePoints(e,tolerance=.5) {
  const pts=e.points??[],out=[];if(!pts.length)return out;
  const count=e.closed?pts.length:pts.length-1;
  for(let i=0;i<count;i++) { const a=pts[i],b=pts[(i+1)%pts.length],arc=bulgeArc(a,b,a.bulge??0);const segment=arc?sampleArc(arc.center,arc.radius,arc.start,arc.sweep,tolerance):[a,b];if(i)segment.shift();out.push(...segment); }
  if(pts.length===1)out.push(pts[0]);return out;
}
export function emptyBounds(){return {minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};}
export function includePoint(b,p){if(finitePoint(p)){b.minX=Math.min(b.minX,p.x);b.minY=Math.min(b.minY,p.y);b.maxX=Math.max(b.maxX,p.x);b.maxY=Math.max(b.maxY,p.y);}return b;}
export function unionBounds(a,b){a.minX=Math.min(a.minX,b.minX);a.minY=Math.min(a.minY,b.minY);a.maxX=Math.max(a.maxX,b.maxX);a.maxY=Math.max(a.maxY,b.maxY);return a;}
export const validBounds=b=>b&&Number.isFinite(b.minX)&&Number.isFinite(b.minY)&&Number.isFinite(b.maxX)&&Number.isFinite(b.maxY);
export const overlaps=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minY<=b.maxY&&a.maxY>=b.minY;
export const contains=(a,b)=>a.minX<=b.minX&&a.minY<=b.minY&&a.maxX>=b.maxX&&a.maxY>=b.maxY;
export function geometry(e,tolerance=.5) {
  const paths=[],texts=[],fills=[];const push=p=>{if(p?.length>1)paths.push(p);};
  switch(e.type){
    case 'LINE':push([e.a,e.b]);break;
    case 'LWPOLYLINE':case 'POLYLINE':push(polylinePoints(e,tolerance));break;
    case 'CIRCLE':push(sampleArc(e.center,e.radius,0,TAU,tolerance));break;
    case 'ARC':push(sampleArc(e.center,e.radius,e.start,normalizeAngle(e.end-e.start)||TAU,tolerance));break;
    case 'ELLIPSE':{const r=length(e.major),rot=Math.atan2(e.major.y,e.major.x),s=e.start??0,sw=normalizeAngle((e.end??TAU)-s)||TAU;const p=sampleArc(point(),r,s,sw,tolerance).map(p=>point(e.center.x+p.x*Math.cos(rot)-p.y*e.ratio*Math.sin(rot),e.center.y+p.x*Math.sin(rot)+p.y*e.ratio*Math.cos(rot)));push(p);break;}
    case 'SPLINE':push(sampleSpline(e,tolerance));break;
    case 'TEXT':case 'MTEXT':texts.push({position:e.position,text:e.text,height:e.height??100,rotation:e.rotation??0,align:e.align??'left',lineSpacing:e.lineSpacing??1.3});break;
    case 'POINT':{const r=e.size??12;push([add(e.position,point(-r,0)),add(e.position,point(r,0))]);push([add(e.position,point(0,-r)),add(e.position,point(0,r))]);break;}
    case 'SOLID':case 'HATCH':for(const p of e.boundaries??[e.points])if(p?.length>2){push([...p,p[0]]);fills.push({points:p,pattern:e.pattern??'SOLID'});}break;
    case 'DIMENSION':{
      const a=e.a,b=e.b,o=e.offset??300,h=e.height??90;
      let p,q;if(e.orientation==='vertical'){p=point(o,a.y);q=point(o,b.y);}else if(e.orientation==='horizontal'){p=point(a.x,o);q=point(b.x,o);}else{const v=sub(b,a),l=length(v)||1,n=point(-v.y/l,v.x/l);p=add(a,mul(n,o));q=add(b,mul(n,o));}
      const v=sub(q,p),l=length(v)||1,u=mul(v,1/l),n=point(-u.y,u.x),gap=h*.2,ext=h*.5;
      for(const [src,dst]of[[a,p],[b,q]]){const dir=mul(sub(dst,src),1/(distance(src,dst)||1));push([add(src,mul(dir,gap)),add(dst,mul(dir,ext))]);}
      push([p,q]);for(const end of[p,q])push([add(end,mul(add(u,n),-h*.36)),add(end,mul(add(u,n),h*.36))]);
      const value=e.orientation==='horizontal'?Math.abs(b.x-a.x):e.orientation==='vertical'?Math.abs(b.y-a.y):distance(a,b);
      texts.push({position:add(midpoint(p,q),mul(n,h*.55)),text:e.text?.replace('<>',fmt(value,0))??fmt(value,0),height:h,rotation:Math.atan2(v.y,v.x),align:'center'});break;
    }
  }
  const bounds=emptyBounds();for(const p of paths)for(const v of p)includePoint(bounds,v);for(const f of fills)for(const p of f.points)includePoint(bounds,p);
  for(const t of texts){const lines=String(t.text).split('\n'),w=Math.max(...lines.map(l=>l.length))*t.height*.7,h=lines.length*t.height*1.35,dx=t.align==='center'?-w/2:t.align==='right'?-w:0;for(const q of[point(dx,0),point(dx+w,0),point(dx+w,-h),point(dx,-h),point(dx,t.height)])includePoint(bounds,add(t.position,point(q.x*Math.cos(t.rotation)-q.y*Math.sin(t.rotation),q.x*Math.sin(t.rotation)+q.y*Math.cos(t.rotation))));}
  return {paths,texts,fills,bounds};
}
export function snapPoints(e){
  switch(e.type){
    case 'LINE':return [{...e.a,kind:'endpoint'},{...e.b,kind:'endpoint'},{...midpoint(e.a,e.b),kind:'midpoint'}];
    case 'LWPOLYLINE':case 'POLYLINE':{const p=e.points.map(p=>({...p,kind:'endpoint'}));for(let i=0;i<e.points.length-(e.closed?0:1);i++){const a=e.points[i],b=e.points[(i+1)%e.points.length],arc=bulgeArc(a,b,a.bulge??0);p.push({...arc?point(arc.center.x+arc.radius*Math.cos(arc.start+arc.sweep/2),arc.center.y+arc.radius*Math.sin(arc.start+arc.sweep/2)):midpoint(a,b),kind:'midpoint'});}return p;}
    case 'CIRCLE':case 'ARC':{const p=[{...e.center,kind:'center'}];for(let i=0;i<4;i++){const a=i*Math.PI/2;if(e.type==='CIRCLE'||normalizeAngle(a-e.start)<=normalizeAngle(e.end-e.start))p.push({...add(e.center,point(e.radius*Math.cos(a),e.radius*Math.sin(a))),kind:'quadrant'});}if(e.type==='ARC')for(const a of[e.start,e.end])p.push({...add(e.center,point(e.radius*Math.cos(a),e.radius*Math.sin(a))),kind:'endpoint'});return p;}
    case 'ELLIPSE':return [{...e.center,kind:'center'}];
    case 'TEXT':case 'MTEXT':case 'POINT':return [{...e.position,kind:'insertion'}];
    case 'DIMENSION':return [{...e.a,kind:'endpoint'},{...e.b,kind:'endpoint'}];
    case 'SPLINE':return (e.controlPoints??[]).map(p=>({...p,kind:'control'}));
    default:return (e.points??[]).map(p=>({...p,kind:'endpoint'}));
  }
}
/** [a,b,c,d,tx,ty], x'=ax+cy+tx; y'=bx+dy+ty. */
export const identity=()=>[1,0,0,1,0,0];
export const transformPoint=(p,m)=>point(p.x*m[0]+p.y*m[2]+m[4],p.x*m[1]+p.y*m[3]+m[5]);
export function multiplyMatrix(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export const translation=(x,y)=>[1,0,0,1,x,y];
export const rotation=(r,p=point())=>multiplyMatrix(translation(p.x,p.y),multiplyMatrix([Math.cos(r),Math.sin(r),-Math.sin(r),Math.cos(r),0,0],translation(-p.x,-p.y)));
export const scaling=(s,p=point())=>[s,0,0,s,p.x*(1-s),p.y*(1-s)];
export function reflection(a,b){const t=angle(a,b),c=Math.cos(2*t),s=Math.sin(2*t);return multiplyMatrix(translation(a.x,a.y),multiplyMatrix([c,s,s,-c,0,0],translation(-a.x,-a.y)));}
export function transformEntity(e,m){
  const out=clone(e),tp=p=>transformPoint(p,m),sx=Math.hypot(m[0],m[1]),sy=Math.hypot(m[2],m[3]),det=m[0]*m[3]-m[1]*m[2],rot=Math.atan2(m[1],m[0]);
  const similarity=Math.abs(sx-sy)<1e-8*Math.max(sx,sy,1)&&Math.abs(m[0]*m[2]+m[1]*m[3])<1e-8*Math.max(sx*sy,1);
  switch(e.type){
    case 'LINE':out.a=tp(e.a);out.b=tp(e.b);break;
    case 'LWPOLYLINE':case 'POLYLINE':if(!similarity&&e.points.some(p=>p.bulge))out.points=polylinePoints(e,.1).map(tp);else out.points=e.points.map(p=>({...tp(p),...p.bulge?{bulge:p.bulge*(det<0?-1:1)}:{}}));break;
    case 'CIRCLE':if(!similarity){out.type='LWPOLYLINE';out.points=geometry(e,.1).paths[0].slice(0,-1).map(tp);out.closed=true;delete out.center;delete out.radius;}else{out.center=tp(e.center);out.radius=e.radius*sx;}break;
    case 'ARC':if(!similarity){out.type='LWPOLYLINE';out.points=geometry(e,.1).paths[0].map(tp);out.closed=false;delete out.center;delete out.radius;delete out.start;delete out.end;}else{out.center=tp(e.center);out.radius=e.radius*sx;const sa=tp(add(e.center,point(Math.cos(e.start)*e.radius,Math.sin(e.start)*e.radius))),ea=tp(add(e.center,point(Math.cos(e.end)*e.radius,Math.sin(e.end)*e.radius)));out.start=angle(out.center,det<0?ea:sa);out.end=angle(out.center,det<0?sa:ea);}break;
    case 'ELLIPSE':{if(similarity){out.center=tp(e.center);out.major=point(e.major.x*m[0]+e.major.y*m[2],e.major.x*m[1]+e.major.y*m[3]);if(det<0){out.start=-(e.end??TAU);out.end=-(e.start??0);}}else{out.type='LWPOLYLINE';out.points=geometry(e,.1).paths[0].map(tp);out.closed=Math.abs(normalizeAngle((e.end??TAU)-(e.start??0)))<EPS;}break;}
    case 'SPLINE':out.controlPoints=(e.controlPoints??[]).map(tp);out.fitPoints=(e.fitPoints??[]).map(tp);break;
    case 'TEXT':case 'MTEXT':out.position=tp(e.position);out.height=e.height*sy;out.rotation=rot+(det<0?-e.rotation:e.rotation);break;
    case 'POINT':out.position=tp(e.position);break;
    case 'HATCH':case 'SOLID':if(e.points)out.points=e.points.map(tp);if(e.boundaries)out.boundaries=e.boundaries.map(p=>p.map(tp));break;
    case 'DIMENSION':{out.a=tp(e.a);out.b=tp(e.b);if(e.orientation==='horizontal'||e.orientation==='vertical'){const p=e.orientation==='horizontal'?point(e.a.x,e.offset):point(e.offset,e.a.y);const pp=tp(p),v=sub(out.b,out.a),len=length(v)||1;out.offset=cross(v,sub(pp,out.a))/len;out.orientation='aligned';}else out.offset=e.offset*sx*(det<0?-1:1);out.height=(e.height??90)*sy;break;}
  }
  return out;
}
export function entityLength(e){if(e.type==='CIRCLE')return TAU*e.radius;if(e.type==='ARC')return (normalizeAngle(e.end-e.start)||TAU)*e.radius;return geometry(e,.1).paths.reduce((total,path)=>total+path.slice(1).reduce((s,p,i)=>s+distance(path[i],p),0),0);}
export function entityArea(e){if(e.type==='CIRCLE')return Math.PI*e.radius**2;if(e.type==='ELLIPSE')return Math.PI*dot(e.major,e.major)*e.ratio;if((e.type==='LWPOLYLINE'||e.type==='POLYLINE')&&e.closed){const p=e.points,o=p[0]??point();let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=cross(sub(a,o),sub(b,o))/2;const arc=bulgeArc(a,b,a.bulge??0);if(arc)area+=arc.radius*arc.radius*(arc.sweep-Math.sin(arc.sweep))/2;}return Math.abs(area);}return null;}
export class SpatialIndex {
  constructor(items=[]){this.root=this.build(items.slice());}
  build(items){if(!items.length)return null;const bounds=emptyBounds();for(const it of items)unionBounds(bounds,it.bounds);if(items.length<=12)return {bounds,items};const axis=bounds.maxX-bounds.minX>bounds.maxY-bounds.minY?'X':'Y';items.sort((a,b)=>(a.bounds['min'+axis]+a.bounds['max'+axis])-(b.bounds['min'+axis]+b.bounds['max'+axis]));const mid=items.length>>1;return{bounds,left:this.build(items.slice(0,mid)),right:this.build(items.slice(mid))};}
  query(bounds){const out=[],visit=n=>{if(!n||!overlaps(n.bounds,bounds))return;if(n.items){for(const it of n.items)if(overlaps(it.bounds,bounds))out.push(it);}else{visit(n.left);visit(n.right);}};visit(this.root);return out;}
}
