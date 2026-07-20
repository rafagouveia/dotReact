"use client";

import { useState } from "react";

export function ClientCounter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(value => value + 1)}>Client state: {count}</button>;
}
