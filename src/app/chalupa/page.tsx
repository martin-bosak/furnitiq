import type { Metadata } from "next";
import { ChalupaPage } from "@/components/chalupa/ChalupaPage";

export const metadata: Metadata = {
  title: "Chalupa Brtníky 69 · Furnitiq",
  description: "Interaktivní 3D model chalupy po patrech a místnostech",
};

export default function Page() {
  return <ChalupaPage />;
}
