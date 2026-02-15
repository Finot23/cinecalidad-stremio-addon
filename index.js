"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const { getManifest } = require("./src/config/settings"); // Ajusta la ruta si es necesario
const CineCalidadAddon = require("./src/addon"); // Ajusta la ruta a tu clase Addon

const app = express();
app.use(cors());

// Instanciamos tu Addon una vez
const addonInterface = new CineCalidadAddon().getInterface();

// 1. RUTA PRINCIPAL: Muestra la página de configuración
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "src/web/configure.html"));
});

app.get("/configure", (req, res) => {
    res.sendFile(path.join(__dirname, "src/web/configure.html"));
});

// 2. MIDDLEWARE: Captura el token de la URL
// Cualquier ruta que empiece por algo que no sea un recurso estático, lo tratamos como token
app.use("/:token", (req, res, next) => {
    const token = req.params.token;

    // Evitamos conflictos con archivos o rutas reservadas
    if (["configure", "favicon.ico", "catalog", "stream", "meta"].includes(token)) {
        return next();
    }

    // Guardamos el token en la request para usarlo después
    req.rdToken = token;
    next();
});

// 3. MANIFEST: Devuelve la info del addon
app.get("/:token/manifest.json", (req, res) => {
    const manifest = getManifest();
    
    // Personalizamos el manifiesto para confirmar que está configurado
    if (req.rdToken) {
        manifest.description = "✅ Configurado con Real-Debrid | " + manifest.description;
        // Importante: No requerimos configuración adicional en Stremio
        manifest.behaviorHints = { configurable: true, configurationRequired: false };
    }

    res.setHeader('Cache-Control', 'max-age=60'); // No cachear mucho para permitir reconfiguración
    res.json(manifest);
});

// 4. RECURSOS (Stream, Catalog, Meta): La lógica principal
// Esta función conecta Express con el SDK de Stremio
const handleRequest = async (req, res) => {
    const { resource, type, id } = req.params;
    
    // Construimos el objeto que tu StreamHandler.js espera
    const args = {
        resource,
        type,
        id,
        extra: req.query || {},
        config: {
            // ¡AQUÍ ESTÁ LA CLAVE! Pasamos el token capturado de la URL a tu código
            realDebridToken: req.rdToken 
        }
    };

    try {
        console.log(`Petición recibida: ${resource}/${type}/${id} [Token: ${req.rdToken ? 'SÍ' : 'NO'}]`);
        
        const response = await addonInterface.handle(args);
        
        // Headers de caché recomendados por Stremio
        if (resource === 'stream') {
             res.setHeader('Cache-Control', 'max-age=86400'); // 24h para streams
        } else {
             res.setHeader('Cache-Control', 'max-age=3600'); // 1h para catálogos/meta
        }

        res.json(response);

    } catch (error) {
        console.error("Error en handler:", error);
        res.status(500).json({ error: "Error interno del addon" });
    }
};

// Rutas con token (ej: /MI_TOKEN/stream/movie/cc_123.json)
app.get("/:token/:resource/:type/:id.json", handleRequest);

// Rutas sin token (por si alguien instala sin configurar, funcionará solo como catálogo)
app.get("/:resource/:type/:id.json", (req, res) => {
    req.rdToken = null;
    handleRequest(req, res);
});

// Inicio del servidor
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`🚀 Addon corriendo en http://localhost:${PORT}`);
    console.log(`   Configuración disponible en http://localhost:${PORT}/configure`);
});