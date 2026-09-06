import {clone,id} from './geometry.js';
/** Transactional document: delta-based history, stable entity ids, no renderer-owned model state. */
export class DocumentModel extends EventTarget {
  constructor(document={}){super();this.history=[];this.future=[];this.revision=0;this.load(document);}
  load(document={}){
    this.name=document.name??'Untitled.dxf';this.units=document.units??4;
    this.layers=clone(document.layers??[{name:'0',color:'#dce3eb',visible:true,locked:false,lineweight:.25,linetype:'CONTINUOUS'}]);
    this.entities=new Map((document.entities??[]).map(e=>{const entity={color:'BYLAYER',linetype:'BYLAYER',...clone(e),id:e.id??id()};return [entity.id,entity];}));
    this.activeLayer=this.layers.find(l=>l.visible&&!l.locked)?.name??'0';this.history=[];this.future=[];this.revision++;this.emit('Load drawing');
  }
  emit(label){this.dispatchEvent(new CustomEvent('change',{detail:{label,revision:this.revision}}));}
  commit(label,{add=[],remove=[],update=[],layers=null}={}){
    const removed=remove.map(key=>this.entities.get(key)).filter(Boolean).map(clone),before=update.map(e=>this.entities.get(e.id)).filter(Boolean).map(clone),after=update.filter(e=>this.entities.has(e.id)).map(clone);
    const added=add.map(e=>({...clone(e),id:e.id??id()}));if(!added.length&&!removed.length&&!after.length&&!layers)return false;
    const tx={label,added,removed,before,after,layersBefore:layers?clone(this.layers):null,layersAfter:layers?clone(layers):null};
    this.apply(tx,false);this.history.push(tx);if(this.history.length>100)this.history.shift();this.future=[];return true;
  }
  apply(tx,reverse){
    for(const e of reverse?tx.added:tx.removed)this.entities.delete(e.id);
    for(const e of reverse?[...tx.removed,...tx.before]:[...tx.added,...tx.after])this.entities.set(e.id,clone(e));
    const layers=reverse?tx.layersBefore:tx.layersAfter;if(layers)this.layers=clone(layers);
    if(!this.layers.some(l=>l.name===this.activeLayer))this.activeLayer=this.layers[0]?.name??'0';
    this.revision++;this.emit((reverse?'Undo: ':'')+tx.label);
  }
  undo(){const tx=this.history.pop();if(!tx)return false;this.apply(tx,true);this.future.push(tx);return true;}
  redo(){const tx=this.future.pop();if(!tx)return false;this.apply(tx,false);this.history.push(tx);return true;}
  layer(name){return this.layers.find(l=>l.name===name)??this.layers[0];}
  editable(entity){const layer=this.layer(entity.layer);return !entity.invisible&&layer?.visible!==false&&!layer?.locked;}
  serialize(){return {format:'draftline',version:1,name:this.name,units:this.units,layers:clone(this.layers),entities:[...this.entities.values()].map(clone)};}
}
