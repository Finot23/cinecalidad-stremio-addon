// services/RealDebridService.js
const { request } = require('undici'); // Usamos undici como cliente HTTP rápido

class RealDebridService {
    constructor() {
        this.baseUrl = 'https://api.real-debrid.com/rest/1.0';
    }

    /**
     * Desbloquea un enlace de CineCalidad usando Real-Debrid
     * Documentación: POST /unrestrict/link [2]
     */
    async unrestrictLink(link, apiToken) {
        if (!apiToken) {
            throw new Error('Real-Debrid API Token is required');
        }

        try {
            const { statusCode, body } = await request(`${this.baseUrl}/unrestrict/link`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiToken}`, // [3] Auth header standard
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: `link=${encodeURIComponent(link)}`
            });

            const data = await body.json();

            if (statusCode !== 200) {
                // Manejo de códigos de error de Real-Debrid (error 23 traffic, etc) [4, 5]
                console.error('Real-Debrid Error:', data);
                throw new Error(data.error || 'Failed to unrestrict link');
            }

            return data.download; // El enlace directo desbloqueado
        } catch (error) {
            console.error('Error contacting Real-Debrid:', error.message);
            return null;
        }
    }

    /**
     * Verifica si el token del usuario es válido
     * Documentación: GET /user [2]
     */
    async getUserInfo(apiToken) {
        try {
            const { statusCode, body } = await request(`${this.baseUrl}/user`, {
                headers: {
                    'Authorization': `Bearer ${apiToken}`
                }
            });
            return statusCode === 200 ? await body.json() : null;
        } catch (e) {
            return null;
        }
    }
}

module.exports = RealDebridService;