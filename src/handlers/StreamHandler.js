"use strict";

const logger = require("../../lib/logger");
const { createError, ErrorCodes } = require("../lib/errors");
const { CacheService } = require("../services/CacheService");
const { TorrentInfoService } = require("../services/TorrentInfoService");
// IMPORTAR EL NUEVO SERVICIO
const { RealDebridService } = require("../../services/RealDebridService");

class StreamHandler {
  constructor(dependencies) {
    this.database = dependencies.database;
    this.cineCalidadService = dependencies.cineCalidadService;
    this.torrentParserService = dependencies.torrentParserService;
    this.metadataService = dependencies.metadataService;
    this.cacheService = new CacheService(dependencies.database);
    this.torrentInfoService = new TorrentInfoService(dependencies);
    
    // INSTANCIAR EL SERVICIO
    this.realDebridService = dependencies.realDebridService || new RealDebridService(); 

    this.SUPPORTED_VIDEO_EXTENSIONS = new Set([
      "mp4", "mkv", "avi", "mov", "wmv", "flv", "m4v", "webm",
    ]);
    
    // ... (Mantener COUNTRY_WHITELIST y BINGE_GROUP_PREFIX igual que en fuente [9, 10])
    this.COUNTRY_WHITELIST = ["MX", "ES", "AR", "CO", "PE", "CL", "VE", "EC", "BO", "PY", "UY"];
    this.BINGE_GROUP_PREFIX = "cinecalidad-";
    this.handle = this.handle.bind(this);
  }

  // Modificamos handle para aceptar config de usuario (donde viene el token)
  async handle(args) {
    try {
      this._validateRequest(args);
      if (args.type !== "movie") return { streams: [] };

      // Extraer token de configuración (Stremio pasa esto en args.config)
      const userToken = args.config?.realDebridToken; 

      // ... (Lógica de caché de _validateRequest y _getMovieData se mantiene igual [11-15])
      const movieData = await this._getMovieData(args.id);
      if (!movieData) return { streams: [] };

      // Pasamos el token a _processStreams
      const streams = await this._processStreams(movieData, args.id, userToken);
      
      // ... (Resto del método handle igual [11, 12])
      return { streams };
    } catch (error) {
       // ... (Manejo de error igual [12])
       throw error;
    }
     // Ahora args.token EXISTE gracias al hack del index.js
    const rdToken = args.token; 

    // Cuando llames a procesar streams, pasa el token
    const streams = await this._processStreams(movieData, args.id, rdToken);

  }

  // ... (Métodos auxiliares _validateRequest, _generateCacheKey, _getMovieData, 
  // _fetchMovieData, _findRelease, etc. se mantienen idénticos a [12-19])

  /**
   * Process streams from movie data
   * ACTUALIZADO para usar RealDebridService
   */
  async _processStreams(movieData, id, userToken) {
    const { movieDetails } = movieData;
    if (!movieDetails?.downloadLinks?.length) return [];

    const streams = [];
    const { magnetLinks, nonMagnetLinks } = this._categorizeLinks(movieDetails.downloadLinks);

    // 1. LÓGICA REAL-DEBRID (Si el usuario tiene token)
    if (userToken && magnetLinks.length > 0) {
      logger.debug("Verificando Real-Debrid en paralelo", { count: magnetLinks.length });
      
      // Ejecución paralela usando el servicio
      const promises = magnetLinks.map(link => 
        this.realDebridService.resolveStream(link.url, userToken)
          .then(url => (url ? { url, name: link.name } : null))
      );

      const rdResults = await Promise.all(promises);

      // Agregar streams válidos de RD
      rdResults.forEach(result => {
        if (result) {
          streams.push({
            name: `⚡ RD [${this._extractQuality(result.name)}]`,
            title: result.name || "Real-Debrid Stream",
            url: result.url,
            behaviorHints: {
              bingeGroup: `${this.BINGE_GROUP_PREFIX}${this._getBingeGroupId(movieData, id)}`,
              notWebReady: false 
            }
          });
        }
      });
    }

    // 2. FALLBACK A P2P (Si no hay token o no se encontraron streams en caché RD)
    // Nota: Puedes decidir si mostrar ambos o solo RD. Aquí mostramos P2P si RD falla o no existe.
    if (streams.length === 0 && magnetLinks.length > 0) {
      const magnetStreams = await this._processMagnetLinks(magnetLinks, movieData, id);
      streams.push(...magnetStreams);
    }

    // 3. Agregar descargas directas HTTP (si existen)
    const downloadStreams = this._processDownloadLinks(nonMagnetLinks, movieData, id);
    streams.push(...downloadStreams);

    return streams;
  }

  // ... (El resto de métodos _categorizeLinks, _processMagnetLinks, _processDownloadLinks, etc. se mantienen igual [20-24])
}

module.exports = StreamHandler;