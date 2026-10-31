import {describe,it,expect} from 'vitest';
import {analyzeCsv,MAX_BYTES} from './csv';
const b=(s:string)=>new TextEncoder().encode(s);
describe('importación CSV',()=>{
 it('lee comillas, comas y saltos de línea',()=>{const r=analyzeCsv(b('id,nombre\n1,"uno, dos"\n2,"tres\ncuatro"'),'datos.csv'); expect(r.rows).toEqual([['1','uno, dos'],['2','tres\ncuatro']]);});
 it('rechaza encabezados duplicados',()=>expect(()=>analyzeCsv(b('id,ID\n1,2'),'a.csv')).toThrow('duplicados'));
 it('rechaza filas irregulares',()=>expect(()=>analyzeCsv(b('a,b\n1'),'a.csv')).toThrow('inconsistente'));
 it('rechaza comillas sin cerrar',()=>expect(()=>analyzeCsv(b('a,b\n1,"x'),'a.csv')).toThrow('CSV inválido'));
 it('rechaza UTF-8 inválido',()=>expect(()=>analyzeCsv(new Uint8Array([255]),'a.csv')).toThrow('Codificación'));
 it('rechaza extensión y tamaño',()=>{expect(()=>analyzeCsv(b('a'),'a.exe')).toThrow('extensión');expect(()=>analyzeCsv(new Uint8Array(MAX_BYTES+1),'a.csv')).toThrow('2 MB');});
 it('rechaza exceso de filas',()=>expect(()=>analyzeCsv(b('a\n'+Array(10001).fill('x').join('\n')),'a.csv')).toThrow('10 000'));
});
