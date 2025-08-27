import { renderProducts as renderUiProducts, showNotification } from "./ui.js";

// --- Variables Globales ---
let allProducts = [];
let products = [];
let cart = [];
let userEmail = localStorage.getItem("userEmail");
let userName = localStorage.getItem("userName");
const whatsappCel = "5493535623051";

// Variables para la carga infinita y filtrado
let currentPage = 1;
const PRODUCTS_PER_PAGE = 12;
let isLoadingMoreProducts = false;
let hasMoreProductsToLoad = true;
let currentFilter = 'all';
let currentSearchQuery = '';

// Referencias a elementos del DOM
const productsContainer = document.getElementById('products-container');
const loadingSpinner = document.getElementById('loading-spinner');
const modal = document.getElementById("product-modal");
const modalBody = document.getElementById("modal-body");
const cartIcon = document.getElementById("cart-icon");
const cartModal = document.getElementById("cart-modal");
const cartItemsContainer = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");
const closeSessionBtn = document.getElementById("close-session-btn");
const whatsappBtnPurchase = document.getElementById("whatsapp-purchase-btn");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const darkToggleInput = document.getElementById("dark-mode-toggle");
const darkmodeToggleDiv = document.querySelector(".darkmode-toggle");

// Medimos/animamos SIEMPRE el mismo elemento
const headerElement = document.querySelector("header");
const htmlRoot = document.documentElement;

window.updateCart = updateCart;
window.cargarCarritoDesdeServidor = cargarCarritoDesdeServidor;
window.showProductDetails = showProductDetails;

/* ===== Helpers back button / modales ===== */
const BACK_DOUBLE_WINDOW = 1500; // ms
const isMobileUA = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isMobileViewport = () => window.matchMedia("(max-width: 900px)").matches;
const hasActiveTextFilter = () => !!(currentSearchQuery && currentSearchQuery.trim().length > 0);
const hasActiveCategoryFilter = () => currentFilter && currentFilter !== 'all';
const hasAnyFilterActive = () => hasActiveTextFilter() || hasActiveCategoryFilter();

const getAllModalOverlays = () => [
  ...document.querySelectorAll('.modal'),
  ...document.querySelectorAll('.login-overlay')
];

