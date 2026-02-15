"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const { getManifest } = require("./src/config/settings"); // Ruta basada en repo [4]
const CineCalidadAddon = require("./src/addon"); 

const app = express();
app.use(cors());

// Inicializar el Addon (Dependency Container)
const addonInstance = new CineCalidadAddon();
// Obtenemos la interfaz del SDK (addonBuilder)
const addonInterface = addonInstance.getInterface();

// --- 1. FRONTEND DE CONFIGURACIÓN ---
// Sirve el HTML donde el usuario pega su token
app.get("/", (req, res) => {
    // Asegúrate de crear este archivo en src/web/configure.html
    res.sendFile(path.join(__dirname, "src/web/configure.html"));
});

app.get("/configure", (req, res) => {
    res.sendFile(path.join(__dirname, "src/web/configure.html"));
});

// --- 2. MIDDLEWARE DE EXTRACCIÓN DE TOKEN ---
// Captura el token de la URL: /TOKEN_DEL_USUARIO/stream/...
app.use((req, res, next) => {
    const parts = req.path.split("/");
    // El formato esperado es /:token/:resource/:type/:id.json
    // Si la primera parte parece un token (y no es un recurso reservado), lo capturamos.
    const potentialToken = parts[2];
    
    const reservedWords = ["manifest.json", "configure", "catalog", "meta", "stream", "resources", ""];
    
    if (potentialToken && !reservedWords.includes(potentialToken)) {
        req.rdToken = potentialToken;
    }
    next();
});

// --- 3. MANIFEST DINÁMICO ---
// Devuelve el manifiesto ajustado según si hay token o no
app.get("/:token?/manifest.json", (req, res) => {
    const manifest = getManifest();
    
    if (req.rdToken) {
        manifest.id += ".rd"; // ID único para evitar conflictos
        manifest.name += " (RD)";
        manifest.description += " | Configurado con Real-Debrid 🚀";
        // Importante: Indicar que ya está configurado
        manifest.behaviorHints = { configurable: true, configurationRequired: false };
    } else {
        manifest.behaviorHints = { configurable: true, configurationRequired: true };
    }
    
    res.json(manifest);
});

// --- 4. MANEJO DE REQUESTS DE STREMIO ---
// Convierte la petición HTTP de Express a la llamada del addonInterface
const handleStremioRequest = async (req, res) => {
    // Extraer parámetros de la URL (ej: /stream/movie/cc_123.json)
    // Nota: Si hay token, Express ya lo procesó en el middleware, pero necesitamos
    // ajustar los params porque la ruta cambia de longitud.
    
    // Regex para parsear limpiamente: /:token?/:resource/:type/:id.json
    const urlParts = req.path.replace(/^\/|\/$/g, '').split('/');
    let resource, type, id;

    if (req.rdToken) {
        // URL: /TOKEN/stream/movie/id.json
        [, resource, type, id] = urlParts;
    } else {
        // URL: /stream/movie/id.json
        [resource, type, id] = urlParts;
    }
    
    // Limpiar extensión .json del ID
    if (id && id.endsWith(".json")) id = id.replace(".json", "");

    if (!resource || !type || !id) return res.status(404).send("Not found");

    const args = {
        resource,
        type,
        id,
        extra: req.query,
        config: {
            // INYECCIÓN DEL TOKEN: Aquí pasamos el token al StreamHandler.js
            realDebridToken: req.rdToken 
        }
    };

    try {
        const response = await addonInterface.handle(args);
        
        // Cache headers recomendados
        if (resource === 'stream') res.setHeader('Cache-Control', 'max-age=86400'); 
        else res.setHeader('Cache-Control', 'max-age=3600'); 

        res.json(response);
    } catch (error) {
        console.error("Error handling request:", error);
        res.status(500).json({ error: "Internal Error" });
    }
};

// Rutas comodín para capturar las llamadas del addon
app.get("/:token?/:resource/:type/:id.json", handleStremioRequest);

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 7000;
app.listen(PORT, async () => {
    // Inicializar dependencias del addon (DB, Cache, etc.)
    try {
        await addonInstance.dependencyContainer.initialize();
        console.log(`✅ Addon Cinecalidad+RD corriendo en http://localhost:${PORT}`);
    } catch (err) {
        console.error("❌ Error inicializando addon:", err);
        process.exit(1);
    }
});