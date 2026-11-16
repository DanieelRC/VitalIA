import { PageHeader } from "@/components/ui";
import { RecipeForm } from "../recipe-form";

export const metadata = { title: "Nueva receta" };

export default function NewRecipe() {
  return (<><PageHeader title="Nueva receta" /><RecipeForm /></>);
}
