import { Product } from "@/data/products";

type Props = {
  product: Product;
  role: "pembeli" | "reseller";
};

export default function ProductCard({ product, role }: Props) {
  const price =
    role === "pembeli" ? product.priceEcer : product.priceGrosir;

  return (
    <div className="bg-white rounded-xl shadow hover:shadow-lg transition">
      <img
        src={product.image}
        alt={product.name}
        className="w-full h-40 object-cover rounded-t-xl"
      />

      <div className="p-4">
        <h3 className="font-semibold text-sm mb-2">
          {product.name}
        </h3>

        <p className="text-indigo-600 font-bold">
          Rp {price.toLocaleString("id-ID")}
        </p>

        <button
          className="mt-3 w-full bg-indigo-600 text-white py-2 rounded-lg text-sm 
hover:bg-indigo-700"
        >
          Tambah ke Keranjang
        </button>
      </div>
    </div>
  );
}

