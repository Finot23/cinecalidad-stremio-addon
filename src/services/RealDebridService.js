"use strict";

const axios = require("axios");
const Bottleneck = require("bottleneck");
const { URLSearchParams } = require("url");
const logger = require("../../lib/logger"); // Asumiendo estructura del repo [4]

class RealDebridService {
  constructor(cacheService) {
    this.baseUrl = "https://api.real-debrid.com/rest/1.0";
    this.cacheService = cacheService; // Inyectamos el servicio de caché

    // Limitador: Máximo 1 solicitud cada 250ms (aprox 240 req/min)
    // Esto previene el error 429 y bloqueos de IP [2]
    this.limiter = new Bottleneck({
      minTime: 250,
      maxConcurrent: 1
    });
  }

  /**
   * Resuelve un magnet respetando límites y caché
   */
  async resolveStream(magnetLink, token) {
    if (!token || !magnetLink) return null;

    // 1. VERIFICAR CACHÉ INTERNO (Evita llamar a la API si ya sabemos el resultado)
    // Usamos el hash del magnet como clave para ahorrar espacio
    const magnetHash = this._extractHash(magnetLink);
    const cacheKey = `rd_link:${magnetHash}`;
    
    if (this.cacheService) {
        const cachedUrl = await this.cacheService.get(cacheKey);
        if (cachedUrl) {
            logger.debug(`Cache HIT para magnet: ${magnetHash}`);
            return cachedUrl === "not_found" ? null : cachedUrl;
        }
    }

    // 2. EJECUTAR CON LIMITADOR DE VELOCIDAD
    // Envolvemos la lógica en el limiter.schedule
    return this.limiter.schedule(() => this._processApiCall(magnetLink, token, cacheKey));
  }

  async _processApiCall(magnetLink, token, cacheKey) {
    const headers = { Authorization: `Bearer ${token}` }; // [5]

    try {
        // A. Agregar Magnet [6]
        const paramsAdd = new URLSearchParams({ magnet: magnetLink });
        const { data: addData } = await axios.post(`${this.baseUrl}/torrents/addMagnet`, paramsAdd, { headers });
        const torrentId = addData.id;

        // B. Seleccionar Archivos [6]
        await axios.post(`${this.baseUrl}/torrents/selectFiles/${torrentId}`, new URLSearchParams({ files: "all" }), { headers });

        // C. Obtener Info [6]
        const { data: infoData } = await axios.get(`${this.baseUrl}/torrents/info/${torrentId}`, { headers });

        // D. Verificar si está descargado [2]
        if (infoData.status === "downloaded" && infoData.links && infoData.links.length > 0) {
            
            // E. Desbloquear (Unrestrict) [7]
            const paramsUnrestrict = new URLSearchParams({ link: infoData.links });
            const { data: unrestrictData } = await axios.post(`${this.baseUrl}/unrestrict/link`, paramsUnrestrict, { headers });
            
            // GUARDAR EN CACHÉ (Éxito - 24 horas)
            if (this.cacheService) {
                await this.cacheService.set(cacheKey, unrestrictData.download, 86400); 
            }
            
            return unrestrictData.download;
        }

        // Si no está descargado, cacheamos "not_found" por 1 hora para no reintentar inmediatamente
        if (this.cacheService) {
            await this.cacheService.set(cacheKey, "not_found", 3600);
        }
        return null;

    } catch (error) {
        // Manejo específico de Rate Limit [2]
        if (error.response?.status === 429) {
            logger.warn("Real-Debrid Rate Limit Hit - Pausing...");
        } else {
            logger.error("RD Error", { msg: error.message });
        }
        return null;
    }
  }

  _extractHash(magnetLink) {
    const match = magnetLink.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
    return match ? match[2] : magnetLink;
  }
}

module.exports = { RealDebridService };