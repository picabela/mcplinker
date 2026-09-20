import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'MCPLinker · Twoje marki. Jeden panel.',description:'Zarządzaj Facebookiem, LinkedIn i WordPressem z panelu i przez agentów ChatGPT.',robots:{index:false,follow:false},icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pl"><body>{children}</body></html>}
