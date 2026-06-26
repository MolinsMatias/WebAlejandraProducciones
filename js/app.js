import { db } from './firebase-config.js';
import { collection, getDocs, getDoc, doc, orderBy, query, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elementos del DOM
const bentoGrid = document.getElementById('bento-grid');
const lightbox = document.getElementById('lightbox');
const lightboxMediaContainer = document.getElementById('lightbox-media-container');
const lightboxLocation = document.getElementById('lightbox-location');
const heroReelsContainer = document.getElementById('hero-reels-container');
const lightboxClose = document.getElementById('lightbox-close');

// Almacén de todos los eventos para filtrado
let allEventosData = [];

// Tab activo actual
let activeTabId = '';

// Navegación del lightbox
let lightboxCurrentIndex = -1;
let lightboxVisibleItems = [];

// Álbum interno del lightbox
let albumImages = [];
let albumCurrentIndex = 0;

let catalogCategories = [];
let allGridIds = [];

function getSlug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

let isEventosListenerAttached = false;

// 0.5 Cargar categorías dinámicas en tiempo real
function fetchCategorias() {
    try {
        const docRef = doc(db, "config", "categorias");
        onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();

                if (data.lista && Array.isArray(data.lista)) {
                    catalogCategories = data.lista;
                } else if (data.categorias && Array.isArray(data.categorias)) {
                    catalogCategories = data.categorias;
                } else {
                    catalogCategories = [];
                }
            } else {
                catalogCategories = [];
            }

            if (catalogCategories.length === 0) {
                // Fallback
                catalogCategories = ['Pistas LED', 'Ajedrez', 'Packs', 'Videos'];
            }

            renderCatalogTabs();

            // Evitar múltiples listeners de eventos
            if (!isEventosListenerAttached) {
                isEventosListenerAttached = true;
                fetchEventos();
            } else {
                // Si ya teníamos eventos cargados, solo los volvemos a renderizar en los nuevos tabs
                reRenderAllEventos();
            }
        }, (error) => {
            console.log("Error cargando categorías en tiempo real:", error.message);
        });
    } catch (error) {
        console.log("Error al inicializar categorías:", error.message);
    }
}

function renderCatalogTabs() {
    const tabsContainer = document.getElementById('catalog-tabs-container');
    const gridsContainer = document.getElementById('catalog-grids-container');
    if (!tabsContainer || !gridsContainer) return;

    tabsContainer.innerHTML = '';
    gridsContainer.innerHTML = '';
    allGridIds = [];

    catalogCategories.forEach((cat, index) => {
        const slug = getSlug(cat);
        const targetId = `bento-grid-${slug}`;
        allGridIds.push(targetId);

        // Tab button
        const btn = document.createElement('button');
        btn.className = `tab-btn ${index === 0 ? 'active' : ''}`;
        btn.setAttribute('data-target', targetId);
        btn.textContent = cat;
        btn.addEventListener('click', () => abrirCatalogoEn(targetId));
        tabsContainer.appendChild(btn);

        // Grid container
        const grid = document.createElement('div');
        grid.id = targetId;
        grid.className = `bento-grid tab-content ${index === 0 ? 'active-content' : ''}`;
        
        // Cargar 6 skeletons por defecto
        grid.innerHTML = `
            <div class="bento-item skeleton"></div>
            <div class="bento-item skeleton"></div>
            <div class="bento-item skeleton"></div>
            <div class="bento-item skeleton"></div>
            <div class="bento-item skeleton"></div>
            <div class="bento-item skeleton"></div>
        `;
        gridsContainer.appendChild(grid);

        if (index === 0) {
            activeTabId = targetId;
        }
    });
}

// 0. Cargar URL del catálogo PDF desde Firestore
async function fetchCatalogoPDF() {
    try {
        const docRef = doc(db, "config", "catalogo");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.pdfUrl) {
                const container = document.getElementById('pdf-download-container');
                const btn = document.getElementById('btn-download-pdf');
                if (container && btn) {
                    btn.href = data.pdfUrl;
                    container.style.display = 'flex';
                }
            }
        }
    } catch (error) {
        console.log("No se pudo cargar el PDF del catálogo:", error.message);
    }
}

let isFirstEventosLoad = true;

// 1. Obtener eventos/packs desde Firestore (bento grid) con tiempo real
function fetchEventos() {
    try {
        const q = query(collection(db, "eventos"), orderBy("fecha", "desc"), limit(30));

        onSnapshot(q, (querySnapshot) => {
            allEventosData = [];
            querySnapshot.forEach((doc) => {
                allEventosData.push(doc.data());
            });

            reRenderAllEventos();

        }, (error) => {
            console.error("🔥 Error de Firebase onSnapshot:", error);
            crearMockData();
        });

    } catch (error) {
        console.error("🔥 Error al iniciar onSnapshot:", error);
        crearMockData();
    }
}

