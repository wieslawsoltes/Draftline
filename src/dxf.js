import {point, id, TAU, geometry, transformEntity, multiplyMatrix, translation, normalizeAngle, distance, angle, finitePoint} from './geometry.js';
const RAD=Math.PI/180;
// Standard AutoCAD Color Index RGB table (also used by ezdxf).
const ACI=["#000000","#ff0000","#ffff00","#00ff00","#00ffff","#0000ff","#ff00ff","#ffffff","#808080","#c0c0c0","#ff0000","#ff7f7f","#a50000","#a55252","#7f0000","#7f3f3f","#4c0000","#4c2626","#260000","#261313","#ff3f00","#ff9f7f","#a52900","#a56752","#7f1f00","#7f4f3f","#4c1300","#4c2f26","#260900","#261713","#ff7f00","#ffbf7f","#a55200","#a57c52","#7f3f00","#7f5f3f","#4c2600","#4c3926","#261300","#261c13","#ffbf00","#ffdf7f","#a57c00","#a59152","#7f5f00","#7f6f3f","#4c3900","#4c4226","#261c00","#262113","#ffff00","#ffff7f","#a5a500","#a5a552","#7f7f00","#7f7f3f","#4c4c00","#4c4c26","#262600","#262613","#bfff00","#dfff7f","#7ca500","#91a552","#5f7f00","#6f7f3f","#394c00","#424c26","#1c2600","#212613","#7fff00","#bfff7f","#52a500","#7ca552","#3f7f00","#5f7f3f","#264c00","#394c26","#132600","#1c2613","#3fff00","#9fff7f","#29a500","#67a552","#1f7f00","#4f7f3f","#134c00","#2f4c26","#092600","#172613","#00ff00","#7fff7f","#00a500","#52a552","#007f00","#3f7f3f","#004c00","#264c26","#002600","#132613","#00ff3f","#7fff9f","#00a529","#52a567","#007f1f","#3f7f4f","#004c13","#264c2f","#002609","#135817","#00ff7f","#7fffbf","#00a552","#52a57c","#007f3f","#3f7f5f","#004c26","#264c39","#002613","#13581c","#00ffbf","#7fffdf","#00a57c","#52a591","#007f5f","#3f7f6f","#004c39","#264c42","#00261c","#135858","#00ffff","#7fffff","#00a5a5","#52a5a5","#007f7f","#3f7f7f","#004c4c","#264c4c","#002626","#135858","#00bfff","#7fdfff","#007ca5","#5291a5","#005f7f","#3f6f7f","#00394c","#26427e","#001c26","#135858","#007fff","#7fbfff","#0052a5","#527ca5","#003f7f","#3f5f7f","#00264c","#26397e","#001326","#131c58","#003fff","#7f9fff","#0029a5","#5267a5","#001f7f","#3f4f7f","#00134c","#262f7e","#000926","#131758","#0000ff","#7f7fff","#0000a5","#5252a5","#00007f","#3f3f7f","#00004c","#26267e","#000026","#131358","#3f00ff","#9f7fff","#2900a5","#6752a5","#1f007f","#4f3f7f","#13004c","#2f267e","#090026","#171358","#7f00ff","#bf7fff","#5200a5","#7c52a5","#3f007f","#5f3f7f","#26004c","#39267e","#130026","#1c1358","#bf00ff","#df7fff","#7c00a5","#9152a5","#5f007f","#6f3f7f","#39004c","#42264c","#1c0026","#581358","#ff00ff","#ff7fff","#a500a5","#a552a5","#7f007f","#7f3f7f","#4c004c","#4c264c","#260026","#581358","#ff00bf","#ff7fdf","#a5007c","#a55291","#7f005f","#7f3f6f","#4c0039","#4c2642","#26001c","#581358","#ff007f","#ff7fbf","#a50052","#a5527c","#7f003f","#7f3f5f","#4c0026","#4c2639","#260013","#58131c","#ff003f","#ff7f9f","#a50029","#a55267","#7f001f","#7f3f4f","#4c0013","#4c262f","#260009","#581317","#000000","#656565","#666666","#999999","#cccccc","#ffffff"];
export function aciColor(index){return ACI[Math.max(0,Math.min(255,Math.abs(Math.trunc(index??7))))]??'#ffffff';}
const hex=n=>'#'+Math.max(0,Math.min(0xffffff,n)).toString(16).padStart(6,'0');
const get=(r,c,f=null)=>r.find(p=>p[0]===c)?.[1]??f;
const num=(r,c,f=0)=>{const v=Number(get(r,c,f));return Number.isFinite(v)?v:f;};
const all=(r,c)=>r.filter(p=>p[0]===c).map(p=>Number(p[1]));
const pos=(r,c=10)=>point(num(r,c),num(r,c+10));
function vertices(r,code=10){const result=[];let p;for(const [c,v]of r){if(c===code){p={x:Number(v),y:0};result.push(p);}else if(p&&c===code+10)p.y=Number(v);else if(p&&c===42&&code===10)p.bulge=Number(v);}return result.filter(finitePoint);}
const cleanText=s=>String(s??'').replace(/\\U\+([0-9a-fA-F]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/%%d/gi,'°').replace(/%%p/gi,'±').replace(/%%c/gi,'Ø').replace(/\\P/g,'\n').replace(/\\[HhWwCcAaFfTtQq][^;]*;/g,'').replace(/\\[LlOoKk]/g,'').replace(/[{}]/g,'').replace(/\\~/g,' ');
export function parseDXF(text){
  if(typeof text!=='string')throw new TypeError('DXF input must be text.');
  if(text.startsWith('AutoCAD Binary DXF')||text.slice(0,8).includes('AC10'))throw new Error('Binary DXF / DWG is not supported. Export an ASCII DXF from your CAD application.');
  if(text.length>50_000_000)throw new Error('This build accepts DXF files up to 50 MB.');
  const lines=text.replace(/^\uFEFF/,'').replace(/\r/g,'').split('\n'),pairs=[];
  for(let i=0;i+1<lines.length;i+=2){const code=Number(lines[i].trim());if(lines[i].trim()===''||!Number.isInteger(code)||code<0||code>1071)throw new Error(`Invalid DXF group code at line ${i+1}.`);pairs.push([code,lines[i+1].trimEnd()]);}
  if(!pairs.some(([c,v])=>c===0&&v.trim()==='SECTION'))throw new Error('No DXF SECTION found. Please select an ASCII DXF file.');
  const records=[];let rec=null;for(const pair of pairs){if(pair[0]===0){rec={type:pair[1].trim().toUpperCase(),data:[]};records.push(rec);}else if(rec)rec.data.push(pair);}
  const header=[],entityRecords=[],blockRecords=[],tableRecords=[];let section='';
  for(const r of records){if(r.type==='SECTION'){section=String(get(r.data,2,'')).trim();if(section==='HEADER')header.push(...r.data);continue;}if(r.type==='ENDSEC'){section='';continue;}if(section==='ENTITIES')entityRecords.push(r);else if(section==='BLOCKS')blockRecords.push(r);else if(section==='TABLES')tableRecords.push(r);}
  const warnings=new Set(),unsupported={},layers=[],blocks=new Map();
  for(const r of tableRecords)if(r.type==='LAYER'){const aci=num(r.data,62,7),flags=num(r.data,70);layers.push({name:get(r.data,2,'0').trim(),color:get(r.data,420)!==null?hex(num(r.data,420)):aciColor(aci),visible:aci>=0&&!(flags&1),locked:!!(flags&4),lineweight:num(r.data,370,25)/100,linetype:get(r.data,6,'CONTINUOUS').trim()});}
  if(!layers.some(l=>l.name==='0'))layers.unshift({name:'0',color:'#dce3eb',visible:true,locked:false,lineweight:.25,linetype:'CONTINUOUS'});
  let block;for(const r of blockRecords){if(r.type==='BLOCK'){block={name:get(r.data,2,''),base:pos(r.data),records:[]};blocks.set(block.name,block);}else if(r.type==='ENDBLK')block=null;else if(block)block.records.push(r);}
  const sourceCounts={};
  function parseEntity(r){
    const d=r.data,t=r.type;sourceCounts[t]=(sourceCounts[t]??0)+1;
    if(num(d,67,0)===1){warnings.add('Paper-space entities are not imported; this editor displays model space.');return null;}
    if(Math.abs(num(d,210))>1e-9||Math.abs(num(d,220))>1e-9||Math.abs(num(d,230,1)-1)>1e-9){warnings.add('Entities with non-default extrusion / OCS normals were skipped.');unsupported[t]=(unsupported[t]??0)+1;return null;}
    if(Math.abs(num(d,30))>1e-9||Math.abs(num(d,38))>1e-9)warnings.add('Nonzero Z coordinates are projected onto the XY plane.');
    const colorCode=num(d,62,256);const base={id:id(),type:t,layer:get(d,8,'0').trim(),color:get(d,420)!==null?hex(num(d,420)):colorCode===256?'BYLAYER':colorCode===0?'BYBLOCK':aciColor(colorCode),linetype:get(d,6,'BYLAYER').trim(),lineweight:num(d,370,-1),handle:get(d,5,null),invisible:num(d,60,0)===1};
    if(get(d,48)!==null&&num(d,48,1)!==1)warnings.add('DXF linetype scales are approximated by screen-space dash patterns.');
    switch(t){
      case 'LINE':return {...base,a:pos(d),b:pos(d,11)};
      case 'POINT':return {...base,position:pos(d)};
      case 'CIRCLE':return {...base,center:pos(d),radius:Math.abs(num(d,40))};
      case 'ARC':return {...base,center:pos(d),radius:Math.abs(num(d,40)),start:num(d,50)*RAD,end:num(d,51)*RAD};
      case 'LWPOLYLINE':if(num(d,43)||all(d,40).some(Boolean)||all(d,41).some(Boolean))warnings.add('Polyline start/end/constant widths are rendered as centerlines.');return {...base,points:vertices(d),closed:!!(num(d,70)&1)};
      case 'POLYLINE':if(num(d,70)&(16|64)){warnings.add('Polygon meshes and polyface meshes are not supported.');return null;}return {...base,type:'LWPOLYLINE',points:[],closed:!!(num(d,70)&1)};
      case 'ELLIPSE':return {...base,center:pos(d),major:pos(d,11),ratio:num(d,40,1),start:num(d,41),end:num(d,42,TAU)};
      case 'SPLINE':if(!vertices(d).length)warnings.add('Fit-point-only splines are displayed as fit-point polylines.');return {...base,degree:num(d,71,3),knots:all(d,40),weights:all(d,41),controlPoints:vertices(d),fitPoints:vertices(d,11),flags:num(d,70)};
      case 'TEXT':case 'MTEXT':case 'ATTRIB':case 'ATTDEF':{const alignCode=num(d,72),attachment=num(d,71,1);if((t==='MTEXT')&&/\\[A-Za-z]/.test(get(d,1,'')))warnings.add('MTEXT formatting is reduced to plain text; fonts use browser sans-serif.');return {...base,type:t==='MTEXT'?'MTEXT':'TEXT',position:t==='MTEXT'||alignCode===0?pos(d):pos(d,11),text:cleanText(d.filter(([c])=>c===3||c===1).map(([,v])=>v).join('')),height:num(d,40,100),rotation:get(d,50)!==null?num(d,50)*RAD:t==='MTEXT'&&get(d,11)!==null?Math.atan2(num(d,21),num(d,11)):0,align:t==='MTEXT'?['left','center','right'][(attachment-1)%3]:alignCode===1?'center':alignCode===2?'right':'left'};}
      case 'SOLID':case 'TRACE':case '3DFACE':return {...base,type:'SOLID',points:[pos(d),pos(d,11),pos(d,13),pos(d,12)]};
      case 'INSERT':return {...base,name:get(d,2,''),position:pos(d),sx:num(d,41,1),sy:num(d,42,1),rotation:num(d,50)*RAD,cols:Math.max(1,num(d,70,1)),rows:Math.max(1,num(d,71,1)),colSpace:num(d,44),rowSpace:num(d,45)};
      case 'DIMENSION':{
        const kind=num(d,70)&7;warnings.add('Dimension graphics are regenerated; original dimension styles and overrides are not preserved.');
        if(kind===0||kind===1){const a=pos(d,13),b=pos(d,14),def=pos(d),rot=num(d,50)*RAD;
          if(kind===0){const vertical=Math.abs(Math.sin(rot))>.707;return {...base,a,b,orientation:vertical?'vertical':'horizontal',offset:vertical?def.x:def.y,height:Math.max(distance(a,b)*.015,1),text:get(d,1,'<>')};}
          const v={x:b.x-a.x,y:b.y-a.y},offset=(v.x*(def.y-a.y)-v.y*(def.x-a.x))/(distance(a,b)||1);return {...base,a,b,orientation:'aligned',offset,height:Math.max(distance(a,b)*.015,1),text:get(d,1,'<>')};
        }
        const name=get(d,2);if(name&&blocks.has(name)){warnings.add('Nonlinear dimensions are imported as exploded display geometry.');return {...base,type:'INSERT',name,position:point(),sx:1,sy:1,rotation:0,cols:1,rows:1,colSpace:0,rowSpace:0};}
        warnings.add('A dimension without a supported type or display block was skipped.');return null;
      }
      case 'HATCH':{
        const boundaries=[];let i=d.findIndex(([c])=>c===91)+1;
        const count=num(d,91);if(count>10000)throw new Error('HATCH has too many boundaries.');
        for(let loop=0;loop<count&&i>0&&i<d.length;loop++){
          while(i<d.length&&d[i][0]!==92)i++;if(i>=d.length)break;const flags=Number(d[i++][1]);
          if(flags&2){while(i<d.length&&d[i][0]!==93)i++;const n=Number(d[i++]?.[1]??0),pts=[];for(let k=0;k<n&&i<d.length;k++){while(i<d.length&&d[i][0]!==10)i++;if(i>=d.length)break;const p=point(Number(d[i++][1]),0);if(d[i]?.[0]===20)p.y=Number(d[i++][1]);if(d[i]?.[0]===42)p.bulge=Number(d[i++][1]);pts.push(p);}const g=geometry({type:'LWPOLYLINE',points:pts,closed:true},.1);if(g.paths[0])boundaries.push(g.paths[0]);}
          else {warnings.add('Edge-based HATCH boundaries are skipped; polyline HATCH boundaries are supported.');while(i<d.length&&d[i][0]!==92&&d[i][0]!==75)i++;}
        }
        if(!boundaries.length)return null;
        if(num(d,70)!==1&&get(d,2)!=='ANSI31')warnings.add('Non-solid hatch patterns are approximated with diagonal hatching.');
        return {...base,boundaries,pattern:num(d,70)===1?'SOLID':'ANSI31'};
      }
      case 'VERTEX':case 'SEQEND':return null;
      default:unsupported[t]=(unsupported[t]??0)+1;return null;
    }
  }
  const entities=[];
  function process(list,matrix=null,inheritedLayer=null,inheritedColor=null,stack=[]){
    let poly=null;
    for(const r of list){
      if(r.type==='VERTEX'&&poly){const p=pos(r.data);p.bulge=num(r.data,42);poly.points.push(p);continue;}
      if(poly){emit(poly,matrix,inheritedLayer,inheritedColor,stack);poly=null;}
      if(r.type==='SEQEND')continue;
      const e=parseEntity(r);if(!e)continue;if(r.type==='POLYLINE'){poly=e;continue;}emit(e,matrix,inheritedLayer,inheritedColor,stack);
    }
    if(poly)emit(poly,matrix,inheritedLayer,inheritedColor,stack);
  }
  function emit(e,matrix,inheritedLayer,inheritedColor,stack){
    if(e.layer==='0'&&inheritedLayer)e.layer=inheritedLayer;if(e.color==='BYBLOCK')e.color=inheritedColor??'BYLAYER';
    if(e.type==='INSERT'){
      const block=blocks.get(e.name);if(!block){warnings.add(`Missing block definition: ${e.name}`);return;}
      if(stack.includes(e.name)||stack.length>=16){warnings.add(`Recursive / deeply nested block skipped: ${e.name}`);return;}
      if(e.rows*e.cols>10000)throw new Error('An INSERT array exceeds the 10,000-instance limit.');
      for(let row=0;row<e.rows;row++)for(let col=0;col<e.cols;col++){
        const c=Math.cos(e.rotation),s=Math.sin(e.rotation),local=multiplyMatrix([c*e.sx,s*e.sx,-s*e.sy,c*e.sy,e.position.x+c*col*e.colSpace-s*row*e.rowSpace,e.position.y+s*col*e.colSpace+c*row*e.rowSpace],translation(-block.base.x,-block.base.y));
        process(block.records,matrix?multiplyMatrix(matrix,local):local,e.layer,e.color,[...stack,e.name]);
      }
      warnings.add('INSERT blocks are expanded into editable entities; block identity is not retained.');if(Math.abs(Math.abs(e.sx)-Math.abs(e.sy))>1e-8)warnings.add('Curves inside nonuniformly scaled INSERTs may be tessellated into polylines.');return;
    }
    if(entities.length>=250000)throw new Error('This build limits imports to 250,000 expanded entities.');
    const result=matrix?transformEntity(e,matrix):e;delete result.handle;entities.push(result);
    if(!layers.some(l=>l.name===result.layer))layers.push({name:result.layer,color:'#dce3eb',visible:true,locked:false,lineweight:.25,linetype:'CONTINUOUS'});
  }
  process(entityRecords);
  for(const [type,count]of Object.entries(unsupported))warnings.add(`${count} unsupported ${type} ${count===1?'entity':'entities'} skipped.`);
  function headerValue(name,code,f){const start=header.findIndex(([c,v])=>c===9&&v.trim()===name);if(start<0)return f;for(let i=start+1;i<header.length&&header[i][0]!==9;i++)if(header[i][0]===code)return header[i][1];return f;}
  return {entities,layers,units:Number(headerValue('$INSUNITS',70,4)),version:headerValue('$ACADVER',1,'Unknown'),warnings:[...warnings],unsupported,sourceCounts};
}

/** ASCII DXF R2013 export. Dimensions include generated anonymous display blocks. */
export function writeDXF(document){
  const entities=Array.isArray(document.entities)?document.entities:[...document.entities.values()],layers=document.layers??[];
  const out=[];let handle=0x100;
  const p=(c,v)=>{if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Cannot export non-finite geometry.');out.push(String(c),typeof v==='number'?String(Number(v.toFixed(10))):String(v??''));};
  const h=()=> (++handle).toString(16).toUpperCase();
  const pt=(c,v)=>{p(c,v.x);p(c+10,v.y);p(c+20,0);};
  const section=name=>{p(0,'SECTION');p(2,name);};const end=()=>p(0,'ENDSEC');
  const dimBlocks=new Map();for(const e of entities)if(e.type==='DIMENSION')dimBlocks.set(e.id,{name:`*D${dimBlocks.size+1}`,handle:h()});
  const modelRecord=h(),paperRecord=h();
  section('HEADER');p(9,'$ACADVER');p(1,'AC1027');p(9,'$DWGCODEPAGE');p(3,'ANSI_1252');p(9,'$INSUNITS');p(70,document.units??4);p(9,'$MEASUREMENT');p(70,1);p(9,'$LUNITS');p(70,2);p(9,'$LUPREC');p(70,3);end();
  section('TABLES');
  const table=(name,n)=>{p(0,'TABLE');p(2,name);p(5,h());p(100,'AcDbSymbolTable');p(70,n);};
  table('LTYPE',3);for(const [name,desc,pattern]of[['CONTINUOUS','Solid line',[]],['DASHED','Dashed line',[12,-6]],['CENTER','Center line',[20,-5,3,-5]]]){p(0,'LTYPE');p(5,h());p(100,'AcDbSymbolTableRecord');p(100,'AcDbLinetypeTableRecord');p(2,name);p(70,0);p(3,desc);p(72,65);p(73,pattern.length);p(40,pattern.reduce((s,x)=>s+Math.abs(x),0));for(const length of pattern){p(49,length);p(74,0);}}p(0,'ENDTAB');
  const allLayers=layers.some(l=>l.name==='0')?layers:[{name:'0',color:'#ffffff',visible:true,locked:false},...layers];
  table('LAYER',allLayers.length);for(const layer of allLayers){p(0,'LAYER');p(5,h());p(100,'AcDbSymbolTableRecord');p(100,'AcDbLayerTableRecord');p(2,layer.name);p(70,layer.locked?4:0);p(62,layer.visible===false?-7:7);p(420,parseInt(layer.color?.replace('#','')??'ffffff',16));p(6,['DASHED','CENTER'].includes(layer.linetype)?layer.linetype:'CONTINUOUS');p(370,Math.round((layer.lineweight??.25)*100));}p(0,'ENDTAB');
  table('STYLE',1);p(0,'STYLE');p(5,h());p(100,'AcDbSymbolTableRecord');p(100,'AcDbTextStyleTableRecord');p(2,'STANDARD');p(70,0);p(40,0);p(41,1);p(50,0);p(71,0);p(42,100);p(3,'txt');p(4,'');p(0,'ENDTAB');
  table('DIMSTYLE',1);p(100,'AcDbDimStyleTable');p(0,'DIMSTYLE');p(105,h());p(100,'AcDbSymbolTableRecord');p(100,'AcDbDimStyleTableRecord');p(2,'STANDARD');p(70,0);p(40,1);p(41,50);p(140,90);p(147,30);p(271,0);p(0,'ENDTAB');
  table('BLOCK_RECORD',dimBlocks.size+2);for(const [name,handle]of[['*Model_Space',modelRecord],['*Paper_Space',paperRecord],...[...dimBlocks.values()].map(b=>[b.name,b.handle])]){p(0,'BLOCK_RECORD');p(5,handle);p(100,'AcDbSymbolTableRecord');p(100,'AcDbBlockTableRecord');p(2,name);p(70,0);}p(0,'ENDTAB');end();
  function common(e,type=e.type,owner=modelRecord){p(0,type);p(5,h());p(330,owner);p(100,'AcDbEntity');p(8,e.layer??'0');if(e.invisible)p(60,1);if(e.color&&e.color!=='BYLAYER'&&e.color!=='BYBLOCK')p(420,parseInt(e.color.replace('#',''),16));if(e.linetype&&e.linetype!=='BYLAYER')p(6,['DASHED','CENTER'].includes(e.linetype)?e.linetype:'CONTINUOUS');if(e.lineweight>=0)p(370,e.lineweight);}
  function emit(e,owner=modelRecord){
    switch(e.type){
      case 'LINE':common(e,'LINE',owner);p(100,'AcDbLine');pt(10,e.a);pt(11,e.b);break;
      case 'POINT':common(e,'POINT',owner);p(100,'AcDbPoint');pt(10,e.position);break;
      case 'CIRCLE':case 'ARC':common(e,e.type,owner);p(100,'AcDbCircle');pt(10,e.center);p(40,e.radius);if(e.type==='ARC'){p(100,'AcDbArc');p(50,normalizeAngle(e.start)/RAD);p(51,normalizeAngle(e.end)/RAD);}break;
      case 'LWPOLYLINE':case 'POLYLINE':common(e,'LWPOLYLINE',owner);p(100,'AcDbPolyline');p(90,e.points.length);p(70,e.closed?1:0);for(const v of e.points){p(10,v.x);p(20,v.y);if(v.bulge)p(42,v.bulge);}break;
      case 'ELLIPSE':common(e,'ELLIPSE',owner);p(100,'AcDbEllipse');pt(10,e.center);pt(11,e.major);p(40,e.ratio);p(41,e.start??0);p(42,e.end??TAU);break;
      case 'SPLINE':{const cp=e.controlPoints??[],fp=e.fitPoints??[];common(e,'SPLINE',owner);p(100,'AcDbSpline');p(70,e.flags??0);p(71,e.degree??3);p(72,e.knots?.length??0);p(73,cp.length);p(74,fp.length);for(const k of e.knots??[])p(40,k);for(const w of e.weights??[])p(41,w);for(const v of cp)pt(10,v);for(const v of fp)pt(11,v);break;}
      case 'TEXT':case 'MTEXT':{
        const multi=e.type==='MTEXT'||String(e.text).includes('\n');common(e,multi?'MTEXT':'TEXT',owner);p(100,multi?'AcDbMText':'AcDbText');pt(10,e.position);p(40,e.height??100);const txt=String(e.text).replace(/\r/g,'').replace(/\n/g,'\\P');
        if(multi){p(41,0);p(71,e.align==='center'?8:e.align==='right'?9:7);let i=0;while(txt.length-i>240){p(3,txt.slice(i,i+240));i+=240;}p(1,txt.slice(i));p(50,(e.rotation??0)/RAD);p(7,'STANDARD');}
        else {p(1,txt);p(50,(e.rotation??0)/RAD);p(7,'STANDARD');p(72,e.align==='center'?1:e.align==='right'?2:0);pt(11,e.position);p(100,'AcDbText');p(73,0);}break;
      }
      case 'SOLID':{common(e,'SOLID',owner);p(100,'AcDbTrace');const ps=e.points??e.boundaries?.[0]??[];if(ps.length<3)break;pt(10,ps[0]);pt(11,ps[1]);pt(12,ps[3]??ps[2]);pt(13,ps[2]);break;}
      case 'HATCH':{
        const boundaries=e.boundaries??[e.points],solid=e.pattern==='SOLID';common(e,'HATCH',owner);p(100,'AcDbHatch');pt(10,point());p(210,0);p(220,0);p(230,1);p(2,solid?'SOLID':'ANSI31');p(70,solid?1:0);p(71,0);p(91,boundaries.length);
        for(let ps of boundaries){if(ps.length>1&&distance(ps[0],ps.at(-1))<1e-8)ps=ps.slice(0,-1);p(92,2);p(72,0);p(73,1);p(93,ps.length);for(const v of ps){p(10,v.x);p(20,v.y);}p(97,0);}p(75,0);p(76,1);if(!solid){p(52,0);p(41,1);p(77,0);p(78,1);p(53,45);p(43,0);p(44,0);p(45,-70.710678);p(46,70.710678);p(79,0);}p(98,0);break;
      }
      case 'DIMENSION':{
        const block=dimBlocks.get(e.id),aligned=e.orientation!=='horizontal'&&e.orientation!=='vertical',v={x:e.b.x-e.a.x,y:e.b.y-e.a.y},len=distance(e.a,e.b)||1,def=aligned?point(e.b.x-v.y/len*e.offset,e.b.y+v.x/len*e.offset):e.orientation==='horizontal'?point(e.b.x,e.offset):point(e.offset,e.b.y);
        common(e,'DIMENSION',owner);p(100,'AcDbDimension');p(2,block.name);pt(10,def);pt(11,point((e.a.x+e.b.x)/2,(e.a.y+e.b.y)/2));p(70,aligned?33:32);p(1,e.text??'<>');p(3,'STANDARD');p(100,'AcDbAlignedDimension');pt(13,e.a);pt(14,e.b);if(!aligned){p(50,e.orientation==='vertical'?90:0);p(100,'AcDbRotatedDimension');}break;
      }
      default:throw new Error(`Cannot export unsupported entity type ${e.type}.`);
    }
  }
  section('BLOCKS');
  function blockStart(name,owner){p(0,'BLOCK');p(5,h());p(330,owner);p(100,'AcDbEntity');p(8,'0');p(100,'AcDbBlockBegin');p(2,name);p(70,name.startsWith('*D')?1:0);pt(10,point());p(3,name);p(1,'');}
  function blockEnd(owner){p(0,'ENDBLK');p(5,h());p(330,owner);p(100,'AcDbEntity');p(8,'0');p(100,'AcDbBlockEnd');}
  for(const [name,owner]of[['*Model_Space',modelRecord],['*Paper_Space',paperRecord]]){blockStart(name,owner);blockEnd(owner);}
  for(const e of entities)if(e.type==='DIMENSION'){const b=dimBlocks.get(e.id);blockStart(b.name,b.handle);const g=geometry(e,.1);for(const path of g.paths)for(let i=1;i<path.length;i++)emit({...e,type:'LINE',a:path[i-1],b:path[i]},b.handle);for(const t of g.texts)emit({...e,...t,type:'TEXT'},b.handle);blockEnd(b.handle);}end();
  section('ENTITIES');for(const e of entities)emit(e);end();p(0,'EOF');return out.join('\r\n')+'\r\n';
}
