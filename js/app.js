import { db } from './firebase-config.js';
import { collection, getDocs, getDoc, doc, orderBy, query, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
let activeTabId = 'bento-grid-led';

// Navegación del lightbox
let lightboxCurrentIndex = -1;
let lightboxVisibleItems = [];

// Map de seccionCatalogo a gridId
const seccionToGrid = {
    'Pistas LED': 'bento-grid-led',
    'Ajedrez': 'bento-grid-ajedrez',
    'Packs': 'bento-grid-packs',
    'Videos': 'bento-grid-videos'
};

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

// 1. Obtener eventos/packs desde Firestore (bento grid)
async function fetchEventos() {
    try {
        const q = query(collection(db, "eventos"), orderBy("fecha", "desc"), limit(30));

        const querySnapshot = await getDocs(q);

        const grids = [
            document.getElementById('bento-grid-led'),
            document.getElementById('bento-grid-ajedrez'),
            document.getElementById('bento-grid-packs'),
            document.getElementById('bento-grid-videos')
        ];
        grids.forEach(g => { if (g) g.innerHTML = ''; });

        if (querySnapshot.empty) {
            if (grids[0]) grids[0].innerHTML = '<p>No hay eventos cargados aún.</p>';
            return;
        }

        allEventosData = [];
        let reelsCargados = 0;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            allEventosData.push(data);
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

    } catch (error) {
        console.error("🔥 Error real de Firebase al leer la base de datos:", error);
        console.warn("Fallo lectura Firebase. Cargando Mock UI...");
        crearMockData();
    }

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

    // Al hacer click, abrir el lightbox con navegación
    item.addEventListener('click', () => {
        const activeGrid = document.getElementById(activeTabId);
        if (activeGrid) {
            lightboxVisibleItems = Array.from(activeGrid.querySelectorAll('.bento-item:not([style*="display: none"])'));
            lightboxCurrentIndex = lightboxVisibleItems.indexOf(item);
        }
        openLightbox(data.urlImagen, data.ubicacion, data.tipoArchivo, data.metrosCuadrados);
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

    item.innerHTML = `
        ${m2Badge}
        ${mediaHTML}
        <div class="bento-info">
            <h3>${data.titulo}</h3>
            <span class="bento-tag">${data.tipoEvento}</span>
        </div>
    `;

    let targetId = 'bento-grid-led';

    const isVideo = data.tipoArchivo === 'video' || data.tipoArchivo === 'youtube' || (data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov') || data.urlImagen.includes('.webm')));

    // 1. Usar seccionCatalogo si el Admin App lo provee (Nuevo sistema)
    if (data.seccionCatalogo) {
        if (data.seccionCatalogo === 'Ajedrez') targetId = 'bento-grid-ajedrez';
        else if (data.seccionCatalogo === 'Packs') targetId = 'bento-grid-packs';
        else if (data.seccionCatalogo === 'Videos') targetId = 'bento-grid-videos';
    } else {
        // 2. Fallback de compatibilidad para datos antiguos
        const tipo = (data.tipoEvento || '').toLowerCase();
        if (isVideo) {
            targetId = 'bento-grid-videos';
        } else if (tipo.includes('ajedrez')) {
            targetId = 'bento-grid-ajedrez';
        } else if (tipo.includes('pack') || tipo.includes('10%') || tipo.includes('off')) {
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

// --- Filtros dinámicos ---
// Poblar filtros solo con los datos del tab activo
function poblarFiltrosDelTab() {
    const filterCentro = document.getElementById('filter-centro');
    const filterTipo = document.getElementById('filter-tipo');
    if (!filterCentro || !filterTipo) return;

    // Obtener los items del grid activo
    const activeGrid = document.getElementById(activeTabId);
    if (!activeGrid) return;

    const items = activeGrid.querySelectorAll('.bento-item');

    // Extraer valores únicos de los items de este tab
    const centros = new Set();
    const tipos = new Set();

    items.forEach(item => {
        const recinto = item.getAttribute('data-recinto');
        const tipo = item.getAttribute('data-tipo');
        if (recinto && recinto.trim()) centros.add(recinto.trim());
        if (tipo && tipo.trim()) tipos.add(tipo.trim());
    });

    // Guardar valor actual para re-seleccionar si sigue disponible
    const prevCentro = filterCentro.value;
    const prevTipo = filterTipo.value;

    // Limpiar y re-poblar
    filterCentro.innerHTML = '<option value="">Todos los centros</option>';
    filterTipo.innerHTML = '<option value="">Todos los tipos</option>';

    [...centros].sort().forEach(centro => {
        const opt = document.createElement('option');
        opt.value = centro;
        opt.textContent = centro;
        filterCentro.appendChild(opt);
    });

    [...tipos].sort().forEach(tipo => {
        const opt = document.createElement('option');
        opt.value = tipo;
        opt.textContent = tipo;
        filterTipo.appendChild(opt);
    });

    // Resetear filtros al cambiar de tab
    filterCentro.value = '';
    filterTipo.value = '';

    // Mostrar todos los items del tab (quitar filtro previo)
    items.forEach(item => { item.style.display = ''; });
}

function aplicarFiltros() {
    const filterCentro = document.getElementById('filter-centro');
    const filterTipo = document.getElementById('filter-tipo');
    if (!filterCentro || !filterTipo) return;

    const centroSeleccionado = filterCentro.value;
    const tipoSeleccionado = filterTipo.value;

    // Filtrar solo los bento-items del tab activo
    const activeGrid = document.getElementById(activeTabId);
    if (!activeGrid) return;

    const items = activeGrid.querySelectorAll('.bento-item');
    items.forEach(item => {
        const recinto = item.getAttribute('data-recinto') || '';
        const tipo = item.getAttribute('data-tipo') || '';

        let show = true;
        if (centroSeleccionado && recinto !== centroSeleccionado) show = false;
        if (tipoSeleccionado && tipo !== tipoSeleccionado) show = false;

        item.style.display = show ? '' : 'none';
    });

    // Actualizar mensajes de grids vacíos tras filtrar
    mostrarMensajeGridsVaciosFiltrados();
}

function mostrarMensajeGridsVaciosFiltrados() {
    const gridIds = ['bento-grid-led', 'bento-grid-ajedrez', 'bento-grid-packs', 'bento-grid-videos'];
    gridIds.forEach(id => {
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

    lightboxMediaContainer.insertBefore(newMedia, lightboxMediaContainer.querySelector('.lightbox-overlay-text'));
}

function updateLightboxNav() {
    const btnPrev = document.getElementById('lightbox-prev');
    const btnNext = document.getElementById('lightbox-next');
    if (!btnPrev || !btnNext) return;
    const total = lightboxVisibleItems.length;
    btnPrev.style.display = total > 1 ? 'flex' : 'none';
    btnNext.style.display = total > 1 ? 'flex' : 'none';
}

function openLightbox(mediaSrc, ubicacion, tipoArchivo, metrosCuadrados) {
    buildLightboxMedia(mediaSrc, tipoArchivo);

    const recinto = ubicacion?.recinto || '';
    const comuna = ubicacion?.comuna || '';
    let locationText = recinto;
    if (recinto && comuna) locationText = `${recinto}, ${comuna}`;
    else if (comuna) locationText = comuna;
    if (metrosCuadrados) {
        locationText = locationText ? `${locationText} · ${metrosCuadrados} m²` : `${metrosCuadrados} m²`;
    }
    lightboxLocation.textContent = locationText || "Ubicación Premium";
    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    updateLightboxNav();
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

        let locationText = recinto || '';
        if (recinto && comuna) locationText = `${recinto}, ${comuna}`;
        else if (comuna) locationText = comuna;
        if (metrosCuadrados) {
            locationText = locationText ? `${locationText} · ${metrosCuadrados} m²` : `${metrosCuadrados} m²`;
        }
        lightboxLocation.textContent = locationText || 'Ubicación Premium';
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
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    lightboxCurrentIndex = -1;
    lightboxVisibleItems = [];
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

    const grids = [
        document.getElementById('bento-grid-led'),
        document.getElementById('bento-grid-ajedrez'),
        document.getElementById('bento-grid-packs'),
        document.getElementById('bento-grid-videos')
    ];
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
    const gridIds = ['bento-grid-led', 'bento-grid-ajedrez', 'bento-grid-packs', 'bento-grid-videos'];
    const labels = { 'bento-grid-led': 'Pistas LED', 'bento-grid-ajedrez': 'Ajedrez', 'bento-grid-packs': 'Packs', 'bento-grid-videos': 'Videos' };
    gridIds.forEach(id => {
        const grid = document.getElementById(id);
        if (!grid) return;
        // Verificar si solo tiene el empty-tab-msg o está realmente vacío de bento-items
        const items = grid.querySelectorAll('.bento-item');
        const existingMsg = grid.querySelector('.empty-tab-msg');
        if (items.length === 0) {
            if (!existingMsg) {
                const msg = document.createElement('div');
                msg.className = 'empty-tab-msg';
                msg.innerHTML = `<p>📸 Próximamente fotos de <strong>${labels[id]}</strong>. ¡Contáctanos para más info!</p>`;
                grid.appendChild(msg);
            } else {
                existingMsg.innerHTML = `<p>📸 Próximamente fotos de <strong>${labels[id]}</strong>. ¡Contáctanos para más info!</p>`;
            }
        } else {
            // Si hay items, remover el mensaje de carga
            if (existingMsg) existingMsg.remove();
        }
    });
}

// Inicializar la carga al cargar DOM
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('bento-grid-led') || bentoGrid) {
        fetchEventos();
        fetchCatalogoPDF();
    }

    // --- Lógica de Filtros ---
    const filterCentro = document.getElementById('filter-centro');
    const filterTipo = document.getElementById('filter-tipo');
    if (filterCentro) filterCentro.addEventListener('change', aplicarFiltros);
    if (filterTipo) filterTipo.addEventListener('change', aplicarFiltros);

    // --- Lógica de Pestañas (Catálogo) ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    window.abrirCatalogoEn = (targetId) => {
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

    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                abrirCatalogoEn(btn.getAttribute('data-target'));
            });
        });
    }

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
});
