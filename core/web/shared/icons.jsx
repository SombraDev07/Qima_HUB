// Ícones disponíveis para os cards (nome usado no module.json -> componente Lucide).
import {
  Users, Tablet, BedDouble, Car, ClipboardPen, TabletSmartphone, Truck, FileText,
  Package, Wrench, Briefcase, Plane, Building2, ShieldCheck, ClipboardCheck, Wheat, LayoutGrid, Receipt,
} from 'lucide-react';

export const ICONS = {
  users: Users,
  tablet: Tablet,
  'bed-double': BedDouble,
  car: Car,
  'clipboard-pen': ClipboardPen,
  'tablet-smartphone': TabletSmartphone,
  truck: Truck,
  'file-text': FileText,
  package: Package,
  wrench: Wrench,
  briefcase: Briefcase,
  plane: Plane,
  building: Building2,
  'shield-check': ShieldCheck,
  'clipboard-check': ClipboardCheck,
  wheat: Wheat,
  receipt: Receipt,
};

export function ModuleIcon({ name, ...props }) {
  const Icon = ICONS[name] || LayoutGrid;
  return <Icon {...props} />;
}