// Función auxiliar para re-dibujar todos los eventos
function reRenderAllEventos() {
    const grids = allGridIds.map(id => document.getElementById(id));
    grids.forEach(g => { if (g) g.innerHTML = ''; });

    if (allEventosData.length === 0) {
        if (grids[0]) grids[0].innerHTML = '<p>No hay eventos cargados aún.</p>';
        mostrarMensajeGridsVacios();
        return;
    }

    let reelsCargados = 0;

    // Limpiar hero reels por si es una actualización
    if (heroReelsContainer) heroReelsContainer.innerHTML = '';

    allEventosData.forEach((data) => {
        renderBentoItem(data);

        // Poblar los 2 primeros reels si son formato video
        if (data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov') || data.urlImagen.includes('.webm') || data.tipoArchivo === 'video')) {
            if (reelsCargados < 2) {
                renderHeroReel(data);
                reelsCargados++;
            }
        }
    });

    // Poblar los filtros dinámicos del tab activo
    poblarFiltrosDelTab();

    // Después de cargar, mostrar mensaje en grids vacíos
    mostrarMensajeGridsVacios();
}

function renderBentoItem(data) {
    const item = document.createElement('div');
    item.className = 'bento-item';

    // Data attributes para filtrado y navegación del lightbox
    const recinto = data.ubicacion?.recinto || '';
    const tipoEvento = data.tipoEvento || '';
    item.setAttribute('data-recinto', recinto);
    item.setAttribute('data-tipo', tipoEvento);
    item.setAttribute('data-url-imagen', data.urlImagen || '');
    item.setAttribute('data-tipo-archivo', data.tipoArchivo || 'image');
    item.setAttribute('data-comuna', data.ubicacion?.comuna || '');
    item.setAttribute('data-metros', data.metrosCuadrados || '');

    // Multi-imagen: guardar array de URLs
    const urlImagenes = (data.urlImagenes && Array.isArray(data.urlImagenes) && data.urlImagenes.length > 1) ? data.urlImagenes : [];
    if (urlImagenes.length > 0) {
        item.setAttribute('data-url-imagenes', JSON.stringify(urlImagenes));
    }

    // Al hacer click, abrir el lightbox con navegación
    item.addEventListener('click', () => {
        const activeGrid = document.getElementById(activeTabId);
        if (activeGrid) {
            lightboxVisibleItems = Array.from(activeGrid.querySelectorAll('.bento-item:not([style*="display: none"])'));
            lightboxCurrentIndex = lightboxVisibleItems.indexOf(item);
        }
        // Preparar álbum si tiene múltiples imágenes
        const itemUrlImagenes = urlImagenes.length > 0 ? urlImagenes : (data.urlImagen ? [data.urlImagen] : []);
        openLightbox(data.urlImagen, data.ubicacion, data.tipoArchivo, data.metrosCuadrados, itemUrlImagenes);
    });

    let mediaHTML = `<img src="${data.urlImagen}" alt="${data.titulo} - ${data.tipoEvento} - Alejandra Producciones" loading="lazy">`;

    if (data.tipoArchivo === 'youtube') {
        const yId = getYoutubeId(data.urlImagen);
        if (yId) {
            // Usar thumbnail de máxima resolución en el grid
            mediaHTML = `<img src="https://img.youtube.com/vi/${yId}/maxresdefault.jpg" alt="${data.titulo} - YouTube" loading="lazy"
                onerror="this.src='https://img.youtube.com/vi/${yId}/hqdefault.jpg'">`;
        }
    } else if (data.tipoArchivo === 'video' || (data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov')))) {
        mediaHTML = `<video src="${data.urlImagen}" loop muted playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>`;
    }

    // Badge de m² si tiene datos
    const m2Badge = data.metrosCuadrados ? `<div class="bento-m2-badge">${data.metrosCuadrados} m²</div>` : '';

    // Badge de álbum si tiene múltiples imágenes (SVG camera icon)
    const cameraIcon = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style="vertical-align:-2px"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/><path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>`;
    const albumBadge = urlImagenes.length > 1 ? `<div class="bento-album-badge">${cameraIcon} ${urlImagenes.length}</div>` : '';

    item.innerHTML = `
        ${m2Badge}
        ${albumBadge}
        ${mediaHTML}
        <div class="bento-info">
            <h3>${data.titulo}</h3>
            <span class="bento-tag">${data.tipoEvento}</span>
        </div>
    `;

    let targetId = allGridIds.length > 0 ? allGridIds[0] : '';

    const isVideo = data.tipoArchivo === 'video' || data.tipoArchivo === 'youtube' || (data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov') || data.urlImagen.includes('.webm')));

    // 1. Usar seccionCatalogo si el Admin App lo provee (Nuevo sistema)
    if (data.seccionCatalogo) {
        targetId = `bento-grid-${getSlug(data.seccionCatalogo)}`;
    } else {
        // 2. Fallback de compatibilidad para datos antiguos
        const tipo = (data.tipoEvento || '').toLowerCase();
        if (isVideo && allGridIds.includes('bento-grid-videos')) {
            targetId = 'bento-grid-videos';
        } else if (tipo.includes('ajedrez') && allGridIds.includes('bento-grid-ajedrez')) {
            targetId = 'bento-grid-ajedrez';
        } else if ((tipo.includes('pack') || tipo.includes('10%') || tipo.includes('off')) && allGridIds.includes('bento-grid-packs')) {
            targetId = 'bento-grid-packs';
        }
    }

    const grid = document.getElementById(targetId);
    if (grid) grid.appendChild(item);
}

function renderHeroReel(data) {
    const isVideo = data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov') || data.urlImagen.includes('video'));
    if (!isVideo) return;

    const mediaHTML = `<video src="${data.urlImagen}" autoplay loop muted playsinline loading="lazy"></video>`;
    heroReelsContainer.innerHTML += mediaHTML;
}

// --- Filtros dinámicos (Dropdowns) ---
let currentFilterCentro = '';
let currentFilterTipo = '';
let currentSearchQuery = '';
let currentSortOrder = 'none';
let searchDebounceTimer = null;

// Poblar dropdowns con datos GLOBALES de todos los tabs
function poblarFiltrosDelTab(preserveFilters = false) {
    const filterCentro = document.getElementById('filter-centro');
    const filterTipo = document.getElementById('filter-tipo');
    const filterSort = document.getElementById('filter-sort');
    if (!filterCentro || !filterTipo) return;

    // Extraer valores únicos de TODOS los grids (global)
    const centros = new Set();
    const tipos = new Set();

    allGridIds.forEach(id => {
        const grid = document.getElementById(id);
        if (!grid) return;
        grid.querySelectorAll('.bento-item').forEach(item => {
            const recinto = item.getAttribute('data-recinto');
            const tipo = item.getAttribute('data-tipo');
            if (recinto && recinto.trim()) centros.add(recinto.trim());
            if (tipo && tipo.trim()) tipos.add(tipo.trim());
        });
    });

    if (!preserveFilters) {
        // Resetear filtros al cambiar de tab
        currentFilterCentro = '';
        currentFilterTipo = '';
        currentSearchQuery = '';
        currentSortOrder = 'none';

        // Limpiar search input
        const searchInput = document.getElementById('catalog-search');
        const clearBtn = document.getElementById('catalog-search-clear');
        if (searchInput) searchInput.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
    }

    // Guardar selección previa
    const prevCentro = preserveFilters ? currentFilterCentro : '';
    const prevTipo = preserveFilters ? currentFilterTipo : '';
    const prevSort = preserveFilters ? currentSortOrder : 'none';

    // Re-poblar select de centro
    filterCentro.innerHTML = '<option value="">Todos los recintos</option>';
    [...centros].sort().forEach(centro => {
        const opt = document.createElement('option');
        opt.value = centro;
        opt.textContent = centro;
        filterCentro.appendChild(opt);
    });

    // Re-poblar select de tipo
    filterTipo.innerHTML = '<option value="">Todos los tipos</option>';
    [...tipos].sort().forEach(tipo => {
        const opt = document.createElement('option');
        opt.value = tipo;
        opt.textContent = tipo;
        filterTipo.appendChild(opt);
    });

    // Restaurar selección
    filterCentro.value = prevCentro;
    filterTipo.value = prevTipo;
    if (filterSort) filterSort.value = prevSort;

    // Mostrar todos los items del tab activo (quitar filtro previo)
    if (!preserveFilters) {
        const activeGrid = document.getElementById(activeTabId);
        if (activeGrid) {
            activeGrid.querySelectorAll('.bento-item').forEach(item => {
                item.style.display = '';
                item.classList.remove('filtering-out', 'filtering-in');
            });
        }
    }
}

function aplicarFiltros() {
    // Primero verificar si el tab actual tiene resultados con estos filtros
    const activeGrid = document.getElementById(activeTabId);
    if (!activeGrid) return;

    const query = currentSearchQuery.toLowerCase().trim();

    // Función helper para verificar si un item cumple los filtros
    const itemMatchesFilters = (item) => {
        const recinto = item.getAttribute('data-recinto') || '';
        const tipo = item.getAttribute('data-tipo') || '';
        const titulo = item.querySelector('.bento-info h3')?.textContent || '';

        if (currentFilterCentro && recinto !== currentFilterCentro) return false;
        if (currentFilterTipo && tipo !== currentFilterTipo) return false;
        if (query) {
            const searchable = `${titulo} ${recinto} ${tipo}`.toLowerCase();
            if (!searchable.includes(query)) return false;
        }
        return true;
    };

    // Contar matches en el tab actual
    const currentItems = Array.from(activeGrid.querySelectorAll('.bento-item'));
    const currentMatches = currentItems.filter(itemMatchesFilters);

    // Si no hay matches en el tab actual pero sí hay un filtro activo, buscar en otros tabs
    if (currentMatches.length === 0 && (currentFilterCentro || currentFilterTipo || query)) {
        for (const gridId of allGridIds) {
            if (gridId === activeTabId) continue;
            const otherGrid = document.getElementById(gridId);
            if (!otherGrid) continue;
            const otherItems = Array.from(otherGrid.querySelectorAll('.bento-item'));
            const otherMatches = otherItems.filter(itemMatchesFilters);
            if (otherMatches.length > 0) {
                // Auto-switch al tab que tiene resultados (sin resetear filtros)
                const tabBtns = document.querySelectorAll('.tab-btn');
                const tabContents = document.querySelectorAll('.tab-content');
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active-content'));

                const btnActivar = Array.from(tabBtns).find(b => b.getAttribute('data-target') === gridId);
                if (btnActivar) btnActivar.classList.add('active');
                const targetGrid = document.getElementById(gridId);
                if (targetGrid) targetGrid.classList.add('active-content');

                activeTabId = gridId;
                // Re-aplicar filtros en el nuevo tab
                aplicarFiltrosEnTab();
                return;
            }
        }
    }

    // Aplicar filtros normalmente en el tab actual
    aplicarFiltrosEnTab();
}

// Aplica filtros en el tab activo sin lógica de auto-switch
function aplicarFiltrosEnTab() {
    const activeGrid = document.getElementById(activeTabId);
    if (!activeGrid) return;

    const items = Array.from(activeGrid.querySelectorAll('.bento-item'));
    const query = currentSearchQuery.toLowerCase().trim();

    items.forEach(item => {
        const recinto = item.getAttribute('data-recinto') || '';
        const tipo = item.getAttribute('data-tipo') || '';
        const titulo = item.querySelector('.bento-info h3')?.textContent || '';

        let show = true;
        if (currentFilterCentro && recinto !== currentFilterCentro) show = false;
        if (currentFilterTipo && tipo !== currentFilterTipo) show = false;
        if (query) {
            const searchable = `${titulo} ${recinto} ${tipo}`.toLowerCase();
            if (!searchable.includes(query)) show = false;
        }

        if (show) {
            if (item.style.display === 'none') {
                item.style.display = '';
                item.classList.remove('filtering-out');
                item.classList.add('filtering-in');
                item.addEventListener('animationend', () => {
                    item.classList.remove('filtering-in');
                }, { once: true });
            } else {
                item.style.display = '';
            }
        } else {
            item.classList.add('filtering-out');
            setTimeout(() => {
                if (item.classList.contains('filtering-out')) {
                    item.style.display = 'none';
                    item.classList.remove('filtering-out');
                }
            }, 350);
        }
    });

    // Aplicar ordenamiento por m²
    if (currentSortOrder !== 'none') {
        const visibleItems = items.filter(i => i.style.display !== 'none');
        visibleItems.sort((a, b) => {
            const aM = parseFloat(a.getAttribute('data-metros')) || 0;
            const bM = parseFloat(b.getAttribute('data-metros')) || 0;
            return currentSortOrder === 'asc' ? aM - bM : bM - aM;
        });
        visibleItems.forEach(item => activeGrid.appendChild(item));
    }

    // Actualizar mensajes de grids vacíos tras filtrar
    setTimeout(() => mostrarMensajeGridsVaciosFiltrados(), 400);
}

function mostrarMensajeGridsVaciosFiltrados() {
    allGridIds.forEach(id => {
        const grid = document.getElementById(id);
        if (!grid) return;
        const visibleItems = grid.querySelectorAll('.bento-item:not([style*="display: none"])');
        const existingMsg = grid.querySelector('.empty-tab-msg');

        if (visibleItems.length === 0) {
            if (!existingMsg) {
                const msg = document.createElement('div');
                msg.className = 'empty-tab-msg';
                msg.innerHTML = `<p>🔍 No hay resultados con los filtros seleccionados.</p>`;
                grid.appendChild(msg);
            }
        } else {
            if (existingMsg) existingMsg.remove();
        }
    });
}

// Helper para extraer ID de YouTube
function getYoutubeId(url) {
    if (!url) return null;
    const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\\&v=|shorts\/)([^#\\&\\?]*).*/);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Detectar si un URL de YouTube es vertical (Shorts)
function isYoutubeVertical(url) {
    if (!url) return false;
    return url.includes('/shorts/') || url.includes('shorts%2F');
}

// 2. Lógica del Lightbox Modal
function buildLightboxMedia(mediaSrc, tipoArchivo) {
    const oldMedia = lightboxMediaContainer.querySelector('img, video, iframe');
    if (oldMedia) oldMedia.remove();

    // Limpiar carrusel de álbum si existe
    const oldAlbumContainer = lightboxMediaContainer.querySelector('.album-container');
    if (oldAlbumContainer) oldAlbumContainer.remove();
    const oldDots = lightboxMediaContainer.querySelector('.album-dots-container');
    if (oldDots) oldDots.remove();

    const isVideoLocal = tipoArchivo === 'video' || (mediaSrc && (mediaSrc.includes('.mp4') || mediaSrc.includes('.mov')));
    const isYoutube = tipoArchivo === 'youtube';

    let newMedia;
    if (isYoutube) {
        newMedia = document.createElement('iframe');
        const yId = getYoutubeId(mediaSrc);
        const isVertical = isYoutubeVertical(mediaSrc);
        newMedia.src = `https://www.youtube.com/embed/${yId}?autoplay=1`;
        newMedia.frameBorder = "0";
        newMedia.allowFullscreen = true;
        newMedia.allow = "autoplay; fullscreen";
        newMedia.className = isVertical ? 'yt-vertical' : 'yt-horizontal';
    } else if (isVideoLocal) {
        newMedia = document.createElement('video');
        newMedia.src = mediaSrc;
        newMedia.controls = true;
        newMedia.autoplay = true;
    } else {
        newMedia = document.createElement('img');
        newMedia.src = mediaSrc;
    }

    lightboxMediaContainer.insertBefore(newMedia, lightboxMediaContainer.querySelector('.lightbox-bottom-bar'));
}

