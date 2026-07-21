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

export default function BenchmarkServerPage() {
  return (
    <main>
      <h1>Accounting reconciliation benchmark</h1>
      <p>Generated at {new Date().toISOString()}</p>
      <table>
        <thead><tr><th>ID</th><th>Code</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row => (
          <tr key={row.id}>
            <td>{row.id}</td><td>{row.code}</td><td>{row.amount}</td><td>{row.status}</td>
          </tr>
        ))}</tbody>
      </table>
    </main>
  );
}
