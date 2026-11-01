import type { Metadata } from 'next';
import './globals.css';
import {BOOT_SCRIPT} from '../lib/i18n/store';
export const metadata: Metadata = { title: 'Quetzal Afterlife', description: 'The Digital Resurrection Engine', icons: { icon: '/quetzal-logo.png' } };
// El script fija idioma y tema (guardados o del sistema) antes del primer pintado, sin destello.
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="es" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:BOOT_SCRIPT}}/></head><body>{children}</body></html> }