function buildAlbumCarousel(images) {
    // Limpiar media previa
    const oldMedia = lightboxMediaContainer.querySelector('img, video, iframe');
    if (oldMedia) oldMedia.remove();
    const oldAlbumContainer = lightboxMediaContainer.querySelector('.album-container');
    if (oldAlbumContainer) oldAlbumContainer.remove();
    const oldDots = lightboxMediaContainer.querySelector('.album-dots-container');
    if (oldDots) oldDots.remove();

    albumImages = images;
    albumCurrentIndex = 0;

    // Precargar todas las imágenes para transiciones instantáneas
    images.forEach(src => {
        const preload = new Image();
        preload.src = src;
    });

    // Contenedor del álbum
    const albumContainer = document.createElement('div');
    albumContainer.className = 'album-container';

    const albumImg = document.createElement('img');
    albumImg.src = images[0];
    albumImg.className = 'album-image';
    albumContainer.appendChild(albumImg);

    // Flechas internas del álbum
    if (images.length > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'album-nav album-nav-prev';
        prevBtn.innerHTML = '&#8249;';
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateAlbum(-1);
        });
        albumContainer.appendChild(prevBtn);

        const nextBtn = document.createElement('button');
        nextBtn.className = 'album-nav album-nav-next';
        nextBtn.innerHTML = '&#8250;';
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateAlbum(1);
        });
        albumContainer.appendChild(nextBtn);

        let touchStartX = 0;
        let touchEndX = 0;
        albumContainer.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        albumContainer.addEventListener('touchend', (e) => {
            e.stopPropagation();
            touchEndX = e.changedTouches[0].screenX;
            const threshold = 40;
            if (touchEndX < touchStartX - threshold) navigateAlbum(1); // Swipe izquierda -> siguiente
            if (touchEndX > touchStartX + threshold) navigateAlbum(-1); // Swipe derecha -> anterior
        }, { passive: true });
    }

    lightboxMediaContainer.insertBefore(albumContainer, lightboxMediaContainer.querySelector('.lightbox-bottom-bar'));

    // Dots de navegación
    if (images.length > 1) {
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'album-dots-container';
        images.forEach((_, idx) => {
            const dot = document.createElement('button');
            dot.className = `album-dot ${idx === 0 ? 'active' : ''}`;
            dot.addEventListener('click', (e) => {
                e.stopPropagation();
                goToAlbumIndex(idx);
            });
            dotsContainer.appendChild(dot);
        });
        lightboxMediaContainer.insertBefore(dotsContainer, lightboxMediaContainer.querySelector('.lightbox-bottom-bar'));
    }
}

