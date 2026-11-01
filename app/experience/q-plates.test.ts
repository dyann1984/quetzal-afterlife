import {describe,it,expect} from 'vitest';
import {readFileSync,statSync} from 'node:fs';
import {auraFromJson,plateZ,PLATE_CENTER,PLATE_HEAD,PLATE_PX,PLATE_SIZE,AMP} from './q-plates';

const aura=JSON.parse(readFileSync('public/hologram/aura.json','utf8'));
const pngSize=(f:string)=>{const b=readFileSync(f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};

describe('holograma 2.5D por capas (imagen oficial)',()=>{
 it('los recursos existen, pesan poco y tienen las dimensiones esperadas',()=>{
  for(const f of ['ave.jpg','resto.jpg','depth.png','aura.json'])expect(statSync(`public/hologram/${f}`).size,f).toBeGreaterThan(1000);
  for(const f of ['ave.jpg','resto.jpg'])expect(statSync(`public/hologram/${f}`).size,f).toBeLessThan(400*1024);
  expect(pngSize('public/hologram/depth.png')).toEqual([PLATE_PX.w/2,PLATE_PX.h/2]);
  const jpg=readFileSync('public/hologram/ave.jpg');let w=0,h=0;for(let i=2;i<jpg.length-9;){if(jpg[i]!==0xff){i++;continue;}const m=jpg[i+1];if(m>=0xc0&&m<=0xc3){h=jpg.readUInt16BE(i+5);w=jpg.readUInt16BE(i+7);break;}i+=2+jpg.readUInt16BE(i+2);}
  expect([w,h]).toEqual([PLATE_PX.w,PLATE_PX.h]);
 });
 it('el centro y la cabeza coinciden con la referencia (1 unidad = 80 px, recorte x95..905, y20..668)',()=>{
  expect(PLATE_SIZE).toEqual([810/80,648/80]);
  expect(PLATE_CENTER[0]).toBeCloseTo((95+405-540)/80,6);expect(PLATE_CENTER[1]).toBeCloseTo((370-(20+324))/80,6);
  expect(PLATE_HEAD[0]).toBeCloseTo((535-540)/80,1);expect(PLATE_HEAD[1]).toBeCloseTo((370-215)/80,1);
 });
 it('los puntos de partículas salen de la propia imagen y caen dentro de la placa',()=>{
  expect(aura.p.length).toBe((aura.n1+aura.n2)*3);
  const a=auraFromJson(aura),n=aura.n1+aura.n2;expect(a.points.length).toBe(n*3);
  const hx=PLATE_SIZE[0]/2+0.01,hy=PLATE_SIZE[1]/2+0.01;
  for(let i=0;i<n;i++){expect(Math.abs(a.points[i*3]-PLATE_CENTER[0])).toBeLessThanOrEqual(hx);expect(Math.abs(a.points[i*3+1]-PLATE_CENTER[1])).toBeLessThanOrEqual(hy);}
  // la mayoría de los puntos del ave están en la mitad izquierda-centro (la cola llega a la derecha) y por encima de la plataforma
  let belowFloor=0;for(let i=0;i<aura.n1;i++)if(a.points[i*3+1]<-3.95)belowFloor++;expect(belowFloor).toBe(0);
 });
 it('la profundidad es acotada y suave (paralaje limitado, no 3D completo)',()=>{
  const lo=plateZ(0,0,0),hi=plateZ(0,1,0);expect(hi-lo).toBeCloseTo(AMP.ave,6);expect(hi-lo).toBeLessThan(2.2);
  expect(plateZ(0,0.5,PLATE_SIZE[0]/2)).toBeLessThan(plateZ(0,0.5,0));      // los bordes se curvan hacia atrás
  expect(plateZ(1,0.5,0)).toBeLessThan(plateZ(0,0.5,0));                    // el anillo y los datos quedan detrás del ave
 });
});
