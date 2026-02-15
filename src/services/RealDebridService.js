"use strict";

const axios = require("axios");
const { URLSearchParams } = require("url");

class RealDebridService {
  constructor() {
    this.baseUrl = "https://api.real-debrid.com/rest/1.0";
  }

  /**
   * Resuelve un magnet link a un enlace de streaming directo usando Real-Debrid
   * @param {string} magnetLink - El enlace magnet
   * @param {string} token - Token de usuario (OAuth2 Access Token)
   * @returns {Promise<string|null>} URL de descarga directa o null si no está en caché
   */
  async resolveStream(magnetLink, token) {
    if (!token || !magnetLink) return null;

    const headers = { Authorization: `Bearer ${token}` };

    try {
      // 1. Añadir Magnet (Sube el torrent a la cuenta del usuario)
      // Endpoint: POST /torrents/addMagnet [4]
      const paramsAdd = new URLSearchParams();
      paramsAdd.append("magnet", magnetLink);
      
      const { data: addData } = await axios.post(
        `${this.baseUrl}/torrents/addMagnet`,
        paramsAdd,
        { headers }
      );
      
      const torrentId = addData.id;

      // 2. Seleccionar Archivos
      // Endpoint: POST /torrents/selectFiles/{id} [4]
      // Es obligatorio seleccionar archivos para que RD inicie la verificación.
      // "all" selecciona todos los archivos, forzando la comprobación de caché.
      const paramsSelect = new URLSearchParams();
      paramsSelect.append("files", "all");
      
      await axios.post(
        `${this.baseUrl}/torrents/selectFiles/${torrentId}`,
        paramsSelect,
        { headers }
      );

      // 3. Obtener Info del Torrent para verificar estado
      // Endpoint: GET /torrents/info/{id} [3]
      const { data: infoData } = await axios.get(
        `${this.baseUrl}/torrents/info/${torrentId}`,
        { headers }
      );

      // 4. Verificar si está en caché ("downloaded")
      // Si el estado es "downloaded", el archivo existe en los servidores de RD (Real de Bridge).
      // Si es "queued" o "downloading", se queda subido en la cuenta del usuario pero retornamos null.
      if (infoData.status === "downloaded" && infoData.links && infoData.links.length > 0) {
        
        // 5. Desbloquear el enlace (Unrestrict)
        // Endpoint: POST /unrestrict/link [2]
        // Tomamos el primer enlace disponible (generalmente el video principal).
        const paramsUnrestrict = new URLSearchParams();
        paramsUnrestrict.append("link", infoData.links);
        
        const { data: unrestrictData } = await axios.post(
          `${this.baseUrl}/unrestrict/link`,
          paramsUnrestrict,
          { headers }
        );

        return unrestrictData.download; // URL directa streamable
      }

      return null; 

    } catch (error) {
      // Manejo básico de errores (ej. Token inválido [7], Rate Limit [1])
      if (error.response) {
        console.error(`RD Error ${error.response.status}:`, error.response.data);
      } else {
        console.error("RD Connection Error:", error.message);
      }
      return null;
    }
  }
}

module.exports = { RealDebridService };