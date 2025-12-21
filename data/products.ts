export type Product = {
  id: number;
  name: string;
  category: string;
  image: string;
  priceEcer: number;
  priceGrosir: number;
};

export const products: Product[] = [
  {
    id: 1,
    name: "Indomie Goreng",
    category: "makanan",
    image: "https://placehold.co/300x300?text=Indomie",
    priceEcer: 3500,
    priceGrosir: 2800,
  },
  {
    id: 2,
    name: "Aqua 600ml",
    category: "minuman",
    image: "https://placehold.co/300x300?text=Aqua",
    priceEcer: 4000,
    priceGrosir: 3200,
  },
  {
    id: 3,
    name: "Sari Roti",
    category: "makanan",
    image: "https://placehold.co/300x300?text=Sari+Roti",
    priceEcer: 12000,
    priceGrosir: 9500,
  },
];