const isVisible = (el) => {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const isAnyModalOpen = () => getAllModalOverlays().some(isVisible);

const showBackToast = (msg = 'Presiona atrás nuevamente para salir') => {
  const toast = document.getElementById('back-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(showBackToast._t);
  showBackToast._t = setTimeout(() => toast.classList.add('hidden'), 1200);
};

// --- Utilidades de ancla de productos / scroll ---
function ensureProductsTopSentinel() {
  if (!productsContainer || !productsContainer.parentNode) return null;
  let s = document.getElementById('products-top-sentinel');
  if (!s) {
    s = document.createElement('div');
    s.id = 'products-top-sentinel';
    s.style.cssText = 'height:1px; margin:0; padding:0;';
    productsContainer.parentNode.insertBefore(s, productsContainer);
  }
  return s;
}

function getAbsoluteTopY(el) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return rect.top + window.scrollY;
}

function getExpandAnchorY() {
  // Punto a partir del cual permitimos expandir el header en móviles
  const s = ensureProductsTopSentinel();
  return getAbsoluteTopY(s);
}

function scrollToProductsTop(smooth = true) {
  const anchorY = getExpandAnchorY();
  const target = Math.max(anchorY - 2, 0);
  window.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
}

function setNoResultsMessage(show) {
  if (!productsContainer) return;
  const cls = 'no-results-message';
  const noMoreCls = 'no-more-products-message';
  let el = productsContainer.querySelector(`.${cls}`);
  if (show) {
    // Quitar mensaje de "no hay más" para no confundir
    const noMore = productsContainer.querySelector(`.${noMoreCls}`);
    if (noMore) noMore.remove();
    if (!el) {
      el = document.createElement('div');
      el.className = cls;
      el.textContent = 'No se encontraron productos filtrados.';
      el.style.cssText = 'grid-column:1 / -1; text-align:center; margin:20px 0; color: var(--dark-color); opacity:.7;';
      productsContainer.appendChild(el);
    }
  } else {
    if (el) el.remove();
  }
}

// --- Lógica de Carga Infinita de Productos ---
async function fetchAndRenderProducts(page, limit, filter = 'all', clearExisting = false, query = '') {
  if (isLoadingMoreProducts || (!hasMoreProductsToLoad && !clearExisting)) {
    return [];
  }
  isLoadingMoreProducts = true;
  loadingSpinner.style.display = 'block';

  try {
    let apiUrl = `/api/products?page=${page}&limit=${limit}`;
    if (filter !== 'all') apiUrl += `&filter=${filter}`;
    if (query) apiUrl += `&q=${encodeURIComponent(query)}`;

    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const newProducts = await response.json();
    loadingSpinner.style.display = 'none';

    // Limpiar mensajes de "sin resultados" al volver a renderizar
    if (clearExisting) setNoResultsMessage(false);

    renderUiProducts(newProducts, productsContainer, filter, clearExisting ? 'replace' : 'append');

    if (newProducts.length === 0 || newProducts.length < limit) {
      hasMoreProductsToLoad = false;
      if (productsContainer.childElementCount > 0 && !productsContainer.querySelector('.no-more-products-message') && !query) {
        const noMoreDiv = document.createElement('div');
        noMoreDiv.textContent = 'No hay más productos para mostrar.';
        noMoreDiv.classList.add('no-more-products-message');
        noMoreDiv.style.cssText = 'grid-column: 1 / -1; text-align: center; margin-top: 20px; color: var(--dark-color); opacity: 0.7;';
        productsContainer.appendChild(noMoreDiv);
      }
    } else {
      hasMoreProductsToLoad = true;
      const noMoreMessage = productsContainer.querySelector('.no-more-products-message');
      if (noMoreMessage) noMoreMessage.remove();
    }

    if (newProducts.length > 0 || clearExisting) currentPage++;

    if (clearExisting) {
      products = newProducts;
    } else {
      products = products.concat(newProducts);
    }
    allProducts = products;

    // Señal: se agregaron productos (para estabilizar scroll/header)
    window.dispatchEvent(new CustomEvent('productsAppended'));
    return newProducts;
  } catch (error) {
    console.error('Error al cargar productos:', error);
    loadingSpinner.style.display = 'none';
    showNotification("Error al cargar productos. Intenta de nuevo.", "error");
    hasMoreProductsToLoad = false;
    return [];
  } finally {
    isLoadingMoreProducts = false;
  }
}

function handleInfiniteScroll() {
  const scrollThreshold = document.documentElement.scrollHeight - window.innerHeight - 500;
  if (window.scrollY >= scrollThreshold && !isLoadingMoreProducts && hasMoreProductsToLoad) {
    fetchAndRenderProducts(currentPage, PRODUCTS_PER_PAGE, currentFilter, false, currentSearchQuery);
  }
}

// --- Funciones de UI ---
function mostrarNombreUsuario() {
  const loginBtn = document.querySelector("#login-btn");
  if (userEmail && userName && loginBtn) {
    loginBtn.innerHTML = `<i class="fas fa-user"></i> ${userName}`;
    loginBtn.classList.add("named");
  } else if (loginBtn) {
    loginBtn.innerHTML = `<i class="fas fa-user"></i> Ingresar`;
    loginBtn.classList.remove("named");
  }
}

/* ==== MODALES: abrimos/ cerramos + historial ==== */
function openModal(modalId) {
  const modalElement = document.getElementById(modalId);
  if (modalElement) {
    modalElement.style.display = "flex";
    document.body.style.overflow = "hidden";
    try { history.pushState({ modal: true, id: modalId }, ""); } catch(_) {}
  }
}

function closeModal(modalId, opts = {}) {
  const modalElement = document.getElementById(modalId);
  if (modalElement) {
    modalElement.style.display = "none";
    document.body.style.overflow = "auto";
    const videos = modalElement.querySelectorAll('video');
    videos.forEach(video => { if (!video.paused) video.pause(); });
    if (opts.viaCloseButton) { try { history.back(); } catch(_) {} }
  }
}

// 🔎 Aplicar búsqueda/filtro: ahora es ASÍNCRONA para poder scrollear arriba y mostrar “sin resultados”
async function applySearchAndFilter(query, filter) {
  currentSearchQuery = query;
  currentFilter = filter;
  currentPage = 1;
  hasMoreProductsToLoad = true;
  isLoadingMoreProducts = false;

  if (query) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
    if (allBtn) allBtn.classList.add('active');
  }

  const result = await fetchAndRenderProducts(currentPage, PRODUCTS_PER_PAGE, currentFilter, true, currentSearchQuery);

  // Si estamos buscando, llevar la vista al inicio de productos
  scrollToProductsTop(true);

  // Mostrar mensaje si no hubo coincidencias
  if ((currentSearchQuery && (!result || result.length === 0))) {
    setNoResultsMessage(true);
    hasMoreProductsToLoad = false;
  } else {
    setNoResultsMessage(false);
  }
}

function setupFilterButtons() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      event.target.classList.add("active");
      applySearchAndFilter(searchInput.value.trim(), btn.dataset.filter);
    });
  });
}

