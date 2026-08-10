import PurchaseDetailClient from "@/components/PurchaseDetailClient";

export default function PurchaseDetailPage({ params }: { params: { id: string } }) {
  return <PurchaseDetailClient purchaseId={params.id} />;
}
