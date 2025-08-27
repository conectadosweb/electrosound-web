// ==== public/assets/js/data.js ====
export async function fetchProducts() {
  const res = await fetch('/api/products');
  if (!res.ok) throw new Error("No se pudieron cargar los productos");
  return await res.json();
}