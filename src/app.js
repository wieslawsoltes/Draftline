import {point,add,sub,mul,dot,cross,length,distance,midpoint,angle,fmt,id,clone,TAU,EPS,geometry,snapPoints,emptyBounds,includePoint,unionBounds,validBounds,overlaps,contains,closestOnSegment,lineIntersection,arcThrough,bulgeArc,normalizeAngle,transformEntity,translation,rotation,scaling,reflection,entityLength,entityArea} from './geometry.js';
import {DocumentModel} from './model.js';
import {CADRenderer} from './renderer.js';
import {parseDXF,writeDXF} from './dxf.js';
import {createDemo} from './demo.js';
import {icon,applyIcons} from './icons.js';

const $=(s,root=document)=>root.querySelector(s),$$=(s,root=document)=>[...root.querySelectorAll(s)];
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE_KEY='draftline.document.v1';
let initial=createDemo(),recovered=false;
try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY));if(data?.format==='draftline'&&Array.isArray(data.entities)&&Array.isArray(data.layers)){initial=validateProject(data);recovered=true;}}catch{}
const model=new DocumentModel(initial);
const workspace=$('#workspace'),canvas=$('#overlayCanvas'),commandInput=$('#commandInput');
const state={tool:'select',points:[],selection:new Set(),mouse:null,world:null,snap:null,hover:null,drag:null,space:false,shift:false,ortho:false,osnap:true,gridSnap:false,dynamic:true,history:[],commands:[],commandIndex:0,lastTool:'line',offsetDistance:100,polygonSides:6,clipboard:[],symbol:null,grip:null,preview:null,dimMode:'auto',lastPoint:point(),touches:new Map(),pinch:null,modified:false,importReport:null};
const renderer=new CADRenderer({grid:$('#gridCanvas'),gpu:$('#gpuCanvas'),cpu:$('#cpuCanvas'),overlay:canvas,onStatus:(mode,reason)=>{ $('#engineLabel').textContent=mode;$('#engineBadge').title=reason??'GPU-instanced antialiased line segments · double-precision document geometry';$('#engineBadge').dataset.mode=mode;if(reason)log(`Renderer: ${mode}. ${reason}`);}});
renderer.setDocument(model);
renderer.beforeOverlay=drawOverlay;
let metricAt=0;
renderer.onFrame=stats=>{if(performance.now()-metricAt>300){$('#frameMetric').textContent=`${stats.milliseconds.toFixed(1)} ms`;$('#frameMetric').title=`CPU frame preparation, not GPU completion time. ${stats.segments.toLocaleString()} line segments.`;metricAt=performance.now();}};
const resize=new ResizeObserver(entries=>{for(const entry of entries){renderer.resize(entry.contentRect.width,entry.contentRect.height);if(!renderer.initialFit){renderer.rebuild();renderer.fit();renderer.initialFit=true;}}});resize.observe(workspace);

