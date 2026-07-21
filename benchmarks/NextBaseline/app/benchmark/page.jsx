import BenchmarkClient from "./BenchmarkClient";

export const dynamic = "force-dynamic";

const rows = Array.from({ length: 20 }, (_, offset) => {
  const id = offset + 1;
  return {
    id,
    code: `DOC-${String(id).padStart(4, "0")}`,
    amount: id * 137.42,
    status: id % 3 === 0 ? "Pending" : "Reconciled"
  };
});

export default function BenchmarkPage() {
  return <BenchmarkClient generatedAt={new Date().toISOString()} rows={rows} />;
}
