import React, { useEffect, useState } from 'react';

type Order = { items: number; coupon: boolean };
function initialOrder(): Order {
  try {
    const value = JSON.parse(localStorage.getItem('accessfix.m4.order') || 'null');
    if (value && Number.isSafeInteger(value.items) && value.items >= 1 && typeof value.coupon === 'boolean') return value;
  } catch {}
  return { items: 1, coupon: false };
}

export default function App() {
  const [order, setOrder] = useState(initialOrder);
  useEffect(() => { localStorage.setItem('accessfix.m4.order', JSON.stringify(order)); }, [order]);
  const total = order.items * 100 * (order.coupon ? 0.9 : 1);
  return <main>
    <header><p className="eyebrow">NORTHSTAR / ORDERS</p><h1>Order summary</h1><p>Review your items and apply your available discount.</p></header>
    <section className="card" aria-labelledby="order-title">
      <h2 id="order-title">Studio supplies</h2>
      <dl><div><dt>Quantity</dt><dd role="status" aria-label="Item count">Items: {order.items}</dd></div><div><dt>Total</dt><dd role="status" aria-label="Order total">${total.toFixed(2)}</dd></div></dl>
      <p>Available offer: 10% off the entire order.</p>
      <p role="status" aria-label="Coupon status">{order.coupon ? 'Coupon applied' : 'No coupon'}</p>
      <div className="actions"><div className="action-control" role="button" tabIndex={0} onClick={() => setOrder(current => ({ ...current, coupon: true }))}>Apply coupon</div><button className="muted-button" onClick={() => setOrder(current => ({ ...current, coupon: false }))}>Clear coupon</button></div>
    </section>
    <section className="card secondary" aria-labelledby="items-title"><div><h2 id="items-title">Add supplies</h2><p>Each additional item costs $100 before discounts.</p></div><button onClick={() => setOrder(current => ({ ...current, items: current.items + 1 }))}>Add item</button></section>
    <footer>Your demo order stays in this browser.</footer>
  </main>;
}
