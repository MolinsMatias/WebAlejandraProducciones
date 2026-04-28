import { db } from './firebase-config.js';
import { collection, getDocs, orderBy, query, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Elementos del DOM
const bentoGrid = document.getElementById('bento-grid');
const lightbox = document.getElementById('lightbox');
const lightboxMediaContainer = document.getElementById('lightbox-media-container');
const lightboxLocation = document.getElementById('lightbox-location');
const heroReelsContainer = document.getElementById('hero-reels-container');
const lightboxClose = document.getElementById('lightbox-close');

// 1. Obtener eventos/packs desde Firestore (bento grid)
async function fetchEventos() {
    try {
        const q = query(collection(db, "eventos"), orderBy("fecha", "desc"), limit(30));

        // Mientras no haya datos reales por credenciales falsas, usaremos un mock fallback 
        // para asegurar que puedas visualizar el diseño. 
        // Si hay error (por ej. falta de credenciales), caemos al catch.

        const querySnapshot = await getDocs(q);
        
        const grids = [
            document.getElementById('bento-grid-led'),
            document.getElementById('bento-grid-ajedrez'),
            document.getElementById('bento-grid-packs'),
            document.getElementById('bento-grid-videos')
        ];
        grids.forEach(g => { if(g) g.innerHTML = ''; });

        if (querySnapshot.empty) {
            if (grids[0]) grids[0].innerHTML = '<p>No hay eventos cargados aún.</p>';
            return;
        }

        let reelsCargados = 0;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            renderBentoItem(data);

            // Poblar los 2 primeros reels si son formato video
            if (data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov') || data.urlImagen.includes('.webm') || data.tipoArchivo === 'video')) {
                if (reelsCargados < 2) {
                    renderHeroReel(data);
                    reelsCargados++;
                }
            }
        });

    } catch (error) {
        console.error("🔥 Error real de Firebase al leer la base de datos:", error);
        console.warn("Fallo lectura Firebase. Cargando Mock UI...");
        crearMockData();
    }
}

function renderBentoItem(data) {
    const item = document.createElement('div');
    item.className = 'bento-item';

    // Al hacer click, abrir el lightbox
    item.addEventListener('click', () => openLightbox(data.urlImagen, data.ubicacion, data.tipoArchivo));

    let mediaHTML = `<img src="${data.urlImagen}" alt="${data.titulo}" loading="lazy">`;
    
    if (data.tipoArchivo === 'youtube') {
        const getYoutubeId = (url) => {
            const match = url.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
            return (match && match[2].length === 11) ? match[2] : null;
        };
        const yId = getYoutubeId(data.urlImagen);
        if (yId) {
            mediaHTML = `<iframe src="https://www.youtube.com/embed/${yId}?autoplay=0&controls=1&rel=0&showinfo=0" frameborder="0" allowfullscreen style="width:100%; height:100%; pointer-events: none;"></iframe>`;
        }
    } else if (data.tipoArchivo === 'video' || (data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov')))) {
        mediaHTML = `<video src="${data.urlImagen}" loop muted playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>`;
    }

    item.innerHTML = `
        ${mediaHTML}
        <div class="bento-info">
            <h3>${data.titulo}</h3>
            <span class="bento-tag">${data.tipoEvento}</span>
        </div>
    `;
    
    let targetId = 'bento-grid-led';
    
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
    if(grid) grid.appendChild(item);
}

function renderHeroReel(data) {
    const isVideo = data.urlImagen && (data.urlImagen.includes('.mp4') || data.urlImagen.includes('.mov') || data.urlImagen.includes('video'));
    if (!isVideo) return;

    const mediaHTML = `<video src="${data.urlImagen}" autoplay loop muted playsinline loading="lazy"></video>`;
    heroReelsContainer.innerHTML += mediaHTML;
}

// 2. Lógica del Lightbox Modal
function openLightbox(mediaSrc, ubicacion, tipoArchivo) {
    const oldMedia = lightboxMediaContainer.querySelector('img, video, iframe');
    if (oldMedia) oldMedia.remove();

    const isVideoLocal = tipoArchivo === 'video' || (mediaSrc && (mediaSrc.includes('.mp4') || mediaSrc.includes('.mov')));
    const isYoutube = tipoArchivo === 'youtube';

    let newMedia;
    if (isYoutube) {
        newMedia = document.createElement('iframe');
        const match = mediaSrc.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/);
        const yId = (match && match[2].length === 11) ? match[2] : null;
        newMedia.src = `https://www.youtube.com/embed/${yId}?autoplay=1`;
        newMedia.frameBorder = "0";
        newMedia.allowFullscreen = true;
        newMedia.style.width = "100%";
        newMedia.style.height = "100%";
    } else if (isVideoLocal) {
        newMedia = document.createElement('video');
        newMedia.src = mediaSrc;
        newMedia.controls = true;
        newMedia.autoplay = true;
    } else {
        newMedia = document.createElement('img');
        newMedia.src = mediaSrc;
    }

    // Insert as the first child right before the overlay text
    lightboxMediaContainer.insertBefore(newMedia, lightboxMediaContainer.querySelector('.lightbox-overlay-text'));

    lightboxLocation.textContent = ubicacion?.recinto || ubicacion?.comuna || "Ubicación Premium";
    lightbox.classList.add('active');
}

function closeLightbox() {
    lightbox.classList.remove('active');
    const oldMedia = lightboxMediaContainer.querySelector('video');
    if (oldMedia) oldMedia.pause();
}

if (lightbox) {
    document.addEventListener('click', (e) => {
        if (e.target.matches('.lightbox-close')) closeLightbox();
    });
    lightbox.addEventListener('click', (e) => {
        // Cerrar si se clickea el overlay gris y no la imagen en sí
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
}

// 3. Formulario de Contacto -> Redirección WhatsApp
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const nombre = document.getElementById('nombre').value;
        const tipoEvento = document.getElementById('tipo_evento').value;
        const desc = document.getElementById('descripcion').value;

        // Número de teléfono de WhatsApp del producor (Incluir código país, sin +)
        const phone = "56978798057";

        const mensaje = `Hola Alejandra Producciones!
Mi nombre es *${nombre}*.
Me gustaría cotizar un evento tipo: *${tipoEvento}*.
Detalles: ${desc}`;

        const url = `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
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
    grids.forEach(g => { if(g) g.innerHTML = ''; });
    
    if(heroReelsContainer) heroReelsContainer.innerHTML = '';
    mocks.forEach(renderBentoItem);
    renderHeroReel(mocks[1]); // Renderizar el video de test de reels
}

// Inicializar la carga al cargar DOM
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('bento-grid-led') || bentoGrid) {
        fetchEventos();
    }

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
                const duration = 2000; // 2 segundos
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
