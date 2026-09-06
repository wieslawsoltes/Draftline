import {id,point,TAU,transformEntity,rotation,translation} from './geometry.js';
export function createDemo(){
  const layers=[
    {name:'A-WALL',color:'#e2e6eb',lineweight:.35},
    {name:'A-DOOR',color:'#c9aa7b',lineweight:.18},
    {name:'A-GLAZING',color:'#81bbd0',lineweight:.18},
    {name:'A-FURNITURE',color:'#9dac9e',lineweight:.18},
    {name:'A-FIXTURES',color:'#a6b4bd',lineweight:.18},
    {name:'A-ANNOTATION',color:'#d4dde3',lineweight:.18},
    {name:'A-DIMENSION',color:'#82abbf',lineweight:.13},
    {name:'A-LANDSCAPE',color:'#71997c',lineweight:.13},
    {name:'A-SITE',color:'#626f79',lineweight:.13,linetype:'DASHED'},
    {name:'A-HATCH',color:'#a8b3bf',lineweight:.13}
  ].map(l=>({visible:true,locked:false,linetype:'CONTINUOUS',...l}));
  const entities=[];
  const put=(e,layer='A-WALL')=>{const obj={id:id(),layer,color:'BYLAYER',linetype:'BYLAYER',...e};entities.push(obj);return obj;};
  const line=(x,y,X,Y,layer)=>put({type:'LINE',a:point(x,y),b:point(X,Y)},layer);
  const poly=(pts,closed=true,layer='A-WALL')=>put({type:'LWPOLYLINE',points:pts.map(p=>Array.isArray(p)?point(...p):p),closed},layer);
  const rect=(x,y,w,h,layer)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],true,layer);
  const circle=(x,y,r,layer)=>put({type:'CIRCLE',center:point(x,y),radius:r},layer);
  const arc=(x,y,r,s,e,layer)=>put({type:'ARC',center:point(x,y),radius:r,start:s*Math.PI/180,end:e*Math.PI/180},layer);
  const text=(x,y,s,height=115,layer='A-ANNOTATION',align='center')=>put({type:'TEXT',position:point(x,y),text:s,height,align,rotation:0},layer);
  const dim=(a,b,offset,orientation='horizontal')=>put({type:'DIMENSION',a:point(...a),b:point(...b),orientation,offset,height:100},'A-DIMENSION');
  const wall=(x,y,w,h)=>{rect(x,y,w,h);put({type:'HATCH',boundaries:[[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>point(...p))],pattern:'ANSI31'},'A-HATCH');};
  // A complete, editable architectural drawing, not an image or imported SVG.
  wall(0,0,14200,200);wall(0,200,200,9200);wall(14000,200,200,9200);wall(0,9400,14200,200);
  // Interior structure, with actual gaps for doors.
  wall(7500,200,160,1150);wall(7500,2250,160,2400);wall(7500,5550,160,3850);
  wall(200,5250,2200,160);wall(3300,5250,4200,160);
  wall(7660,5250,1600,160);wall(10160,5250,3840,160);
  wall(10300,5410,160,3990);
  wall(10300,200,160,2100);wall(10300,3200,160,2050);
  wall(10460,3300,1300,160);wall(12660,3300,1340,160);
  // Windows: precision frames on top of the wall linework.
  function window(x,y,w,vertical=false){const begin=entities.length;rect(x,y,w,200,'A-GLAZING');line(x,y+70,x+w,y+70,'A-GLAZING');line(x,y+130,x+w,y+130,'A-GLAZING');line(x+w/2,y,x+w/2,y+200,'A-GLAZING');if(vertical){const m=rotation(Math.PI/2,point(x,y));for(let i=begin;i<entities.length;i++)entities[i]=transformEntity(entities[i],m);}}
  window(1100,0,3400);window(5000,0,1400);window(8400,0,1200);window(11100,0,1800);window(1100,9400,2800);window(4500,9400,2100);window(8100,9400,1600);window(11100,9400,2100);window(200,1300,1800,true);window(200,6600,1800,true);window(14200,6200,1800,true);
  function door(x,y,r=900,rotationDegrees=0){const at=entities.length;line(x,y,x,y+r,'A-DOOR');line(x,y,x+r,y,'A-DOOR');arc(x,y,r,0,90,'A-DOOR');if(rotationDegrees){const m=rotation(rotationDegrees*Math.PI/180,point(x,y));for(let i=at;i<entities.length;i++)entities[i]=transformEntity(entities[i],m);}}
  door(7500,1350,900,90);door(7500,4650,900,90);door(2400,5410);door(9260,5410);door(10460,2300);door(11760,3460);
  // A carefully detailed kitchen.
  rect(350,5550,630,3300,'A-FIXTURES');rect(350,8750,4800,500,'A-FIXTURES');
  for(let x=950;x<5150;x+=600)line(x,8750,x,9250,'A-FIXTURES');
  rect(1550,8810,950,380,'A-FIXTURES');rect(1620,8870,370,250,'A-FIXTURES');rect(2060,8870,370,250,'A-FIXTURES');arc(2025,9100,95,0,180,'A-FIXTURES');
  rect(3880,8800,740,400,'A-FIXTURES');for(const x of[4060,4440])for(const y of[8890,9100])circle(x,y,72,'A-FIXTURES');
  rect(350,5590,600,1040,'A-FIXTURES');line(650,5590,650,6630,'A-FIXTURES');
  rect(2100,6650,2600,820,'A-FIXTURES');rect(2160,6710,2480,700,'A-FIXTURES');
  for(const x of[2500,3300,4100]){circle(x,6320,220,'A-FURNITURE');arc(x,6320,270,180,360,'A-FURNITURE');}
  // Dining table with six chairs.
  rect(5550,7050,1050,1700,'A-FURNITURE');
  for(const y of[7320,8100])for(const x of[5100,6660]){rect(x,y,370,470,'A-FURNITURE');line(x+60,y+60,x+310,y+60,'A-FURNITURE');}
  rect(5830,6550,470,400,'A-FURNITURE');rect(5830,8850,470,350,'A-FURNITURE');
  // Living room furniture, lounge and rug.
  const rug=rect(1550,1250,4550,2900,'A-FURNITURE');rug.linetype='DASHED';
  rect(1800,3350,3150,850,'A-FURNITURE');rect(1850,3400,3050,150,'A-FURNITURE');for(let i=0;i<3;i++)rect(1920+i*960,3570,920,550,'A-FURNITURE');
  rect(4600,1800,850,2100,'A-FURNITURE');rect(5150,1850,200,1960,'A-FURNITURE');
  rect(2550,2050,1550,720,'A-FURNITURE');rect(2610,2110,1430,600,'A-FURNITURE');circle(3650,2400,150,'A-FURNITURE');
  rect(650,2100,350,1900,'A-FIXTURES');line(820,2200,820,3900,'A-FIXTURES');
  rect(1650,1250,800,730,'A-FURNITURE');rect(1690,1300,720,120,'A-FURNITURE');
  circle(6100,3300,360,'A-FURNITURE');circle(6100,3300,300,'A-FURNITURE');
  // Bedrooms.
  function bed(x,y,w,h){rect(x,y,w,h,'A-FURNITURE');rect(x+40,y+40,w-80,h-80,'A-FURNITURE');rect(x+90,y+h-450,(w-270)/2,320,'A-FURNITURE');rect(x+w/2+45,y+h-450,(w-270)/2,320,'A-FURNITURE');line(x+40,y+h-560,x+w-40,y+h-560,'A-FURNITURE');rect(x-470,y+h-460,400,400,'A-FURNITURE');rect(x+w+70,y+h-460,400,400,'A-FURNITURE');}
  bed(8070,6850,1650,2200);bed(11200,6850,1850,2200);
  rect(7770,5540,2250,520,'A-FIXTURES');for(let x=8220;x<10020;x+=450)line(x,5540,x,6060,'A-FIXTURES');
  rect(13500,5650,400,3400,'A-FIXTURES');for(let y=6050;y<9050;y+=550)line(13500,y,13900,y,'A-FIXTURES');
  // Study / studio.
  rect(7900,3800,550,1300,'A-FURNITURE');rect(7950,4210,180,500,'A-FURNITURE');rect(8530,4140,500,600,'A-FURNITURE');arc(8800,4440,370,-65,65,'A-FURNITURE');
  rect(7750,350,550,1850,'A-FIXTURES');for(let y=750;y<2200;y+=400)line(7750,y,8300,y,'A-FIXTURES');
  rect(9350,350,760,1800,'A-FURNITURE');rect(9400,400,170,1700,'A-FURNITURE');
  // Bathroom fixtures.
  rect(12800,550,1030,2100,'A-FIXTURES');rect(12870,620,890,1960,'A-FIXTURES');circle(13320,2260,55,'A-FIXTURES');
  rect(10660,420,1580,600,'A-FIXTURES');put({type:'ELLIPSE',center:point(11450,740),major:point(350,0),ratio:.5,start:0,end:TAU},'A-FIXTURES');
  rect(10800,2600,700,480,'A-FIXTURES');put({type:'ELLIPSE',center:point(11150,2440),major:point(0,432),ratio:1/1.35,start:0,end:TAU},'A-FIXTURES');
  rect(10670,3650,1180,650,'A-FIXTURES');circle(10960,3975,220,'A-FIXTURES');circle(11550,3975,220,'A-FIXTURES');rect(12900,3650,800,1350,'A-FIXTURES');
  // Room labels, separated from furniture.
  text(3700,4530,'LIVING ROOM',155);text(3700,4290,'34.8 m²',92);
  text(3730,8030,'KITCHEN / DINING',145);text(3730,7800,'28.6 m²',92);
  text(8950,6430,'BEDROOM 02',115);text(8950,6220,'11.4 m²',86);
  text(12150,6430,'PRIMARY BEDROOM',115);text(12150,6220,'15.8 m²',86);
  text(9100,3110,'STUDIO',125);text(9100,2880,'12.2 m²',86);
  text(11750,1650,'BATHROOM',110);text(11750,1430,'8.9 m²',86);
  text(12150,4800,'UTILITY',110);text(12150,4580,'5.7 m²',86);
  // Deck, approach and planting.
  rect(500,-2000,6500,1800,'A-SITE');for(let y=-1800;y<-200;y+=160)line(550,y,6950,y,'A-SITE');
  for(let i=0;i<4;i++)rect(8600,-400-i*360,1600,260,'A-SITE');
  function plant(x,y,r){circle(x,y,r*.24,'A-LANDSCAPE');const pts=Array.from({length:80},(_,i)=>{const a=i/80*TAU,rr=r*(.88+.12*Math.sin(a*9));return point(x+rr*Math.cos(a),y+rr*Math.sin(a));});poly(pts,true,'A-LANDSCAPE');for(let i=0;i<7;i++){const a=i/7*TAU;arc(x+Math.cos(a)*r*.37,y+Math.sin(a)*r*.37,r*.5,a*180/Math.PI-70,a*180/Math.PI+120,'A-LANDSCAPE');}}
  plant(-1200,1000,650);plant(-1200,7900,820);plant(15400,7500,800);plant(15400,2100,680);plant(6500,-1350,320);plant(5700,-1350,320);
  rect(-2300,-2600,18800,13400,'A-SITE');
  // Dimensions at three scales.
  dim([0,9600],[14200,9600],10900);dim([0,9600],[7500,9600],10300);dim([7500,9600],[10460,9600],10300);dim([10460,9600],[14200,9600],10300);
  dim([0,0],[0,9600],-2750,'vertical');dim([14200,0],[14200,5250],14900,'vertical');dim([14200,5250],[14200,9600],14900,'vertical');
  dim([0,0],[7500,0],-650);dim([7500,0],[10460,0],-650);dim([10460,0],[14200,0],-650);
  // Drawing title, north arrow, scale bar.
  line(0,-3150,14200,-3150,'A-ANNOTATION');text(0,-3600,'MERIDIAN HOUSE',235,'A-ANNOTATION','left');text(0,-3900,'GROUND FLOOR PLAN  /  CONCEPT DESIGN',103,'A-DIMENSION','left');
  text(14200,-3570,'A — 101',195,'A-ANNOTATION','right');text(14200,-3890,'1:100  ·  ALL DIMENSIONS IN MILLIMETRES',85,'A-DIMENSION','right');
  line(15400,9800,15400,10550,'A-ANNOTATION');poly([[15240,10200],[15400,10550],[15560,10200]],false,'A-ANNOTATION');text(15400,10750,'N',140);
  for(let i=0;i<4;i++){rect(8400+i*500,-3710,500,90,'A-DIMENSION');if(i%2===0)put({type:'HATCH',boundaries:[[[8400+i*500,-3710],[8900+i*500,-3710],[8900+i*500,-3620],[8400+i*500,-3620]].map(p=>point(...p))],pattern:'SOLID'},'A-DIMENSION');}text(8400,-3910,'0',78,'A-DIMENSION');text(10400,-3910,'2 m',78,'A-DIMENSION');
  return {name:'Meridian House.dxf',units:4,layers,entities};
}
