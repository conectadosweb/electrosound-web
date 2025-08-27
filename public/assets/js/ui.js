/**
 * Renderiza una lista de productos en un contenedor del DOM.
 * @param {Array<Object>} products - El array de productos a renderizar.
 * @param {HTMLElement} container - El contenedor del DOM donde se renderizarán los productos.
 * @param {string} filter - El tipo de filtro a aplicar ('all', 'oferta', 'nuevo', 'disponible').
 * @param {string} mode - El modo de renderizado ('replace' para reemplazar el contenido, 'append' para añadir).
 */
export function renderProducts(products, container, filter = "all", mode = "replace") {
    if (mode === "replace") {
        container.innerHTML = "";
    }

    const fragment = document.createDocumentFragment();

    products.forEach((p) => {
        const isOferta = Number(p.oferta) === 1;
        const isNuevo = Number(p.nuevo) === 1;
        const isDisponible = Number(p.disponible) === 1;

        if (filter !== "all") {
            if (filter === "oferta" && !isOferta) return;
            if (filter === "nuevo" && !isNuevo) return;
            if (filter === "disponible" && !isDisponible) return;
        }

        const card = document.createElement("div");
        card.classList.add("product-card");
        if (!isDisponible) {
            card.classList.add("not-available");
        }
        card.dataset.id = p.id;

        const imageUrl = p.imagen ? `data/products/${p.id}/${p.imagen}` : 'assets/placeholder.webp';

        const badgesHtml = `
            ${isOferta ? '<span class="badge oferta-badge">OFERTA</span>' : ''}
            ${isNuevo ? '<span class="badge nuevo-badge">NUEVO</span>' : ''}
            ${!isDisponible ? '<span class="badge sin-stock-badge">SIN STOCK</span>' : ''}
        `;

        const imageHtml = `
            <div class="product-image-container">
                <img src="${imageUrl}" alt="${p.nombre}" class="product-card-image">
            </div>
        `;
        
        const infoHtml = `
            <div class="product-info">
                <h3 class="product-title">${p.nombre}</h3>
                <p class="product-price">$${(p.precio || 0).toFixed(2)}</p>
                <p class="product-description">${p.descripcion || "No hay descripción disponible."}</p>
                <div class="product-buttons">
                    <button class="btn btn-add-to-cart" data-id="${p.id}" ${!isDisponible ? 'disabled' : ''}>
                        <i class="fas fa-shopping-cart"></i> Añadir
                    </button>
                    <button class="btn product-whatsapp" data-id="${p.id}" ${!isDisponible ? 'disabled' : ''}>
                        <i class="fab fa-whatsapp"></i> Pedir
                    </button>
                </div>
            </div>
        `;

        card.innerHTML = `${badgesHtml}${imageHtml}${infoHtml}`;
        fragment.appendChild(card);
    });
    
    container.appendChild(fragment);
}

/**
 * Muestra una notificación temporal en la pantalla.
 * @param {string} msg - El mensaje de la notificación.
 * @param {string} type - El tipo de notificación ('success', 'error', 'info').
 */
export function showNotification(msg, type = "success") {
    const notif = document.createElement("div");
    notif.className = `notification ${type}`;
    notif.textContent = msg;
    document.body.appendChild(notif);
    
    setTimeout(() => {
        notif.classList.add('hide');
        setTimeout(() => notif.remove(), 500);
    }, 4000);
}