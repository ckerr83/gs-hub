import { Dashboard } from "@/components/dashboard";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/dictionaries";
export async function generateMetadata() {
  return { title: translate(await getLanguage(), "Dashboard") };
}
export default Dashboard;
