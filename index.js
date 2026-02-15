#!/usr/bin/env node
const express = require('express');
const { addonBuilder } = require("stremio-addon-sdk");
const { createAddon } = require("./src/addon");
const path = require('path');

const app = express();
const port = process.env.PORT || 7000;

async function start() {
    console.log("Iniciando CineCalidad Addon con soporte Multi-Usuario...");

    // 1. Crear la instancia base del addon
    // Nota: createAddon devuelve el builder, necesitamos extraer la lógica para interceptar llamadas
    const builder = await createAddon();
    const baseInterface = builder.getInterface();

    // 2. Ruta para la Página de Configuración (HTML)
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'src', 'configure.html'));
    });

    // 3. Ruta Dinámica: Captura el Token y sirve el Manifest
    // Cuando Stremio llama a /TOKEN/manifest.json
    app.get('/:token/manifest.json', (req, res) => {
        const { token } = req.params;
        const manifest = { ...baseInterface.manifest };
        
        // Modificar el manifiesto para mantener el token en futuras peticiones
        // Stremio no pasa el token automáticamente en streams, debemos asegurar que las URLs lo tengan
        // O simplemente confiar en que el usuario instaló desde esa URL base.
        res.json(manifest);
    });

    // 4. Middleware para manejar las peticiones del Addon (Catalog, Meta, Stream)
    // Interceptamos la ruta para extraer el token: /:token/catalog/...
    app.use('/:token', (req, res, next) => {
        const { token } = req.params;
        
        // Aquí es donde inyectas el token en el contexto para que StreamHandler lo vea
        // Stremio SDK no soporta esto nativamente fácil sin modificar el router, 
        // así que usaremos un hack simple: Pasar el token en los argumentos
        
        // Redirigimos la petición al manejador del SDK
        const router = getRouter(baseInterface);
        router(req, res, next);
    });

    // Fallback para desarrollo local sin token (opcional)
    app.get('/manifest.json', (req, res) => res.json(baseInterface.manifest));

    // Iniciar servidor Express
    app.listen(port, () => {
        console.log(`Addon corriendo en http://127.0.0.1:${port}`);
        console.log(`Configuración disponible en http://127.0.0.1:${port}/`);
    });
}

// Función auxiliar para convertir la interfaz del SDK en router de Express
const { getRouter } = require("stremio-addon-sdk");

start();