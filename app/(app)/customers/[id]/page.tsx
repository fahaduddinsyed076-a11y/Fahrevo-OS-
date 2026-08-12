import CustomerDetailClient from "@/components/CustomerDetailClient";

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return <CustomerDetailClient customerId={params.id} />;
}
