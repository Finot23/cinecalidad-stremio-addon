#!/usr/bin/env node
const express = require('express');
const { addonBuilder, getRouter } = require("stremio-addon-sdk"); // Importamos getRouter AQUÍ, al principio
const { createAddon } = require("./src/addon");
const path = require('path');

const app = express();

// Middleware de CORS (Esencial para Stremio Web)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

const port = process.env.PORT || 7000;

async function start() {
    console.log("Iniciando CineCalidad Addon con soporte Multi-Usuario...");

    // 1. Crear la instancia base del addon
    const builder = await createAddon();
    const baseInterface = builder.getInterface();

    // 2. Ruta para la Página de Configuración (HTML)
    app.get('/', (req, res) => {
        // Asegúrate de que el archivo configure.html existe en src/
        res.sendFile(path.join(__dirname, 'src', 'configure.html'));
    });

    // 3. Ruta Dinámica: Captura el Token y sirve el Manifest
    app.get('/:token/manifest.json', (req, res) => {
        const { token } = req.params;
        // Clonamos el manifiesto para no modificar el original
        const manifest = { ...baseInterface.manifest };
        
        // Opcional: Agregar información al manifiesto sobre la configuración actual
        manifest.description += " (Configurado con Real-Debrid)";
        
        res.json(manifest);
    });

    // 4. Middleware Principal: Intercepta las llamadas del addon
    app.use('/:token', (req, res, next) => {
        const { token } = req.params;

        // --- EL HACK PARA INYECTAR EL TOKEN ---
        // Creamos una copia superficial de la interfaz original
        const proxiedInterface = { ...baseInterface };

        // Sobrescribimos el manejador de 'stream' para inyectar el token en 'args'
        // Stremio SDK llama a stream(args), nosotros lo interceptamos
        proxiedInterface.stream = (args) => {
            // Inyectamos el token en los argumentos que recibe StreamHandler
            const argsWithToken = { ...args, token: token };
            
            // Llamamos al handler original con los nuevos argumentos
            return baseInterface.stream(argsWithToken);
        };

        // Hacemos lo mismo para 'catalog' y 'meta' si fuera necesario, 
        // pero principalmente lo necesitas en 'stream' para Real-Debrid.

        // Creamos un router temporal usando nuestra interfaz "trucada"
        const router = getRouter(proxiedInterface);
        
        // Pasamos la petición a este router
        router(req, res, next);
    });

    // Fallback para desarrollo local o rutas sin token
    app.get('/manifest.json', (req, res) => res.json(baseInterface.manifest));

    // Iniciar servidor Express
    app.listen(port, () => {
        console.log(`Addon corriendo en http://127.0.0.1:${port}`);
        console.log(`Configuración disponible en http://127.0.0.1:${port}/`);
    });
}

start();