function navigateAlbum(direction) {
    const total = albumImages.length;
    if (total <= 1) return;
    const newIndex = (albumCurrentIndex + direction + total) % total;
    goToAlbumIndex(newIndex);
}

function goToAlbumIndex(index) {
    if (index === albumCurrentIndex) return;
    albumCurrentIndex = index;
    const albumImg = lightboxMediaContainer.querySelector('.album-image');
    if (albumImg) {
        // Fade out rápido
        albumImg.style.transition = 'opacity 0.15s ease';
        albumImg.style.opacity = '0';

        // Cambiar imagen tras fade out, fade in cuando cargue
        setTimeout(() => {
            albumImg.onload = () => {
                albumImg.style.transition = 'opacity 0.2s ease';
                albumImg.style.opacity = '1';
                albumImg.onload = null;
            };
            // Si ya está cacheada, onload dispara instantáneamente
            albumImg.src = albumImages[index];
            // Fallback: si la imagen ya estaba en caché el onload puede no disparar
            if (albumImg.complete) {
                albumImg.style.transition = 'opacity 0.2s ease';
                albumImg.style.opacity = '1';
            }
        }, 150);
    }
    // Actualizar dots
    const dots = lightboxMediaContainer.querySelectorAll('.album-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === index);
    });
}

