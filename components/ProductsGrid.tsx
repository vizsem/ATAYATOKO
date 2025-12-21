"use client";

import { useState } from "react";
import { products } from "@/data/products";
import ProductCard from "./ProductCard";

export default function ProductsGrid() {
  const [role, setRole] = useState<"pembeli" | "reseller">("pembeli");

  console.log("JUMLAH PRODUK:", products.length);

  return (
    <section className="py-12 bg-gray-50">
      <div className="container mx-auto px-4">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Produk</h2>

          <select
            className="border rounded px-3 py-1"
            value={role}
            onChange={(e) =>
              setRole(e.target.value as "pembeli" | "reseller")
            }
          >
            <option value="pembeli">Pembeli (Ecer)</option>
            <option value="reseller">Reseller (Grosir)</option>
          </select>
        </div>

        {/* GRID PRODUK */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 border-4 border-green-500">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              role={role}
            />
          ))}
        </div>

      </div>
    </section>
  );
}
