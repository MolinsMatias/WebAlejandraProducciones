const FAN_POSITIONS = [
    { rot: -21, scale: 0.7756, x: -22, y: 7.3, zIndex: 1 },
    { rot: -14, scale: 0.8498, x: -16, y: 4.0, zIndex: 2 },
    { rot: -7, scale: 0.9346, x: -8, y: 1.3, zIndex: 3 },
    { rot: 0, scale: 1.0, x: 0, y: 0.0, zIndex: 10 },
    { rot: 7, scale: 0.9346, x: 8, y: 1.3, zIndex: 3 },
    { rot: 14, scale: 0.8498, x: 16, y: 4.0, zIndex: 2 },
    { rot: 21, scale: 0.7756, x: 22, y: 7.3, zIndex: 1 },
];

export class SocialCards {
    constructor(containerSelector, paginationSelector, cardsData) {
        this.container = document.querySelector(containerSelector);
        this.pagination = document.querySelector(paginationSelector);
        this.cardsData = cardsData;

        this.MAX_VISIBLE = 7;
        this.HALF = 3;
        this.totalCards = cardsData.length;
        this.needsPagination = this.totalCards > this.MAX_VISIBLE;

        this.centerIndex = this.needsPagination ? this.HALF : (this.totalCards >> 1);

        this.isAnimating = false;
        this.hasEntered = false;
        this.direction = null;
        this.prevVisible = new Set();

        this.activeSlot = null;
        this.leaveTimer = null;
        this.cardElements = [];
        this.dots = [];
        this.visibleEntries = [];

        this.init();
    }