const TOOL_DEFS={select:['Select','cursor'],line:['Line','line'],polyline:['Polyline','polyline'],rectangle:['Rectangle','rectangle'],circle:['Circle','circle'],arc:['3-point arc','arc'],ellipse:['Ellipse','ellipse'],polygon:['Polygon','polygon'],text:['Text','text'],dimension:['Dimension','dimension'],measure:['Measure','ruler'],hatch:['Hatch','hatch'],move:['Move','move'],copy:['Copy','copy'],rotate:['Rotate','rotate'],scale:['Scale','scale'],mirror:['Mirror','mirror'],offset:['Offset','offset'],trim:['Trim','trim'],extend:['Extend','extend'],pan:['Pan','hand']};
const MODIFY_TOOLS=new Set(['move','copy','rotate','scale','mirror','offset']);
const CREATION_TOOLS=new Set(['line','polyline','rectangle','circle','arc','ellipse','polygon','text','dimension','hatch','symbol']);
const ALIASES={L:'line',LINE:'line',PL:'polyline',PLINE:'polyline',POLYLINE:'polyline',REC:'rectangle',RECTANG:'rectangle',RECTANGLE:'rectangle',C:'circle',CIRCLE:'circle',A:'arc',ARC:'arc',EL:'ellipse',ELLIPSE:'ellipse',POL:'polygon',POLYGON:'polygon',T:'text',TEXT:'text',MT:'text',MTEXT:'text',D:'dimension',DIM:'dimension',DIMLINEAR:'dimension',DIMALIGNED:'dimension',DI:'measure',DIST:'measure',MEASURE:'measure',H:'hatch',HATCH:'hatch',M:'move',MOVE:'move',CO:'copy',CP:'copy',COPY:'copy',RO:'rotate',ROTATE:'rotate',SC:'scale',SCALE:'scale',MI:'mirror',MIRROR:'mirror',O:'offset',OFFSET:'offset',TR:'trim',TRIM:'trim',EX:'extend',EXTEND:'extend',P:'pan',PAN:'pan',SELECT:'select'};
const actionButton=(action,label,ic=action)=>`<button class="tool-button" data-action="${action}" title="${escapeHTML(label)}">${icon(ic)}<span>${escapeHTML(label)}</span></button>`;
const toolButton=(tool,small=false)=>{const [label,ic]=TOOL_DEFS[tool];return `<button class="${small?'tool-small':'tool-button'} ${state.tool===tool?'active':''}" data-tool="${tool}" title="${label}">${icon(ic)}<span>${label}</span></button>`;};
const group=(caption,body)=>`<div class="tool-group"><div class="tool-group-body">${body}</div><div class="group-caption">${caption}</div></div>`;
const stack=(...tools)=>`<div class="tool-stack">${tools.map(t=>toolButton(t,true)).join('')}</div>`;
let currentTab='home';
function renderRibbon(tab=currentTab){currentTab=tab;let html='';
  if(tab==='home'){
    html+=group('SELECT',toolButton('select'));
    html+=group('DRAW',['line','polyline','rectangle','circle','arc'].map(t=>toolButton(t)).join('')+stack('ellipse','polygon'));
    html+=group('MODIFY',stack('move','copy')+stack('rotate','mirror')+stack('trim','offset')+stack('scale','extend'));
    html+=group('ANNOTATE',toolButton('text')+toolButton('dimension')+toolButton('hatch'));
    html+=group('LAYERS',`<div class="tool-stack"><select class="ribbon-layer-select" id="activeLayerSelect" aria-label="Current layer">${model.layers.map(l=>`<option value="${escapeHTML(l.name)}" ${l.name===model.activeLayer?'selected':''}>${escapeHTML(l.name)}</option>`).join('')}</select><div class="layer-controls"><span class="color-mini" style="background:${model.layer(model.activeLayer)?.color??'#999'}"></span><span style="font-size:9px;color:var(--muted)">By layer</span><span style="margin-left:auto" class="line-preview"></span><button class="icon-button small" data-panel="layers" title="Layer manager">${icon('layers')}</button></div></div>`);
    html+=group('MEASURE',toolButton('measure'));
  }else if(tab==='insert'){
    html+=group('DRAWING',actionButton('open','Open DXF','open')+actionButton('new','New drawing','new')+actionButton('sample','Sample drawing','home'));
    html+=group('SYMBOL LIBRARY',['door','desk','chair','tree'].map(s=>`<button class="tool-button" data-symbol="${s}">${icon(s==='tree'?'circle':s==='door'?'arc':s==='desk'?'rectangle':'block')}<span>${s[0].toUpperCase()+s.slice(1)}</span></button>`).join(''));
    html+=group('DRAW',toolButton('hatch')+toolButton('text')+toolButton('polygon'));html+=group('EXCHANGE',actionButton('export-dxf','Export DXF','download')+actionButton('export-json','Save project','save'));
  }else if(tab==='annotate'){
    html+=group('TEXT',toolButton('text'));html+=group('DIMENSIONS',toolButton('dimension')+`<button class="tool-button" data-action="aligned-dimension">${icon('dimension')}<span>Aligned</span></button>`);
    html+=group('ANALYZE',toolButton('measure')+actionButton('area','Area','polygon'));html+=group('PATTERNS',toolButton('hatch'));html+=group('SETTINGS',actionButton('units','Drawing units','settings'));
  }else if(tab==='view'){
    html+=group('NAVIGATE',toolButton('pan')+actionButton('zoom-in','Zoom in','zoomIn')+actionButton('zoom-out','Zoom out','zoomOut')+actionButton('fit','Zoom extents','fit')+actionButton('zoom-selection','Zoom selection','target'));
    html+=group('DISPLAY',actionButton('grid','Grid','grid')+actionButton('canvas-theme','Canvas color','sun')+actionButton('theme','UI theme','moon')+actionButton('lineweight','Lineweights','line'));
    html+=group('OUTPUT',actionButton('paper-view','Print preview','file')+actionButton('print','Print','print')+actionButton('export-svg','Export SVG','download')+actionButton('export-png','Snapshot','save'));
  }else if(tab==='manage'){
    html+=group('DOCUMENT',actionButton('save','Save locally','save')+actionButton('rename','Rename','text')+actionButton('units','Units','settings')+actionButton('statistics','Statistics','properties'));
    html+=group('ORGANIZE',actionButton('add-layer','New layer','layers')+actionButton('purge','Purge empty layers','trash')+actionButton('explode','Explode','explode'));
    html+=group('WORKSPACE',actionButton('history','History','history')+actionButton('help','Commands','keyboard')+actionButton('about','About Draftline','help'));
  }
  $('#ribbon').innerHTML=html;$$('.ribbon-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $('#activeLayerSelect')?.addEventListener('change',e=>setActiveLayer(e.target.value));
}
function setActiveLayer(name){const layer=model.layer(name);if(!layer)return;if(!layer.visible||layer.locked){toast('Make the layer visible and unlocked before drawing on it.','error');return;}model.activeLayer=name;renderLayers();renderRibbon();renderProperties();}
function renderLayers(){
  const query=$('#layerSearch').value.toLowerCase(),counts=new Map();for(const e of model.entities.values())counts.set(e.layer,(counts.get(e.layer)??0)+1);
  $('#layerCount').textContent=model.layers.length;
  $('#layerList').innerHTML=model.layers.filter(l=>l.name.toLowerCase().includes(query)).map(l=>`<div class="layer-row ${l.name===model.activeLayer?'current':''}" data-layer="${escapeHTML(l.name)}"><button class="layer-dot" style="background:${l.color}" data-layer-action="color" title="Change layer color"></button><button class="layer-name" data-layer-action="activate" title="${escapeHTML(l.name)} · ${counts.get(l.name)??0} entities">${escapeHTML(l.name)}</button><div class="layer-state"><button class="${l.visible?'':'off'}" data-layer-action="visible" title="${l.visible?'Hide':'Show'} layer">${icon(l.visible?'eye':'eyeOff')}</button><button class="${l.locked?'off':''}" data-layer-action="locked" title="${l.locked?'Unlock':'Lock'} layer">${icon(l.locked?'lock':'unlock')}</button></div></div>`).join('');
}
function showPanel(panel){if(panel==='properties'){$('#rightPanel').hidden=false;$('#rightPanel').classList.toggle('force-open',true);return;}
  const left=$('#leftPanel');left.hidden=false;left.classList.add('force-open');$('#layersPanel').hidden=panel!=='layers';$('#blocksPanel').hidden=panel!=='blocks';$('#leftPanelTitle').textContent=panel==='layers'?'Layers':'Symbol library';$('#layerCount').hidden=panel!=='layers';$$('[data-panel]').forEach(b=>b.classList.toggle('active',b.dataset.panel===panel));}
function selected(){return [...state.selection].map(key=>model.entities.get(key)).filter(e=>e&&model.editable(e));}
function updateSelection(ids){state.selection=new Set(ids);renderProperties();renderer.invalidate();}
function renderProperties(){
  const objects=selected(),e=objects[0],layer=model.layer(e?.layer??model.activeLayer);
  const row=(label,value)=>`<div class="property-row"><label>${label}</label><div class="property-value">${value}</div></div>`;
  const read=value=>`<span class="readonly">${escapeHTML(value)}</span>`;
  const input=(path,value,type='number',step='any')=>`<input data-prop="${path}" type="${type}" ${type==='number'?`step="${step}"`:''} value="${escapeHTML(value)}" aria-label="${path}">`;
  const section=(label,content)=>`<section class="property-section"><h3>${label}${icon('down')}</h3>${content}</section>`;
  let html=`<div class="selection-box">${icon(e?'cursor':'properties')}<span>${objects.length===0?'No selection':objects.length===1?entityDisplayName(e.type):objects.length+' objects selected'}</span><span>${icon('down')}</span></div>`;
  const layerSelect=`<select id="propLayer" aria-label="Entity layer">${model.layers.map(l=>`<option value="${escapeHTML(l.name)}" ${l.name===(e?.layer??model.activeLayer)?'selected':''}>${escapeHTML(l.name)}</option>`).join('')}</select>`;
  const color=e?.color??'BYLAYER';
  html+=section('General',row('Layer',layerSelect)+row('Color',`<input type="color" id="propColor" value="${color.startsWith('#')?color:layer?.color??'#dce3eb'}" aria-label="Entity color"><button class="property-color-label" data-action="bylayer" title="Reset selection color to ByLayer" style="font-size:9px;padding:0">${color.startsWith('#')?color:'By layer'}</button>`)+row('Linetype',`<select id="propLinetype" aria-label="Linetype">${['BYLAYER','CONTINUOUS','DASHED','CENTER'].map(t=>`<option ${t===(e?.linetype??'BYLAYER')?'selected':''}>${t}</option>`).join('')}</select>`)+row('Lineweight',read(e?.lineweight>=0?fmt(e.lineweight/100)+' mm':'By layer'))+row('Transparency',read('0%')));
  if(!objects.length){
    html+=`<div class="property-divider"></div>`;
    html+=section('Drawing',row('Units',read(unitName(model.units)))+row('View',read('Top / World'))+row('Scale',read('Model space 1:1'))+row('Precision',read('0.000')));
    html+=`<div class="drawing-stats"><div class="drawing-stat"><b>${fmt(model.entities.size,0)}</b><span>DRAWING ENTITIES</span></div><div class="drawing-stat"><b>${model.layers.length}</b><span>LAYERS</span></div></div><div class="properties-empty">${icon('cursor')}<strong>Every detail, in your control.</strong><p>Select an object to inspect its geometry and edit its properties.</p><p style="margin-top:10px"><span class="small-shortcut">Shift</span> to add to selection<br>Drag left → right for a window.</p></div>`;
  }else if(objects.length===1){
    let g='';
    const pRow=(label,path,p)=>row(label+' X',input(path+'.x',p.x))+row(label+' Y',input(path+'.y',p.y));
    if(e.type==='LINE')g+=pRow('Start','a',e.a)+pRow('End','b',e.b);
    if(e.center)g+=pRow('Center','center',e.center);
    if(e.radius!==undefined)g+=row('Radius',input('radius',e.radius));
    if(e.position)g+=pRow('Position','position',e.position);
    if(e.type==='TEXT'||e.type==='MTEXT')g+=row('Text',input('text',e.text,'text'))+row('Height',input('height',e.height))+row('Rotation',input('$rotation',(e.rotation??0)*180/Math.PI));
    if(e.type==='ARC')g+=row('Start angle',input('$start',e.start*180/Math.PI))+row('End angle',input('$end',e.end*180/Math.PI));
    if(e.points)g+=row('Vertices',read(e.points.length))+row('Closed',read(e.closed?'Yes':'No'));
    if(e.type==='DIMENSION')g+=row('Offset',input('offset',e.offset))+row('Text height',input('height',e.height));
    if(e.type==='ELLIPSE')g+=row('Ratio',input('ratio',e.ratio));
    g+=row('Length',read(fmt(entityLength(e),3)));const area=entityArea(e);if(area!==null)g+=row('Area',read(fmt(area,3)+' units²'));
    html+=`<div class="property-divider"></div>`+section('Geometry',g);
    html+=`<div class="property-divider"></div><div style="display:flex;gap:6px"><button class="outline-button" data-action="zoom-selection" style="font-size:9px;flex:1">${icon('fit')} Zoom to</button><button class="outline-button" data-action="delete" title="Delete selected object">${icon('trash')}</button></div>`;
  }else html+=`<div class="properties-empty"><strong>${objects.length} entities selected</strong><p>Change shared properties above, or use Move, Copy, Rotate, Scale, and Mirror.</p><button class="outline-button" data-action="delete" style="margin-top:16px">${icon('trash')} Delete selection</button></div>`;
  $('#propertiesContent').innerHTML=html;
  $('#propLayer')?.addEventListener('change',ev=>{if(!objects.length){setActiveLayer(ev.target.value);return;}model.commit('Change entity layer',{update:objects.map(e=>({...e,layer:ev.target.value}))});});
  $('#propColor')?.addEventListener('change',ev=>{if(!objects.length){changeLayer(layer.name,{color:ev.target.value});return;}model.commit('Change color',{update:objects.map(e=>({...e,color:ev.target.value}))});});
  $('#propLinetype')?.addEventListener('change',ev=>{if(!objects.length){changeLayer(layer.name,{linetype:ev.target.value==='BYLAYER'?'CONTINUOUS':ev.target.value});return;}model.commit('Change linetype',{update:objects.map(e=>({...e,linetype:ev.target.value}))});});
  $$('[data-prop]').forEach(el=>el.addEventListener('change',()=>{const updated=clone(e),path=el.dataset.prop;let value=el.type==='number'?Number(el.value):el.value;
    if(el.type==='number'&&(!Number.isFinite(value)||Math.abs(value)>1e14)){toast('Enter a finite value between −10¹⁴ and 10¹⁴.','error');renderProperties();return;}
    if(['radius','height','ratio'].includes(path)&&value<=0){toast('This value must be positive.','error');renderProperties();return;}
    if(path==='ratio'&&value>1){toast('Ellipse minor/major ratio must be between 0 and 1.','error');renderProperties();return;}
    if(path.startsWith('$'))updated[path.slice(1)]=value*Math.PI/180;else{const parts=path.split('.');if(parts.length===2)updated[parts[0]][parts[1]]=value;else updated[path]=value;}model.commit('Edit '+path,{update:[updated]});
  }));
}
function entityDisplayName(type){return {LWPOLYLINE:'Polyline',MTEXT:'Multiline text',DIMENSION:'Dimension'}[type]??type[0]+type.slice(1).toLowerCase();}
function unitName(units){return {0:'Unitless',1:'Inches',2:'Feet',4:'Millimetres',5:'Centimetres',6:'Metres'}[units]??`DXF unit ${units}`;}
function changeLayer(name,changes){model.commit('Edit layer '+name,{layers:model.layers.map(l=>l.name===name?{...l,...changes}:l)});for(const key of state.selection){const e=model.entities.get(key);if(!e||!model.editable(e))state.selection.delete(key);}renderProperties();}

function toast(message,type=''){const element=document.createElement('div');element.className='toast '+type;element.textContent=message;$('#toastStack').append(element);setTimeout(()=>element.remove(),5000);}
function log(message,isCommand=false){state.history.push({message,isCommand});if(state.history.length>150)state.history.shift();const history=$('#commandHistory');history.innerHTML=state.history.map(m=>`<div class="${m.isCommand?'history-command':''}">${escapeHTML(m.message)}</div>`).join('');history.scrollTop=history.scrollHeight;}
function updatePrompt(){
  const t=state.tool,n=state.points.length;let prompt='Select an object or enter a command';
  if(t==='line')prompt=n?'Specify next point · Enter to finish · U to undo segment':'Specify first point';
  if(t==='polyline')prompt=n?'Specify next vertex · C to close · Enter to finish':'Specify start point';
  if(t==='rectangle')prompt=n?'Specify opposite corner':'Specify first corner';
  if(t==='circle')prompt=n?'Specify radius or point on circle':'Specify center point';
  if(t==='arc')prompt=['Specify start point','Specify point on arc','Specify end point'][n]??'';
  if(t==='ellipse')prompt=['Specify ellipse center','Specify major-axis endpoint','Specify minor-axis radius'][n]??'';
  if(t==='polygon')prompt=n?'Specify circumscribed radius or point':`Specify center · Type a side count <${state.polygonSides}>`;
  if(t==='text')prompt='Specify text insertion point';
  if(t==='dimension')prompt=['Specify first extension-line origin','Specify second extension-line origin','Specify dimension-line location'][n]??'';
  if(t==='measure')prompt=n?'Specify second point':'Specify first measurement point';
  if(t==='hatch')prompt='Select a closed polyline or circle boundary';
  if(MODIFY_TOOLS.has(t)){if(!selected().length)prompt='Select objects, then press Enter';else if(t==='move'||t==='copy')prompt=n?'Specify destination point or @dx,dy':'Specify base point';else if(t==='mirror')prompt=n?'Specify second point of mirror axis':'Specify first point of mirror axis';else if(t==='rotate')prompt=n===0?'Specify rotation center':n===1?'Enter angle in degrees, or specify reference point':'Specify new angle point';else if(t==='scale')prompt=n===0?'Specify scale base point':n===1?'Enter positive scale factor, or specify reference point':'Specify target length point';else if(t==='offset')prompt=`Specify side for offset · Distance <${fmt(state.offsetDistance)}>`;}
  if(t==='trim')prompt='Click LINE segment to remove · Other lines are cutting edges';
  if(t==='extend')prompt='Click the end of a LINE to extend to the nearest line boundary';
  if(t==='pan')prompt='Drag to pan · Scroll to zoom · Esc to return to selection';
  if(t==='symbol')prompt='Specify insertion point for '+(state.symbolName??'geometry');
  $('#promptTool').textContent=t==='select'?'COMMAND':t.toUpperCase();$('#promptText').textContent=prompt;
  $('#commandSuggestion').textContent=t==='select'?'LINE, CIRCLE, MOVE…':'Absolute x,y · Relative @x,y';
  $$('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
  canvas.classList.toggle('pan-cursor',t==='pan'||state.space);
}
function startTool(tool){
  if(!TOOL_DEFS[tool]&&tool!=='symbol')return;
  state.points=[];state.preview=null;state.grip=null;state.drag=null;state.tool=tool;state.snap=null;state.hover=null;
  if(tool!=='select'&&tool!=='pan')state.lastTool=tool;
  if(CREATION_TOOLS.has(tool)&&tool!=='hatch')updateSelection([]);
  if(tool==='hatch'&&selected().length){makeHatch(selected());state.tool='select';}
  log((TOOL_DEFS[tool]?.[0]??tool).toUpperCase(),true);updatePrompt();renderer.invalidate();canvas.focus({preventScroll:true});
}
function cancel(){state.points=[];state.preview=null;state.grip=null;state.drag=null;state.snap=null;state.tool='select';state.symbol=null;state.selection.clear();commandInput.value='';$('#dynamicInput').hidden=true;updatePrompt();renderProperties();renderer.invalidate();}
function baseEntity(entity){return {id:id(),layer:model.activeLayer,color:'BYLAYER',linetype:'BYLAYER',...entity};}
function addEntities(entities,label){const layer=model.layer(model.activeLayer);if(!layer?.visible||layer.locked){toast('The current layer is hidden or locked. Choose an editable layer.','error');return false;}return model.commit(label,{add:entities.map(e=>baseEntity(e))});}
function finishCommand(keepSelection=true){state.points=[];state.preview=null;state.symbol=null;state.tool='select';if(!keepSelection)state.selection.clear();updatePrompt();renderProperties();renderer.invalidate();}
function entityAt(p){const radius=8/renderer.camera.scale,bounds={minX:p.x-radius,minY:p.y-radius,maxX:p.x+radius,maxY:p.y+radius};let winner=null,best=radius;
  for(const r of renderer.index.query(bounds)){if(!model.editable(r.entity))continue;let d=Infinity;for(const path of r.paths)for(let i=1;i<path.length;i++)d=Math.min(d,distance(p,closestOnSegment(p,path[i-1],path[i])));if(r.texts.length&&contains(r.bounds,{minX:p.x,minY:p.y,maxX:p.x,maxY:p.y}))d=Math.min(d,radius*.6);if(d<=best){best=d;winner=r.entity;}}
  return winner;
}
function constrainedPoint(raw){
  let p={...raw};state.snap=null;
  const t=state.tool,needSnap=t!=='select'&&t!=='pan'||state.grip;
  if(state.osnap&&needSnap){const r=11/renderer.camera.scale,b={minX:p.x-r,minY:p.y-r,maxX:p.x+r,maxY:p.y+r},candidates=renderer.index.query(b),exclude=MODIFY_TOOLS.has(t)||state.grip?state.selection:new Set();let best=r;
    for(const record of candidates){if(exclude.has(record.entity.id))continue;for(const q of snapPoints(record.entity)){const d=distance(p,q);if(d<best){best=d;state.snap=q;}}}
    const lines=candidates.filter(r=>r.entity.type==='LINE'&&!exclude.has(r.entity.id)).slice(0,24);
    for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){const q=lineIntersection(lines[i].entity.a,lines[i].entity.b,lines[j].entity.a,lines[j].entity.b);if(q){const d=distance(p,q);if(d<best){best=d;state.snap={x:q.x,y:q.y,kind:'intersection'};}}}
    if(state.snap)p=point(state.snap.x,state.snap.y);
  }
  const anchor=state.grip?.origin??state.points.at(-1);
  if(anchor&&(state.ortho||state.shift)&&!['circle','arc','ellipse','polygon','rotate','scale','dimension'].includes(t)){const d=sub(p,anchor);p=Math.abs(d.x)>=Math.abs(d.y)?point(p.x,anchor.y):point(anchor.x,p.y);if(state.snap&&distance(p,state.snap)>EPS)state.snap=null;}
  if(state.gridSnap&&!state.snap){const step=renderer.gridStep()/5;p=point(Math.round(p.x/step)*step,Math.round(p.y/step)*step);}
  return p;
}
function polygonAt(center,radius,n=state.polygonSides,rot=0){return {type:'LWPOLYLINE',closed:true,points:Array.from({length:n},(_,i)=>point(center.x+radius*Math.cos(rot+i/n*TAU),center.y+radius*Math.sin(rot+i/n*TAU)))};}
function rectangleAt(a,b){return {type:'LWPOLYLINE',closed:true,points:[a,point(b.x,a.y),b,point(a.x,b.y)]};}
function dimensionAt(a,b,p){let orientation=state.dimMode==='aligned'?'aligned':'horizontal',offset=p.y;if(state.dimMode==='aligned'){const v=sub(b,a);offset=cross(v,sub(p,a))/(length(v)||1);}else{const mid=midpoint(a,b),dx=Math.abs(p.x-mid.x)-Math.abs(b.x-a.x)/2,dy=Math.abs(p.y-mid.y)-Math.abs(b.y-a.y)/2;if(dx>dy){orientation='vertical';offset=p.x;}}return {type:'DIMENSION',a,b,orientation,offset,height:Math.max(9/renderer.camera.scale,.001)};}
function makeHatch(objects){const hatches=[];for(const e of objects){if(e.type==='CIRCLE'||((e.type==='LWPOLYLINE'||e.type==='POLYLINE')&&e.closed)){hatches.push({type:'HATCH',boundaries:[geometry(e,.2/renderer.camera.scale).paths[0]],pattern:'ANSI31'});}}if(!hatches.length){toast('Select a closed polyline or a circle for the hatch boundary.','error');return;}addEntities(hatches,'Hatch boundaries');toast(`${hatches.length} hatch ${hatches.length===1?'created':'entities created'}.`,'success');}
function handleWorldClick(p,raw=p,event={}){
  state.lastPoint=p;
  const t=state.tool,n=state.points.length;
  if(t==='select'||MODIFY_TOOLS.has(t)&&!selected().length){const hit=entityAt(raw);if(!event.shiftKey&&!state.shift)state.selection.clear();if(hit){if(state.selection.has(hit.id)&&event.shiftKey)state.selection.delete(hit.id);else state.selection.add(hit.id);}renderProperties();updatePrompt();renderer.invalidate();return;}
  if(t==='line'){if(!n)state.points.push(p);else if(distance(state.points[0],p)>EPS){addEntities([{type:'LINE',a:state.points[0],b:p}],'Draw line');state.points=[p];}}
  else if(t==='polyline'){if(!n||distance(state.points.at(-1),p)>EPS)state.points.push(p);}
  else if(t==='rectangle'){if(!n)state.points.push(p);else{if(distance(state.points[0],p)>EPS)addEntities([rectangleAt(state.points[0],p)],'Draw rectangle');finishCommand(false);}}
  else if(t==='circle'){if(!n)state.points.push(p);else{const radius=distance(state.points[0],p);if(radius>EPS)addEntities([{type:'CIRCLE',center:state.points[0],radius}],'Draw circle');finishCommand(false);}}
  else if(t==='arc'){state.points.push(p);if(state.points.length===3){const arc=arcThrough(...state.points);if(arc)addEntities([arc],'Draw 3-point arc');else toast('The three arc points must not be collinear.','error');finishCommand(false);}}
  else if(t==='ellipse'){if(n<2)state.points.push(p);else{const major=sub(state.points[1],state.points[0]),r=length(major),minor=Math.abs(cross(major,sub(p,state.points[0])))/(r||1);if(minor>EPS&&r>EPS){let vector=major,ratio=minor/r;if(ratio>1){vector=mul(point(-major.y,major.x),ratio);ratio=1/ratio;}addEntities([{type:'ELLIPSE',center:state.points[0],major:vector,ratio,start:0,end:TAU}],'Draw ellipse');}finishCommand(false);}}
  else if(t==='polygon'){if(!n)state.points.push(p);else{const r=distance(state.points[0],p);if(r>EPS)addEntities([polygonAt(state.points[0],r,state.polygonSides,angle(state.points[0],p))],'Draw polygon');finishCommand(false);}}
  else if(t==='text'){showTextDialog(p);}
  else if(t==='dimension'){if(n<2)state.points.push(p);else{if(distance(state.points[0],state.points[1])>EPS)addEntities([dimensionAt(state.points[0],state.points[1],p)],'Add dimension');finishCommand(false);}}
  else if(t==='measure'){if(!n)state.points.push(p);else{const d=distance(state.points[0],p),delta=sub(p,state.points[0]),message=`Distance ${fmt(d,4)} · ΔX ${fmt(delta.x,4)} · ΔY ${fmt(delta.y,4)} · Angle ${fmt(angle(state.points[0],p)*180/Math.PI,2)}°`;log(message);toast(message,'success');finishCommand();}}
  else if(t==='hatch'){const e=entityAt(raw);if(e){makeHatch([e]);finishCommand();}else toast('Click the outline of a closed polyline or circle.');}
  else if(t==='move'||t==='copy'){if(!n)state.points.push(p);else{applyTransform(translation(p.x-state.points[0].x,p.y-state.points[0].y),t==='copy');finishCommand();}}
  else if(t==='mirror'){if(!n)state.points.push(p);else if(distance(state.points[0],p)>EPS){applyTransform(reflection(state.points[0],p));finishCommand();}}
  else if(t==='rotate'||t==='scale'){if(n<2)state.points.push(p);else{const base=state.points[0],reference=state.points[1];if(t==='rotate')applyTransform(rotation(angle(base,p)-angle(base,reference),base));else if(distance(base,reference)>EPS)applyTransform(scaling(distance(base,p)/distance(base,reference),base));finishCommand();}}
  else if(t==='offset'){doOffset(p);finishCommand();}
  else if(t==='trim'||t==='extend'){const e=entityAt(raw);if(e?.type==='LINE')trimExtend(e,p,t==='extend');else toast('This tool operates on LINE entities. Explode a polyline first.','error');}
  else if(t==='symbol'&&state.symbol){const inserted=state.symbol.map(e=>({...transformEntity(e,translation(p.x,p.y)),id:id()}));if(addEntities(inserted,'Insert '+(state.symbolName??'geometry')))updateSelection(inserted.map(e=>e.id));finishCommand();}
  updatePrompt();renderer.invalidate();
}
function applyTransform(matrix,copy=false){const entities=selected().map(e=>{const transformed=transformEntity(e,matrix);if(copy)transformed.id=id();return transformed;});if(!entities.length)return;model.commit((copy?'Copy':state.tool[0].toUpperCase()+state.tool.slice(1))+' entities',copy?{add:entities}:{update:entities});updateSelection(entities.map(e=>e.id));}
function doOffset(p){
  const result=[],d=state.offsetDistance;if(!(d>0))return;
  for(const e of selected()){
    if(e.type==='LINE'){const v=sub(e.b,e.a),len=length(v);if(len<EPS)continue;const n=mul(point(-v.y,v.x),d/len*(cross(v,sub(p,e.a))>=0?1:-1));result.push({...e,id:id(),a:add(e.a,n),b:add(e.b,n)});}
    else if(e.type==='CIRCLE'){const radius=e.radius+(distance(e.center,p)>e.radius?d:-d);if(radius>EPS)result.push({...e,id:id(),radius});else toast('Offset would produce a nonpositive circle radius.','error');}
    else if(e.type==='LWPOLYLINE'&&!e.points.some(p=>p.bulge)&&e.closed){
      const pts=e.points;let sign=0,convex=true;for(let i=0;i<pts.length;i++){const z=cross(sub(pts[(i+1)%pts.length],pts[i]),sub(pts[(i+2)%pts.length],pts[(i+1)%pts.length]));if(Math.abs(z)>EPS){if(sign&&Math.sign(z)!==sign)convex=false;sign=Math.sign(z);}}
      if(!convex){toast('Polyline offset currently supports convex, straight-edged closed boundaries.','error');continue;}
      let inside=true;for(let i=0;i<pts.length;i++)if(cross(sub(pts[(i+1)%pts.length],pts[i]),sub(p,pts[i]))*sign<0)inside=false;
      const shifted=pts.map((a,i)=>{const b=pts[(i+1)%pts.length],v=sub(b,a),normal=mul(point(-v.y,v.x),d/(length(v)||1)*sign*(inside?1:-1));return [add(a,normal),add(b,normal)];});
      const points=shifted.map((edge,i)=>lineIntersection(...shifted[(i+pts.length-1)%pts.length],...edge,false)).filter(Boolean).map(v=>point(v.x,v.y));
      if(points.length===pts.length){let valid=true;if(inside){for(let i=0;i<points.length;i++)if(dot(sub(points[(i+1)%points.length],points[i]),sub(pts[(i+1)%pts.length],pts[i]))<=EPS)valid=false;}if(valid)result.push({...e,id:id(),points});else toast('Offset distance collapses the boundary.','error');}
    }else toast(`Offset is not available for ${entityDisplayName(e.type)}. Supported: lines, circles, convex closed straight polylines.`,'error');
  }
  if(result.length){model.commit('Offset entities',{add:result});updateSelection(result.map(e=>e.id));}
}
function trimExtend(e,p,extend){
  const intersections=[];for(const other of model.entities.values()){if(other.id===e.id||other.type!=='LINE'||model.layer(other.layer)?.visible===false)continue;const q=lineIntersection(e.a,e.b,other.a,other.b,false);if(q&&q.u>=-EPS&&q.u<=1+EPS)intersections.push(q);}
  const v=sub(e.b,e.a),len=dot(v,v);if(len<EPS)return;
  const pick=dot(sub(p,e.a),v)/len;
  if(extend){const beginning=pick<.5,options=intersections.filter(q=>beginning?q.t < -EPS:q.t>1+EPS).sort((a,b)=>beginning?b.t-a.t:a.t-b.t);if(!options.length){toast('No intersecting boundary found beyond this endpoint.','error');return;}const q=point(options[0].x,options[0].y);model.commit('Extend line',{update:[{...e,a:beginning?q:e.a,b:beginning?e.b:q}]});}
  else{const cuts=[0,...intersections.map(q=>q.t).filter(t=>t>EPS&&t<1-EPS).sort((a,b)=>a-b),1];if(cuts.length===2){toast('No cutting edge intersects this line.','error');return;}let lo=0,hi=1;for(let i=1;i<cuts.length;i++)if(pick>=cuts[i-1]-EPS&&pick<=cuts[i]+EPS){lo=cuts[i-1];hi=cuts[i];break;}const addList=[];if(lo>EPS)addList.push({...e,id:id(),a:e.a,b:add(e.a,mul(v,lo))});if(hi<1-EPS)addList.push({...e,id:id(),a:add(e.a,mul(v,hi)),b:e.b});model.commit('Trim line',{remove:[e.id],add:addList});state.selection.delete(e.id);}
}
function explodeSelection(){const addList=[],remove=[];for(const e of selected()){
  if(e.type==='LWPOLYLINE'||e.type==='POLYLINE'){for(let i=0;i<e.points.length-(e.closed?0:1);i++){const a=e.points[i],b=e.points[(i+1)%e.points.length],arc=bulgeArc(a,b,a.bulge??0);if(arc){const start=arc.sweep<0?arc.start+arc.sweep:arc.start,end=arc.sweep<0?arc.start:arc.start+arc.sweep;addList.push({...e,id:id(),type:'ARC',center:arc.center,radius:arc.radius,start,end});}else addList.push({...e,id:id(),type:'LINE',a:point(a.x,a.y),b:point(b.x,b.y)});}remove.push(e.id);}
  else if(['DIMENSION','HATCH','ELLIPSE','SPLINE'].includes(e.type)){const g=geometry(e,.1/renderer.camera.scale);for(const path of g.paths){if(e.type==='DIMENSION'){for(let i=1;i<path.length;i++)addList.push({...e,id:id(),type:'LINE',a:path[i-1],b:path[i]});}else addList.push({...e,id:id(),type:'LWPOLYLINE',points:path,closed:false});}for(const t of g.texts)addList.push({...e,...t,id:id(),type:'TEXT'});remove.push(e.id);}
  }
  if(!remove.length){toast('Select polylines, dimensions, hatches, ellipses, or splines to explode.');return;}
  model.commit('Explode entities',{add:addList,remove});updateSelection(addList.map(e=>e.id));log('Exploded '+remove.length+' entities. Ellipse and spline explosions use tessellated polylines.');
}

function gripsFor(e){
  if(e.type==='LINE')return [{point:e.a,path:'a'},{point:e.b,path:'b'}];
  if(e.type==='LWPOLYLINE'||e.type==='POLYLINE')return e.points.map((p,i)=>({point:p,path:'points',index:i}));
  if(e.type==='CIRCLE')return [{point:e.center,path:'center'},...Array.from({length:4},(_,i)=>({point:add(e.center,point(Math.cos(i*Math.PI/2)*e.radius,Math.sin(i*Math.PI/2)*e.radius)),path:'radius'}))];
  if(e.type==='ARC')return [{point:e.center,path:'center'},{point:add(e.center,point(Math.cos(e.start)*e.radius,Math.sin(e.start)*e.radius)),path:'start'},{point:add(e.center,point(Math.cos(e.end)*e.radius,Math.sin(e.end)*e.radius)),path:'end'}];
  if(e.position)return [{point:e.position,path:'position'}];
  if(e.type==='DIMENSION')return [{point:e.a,path:'a'},{point:e.b,path:'b'}];
  if(e.center)return [{point:e.center,path:'center'}];return [];
}
function gripAt(p){if(state.tool!=='select'||state.selection.size>100)return null;for(const e of selected())for(const g of gripsFor(e))if(distance(p,g.point)<7/renderer.camera.scale)return {...g,entity:clone(e),origin:g.point};return null;}
function editedGrip(grip,p){const e=clone(grip.entity);if(grip.path==='points')e.points[grip.index]={...e.points[grip.index],...p};else if(grip.path==='radius')e.radius=Math.max(EPS,distance(e.center,p));else if(grip.path==='start'||grip.path==='end')e[grip.path]=angle(e.center,p);else e[grip.path]=p;return e;}
function previewEntities(){
  if(state.grip&&state.world)return [editedGrip(state.grip,state.world)];
  const t=state.tool,pts=state.points,p=state.world;if(!p)return [];
  if(t==='symbol'&&state.symbol)return state.symbol.map(e=>transformEntity(e,translation(p.x,p.y)));
  if(!pts.length)return [];
  const a=pts[0],n=pts.length;
  if(t==='line')return [{type:'LINE',a,b:p}];
  if(t==='polyline')return [{type:'LWPOLYLINE',points:[...pts,p],closed:false}];
  if(t==='rectangle')return [rectangleAt(a,p)];
  if(t==='circle')return [{type:'CIRCLE',center:a,radius:distance(a,p)}];
  if(t==='polygon')return [polygonAt(a,distance(a,p),state.polygonSides,angle(a,p))];
  if(t==='arc'){if(n===1)return [{type:'LINE',a,b:p}];const arc=arcThrough(a,pts[1],p);return arc?[arc]:[{type:'LWPOLYLINE',points:[...pts,p]}];}
  if(t==='ellipse'){if(n===1)return [{type:'LINE',a,b:p}];const major=sub(pts[1],a),r=length(major);return r>EPS?[{type:'ELLIPSE',center:a,major,ratio:Math.abs(cross(major,sub(p,a)))/(r*r),start:0,end:TAU}]:[];}
  if(t==='measure')return [{type:'LINE',a,b:p}];
  if(t==='dimension')return n===1?[{type:'LINE',a,b:p}]:[dimensionAt(a,pts[1],p)];
  let matrix=null;
  if(t==='move'||t==='copy')matrix=translation(p.x-a.x,p.y-a.y);
  if(t==='mirror'&&distance(a,p)>EPS)matrix=reflection(a,p);
  if(t==='rotate'&&n>=2)matrix=rotation(angle(a,p)-angle(a,pts[1]),a);
  if(t==='scale'&&n>=2&&distance(a,pts[1])>EPS)matrix=scaling(Math.max(EPS,distance(a,p)/distance(a,pts[1])),a);
  if(matrix)return selected().map(e=>transformEntity(e,matrix));
  if(['scale','rotate','mirror'].includes(t))return [{type:'LINE',a,b:p}];return [];
}
function strokeGeometry(ctx,g,color,width=1.5,dashed=false){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dashed?[5,4]:[]);ctx.beginPath();for(const path of g.paths)path.forEach((p,i)=>{const q=renderer.worldToScreen(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.stroke();for(const t of g.texts){const p=renderer.worldToScreen(t.position);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-(t.rotation??0));ctx.fillStyle=color;ctx.font=`${Math.max(1,t.height*renderer.camera.scale)}px Arial`;ctx.textAlign=t.align??'left';String(t.text).split('\n').forEach((s,i)=>ctx.fillText(s,0,i*t.height*renderer.camera.scale*1.3));ctx.restore();}ctx.restore();}
function drawOverlay(ctx){
  const visible=renderer.visibleBounds();
  for(const r of renderer.index.query(visible)){
    if(state.selection.has(r.entity.id)){strokeGeometry(ctx,r,'#78b9ef',1.8);if(state.selection.size<=100&&!state.grip){for(const g of gripsFor(r.entity)){const p=renderer.worldToScreen(g.point);ctx.fillStyle='#72b8ec';ctx.strokeStyle='#142c41';ctx.lineWidth=1;ctx.fillRect(p.x-3,p.y-3,6,6);ctx.strokeRect(p.x-3,p.y-3,6,6);}}}
    else if(state.hover===r.entity.id)strokeGeometry(ctx,r,'#d5dde3',1.8);
  }
  for(const e of previewEntities())strokeGeometry(ctx,geometry(e,.3/renderer.camera.scale),'#f4b48e',1.3,true);
  if(state.drag?.box){const a=state.drag.start,b=state.drag.last,left=Math.min(a.x,b.x),top=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y),crossing=b.x<a.x;ctx.save();ctx.fillStyle=crossing?'#4fbfa922':'#6aaaf422';ctx.strokeStyle=crossing?'#7bd9b5':'#8fbaf0';ctx.setLineDash(crossing?[5,4]:[]);ctx.fillRect(left,top,w,h);ctx.strokeRect(left,top,w,h);ctx.restore();}
  if(state.mouse&&!state.drag?.pan&&state.tool!=='pan'&&!state.space){const p=state.mouse;ctx.save();ctx.strokeStyle=renderer.dark?'#bac6d1':'#374e5f';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(p.x-18,p.y);ctx.lineTo(p.x-5,p.y);ctx.moveTo(p.x+5,p.y);ctx.lineTo(p.x+18,p.y);ctx.moveTo(p.x,p.y-18);ctx.lineTo(p.x,p.y-5);ctx.moveTo(p.x,p.y+5);ctx.lineTo(p.x,p.y+18);ctx.rect(p.x-3,p.y-3,6,6);ctx.stroke();ctx.restore();}
  if(state.snap){const p=renderer.worldToScreen(state.snap);ctx.save();ctx.strokeStyle='#89d89f';ctx.lineWidth=1.3;ctx.beginPath();if(state.snap.kind==='midpoint'){ctx.moveTo(p.x,p.y-6);ctx.lineTo(p.x+6,p.y+5);ctx.lineTo(p.x-6,p.y+5);ctx.closePath();}else if(state.snap.kind==='center'){ctx.arc(p.x,p.y,6,0,TAU);}else if(state.snap.kind==='intersection'){ctx.moveTo(p.x-5,p.y-5);ctx.lineTo(p.x+5,p.y+5);ctx.moveTo(p.x+5,p.y-5);ctx.lineTo(p.x-5,p.y+5);}else ctx.rect(p.x-5,p.y-5,10,10);ctx.stroke();ctx.fillStyle='#96cda2';ctx.font='9px Arial';ctx.fillText(state.snap.kind,p.x+10,p.y-10);ctx.restore();}
}
const eventPoint=e=>{const r=canvas.getBoundingClientRect();return point(e.clientX-r.left,e.clientY-r.top);};
function updateMouse(screen){state.mouse=screen;const raw=renderer.screenToWorld(screen);state.world=constrainedPoint(raw);$('#coordinates').textContent=`${fmt(state.world.x,3)}, ${fmt(state.world.y,3)}, 0.000`;if(state.tool==='select'&&!state.drag)state.hover=entityAt(raw)?.id??null;
  const di=$('#dynamicInput');if(state.dynamic&&state.tool!=='select'&&state.tool!=='pan'&&!state.drag?.pan){const anchor=state.points.at(-1);di.textContent=anchor?`${fmt(distance(anchor,state.world),2)}  ∠ ${fmt(angle(anchor,state.world)*180/Math.PI,1)}°`:`${fmt(state.world.x,2)}, ${fmt(state.world.y,2)}`;di.style.left=Math.max(5,Math.min(renderer.width-150,screen.x+20))+'px';di.style.top=Math.max(8,Math.min(renderer.height-110,screen.y+20))+'px';di.hidden=false;}else di.hidden=true;renderer.invalidate();}
canvas.addEventListener('pointerdown',e=>{
  if(e.button>2)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);const screen=eventPoint(e);state.touches.set(e.pointerId,screen);
  if(e.pointerType==='touch'&&state.touches.size===2){const [a,b]=[...state.touches.values()];state.pinch={center:midpoint(a,b),distance:distance(a,b)};state.drag=null;state.grip=null;return;}
  updateMouse(screen);const pan=e.button===1||e.button===2||state.space||state.tool==='pan';
  state.drag={start:screen,last:screen,world:renderer.screenToWorld(screen),pan,box:false,moved:false,shift:e.shiftKey,pointerId:e.pointerId};
  if(!pan&&e.button===0)state.grip=gripAt(renderer.screenToWorld(screen));
  if(pan)canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove',e=>{
  const screen=eventPoint(e);if(state.touches.has(e.pointerId))state.touches.set(e.pointerId,screen);
  if(state.pinch&&state.touches.size===2){const [a,b]=[...state.touches.values()],center=midpoint(a,b),dist=distance(a,b),prev=state.pinch;renderer.camera.x-=(center.x-prev.center.x)/renderer.camera.scale;renderer.camera.y+=(center.y-prev.center.y)/renderer.camera.scale;renderer.zoomAt(center,dist/(prev.distance||1));state.pinch={center,distance:dist};return;}
  const drag=state.drag;if(drag&&drag.pointerId===e.pointerId){const delta=sub(screen,drag.last);if(distance(screen,drag.start)>4)drag.moved=true;if(drag.pan){renderer.camera.x-=delta.x/renderer.camera.scale;renderer.camera.y+=delta.y/renderer.camera.scale;renderer.invalidate();}else if(!state.grip&&(state.tool==='select'||MODIFY_TOOLS.has(state.tool)&&!selected().length)&&drag.moved)drag.box=true;drag.last=screen;}
  updateMouse(screen);
});
function rectangleCrossing(record,bounds){for(const path of record.paths){for(const p of path)if(p.x>=bounds.minX&&p.x<=bounds.maxX&&p.y>=bounds.minY&&p.y<=bounds.maxY)return true;const corners=[point(bounds.minX,bounds.minY),point(bounds.maxX,bounds.minY),point(bounds.maxX,bounds.maxY),point(bounds.minX,bounds.maxY)];for(let i=1;i<path.length;i++)for(let j=0;j<4;j++)if(lineIntersection(path[i-1],path[i],corners[j],corners[(j+1)%4]))return true;}return record.texts.length>0&&overlaps(record.bounds,bounds);}
canvas.addEventListener('pointerup',e=>{
  state.touches.delete(e.pointerId);if(state.pinch){if(state.touches.size<2)state.pinch=null;state.drag=null;state.mouse=null;renderer.invalidate();return;}
  const drag=state.drag;state.drag=null;canvas.classList.remove('dragging');if(!drag)return;
  const screen=eventPoint(e);updateMouse(screen);const raw=renderer.screenToWorld(screen),p=state.world;
  if(drag.pan){if(e.button===2&&!drag.moved&&state.tool!=='select')finishCommand();return;}
  if(state.grip&&drag.moved){const updated=editedGrip(state.grip,p);model.commit('Edit grip',{update:[updated]});state.grip=null;renderer.invalidate();return;}
  state.grip=null;
  if(drag.box){const a=renderer.screenToWorld(drag.start),b=raw,rect={minX:Math.min(a.x,b.x),minY:Math.min(a.y,b.y),maxX:Math.max(a.x,b.x),maxY:Math.max(a.y,b.y)},crossing=screen.x<drag.start.x;if(!drag.shift)state.selection.clear();for(const r of renderer.index.query(rect))if(model.editable(r.entity)&&(crossing?rectangleCrossing(r,rect):contains(rect,r.bounds)))state.selection.add(r.entity.id);renderProperties();updatePrompt();renderer.invalidate();return;}
  if(!drag.moved)handleWorldClick(p,raw,e);
});
canvas.addEventListener('pointercancel',e=>{state.touches.delete(e.pointerId);state.drag=null;state.grip=null;state.pinch=null;renderer.invalidate();});
canvas.addEventListener('pointerleave',()=>{if(!state.drag){state.mouse=null;state.world=null;state.hover=null;state.snap=null;$('#dynamicInput').hidden=true;renderer.invalidate();}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();renderer.zoomAt(eventPoint(e),Math.exp(-Math.max(-500,Math.min(500,e.deltaY))*.0015));updateMouse(eventPoint(e));},{passive:false});
canvas.addEventListener('dblclick',e=>{if(state.tool==='polyline'){completePolyline(false);return;}if(state.tool==='line'){finishCommand();return;}if(state.tool==='select'){const hit=entityAt(renderer.screenToWorld(eventPoint(e)));if(hit&&['TEXT','MTEXT'].includes(hit.type))showTextDialog(hit.position,hit);else if(!hit)renderer.fit();}});
function completePolyline(closed){if(state.points.length>1)addEntities([{type:'LWPOLYLINE',points:clone(state.points),closed:closed&&state.points.length>2}],'Draw polyline');finishCommand(false);}
function parsePointInput(text){
  const coord=text.match(/^(@)?\s*([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)\s*,\s*([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)\s*$/i);
  if(coord){const p=point(Number(coord[2]),Number(coord[3]));if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.max(Math.abs(p.x),Math.abs(p.y))>1e14)return null;return coord[1]?add(state.points.at(-1)??state.lastPoint??point(),p):p;}
  const polar=text.match(/^(@)?\s*([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)\s*<\s*([+-]?(?:\d*\.)?\d+)\s*$/i);
  if(polar){const r=Number(polar[2]),a=Number(polar[3])*Math.PI/180;if(!Number.isFinite(r)||!Number.isFinite(a)||Math.abs(r)>1e14)return null;const p=point(r*Math.cos(a),r*Math.sin(a));return add(state.points.at(-1)??(polar[1]?state.lastPoint:point()),p);}return null;
}
function runCommand(raw){
  raw=String(raw??'').trim();if(raw){log('› '+raw,true);state.commands.push(raw);if(state.commands.length>100)state.commands.shift();state.commandIndex=state.commands.length;}
  const upper=raw.toUpperCase();
  if(!raw){if(state.tool==='polyline')completePolyline(false);else if(state.tool==='line'||state.tool==='measure')finishCommand();else if(MODIFY_TOOLS.has(state.tool)){if(!selected().length)toast('Select at least one editable object first.');else{state.points=[];updatePrompt();}}else if(state.tool==='select')startTool(state.lastTool);else finishCommand();return;}
  if(state.tool==='polyline'&&(upper==='C'||upper==='CLOSE')){completePolyline(true);return;}
  if((state.tool==='polyline'||state.tool==='line')&&(upper==='U'||upper==='UNDO')){if(state.tool==='polyline')state.points.pop();else if(model.history.at(-1)?.label==='Draw line'){const last=model.history.at(-1)?.added[0];model.undo();state.points=last?[last.a]:[];}updatePrompt();renderer.invalidate();return;}
  const p=parsePointInput(raw);if(p&&state.tool!=='select'&&state.tool!=='pan'){handleWorldClick(p,p,{});return;}
  const value=Number(raw),numeric=/^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?$/i.test(raw)&&Number.isFinite(value)&&Math.abs(value)<=1e14;
  if(numeric&&state.zoomPending&&value>0){state.zoomPending=false;renderer.zoomAt(point(renderer.width/2,renderer.height/2),value);updatePrompt();return;}
  if(numeric){
    const t=state.tool,n=state.points.length;
    if(t==='offset'&&value>0){state.offsetDistance=value;updatePrompt();return;}
    if(t==='polygon'&&!n&&Number.isInteger(value)&&value>=3&&value<=360){state.polygonSides=value;updatePrompt();return;}
    if((t==='circle'||t==='polygon')&&n&&value>0){handleWorldClick(add(state.points[0],point(value,0)));return;}
    if(t==='rotate'&&n){applyTransform(rotation(value*Math.PI/180,state.points[0]));finishCommand();return;}
    if(t==='scale'&&n&&value>0){applyTransform(scaling(value,state.points[0]));finishCommand();return;}
    if(t==='ellipse'&&n===2&&value>0){const v=sub(state.points[1],state.points[0]),l=length(v);if(l>EPS)handleWorldClick(add(state.points[0],mul(point(-v.y,v.x),value/l)));return;}
    if(['line','polyline','move','copy'].includes(t)&&n&&value>0){const anchor=state.points.at(-1),a=state.world?angle(anchor,state.world):0;handleWorldClick(add(anchor,point(value*Math.cos(a),value*Math.sin(a))));return;}
    toast('A number is not valid at this command step. Check the command prompt.','error');return;
  }
  if(upper==='Z'||upper==='ZOOM'){state.zoomPending=true;$('#promptText').textContent='Enter E for extents, S for selection, or a zoom factor';return;}
  if(state.zoomPending){state.zoomPending=false;if(upper==='E'||upper==='EXTENTS'){renderer.fit();updatePrompt();return;}if(upper==='S'){zoomSelection();updatePrompt();return;}}
  if(upper==='Z E'||upper==='ZOOM E'||upper==='ZE'||upper==='ZOOM EXTENTS'){renderer.fit();return;}
  if(upper==='Z S'||upper==='ZOOM S'){zoomSelection();return;}
  const cmd=upper.split(/\s+/)[0],tool=ALIASES[cmd];
  if(tool){state.dimMode=cmd==='DIMALIGNED'?'aligned':'auto';startTool(tool);const rest=raw.slice(cmd.length).trim();if(rest){const tokens=rest.split(/\s+/);for(const token of tokens)runCommand(token);}return;}
  const actions={E:'delete',ERASE:'delete',DELETE:'delete',DEL:'delete',U:'undo',UNDO:'undo',REDO:'redo',X:'explode',EXPLODE:'explode',SAVE:'save',QSAVE:'save',SAVEAS:'export-dxf',EXPORT:'export-dxf',DXFOUT:'export-dxf',OPEN:'open',DXFIN:'open',NEW:'new',LA:'layers',LAYER:'layers',LAYERS:'layers',UN:'units',UNITS:'units',GRID:'grid',ORTHO:'ortho',OSNAP:'osnap',SNAP:'grid-snap',AA:'area',AREA:'area',PURGE:'purge',HELP:'help','?':'help',REGEN:'regen',PROPERTIES:'properties',PROPS:'properties',SELECTALL:'select-all',PRINT:'print',PLOT:'print',ESC:'cancel',ESCAPE:'cancel',FIT:'fit'};
  if(actions[cmd]){doAction(actions[cmd]);return;}toast(`Unknown command: ${raw}. Type HELP for commands.`,'error');log('Unknown command: '+raw);
}
commandInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const value=commandInput.value;commandInput.value='';runCommand(value);canvas.focus({preventScroll:true});}else if(e.key==='Escape'){e.preventDefault();cancel();canvas.focus({preventScroll:true});}else if(e.key==='ArrowUp'){e.preventDefault();state.commandIndex=Math.max(0,state.commandIndex-1);commandInput.value=state.commands[state.commandIndex]??'';}else if(e.key==='ArrowDown'){e.preventDefault();state.commandIndex=Math.min(state.commands.length,state.commandIndex+1);commandInput.value=state.commands[state.commandIndex]??'';}});
document.addEventListener('keydown',e=>{
  const editing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName),modal=$('#appDialog').open;
  state.shift=e.shiftKey;
  if(modal)return;
  if(e.key==='Escape'){e.preventDefault();cancel();return;}
  if(e.key==='F7'||e.key==='F8'||e.key==='F3'||e.key==='F9'||e.key==='F12'){e.preventDefault();doAction({F7:'grid',F8:'ortho',F3:'osnap',F9:'grid-snap',F12:'dynamic'}[e.key]);return;}
  const mod=e.ctrlKey||e.metaKey;
  if(mod){const key=e.key.toLowerCase();if(key==='s'){e.preventDefault();saveLocal(true);return;}if(key==='o'){e.preventDefault();$('#fileInput').click();return;}if(!editing){if(key==='z'){e.preventDefault();doAction(e.shiftKey?'redo':'undo');return;}if(key==='y'){e.preventDefault();doAction('redo');return;}if(key==='a'){e.preventDefault();doAction('select-all');return;}if(key==='c'||key==='x'){e.preventDefault();copyToClipboard();if(key==='x')deleteSelection();return;}if(key==='v'){e.preventDefault();pasteClipboard();return;}if(key==='p'){e.preventDefault();doAction('print');return;}}return;}
  if(editing)return;
  if(e.key===' '){e.preventDefault();state.space=true;updatePrompt();return;}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelection();return;}
  if(e.key==='Enter'){e.preventDefault();runCommand('');return;}
  if(e.key.length===1&&!e.altKey){e.preventDefault();commandInput.value=e.key;commandInput.focus();}
});
document.addEventListener('keyup',e=>{state.shift=e.shiftKey;if(e.key===' '){state.space=false;updatePrompt();}});
window.addEventListener('blur',()=>{state.space=false;state.shift=false;state.drag=null;state.grip=null;state.touches.clear();state.pinch=null;updatePrompt();});

