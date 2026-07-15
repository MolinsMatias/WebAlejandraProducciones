# 🌐 Web Alejandra Producciones

Landing page profesional para **Alejandra Producciones**, empresa de producción de eventos, arriendo de pistas de baile LED infinity, pistas ajedrez, iluminación y DJ en Santiago de Chile.

🔗 **URL:** [www.alejandraproducciones.cl](https://www.alejandraproducciones.cl)

---

## ✨ Características

### 🏠 Hero Section
- Título animado con acento dorado de marca
- Carrusel tipo **"abanico" (fan layout)** con los últimos eventos de Instagram/redes
  - Desktop: 7 tarjetas con efecto de rotación y escala
  - Mobile: carrusel horizontal con paginación (flechas + dots)
- Carga con skeletons instantáneos para evitar layout shift

### 🎯 Servicios
- 4 tarjetas con efecto **flip 3D** al hover/touch:
  - Pistas LED Infinity
  - Pistas de Ajedrez
  - Iluminación Profesional
  - DJ y Amplificación
- Cada tarjeta enlaza a la sección correspondiente del catálogo

### 📊 Contadores de Experiencia
- Animación de conteo ascendente (IntersectionObserver)
- +1700 eventos, 4 años de experiencia, +3000 asistentes

### 📸 Catálogo de Pistas de Baile
- **Contenido dinámico** desde Firebase Firestore (tiempo real con `onSnapshot`)
- **Categorías dinámicas** — pestañas generadas automáticamente desde `config/categorias`
- **Bento grid** responsive con diseño asimétrico
- **Barra de búsqueda** con filtro en tiempo real (nombre, recinto, tipo)
- **Filtros avanzados** — por recinto, tipo de evento y tamaño (m²)
- **Lightbox** con:
  - Navegación entre ítems (flechas ← →)
  - Álbum multi-imagen dentro de cada evento
  - Ubicación del evento
  - Botón CTA directo a WhatsApp para cotizar
- **Soporte YouTube** — embeds nativos para la sección de videos
- **Descarga PDF** — enlace al catálogo PDF (gestionado desde la app admin)

### 📞 Formulario de Contacto
- Campos: nombre, tipo de evento (Boda, Corporativo, 15 Años, Otro), descripción
- Envío directo a **WhatsApp** con mensaje pre-formateado

### 💬 Widget de WhatsApp Flotante
- Popup multi-contacto con 2 miembros del equipo:
  - **Alejandra** — Fundadora & Productora General
  - **Felipe Ibarra** — Ejecutivo Comercial
- Status online con animación de pulso

### 🦶 Footer
- Datos de contacto (teléfono y email)
- Año dinámico con JavaScript
- Crédito del desarrollador

---

## 🛠️ Stack Tecnológico

| Tecnología | Uso |
|---|---|
| **HTML5** | Estructura semántica |
| **CSS3** (Vanilla) | Estilos, animaciones, glassmorphism, responsive |
| **JavaScript** (ES Modules) | Lógica de la aplicación |
| **Firebase Firestore** | Base de datos en tiempo real (eventos, categorías, PDF) |
| **GSAP** (3.12.5) | Animaciones de scroll y entrada |
| **Google Fonts** (Inter) | Tipografía moderna |

---

## 📁 Estructura del Proyecto

```
WebAlejandraProducciones/
├── index.html              # Página principal (single page)
├── robots.txt              # Directivas para crawlers
├── sitemap.xml             # Sitemap para SEO
├── favicon.ico             # Favicon
├── css/
│   └── styles.css          # Todos los estilos (39 KB)
├── js/
│   ├── firebase-config.js  # Configuración de Firebase (Firestore)
│   ├── app.js              # Lógica principal (catálogo, lightbox, filtros, contacto)
│   └── social-cards.js     # Componente del carrusel fan de redes sociales
└── assets/
    ├── logo.svg            # Logo vectorial
    ├── logo.png            # Logo rasterizado
    ├── pista_bg.webp       # Background del hero (preloaded)
    ├── og-image.png        # Imagen para Open Graph / redes sociales
    ├── favicon.png         # Favicon PNG
    ├── card-infinity.webp  # Imagen servicio: Pistas LED
    ├── card-ajedrez.webp   # Imagen servicio: Pistas Ajedrez
    ├── card-iluminacion.webp # Imagen servicio: Iluminación
    └── card-dj.webp        # Imagen servicio: DJ
```

---

## 🔍 SEO y Performance

### Meta Tags
- Title tag descriptivo con keywords
- Meta description optimizada
- Open Graph (Facebook, WhatsApp) con imagen dedicada
- Twitter Card con imagen large
- Canonical URL

### Schema.org (Datos Estructurados)
- Tipo: `EventPlanning`
- Incluye: nombre, teléfono, email, dirección, horario, catálogo de servicios, redes sociales

### Optimización
- Imágenes en formato **WebP** (compresión superior)
- **Preload** del background del hero para mejorar LCP
- **Preconnect** a Google Fonts
- Skeletons HTML estáticos (zero-JS) para carga percibida instantánea
- `robots.txt` + `sitemap.xml` configurados

---

## 🔥 Conexión con Firebase

La web consume datos en **tiempo real** desde Firestore:

| Documento / Colección | Uso |
|---|---|
| `eventos` (colección) | Pistas, fotos de eventos y videos del catálogo |
| `config/categorias` | Pestañas dinámicas del catálogo |
| `config/catalogo` | URL del PDF descargable |

> El contenido se gestiona desde la **app móvil AP Admin** (ver proyecto `admin-app-alejandra-producciones`).

---

## 🚀 Despliegue

### Desarrollo local

Al ser HTML/CSS/JS estático, se puede servir con cualquier servidor local:

```bash
# Opción 1: Python
python -m http.server 8000

# Opción 2: Node.js (npx)
npx serve .

# Opción 3: VS Code Live Server
# Instalar extensión "Live Server" y hacer clic derecho → "Open with Live Server"
```

### Producción

El sitio se puede desplegar en cualquier hosting estático:
- **GitHub Pages**
- **Netlify**
- **Vercel**
- **Firebase Hosting**
- Hosting tradicional (cPanel, etc.)

Solo se necesita subir los archivos tal como están — no requiere build ni compilación.

---

## 🎨 Diseño

- **Paleta principal:** Negro (`#0a0a0a`) + Dorado (`#D4AF37`) + Blanco
- **Tipografía:** Inter (Google Fonts) — pesos 300, 400, 600, 700
- **Responsive:** Mobile-first, adaptado a todas las resoluciones
- **Efectos:** Glassmorphism en navbar, flip 3D en servicios, parallax en hero, animaciones con GSAP
- **Dark mode nativo** — diseño oscuro premium

---

## 👨‍💻 Desarrollado por

**Matias Molins** — [m.molins03@gmail.com](mailto:m.molins03@gmail.com)
