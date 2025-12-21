// pages/admin.js
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function Admin() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const fetchOrders = async () => {
      const querySnapshot = await getDocs(collection(db, 'carts'));
      const data = [];
      querySnapshot.forEach(doc => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setOrders(data);
    };
    fetchOrders();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dashboard Admin</h1>
      <table className="min-w-full border">
        <thead>
          <tr>
            <th className="border px-4 py-2">User ID</th>
            <th className="border px-4 py-2">Produk</th>
            <th className="border px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr key={order.id}>
              <td className="border px-4 py-2">{order.id}</td>
              <td className="border px-4 py-2">
                {order.items?.map(item => (
                  <div key={item.id}>{item.name} × {item.quantity}</div>
                ))}
              </td>
              <td className="border px-4 py-2">
                {order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}