    /**
     * Genera una URL de thumbnail optimizada para el abanico.
     * - Firebase Storage: construye la URL del thumbnail generado por la extensión Resize Images
     *   (sufijo _400x400.webp en el mismo path).
     * - YouTube: usa thumbnail mqdefault (320×180).
     * - Otras URLs: retorna la original.
     */
    getThumbnailUrl(url, tipoArchivo) {
        if (!url) return url;

        // YouTube → usar thumbnail mqdefault (320×180)
        if (tipoArchivo === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
            const match = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*)/);
            if (match && match[1]) return `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg`;
        }

        // Firebase Storage → reemplazar extensión por _400x400.webp
        // URL formato puede ser firebasestorage.googleapis.com o [bucket].firebasestorage.app
        if (url.includes('firebasestorage.googleapis.com') || url.includes('storage.googleapis.com') || url.includes('firebasestorage.app')) {
            // Reemplazar la extensión en el path URL-encoded: file.jpg → file_400x400.webp
            // El path está entre /o/ y ?alt=media
            const thumbUrl = url.replace(
                /(%2F|\/)([^%2F/?]+)\.(jpg|jpeg|png|webp|gif)(?=\?)/i,
                '$1$2_400x400.webp?'
            ).replace('??', '?');

            // Si la URL cambió, retornar la versión thumbnail
            if (thumbUrl !== url) return thumbUrl;
        }

        return url;
    }

    init() {
        if (!this.container || this.totalCards === 0) return;

        // Build DOM — reset arrays for re-init
        this.container.innerHTML = '';
        this.cardElements = [];
        this.dots = [];
        this.prevVisible = new Set();
        const isMobile = window.innerWidth < 768;
        const centerIdx = this.needsPagination ? this.HALF : (this.totalCards >> 1);

        this.cardsData.forEach((card, index) => {
            const isVideo = card.urlImagen && (card.urlImagen.includes('.mp4') || card.urlImagen.includes('.mov') || card.urlImagen.includes('video') || card.tipoArchivo === 'video');
            const el = document.createElement(card.linkUrl ? 'a' : 'div');
            el.className = 'fan-card media-loading';
            if (card.linkUrl) {
                el.href = card.linkUrl;
                el.target = card.linkUrl.startsWith('http') ? '_blank' : '_self';
            }

            // Usar thumbnail si está disponible en los datos, sino usar la URL original
            const thumbUrl = card.urlThumbnail || this.getThumbnailUrl(card.urlImagen, card.tipoArchivo);

            let mediaEl;
            if (isVideo) {
                // Videos: NO autoplay ni preload hasta que sea visible — ahorra ancho de banda masivamente
                el.innerHTML = `<video preload="none" loop muted playsinline></video>`;
                mediaEl = el.querySelector('video');
            } else {
                // Imágenes: La tarjeta central es prioridad máxima (LCP)
                const isCenter = index === centerIdx;
                if (isCenter) {
                    el.innerHTML = `<img fetchpriority="high" alt="${card.alt || `Evento ${index + 1} - Alejandra Producciones`}">`;
                } else {
                    el.innerHTML = `<img decoding="async" alt="${card.alt || `Evento ${index + 1} - Alejandra Producciones`}">`;
                }
                mediaEl = el.querySelector('img');
            }

            // Guardar datos para carga diferida
            el._mediaData = {
                isVideo,
                fullUrl: card.urlImagen,
                thumbUrl: thumbUrl,
                mediaEl,
                index,
                loaded: false
            };

            this.container.appendChild(el);
            this.cardElements.push(el);
        });

        // Carga escalonada: centro primero, luego hacia afuera
        this._loadCardsProgressively(centerIdx, isMobile);

        // Setup Pagination DOM
        if (this.needsPagination && this.pagination) {
            this.pagination.style.display = 'flex';
            this.btnPrev = document.getElementById('fan-prev');
            this.btnNext = document.getElementById('fan-next');
            this.dotsContainer = document.getElementById('fan-dots');

            if (this.dotsContainer) {
                this.dotsContainer.innerHTML = '';
                for (let i = 0; i < this.totalCards; i++) {
                    const dot = document.createElement('button');
                    dot.className = 'fan-dot';
                    dot.addEventListener('click', () => {
                        if (this.isAnimating || i === this.centerIndex) return;
                        const diff = i - this.centerIndex;
                        this.direction = diff > 0 ? 'right' : 'left';
                        this.centerIndex = i;
                        this.updateCards();
                    });
                    this.dotsContainer.appendChild(dot);
                    this.dots.push(dot);
                }
            }

            if (this.btnPrev) this.btnPrev.onclick = () => this.cycle('left');
            if (this.btnNext) this.btnNext.onclick = () => this.cycle('right');
        } else if (this.pagination) {
            this.pagination.style.display = 'none';
        }

        this.bindEvents();

        // Trigger enter immediately to prevent flicker
        this.updateCards();
    }

    /**
     * Carga las imágenes/videos de forma escalonada desde el centro hacia los bordes.
     * La card central se carga primero (prioridad alta), luego las adyacentes
     * con un delay incremental de 150ms por posición.
     */
    _loadCardsProgressively(centerIdx, isMobile) {
        // En móvil, cargar las primeras 3 visibles inmediatamente, el resto con delay
        if (isMobile) {
            this.cardElements.forEach((el, i) => {
                const delay = i < 3 ? 0 : (i - 2) * 200;
                setTimeout(() => this._loadSingleCard(el), delay);
            });
            return;
        }

        // Desktop: cargar desde el centro hacia afuera
        // Orden: centro (0ms) → ±1 (150ms) → ±2 (300ms) → ±3 (450ms)
        const loadOrder = [];
        loadOrder.push({ el: this.cardElements[centerIdx], delay: 0 });

        for (let offset = 1; offset <= this.HALF; offset++) {
            const delayMs = offset * 150;
            if (centerIdx - offset >= 0) {
                loadOrder.push({ el: this.cardElements[centerIdx - offset], delay: delayMs });
            }
            if (centerIdx + offset < this.totalCards) {
                loadOrder.push({ el: this.cardElements[centerIdx + offset], delay: delayMs });
            }
        }

        loadOrder.forEach(({ el, delay }) => {
            if (!el) return;
            if (delay === 0) {
                this._loadSingleCard(el);
            } else {
                setTimeout(() => this._loadSingleCard(el), delay);
            }
        });
    }

    /**
     * Carga una sola card: asigna el src a la imagen/video y maneja el skeleton.
     * Si el thumbnail falla (imagen antigua sin thumbnail), hace fallback a la URL original.
     */
    _loadSingleCard(el) {
        const data = el._mediaData;
        if (!data || data.loaded) return;
        data.loaded = true;

        const { isVideo, fullUrl, thumbUrl, mediaEl } = data;
        const usesThumb = thumbUrl && thumbUrl !== fullUrl;

        const handleLoad = () => {
            el.classList.remove('media-loading');
            el.classList.add('media-ready');
        };

        if (isVideo) {
            mediaEl.src = fullUrl;
            mediaEl.autoplay = true;
            if (mediaEl.readyState >= 3) handleLoad();
            else mediaEl.addEventListener('loadeddata', handleLoad, { once: true });
        } else {
            // Si usamos thumbnail, agregar fallback al original en caso de error
            if (usesThumb) {
                mediaEl.addEventListener('error', () => {
                    // Thumbnail no existe (imagen antigua) → cargar original
                    mediaEl.src = fullUrl;
                    mediaEl.addEventListener('load', handleLoad, { once: true });
                    mediaEl.addEventListener('error', handleLoad, { once: true });
                }, { once: true });
                mediaEl.addEventListener('load', handleLoad, { once: true });
                mediaEl.src = thumbUrl;
            } else {
                mediaEl.src = fullUrl;
                if (mediaEl.complete && mediaEl.naturalWidth > 0) handleLoad();
                else {
                    mediaEl.addEventListener('load', handleLoad, { once: true });
                    mediaEl.addEventListener('error', handleLoad, { once: true });
                }
            }
        }
    }

    getResponsiveMultiplier(width) {
        if (width < 480) return 0.18;
        if (width < 640) return 0.28;
        if (width < 768) return 0.40;
        if (width < 1024) return 0.75;
        return 1.0;
    }

    getHeightMultiplier(width) {
        let idealPx;
        if (width < 480) idealPx = 22 * 16;
        else if (width < 640) idealPx = 26 * 16;
        else if (width < 768) idealPx = 28 * 16;
        else if (width < 1024) idealPx = 34 * 16;
        else idealPx = 38 * 16;

        const available = window.innerHeight * 0.7;
        if (available >= idealPx) return 1;
        return available / idealPx;
    }

    getSlotConfig(slotCount, slot) {
        if (slotCount >= this.MAX_VISIBLE) return FAN_POSITIONS[slot];
        const center = slotCount >> 1;
        const distance = slotCount > 1 ? (slot - center) / center : 0;
        const absDistance = Math.abs(distance);
        return {
            rot: distance * 21,
            scale: 1.0 - 0.2244 * absDistance * absDistance,
            x: distance * 22,
            y: absDistance * absDistance * 7.3,
            zIndex: 10 - Math.abs(slot - center),
        };
    }

    getVisibleMap(center) {
        const map = new Map();
        if (!this.needsPagination) {
            for (let i = 0; i < this.totalCards; i++) map.set(i, i);
            return map;
        }
        for (let slot = 0; slot < this.MAX_VISIBLE; slot++) {
            const idx = ((center + slot - this.HALF) % this.totalCards + this.totalCards) % this.totalCards;
            map.set(idx, slot);
        }
        return map;
    }

    cycle(direction) {
        if (this.isAnimating || !this.needsPagination) return;
        this.isAnimating = true;
        this.direction = direction;
        if (direction === 'right') {
            this.centerIndex = (this.centerIndex + 1) % this.totalCards;
        } else {
            this.centerIndex = (this.centerIndex - 1 + this.totalCards) % this.totalCards;
        }
        this.updateCards();
    }

    updateCards() {
        if (!this.container || !this.totalCards) return;
        if (typeof gsap === 'undefined') {
            console.error('GSAP no está cargado');
            return;
        }

        const isMobile = window.innerWidth < 768;
        if (isMobile) {
            this.container.classList.add('mobile-carousel-active');
            if (this.pagination) this.pagination.style.display = 'none';
            this.cardElements.forEach(card => gsap.set(card, { clearProps: "all" }));
            this.startMobileAutoPlay();
            return;
        } else {
            this.stopMobileAutoPlay();
            this.container.classList.remove('mobile-carousel-active');
            if (this.needsPagination && this.pagination) this.pagination.style.display = 'flex';
        }

        const visibleMap = this.getVisibleMap(this.centerIndex);
        const previouslyVisible = this.prevVisible;
        const direction = this.direction;
        const isFirstMount = !this.hasEntered;
        const width = window.innerWidth;
        const multiplier = this.getResponsiveMultiplier(width);
        const hMult = this.getHeightMultiplier(width);
        const slotCount = this.needsPagination ? this.MAX_VISIBLE : this.totalCards;

        if (isFirstMount) this.isAnimating = true;

        let completedCount = 0;
        const visibleCount = visibleMap.size;
        const onCardDone = () => {
            completedCount++;
            if (completedCount >= visibleCount) {
                this.isAnimating = false;
                if (isFirstMount) this.hasEntered = true;
            }
        };

        this.cardElements.forEach((card, cardIndex) => {
            const slot = visibleMap.get(cardIndex);
            const wasVisible = previouslyVisible.has(cardIndex);

            if (slot !== undefined) {
                const config = this.getSlotConfig(slotCount, slot);
                const target = {
                    x: `${config.x * multiplier}rem`,
                    y: `${config.y * hMult}rem`,
                    rotation: config.rot,
                    scale: config.scale,
                    opacity: 1,
                    zIndex: config.zIndex,
                };

                if (isFirstMount) {
                    gsap.set(card, target);
                    setTimeout(onCardDone, 50); // Pequeño delay para asegurar render
                } else if (!wasVisible) {
                    const enterX = direction === 'right' ? 40 : -40;
                    gsap.set(card, { x: `${enterX}rem`, y: `${config.y * hMult}rem`, rotation: direction === 'right' ? 30 : -30, scale: 0.5, opacity: 0 });
                    gsap.to(card, { ...target, duration: 0.6, ease: "power2.out", onComplete: onCardDone });
                } else {
                    gsap.to(card, { ...target, duration: 0.5, ease: "power2.out", onComplete: onCardDone });
                }
            } else if (wasVisible) {
                const exitX = direction === 'right' ? -40 : 40;
                gsap.to(card, { x: `${exitX}rem`, opacity: 0, scale: 0.5, rotation: direction === 'right' ? -30 : 30, duration: 0.4, ease: "power2.in", zIndex: 0 });
            } else if (isFirstMount) {
                gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 });
            }
        });

        this.prevVisible = new Set(visibleMap.keys());

        // Update dots
        if (this.needsPagination && this.dots.length > 0) {
            this.dots.forEach((dot, i) => {
                if (i === this.centerIndex) dot.classList.add('active');
                else dot.classList.remove('active');
            });
        }

        this.setupHoverEntries(visibleMap);
    }

    setupHoverEntries(visibleMap) {
        this.visibleEntries = [];
        this.cardElements.forEach((el, i) => {
            const slot = visibleMap.get(i);
            if (slot !== undefined) {
                this.visibleEntries.push({ el, slot });
            }
        });
        this.visibleEntries.sort((a, b) => a.slot - b.slot);
    }

    updateHoverLayout(hoveredSlot) {
        if (this.isAnimating) return;
        const width = window.innerWidth;
        if (width < 768) return; // En móvil se encarga el CSS nativo

        const mult = this.getResponsiveMultiplier(width);
        const hM = this.getHeightMultiplier(width);
        const centerSlot = this.visibleEntries.length >> 1;
        const slotCount = this.needsPagination ? this.MAX_VISIBLE : this.totalCards;

        this.visibleEntries.forEach(({ el, slot }) => {
            const base = this.getSlotConfig(slotCount, slot);
            let targetX = base.x * mult;
            let targetY = base.y * hM;
            let targetRot = base.rot;
            let targetScale = base.scale;
            let delay = 0;

            if (hoveredSlot !== null) {
                const distance = Math.abs(slot - hoveredSlot);
                delay = distance * 0.02;

                if (slot === hoveredSlot) {
                    targetY -= 2.5 * hM;
                    targetScale *= 1.08;
                } else {
                    const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
                    const pushStrength = 5.5 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));

                    if (slot < hoveredSlot) {
                        targetX -= pushStrength * mult;
                        targetRot -= 3 / (distance + 1);
                    } else {
                        targetX += pushStrength * mult;
                        targetRot += 3 / (distance + 1);
                    }

                    if (slot === this.visibleEntries.length - 1 && hoveredSlot < centerSlot) targetY -= 1 * hM;
                    if (slot === 0 && hoveredSlot > centerSlot) targetY -= 1 * hM;
                }
            } else {
                delay = Math.abs(slot - centerSlot) * 0.02;
            }

            gsap.to(el, {
                x: `${targetX}rem`, y: `${targetY}rem`, rotation: targetRot, scale: targetScale,
                duration: 0.5, delay, ease: "elastic.out(1,.75)", overwrite: "auto",
            });
            gsap.set(el, { zIndex: base.zIndex });
        });
    }

    bindEvents() {
        this.cardElements.forEach((el, i) => {
            el.addEventListener("mouseenter", () => {
                if (this.isAnimating) return;
                if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
                const slot = this.getVisibleMap(this.centerIndex).get(i);
                if (slot !== undefined && this.activeSlot !== slot) {
                    this.activeSlot = slot;
                    this.updateHoverLayout(slot);
                }
            });
        });

        this.container.addEventListener("mouseleave", () => {
            if (this.isAnimating) return;
            if (this.leaveTimer) clearTimeout(this.leaveTimer);
            this.leaveTimer = setTimeout(() => {
                this.activeSlot = null;
                this.updateHoverLayout(null);
            }, 50);
        });

        window.addEventListener("resize", () => {
            if (!this.isAnimating) this.updateHoverLayout(this.activeSlot);
        });

        // Pausar autoplay al tocar en móvil
        this.container.addEventListener('touchstart', () => {
            this.stopMobileAutoPlay();
            this.container.style.scrollSnapType = ''; // Restaurar el snapping manual
            this.container.style.scrollBehavior = '';
        }, { passive: true });
    }

    startMobileAutoPlay() {
        this.stopMobileAutoPlay();
        
        // Desactivar comportamientos CSS nativos conflictivos para dejar que GSAP controle
        this.container.style.scrollSnapType = 'none';
        this.container.style.scrollBehavior = 'auto';
        
        this.mobileInterval = setInterval(() => {
            if (!this.container.classList.contains('mobile-carousel-active')) return;
            
            const firstCard = this.container.firstElementChild;
            if (!firstCard) return;
            
            const cardWidth = firstCard.offsetWidth + 15; // width + gap
            const maxScroll = this.container.scrollWidth - this.container.clientWidth;
            
            if (this.container.scrollLeft >= maxScroll - 20) {
                // Modo loop infinito: mover la primera al final sin animacion
                this.container.appendChild(firstCard);
                this.container.scrollLeft -= cardWidth;
            }
            
            // GSAP tween customizado para una transición perfectamente suave
            const proxy = { x: this.container.scrollLeft };
            gsap.to(proxy, {
                x: this.container.scrollLeft + cardWidth,
                duration: 0.8,
                ease: "power2.inOut",
                onUpdate: () => {
                    this.container.scrollLeft = proxy.x;
                }
            });
        }, 2500);
    }

    stopMobileAutoPlay() {
        if (this.mobileInterval) {
            clearInterval(this.mobileInterval);
            this.mobileInterval = null;
        }
    }
}
