import './styles.css';
import { Shipments } from './components/shipments';
import { getLanguage } from '@/lib/i18n/server';
export async function generateMetadata() { return { title: await getLanguage() === 'th' ? 'การนำเข้า' : 'Shipments' }; }
export default function ShipmentsPage() { return <Shipments />; }
