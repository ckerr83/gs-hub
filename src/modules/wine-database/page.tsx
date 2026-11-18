import "./styles.css";
import { WineDatabase } from "./components/wine-database";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
export async function generateMetadata() {
  return { title: translate(await getLanguage(), "Wine database") };
}
export default function WineDatabasePage() {
  return <WineDatabase />;
}
