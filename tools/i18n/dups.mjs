import ts from 'typescript';import fs from 'node:fs';
const f='lib/i18n/en.ts';const src=fs.readFileSync(f,'utf8');const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true);
const seen=new Map(),dups=[];
const v=n=>{if(ts.isPropertyAssignment(n)&&ts.isStringLiteralLike(n.name)){const k=n.name.text;if(seen.has(k))dups.push(k);else seen.set(k,1);}ts.forEachChild(n,v);};v(sf);
console.log(dups.length,JSON.stringify(dups));