function updateCart() {
  const count = cart.reduce((acc, item) => acc + item.quantity, 0);
  document.querySelector(".cart-count").textContent = count;
  const token = localStorage.getItem("jwtToken");
  if (userEmail && token) {
    const normalizedCart = cart.map(item => ({
      id: item.id,
      quantity: item.quantity,
      nombre: item.nombre,
      precio: item.precio,
      imagen: item.imagen,
      disponible: Number(item.disponible) === 1 ? 1 : 0
    }));
    fetch("/api/cart/save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ cart: normalizedCart }),
    }).catch((error) => {
      console.warn("Error al guardar carrito:", error);
      if (error.status === 401 || error.status === 403) {
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userName");
        localStorage.removeItem("jwtToken");
        localStorage.removeItem("isAdmin");
        location.reload();
      }
    });
  }
}

function cargarCarritoDesdeServidor() {
  const token = localStorage.getItem("jwtToken");
  if (!token) {
    console.warn("No hay token JWT, no se puede cargar el carrito desde el servidor.");
    return;
  }
  fetch(`/api/cart/`, { headers: { "Authorization": `Bearer ${token}` }})
    .then((res) => { if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`); return res.json(); })
    .then((data) => {
      const itemsGuardados = data.carrito || [];
      cart = itemsGuardados.map((itemGuardado) => {
        const productoActual = allProducts.find((p) => p.id === itemGuardado.id);
        if (productoActual) {
          return { ...productoActual, quantity: itemGuardado.quantity || 1 };
        } else {
          const disponible = Number(itemGuardado.disponible) === 1 ? 1 : 0;
          return {
            id: itemGuardado.id,
            nombre: itemGuardado.nombre || "Producto desconocido",
            precio: itemGuardado.precio || 0,
            disponible,
            imagen: itemGuardado.imagen ? `data/products/${itemGuardado.id}/${itemGuardado.imagen}` : 'assets/placeholder.webp',
            quantity: itemGuardado.quantity || 1,
          };
        }
      });
      updateCart();
      renderCartItems();
    })
    .catch((err) => {
      console.error("❌ Error al cargar carrito:", err);
      showNotification("Error al cargar carrito", "error");
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userName");
      localStorage.removeItem("jwtToken");
      localStorage.removeItem("isAdmin");
    });
}

function renderCartItems() {
  cartItemsContainer.innerHTML = "";
  let total = 0;
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = "<p class='empty-cart'>Tu carrito está vacío</p>";
    cartTotal.textContent = "$0.00";
    return;
  }
  cart.forEach((item, i) => {
    const disponible = Number(item.disponible) === 1;
    const precioUnitario = disponible ? item.precio : 0;
    const subtotal = precioUnitario * item.quantity;
    total += subtotal;
    const div = document.createElement("div");
    div.className = "cart-item" + (!disponible ? " not-available" : "");
    div.innerHTML = `
      <div class="cart-item-info">
        <h4 class="cart-item-title">${disponible ? item.nombre : `<s>${item.nombre}</s>`}</h4>
        <div class="cart-item-controls">
          <button class="quantity-btn" data-index="${i}" data-type="minus" ${!disponible ? "disabled" : ""}>-</button>
          <span class="cart-item-quantity">${item.quantity}</span>
          <button class="quantity-btn" data-index="${i}" data-type="plus" ${!disponible ? "disabled" : ""}>+</button>
        </div>
        <p class="cart-item-price">${disponible ? `$${item.precio.toFixed(2)} c/u` : "<span class='sin-stock-price'>$0.00 (sin stock)</span>"}</p>
      </div>
      <div class="cart-item-subtotal">
        <p>${disponible ? `$${subtotal.toFixed(2)}` : `<s>$${(item.precio * item.quantity).toFixed(2)}</s>`}</p>
        <button class="cart-item-remove" data-index="${i}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    cartItemsContainer.appendChild(div);
  });
  cartTotal.textContent = `$${total.toFixed(2)}`;
}

let fullscreenOverlay = null;

const closeFullscreenImage = () => {
  if (fullscreenOverlay) {
    fullscreenOverlay.remove();
    fullscreenOverlay = null;
  }
};

