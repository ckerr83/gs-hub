import { permanentRedirect } from "next/navigation";

export default function LegacyWineLibraryPage() {
  permanentRedirect("/wine-database");
}
