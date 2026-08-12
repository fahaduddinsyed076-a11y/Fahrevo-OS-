import SaleDetailClient from "@/components/SaleDetailClient";

export default function SaleDetailPage({ params }: { params: { id: string } }) {
  return <SaleDetailClient saleId={params.id} />;
}
