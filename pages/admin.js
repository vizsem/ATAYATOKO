// pages/admin.js
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { auth, db } from '../lib/firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs,
  getDoc
} from 'firebase/firestore';

export default function AdminPanel() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [imagePreview, setImagePreview] = useState('/placeholder.webp');
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'makanan',
    hargaBeli: 0,
    priceEcer: 0,
    priceGrosir: 0,
    stock: 0,
    supplier: '',
    imageUrl: ''
  });
  const [isEditing, setIsEditing] = useState(null);
  const [loading, setLoading] = useState(false);

  // Cek apakah admin
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) return router.push('/');
      
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists() || userDoc.data().role !== 'admin') {
        alert('Akses ditolak!');
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, []);

  // Muat produk
  const fetchProducts = async () => {
    const snapshot = await getDocs(collection(db, 'products'));
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setProducts(list);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Handle perubahan form
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setProductForm(prev => ({
      ...prev,
      [name]: name.includes('price') || name === 'hargaBeli' || name === 'stock' 
        ? Number(value) || 0 
        : value
    }));
  };

  // Handle upload foto via URL
  const handleImageURLChange = (e) => {
    const url = e.target.value;
    setProductForm(prev => ({ ...prev, imageUrl: url }));
    setImagePreview(url || '/placeholder.webp');
  };

  // Simpan produk
  const saveProduct = async () => {
    if (!productForm.name.trim()) {
      alert('Nama produk wajib diisi!');
      return;
    }
    if (productForm.priceEcer <= 0) {
      alert('Harga ecer harus lebih dari 0!');
      return;
    }

    setLoading(true);
    try {
      const productData = {
        ...productForm,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (isEditing) {
        await updateDoc(doc(db, 'products', isEditing), productData);
      } else {
        await addDoc(collection(db, 'products'), productData);
      }

      // Reset form
      setProductForm({
        name: '',
        category: 'makanan',
        hargaBeli: 0,
        priceEcer: 0,
        priceGrosir: 0,
        stock: 0,
        supplier: '',
        imageUrl: ''
      });
      setImagePreview('/placeholder.webp');
      setIsEditing(null);
      
      await fetchProducts();
      alert(isEditing ? 'Produk berhasil diupdate!' : 'Produk berhasil ditambahkan!');
    } catch (err) {
      console.error(err);
      alert('Gagal menyimpan produk: ' + err.message);
    }
    setLoading(false);
  };

  // Mulai edit produk
  const startEdit = (product) => {
    setProductForm({
      name: product.name || '',
      category: product.category || 'makanan',
      hargaBeli: product.hargaBeli || 0,
      priceEcer: product.priceEcer || 0,
      priceGrosir: product.priceGrosir || 0,
      stock: product.stock || 0,
      supplier: product.supplier || '',
      imageUrl: product.imageUrl || ''
    });
    setImagePreview(product.imageUrl || '/placeholder.webp');
    setIsEditing(product.id);
  };

  // Hapus produk
  const handleDelete = async (id) => {
    if (confirm('Hapus produk ini?')) {
      await deleteDoc(doc(db, 'products', id));
      fetchProducts();
    }
  };

  // Handle import Excel
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
            category: row.kategori || row.category || 'makanan',
            hargaBeli: Number(row.harga_beli) || 0,
            priceEcer: Number(row.harga_ecer) || 0,
            priceGrosir: Number(row.harga_grosir) || 0,
            stock: Number(row.stok) || 0,
            supplier: row.supplier || '',
            imageUrl: row.foto || ''
          });
          count++;
        } catch (err) {
          console.error('Error simpan produk:', row, err);
        }
      });

      alert(`Berhasil import ${count} produk!`);
      fetchProducts();
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>ATAYATOKO - Admin Panel</title>
        {/* ✅ CDN SheetJS TANPA SPASI */}
        <script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
      </Head>

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
        {/* Form Tambah/Edit Produk */}
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">
            {isEditing ? 'Edit Produk' : 'Tambah Produk Baru'}
          </h2>

          {/* Preview Foto */}
          <div className="mb-4 flex justify-center">
            <img 
              src={imagePreview} 
              alt="Preview produk" 
              className="w-48 h-48 object-contain border rounded bg-gray-50"
              onError={(e) => { e.target.src = '/placeholder.webp'; }}
            />
          </div>

          {/* URL Foto */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Foto Produk
            </label>
            <input
              type="text"
              placeholder="https://example.com/produk.jpg"
              value={productForm.imageUrl}
              onChange={handleImageURLChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">
              Gunakan foto berukuran kecil (&lt; 500KB) untuk loading cepat
            </p>
          </div>

          {/* Nama Produk */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nama Produk *
            </label>
            <input
              name="name"
              type="text"
              value={productForm.name}
              onChange={handleInputChange}
              placeholder="Contoh: Indomie Goreng"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Kategori */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kategori
            </label>
            <select
              name="category"
              value={productForm.category}
              onChange={handleInputChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="makanan">Makanan</option>
              <option value="minuman">Minuman</option>
              <option value="kebersihan">Kebersihan</option>
              <option value="perawatan">Perawatan</option>
            </select>
          </div>

          {/* Harga Beli */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Harga Beli (Rp)
            </label>
            <input
              name="hargaBeli"
              type="number"
              value={productForm.hargaBeli}
              onChange={handleInputChange}
              placeholder="0"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Harga Ecer */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Harga Ecer (Rp) *
            </label>
            <input
              name="priceEcer"
              type="number"
              value={productForm.priceEcer}
              onChange={handleInputChange}
              placeholder="0"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Harga Grosir */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Harga Grosir (Rp)
            </label>
            <input
              name="priceGrosir"
              type="number"
              value={productForm.priceGrosir}
              onChange={handleInputChange}
              placeholder="0"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Stok */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stok
            </label>
            <input
              name="stock"
              type="number"
              value={productForm.stock}
              onChange={handleInputChange}
              placeholder="0"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Supplier */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier
            </label>
            <input
              name="supplier"
              type="text"
              value={productForm.supplier}
              onChange={handleInputChange}
              placeholder="Nama supplier"
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Tombol Simpan */}
          <button
            onClick={saveProduct}
            disabled={loading}
            className={`w-full py-2 rounded font-medium ${
              loading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {loading ? 'Menyimpan...' : (isEditing ? 'Update Produk' : 'Tambah Produk')}
          </button>

          {isEditing && (
            <button
              onClick={() => {
                setProductForm({
                  name: '',
                  category: 'makanan',
                  hargaBeli: 0,
                  priceEcer: 0,
                  priceGrosir: 0,
                  stock: 0,
                  supplier: '',
                  imageUrl: ''
                });
                setImagePreview('/placeholder.webp');
                setIsEditing(null);
              }}
              className="w-full mt-2 py-2 bg-gray-500 text-white rounded font-medium hover:bg-gray-600"
            >
              Batal Edit
            </button>
          )}

          {/* Import Excel */}
          <div className="mt-6 pt-4 border-t">
            <h3 className="font-bold mb-2">Import dari Excel</h3>
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleExcelUpload}
              className="w-full p-2 border rounded text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Kolom: nama, kategori, harga_beli, harga_ecer, harga_grosir, stok, supplier, foto
            </p>
          </div>
        </div>

        {/* Daftar Produk */}
        <div className="lg:col-span-2 bg-white p-4 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Daftar Produk ({products.length})</h2>
            <div className="text-sm text-gray-500">
              Klik untuk edit | Klik 🗑️ untuk hapus
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
            {products.map(p => (
              <div 
                key={p.id} 
                className="border rounded-lg p-3 hover:shadow-md cursor-pointer transition"
                onClick={() => startEdit(p)}
              >
                <div className="flex">
                  <img 
                    src={p.imageUrl || '/placeholder.webp'} 
                    alt={p.name}
                    className="w-16 h-16 object-contain mr-3 flex-shrink-0"
                    onError={(e) => { e.target.src = '/placeholder.webp'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{p.name}</h3>
                    <div className="text-xs text-gray-600 space-y-1 mt-1">
                      <div className="font-medium">{p.category}</div>
                      <div>Harga Beli: Rp {p.hargaBeli?.toLocaleString() || '0'}</div>
                      <div>Harga Ecer: Rp {p.priceEcer?.toLocaleString() || '0'}</div>
                      <div>Harga Grosir: Rp {p.priceGrosir?.toLocaleString() || '0'}</div>
                      <div>Stok: {p.stock || 0}</div>
                      <div>Supplier: {p.supplier || '-'}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(p.id);
                    }}
                    className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}