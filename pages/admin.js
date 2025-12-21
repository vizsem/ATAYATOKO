// pages/admin.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router'; // ✅ untuk redirect yang andal
import { auth, db } from '../lib/firebase';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDoc
} from 'firebase/firestore';

export default function Admin() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [newProduct, setNewProduct] = useState({
    name: '', category: 'makanan', priceEcer: 0, priceGrosir: 0,
    stockEcer: 0, stockGrosir: 0, supplier: ''
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists() ? userDoc.data() : null;
        if (userData && userData.role === 'admin') {
          setUser(user);
          loadProducts();
        } else {
          alert('Akses ditolak! Hanya admin yang boleh masuk.');
          router.push('/'); // ✅ redirect aman di Next.js
        }
      } else {
        router.push('/'); // ✅ redirect aman
      }
    });
    return () => unsubscribe();
  }, []);

  const loadProducts = async () => {
    const snapshot = await getDocs(collection(db, 'products'));
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setProducts(list);
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: (item.quantity || 0) + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id, qty) => {
    if (qty < 0) return;
    setCart(prev => prev.map(item =>
      item.id === id ? { ...item, quantity: qty } : item
    ));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const saveOrder = async () => {
    if (cart.length === 0) return alert('Keranjang kosong!');
    const total = cart.reduce((sum, item) => sum + ((item.priceEcer || 0) * item.quantity), 0);
    await addDoc(collection(db, 'orders'), {
      items: cart,
      total,
      createdAt: serverTimestamp(),
      cashier: user?.email
    });
    setCart([]);
    alert('Order berhasil disimpan!');
  };

  const handleSaveProduct = async () => {
    if (!newProduct.name) return alert('Nama produk wajib diisi!');
    if (editingId) {
      await updateDoc(doc(db, 'products', editingId), newProduct);
    } else {
      await addDoc(collection(db, 'products'), newProduct);
    }
    setNewProduct({
      name: '', category: 'makanan', priceEcer: 0, priceGrosir: 0,
      stockEcer: 0, stockGrosir: 0, supplier: ''
    });
    setEditingId(null);
    loadProducts();
  };

  const startEdit = (product) => {
    setNewProduct(product);
    setEditingId(product.id);
  };

  const handleDelete = async (id) => {
    if (confirm('Hapus produk ini?')) {
      await deleteDoc(doc(db, 'products', id));
      loadProducts();
    }
  };

  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = window.XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = window.XLSX.utils.sheet_to_json(worksheet);
      if (jsonData.length === 0) {
        alert('File Excel kosong!');
        return;
      }
      let count = 0;
      jsonData.forEach(async (row) => {
        try {
          await addDoc(collection(db, 'products'), {
            name: row.nama || row.name || '',
            category: row.kategori || row.category || 'lainnya',
            priceEcer: Number(row.harga_ecer) || 0,
            priceGrosir: Number(row.harga_grosir) || 0,
            stockEcer: Number(row.stok_ecer) || 0,
            stockGrosir: Number(row.stok_grosir) || 0,
            supplier: row.supplier || ''
          });
          count++;
        } catch (err) {
          console.error('Error simpan produk:', row, err);
        }
      });
      alert(`Berhasil import ${count} produk!`);
      loadProducts();
    };
    reader.readAsArrayBuffer(file);
  };

  const totalCart = cart.reduce((sum, item) => sum + ((item.priceEcer || 0) * item.quantity), 0);
  if (!user) return <div className="p-6">Loading...</div>;

  return (
    <>
      <Head>
        <title>ATAYATOKO - Admin Panel</title>
        {/* ✅ CDN SheetJS AMAN dan TANPA SPASI */}
        <script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
      </Head>

      <div className="min-h-screen bg-gray-100">
        <header className="bg-indigo-700 text-white p-4">
          <div className="container mx-auto flex justify-between items-center">
            <h1 className="text-2xl font-bold">Admin Panel</h1>
            <button
              onClick={() => auth.signOut().then(() => router.push('/'))}
              className="bg-white text-indigo-700 px-4 py-2 rounded font-medium"
            >
              Logout
            </button>
          </div>
        </header>

        <div className="container mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* POS */}
          <div className="lg:col-span-2 bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">POS - Point of Sale</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
              {products.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="border p-3 text-left hover:bg-indigo-50 rounded"
                >
                  <div className="font-bold text-sm">{p.name}</div>
                  <div className="text-xs text-gray-600">Rp {(p.priceEcer || 0).toLocaleString()}</div>
                </button>
              ))}
            </div>

            <div>
              <h3 className="font-bold mb-2">Keranjang ({cart.length} item)</h3>
              {cart.length === 0 ? (
                <p className="text-gray-500 text-sm">Kosong</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {cart.map(item => (
                    <div key={item.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <div className="text-sm">{item.name}</div>
                        <div className="text-xs text-gray-500">Rp {(item.priceEcer || 0).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center">
                        <button
                          onClick={() => updateQuantity(item.id, (item.quantity || 1) - 1)}
                          className="w-6 h-6 bg-gray-200 rounded-full text-xs"
                        >
                          -
                        </button>
                        <span className="mx-2 text-sm">{item.quantity || 1}</span>
                        <button
                          onClick={() => updateQuantity(item.id, (item.quantity || 0) + 1)}
                          className="w-6 h-6 bg-gray-200 rounded-full text-xs"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="ml-2 text-red-500 text-xs"
                        >
                          x
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 text-lg font-bold">
                Total: Rp {totalCart.toLocaleString()}
              </div>
              <button
                onClick={saveOrder}
                className="mt-4 w-full bg-green-600 text-white py-2 rounded font-medium"
              >
                Simpan Order
              </button>
            </div>
          </div>

          {/* Manajemen Produk */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Manajemen Produk</h2>
            <div className="space-y-3 mb-6">
              <input
                value={newProduct.name}
                onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                placeholder="Nama produk"
                className="w-full p-2 border rounded"
              />
              <select
                value={newProduct.category}
                onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                className="w-full p-2 border rounded"
              >
                <option value="makanan">Makanan</option>
                <option value="minuman">Minuman</option>
                <option value="kebersihan">Kebersihan</option>
                <option value="perawatan">Perawatan</option>
              </select>
              <input
                type="number"
                value={newProduct.priceEcer}
                onChange={e => setNewProduct({...newProduct, priceEcer: Number(e.target.value)})}
                placeholder="Harga Ecer"
                className="w-full p-2 border rounded"
              />
              <input
                type="number"
                value={newProduct.priceGrosir}
                onChange={e => setNewProduct({...newProduct, priceGrosir: Number(e.target.value)})}
                placeholder="Harga Grosir"
                className="w-full p-2 border rounded"
              />
              <input
                type="text"
                value={newProduct.supplier}
                onChange={e => setNewProduct({...newProduct, supplier: e.target.value})}
                placeholder="Supplier"
                className="w-full p-2 border rounded"
              />
              <button
                onClick={handleSaveProduct}
                className="w-full bg-indigo-600 text-white py-2 rounded font-medium"
              >
                {editingId ? 'Update' : 'Tambah'} Produk
              </button>
            </div>

            <div className="mb-6">
              <label className="block mb-2 font-medium text-sm">Import Excel (.xlsx)</label>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleExcelUpload}
                className="w-full p-2 border rounded text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Kolom: nama, kategori, harga_ecer, harga_grosir, stok_ecer, stok_grosir, supplier
              </p>
            </div>

            <div>
              <h3 className="font-bold mb-2 text-sm">Produk ({products.length})</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto text-sm">
                {products.map(p => (
                  <div key={p.id} className="flex justify-between border-b pb-1">
                    <div>{p.name}</div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-blue-500 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-500 hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}