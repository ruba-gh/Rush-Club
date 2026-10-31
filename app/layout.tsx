import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Rush Club | رش — الترتيب والعضوية والاوسمة',description:'رش، مجتمع الريشة والبادل للسيدات في الرياض. Rush memberships, player rankings and awards.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
