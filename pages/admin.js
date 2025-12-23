// pages/admin.js
import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs,
  getDoc,
  onSnapshot,
  writeBatch,
  increment
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { Html5Qrcode } from "html5-qrcode";
import { auth, db } from '../lib/firebase';
export default function AdminPanel() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [receiptData, setReceiptData] = useState(null);
  const [activeTab, setActiveTab] = useState('pos');
  const [editingProduct, setEditingProduct] = useState(null);
  const [newProduct, setNewProduct] = useState({
    name: '',
    hargaBeli: 0,
    priceEcer: 0,
    priceGrosir: 0,
    stock: 0,
    supplier: '',
    category: 'makanan',
    imageUrl: '',
    sku: '',
    barcode: ''
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [importStatus, setImportStatus] = useState({ show: false, message: '', error: false });
  const [lowStockItems, setLowStockItems] = useState([]);
  const [salesReport, setSalesReport] = useState([]);
  const [reportPeriod, setReportPeriod] = useState('today');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [massUpdate, setMassUpdate] = useState({ priceEcer: '', priceGrosir: '', stock: '' });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  // ✅ FORMAT RUPIAH BULAT TANPA KOMA
  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(Math.round(number));
  };
  // === AUTH & DATA LOADING ===
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return router.push('/');
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        alert('Akses ditolak: pengguna tidak ditemukan!');
        router.push('/');
        return;
      }
      const userRole = userDoc.data().role;
      // ✅ IZINKAN baik 'admin' maupun 'cashier'
      if (userRole !== 'admin' && userRole !== 'cashier') {
        alert('Akses ditolak: role tidak diizinkan!');
        router.push('/');
        return;
      }
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'products'), (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(list);
      setFilteredProducts(list);
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    const lowStock = products.filter(p => (p.stock || 0) < 10);
    setLowStockItems(lowStock);
  }, [products]);
  // ✅ FILTER + RESET HALAMAN
  useEffect(() => {
    let filtered = products;
    if (searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (product.barcode && product.barcode.includes(searchTerm))
      );
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(product => product.category === selectedCategory);
    }
    setFilteredProducts(filtered);
    setCurrentPage(1); // ✅ Reset ke halaman 1 saat filter berubah
  }, [searchTerm, selectedCategory, products]);
  // LAPORAN PENJUALAN
  useEffect(() => {
    if (activeTab !== 'reports' || !currentUser) return;
    const loadSalesReport = async () => {
      const now = new Date();
      let startDate;
      switch(reportPeriod) {
        case 'today': startDate = new Date(now.setHours(0,0,0,0)); break;
        case 'week': startDate = new Date(now.setDate(now.getDate() - 7)); break;
        case 'month': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
      }
      const snapshot = await getDocs(collection(db, 'orders'));
      const orders = snapshot.docs.map(doc => doc.data()).filter(order => 
        new Date(order.createdAt.seconds * 1000) >= startDate
      );
      setSalesReport(orders);
    };
    loadSalesReport();
  }, [reportPeriod, activeTab, currentUser]);
  // === POS LOGIC ===
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const addToCart = (product) => {
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      setCart(cart.map(item =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1, price: product.priceEcer }]);
    }
  };
  const updateQuantity = (id, newQuantity) => {
    if (newQuantity === 0) {
      removeFromCart(id);
      return;
    }
    setCart(cart.map(item =>
      item.id === id ? { ...item, quantity: newQuantity } : item
    ));
  };
  const removeFromCart = (id) => {
    setCart(cart.filter(item => item.id !== id));
  };
  const clearCart = () => {
    setCart([]);
  };
  const generateReceiptNumber = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `TK${dateStr}-${timeStr}`;
  };
  const generateBarcode = (sku) => {
    if (!sku) return '';
    const digits = sku.replace(/\D/g, '');
    const base = ('899' + digits).padEnd(12, '0').slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
    }
    const checksum = (10 - (sum % 10)) % 10;
    return base + checksum;
  };
  const processPayment = async () => {
    if (selectedPaymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      if (isNaN(cash) || cash < cartTotal) {
        alert('Uang tunai tidak cukup!');
        return;
      }
    }
    const now = new Date();
    const receiptNumber = generateReceiptNumber();
    try {
      const batch = writeBatch(db);
      const orderItems = [];
      for (const item of cart) {
        const productRef = doc(db, 'products', item.id);
        batch.update(productRef, { stock: increment(-item.quantity) });
        orderItems.push({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
          barcode: item.barcode
        });
      }
      const totalRounded = Math.round(cartTotal);
      const changeRounded = selectedPaymentMethod === 'cash' 
        ? Math.round(parseFloat(cashReceived) - totalRounded) 
        : 0;
      const cashReceivedRounded = selectedPaymentMethod === 'cash' 
        ? Math.round(parseFloat(cashReceived)) 
        : totalRounded;
      await addDoc(collection(db, 'orders'), {
        id: receiptNumber,
        date: now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items: orderItems,
        total: totalRounded,
        paymentMethod: selectedPaymentMethod,
        change: changeRounded,
        cashier: currentUser.email,
        cashReceived: cashReceivedRounded,
        createdAt: now,
        storeName: "ATAYATOKO",
        storeAddress: "Jl. Raya Utama No. 123",
        storePhone: "(021) 1234-5678"
      });
      const receipt = {
        id: receiptNumber,
        date: now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        time: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        items: orderItems,
        total: totalRounded,
        paymentMethod: selectedPaymentMethod,
        change: changeRounded,
        cashier: currentUser.email,
        cashReceived: cashReceivedRounded,
        storeName: "ATAYATOKO",
        storeAddress: "Jl. Pandan 98, Semen, Kediri",
        storePhone: "085790565666"
      };
      setReceiptData(receipt);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
      clearCart();
      setCashReceived('');
    } catch (err) {
      console.error('Error:', err);
      alert('Gagal memproses transaksi!');
    }
  };
  const printReceipt = () => {
    if (!receiptData) return;
    const commands = `
\x1B\x40
\x1B\x61\x01
${receiptData.storeName}
${receiptData.storeAddress}
Telp: ${receiptData.storePhone}
------------------------
${receiptData.date} ${receiptData.time}
No. Struk: ${receiptData.id}
Kasir: ${receiptData.cashier}
------------------------
Barang        Qty  Total
------------------------
${receiptData.items.map(item => 
  `${item.name.substring(0, 15).padEnd(15)} ${item.quantity.toString().padStart(3)} ${formatRupiah(item.price * item.quantity).replace('Rp', '').replace(/\s/g, '').padStart(8)}`
).join('\n')}
------------------------
TOTAL         ${formatRupiah(receiptData.total).replace('Rp', '').replace(/\s/g, '').padStart(12)}
------------------------
BAYAR         ${formatRupiah(
  receiptData.paymentMethod === 'cash' 
    ? receiptData.cashReceived 
    : receiptData.total
).replace('Rp', '').replace(/\s/g, '').padStart(12)}
KEMBALI       ${formatRupiah(receiptData.change).replace('Rp', '').replace(/\s/g, '').padStart(12)}
------------------------
TERIMA KASIH
${receiptData.storeName}
\x1D\x56\x41\x10
    `.trim();
    if (window.thermalPrinter) {
      window.thermalPrinter.printText(commands);
    } else {
      window.print();
    }
  };
  // === PRODUCT MANAGEMENT ===
  const handleEditProduct = (product) => {
    setEditingProduct({ ...product });
  };
  const handleSaveProduct = async () => {
    if (editingProduct) {
      try {
        await updateDoc(doc(db, 'products', editingProduct.id), editingProduct);
        setEditingProduct(null);
      } catch (err) {
        alert('Gagal mengupdate produk!');
      }
    }
  };
  const handleDeleteProduct = async (id) => {
    if (window.confirm('Hapus produk ini?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (err) {
        alert('Gagal menghapus produk!');
      }
    }
  };
  const handleAddProduct = async () => {
    if (newProduct.name && (newProduct.priceEcer || newProduct.priceGrosir)) {
      try {
        let sku = newProduct.sku?.trim();
        if (!sku) {
          const timestamp = Date.now().toString(36).toUpperCase();
          sku = `SKU-${timestamp}`;
        }
        const skuExists = products.some(p => p.sku === sku);
        if (skuExists) {
          alert('SKU sudah digunakan!');
          return;
        }
        const barcode = newProduct.barcode?.trim() || generateBarcode(sku);
        await addDoc(collection(db, 'products'), {
          ...newProduct,
          sku,
          barcode,
          hargaBeli: parseFloat(newProduct.hargaBeli) || 0,
          priceEcer: parseFloat(newProduct.priceEcer) || 0,
          priceGrosir: parseFloat(newProduct.priceGrosir) || 0,
          stock: parseInt(newProduct.stock) || 0,
          createdAt: new Date()
        });
        setNewProduct({
          name: '',
          hargaBeli: 0,
          priceEcer: 0,
          priceGrosir: 0,
          stock: 0,
          supplier: '',
          category: 'makanan',
          imageUrl: '',
          sku: '',
          barcode: ''
        });
      } catch (err) {
        alert('Gagal menambah produk!');
      }
    }
  };
  // ✅ HAPUS PRODUK TERPILIH
  const handleDeleteSelected = async () => {
    if (selectedProducts.length === 0) {
      alert('Tidak ada produk yang dipilih!');
      return;
    }
    const confirmed = window.confirm(
      `Yakin ingin menghapus ${selectedProducts.length} produk yang dipilih? Aksi ini tidak bisa dikembalikan.`
    );
    if (!confirmed) return;
    try {
      const batch = writeBatch(db);
      selectedProducts.forEach(id => {
        batch.delete(doc(db, 'products', id));
      });
      await batch.commit();
      alert(`Berhasil menghapus ${selectedProducts.length} produk!`);
      setSelectedProducts([]);
    } catch (err) {
      console.error('Error:', err);
      alert('Gagal menghapus produk terpilih!');
    }
  };
  // IMPORT / EXPORT (tidak diubah)
  const handleImportExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'].includes(file.type)) {
      setImportStatus({
        show: true,
        message: 'Format file tidak didukung. Gunakan .xlsx atau .xls',
        error: true
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        if (jsonData.length === 0) {
          throw new Error('File Excel kosong!');
        }
        const requiredColumns = ['nama', 'harga_ecer', 'stok'];
        const missingColumns = requiredColumns.filter(col => !jsonData[0].hasOwnProperty(col));
        if (missingColumns.length > 0) {
          throw new Error(`Kolom wajib tidak ditemukan: ${missingColumns.join(', ')}`);
        }
        const skusInFile = new Set();
        for (const row of jsonData) {
          const sku = String(row.sku || '').trim() || `SKU-${Date.now().toString(36).toUpperCase()}`;
          if (skusInFile.has(sku)) {
            throw new Error(`SKU duplikat ditemukan di file: ${sku}`);
          }
          skusInFile.add(sku);
        }
        const batch = writeBatch(db);
        let count = 0;
        for (const row of jsonData) {
          const sku = String(row.sku || '').trim() || `SKU-${Date.now().toString(36).toUpperCase()}`;
          const barcode = String(row.barcode || '').trim() || generateBarcode(sku);
          const product = {
            name: String(row.nama || row.name || '').trim(),
            hargaBeli: Number(row.harga_beli) || 0,
            priceEcer: Number(row.harga_ecer) || 0,
            priceGrosir: Number(row.harga_grosir) || 0,
            stock: Number(row.stok) || 0,
            supplier: String(row.supplier || '').trim(),
            category: String(row.kategori || row.category || 'makanan').toLowerCase(),
            imageUrl: String(row.foto || row.imageUrl || ''),
            sku,
            barcode,
            createdAt: new Date()
          };
          if (!product.name) continue;
          const docRef = doc(collection(db, 'products'));
          batch.set(docRef, product);
          count++;
        }
        if (count === 0) {
          throw new Error('Tidak ada data produk valid untuk diimpor!');
        }
        await batch.commit();
        setImportStatus({
          show: true,
          message: `Berhasil mengimpor ${count} produk!`,
          error: false
        });
        e.target.value = '';
        setTimeout(() => setImportStatus({ show: false, message: '', error: false }), 3000);
      } catch (err) {
        console.error('Import error:', err);
        setImportStatus({
          show: true,
          message: `Gagal mengimpor: ${err.message}`,
          error: true
        });
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };
  const exportProducts = () => {
    const data = products.map(product => ({
      'sku': product.sku || '',
      'barcode': product.barcode || '',
      'nama': product.name || '',
      'kategori': product.category || 'makanan',
      'harga_beli': product.hargaBeli || 0,
      'harga_ecer': product.priceEcer || 0,
      'harga_grosir': product.priceGrosir || 0,
      'stok': product.stock || 0,
      'supplier': product.supplier || '',
      'foto': product.imageUrl || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Produk");
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const col = XLSX.utils.decode_col(XLSX.utils.encode_col(C));
      ws['!cols'] = ws['!cols'] || [];
      ws['!cols'][C] = { wch: 15 };
    }
    XLSX.writeFile(wb, "produk_atayatoko.xlsx");
  };
  const exportSalesReport = () => {
    const data = salesReport.map(order => ({
      'No. Struk': order.id || '',
      'Tanggal': order.date || '',
      'Jam': order.time || '',
      'Kasir': order.cashier || '',
      'Total': order.total || 0,
      'Metode Bayar': 
        order.paymentMethod === 'cash' ? 'Tunai' :
        order.paymentMethod === 'card' ? 'Kartu Kredit' : 'E-Wallet',
      'Item': order.items?.map(i => `${i.name} x${i.quantity}`).join('; ') || ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Laporan Penjualan");
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const col = XLSX.utils.decode_col(XLSX.utils.encode_col(C));
      ws['!cols'] = ws['!cols'] || [];
      ws['!cols'][C] = { wch: 18 };
    }
    XLSX.writeFile(wb, `laporan_penjualan_${reportPeriod}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };
  const handleMassUpdate = async () => {
    if (selectedProducts.length === 0) {
      alert('Pilih minimal 1 produk!');
      return;
    }
    const updates = {};
    if (massUpdate.priceEcer !== '') updates.priceEcer = parseFloat(massUpdate.priceEcer);
    if (massUpdate.priceGrosir !== '') updates.priceGrosir = parseFloat(massUpdate.priceGrosir);
    if (massUpdate.stock !== '') updates.stock = parseInt(massUpdate.stock);
    if (Object.keys(updates).length === 0) {
      alert('Isi minimal 1 field untuk update!');
      return;
    }
    try {
      const batch = writeBatch(db);
      selectedProducts.forEach(id => {
        const productRef = doc(db, 'products', id);
        batch.update(productRef, updates);
      });
      await batch.commit();
      alert(`Berhasil update ${selectedProducts.length} produk!`);
      setSelectedProducts([]);
      setMassUpdate({ priceEcer: '', priceGrosir: '', stock: '' });
    } catch (err) {
      alert('Gagal update massal!');
    }
  };
  const toggleSelectProduct = (id) => {
    setSelectedProducts(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    );
  };
  const startScanner = () => {
    setIsScannerOpen(true);
    setScannerError('');
    const html5QrCode = new Html5Qrcode("barcode-scanner");
    html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      (scannedText) => {
        const product = products.find(p => p.barcode === scannedText);
        if (product) {
          addToCart(product);
          alert(`${product.name} ditambahkan ke keranjang!`);
        } else {
          setScannerError('Produk tidak ditemukan untuk barcode ini!');
        }
        html5QrCode.stop();
        setIsScannerOpen(false);
      },
      (error) => {}
    ).catch((err) => {
      setScannerError('Gagal mengakses kamera. Izinkan akses kamera di browser.');
      setIsScannerOpen(false);
    });
  };
  const stopScanner = () => {
    setIsScannerOpen(false);
  };
  // === PAGINATION ===
  const [currentPage, setCurrentPage] = useState(1);
  const PRODUCTS_PER_PAGE = 500;
  const categories = ['all', 'makanan', 'minuman', 'kebersihan', 'perawatan'];
  const paymentMethods = [
    { id: 'cash', name: 'Tunai', icon: 'fas fa-money-bill-wave' },
    { id: 'card', name: 'Kartu Kredit', icon: 'fas fa-credit-card' },
    { id: 'e-wallet', name: 'E-Wallet', icon: 'fas fa-wallet' }
  ];
  const totalSales = salesReport.reduce((sum, order) => sum + order.total, 0);
  const totalOrders = salesReport.length;
  const avgOrder = totalOrders > 0 ? totalSales / totalOrders : 0;
  if (!currentUser) return <div className="p-6">Loading...</div>;
  // Hitung produk untuk halaman ini
  const indexOfLastProduct = currentPage * PRODUCTS_PER_PAGE;
  const indexOfFirstProduct = indexOfLastProduct - PRODUCTS_PER_PAGE;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  // Cek apakah semua produk di halaman ini dipilih
  const isAllSelectedInPage = currentProducts.length > 0 && 
    currentProducts.every(p => selectedProducts.includes(p.id));
  // Handler "Pilih Semua" (hanya halaman ini)
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const currentPageIds = currentProducts.map(p => p.id);
      const newSet = new Set([...selectedProducts, ...currentPageIds]);
      setSelectedProducts(Array.from(newSet));
    } else {
      const currentPageIds = new Set(currentProducts.map(p => p.id));
      setSelectedProducts(selectedProducts.filter(id => !currentPageIds.has(id)));
    }
  };
  return (
    <>
      <Head>
        <title>ATAYATOKO - Admin POS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <script src="https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>{`
          body { font-family: 'Poppins', Tahoma, Geneva, Verdana, sans-serif; }
          @media print {
            body * { visibility: hidden; }
            #receipt, #receipt * { visibility: visible; }
            #receipt { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      </Head>
      {importStatus.show && (
        <div className={`fixed top-24 right-6 p-4 rounded-lg shadow-lg z-50 ${
          importStatus.error ? 'bg-red-100 border-l-4 border-red-500 text-red-700' : 'bg-green-100 border-l-4 border-green-500 text-green-700'
        }`}>
          <p className="font-medium">{importStatus.message}</p>
        </div>
      )}
      {/* HEADER */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center">
            <div className="bg-indigo-600 p-2 rounded-lg mr-3">
              <i className="fas fa-cash-register text-white text-xl"></i>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ATAYATOKO - POS</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            {activeTab === 'pos' && (
              <button
                onClick={startScanner}
                className="bg-green-600 hover:bg-green-700 text-white p-2.5 rounded-full"
                title="Scan Barcode"
              >
                <i className="fas fa-barcode"></i>
              </button>
            )}
            <div className="flex bg-gray-100 rounded-lg p-1 text-xs sm:text-sm">
              {['pos', 'backoffice', 'reports'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab === 'pos' ? 'POS' : tab === 'backoffice' ? 'Produk' : 'Laporan'}
                </button>
              ))}
            </div>
            <button
              onClick={() => signOut(auth).then(() => router.push('/'))}
              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      {activeTab === 'pos' && lowStockItems.length > 0 && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 mx-4 sm:mx-6">
          <p className="font-bold">⚠️ Stok Rendah!</p>
          <p>{lowStockItems.length} produk perlu restok segera.</p>
        </div>
      )}
      {activeTab === 'pos' && (
        <div className="flex flex-col lg:flex-row">
          <div className="w-full lg:w-2/3 xl:w-3/4 p-4 sm:p-6">
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="relative flex-1">
                  <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                  <input
                    type="text"
                    placeholder="Cari produk, SKU, atau barcode..."
                    className="w-full pl-10 pr-4 py-2.5 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-base"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                        selectedCategory === category
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {category === 'all' ? 'Semua' : category}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className="border border-gray-200 rounded-lg p-3 hover:shadow-md cursor-pointer bg-white"
                    onClick={() => addToCart(product)}
                  >
                    <div className="flex justify-center mb-2">
                      <img
                        src={product.imageUrl || '/placeholder.webp'}
                        alt={product.name}
                        className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded"
                        loading="lazy"
                        onError={(e) => e.target.src = '/placeholder.webp'}
                      />
                    </div>
                    <h3 className="text-xs sm:text-sm font-medium text-center mb-1 truncate">{product.name}</h3>
                    <p className="text-indigo-600 font-bold text-center text-xs sm:text-sm">{formatRupiah(product.priceEcer)}</p>
                    <div className="text-[10px] sm:text-xs text-gray-600 text-center mt-1">
                      Stok: {product.stock}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="w-full lg:w-1/3 xl:w-1/4 p-4 sm:p-6">
            <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Keranjang</h2>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-red-600 hover:text-red-800 text-xs sm:text-sm font-medium"
                  >
                    Kosongkan
                  </button>
                )}
              </div>
              {cart.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <i className="fas fa-shopping-cart text-2xl sm:text-3xl text-gray-400 mb-3"></i>
                  <p className="text-gray-500 text-sm sm:text-base">Keranjang kosong</p>
                </div>
              ) : (
                <>
                  <div className="space-y-3 max-h-80 sm:max-h-96 overflow-y-auto mb-4 sm:mb-6">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-2.5 sm:p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center">
                          <img
                            src={item.imageUrl || '/placeholder.webp'}
                            alt={item.name}
                            className="w-9 h-9 sm:w-10 sm:h-10 object-cover rounded mr-2 sm:mr-3"
                            onError={(e) => e.target.src = '/placeholder.webp'}
                          />
                          <div>
                            <p className="font-medium text-gray-900 text-xs sm:text-sm">{item.name}</p>
                            <p className="text-indigo-600 font-medium text-xs">{formatRupiah(item.price)}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-1.5 min-w-[32px] min-h-[32px] rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                          >
                            <i className="fas fa-minus text-[10px]"></i>
                          </button>
                          <span className="font-medium w-7 text-center text-xs">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-1.5 min-w-[32px] min-h-[32px] rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                          >
                            <i className="fas fa-plus text-[10px]"></i>
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-1.5 min-w-[32px] min-h-[32px] rounded-full bg-red-100 hover:bg-red-200 ml-1.5"
                          >
                            <i className="fas fa-times text-[10px] text-red-600"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-gray-200 pt-3 sm:pt-4 space-y-2">
                    <div className="flex justify-between text-base font-bold">
                      <span>Total:</span>
                      <span>{formatRupiah(cartTotal)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPaymentModalOpen(true)}
                    disabled={cart.length === 0 || cart.some(item => item.quantity > item.stock)}
                    className={`w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl font-bold text-sm sm:text-base mt-4 ${
                      cart.length === 0 || cart.some(item => item.quantity > item.stock)
                        ? 'bg-gray-400 text-gray-700 cursor-not-allowed'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-700 text-white hover:from-indigo-700 hover:to-purple-800 shadow-lg'
                    }`}
                  >
                    {cart.some(item => item.quantity > item.stock)
                      ? 'Stok Tidak Cukup!'
                      : `Bayar ${formatRupiah(cartTotal)}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ✅ TAB PRODUK DENGAN PAGINASI & HAPUS TERPILIH */}
      {activeTab === 'backoffice' && (
        <div className="p-4 sm:p-6">
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-0">Manajemen Produk</h2>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                <button
                  onClick={exportProducts}
                  className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm"
                >
                  <i className="fas fa-file-export mr-1.5 sm:mr-2"></i>
                  Ekspor
                </button>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  className="hidden"
                  id="importExcel"
                />
                <label
                  htmlFor="importExcel"
                  className="flex items-center justify-center bg-green-600 hover:bg-green-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm cursor-pointer"
                >
                  <i className="fas fa-file-import mr-1.5 sm:mr-2"></i>
                  Impor
                </label>
              </div>
            </div>
            <div className="border border-gray-200 rounded-xl p-4 mb-4 sm:mb-6 bg-gray-50">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">Tambah Produk Baru</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                {[
                  { key: 'name', placeholder: 'Nama Produk', type: 'text' },
                  { key: 'sku', placeholder: 'SKU (opsional)', type: 'text' },
                  { key: 'barcode', placeholder: 'Barcode (opsional)', type: 'text' },
                  { key: 'priceEcer', placeholder: 'Harga Ecer', type: 'number' },
                  { key: 'stock', placeholder: 'Stok', type: 'number' },
                  { key: 'hargaBeli', placeholder: 'Harga Beli', type: 'number' },
                  { key: 'priceGrosir', placeholder: 'Harga Grosir', type: 'number' },
                  { key: 'supplier', placeholder: 'Supplier', type: 'text' },
                  { key: 'category', placeholder: 'Kategori', type: 'select' },
                  { key: 'imageUrl', placeholder: 'URL Foto', type: 'text' }
                ].map(({ key, placeholder, type }) => (
                  type === 'select' ? (
                    <select
                      key={key}
                      className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      value={newProduct[key]}
                      onChange={(e) => setNewProduct({...newProduct, [key]: e.target.value})}
                    >
                      <option value="makanan">Makanan</option>
                      <option value="minuman">Minuman</option>
                      <option value="kebersihan">Kebersihan</option>
                      <option value="perawatan">Perawatan</option>
                    </select>
                  ) : (
                    <input
                      key={key}
                      type={type}
                      placeholder={placeholder}
                      className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      value={newProduct[key]}
                      onChange={(e) => setNewProduct({...newProduct, [key]: e.target.value})}
                    />
                  )
                ))}
              </div>
              <button
                onClick={handleAddProduct}
                className="mt-3 sm:mt-4 bg-green-600 hover:bg-green-700 text-white px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium"
              >
                Tambah Produk
              </button>
            </div>
            {/* FILTER */}
            <div className="mb-4 flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Cari produk, SKU, atau barcode..."
                className="flex-1 min-w-[150px] px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <select
                className="px-2 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">Semua Kategori</option>
                <option value="makanan">Makanan</option>
                <option value="minuman">Minuman</option>
                <option value="kebersihan">Kebersihan</option>
                <option value="perawatan">Perawatan</option>
              </select>
            </div>
            {/* TABEL + PAGINASI + AKSI MASSAL */}
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full min-w-[600px] text-xs sm:text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="px-2 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={isAllSelectedInPage}
                        onChange={handleSelectAll}
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </th>
                    <th className="px-2 py-2 text-left">SKU</th>
                    <th className="px-2 py-2 text-left">Produk</th>
                    <th className="px-2 py-2 text-left">Kategori</th>
                    <th className="px-2 py-2 text-left">Harga</th>
                    <th className="px-2 py-2 text-left">Stok</th>
                    <th className="px-2 py-2 text-left">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {currentProducts.map(product => (
                    <tr key={product.id} className="border-b border-gray-200 hover:bg-gray-50">
                      {editingProduct && editingProduct.id === product.id ? (
                        <td colSpan="7" className="px-2 py-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              className="px-2 py-1 border rounded text-xs w-24"
                              value={editingProduct.name}
                              onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                            />
                            <input
                              type="number"
                              className="px-2 py-1 border rounded text-xs w-20"
                              value={editingProduct.priceEcer}
                              onChange={(e) => setEditingProduct({...editingProduct, priceEcer: e.target.value})}
                            />
                            <input
                              type="number"
                              className="px-2 py-1 border rounded text-xs w-16"
                              value={editingProduct.stock}
                              onChange={(e) => setEditingProduct({...editingProduct, stock: e.target.value})}
                            />
                            <button
                              onClick={handleSaveProduct}
                              className="p-1 bg-green-600 text-white rounded text-xs"
                            >
                              Simpan
                            </button>
                            <button
                              onClick={() => setEditingProduct(null)}
                              className="p-1 bg-gray-600 text-white rounded text-xs"
                            >
                              Batal
                            </button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selectedProducts.includes(product.id)}
                              onChange={() => toggleSelectProduct(product.id)}
                            />
                          </td>
                          <td className="px-2 py-2 font-mono text-xs">{product.sku || '-'}</td>
                          <td className="px-2 py-2">
                            <div className="flex items-center">
                              <img
                                src={product.imageUrl || '/placeholder.webp'}
                                alt={product.name}
                                className="w-7 h-7 object-cover rounded mr-2"
                                onError={(e) => e.target.src = '/placeholder.webp'}
                              />
                              <span className="text-xs">{product.name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-xs">{product.category}</td>
                          <td className="px-2 py-2 text-indigo-600 font-medium text-xs">{formatRupiah(product.priceEcer)}</td>
                          <td className="px-2 py-2 text-xs">{product.stock}</td>
                          <td className="px-2 py-2">
                            <div className="flex space-x-1">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="p-1 bg-blue-600 text-white rounded text-[10px]"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(product.id)}
                                className="p-1 bg-red-600 text-white rounded text-[10px]"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* PAGINASI */}
            {totalPages > 1 && (
              <div className="flex flex-wrap justify-center mt-4 gap-1 sm:gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm ${
                    currentPage === 1 
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                      : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                  }`}
                >
                  Sebelumnya
                </button>
                <span className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-gray-600">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm ${
                    currentPage === totalPages 
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed' 
                      : 'bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50'
                  }`}
                >
                  Berikutnya
                </button>
              </div>
            )}
            {/* PANEL AKSI MASSAL */}
            {selectedProducts.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-bold text-xs mb-2">
                  {selectedProducts.length} produk dipilih
                </h3>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input
                    type="number"
                    placeholder="Harga Ecer"
                    className="px-2 py-1 border rounded text-xs"
                    value={massUpdate.priceEcer}
                    onChange={(e) => setMassUpdate({...massUpdate, priceEcer: e.target.value})}
                  />
                  <input
                    type="number"
                    placeholder="Harga Grosir"
                    className="px-2 py-1 border rounded text-xs"
                    value={massUpdate.priceGrosir}
                    onChange={(e) => setMassUpdate({...massUpdate, priceGrosir: e.target.value})}
                  />
                  <input
                    type="number"
                    placeholder="Stok"
                    className="px-2 py-1 border rounded text-xs"
                    value={massUpdate.stock}
                    onChange={(e) => setMassUpdate({...massUpdate, stock: e.target.value})}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleMassUpdate}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs"
                  >
                    Update
                  </button>
                  <button
                    onClick={handleDeleteSelected}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs flex items-center"
                  >
                    <i className="fas fa-trash mr-1 text-[10px]"></i>
                    Hapus
                  </button>
                  <button
                    onClick={() => setSelectedProducts([])}
                    className="bg-gray-600 text-white px-3 py-1.5 rounded text-xs"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'reports' && (
        <div className="p-4 sm:p-6">
          <div className="bg-white rounded-xl shadow-sm p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">Laporan Penjualan</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {['today', 'week', 'month'].map(period => (
                <button
                  key={period}
                  onClick={() => setReportPeriod(period)}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm ${
                    reportPeriod === period
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {period === 'today' ? 'Hari Ini' : 
                   period === 'week' ? '7 Hari' : '30 Hari'}
                </button>
              ))}
              <button
                onClick={exportSalesReport}
                className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm flex items-center"
              >
                <i className="fas fa-file-excel mr-1.5"></i>
                Ekspor
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
              <div className="bg-green-50 p-3 rounded-lg">
                <h3 className="text-xs sm:text-sm text-gray-600">Total Penjualan</h3>
                <p className="text-base sm:text-lg font-bold text-green-700">{formatRupiah(totalSales)}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <h3 className="text-xs sm:text-sm text-gray-600">Transaksi</h3>
                <p className="text-base sm:text-lg font-bold text-blue-700">{totalOrders}</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <h3 className="text-xs sm:text-sm text-gray-600">Rata-rata</h3>
                <p className="text-base sm:text-lg font-bold text-purple-700">
                  {totalOrders > 0 ? formatRupiah(avgOrder) : 'Rp0'}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs sm:text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2">No. Struk</th>
                    <th className="text-left p-2">Tanggal</th>
                    <th className="text-left p-2">Kasir</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-left p-2">Metode</th>
                  </tr>
                </thead>
                <tbody>
                  {salesReport.map(order => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-mono text-xs">{order.id}</td>
                      <td className="p-2 text-xs">{order.date} {order.time}</td>
                      <td className="p-2 text-xs">{order.cashier}</td>
                      <td className="p-2 text-right font-medium text-xs">{formatRupiah(order.total)}</td>
                      <td className="p-2 text-xs">
                        {order.paymentMethod === 'cash' ? 'Tunai' : 
                         order.paymentMethod === 'card' ? 'Kartu' : 'E-Wallet'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* MODAL (tidak diubah) */}
      {isPaymentModalOpen && (
        {/* ... isi modal ... */}
      )}
      {isReceiptModalOpen && (
        {/* ... isi modal struk ... */}
      )}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded-lg relative">
            <button
              onClick={stopScanner}
              className="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center"
            >
              ✕
            </button>
            <div id="barcode-scanner" className="w-64 h-64"></div>
            {scannerError && (
              <p className="text-red-500 mt-2 text-center">{scannerError}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}