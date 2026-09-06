import {geometry,emptyBounds,unionBounds,validBounds,point,SpatialIndex,overlaps} from './geometry.js';
const SHADER=`
struct Camera { center:vec2f, viewport:vec2f, scale:f32, dpr:f32, pad:vec2f };
@group(0) @binding(0) var<uniform> camera:Camera;
struct In { @location(0) a:vec2f,@location(1) b:vec2f,@location(2) color:vec4f,@location(3) width:f32,@location(4) dash:f32 };
struct Out { @builtin(position) position:vec4f,@location(0) color:vec4f,@location(1) local:vec2f,@location(2) @interpolate(flat) len:f32,@location(3) @interpolate(flat) halfWidth:f32,@location(4) @interpolate(flat) dash:f32 };
@vertex fn vs(input:In,@builtin(vertex_index) vertex:u32)->Out {
  let corners=array<vec2f,6>(vec2f(0.,-1.),vec2f(1.,-1.),vec2f(0.,1.),vec2f(0.,1.),vec2f(1.,-1.),vec2f(1.,1.));
  let a=(input.a-camera.center)*camera.scale;let b=(input.b-camera.center)*camera.scale;
  let delta=b-a;let len=max(length(delta),0.001);let tangent=delta/len;let normal=vec2f(-tangent.y,tangent.x);
  let halfWidth=max(input.width*.5,.4);let radius=halfWidth+1.;let corner=corners[vertex];
  let along=mix(-radius,len+radius,corner.x);let side=corner.y*radius;
  let p=a+tangent*along+normal*side;
  var out:Out;out.position=vec4f(p/camera.viewport*2.,0.,1.);out.color=input.color;out.local=vec2f(along,side);out.len=len;out.halfWidth=halfWidth;out.dash=input.dash;return out;
}
@fragment fn fs(input:Out)->@location(0) vec4f {
  let outside=max(max(-input.local.x,input.local.x-input.len),0.);
  let dist=length(vec2f(outside,input.local.y));
  var coverage=1.-smoothstep(input.halfWidth-.55,input.halfWidth+.55,dist);
  if(input.dash>0.) { let phase=input.local.x-floor(input.local.x/input.dash)*input.dash;coverage*=1.-smoothstep(input.dash*.64-.6,input.dash*.64+.6,phase); }
  return vec4f(input.color.rgb,input.color.a*coverage);
}`;
const hexRgb=h=>{const s=h?.replace('#','')??'dce3eb';return [parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,1];};
export class CADRenderer {
  constructor({grid,gpu,cpu,overlay,onStatus}){
    this.grid=grid;this.gpu=gpu;this.cpu=cpu;this.overlay=overlay;this.onStatus=onStatus;
    this.gridContext=grid.getContext('2d');this.cpuContext=cpu.getContext('2d');this.overlayContext=overlay.getContext('2d');
    this.camera={x:7400,y:5000,scale:.05};this.origin=point();this.width=1;this.height=1;this.dpr=1;
    this.mode='Canvas 2D';this.device=null;this.records=[];this.index=new SpatialIndex();this.bounds=emptyBounds();this.lineCount=0;this.dark=true;this.showGrid=true;this.paper=false;this.lineweight=false;
    this.queued=false;this.needsBuild=true;this.buildScale=0;this.frameMs=0;this.beforeOverlay=null;this.ready=this.init();
  }
  async init(){
    try{
      if(!navigator.gpu)throw new Error('WebGPU is unavailable in this browser.');
      if(new URLSearchParams(location.search).has('fallback'))throw new Error('Canvas fallback selected.');
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No WebGPU adapter available.');
      this.device=await adapter.requestDevice();this.context=this.gpu.getContext('webgpu');if(!this.context)throw new Error('Cannot create a WebGPU canvas.');
      this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device:this.device,format:this.format,alphaMode:'premultiplied'});
      const module=this.device.createShaderModule({code:SHADER});const info=await module.getCompilationInfo();const errors=info.messages.filter(x=>x.type==='error');if(errors.length)throw new Error(errors.map(x=>x.message).join('; '));
      this.pipeline=await this.device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vs',buffers:[{arrayStride:40,stepMode:'instance',attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x2'},{shaderLocation:2,offset:16,format:'float32x4'},{shaderLocation:3,offset:32,format:'float32'},{shaderLocation:4,offset:36,format:'float32'}]}]},fragment:{module,entryPoint:'fs',targets:[{format:this.format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'}});
      this.uniform=this.device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
      this.mode='WebGPU';this.gpu.hidden=false;this.cpu.hidden=true;this.onStatus?.(this.mode);
      this.device.addEventListener('uncapturederror',e=>this.fail(e.error.message));
      this.device.lost.then(info=>this.fail('GPU device lost: '+info.message));
      this.needsBuild=true;this.invalidate();
    }catch(e){this.fail(e.message);}
  }
  fail(reason){this.mode='Canvas 2D';this.gpu.hidden=true;this.cpu.hidden=false;this.onStatus?.(this.mode,reason);this.invalidate();}
  resize(w,h){this.width=Math.max(1,w);this.height=Math.max(1,h);this.dpr=Math.min(devicePixelRatio||1,2.5);for(const canvas of[this.grid,this.gpu,this.cpu,this.overlay]){canvas.width=Math.round(this.width*this.dpr);canvas.height=Math.round(this.height*this.dpr);canvas.style.width=this.width+'px';canvas.style.height=this.height+'px';}this.invalidate();}
  worldToScreen(p){return {x:(p.x-this.camera.x)*this.camera.scale+this.width/2,y:this.height/2-(p.y-this.camera.y)*this.camera.scale};}
  screenToWorld(p){return {x:(p.x-this.width/2)/this.camera.scale+this.camera.x,y:(this.height/2-p.y)/this.camera.scale+this.camera.y};}
  zoomAt(screen,factor){const p=this.screenToWorld(screen);this.camera.scale=Math.max(1e-7,Math.min(1e6,this.camera.scale*factor));const q=this.screenToWorld(screen);this.camera.x+=p.x-q.x;this.camera.y+=p.y-q.y;this.invalidate();}
  fit(bounds=this.bounds,padding=.94){if(!validBounds(bounds))return;const w=Math.max(1,bounds.maxX-bounds.minX),h=Math.max(1,bounds.maxY-bounds.minY);this.camera.x=(bounds.minX+bounds.maxX)/2;this.camera.y=(bounds.minY+bounds.maxY)/2;this.camera.scale=Math.min(Math.max(120,this.width-100)/w,Math.max(100,this.height-154)/h)*padding;this.camera.y-=22/this.camera.scale;this.invalidate();}
  setDocument(model){this.model=model;this.needsBuild=true;this.invalidate();}
  visibleBounds(){const a=this.screenToWorld(point(0,this.height)),b=this.screenToWorld(point(this.width,0));return {minX:a.x,minY:a.y,maxX:b.x,maxY:b.y};}
  color(e){const color=e.color&&e.color!=='BYLAYER'&&e.color!=='BYBLOCK'?e.color:this.model?.layer(e.layer)?.color??'#dce3eb';if(!this.dark&&['#ffffff','#dce3eb','#e2e6eb','#e8edf1','#f0f3f6'].includes(color.toLowerCase()))return '#303f4c';return color;}
  rebuild(){
    if(!this.model)return;this.records=[];this.bounds=emptyBounds();const tolerance=.3/this.camera.scale;this.buildScale=this.camera.scale;
    for(const e of this.model.entities.values()){const layer=this.model.layer(e.layer);if(layer?.visible===false||e.invisible)continue;const g=geometry(e,tolerance);if(!validBounds(g.bounds))continue;unionBounds(this.bounds,g.bounds);const type=e.linetype==='BYLAYER'||!e.linetype?layer?.linetype:e.linetype,dashed=type&&!['BYLAYER','CONTINUOUS','ByLayer','Continuous'].includes(type);const width=this.lineweight?Math.max(1,(e.lineweight>=0?e.lineweight/100:layer?.lineweight??.25)*4):e.type==='DIMENSION'?.85:e.layer.includes('WALL')?1.3:1.05;this.records.push({entity:e,...g,color:this.color(e),width,dash:dashed?14:0});}
    this.index=new SpatialIndex(this.records);this.origin=point(this.camera.x,this.camera.y);
    let count=0;for(const r of this.records)for(const path of r.paths)count+=Math.max(0,path.length-1);
    this.lineCount=count;this.data=new Float32Array(count*10);let at=0;
    for(const r of this.records){const rgb=hexRgb(r.color);for(const path of r.paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];this.data.set([a.x-this.origin.x,a.y-this.origin.y,b.x-this.origin.x,b.y-this.origin.y,...rgb,r.width,r.dash],at);at+=10;}}
    if(this.mode==='WebGPU'){
      const size=Math.max(this.data.byteLength,40);
      if(!this.buffer||this.buffer.size<size){this.buffer?.destroy();this.buffer=this.device.createBuffer({size:Math.max(256,Math.ceil(size*1.25/256)*256),usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
      if(this.data.byteLength)this.device.queue.writeBuffer(this.buffer,0,this.data);
    }
    this.needsBuild=false;
  }
  invalidate(){if(this.queued)return;this.queued=true;requestAnimationFrame(()=>{this.queued=false;try{this.render();}catch(e){console.error(e);if(this.mode==='WebGPU')this.fail(e.message);}});}
  prepare(ctx){ctx.setTransform(this.dpr,0,0,this.dpr,0,0);ctx.clearRect(0,0,this.width,this.height);}
  gridStep(){const target=30/this.camera.scale,power=10**Math.floor(Math.log10(target)),ratio=target/power;return (ratio<2?2:ratio<5?5:10)*power;}
  renderGrid(){
    const ctx=this.gridContext;this.prepare(ctx);ctx.fillStyle=this.dark?'#171e24':'#fafaf7';ctx.fillRect(0,0,this.width,this.height);
    if(this.showGrid&&!this.paper){const step=this.gridStep(),bounds=this.visibleBounds(),spacing=step*this.camera.scale;ctx.fillStyle=this.dark?'#303941':'#d7dce0';for(let x=Math.ceil(bounds.minX/step)*step;x<=bounds.maxX;x+=step)for(let y=Math.ceil(bounds.minY/step)*step;y<=bounds.maxY;y+=step){const p=this.worldToScreen(point(x,y));ctx.fillRect(Math.round(p.x),Math.round(p.y),1,1);}if(spacing>18){ctx.strokeStyle=this.dark?'#202a32':'#edf0f0';ctx.lineWidth=.6;ctx.beginPath();for(let x=Math.ceil(bounds.minX/(step*5))*step*5;x<=bounds.maxX;x+=step*5){const p=this.worldToScreen(point(x,0));ctx.moveTo(p.x,0);ctx.lineTo(p.x,this.height);}for(let y=Math.ceil(bounds.minY/(step*5))*step*5;y<=bounds.maxY;y+=step*5){const p=this.worldToScreen(point(0,y));ctx.moveTo(0,p.y);ctx.lineTo(this.width,p.y);}ctx.stroke();}}
    const bounds=this.visibleBounds();for(const r of this.records){if(!r.fills.length||!overlaps(bounds,r.bounds))continue;
      ctx.save();ctx.beginPath();for(const fill of r.fills){fill.points.forEach((p,i)=>{const q=this.worldToScreen(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.closePath();}
      ctx.fillStyle=r.color+'24';ctx.fill('evenodd');if(r.fills.some(f=>f.pattern!=='SOLID')){ctx.clip('evenodd');ctx.strokeStyle=r.color+'80';ctx.lineWidth=.7;ctx.beginPath();const a=this.worldToScreen(point(r.bounds.minX,r.bounds.maxY)),b=this.worldToScreen(point(r.bounds.maxX,r.bounds.minY)),x0=Math.max(-this.height,a.x-this.height),x1=Math.min(this.width+this.height,b.x+this.height),top=Math.max(0,a.y),bottom=Math.min(this.height,b.y);for(let x=x0;x<x1;x+=9){ctx.moveTo(x,top);ctx.lineTo(x-(bottom-top),bottom);}ctx.stroke();}ctx.restore();
    }
  }
  renderGPU(){const d=this.device;d.queue.writeBuffer(this.uniform,0,new Float32Array([this.camera.x-this.origin.x,this.camera.y-this.origin.y,this.width,this.height,this.camera.scale,this.dpr,0,0]));const encoder=d.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:0,g:0,b:0,a:0},loadOp:'clear',storeOp:'store'}]});if(this.lineCount){pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.buffer);pass.draw(6,this.lineCount);}pass.end();d.queue.submit([encoder.finish()]);}
  renderCPU(){const ctx=this.cpuContext;this.prepare(ctx);const bounds=this.visibleBounds(),batches=new Map();for(const r of this.index.query(bounds)){const key=r.color+'|'+r.width+'|'+r.dash;if(!batches.has(key))batches.set(key,{...r,allPaths:[]});batches.get(key).allPaths.push(...r.paths);}for(const r of batches.values()){ctx.strokeStyle=r.color;ctx.lineWidth=r.width;ctx.setLineDash(r.dash?[r.dash*.64,r.dash*.36]:[]);ctx.beginPath();for(const path of r.allPaths)path.forEach((p,i)=>{const q=this.worldToScreen(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.stroke();}ctx.setLineDash([]);}
  renderText(ctx){const bounds=this.visibleBounds();for(const r of this.index.query(bounds))for(const t of r.texts){const height=t.height*this.camera.scale;if(height<3)continue;const p=this.worldToScreen(t.position);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-(t.rotation??0));ctx.font=`${Math.max(.1,height)}px "Arial",sans-serif`;ctx.textAlign=t.align??'left';ctx.textBaseline='alphabetic';ctx.fillStyle=r.color;String(t.text).split('\n').forEach((line,i)=>ctx.fillText(line,0,i*height*(t.lineSpacing??1.3)));ctx.restore();}}
  render(){const start=performance.now();if(this.needsBuild||this.camera.scale/this.buildScale>2||this.camera.scale/this.buildScale<.45)this.rebuild();this.renderGrid();if(this.mode==='WebGPU')this.renderGPU();else this.renderCPU();const ctx=this.overlayContext;this.prepare(ctx);this.renderText(ctx);this.beforeOverlay?.(ctx);this.frameMs=performance.now()-start;this.onFrame?.({milliseconds:this.frameMs,segments:this.lineCount,entities:this.records.length});}
}