export function showProductDetails(product) {
  modalBody.innerHTML = "";
  const modalContent = document.createElement("div");
  modalContent.classList.add("modal-body-container");

  const carouselContainer = document.createElement("div");
  carouselContainer.classList.add("carousel-container");

  const carouselInner = document.createElement("div");
  carouselInner.classList.add("carousel-inner");

  const prevBtn = document.createElement("a");
  prevBtn.classList.add("prev-btn");
  prevBtn.innerHTML = "&#10094;";

  const nextBtn = document.createElement("a");
  nextBtn.classList.add("next-btn");
  nextBtn.innerHTML = "&#10095;";

  const indicatorsContainer = document.createElement("div");
  indicatorsContainer.classList.add("carousel-indicators");

  const thumbnailsContainer = document.createElement("div");
  thumbnailsContainer.className = "carousel-thumbnails";

  let validFiles = [];
  let currentImageIndex = 0;

  const showImage = (index) => {
    const items = carouselInner.querySelectorAll('.carousel-item');
    const indicators = indicatorsContainer.querySelectorAll('.indicator');
    const thumbnails = thumbnailsContainer.querySelectorAll('.thumb-item');

    if (items.length === 0) return;

    const currentVideo = items[currentImageIndex]?.querySelector?.('video');
    if (currentVideo) currentVideo.pause();

    currentImageIndex = (index + items.length) % items.length;

    items.forEach(item => item.classList.remove('active'));
    indicators.forEach(indicator => indicator.classList.remove('active'));
    thumbnails.forEach(thumb => thumb.classList.remove('active'));

    items[currentImageIndex].classList.add('active');
    indicators[currentImageIndex]?.classList?.add('active');
    thumbnails[currentImageIndex]?.classList?.add('active');
  };

  nextBtn.addEventListener('click', () => showImage(currentImageIndex + 1));
  prevBtn.addEventListener('click', () => showImage(currentImageIndex - 1));

  indicatorsContainer.addEventListener('click', (event) => {
    if (event.target.classList.contains('indicator')) {
      const index = Array.from(indicatorsContainer.children).indexOf(event.target);
      showImage(index);
    }
  });

  const addThumbnailAndCarouselItem = (file, index) => {
    const item = document.createElement(file.type === "image" ? "img" : "div");
    item.classList.add("carousel-item");
    if (file.type === "image") {
      item.src = file.path;
      item.alt = `Imagen del producto ${index + 1}`;
      item.onclick = (e) => {
        e.stopPropagation();
        const overlay = document.createElement("div");
        overlay.style.cssText = `
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.9);
          display: flex; justify-content: center; align-items: center;
          z-index: 9999;
        `;
        const fullImg = document.createElement("img");
        fullImg.src = item.src;
        fullImg.style.maxWidth = "90%";
        fullImg.style.maxHeight = "90%";
        fullImg.style.boxShadow = "0 0 20px rgba(255,255,255,0.5)";
        overlay.appendChild(fullImg);
        fullscreenOverlay = overlay;
        overlay.onclick = () => closeFullscreenImage();
        document.body.appendChild(overlay);
      };
    } else {
      const video = document.createElement("video");
      video.src = file.path;
      video.controls = true;
      item.appendChild(video);
    }
    carouselInner.appendChild(item);

    const indicator = document.createElement("span");
    indicator.classList.add("indicator");
    indicatorsContainer.appendChild(indicator);

    const thumb = document.createElement(file.type === "image" ? "img" : "div");
    thumb.className = "thumb-item";
    thumb.title = file.name;
    if (file.type === "image") {
      thumb.src = file.path;
      thumb.alt = `Miniatura de ${file.name}`;
    } else {
      thumb.textContent = "🎬";
      thumb.classList.add("video-thumb");
    }
    thumb.onclick = () => showImage(index);
    thumbnailsContainer.appendChild(thumb);
  };

  const loadProductImages = async () => {
    try {
      const response = await fetch(`/api/products/${product.id}/files`);
      const filesData = response.ok ? await response.json() : [];
      const mainImagePath = product.imagen ? `data/products/${product.id}/${product.imagen}` : 'assets/placeholder.webp';
      validFiles.push({ type: "image", path: mainImagePath, name: "Principal" });
      filesData.forEach(file => {
        const fileExtension = file.split('.').pop().toLowerCase();
        const pathFile = `data/products/${product.id}/${file}`;
        if (mainImagePath === pathFile) return;
        if (fileExtension === "mp4" || fileExtension === "mov") {
          validFiles.push({ type: "video", path: pathFile, name: file });
        } else {
          validFiles.push({ type: "image", path: pathFile, name: file });
        }
      });

      if (validFiles.length > 0) {
        validFiles.forEach(addThumbnailAndCarouselItem);
        if (validFiles.length > 1) {
          carouselContainer.appendChild(prevBtn);
          carouselContainer.appendChild(nextBtn);
          carouselContainer.appendChild(indicatorsContainer);
        }
        modalContent.appendChild(thumbnailsContainer);
        showImage(0);
      } else {
        const placeholder = { type: 'image', path: 'assets/placeholder.webp', name: "Placeholder" };
        validFiles.push(placeholder);
        addThumbnailAndCarouselItem(placeholder, 0);
        showImage(0);
      }
    } catch (error) {
      console.error("Error al cargar archivos de producto:", error);
      showNotification("Error al cargar imágenes del producto.", "error");
      const placeholder = { type: 'image', path: product.imagen ? `data/products/${product.id}/${product.imagen}` : 'assets/placeholder.webp', name: "Principal" };
      validFiles = [placeholder];
      addThumbnailAndCarouselItem(placeholder, 0);
    }
  };

  loadProductImages();

  const details = document.createElement("div");
  details.innerHTML = `
    <h2 class="modal-title">${product.nombre}</h2>
    <p class="modal-price">$${(product.precio || 0).toFixed(2)}</p>
    <p class="modal-description">${product.descripcion || 'No hay descripción disponible.'}</p>
    <div class="modal-actions" style="display: flex; gap: 1rem; margin-top: 1rem;">
      <button class="btn-add-modal-cart btn" data-id="${product.id}" ${product.disponible === 0 ? 'disabled' : ''}>
        <i class="fas fa-cart-plus"></i> ${product.disponible === 0 ? 'Sin stock' : 'Agregar al carrito'}
      </button>
      <button class="btn-whatsapp-modal btn" style="background-color: var(--whatsapp-color);" ${product.disponible === 0 ? 'disabled' : ''}>
        <i class="fab fa-whatsapp"></i> Comprar por WhatsApp
      </button>
    </div>
  `;

  carouselContainer.prepend(carouselInner);
  modalContent.appendChild(carouselContainer);
  modalContent.appendChild(details);
  modalBody.appendChild(modalContent);

  openModal("product-modal");
}

