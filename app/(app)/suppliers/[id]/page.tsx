import SupplierDetailClient from "@/components/SupplierDetailClient";

export default function SupplierDetailPage({ params }: { params: { id: string } }) {
  return <SupplierDetailClient supplierId={params.id} />;
}
