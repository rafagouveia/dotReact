"use client";

import { useState } from "react";

export default function BenchmarkClient({ generatedAt, rows }) {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>Accounting reconciliation benchmark</h1>
      <p>Generated at {generatedAt}</p>
      <button type="button" onClick={() => setCount(value => value + 1)}>Count {count}</button>
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