// --- Mediciones seguras del header (sin parpadeos)
function measureHeaderHeightsSafely() {
  if (!headerElement) return { normal: 0, shrink: 0 };

  // Clonar header, medir normal y shrink off-screen
  const clone = headerElement.cloneNode(true);
  // Aislar el clon fuera de vista, sin afectar layout
  clone.style.position = 'absolute';
  clone.style.visibility = 'hidden';
  clone.style.pointerEvents = 'none';
  clone.style.top = '-99999px';
  clone.style.left = '0';
  clone.style.right = '0';
  document.body.appendChild(clone);

  // Estado normal
  clone.classList.remove('shrink');
  const normal = clone.getBoundingClientRect().height;

  // Estado shrink
  clone.classList.add('shrink');
  const shrink = clone.getBoundingClientRect().height;

  document.body.removeChild(clone);
  return { normal: Math.round(normal), shrink: Math.round(shrink) };
}

// --- Eventos principales (DOMContentLoaded, Scroll, Clicks) ---
document.addEventListener("DOMContentLoaded", async () => {
  // Regla para desactivar transiciones en mediciones si hiciera falta
  const styleNoAnim = document.createElement('style');
  styleNoAnim.textContent = `header.no-anim, .hero.no-anim{transition:none !important;}`;
  document.head.appendChild(styleNoAnim);

  mostrarNombreUsuario();

  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    if (darkToggleInput) darkToggleInput.checked = true;
  }
  if (darkToggleInput) {
    darkToggleInput.addEventListener("change", () => {
      if (darkToggleInput.checked) {
        document.body.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.body.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      updateHeaderVarsAndCart(true);
    });
  }

  const whatsappFooterBtn = document.getElementById("whatsapp-btn");
  if (whatsappFooterBtn && window.whatsappCel) {
    whatsappFooterBtn.addEventListener("click", () => {
      const url = `https://wa.me/${window.whatsappCel}?text=Hola%21%20Estoy%20interesado%20en%20comprar%20productos%20de%20Conectados.`;
      window.open(url, "_blank");
    });
  }

  try {
    await fetchAndRenderProducts(currentPage, PRODUCTS_PER_PAGE, currentFilter, true, currentSearchQuery);
    setupFilterButtons();
    if (userEmail) cargarCarritoDesdeServidor();
  } catch (err) {
    showNotification("No se pudieron cargar los productos iniciales", "error");
    loadingSpinner.style.display = 'none';
    hasMoreProductsToLoad = false;
    if (userEmail) cargarCarritoDesdeServidor();
  }

  const frases = [
    "Tecnología que inspira",
    "Inspirando tu mundo digital",
    "Conectamos tecnología con tu vida",
    "Tecnología pensada para vos",
    "Donde la innovación cobra vida",
  ];
  let fraseIndex = 0;
  const sloganElement = document.querySelector(".slogan");
  function rotarFrases() {
    if (!sloganElement) return;
    sloganElement.classList.add("fade-out");
    setTimeout(() => {
      fraseIndex = (fraseIndex + 1) % frases.length;
      sloganElement.textContent = frases[fraseIndex];
      sloganElement.classList.remove("fade-out");
      sloganElement.classList.add("fade-in");
      setTimeout(() => sloganElement.classList.remove("fade-in"), 400);
    }, 5000);
  }
  setInterval(rotarFrases, 5000);

  const brandTrack = document.querySelector(".brand-carousel .carousel-track");
  if (brandTrack) {
    const slides = Array.from(brandTrack.children);
    slides.forEach((slide) => brandTrack.appendChild(slide.cloneNode(true)));
  }

  // Crear ancla antes de ajustar header
  ensureProductsTopSentinel();

  updateHeaderVarsAndCart(true);
  window.addEventListener('resize', () => updateHeaderVarsAndCart(window.scrollY <= 50));

  document.addEventListener('userLoggedIn', (event) => {
    const { email, name } = event.detail;
    userEmail = email;
    userName = name;
    mostrarNombreUsuario();
    cargarCarritoDesdeServidor();
    showNotification(`¡Bienvenido, ${userName}! Tu carrito se ha cargado.`, "success");
  });

  // Cuando se agregan productos (paginación), estabilizamos referencia de scroll
  window.addEventListener('productsAppended', () => {
    ensureProductsTopSentinel();
    updateHeaderVarsAndCart(window.scrollY <= 50);
    window.dispatchEvent(new CustomEvent('resetHeaderScrollRef'));
  });

  try { history.replaceState({ screen: 'root' }, ''); } catch(_) {}
});