let dialogResolve=null;
function closeDialog(action='cancel'){const body=$('#dialogBody'),values={};for(const el of $$('[name]',body))values[el.name]=el.type==='checkbox'?el.checked:el.value;$('#appDialog').close();if(dialogResolve){const resolve=dialogResolve;dialogResolve=null;resolve({action,values});}}
function showDialog(title,body,actions=[{key:'ok',label:'Done',primary:true}]){
  if(dialogResolve)closeDialog('cancel');$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=body;$('#dialogActions').innerHTML=actions.map(a=>`<button class="${a.primary?'primary-button':'outline-button'}" data-dialog-action="${escapeHTML(a.key)}">${escapeHTML(a.label)}</button>`).join('');
  $$('[data-dialog-action]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.dialogAction));$('#appDialog').showModal();const input=$('input:not([type=color]),textarea',$('#dialogBody'));if(input)setTimeout(()=>input.focus(),20);return new Promise(resolve=>dialogResolve=resolve);
}
$('#dialogClose').onclick=()=>closeDialog();$('#appDialog').addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
const field=(label,name,value,type='text')=>`<div class="dialog-field"><label for="dialog-${name}">${label}</label><input id="dialog-${name}" name="${name}" type="${type}" value="${escapeHTML(value)}" ${type==='number'?'step="any"':''}></div>`;
async function showTextDialog(p,existing=null){
  const result=await showDialog(existing?'Edit text':'Place text',`<div class="dialog-field"><label for="dialog-text">Text content</label><textarea id="dialog-text" name="text" placeholder="Add a note to your drawing">${escapeHTML(existing?.text??'')}</textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">${field('Height (drawing units)','height',existing?.height??Number((12/renderer.camera.scale).toFixed(2)),'number')}${field('Rotation (degrees)','rotation',(existing?.rotation??0)*180/Math.PI,'number')}</div>`,[{key:'cancel',label:'Cancel'},{key:'place',label:existing?'Update text':'Place text',primary:true}]);
  if(result.action!=='place')return;const {text,height,rotation:degrees}=result.values,h=Number(height),r=Number(degrees);if(!text.trim()||!Number.isFinite(h)||h<=0||!Number.isFinite(r)){toast('Enter text, a positive height, and a valid rotation.','error');return;}
  const e={type:text.includes('\n')?'MTEXT':'TEXT',position:p,text,height:h,rotation:r*Math.PI/180,align:existing?.align??'left'};
  if(existing)model.commit('Edit text',{update:[{...existing,...e}]});else addEntities([e],'Place text');finishCommand(false);
}
async function addLayer(){const r=await showDialog('Create a layer',field('Layer name','name','A-NEW')+field('Layer color','color','#8fb8d3','color'),[{key:'cancel',label:'Cancel'},{key:'create',label:'Create layer',primary:true}]);if(r.action!=='create')return;const name=r.values.name.trim();if(!name||/[<>/\\":;?*|=\x00-\x1f]/.test(name)||name.length>255||model.layers.some(l=>l.name===name)){toast('Use a unique layer name without DXF-reserved characters.','error');return;}model.commit('Create layer',{layers:[...model.layers,{name,color:r.values.color,visible:true,locked:false,lineweight:.25,linetype:'CONTINUOUS'}]});setActiveLayer(name);}
async function editLayerColor(name){const layer=model.layer(name),r=await showDialog('Layer color',`<p>${escapeHTML(name)}</p>`+field('Color','color',layer.color,'color'),[{key:'cancel',label:'Cancel'},{key:'apply',label:'Apply color',primary:true}]);if(r.action==='apply')changeLayer(name,{color:r.values.color});}
async function showUnits(){const r=await showDialog('Drawing units',`<p>Units label the coordinates in your drawing. Changing the unit setting does <strong>not</strong> rescale existing geometry.</p><div class="dialog-field"><label>Insertion units</label><select name="units">${[0,1,2,4,5,6].map(n=>`<option value="${n}" ${model.units===n?'selected':''}>${unitName(n)}</option>`).join('')}</select></div><p class="dialog-note">Saved as $INSUNITS in the DXF header. Use SCALE to rescale geometry.</p>`,[{key:'cancel',label:'Cancel'},{key:'apply',label:'Apply units',primary:true}]);if(r.action==='apply'){model.units=Number(r.values.units);model.emit('Change drawing units');}}
async function renameDrawing(){const r=await showDialog('Rename drawing',field('Drawing name','name',model.name),[{key:'cancel',label:'Cancel'},{key:'rename',label:'Rename',primary:true}]);if(r.action==='rename'&&r.values.name.trim()){model.name=r.values.name.trim().slice(0,255);if(!model.name.toLowerCase().endsWith('.dxf'))model.name+='.dxf';model.emit('Rename drawing');}}
async function confirmReplace(kind){const r=await showDialog(kind==='new'?'Start a new drawing':'Load the sample drawing','<p>This replaces the current local workspace. Export a DXF or a Draftline project first to keep a separate copy.</p>',[{key:'cancel',label:'Cancel'},{key:'replace',label:kind==='new'?'New drawing':'Load sample',primary:true}]);if(r.action!=='replace')return;cancel();model.load(kind==='new'?{name:'Untitled.dxf',units:4,entities:[],layers:[{name:'0',color:'#dce3eb',visible:true,locked:false,lineweight:.25,linetype:'CONTINUOUS'}]}:createDemo());renderer.rebuild();if(kind==='new'){renderer.camera={x:0,y:0,scale:.15};$('#drawingViewTitle').textContent='Untitled drawing';}else{renderer.fit();$('#drawingViewTitle').textContent='Ground floor plan';}renderer.invalidate();}
function showHelp(){const rows=[['Line / Polyline','L / PL'],['Rectangle / Circle','REC / C'],['3-point arc / Ellipse','A / EL'],['Polygon / Hatch','POL / H'],['Text / Dimension','T / DIM'],['Aligned dimension','DIMALIGNED'],['Move / Copy','M / CO'],['Rotate / Scale','RO / SC'],['Mirror / Offset','MI / O'],['Trim / Extend (LINE)','TR / EX'],['Explode / Delete','X / E'],['Measure / Area','DI / AA'],['Zoom extents','Z E'],['Grid / Ortho','F7 / F8'],['Object snap / Grid snap','F3 / F9'],['Dynamic input','F12'],['Undo / Redo','Ctrl Z / Ctrl Shift Z'],['Save / Open','Ctrl S / Ctrl O'],['Copy / Paste','Ctrl C / Ctrl V'],['Finish / Cancel','Enter / Esc']];
  showDialog('A command away from anything',`<p>Click a tool or start typing directly in the drawing. Geometry uses exact drawing coordinates; the display is tessellated for rendering.</p><div class="help-grid">${rows.map(([label,key])=>`<div class="help-row"><span>${label}</span><kbd>${key}</kbd></div>`).join('')}</div><h3 style="font-size:12px;margin-top:22px">Precision input</h3><p><code>1000,500</code> is an absolute point. <code>@500,0</code> is relative to the previous point. <code>@1000&lt;45</code> is a polar displacement. Enter a radius for a circle, an angle for rotation, or a factor for scale.</p><p><code>LINE 0,0 2000,0</code> draws an exact 2,000-unit line. Press Enter again to finish. For polylines, type <code>C</code> to close.</p><p><strong>Selection:</strong> click an entity; Shift-click adds or removes. Drag left to right for a contained window, right to left for crossing. Drag a blue grip to edit geometry. Middle-drag or Space-drag pans; two fingers pan and zoom on touchscreens.</p><p class="dialog-note">Ctrl shortcuts also accept Command on macOS. Browser-reserved function keys may require Fn. This is a 2D model-space editor, not a native DWG / 3D solid-modeling engine.</p>`);
}
function showAbout(){showDialog('Meet Draftline',`<div class="dialog-hero"><span class="brand-mark"></span><div><h3>draftline</h3><p>PRECISION, WITHOUT LIMITS.</p></div></div><p>A local-first, dependency-free CAD workspace built with plain HTML, CSS, and JavaScript. Real DXF interchange, a WebGPU-first renderer, precision tools, and an editable document model.</p><p><strong>Rendering:</strong> GPU-instanced, antialiased line quads with camera-relative coordinates. Canvas 2D draws text, hatch fills, grid, and editor overlays, and provides the full fallback renderer. The status bar reports the backend actually in use.</p><p><strong>Supported:</strong> model-space lines, polylines with bulge arcs, circles, arcs, ellipses, control-point NURBS splines, text, points, solids, polyline-boundary hatches, linear/aligned dimensions, and expanded nested inserts.</p><p><strong>Boundaries:</strong> no binary DXF, native DWG, paper-space layouts, ACIS/3D solids, xrefs, constraints, full fonts/MTEXT formatting, or associative block editing. Imports report skipped or approximated features. This is an independent project, not affiliated with Autodesk.</p><p class="dialog-note">Draftline 0.1 · No drawing uploads, analytics, external fonts, or runtime dependencies.</p>`);}
function showStatistics(){const counts={};for(const e of model.entities.values())counts[e.type]=(counts[e.type]??0)+1;showDialog('Drawing statistics',`<p><strong>${escapeHTML(model.name)}</strong><br>${model.entities.size.toLocaleString()} entities · ${model.layers.length} layers · ${escapeHTML(unitName(model.units))}</p><div class="import-report">${Object.entries(counts).map(([k,v])=>`${k.padEnd(16,' ')} ${v.toLocaleString()}`).map(escapeHTML).join('<br>')}</div><p>${renderer.lineCount.toLocaleString()} rendered line segments. Active backend: <strong>${renderer.mode}</strong>. Last CPU frame preparation: ${renderer.frameMs.toFixed(2)} ms (not a GPU timing measurement).</p>${state.importReport?`<p class="dialog-note">Last import: ${escapeHTML(state.importReport.version)} · ${state.importReport.warnings.length} compatibility notices.</p>`:''}`);}
function zoomSelection(){const bounds=emptyBounds();for(const e of selected())unionBounds(bounds,geometry(e,.1/renderer.camera.scale).bounds);if(validBounds(bounds))renderer.fit(bounds,.7);else toast('Select one or more entities to zoom to.');}
function deleteSelection(){const keys=selected().map(e=>e.id);if(keys.length){model.commit('Erase entities',{remove:keys});updateSelection([]);}else toast('Select entities to erase.');}
function copyToClipboard(){state.clipboard=selected().map(clone);if(state.clipboard.length)toast(`Copied ${state.clipboard.length} ${state.clipboard.length===1?'entity':'entities'} to the workspace clipboard.`);else toast('Select geometry to copy.');}
function pasteClipboard(){if(!state.clipboard.length){toast('The workspace clipboard is empty. Select geometry and press Ctrl C.');return;}const bounds=emptyBounds();for(const e of state.clipboard)unionBounds(bounds,geometry(e).bounds);state.symbol=state.clipboard.map(e=>({...transformEntity(e,translation(-bounds.minX,-bounds.minY)),id:id()}));state.symbolName='copied geometry';startTool('symbol');}
function beginSymbol(name){
  const line=(a,b)=>({type:'LINE',a:point(...a),b:point(...b)}),rect=(x,y,w,h)=>rectangleAt(point(x,y),point(x+w,y+h)),circle=(x,y,r)=>({type:'CIRCLE',center:point(x,y),radius:r});
  let entities=[];
  if(name==='door')entities=[line([0,0],[0,900]),line([0,0],[900,0]),{type:'ARC',center:point(),radius:900,start:0,end:Math.PI/2}];
  if(name==='desk')entities=[rect(0,0,1500,700),rect(60,60,1380,580),rect(550,-500,450,400),rect(580,220,450,260)];
  if(name==='chair')entities=[rect(0,0,500,500),rect(40,40,420,80),rect(40,150,420,310)];
  if(name==='tree'){entities=[circle(0,0,90),{type:'LWPOLYLINE',closed:true,points:Array.from({length:90},(_,i)=>{const a=i/90*TAU,r=600*(.85+.15*Math.sin(9*a));return point(r*Math.cos(a),r*Math.sin(a));})}];for(let i=0;i<6;i++){const a=i/6*TAU;entities.push(circle(230*Math.cos(a),230*Math.sin(a),300));}}
  const factor={1:1/25.4,2:1/304.8,5:.1,6:.001}[model.units]??1;
  state.symbol=entities.map(e=>baseEntity(transformEntity(e,scaling(factor))));state.symbolName=name;startTool('symbol');
}

let saveTimer=null;
function saveLocal(notify=false){clearTimeout(saveTimer);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(model.serialize()));state.modified=false;$('#dirtyDot').classList.remove('visible');$('#saveState').innerHTML='<span class="status-dot"></span> Saved locally';if(notify)toast('Drawing saved on this device. Export a project for a separate backup.','success');}catch(e){$('#saveState').textContent='Not saved';toast('Local storage is unavailable or full. Export a project to keep your drawing.','error');log('Autosave failed: '+e.message);}}
model.addEventListener('change',e=>{renderer.setDocument(model);state.modified=true;$('#dirtyDot').classList.add('visible');$('#saveState').textContent='Saving…';$('#fileTitle').textContent=model.name;document.title=model.name+' — Draftline';$('#unitsLabel').textContent=unitName(model.units);for(const key of state.selection)if(!model.entities.has(key))state.selection.delete(key);renderLayers();renderProperties();renderRibbon();updatePrompt();log(e.detail.label);clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveLocal(),650);});
function download(content,name,type='application/octet-stream'){const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const baseFileName=()=>model.name.replace(/\.dxf$/i,'').replace(/[<>:"/\\|?*]/g,'_');
function exportDXF(){try{download(writeDXF(model),baseFileName()+'.dxf','application/dxf');toast('DXF exported. Draftline projects additionally preserve the editor document exactly.','success');log('DXF exported: '+baseFileName()+'.dxf');}catch(e){toast('DXF export failed: '+e.message,'error');}}
function svgExport(){
  const records=[];let bounds=emptyBounds();for(const e of model.entities.values()){if(model.layer(e.layer)?.visible===false||e.invisible)continue;const g=geometry(e,.1);if(!validBounds(g.bounds))continue;unionBounds(bounds,g.bounds);const color=renderer.color(e);records.push({...g,color:['#ffffff','#dce3eb','#e2e6eb','#e8edf1','#f0f3f6'].includes(color.toLowerCase())?'#253b48':color});}
  if(!validBounds(bounds))bounds={minX:0,minY:0,maxX:1000,maxY:1000};const margin=Math.max(bounds.maxX-bounds.minX,bounds.maxY-bounds.minY)*.04,w=bounds.maxX-bounds.minX+2*margin,h=bounds.maxY-bounds.minY+2*margin,minX=bounds.minX-margin,maxY=bounds.maxY+margin,lineWidth=Math.max(w/1800,.01);
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${Math.round(1600*h/w)}" viewBox="0 0 ${w} ${h}"><title>${escapeHTML(model.name)}</title><rect width="100%" height="100%" fill="white"/><defs><pattern id="hatch" width="${lineWidth*12}" height="${lineWidth*12}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${lineWidth*12}" stroke="#82919b" stroke-width="${lineWidth*.7}"/></pattern></defs>`];
  const dpath=points=>points.map((p,i)=>`${i?'L':'M'}${p.x-minX},${maxY-p.y}`).join(' ');
  for(const r of records){if(r.fills.length){const d=r.fills.map(f=>dpath(f.points)+' Z').join(' ');parts.push(`<path d="${d}" fill="${r.fills.every(f=>f.pattern==='SOLID')?r.color:'url(#hatch)'}" fill-opacity=".35" fill-rule="evenodd"/>`);}for(const path of r.paths)parts.push(`<path d="${dpath(path)}" fill="none" stroke="${r.color}" stroke-width="${lineWidth}" stroke-linecap="round"/>`);for(const t of r.texts){const x=t.position.x-minX,y=maxY-t.position.y,anchor=t.align==='center'?'middle':t.align==='right'?'end':'start';String(t.text).split('\n').forEach((line,i)=>parts.push(`<text transform="translate(${x},${y}) rotate(${-(t.rotation??0)*180/Math.PI})" x="0" y="${i*t.height*1.3}" fill="${r.color}" font-size="${t.height}" font-family="Arial,sans-serif" text-anchor="${anchor}">${escapeHTML(line)}</text>`));}}
  parts.push('</svg>');return parts.join('');
}
async function exportPNG(){
  const overlayFn=renderer.beforeOverlay;renderer.beforeOverlay=null;renderer.render();try{if(renderer.mode==='WebGPU')await renderer.device.queue.onSubmittedWorkDone();const c=document.createElement('canvas');c.width=renderer.grid.width;c.height=renderer.grid.height;const ctx=c.getContext('2d');for(const source of[renderer.grid,renderer.mode==='WebGPU'?renderer.gpu:renderer.cpu,renderer.overlay])ctx.drawImage(source,0,0);const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not encode the image.');download(blob,baseFileName()+'.png');toast('Viewport snapshot exported.','success');}catch(e){toast(e.message,'error');}finally{renderer.beforeOverlay=overlayFn;renderer.invalidate();}
}
function printDrawing(){const popup=window.open('','_blank');if(!popup){toast('Allow popups for this page to open the print view.','error');return;}const svg=svgExport();popup.document.open();popup.document.write(`<!DOCTYPE html><html><head><title>${escapeHTML(model.name)}</title><style>@page{size:landscape;margin:12mm}body{margin:0;font-family:Arial}header{padding:20px;display:flex;justify-content:space-between;border-bottom:1px solid #ddd}button{padding:9px 20px;border:0;background:#e87650;color:white;border-radius:5px;cursor:pointer}svg{width:100%;height:calc(100vh - 90px)}@media print{header{display:none}svg{height:175mm;width:100%}}</style></head><body><header><span>${escapeHTML(model.name)} · Draftline · Fit to page</span><button id="print">Print drawing</button></header>${svg}</body></html>`);popup.document.close();popup.document.getElementById('print').onclick=()=>popup.print();}
function togglePaper(paper){renderer.paper=paper;renderer.dark=!paper;workspace.classList.toggle('light-canvas',paper);renderer.needsBuild=true;renderer.fit();renderer.invalidate();$('#viewModeLabel').textContent=paper?'Fit-to-page preview':'Top · 2D Wireframe';$$('.model-tab').forEach(b=>b.classList.toggle('active',b.dataset.action===(paper?'paper-view':'model-view')));}
function doAction(action){
  switch(action){
    case 'new':confirmReplace('new');break;case 'sample':confirmReplace('sample');break;
    case 'open':$('#fileInput').click();break;case 'files':$('#fileMenu').hidden=!$('#fileMenu').hidden;break;
    case 'save':saveLocal(true);break;case 'export-dxf':exportDXF();break;case 'export-json':download(JSON.stringify(model.serialize(),null,2),baseFileName()+'.draftline.json','application/json');toast('Draftline project exported.','success');break;
    case 'export-svg':download(svgExport(),baseFileName()+'.svg','image/svg+xml');toast('Vector SVG exported.','success');break;case 'export-png':exportPNG();break;
    case 'print':printDrawing();break;case 'paper-view':togglePaper(true);break;case 'model-view':togglePaper(false);break;
    case 'undo':state.points=[];state.grip=null;if(!model.undo())toast('Nothing to undo.');break;case 'redo':if(!model.redo())toast('Nothing to redo.');break;
    case 'delete':deleteSelection();break;case 'explode':explodeSelection();break;
    case 'select-all':updateSelection([...model.entities.values()].filter(e=>model.editable(e)).map(e=>e.id));break;
    case 'fit':renderer.fit();break;case 'zoom-selection':zoomSelection();break;
    case 'zoom-in':renderer.zoomAt(point(renderer.width/2,renderer.height/2),1.35);break;case 'zoom-out':renderer.zoomAt(point(renderer.width/2,renderer.height/2),1/1.35);break;
    case 'grid':renderer.showGrid=!renderer.showGrid;$('#gridToggle').classList.toggle('active',renderer.showGrid);renderer.invalidate();break;
    case 'ortho':state.ortho=!state.ortho;$('#orthoToggle').classList.toggle('active',state.ortho);log('Orthogonal mode '+(state.ortho?'on':'off'));break;
    case 'osnap':state.osnap=!state.osnap;$('#snapToggle').classList.toggle('active',state.osnap);state.snap=null;renderer.invalidate();break;
    case 'grid-snap':state.gridSnap=!state.gridSnap;toast('Grid snap '+(state.gridSnap?'on':'off')+' · F9 to toggle');break;
    case 'dynamic':state.dynamic=!state.dynamic;$('#dynamicToggle').classList.toggle('active',state.dynamic);if(!state.dynamic)$('#dynamicInput').hidden=true;break;
    case 'lineweight':renderer.lineweight=!renderer.lineweight;renderer.needsBuild=true;renderer.invalidate();toast('Display lineweights '+(renderer.lineweight?'on':'off'));break;
    case 'theme':document.body.classList.toggle('dark-ui');try{localStorage.setItem('draftline.theme',document.body.classList.contains('dark-ui')?'dark':'light');}catch{}break;
    case 'canvas-theme':renderer.dark=!renderer.dark;renderer.needsBuild=true;workspace.classList.toggle('light-canvas',!renderer.dark);renderer.invalidate();break;
    case 'layers':showPanel('layers');break;case 'properties':showPanel('properties');break;
    case 'close-left':$('#leftPanel').hidden=true;$('#leftPanel').classList.remove('force-open');$$('.rail-button[data-panel]').forEach(b=>b.classList.remove('active'));break;
    case 'close-properties':$('#rightPanel').hidden=true;$('#rightPanel').classList.remove('force-open');break;
    case 'add-layer':addLayer();break;case 'rename':renameDrawing();break;case 'units':showUnits();break;
    case 'bylayer':if(selected().length)model.commit('Reset color to ByLayer',{update:selected().map(e=>({...e,color:'BYLAYER'}))});break;
    case 'history':$('#commandHistory').hidden=!$('#commandHistory').hidden;$('#commandHistory').scrollTop=$('#commandHistory').scrollHeight;break;
    case 'aligned-dimension':state.dimMode='aligned';startTool('dimension');break;
    case 'area':{const a=selected().map(entityArea).filter(a=>a!==null);if(!a.length)toast('Select a closed polyline, circle, or ellipse to measure area.');else{const total=a.reduce((s,n)=>s+n,0);log(`Total selected area: ${fmt(total,3)} square drawing units.`);toast(`Area: ${fmt(total,3)} square drawing units`,'success');}break;}
    case 'purge':{const used=new Set([...model.entities.values()].map(e=>e.layer));const layers=model.layers.filter(l=>used.has(l.name)||l.name==='0'||l.name===model.activeLayer);if(layers.length===model.layers.length)toast('No unused layers to purge.');else{const count=model.layers.length-layers.length;model.commit('Purge unused layers',{layers});toast(`Purged ${count} unused layers.`);}break;}
    case 'help':showHelp();break;case 'about':showAbout();break;case 'statistics':showStatistics();break;
    case 'regen':renderer.needsBuild=true;renderer.invalidate();log('Drawing regenerated.');break;
    case 'cancel':cancel();break;
  }
}

function validateProject(project){
  if(!project||!Array.isArray(project.entities)||!Array.isArray(project.layers)||!project.layers.length)throw new Error('Not a valid Draftline project.');
  if(project.entities.length>250000||project.layers.length>10000)throw new Error('This project exceeds the entity or layer limit.');
  const allowed=new Set(['LINE','LWPOLYLINE','POLYLINE','CIRCLE','ARC','ELLIPSE','SPLINE','TEXT','MTEXT','POINT','DIMENSION','HATCH','SOLID']);
  const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=1e14&&Math.abs(p.y)<=1e14;
  const real=n=>Number.isFinite(n)&&Math.abs(n)<=1e14;
  const ids=new Set();
  for(const e of project.entities){
    if(!allowed.has(e.type))throw new Error('Unsupported project entity type: '+e.type);
    if(!e.id||ids.has(e.id))e.id=id();ids.add(e.id);
    if(e.type==='LINE'&&(!finite(e.a)||!finite(e.b)))throw new Error('Invalid line coordinates.');
    if(['CIRCLE','ARC'].includes(e.type)&&(!finite(e.center)||!real(e.radius)||e.radius<=0))throw new Error('Invalid circle or arc geometry.');
    if(e.type==='ARC'&&(!real(e.start)||!real(e.end)))throw new Error('Invalid arc angles.');
    if(['LWPOLYLINE','POLYLINE','SOLID'].includes(e.type)&&(!Array.isArray(e.points)||!e.points.every(finite)))throw new Error('Invalid polyline or solid geometry.');
    if(['TEXT','MTEXT','POINT'].includes(e.type)&&!finite(e.position))throw new Error('Invalid insertion point.');
    if(['TEXT','MTEXT'].includes(e.type)&&(!real(e.height)||e.height<=0||typeof e.text!=='string'||e.text.length>100000))throw new Error('Invalid text entity.');
    if(e.type==='ELLIPSE'&&(!finite(e.center)||!finite(e.major)||!real(e.ratio)||e.ratio<=0))throw new Error('Invalid ellipse geometry.');
    if(e.type==='DIMENSION'&&(!finite(e.a)||!finite(e.b)||!real(e.offset)))throw new Error('Invalid dimension geometry.');
    if(e.type==='HATCH'&&(!Array.isArray(e.boundaries)||!e.boundaries.every(ps=>Array.isArray(ps)&&ps.every(finite))))throw new Error('Invalid hatch boundaries.');
    if(e.type==='SPLINE'&&(!Array.isArray(e.controlPoints)||!e.controlPoints.every(finite)||!(e.knots??[]).every(real)||!(e.weights??[]).every(real)))throw new Error('Invalid spline geometry.');
    e.color=/^#[0-9a-f]{6}$/i.test(e.color)?e.color:['BYLAYER','BYBLOCK'].includes(e.color)?e.color:'BYLAYER';e.layer=String(e.layer??'0').slice(0,255);e.linetype=String(e.linetype??'BYLAYER').slice(0,255);
  }
  project.layers=project.layers.map(l=>({name:String(l.name??'0').slice(0,255),color:/^#[0-9a-f]{6}$/i.test(l.color)?l.color:'#dce3eb',visible:l.visible!==false,locked:!!l.locked,lineweight:Number.isFinite(l.lineweight)?l.lineweight:.25,linetype:String(l.linetype??'CONTINUOUS').slice(0,255)}));
  for(const e of project.entities)if(!project.layers.some(l=>l.name===e.layer))project.layers.push({name:e.layer,color:'#dce3eb',visible:true,locked:false,lineweight:.25,linetype:'CONTINUOUS'});
  project.name=String(project.name??'Untitled.dxf').slice(0,255);project.units=Number.isInteger(project.units)?project.units:4;return project;
}
let importJob=0,activeWorker=null;
async function importText(text,name='Imported.dxf',showReport=true){
  const job=++importJob;activeWorker?.terminate();activeWorker=null;$('#saveState').textContent='Reading drawing…';
  try{
    let doc,milliseconds=0;
    if(/\.(?:json|draftline)$/i.test(name)||text.trimStart().startsWith('{'))doc=validateProject(JSON.parse(text));
    else{
      const started=performance.now();
      doc=await new Promise((resolve,reject)=>{
        let worker,timer;
        try{let source='src/dxf-worker.js';if(globalThis.__DRAFTLINE_WORKER__){source=URL.createObjectURL(new Blob([globalThis.__DRAFTLINE_WORKER__],{type:'text/javascript'}));worker=new Worker(source);URL.revokeObjectURL(source);}else worker=new Worker(source,{type:'module'});activeWorker=worker;
          timer=setTimeout(()=>{worker.terminate();reject(new Error('DXF import exceeded the 30-second safety limit.'));},30000);
          worker.onmessage=({data})=>{if(data.job!==job)return;clearTimeout(timer);worker.terminate();activeWorker=null;if(data.error)reject(new Error(data.error));else resolve(data.document);};
          worker.onerror=()=>{clearTimeout(timer);worker.terminate();activeWorker=null;try{resolve(parseDXF(text));}catch(e){reject(e);}};
          worker.postMessage({job,text});
        }catch{clearTimeout(timer);try{resolve(parseDXF(text));}catch(e){reject(e);}}
      });milliseconds=performance.now()-started;doc.name=name;validateProject(doc);
    }
    if(job!==importJob)return null;
    cancel();state.importReport=doc.warnings?{warnings:doc.warnings,version:doc.version,milliseconds}:null;model.load(doc);renderer.rebuild();renderer.fit();renderer.invalidate();$('#drawingViewTitle').textContent=baseFileName();
    const report=`Imported ${doc.entities.length.toLocaleString()} entities on ${doc.layers.length} layers${milliseconds?' in '+Math.round(milliseconds)+' ms':''}.`;log(report);toast(report,'success');
    if(doc.warnings?.length){for(const warning of doc.warnings)log('DXF notice: '+warning);if(showReport)showDialog('DXF import report',`<p>${escapeHTML(report)} Source format: <strong>${escapeHTML(doc.version)}</strong>.</p><p>The following compatibility notices apply to this drawing. Keep your original file; skipped source features cannot be recovered from a new export.</p><div style="max-height:300px;overflow:auto">${doc.warnings.map(w=>`<div class="import-warning">${escapeHTML(w)}</div>`).join('')}</div>`);}
    return doc;
  }catch(e){if(job!==importJob)return null;$('#saveState').textContent=state.modified?'Unsaved changes':'Saved locally';toast('Import failed: '+e.message,'error');log('Import failed: '+e.message);throw e;}
}
async function openFile(file){if(!file)return;if(file.size>50_000_000){toast('This build accepts files up to 50 MB.','error');return;}try{const buffer=await file.arrayBuffer();const bytes=new Uint8Array(buffer);let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\ufffd')&&/\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\nANSI_1252/.test(text))text=new TextDecoder('windows-1252').decode(bytes);await importText(text,file.name);}catch{}}
$('#fileInput').addEventListener('change',e=>{openFile(e.target.files[0]);e.target.value='';});
let dragDepth=0;
workspace.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('#dropTarget').hidden=false;}});
workspace.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
workspace.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('#dropTarget').hidden=true;}});
workspace.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#dropTarget').hidden=true;openFile(e.dataTransfer.files[0]);});
$('#fileMenu').innerHTML=`<div class="menu-label">YOUR WORKSPACE</div><button data-action="new">${icon('new')}New drawing<span>NEW</span></button><button data-action="open">${icon('folder')}Open drawing<span>Ctrl O</span></button><button data-action="sample">${icon('home')}Meridian House sample</button><div class="menu-divider"></div><button data-action="save">${icon('save')}Save locally<span>Ctrl S</span></button><button data-action="export-json">${icon('download')}Save project file</button><button data-action="rename">${icon('text')}Rename drawing</button><div class="menu-divider"></div><button data-action="about">${icon('help')}About Draftline<span>0.1</span></button>`;
$('#exportMenu').innerHTML=`<div class="menu-label">EXPORT YOUR DRAWING</div><button data-action="export-dxf">${icon('file')}CAD drawing<span>.dxf</span></button><button data-action="export-json">${icon('save')}Draftline project<span>.json</span></button><button data-action="export-svg">${icon('polygon')}Vector drawing<span>.svg</span></button><button data-action="export-png">${icon('grid')}Viewport snapshot<span>.png</span></button><div class="menu-divider"></div><button data-action="print">${icon('print')}Print drawing<span>Ctrl P</span></button>`;
$('#fileMenuButton').onclick=()=>{$('#fileMenu').hidden=!$('#fileMenu').hidden;$('#exportMenu').hidden=true;};
$('#exportButton').onclick=()=>{$('#exportMenu').hidden=!$('#exportMenu').hidden;$('#fileMenu').hidden=true;};
$('#expandHistory').onclick=()=>doAction('history');
$('#layerSearch').addEventListener('input',renderLayers);
$('#symbolGrid').innerHTML=['door','desk','chair','tree'].map(name=>`<button class="symbol-tile" data-symbol="${name}">${icon(name==='door'?'arc':name==='tree'?'circle':name==='desk'?'rectangle':'block')}<span>${name[0].toUpperCase()+name.slice(1)}</span></button>`).join('');
document.addEventListener('click',e=>{
  if(!e.target.closest('#fileMenuButton,#fileMenu,[data-action=files]'))$('#fileMenu').hidden=true;
  if(!e.target.closest('#exportButton,#exportMenu'))$('#exportMenu').hidden=true;
  const layerButton=e.target.closest('[data-layer-action]');if(layerButton){const name=layerButton.closest('[data-layer]').dataset.layer,action=layerButton.dataset.layerAction,layer=model.layer(name);if(action==='activate')setActiveLayer(name);else if(action==='color')editLayerColor(name);else changeLayer(name,{[action]:!layer[action]});return;}
  const tab=e.target.closest('[data-tab]');if(tab){renderRibbon(tab.dataset.tab);return;}
  const panel=e.target.closest('[data-panel]');if(panel){showPanel(panel.dataset.panel);return;}
  const symbol=e.target.closest('[data-symbol]');if(symbol){beginSymbol(symbol.dataset.symbol);return;}
  const tool=e.target.closest('[data-tool]');if(tool){if(tool.dataset.tool==='dimension')state.dimMode='auto';startTool(tool.dataset.tool);return;}
  const action=e.target.closest('[data-action]');if(action){doAction(action.dataset.action);if(action.closest('.popover'))action.closest('.popover').hidden=true;}
});
try{document.body.classList.toggle('dark-ui',localStorage.getItem('draftline.theme')==='dark');}catch{}
applyIcons();renderRibbon();renderLayers();renderProperties();updatePrompt();$('#fileTitle').textContent=model.name;$('#unitsLabel').textContent=unitName(model.units);$('#drawingViewTitle').textContent=recovered?baseFileName():'Ground floor plan';document.title=model.name+' — Draftline';
log(recovered?'Restored the saved drawing from this device.':'Meridian House sample loaded. All objects are editable CAD geometry.');log('Ready. Type HELP for commands. Ctrl S saves locally; export a project for a separate backup.');
// Public diagnostic/automation surface for tests and integrations; no external services.
globalThis.draftline=Object.freeze({model,renderer,state,execute:runCommand,importText,exportDXF:()=>writeDXF(model),exportSVG:svgExport,createDemo,select:ids=>updateSelection(ids),action:doAction,validateProject});
setTimeout(()=>saveLocal(),800);
window.addEventListener('beforeunload',e=>{if(state.modified){saveLocal();if(state.modified){e.preventDefault();e.returnValue='';}}});
