/* ==== js_admin.js (Admin Electro Sound Pack) ====
 - Login / token (localStorage 'admin_token')
 - Dashboard (ping + db mtime)
 - Productos: listar (q,page,limit), crear, editar, eliminar, toggle visible
             clic en IMAGEN -> File Manager (listar, set principal, borrar; subir desde el modal)
 - Usuarios: listar (q,page,limit), crear (POST /api/auth/register), editar (PUT /api/admin/user/:email), eliminar (DELETE /api/admin/user/:email), rol admin
 - Archivos: SECCIÓN ELIMINADA
 - CSV: importar (POST /api/admin/upload-csv), exportar (GET /api/export/:tabla)
*/

(() => {
  'use strict';

  // ========= Helpers =========
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const debounce = (fn, ms = 300) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  const tokenKey = 'admin_token';
  const Token = {
    get: () => localStorage.getItem(tokenKey) || '',
    set: (t) => localStorage.setItem(tokenKey, t),
    clear: () => localStorage.removeItem(tokenKey),
    has: () => !!localStorage.getItem(tokenKey)
  };
  const normalize01 = (v) => (v === 1 || v === '1' || v === true || v === 'true' || v === 'Si' || v === 'SI' || v === 'si') ? 1 : 0;
  const money = (n) => Number(n || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  });
  const escapeHtml = (s) => String(s).replace(/[&<>"'`=\/]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  }[c]));
  const IMG_PLACEHOLDER = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4TAYAAAAvAAAAAAA=';

  function productImageUrl(p) {
    const v = p?.imagen;
    if (!v) return IMG_PLACEHOLDER;
    if (v.startsWith('http') || v.startsWith('/')) return v;
    return `/data/products/${p.id}/${v}`;
  }

  function resolveUrl(u) {
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('/')) {
      if (location.origin.startsWith('file:')) return 'http://localhost:4000' + u;
      return u;
    }
    const base = location.origin.startsWith('file:') ? 'http://localhost:4000/' : (location.origin + '/');
    return new URL(u, base).toString();
  }

  async function authFetch(url, opts = {}) {
    const headers = new Headers(opts.headers || {});
    const t = Token.get();
    if (t) headers.set('Authorization', `Bearer ${t}`);
    headers.set('Accept', 'application/json');
    if (opts.body && !(opts.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const finalUrl = resolveUrl(url);
    let res;
    try {
      res = await fetch(finalUrl, { ...opts, headers });
    } catch (e) {
      console.warn('fetch error', finalUrl, e);
      throw e;
    }
    if (res.status === 401) {
      showLogin();
      throw new Error('No autorizado');
    }
    return res;
  }

  function flash(el, ms = 1000) {
    if (!el) return;
    el.style.outline = '3px solid #4cc9f0';
    el.style.outlineOffset = '2px';
    setTimeout(() => {
      el.style.transition = 'outline .4s';
      el.style.outline = 'none';
    }, ms);
  }
  function scrollCenter(el) {
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ========= Anti-autofill helpers =========
  function randomName(prefix='fld') {
    return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }

  // Inserta campos señuelo invisibles que “satisfacen” al autofill del navegador
  function installAutofillDecoys(container = document.body) {
    if (document.getElementById('autofill-decoys')) return;
    const form = document.createElement('form');
    form.id = 'autofill-decoys';
    form.autocomplete = 'on';
    form.style.position = 'absolute';
    form.style.opacity = '0';
    form.style.pointerEvents = 'none';
    form.style.width = '0';
    form.style.height = '0';
    form.style.overflow = 'hidden';

    const fakeUser = document.createElement('input');
    fakeUser.type = 'email';
    fakeUser.name = 'username';
    fakeUser.autocomplete = 'username';

    const fakePass = document.createElement('input');
    fakePass.type = 'password';
    fakePass.name = 'password';
    fakePass.autocomplete = 'current-password';

    form.append(fakeUser, fakePass);
    container.appendChild(form);
  }

  // Endurece un input contra el autofill y limpia si detecta el email del login
  function hardenNoAutofill(input) {
    if (!input) return;

    const form = input.closest('form');
    if (form) {
      form.setAttribute('autocomplete', 'off');
      form.setAttribute('name', randomName('form'));
    }

    input.setAttribute('type', 'search');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('inputmode', 'search');
    input.setAttribute('name', randomName('user-search'));
    input.setAttribute('data-lpignore', 'true');   // LastPass
    input.setAttribute('data-1p-ignore', 'true');  // 1Password

    const scrub = () => {
      if (state.currentUserEmail && input.value === state.currentUserEmail) {
        input.value = '';
      }
    };
    input.addEventListener('focus', () => {
      setTimeout(scrub, 0);
      setTimeout(scrub, 50);
      setTimeout(scrub, 150);
    });
    input.addEventListener('input', scrub);
    input.addEventListener('change', scrub);

    const iv = setInterval(() => {
      if (!document.body.contains(input)) return clearInterval(iv);
      scrub();
    }, 300);
  }

  // ========= API endpoints (originales) =========
  const API = {
    login: '/api/auth/login',
    ping: '/api/ping',
    dbMtime: '/api/db-last-modified',
    // Productos
    productsList: '/api/admin/products', // ?q=&page=&limit=
    productGet: (id) => `/api/admin/product/${id}`,
    productCreate: '/api/admin/product',
    productUpdate: (id) => `/api/admin/product/${id}`,
    productDelete: (id) => `/api/admin/product/${id}`,
    // Archivos producto
    productFiles: (id) => `/api/admin/products/${id}/files`,
    uploadImages: (id) => `/api/admin/upload/${id}`,
    imageDelete: (id, file) => `/api/admin/image/${id}/${encodeURIComponent(file)}`,
    // Usuarios
    usersList: '/api/admin/users', // ?q=&page=&limit=
    userGet: (email) => `/api/admin/user/${encodeURIComponent(email)}`,
    userUpdate: (email) => `/api/admin/user/${encodeURIComponent(email)}`,
    userDelete: (email) => `/api/admin/user/${encodeURIComponent(email)}`,
    userCreate: '/api/auth/register',
    // CSV
    csvImport: '/api/admin/upload-csv', // field: csv
    csvExport: (tabla) => `/api/export/${encodeURIComponent(tabla)}` // productos | usuarios | carritos
  };

  // ========= Elements =========
  const E = {
    // Login / Shell
    loginScreen: $('#login-screen'),
    loginForm: $('#login-form'),
    loginEmail: $('#login-email'),
    loginPassword: $('#login-password'),
    appShell: $('#app-shell'),
    sidebar: $('#admin-sidebar'),
    openSidebarBtn: $('#open-sidebar-btn'),
    closeSidebarBtn: $('#close-sidebar-btn'),
    logoutBtn: $('#logout-btn'),
    navLinks: $$('.sidebar-nav .nav-link'),
    gotoBtns: $$('.card-link-btn'),
    pageTitle: $('#page-title'),
    toggleThemeBtn: $('#toggle-theme-btn'),
    envMode: $('#env-mode'),
    tokenPreview: $('#token-preview'),
    copyTokenBtn: $('#copy-token-btn'),

    // Sections
    sectionDashboard: $('#section-dashboard'),
    sectionProductos: $('#section-productos'),
    sectionUsuarios: $('#section-usuarios'),
    sectionCsv: $('#section-csv'),
    sectionConfig: $('#section-config'),
    sections: $$('.page-section'),

    // Dashboard
    apiStatus: $('#api-status'),
    dbMtime: $('#db-mtime'),
    refreshStatusBtn: $('#refresh-status-btn'),

    // Productos
    productsList: $('#products-list'),
    productsSentinel: $('#products-sentinel'),
    productsSearch: $('#products-search'),
    newProductBtn: $('#new-product-btn'),

    // Usuarios
    usersList: $('#users-list'),
    usersSentinel: $('#users-sentinel'),
    usersSearch: $('#users-search'),
    newUserBtn: $('#new-user-btn'),

    // CSV
    csvUploadForm: $('#csv-upload-form'),
    csvFile: $('#csv-file'),
    csvStatus: $('#csv-status'),
    csvProgress: $('#csv-progress'),
    csvProgressBar: $('#csv-progress-bar'),
    csvSummary: $('#csv-summary'),
    csvPreview: $('#csv-preview'),
    csvDownloadSelect: $('#csv-download-select'),
    csvDownloadBtn: $('#csv-download-btn'),

    // Modal: File Manager por producto
    fileManagerModal: $('#file-manager-modal'),
    fileManagerGrid: $('#file-manager-grid'),
    // Nuevo: Elementos del formulario de carga de imágenes dentro del modal
    uploadImagesForm: $('#upload-images-form'),
    uploadImagesInput: $('#upload-images-input'),
    uploadImagesResult: $('#upload-images-result'),

    // Modal: Visor de medios
    mediaViewerModal: $('#media-viewer-modal'),
    mediaStage: $('#media-stage'),
    mediaPrev: $('#media-prev'),
    mediaNext: $('#media-next'),
    mediaDownload: $('#media-download'),

    html: document.documentElement
  };

  // ========= State =========
  const state = {
    route: 'dashboard',
    // productos
    products: [],
    productsPage: {
      page: 1,
      limit: 24,
      loading: false,
      done: false,
      q: '',
      total: 0
    },
    // usuarios
    users: [],
    usersPage: {
      page: 1,
      limit: 24,
      loading: false,
      done: false,
      q: '',
      total: 0
    },
    // file manager
    fmProductId: null,
    fmMainImage: null,
    // visor
    media: {
      items: [],
      index: 0
    },
    // email logueado para anti-autofill
    currentUserEmail: ''
  };

  // ========= Auth & Shell =========
  function showLogin() {
    E.loginScreen.classList.remove('hidden');
    E.appShell.classList.add('hidden');
  }
  function showApp() {
    E.loginScreen.classList.add('hidden');
    E.appShell.classList.remove('hidden');
    E.envMode.textContent = (location.protocol === 'https:' || location.hostname.includes('conectadosweb')) ? 'producción' : 'desarrollo';
    const t = Token.get();
    E.tokenPreview.textContent = t ? (t.slice(0, 24) + '…') : '—';

    // Anti-autofill: señuelos invisibles + blindaje del buscador usuarios
    installAutofillDecoys();
    if (E.usersSearch) {
      hardenNoAutofill(E.usersSearch);
      E.usersSearch.value = '';
    }
  }

  async function onLogin(e) {
    e.preventDefault();
    const email = (E.loginEmail.value || '').trim();
    const password = (E.loginPassword.value || '').trim();
    if (!email || !password) return;
    try {
      const res = await fetch(resolveUrl(API.login), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.token) return alert(data?.message || 'Credenciales inválidas');
      Token.set(data.token);
      state.currentUserEmail = email; // guardamos email del usuario logueado
      showApp();
      navigate('dashboard');
      refreshStatus();
    } catch (err) {
      console.error('login', err);
      alert('Error de red/interno en login');
    }
  }

  function logout() {
    Token.clear();
    showLogin();
  }

  // ========= Navegación =========
  function navigate(route) {
    state.route = route;
    E.sections.forEach(s => s.classList.add('hidden'));
    E.navLinks.forEach(a => a.classList.remove('active'));
    const map = {
      dashboard: E.sectionDashboard,
      productos: E.sectionProductos,
      usuarios: E.sectionUsuarios,
      csv: E.sectionCsv,
      config: E.sectionConfig
    };
    (map[route] || E.sectionDashboard).classList.remove('hidden');
    const link = $(`.sidebar-nav .nav-link[data-section="${route}"]`);
    if (link) link.classList.add('active');
    E.pageTitle.textContent = route.charAt(0).toUpperCase() + route.slice(1);

    if (route === 'dashboard') refreshStatus();
    if (route === 'productos' && state.products.length === 0) resetProducts();
    if (route === 'usuarios') {
      E.usersSearch && (E.usersSearch.value = '');
      resetUsers();
    }
  }

  // ========= Dashboard =========
  async function refreshStatus() {
    try {
      const [r1, r2] = await Promise.all([authFetch(API.ping), authFetch(API.dbMtime)]);
      const ping = await r1.json().catch(() => ({}));
      const mtime = await r2.json().catch(() => ({}));
      E.apiStatus.textContent = ping?.ok ? 'OK' : '—';
      E.dbMtime.textContent = mtime?.lastModified ? new Date(mtime.lastModified).toLocaleString() : '—';
    } catch {
      E.apiStatus.textContent = '—';
      E.dbMtime.textContent = '—';
    }
  }

  // ========= Productos =========
  function resetProducts() {
    state.products = [];
    E.productsList.innerHTML = '';
    state.productsPage = {
      page: 1,
      limit: 24,
      loading: false,
      done: false,
      q: (E.productsSearch.value || '').trim(),
      total: 0
    };
    loadMoreProducts();
  }

  async function loadMoreProducts() {
    const p = state.productsPage;
    if (p.loading || p.done) return;
    p.loading = true;

    const params = new URLSearchParams();
    if ((p.q || '').trim()) params.set('q', p.q.trim());
    params.set('page', String(p.page));
    params.set('limit', String(p.limit));

    try {
      const res = await authFetch(`${API.productsList}?${params.toString()}`);
      if (!res.ok) {
        console.warn('products list HTTP error:', res.status);
        throw new Error('HTTP ' + res.status);
      }
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.products) ? data.products : (Array.isArray(data) ? data : []);
      state.products.push(...rows);
      rows.forEach(prod => E.productsList.appendChild(renderProductCard(prod)));
      p.total = Number(data?.total || 0);
      if (rows.length < p.limit) p.done = true;
      else p.page++;
    } catch (err) {
      console.error('products list', err);
      p.done = true;
      const msg = document.createElement('div');
      msg.className = 'muted';
      msg.textContent = 'No se pudieron cargar productos.';
      E.productsList.appendChild(msg);
    } finally {
      p.loading = false;
    }
  }

  function renderProductCard(p) {
    const tpl = $('#tpl-product-card');
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = p.id;

    const imgEl = $('.thumb-img', node);
    imgEl.src = productImageUrl(p);
    imgEl.alt = `Producto #${p.id}`;
    imgEl.style.cursor = 'pointer';
    imgEl.addEventListener('click', () => openProductFileManager(p));

    const disp = normalize01(p.disponible);
    const badge = $('[data-stock]', node);
    badge.textContent = disp ? 'En stock' : 'Sin stock';
    badge.dataset.stock = String(disp);

    $('.title', node).textContent = p.nombre || `#${p.id}`;
    $('.price', node).textContent = money(p.precio || 0);

    const nuevo = normalize01(p.nuevo);
    const oferta = normalize01(p.oferta);
    const visible = normalize01(p.visible ?? 1);
    if (nuevo) $('.flag.new', node).classList.remove('hidden');
    if (oferta) $('.flag.sale', node).classList.remove('hidden');
    $('[data-visible]', node).classList.toggle('hidden', !visible);

    const toggle = $('[data-visible-toggle]', node);
    toggle.checked = !!visible;
    toggle.addEventListener('change', async () => {
      const val = toggle.checked ? 1 : 0;
      try {
        const res = await authFetch(API.productUpdate(p.id), {
          method: 'PUT',
          body: JSON.stringify({ visible: val })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        p.visible = val;
        $('[data-visible]', node).classList.toggle('hidden', !val);
        flash(node);
      } catch (e) {
        alert('No se pudo actualizar visibilidad');
        toggle.checked = !val;
      }
    });

    $('[data-edit]', node).addEventListener('click', () => openProductEditModal(p, node));
    $('[data-images]', node).addEventListener('click', () => openProductFileManager(p));

    return node;
  }

  function openProductEditModal(p, cardEl) {
    // Traer datos completos del producto antes de renderizar el modal
    const fetchFullProduct = async (id) => {
      try {
        const res = await authFetch(API.productGet(id));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (e) {
        console.warn('⚠️ No se pudo cargar el producto completo, uso datos del listado.', e);
        return p || {};
      }
    };

    const renderModal = (prod) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-head">
            <h3>Editar producto #${prod.id}</h3>
            <button class="modal-close" data-x>&times;</button>
          </div>

          <div class="modal-body">
            <label class="label">Nombre</label>
            <input class="input" id="ep-nombre" value="${escapeHtml(prod.nombre || '')}">

            <label class="label">Descripción</label>
            <textarea class="input" id="ep-descripcion" rows="3">${escapeHtml(prod.descripcion || '')}</textarea>

            <label class="label">Categoría</label>
            <input class="input" id="ep-categoria" value="${escapeHtml(prod.categoria || '')}">

            <label class="label">Proveedor</label>
            <input class="input" id="ep-proveedor" value="${escapeHtml(prod.proveedor || '')}">

            <label class="label">Precio</label>
            <input class="input" id="ep-precio" type="number" step="0.01" value="${Number(prod.precio ?? 0)}">

            <label class="label">Stock</label>
            <input class="input" id="ep-stock" type="number" step="1" value="${Number(prod.stock ?? 0)}">

            <div class="rows">
              <label class="switch">
                <input type="checkbox" id="ep-nuevo" ${normalize01(prod.nuevo ?? 0) ? 'checked' : ''}>
                <span>Nuevo</span>
              </label>
              <label class="switch">
                <input type="checkbox" id="ep-oferta" ${normalize01(prod.oferta ?? 0) ? 'checked' : ''}>
                <span>Oferta</span>
              </label>
              <label class="switch">
                <input type="checkbox" id="ep-disponible" ${normalize01(prod.disponible ?? 1) ? 'checked' : ''}>
                <span>Disponible</span>
              </label>
              <label class="switch">
                <input type="checkbox" id="ep-visible" ${normalize01(prod.visible ?? 1) ? 'checked' : ''}>
                <span>Visible</span>
              </label>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn" data-cancel>Cancelar</button>
            <button class="btn danger" data-delete>Eliminar</button>
            <button class="btn primary" data-save>Guardar</button>
          </div>
        </div>
      `;

      const close = () => modal.remove();
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.matches('[data-x],[data-cancel]')) close();
      });

      document.body.appendChild(modal);

      modal.querySelector('[data-save]').addEventListener('click', async () => {
        const payload = {
          nombre: $('#ep-nombre', modal).value.trim(),
          descripcion: $('#ep-descripcion', modal).value.trim(),
          categoria: $('#ep-categoria', modal).value.trim(),
          proveedor: $('#ep-proveedor', modal).value.trim(),
          precio: Number($('#ep-precio', modal).value || 0),
          stock: Number($('#ep-stock', modal).value || 0),
          nuevo: $('#ep-nuevo', modal).checked ? 1 : 0,
          oferta: $('#ep-oferta', modal).checked ? 1 : 0,
          disponible: $('#ep-disponible', modal).checked ? 1 : 0,
          visible: $('#ep-visible', modal).checked ? 1 : 0,
        };

        try {
          const res = await authFetch(API.productUpdate(prod.id), {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);

          Object.assign(prod, payload);
          updateProductCard(cardEl, prod);
          close();
          scrollCenter(cardEl);
          flash(cardEl);
        } catch (err) {
          console.error(err);
          alert('Error guardando producto');
        }
      });

      modal.querySelector('[data-delete]').addEventListener('click', async () => {
        if (!confirm('¿Eliminar este producto?')) return;
        try {
          const res = await authFetch(API.productDelete(prod.id), { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          cardEl.remove();
          close();
        } catch (err) {
          console.error(err);
          alert('No se pudo eliminar');
        }
      });
    };

    (async () => {
      const full = await fetchFullProduct(p.id);
      const prod = { ...p, ...full };
      renderModal(prod);
    })();
  }

  function updateProductCard(cardEl, p) {
    $('.title', cardEl).textContent = p.nombre || `#${p.id}`;
    $('.price', cardEl).textContent = money(p.precio || 0);
    const disp = normalize01(p.disponible);
    $('[data-stock]', cardEl).textContent = disp ? 'En stock' : 'Sin stock';
    $('[data-visible]', cardEl).classList.toggle('hidden', !normalize01(p.visible ?? 1));
    $('.flag.new', cardEl).classList.toggle('hidden', !normalize01(p.nuevo));
    $('.flag.sale', cardEl).classList.toggle('hidden', !normalize01(p.oferta));
    const vToggle = $('[data-visible-toggle]', cardEl);
    if (vToggle) vToggle.checked = !!normalize01(p.visible ?? 1);
    const imgEl = $('.thumb-img', cardEl);
    if (imgEl) imgEl.src = productImageUrl(p);
  }

  const onProductsSearch = debounce(() => resetProducts(), 300);

  const productsIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) loadMoreProducts();
    });
  }, { root: null, rootMargin: '300px', threshold: 0 });

  // Nuevo Producto
  function openNewProduct() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-head">
          <h3>Nuevo producto</h3>
          <button class="modal-close" data-x>&times;</button>
        </div>
        <div class="modal-body">
          <label class="label">Nombre*</label>
          <input class="input" id="np-nombre" placeholder="Ej: Cable USB-C">
          <label class="label">Precio*</label>
          <input class="input" id="np-precio" type="number" step="0.01" placeholder="29999">
          <label class="label">Descripción</label>
          <textarea class="input" id="np-descripcion" rows="3"></textarea>
          <div class="rows">
            <label class="switch"><input type="checkbox" id="np-visible" checked><span>Visible</span></label>
            <label class="switch"><input type="checkbox" id="np-disponible" checked><span>Disponible</span></label>
            <label class="switch"><input type="checkbox" id="np-nuevo"><span>Nuevo</span></label>
            <label class="switch"><input type="checkbox" id="np-oferta"><span>Oferta</span></label>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" data-cancel>Cancelar</button>
          <button class="btn primary" data-create>Crear</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.hasAttribute('data-x') || e.target.hasAttribute('data-cancel')) close();
    });
    modal.querySelector('[data-create]').addEventListener('click', async () => {
      const nombre = $('#np-nombre', modal).value.trim();
      const precio = Number($('#np-precio', modal).value || 0);
      const descripcion = $('#np-descripcion', modal).value.trim();
      if (!nombre || !precio) return alert('Nombre y precio son obligatorios');
      const payload = {
        nombre,
        precio,
        descripcion,
        visible: $('#np-visible', modal).checked ? 1 : 0,
        disponible: $('#np-disponible', modal).checked ? 1 : 0,
        nuevo: $('#np-nuevo', modal).checked ? 1 : 0,
        oferta: $('#np-oferta', modal).checked ? 1 : 0
      };
      try {
        const res = await authFetch(API.productCreate, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        close();
        resetProducts();
      } catch (err) {
        alert('No se pudo crear el producto');
      }
    });
  }

  // ========= File Manager (modal por producto) =========
  async function openProductFileManager(p) {
    state.fmProductId = p.id;
    state.fmMainImage = p.imagen || null;
    E.fileManagerModal.querySelector('h3').textContent = `Gestor de archivos de Producto #${p.id}`;
    E.fileManagerGrid.innerHTML = '<div class="muted">Cargando...</div>';
    E.uploadImagesResult.textContent = '';
    E.fileManagerModal.classList.remove('hidden');

    try {
      const res = await authFetch(API.productFiles(p.id));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const files = await res.json().catch(() => []);
      renderFileManagerGrid(p.id, files, state.fmMainImage);
    } catch (err) {
      E.fileManagerGrid.innerHTML = `<div class="muted">Error al listar archivos</div>`;
    }
  }

  function renderFileManagerGrid(id, files, main) {
    E.fileManagerGrid.innerHTML = '';
    if (!Array.isArray(files) || files.length === 0) {
      E.fileManagerGrid.innerHTML = '<div class="muted">Sin archivos</div>';
      return;
    }
    for (const file of files) {
      const url = `/data/products/${id}/${file}`;
      const ext = (file.split('.').pop() || '').toLowerCase();

      const item = document.createElement('div');
      item.className = 'media-item';
      item.style.position = 'relative';

      if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = file;
        img.loading = 'lazy';
        img.style.cursor = 'pointer';
        img.title = 'Clic para setear como imagen principal';
        img.addEventListener('click', () => setMainImage(id, file));
        item.appendChild(img);
      } else if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        item.appendChild(v);
      } else {
        const d = document.createElement('div');
        d.className = 'muted';
        d.style.padding = '1rem';
        d.textContent = file;
        item.appendChild(d);
      }

      const badge = document.createElement('div');
      badge.style.position = 'absolute';
      badge.style.left = '6px';
      badge.style.top = '6px';
      badge.className = 'badge';
      badge.textContent = (file === main) ? 'Principal' : 'Archivo';
      item.appendChild(badge);

      const del = document.createElement('button');
      del.className = 'btn small';
      del.textContent = 'Borrar';
      del.style.position = 'absolute';
      del.style.right = '6px';
      del.style.bottom = '6px';
      del.addEventListener('click', async () => {
        if (!confirm('¿Borrar este archivo?')) return;
        try {
          const res = await authFetch(API.imageDelete(id, file), { method: 'DELETE' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if (file === state.fmMainImage) state.fmMainImage = null;
          const r = await authFetch(API.productFiles(id));
          const arr = await r.json().catch(() => []);
          renderFileManagerGrid(id, arr, state.fmMainImage);
          const card = E.productsList.querySelector(`.card.product[data-id="${id}"] .thumb-img`);
          if (card && file === (state.products.find(x => x.id === id)?.imagen)) {
            card.src = IMG_PLACEHOLDER;
          }
        } catch (e) {
          alert('No se pudo borrar la imagen');
        }
      });
      item.appendChild(del);

      E.fileManagerGrid.appendChild(item);
    }
  }

  async function setMainImage(id, file) {
    try {
      const res = await authFetch(API.productUpdate(id), {
        method: 'PUT',
        body: JSON.stringify({ imagen: file })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.fmMainImage = file;

      const p = state.products.find(x => x.id === id);
      if (p) { p.imagen = file; }
      const cardImg = E.productsList.querySelector(`.card.product[data-id="${id}"] .thumb-img`);
      if (cardImg) cardImg.src = `/data/products/${id}/${file}`;

      const r = await authFetch(API.productFiles(id));
      const arr = await r.json().catch(() => []);
      renderFileManagerGrid(id, arr, state.fmMainImage);
    } catch (e) {
      alert('No se pudo definir la imagen principal');
    }
  }

  // Nuevo: Función para manejar la subida de imágenes desde el modal
  async function onUploadImages(e) {
    e.preventDefault();
    const id = state.fmProductId;
    if (!id) return;

    const fd = new FormData();
    for (const f of (E.uploadImagesInput.files || [])) fd.append('images', f);

    if (fd.get('images')) {
      E.uploadImagesResult.textContent = 'Subiendo...';
      try {
        const res = await authFetch(API.uploadImages(id), { method: 'POST', body: fd });

        let data = null;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) data = await res.json();
        else data = { message: await res.text() };

        if (!res.ok) {
          const msg = (data && (data.error || data.message)) || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        E.uploadImagesResult.textContent = `✅ OK: ${data?.cantidad||0} archivo(s) subidos.`;
        E.uploadImagesInput.value = '';
        await openProductFileManager(state.products.find(p => p.id === id));
      } catch (err) {
        console.error('upload', err);
        E.uploadImagesResult.textContent = `❌ Error al subir: ${err.message || err}`;
      }
    } else {
      E.uploadImagesResult.textContent = 'Selecciona al menos un archivo.';
    }
  }

  // ========= Visor de medios =========
  function openMediaViewer(items, idx = 0, revoke = false) {
    state.media.items = items || [];
    state.media.index = idx || 0;
    E.mediaViewerModal.classList.remove('hidden');
    renderMediaStage();
    E.mediaDownload.onclick = () => {
      const url = state.media.items[state.media.index];
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    E.mediaViewerModal.addEventListener('click', (e) => {
      if (e.target === E.mediaViewerModal) {
        close(revoke);
      }
    }, { once: true });
    E.mediaPrev.onclick = () => {
      if (state.media.index > 0) {
        state.media.index--;
        renderMediaStage();
      }
    };
    E.mediaNext.onclick = () => {
      if (state.media.index < state.media.items.length - 1) {
        state.media.index++;
        renderMediaStage();
      }
    };
    function close(rev) {
      E.mediaViewerModal.classList.add('hidden');
      E.mediaStage.innerHTML = '';
      if (rev) {
        for (const u of items) {
          if (u.startsWith('blob:')) URL.revokeObjectURL(u);
        }
      }
    }
  }
  function renderMediaStage() {
    const url = state.media.items[state.media.index];
    E.mediaStage.innerHTML = '';
    if (/\.(mp4|webm|ogg|mov)$/i.test(url)) {
      const v = document.createElement('video');
      v.src = url;
      v.controls = true;
      v.autoplay = true;
      E.mediaStage.appendChild(v);
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      E.mediaStage.appendChild(img);
    }
  }

  // ========= Usuarios =========
  function resetUsers() {
    state.users = [];
    E.usersList.innerHTML = '';
    state.usersPage = {
      page: 1,
      limit: 24,
      loading: false,
      done: false,
      q: (E.usersSearch.value || '').trim(),
      total: 0
    };
    loadMoreUsers();
  }

  async function loadMoreUsers() {
    const u = state.usersPage;
    if (u.loading || u.done) return;
    u.loading = true;

    const params = new URLSearchParams();
    if ((u.q || '').trim()) params.set('q', u.q.trim());
    params.set('page', String(u.page));
    params.set('limit', String(u.limit));

    try {
      const res = await authFetch(`${API.usersList}?${params.toString()}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.users) ? data.users : (Array.isArray(data) ? data : []);
      state.users.push(...rows);
      rows.forEach(user => E.usersList.appendChild(renderUserRow(user)));
      u.total = Number(data?.total || 0);
      if (rows.length < u.limit) u.done = true;
      else u.page++;
    } catch (err) {
      console.error('users list', err);
      u.done = true;
    } finally {
      u.loading = false;
    }
  }

  function renderUserRow(u) {
    const tpl = $('#tpl-user-row');
    const row = tpl.content.firstElementChild.cloneNode(true);
    row.dataset.id = u.id;
    $('.email', row).textContent = u.email || '';
    $('.name', row).textContent = u.nombre || '';
    const adminToggle = $('[data-admin-toggle]', row);
    adminToggle.checked = Number(u.esAdmin) === 1;

    adminToggle.addEventListener('change', async () => {
      const val = adminToggle.checked ? 1 : 0;
      try {
        const res = await authFetch(API.userUpdate(u.email), {
          method: 'PUT',
          body: JSON.stringify({ esAdmin: val })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        u.esAdmin = val;
        flash(row);
      } catch (err) {
        alert('No se pudo cambiar rol');
        adminToggle.checked = !val;
      }
    });

    $('[data-edit-user]', row).addEventListener('click', () => openUserModal('edit', u, row));
    return row;
  }

  function openUserEditModal(u, rowEl) {
    return openUserModal('edit', u, rowEl);
  }

  function openUserModal(mode, u = null, rowEl = null) {
    const isEdit = mode === 'edit';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const emailVal = isEdit ? (u?.email || '') : '';
    const nombreVal = isEdit ? (u?.nombre || '') : '';
    const telefonoVal = isEdit ? (u?.telefono || '') : '';
    const nacimientoVal = isEdit ? (u?.nacimiento || '') : '';
    const paisVal = isEdit ? (u?.pais || '') : '';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-head">
          <h3>${isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h3>
          <button class="modal-close" data-x>&times;</button>
        </div>
        <div class="modal-body">
          <label class="label">Email*</label>
          <input class="input" id="${isEdit ? 'eu' : 'nu'}-email" placeholder="usuario@correo.com" value="${escapeHtml(emailVal)}">
          <label class="label">Nombre*</label>
          <input class="input" id="${isEdit ? 'eu' : 'nu'}-nombre" placeholder="Nombre y Apellido" value="${escapeHtml(nombreVal)}">
          <label class="label">${isEdit ? 'Nueva contraseña (opcional)' : 'Contraseña*'}</label>
          <input class="input" id="${isEdit ? 'eu' : 'nu'}-pass" type="password" placeholder="${isEdit ? 'Dejar en blanco para no cambiar' : 'Mín. 8 caracteres'}">
          ${isEdit ? '' : `
          <label class="label">Confirmar contraseña*</label>
          <input class="input" id="nu-confirm" type="password" placeholder="Repetir contraseña">`}
          <label class="label">Teléfono</label>
          <input class="input" id="${isEdit ? 'eu' : 'nu'}-tel" placeholder="+54 9 351 ..." value="${escapeHtml(telefonoVal)}">
          <label class="label">Fecha de nacimiento</label>
          <input class="input" id="${isEdit ? 'eu' : 'nu'}-nac" type="date" value="${escapeHtml(nacimientoVal)}">
          <label class="label">País</label>
          <input class="input" id="${isEdit ? 'eu' : 'nu'}-pais" placeholder="Argentina" value="${escapeHtml(paisVal)}">
        </div>
        <div class="modal-foot">
          <button class="btn" data-cancel>Cancelar</button>
          ${isEdit ? `<button class="btn danger" id="user-delete-btn">Eliminar</button>` : ''}
          <button class="btn primary" id="user-submit-btn">${isEdit ? 'Guardar cambios' : 'Crear usuario'}</button>
        </div>
      </div>
    `;

    function close() {
      modal.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    modal.addEventListener('click', e => {
      if (e.target.matches('[data-x], [data-cancel], .modal')) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('open'));

    $('#user-submit-btn', modal).addEventListener('click', async () => {
      try {
        if (isEdit) {
          const email = $('#eu-email', modal).value.trim();
          const nombre = $('#eu-nombre', modal).value.trim();
          const pass = $('#eu-pass', modal).value;
          const telefono = $('#eu-tel', modal).value.trim();
          const nacimiento = $('#eu-nac', modal).value.trim();
          const pais = $('#eu-pais', modal).value.trim();
          const payload = { email, nombre, telefono, nacimiento, pais };
          if (pass && pass.length) payload.password = pass;
          const res = await authFetch(API.userUpdate(u.email), {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          // Update row UI
          if (rowEl) {
            u.email = email;
            u.nombre = nombre;
            u.telefono = telefono;
            u.nacimiento = nacimiento;
            u.pais = pais;
            $('.email', rowEl).textContent = u.email;
            $('.name', rowEl).textContent = u.nombre;
            scrollCenter(rowEl);
            flash(rowEl);
          } else {
            resetUsers();
          }
          close();
        } else {
          const email = $('#nu-email', modal).value.trim();
          const nombre = $('#nu-nombre', modal).value.trim();
          const password = $('#nu-pass', modal).value;
          const confirmPassword = $('#nu-confirm', modal).value;
          const telefono = $('#nu-tel', modal).value.trim();
          const nacimiento = $('#nu-nac', modal).value.trim();
          const pais = $('#nu-pais', modal).value.trim();
          if (!email || !nombre || !password || !confirmPassword) throw new Error('Faltan campos obligatorios.');
          if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
          if (password !== confirmPassword) throw new Error('Las contraseñas no coinciden.');
          const res = await authFetch(API.userCreate, {
            method: 'POST',
            body: JSON.stringify({ email, nombre, password, confirmPassword, telefono, nacimiento, pais })
          });
          const ok = res.ok;
          const data = await res.json().catch(() => ({}));
          if (!ok) throw new Error(data?.error || ('HTTP ' + res.status));
          close();
          resetUsers();
        }
      } catch (err) {
        alert((isEdit ? 'No se pudo guardar el usuario: ' : 'No se pudo crear el usuario: ') + (err?.message || 'Error'));
      }
    });

    if (isEdit) {
      $('#user-delete-btn', modal).addEventListener('click', async () => {
        if (confirm(`¿Eliminar al usuario ${u.email}?`)) {
          try {
            const res = await authFetch(API.userDelete(u.email), { method: 'DELETE' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            alert('Usuario eliminado correctamente.');
            close();
            resetUsers();
          } catch (err) {
            console.error(err);
            alert('No se pudo eliminar el usuario.');
          }
        }
      });
    }
  }

  function openNewUser() {
    return openUserModal('new');
  }

  // ========= CSV =========
  async function onCsvUpload(e) {
    e.preventDefault();
    const file = E.csvFile.files[0];
    if (!file) return alert('Seleccioná un CSV');
    previewCsv(file);
    E.csvProgress.classList.remove('hidden');
    E.csvProgressBar.style.width = '0%';
    E.csvStatus.textContent = 'Subiendo...';
    const fd = new FormData();
    fd.append('csv', file);
    try {
      const resText = await xhrUpload(API.csvImport, fd, pct => E.csvProgressBar.style.width = `${pct}%`);
      E.csvStatus.textContent = 'Procesando...';
      let data = {};
      try { data = JSON.parse(resText); } catch {}
      renderCsvSummary(data);
      E.csvStatus.textContent = '✅ CSV procesado';
    } catch (err) {
      E.csvStatus.textContent = 'Error al subir/procesar CSV';
    }
  }
  function xhrUpload(url, formData, onProgress) {
    const t = Token.get();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', resolveUrl(url), true);
      if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round(e.loaded * 100 / e.total));
        }
      };
      xhr.onload = () => {
        (xhr.status >= 200 && xhr.status < 300) ? resolve(xhr.responseText) : reject(new Error('HTTP ' + xhr.status));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(formData);
    });
  }
  function previewCsv(file) {
    const r = new FileReader();
    r.onload = () => {
      const text = r.result || '';
      const rows = String(text).split(/\r?\n/).slice(0, 21);
      const table = document.createElement('table');
      table.className = 'table';
      for (const line of rows) {
        if (!line.trim()) continue;
        const tr = document.createElement('tr');
        for (const cell of line.split(',')) {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      E.csvPreview.innerHTML = '';
      E.csvPreview.appendChild(table);
    };
    r.readAsText(file);
  }
  function renderCsvSummary(d) {
    const created = d.created ?? d.inserted ?? d.creados ?? 0,
      updated = d.updated ?? d.actualizados ?? 0,
      skipped = d.skipped ?? d.ignorados ?? 0,
      errors = d.errors ?? d.errores ?? 0;
    const total = d.total ?? (created + updated + skipped + errors || undefined);
    const parts = [];
    if (total !== undefined) parts.push(`Total ${total}`);
    parts.push(`Creados ${created}`, `Actualizados ${updated}`);
    if (skipped) parts.push(`Omitidos ${skipped}`);
    if (errors) parts.push(`Errores ${errors}`);
    E.csvSummary.innerHTML = `<p><strong>Resumen:</strong> ${parts.join(' | ')}</p>` + (Array.isArray(d.detail) && d.detail.length ? `<details><summary>Detalle</summary><pre>${escapeHtml(JSON.stringify(d.detail,null,2))}</pre></details>` : '');
  }
  async function onCsvDownload() {
    const type = E.csvDownloadSelect.value || 'productos';
    try {
      let res = await authFetch(API.csvExport(type));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `conectados_${type}_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('No se pudo descargar el CSV. Verifica que el servidor de la API esté activo y el endpoint sea correcto.');
    }
  }

  // ========= Eventos =========
  E.loginForm?.addEventListener('submit', onLogin);
  E.logoutBtn?.addEventListener('click', logout);

  E.navLinks.forEach(a => a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.getAttribute('data-section'));
      E.sidebar?.classList.remove('open');
  }));
  E.gotoBtns.forEach(btn => btn.addEventListener('click', () => navigate(btn.getAttribute('data-goto'))));

  E.openSidebarBtn?.addEventListener('click', () => E.sidebar.classList.add('open'));
  E.closeSidebarBtn?.addEventListener('click', () => E.sidebar.classList.remove('open'));

  E.toggleThemeBtn?.addEventListener('click', () => {
      const theme = E.html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      E.html.setAttribute('data-theme', theme);
  });

  E.refreshStatusBtn?.addEventListener('click', refreshStatus);

  E.productsSearch?.addEventListener('input', onProductsSearch);
  productsIO.observe(E.productsSentinel);
  E.newProductBtn?.addEventListener('click', openNewProduct);

  const usersIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
          if (e.isIntersecting) loadMoreUsers();
      });
  }, {
      root: null,
      rootMargin: '300px',
      threshold: 0
  });
  E.usersSearch?.addEventListener('input', () => resetUsers());

  // Solución defensiva extra: limpiar valor si el navegador lo inyecta al enfocar
  if (E.usersSearch) {
      E.usersSearch.addEventListener('focus', () => { 
        if (state.currentUserEmail && E.usersSearch.value === state.currentUserEmail) {
          E.usersSearch.value = '';
        }
      });
  }

  usersIO.observe(E.usersSentinel);
  E.newUserBtn?.addEventListener('click', openNewUser);

  E.uploadImagesForm?.addEventListener('submit', onUploadImages);

  E.csvUploadForm?.addEventListener('submit', onCsvUpload);
  E.csvDownloadBtn?.addEventListener('click', onCsvDownload);

  document.body.addEventListener('click', (e) => {
      if (e.target?.hasAttribute('data-close-filemanager')) {
          E.fileManagerModal.classList.add('hidden');
      }
      if (e.target?.hasAttribute('data-close-media')) {
          E.mediaViewerModal.classList.add('hidden');
          const v = E.mediaViewerModal.querySelector('video');
          if (v) v.pause();
      }
  });

  E.copyTokenBtn?.addEventListener('click', async () => {
      const t = Token.get();
      if (!t) return;
      try {
          await navigator.clipboard.writeText(t);
          E.copyTokenBtn.textContent = 'Copiado!';
          await sleep(800);
      } catch {}
      E.copyTokenBtn.textContent = 'Copiar token';
  });

  // ========= Init =========
  (function init() {
      if (Token.has()) {
          showApp();
          navigate('dashboard');
          refreshStatus();
      } else {
          showLogin();
      }
  })();

})(); // <- cierre de la IIFE principal