// Actualiza variables CSS del header y posición del carrito SIN tocar layout
function updateHeaderVarsAndCart(forceExpandedAtTop = false) {
  if (!headerElement) return;
  const { normal, shrink } = measureHeaderHeightsSafely();

  // Forzamos expandido si estamos arriba
  if (forceExpandedAtTop) headerElement.classList.remove('shrink');

  htmlRoot.style.setProperty('--header-height', `${normal}px`);
  htmlRoot.style.setProperty('--header-shrink-height', `${shrink}px`);

  if (cartIcon) {
    const use = (window.scrollY <= 50) ? normal : shrink;
    cartIcon.style.top = `${use + 20}px`;
  }
}

// Eventos UI y búsqueda
function setupUIEvents() {
  document.body.addEventListener("click", (e) => {
    const addToCartBtn = e.target.closest(".btn-add-to-cart");
    if (addToCartBtn) {
      if (!userEmail) {
        openModal("login-overlay");
        showNotification("Iniciá sesión para agregar al carrito", "error");
        return;
      }
      const id = +addToCartBtn.closest("[data-id]").dataset.id;
      const product = products.find((p) => p.id === id);
      if (!product) return;
      const existing = cart.find((p) => p.id === id);
      existing ? existing.quantity++ : cart.push({
        id: product.id, quantity: 1, nombre: product.nombre, precio: product.precio,
        disponible: product.disponible, imagen: product.imagen
      });
      updateCart();
      showNotification(`${product.nombre} añadido al carrito`);
      return;
    }

    const productWhatsappBtn = e.target.closest(".product-whatsapp");
    if (productWhatsappBtn) {
      const id = +productWhatsappBtn.closest("[data-id]").dataset.id;
      const product = products.find((p) => p.id === id);
      if (!product) return;
      const mensaje = `Hola! Estoy interesado en el producto "${product.nombre}" que vi en la tienda. ¿Está disponible?`;
      const url = `https://wa.me/${whatsappCel}?text=${encodeURIComponent(mensaje)}`;
      window.open(url, "_blank");
      return;
    }

    const card = e.target.closest(".product-card");
    if (card) {
      const id = +card.dataset.id;
      const product = products.find((p) => p.id === id);
      if (product) showProductDetails(product);
      return;
    }

    const addModalCartBtn = e.target.closest(".btn-add-modal-cart");
    if (addModalCartBtn) {
      if (!userEmail) {
        openModal("login-overlay");
        showNotification("Iniciá sesión para agregar al carrito", "error");
        return;
      }
      const id = +addModalCartBtn.dataset.id;
      const product = products.find((p) => p.id === id);
      if (!product) return;
      const existing = cart.find((p) => p.id === product.id);
      existing ? existing.quantity++ : cart.push({
        id: product.id, quantity: 1, nombre: product.nombre, precio: product.precio,
        disponible: product.disponible, imagen: product.imagen
      });
      updateCart();
      showNotification(`${product.nombre} añadido al carrito`);
      return;
    }

    const whatsappModalBtn = e.target.closest(".btn-whatsapp-modal");
    if (whatsappModalBtn) {
      const id = +whatsappModalBtn.closest(".modal-actions").querySelector(".btn-add-modal-cart").dataset.id;
      const product = products.find((p) => p.id === id);
      if (!product) return;
      const text = `Hola! Quiero comprar:\n${product.nombre} - $${(product.precio || 0).toFixed(2)}`;
      const url = `https://wa.me/${whatsappCel}?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank");
      return;
    }

    const removeItemBtn = e.target.closest(".cart-item-remove");
    if (removeItemBtn) {
      const i = +removeItemBtn.dataset.index;
      cart.splice(i, 1);
      updateCart();
      renderCartItems();
      return;
    }

    const quantityBtn = e.target.closest(".quantity-btn");
    if (quantityBtn) {
      const i = +quantityBtn.dataset.index;
      const type = quantityBtn.dataset.type;
      if (type === "plus") cart[i].quantity++;
      if (type === "minus" && cart[i].quantity > 1) cart[i].quantity--;
      if (type === "minus" && cart[i].quantity === 1) cart.splice(i, 1);
      updateCart();
      renderCartItems();
      return;
    }

    if (e.target.closest("#cart-icon")) {
      if (!userEmail) {
        openModal("login-overlay");
        showNotification("Iniciá sesión para ver tu carrito", "error");
        return;
      }
      renderCartItems();
      openModal("cart-modal");
      return;
    }

    if (e.target.closest("#close-session-btn")) {
      localStorage.removeItem("userEmail");
      localStorage.removeItem("userName");
      localStorage.removeItem("jwtToken");
      localStorage.removeItem("isAdmin");
      location.reload();
      return;
    }

    if (e.target.closest("#whatsapp-purchase-btn")) {
      const summary = cart.map((item) => `${item.nombre} x${item.quantity}`).join("%0A");
      const total = cart.reduce((acc, item) => acc + (item.disponible === 1 ? item.precio * item.quantity : 0), 0).toFixed(2);
      const url = `https://wa.me/${whatsappCel}?text=Hola!%20Quiero%20comprar:%0A${summary}%0ATotal:%20$${total}`;
      window.open(url, "_blank");
    }
  });

  document.querySelectorAll(".close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modalElement = btn.closest(".modal") || btn.closest(".login-overlay");
      if (modalElement && modalElement.id) closeModal(modalElement.id, { viaCloseButton: true });
    });
  });

  window.addEventListener("click", (e) => {
    const modalIds = ["login-overlay", "account-modal", "product-modal", "cart-modal"];
    for (const id of modalIds) {
      const modalElement = document.getElementById(id);
      if (modalElement && e.target === modalElement && isVisible(modalElement)) {
        closeModal(id);
        try { history.back(); } catch(_) {}
      }
    }
  });

  searchBtn.addEventListener("click", () => applySearchAndFilter(searchInput.value.trim(), currentFilter));

  searchInput.addEventListener("input", async () => {
    clearTimeout(searchInput.debounceTimeout);
    searchInput.debounceTimeout = setTimeout(() => {
      applySearchAndFilter(searchInput.value.trim(), currentFilter);
    }, 500);
  });
}

