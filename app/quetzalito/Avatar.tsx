/**
 * Quetzalito: mini quetzal holográfico (SVG), más simple y amigable que el emblema principal pero con su misma paleta:
 * azul eléctrico, cian y detalles dorados. Vive siempre dentro de un micro-escenario oscuro, así que se ve igual
 * en tema claro y oscuro. Las animaciones son CSS y se anulan con «reducir movimiento».
 */
import {useId} from 'react';

export default function Avatar({size=56,className=''}:{size?:number;className?:string}){
 const id=useId().replace(/:/g,'');
 const g=(n:string)=>`${n}${id}`;
 return <svg className={`qz-avatar ${className}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">
  <defs>
   <radialGradient id={g('st')} cx="50%" cy="42%" r="62%"><stop offset="0" stopColor="#10305a"/><stop offset="0.7" stopColor="#071326"/><stop offset="1" stopColor="#040a14"/></radialGradient>
   <linearGradient id={g('bd')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f8bff"/><stop offset="1" stopColor="#35e0ff"/></linearGradient>
   <linearGradient id={g('tl')} x1="0.1" y1="0" x2="1" y2="0.8"><stop offset="0" stopColor="#1b5cff"/><stop offset="0.5" stopColor="#2fd3ff"/><stop offset="0.82" stopColor="#8cf3ff"/><stop offset="1" stopColor="#e2b866"/></linearGradient>
   <linearGradient id={g('hd')} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#58b6ff"/><stop offset="1" stopColor="#8cf3ff"/></linearGradient>
   <filter id={g('gl')} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
   <clipPath id={g('cp')}><circle cx="32" cy="32" r="29"/></clipPath>
  </defs>
  <circle cx="32" cy="32" r="30" fill={`url(#${g('st')})`}/>
  <g clipPath={`url(#${g('cp')})`}>
   <g className="qz-scan" opacity="0.14" stroke="#7fe3ff" strokeWidth="0.5">{[8,14,20,26,32,38,44,50,56].map(y=><line key={y} x1="0" x2="64" y1={y} y2={y}/>)}</g>
   <circle className="qz-orbit" cx="32" cy="32" r="25" fill="none" stroke="#d3b273" strokeWidth="0.7" strokeDasharray="2 3.2" opacity="0.7"/>
   <g className="qz-bird" filter={`url(#${g('gl')})`}>
    <path d="M26 38 C17 52 31 62 57 51 C41 56 29 50 29 40 Z" fill={`url(#${g('tl')})`}/>
    <path d="M23 35 C11 46 20 62 44 60 C28 56 21 46 26 37 Z" fill={`url(#${g('tl')})`} opacity="0.85"/>
    <path d="M22 30 C22 20 32 16 40 22 C46 27 44 40 34 44 C26 46 22 40 22 30 Z" fill={`url(#${g('bd')})`}/>
    <path className="qz-wing" d="M21 27 C11 23 9 35 18 43 C15 35 18 31 25 31 Z" fill="#8cf3ff" opacity="0.85"/>
    <path d="M33 17 C28 13 24 13 20 11 C25 14 28 16 32 20 Z" fill="#8cf3ff"/>
    <path d="M36 15 C33 9 29 8 27 5 C31 9 33 11 35 16 Z" fill="#8cf3ff"/>
    <path d="M39 14 C38 8 36 5 35 2 C38 6 40 10 41 14 Z" fill="#aef6ff"/>
    <circle cx="39" cy="22" r="8.6" fill={`url(#${g('hd')})`}/>
    <path d="M46.5 20.5 C53 20.5 54 26 49.5 29.5 C51 26 49.5 23.5 46.5 24 Z" fill="#e2b866"/>
    <g className="qz-eye"><circle cx="41.5" cy="21" r="2.2" fill="#06182e"/><circle cx="41.9" cy="20.6" r="1.1" fill="#d9fbff"/></g>
   </g>
  </g>
  <circle cx="32" cy="32" r="29.2" fill="none" stroke="#2cc7fa" strokeWidth="1.2" opacity="0.9"/>
 </svg>;
}
