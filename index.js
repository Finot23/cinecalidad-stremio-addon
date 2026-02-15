"use strict";

const express = require("express");
const path = require("path");
const cors = require("cors");
const { getManifest } = require("./config/settings"); // Tu configuración actual
const CineCalidadAddon = require("./addon"); // Tu clase Addon principal

const app = express();
app.use(cors());

// Inicializar el Addon (Crea el DependencyContainer una sola vez)
// Asumimos que CineCalidadAddon devuelve la instancia del addonBuilder
const addonInterface = new CineCalidadAddon().getInterface();

// 1. RUTA PARA LA PÁGINA DE CONFIGURACIÓN (FRONTEND)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "src/web/configure.html"));
});

app.get("/configure", (req, res) => {
    res.sendFile(path.join(__dirname, "src/web/configure.html"));
});

// 2. MIDDLEWARE PARA RUTAS DINÁMICAS (CAPTURA EL TOKEN)
// Intercepta cualquier ruta que empiece con algo que parezca un token (alfanumérico largo)
app.use("/:token([a-zA-Z0-9]+)", (req, res, next) => {
    const token = req.params.token;

    // Validación básica: Si el token es una palabra reservada del addon, saltar
    if (["catalog", "meta", "stream", "configure", "resources"].includes(token)) {
        return next();
    }

    // Inyectamos el token en request para usarlo abajo
    req.rdToken = token;
    next();
});

// 3. MANEJO DEL MANIFEST.JSON
app.get("/:token/manifest.json", (req, res) => {
    const manifest = getManifest();
    
    // Opcional: Modificar la descripción para confirmar que está configurado
    if (req.rdToken) {
        manifest.description += " (Configurado con Real-Debrid)";
        manifest.behaviorHints = { configurable: true, configurationRequired: false };
    }

    res.json(manifest);
});

// 4. MANEJO DE LOS RECURSOS (Stream, Catalog, Meta)
// Esta función envuelve la llamada al addonInterface de Stremio
const handleResource = async (req, res) => {
    const { resource, type, id } = req.params;
    const token = req.rdToken; // El token capturado por el middleware

    // Construimos los argumentos para el handler
    // AQUÍ ES DONDE PASA LA MAGIA: Pasamos el token en config
    const args = {
        resource,
        type,
        id,
        extra: req.query, // Paginación, búsqueda, etc.
        config: { 
            realDebridToken: token // Esto llegará a StreamHandler.js -> handle(args)
        }
    };

    try {
        const response = await addonInterface.handle(args);
        
        // Cache headers recomendados por Stremio
        if (resource === 'stream') {
             res.setHeader('Cache-Control', 'max-age=86400'); // Cache streams 24h
        } else {
             res.setHeader('Cache-Control', 'max-age=3600'); // Cache otros 1h
        }
        
        res.json(response);
    } catch (error) {
        console.error(`Error handling request: ${error.message}`);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// Mapear rutas de Stremio a nuestro handler manual
app.get("/:token/:resource/:type/:id.json", handleResource);
// También soportar rutas sin token (para usuarios gratuitos o instalación limpia)
app.get("/:resource/:type/:id.json", (req, res) => {
    // Sin token en la URL
    req.rdToken = null; 
    handleResource(req, res);
});

// Iniciar servidor
const PORT = process.env.PORT || 7000;
app.listen(PORT, () => {
    console.log(`Addon activo en http://localhost:${PORT}`);
});