const productRefreshIndicator = document.createElement("div");
productRefreshIndicator.id = "product-refresh-indicator";
productRefreshIndicator.textContent = "⏳ Actualizando productos...";
productRefreshIndicator.style.cssText = `
  position: fixed; bottom: 10px; right: 10px;
  background: #333; color: #fff; padding: 8px 12px;
  border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.3);
  font-size: 14px; z-index: 9999; display: none;`;
document.body.appendChild(productRefreshIndicator);

function showProductIndicator(show) { productRefreshIndicator.style.display = show ? "block" : "none"; }

let ultimaFechaDB = null;

setInterval(async () => {
  if (document.visibilityState !== "visible") return;
  try {
    showProductIndicator(true);
    const res = await fetch("/api/db-last-modified");
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const { lastModified } = await res.json();
    if (!ultimaFechaDB || new Date(lastModified).getTime() !== new Date(ultimaFechaDB).getTime()) {
      currentPage = 1;
      hasMoreProductsToLoad = true;
      currentFilter = 'all';
      currentSearchQuery = '';
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
      if (allBtn) allBtn.classList.add('active');
      await fetchAndRenderProducts(currentPage, PRODUCTS_PER_PAGE, currentFilter, true, currentSearchQuery);
      ultimaFechaDB = lastModified;
      if (userEmail) cargarCarritoDesdeServidor();
    }
  } catch (err) {
    console.warn("⚠️ Error al consultar modificación de DB:", err);
  } finally {
    showProductIndicator(false);
  }
}, 60 * 1000);