function updateLightboxNav() {
    const btnPrev = document.getElementById('lightbox-prev');
    const btnNext = document.getElementById('lightbox-next');
    if (!btnPrev || !btnNext) return;
    const total = lightboxVisibleItems.length;
    btnPrev.style.display = total > 1 ? 'flex' : 'none';
    btnNext.style.display = total > 1 ? 'flex' : 'none';
}

function openLightbox(mediaSrc, ubicacion, tipoArchivo, metrosCuadrados, urlImagenes) {
    // Resetear estado del álbum
    albumImages = [];
    albumCurrentIndex = 0;

    // Si tiene múltiples imágenes, usar carrusel de álbum
    if (urlImagenes && Array.isArray(urlImagenes) && urlImagenes.length > 1 && tipoArchivo !== 'youtube') {
        buildAlbumCarousel(urlImagenes);
    } else {
        buildLightboxMedia(mediaSrc, tipoArchivo);
    }

    const recinto = ubicacion?.recinto || '';
    const comuna = ubicacion?.comuna || '';
    let locationText = recinto;
    if (recinto && comuna) locationText = `${recinto}, ${comuna}`;
    else if (comuna) locationText = comuna;
    if (metrosCuadrados) {
        locationText = locationText ? `${locationText} · ${metrosCuadrados} m²` : `${metrosCuadrados} m²`;
    }
    lightboxLocation.textContent = locationText || "Ubicación Premium";
    updateLightboxCTA(locationText, metrosCuadrados);
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    // Ocultar widget de WhatsApp al abrir lightbox
    const waWidget = document.querySelector('.wa-widget-container');
    if (waWidget) waWidget.style.display = 'none';

    updateLightboxNav();
}

