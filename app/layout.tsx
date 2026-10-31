import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Quetzal Afterlife', description: 'The Digital Resurrection Engine' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="es"><body>{children}</body></html> }