setupUIEvents();

// LÓGICA DE SCROLL PARA HEADER Y CARRITO (robusta en móviles, sin huecos)
(function() {
  const header = document.querySelector('header');
  if (!header) return;

  let lastScrollY = window.scrollY;
  let isShrunk = false;
  let ticking = false;

  const DELTA = 12;        // micro-scrolls de la UI del navegador
  const SHOW_AT_TOP = 50;  // zona “arriba”

  const getVarPx = (name) => parseFloat(getComputedStyle(htmlRoot).getPropertyValue(name)) || 0;

  // Bloqueo de auto-hide mientras se cargan productos o hay modales
  const shouldSuppress = () => isLoadingMoreProducts || isAnyModalOpen();

  const updateCartIconPosition = (shrunk) => {
    if (!cartIcon) return;
    const headerHeight = shrunk ? getVarPx('--header-shrink-height') : getVarPx('--header-height');
    cartIcon.style.top = `${headerHeight + 20}px`;
  };

  const applyHeaderState = (wantShrink) => {
    if (wantShrink && !isShrunk) {
      header.classList.add('shrink');
      isShrunk = true;
      updateCartIconPosition(true);
      if (darkmodeToggleDiv) darkmodeToggleDiv.classList.add("hidden");
    } else if (!wantShrink && isShrunk) {
      header.classList.remove('shrink');
      isShrunk = false;
      updateCartIconPosition(false);
      if (darkmodeToggleDiv) darkmodeToggleDiv.classList.remove("hidden");
    }
  };

  const onScrollCore = () => {
  if (shouldSuppress()) {
    lastScrollY = window.scrollY;
    return;
  }

  // Si estamos muy arriba:
  // - Con filtro activo en móviles => mantener encogida
  // - Sin filtro o en desktop => expandir
  if (window.scrollY <= SHOW_AT_TOP) {
    if (isMobileViewport() && hasAnyFilterActive()) {
      applyHeaderState(true);   // mantener shrink
    } else {
      applyHeaderState(false);  // expandir
    }
    lastScrollY = window.scrollY;
    return;
  }

  const currentY = window.scrollY;
  const diff = currentY - lastScrollY;

  if (Math.abs(diff) < DELTA) return;

  if (diff > 0) {
    // Bajando => encoger siempre
    applyHeaderState(true);
  } else {
    // Subiendo
    if (isMobileViewport()) {
      if (hasAnyFilterActive()) {
        // ⚠️ Con filtro (texto o categoría) seguimos ahorrando espacio
        applyHeaderState(true);
      } else {
        // Sin filtro: lógica de ancla
        const anchorY = getExpandAnchorY();
        if (currentY <= anchorY) {
          applyHeaderState(false); // expandir al llegar al inicio de productos
        } else {
          applyHeaderState(true);  // mantener encogida hasta el ancla
        }
      }
    } else {
      // Desktop: expandir al subir
      applyHeaderState(false);
    }
  }

  lastScrollY = currentY;
};


  window.addEventListener('scroll', () => {
    handleInfiniteScroll();
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        onScrollCore();
        ticking = false;
      });
    }
  }, { passive: true });

  // Reset de referencia tras append de productos
  window.addEventListener('resetHeaderScrollRef', () => { lastScrollY = window.scrollY; });

  // Estado inicial coherente
  const initialShrink = (() => {
    if (!isMobileViewport()) {
      return !(window.scrollY <= SHOW_AT_TOP);
    }
    const anchorY = getExpandAnchorY();
    return window.scrollY > Math.max(anchorY, SHOW_AT_TOP);
  })();
  applyHeaderState(initialShrink);
  lastScrollY = window.scrollY;

  window.addEventListener('resize', () => {
    updateCartIconPosition(isShrunk);
  });
})();

// LÓGICA DE BACK BUTTON
(function() {
  let lastBackPress = 0;
  window.addEventListener('popstate', () => {
    if (fullscreenOverlay) { closeFullscreenImage(); return; }
    const openModalElement = getAllModalOverlays().find(isVisible);
    if (openModalElement) {
      closeModal(openModalElement.id);
      try { history.pushState({ screen: 'modal-closed' }, ''); } catch(_) {}
      return;
    }
    if (isMobileUA()) {
      const now = Date.now();
      if (now - lastBackPress < BACK_DOUBLE_WINDOW) { lastBackPress = 0; return; }
      lastBackPress = now;
      showBackToast();
      try { history.pushState({ screen: 'stay' }, ''); } catch(_) {}
    }
  }, { passive: true });
})();