function updateLightboxCTA(locationText, metrosCuadrados) {
    const ctaBtn = document.getElementById('lightbox-cta');
    if (!ctaBtn) return;
    const phone = '56988475188';
    let desc = '¡Hola Alejandra Producciones! 👋\n';
    desc += 'Me encantó lo que vi en su catálogo';
    if (locationText && locationText !== 'Ubicación Premium') {
        desc += ` (${locationText})`;
    }
    desc += '.\nMe gustaría cotizar algo similar. 🎉';
    ctaBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(desc)}`;
}

function navigateLightbox(direction) {
    const total = lightboxVisibleItems.length;
    if (total <= 1) return;

    lightboxCurrentIndex = (lightboxCurrentIndex + direction + total) % total;
    const targetItem = lightboxVisibleItems[lightboxCurrentIndex];
    if (!targetItem) return;

    // Extraer datos del item (están en el click handler, usamos atributos de datos que podemos inferir)
    // Usamos el dataset que almacenamos al renderizar
    const urlImagen = targetItem.dataset.urlImagen;
    const tipoArchivo = targetItem.dataset.tipoArchivo;
    const recinto = targetItem.dataset.recinto;
    const comuna = targetItem.dataset.comuna;
    const metrosCuadrados = targetItem.dataset.metros;

    // Animar la transición
    const mediaEl = lightboxMediaContainer.querySelector('img, video, iframe');
    if (mediaEl) {
        mediaEl.style.opacity = '0';
        mediaEl.style.transform = direction > 0 ? 'translateX(-30px)' : 'translateX(30px)';
    }

    setTimeout(() => {
        // Comprobar si el nuevo item tiene álbum
        const itemUrlImagenesJSON = targetItem.dataset.urlImagenes;
        let itemUrlImagenes = [];
        if (itemUrlImagenesJSON) {
            try { itemUrlImagenes = JSON.parse(itemUrlImagenesJSON); } catch(e) {}
        }

        if (itemUrlImagenes.length > 1 && tipoArchivo !== 'youtube') {
            buildAlbumCarousel(itemUrlImagenes);
        } else {
            buildLightboxMedia(urlImagen, tipoArchivo);
            const newMediaEl = lightboxMediaContainer.querySelector('img, video, iframe');
            if (newMediaEl) {
                newMediaEl.style.opacity = '0';
                newMediaEl.style.transform = direction > 0 ? 'translateX(30px)' : 'translateX(-30px)';
                newMediaEl.style.transition = 'none';
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        newMediaEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        newMediaEl.style.opacity = '1';
                        newMediaEl.style.transform = 'translateX(0)';
                    });
                });
            }
        }

        let locationText = recinto || '';
        if (recinto && comuna) locationText = `${recinto}, ${comuna}`;
        else if (comuna) locationText = comuna;
        if (metrosCuadrados) {
            locationText = locationText ? `${locationText} · ${metrosCuadrados} m²` : `${metrosCuadrados} m²`;
        }
        lightboxLocation.textContent = locationText || 'Ubicación Premium';
        updateLightboxCTA(locationText, metrosCuadrados);
    }, 150);
}

function closeLightbox() {
    lightbox.classList.remove('active');
    // Pausar video local si existe
    const oldVideo = lightboxMediaContainer.querySelector('video');
    if (oldVideo) oldVideo.pause();
    // Destruir iframe de YouTube para detener el audio completamente
    const oldIframe = lightboxMediaContainer.querySelector('iframe');
    if (oldIframe) oldIframe.remove();
    // Limpiar album carousel si existe
    const oldAlbumContainer = lightboxMediaContainer.querySelector('.album-container');
    if (oldAlbumContainer) oldAlbumContainer.remove();
    const oldDots = lightboxMediaContainer.querySelector('.album-dots-container');
    if (oldDots) oldDots.remove();
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';

    // Mostrar widget de WhatsApp al cerrar lightbox
    const waWidget = document.querySelector('.wa-widget-container');
    if (waWidget) waWidget.style.display = '';

    lightboxCurrentIndex = -1;
    lightboxVisibleItems = [];
    albumImages = [];
    albumCurrentIndex = 0;
}

if (lightbox) {
    document.addEventListener('click', (e) => {
        if (e.target.matches('.lightbox-close')) closeLightbox();
        if (e.target.matches('#lightbox-prev')) navigateLightbox(-1);
        if (e.target.matches('#lightbox-next')) navigateLightbox(1);
    });
    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
    });

    // Navegación con teclado (←/→/Esc)
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
        if (e.key === 'ArrowRight') navigateLightbox(1);
        if (e.key === 'Escape') closeLightbox();
    });

    // Navegación con swipe táctil (móvil)
    let touchStartX = 0;
    let touchStartY = 0;
    lightbox.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    lightbox.addEventListener('touchend', (e) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        // Solo swipe horizontal significativo (mínimo 50px) y más horizontal que vertical
        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
            navigateLightbox(deltaX < 0 ? 1 : -1);
        }
    }, { passive: true });
}

// 3. Formulario de Contacto -> Redirección WhatsApp
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const nombre = document.getElementById('nombre').value;
        const tipoEventoSelect = document.getElementById('tipo_evento').value;
        const otroEvento = document.getElementById('otro_evento').value;
        const desc = document.getElementById('descripcion').value;

        let tipoEvento = tipoEventoSelect;
        if (tipoEventoSelect === 'Otro' && otroEvento.trim() !== '') {
            tipoEvento = otroEvento.trim();
        }

        // Número de teléfono de WhatsApp del producor (Incluir código país, sin +)
        const phone = "56988475188";

        const mensaje = `¡Hola Alejandra Producciones! 👋\nMi nombre es *${nombre}*.\nMe gustaría cotizar un evento tipo: *${tipoEvento}* 🎉\n*Detalles: ${desc}* ✨`;

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
    });

    const selectTipoEvento = document.getElementById('tipo_evento');
    const containerOtroEvento = document.getElementById('container_otro_evento');
    const inputOtroEvento = document.getElementById('otro_evento');

    selectTipoEvento.addEventListener('change', (e) => {
        if (e.target.value === 'Otro') {
            containerOtroEvento.style.display = 'block';
            inputOtroEvento.required = true;
        } else {
            containerOtroEvento.style.display = 'none';
            inputOtroEvento.required = false;
        }
    });
}

// Fallback visual si no hubiese conexión
function crearMockData() {
    const mocks = [
        {
            titulo: "Boda Castillo Encantado",
            urlImagen: "https://images.unsplash.com/photo-1519225421980-715cb0215aed?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
            tipoEvento: "Boda",
            ubicacion: { recinto: "Castillo Hidalgo" }
        },
        {
            titulo: "Demo Video Reels Hero (Autocarga)",
            urlImagen: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
            tipoEvento: "Corporativo",
            tipoArchivo: "video",
            ubicacion: { recinto: "Espacio Riesco" }
        },
        {
            titulo: "15 Años Flúor",
            urlImagen: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
            tipoEvento: "15 Años",
            ubicacion: { recinto: "Club Providencia" }
        }
    ];

    const grids = allGridIds.map(id => document.getElementById(id));
    grids.forEach(g => { if (g) g.innerHTML = ''; });

    allEventosData = [...mocks];
    if (heroReelsContainer) heroReelsContainer.innerHTML = '';
    mocks.forEach(renderBentoItem);
    renderHeroReel(mocks[1]); // Renderizar el video de test de reels
    poblarFiltrosDelTab();
    mostrarMensajeGridsVacios();
}

// Mostrar mensaje amigable en pestañas vacías
function mostrarMensajeGridsVacios() {
    allGridIds.forEach((id, index) => {
        const catName = catalogCategories[index] || 'Categoría';
        const grid = document.getElementById(id);
        if (!grid) return;
        // Verificar si solo tiene el empty-tab-msg o está realmente vacío de bento-items
        const items = grid.querySelectorAll('.bento-item');
        const existingMsg = grid.querySelector('.empty-tab-msg');
        if (items.length === 0) {
            if (!existingMsg) {
                const msg = document.createElement('div');
                msg.className = 'empty-tab-msg';
                msg.innerHTML = `<p>📸 Próximamente fotos de <strong>${catName}</strong>. ¡Contáctanos para más info!</p>`;
                grid.appendChild(msg);
            } else {
                existingMsg.innerHTML = `<p>📸 Próximamente fotos de <strong>${catName}</strong>. ¡Contáctanos para más info!</p>`;
            }
        } else {
            // Si hay items, remover el mensaje de carga
            if (existingMsg) existingMsg.remove();
        }
    });
}

// Inicializar la carga al cargar DOM
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('catalog-tabs-container') || bentoGrid) {
        fetchCategorias(); // Esto llamará a fetchEventos internamente tras crear los tabs
        fetchCatalogoPDF();
    }

    // --- Lógica de Filtros (Dropdowns) ---
    const filterCentro = document.getElementById('filter-centro');
    const filterTipo = document.getElementById('filter-tipo');
    const filterSort = document.getElementById('filter-sort');

    if (filterCentro) {
        filterCentro.addEventListener('change', () => {
            currentFilterCentro = filterCentro.value;
            aplicarFiltros();
        });
    }
    if (filterTipo) {
        filterTipo.addEventListener('change', () => {
            currentFilterTipo = filterTipo.value;
            aplicarFiltros();
        });
    }
    if (filterSort) {
        filterSort.addEventListener('change', () => {
            currentSortOrder = filterSort.value;
            aplicarFiltros();
        });
    }

    // Barra de búsqueda
    const searchInput = document.getElementById('catalog-search');
    const searchClearBtn = document.getElementById('catalog-search-clear');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                currentSearchQuery = searchInput.value;
                if (searchClearBtn) {
                    searchClearBtn.style.display = currentSearchQuery ? 'block' : 'none';
                }
                aplicarFiltros();
            }, 250);
        });
    }
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            currentSearchQuery = '';
            searchClearBtn.style.display = 'none';
            aplicarFiltros();
        });
    }

    // --- Lógica de Pestañas (Catálogo) ---
    window.abrirCatalogoEn = (catNameOrTargetId) => {
        let targetId = catNameOrTargetId;
        if (!targetId.startsWith('bento-grid-')) {
            targetId = `bento-grid-${getSlug(targetId)}`;
        }

        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        if (!tabBtns || tabBtns.length === 0) return;

        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active-content'));

        // Encontrar boton que corresponda al target
        const btnActivar = Array.from(tabBtns).find(b => b.getAttribute('data-target') === targetId);
        if (btnActivar) btnActivar.classList.add('active');

        const targetGrid = document.getElementById(targetId);
        if (targetGrid) targetGrid.classList.add('active-content');

        // Actualizar tab activo y re-poblar filtros contextuales
        activeTabId = targetId;
        poblarFiltrosDelTab();

        // Navegar a la sección bajando suavemente
        const catalogoSection = document.getElementById('catalogo');
        if (catalogoSection) {
            catalogoSection.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // --- Animación de Contadores ---
    const statNumbers = document.querySelectorAll('.stat-number');
    let animated = false;

    if (statNumbers.length > 0) {
        const animateCounters = () => {
            statNumbers.forEach(stat => {
                const target = +stat.getAttribute('data-target');
                const duration = 1000; // 1 segundo
                const increment = target / (duration / 16);

                let current = 0;
                const updateCounter = () => {
                    current += increment;
                    if (current < target) {
                        stat.innerText = Math.ceil(current) + (target >= 200 ? '+' : '');
                        requestAnimationFrame(updateCounter);
                    } else {
                        stat.innerText = target + (target >= 200 ? '+' : '');
                    }
                };
                updateCounter();
            });
        };

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !animated) {
                animateCounters();
                animated = true;
            }
        }, { threshold: 0.5 });

        observer.observe(document.querySelector('.stats-section'));
    }

    // --- Lógica del Menú Hamburguesa ---
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('nav-menu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });

        // Cerrar el menú al hacer click en un enlace
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    // --- Lógica del Widget Flotante de WhatsApp ---
    const waBtnToggle = document.getElementById('wa-btn-toggle');
    const waPopup = document.getElementById('wa-popup');
    const waPopupClose = document.getElementById('wa-popup-close');

    if (waBtnToggle && waPopup && waPopupClose) {
        // Abrir / Cerrar el popup al hacer clic en el botón flotante
        waBtnToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            waPopup.classList.toggle('active');
        });

        // Cerrar al hacer clic en la X
        waPopupClose.addEventListener('click', (e) => {
            e.stopPropagation();
            waPopup.classList.remove('active');
        });

        // Cerrar al hacer clic fuera del popup
        document.addEventListener('click', (e) => {
            if (waPopup.classList.contains('active') && !waPopup.contains(e.target) && !waBtnToggle.contains(e.target)) {
                waPopup.classList.remove('active');
            }
        });
    }

    // --- Lógica del Formulario de Contacto ---
    const contactForm = document.getElementById('contact-form');
    const selectTipoEvento = document.getElementById('tipo_evento');
    const containerOtroEvento = document.getElementById('container_otro_evento');

    if (selectTipoEvento && containerOtroEvento) {
        selectTipoEvento.addEventListener('change', (e) => {
            if (e.target.value === 'Otro') {
                containerOtroEvento.style.display = 'block';
                document.getElementById('otro_evento').required = true;
            } else {
                containerOtroEvento.style.display = 'none';
                document.getElementById('otro_evento').required = false;
                document.getElementById('otro_evento').value = '';
            }
        });
    }

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const nombre = document.getElementById('nombre').value.trim();
            let tipoEvento = document.getElementById('tipo_evento').value;
            if (tipoEvento === 'Otro') {
                tipoEvento = document.getElementById('otro_evento').value.trim();
            }
            const descripcion = document.getElementById('descripcion').value.trim();

            const phone = '56988475188';
            let message = `¡Hola Alejandra Producciones! 👋\n`;
            message += `Mi nombre es *${nombre}*.\n`;
            message += `Me gustaría cotizar un evento tipo: *${tipoEvento}* 🎉\n`;
            message += `*Detalles: ${descripcion}* 📝`;

            const whatsappUrl = `https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
            window.open(whatsappUrl, '_blank');
        });
    }
});
