import {
  Armchair,
  Briefcase,
  Car,
  Cpu,
  Dumbbell,
  Home,
  Laptop,
  Package,
  Shirt,
  Smartphone,
  Sprout,
  Store,
  UtensilsCrossed,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  electronics: Cpu,
  phones: Smartphone,
  computers: Laptop,
  vehicles: Car,
  property: Home,
  furniture: Armchair,
  clothing: Shirt,
  "home-garden": Sprout,
  sports: Dumbbell,
  food: UtensilsCrossed,
  services: Wrench,
  jobs: Briefcase,
  business: Store,
};

export function CategoryIcon({ slug, className = "h-5 w-5" }: { slug: string; className?: string }) {
  const Icon = CATEGORY_ICONS[slug] ?? Package;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
