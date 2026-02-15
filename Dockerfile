FROM node:16-alpine

WORKDIR /app

# Copiamos archivos de dependencias
COPY package*.json ./

# Instalamos (esto leerá el package.json actualizado del paso 1)
RUN npm install --production

# Copiamos el código fuente
COPY . .

# Exponemos el puerto (debe coincidir con tu index.js)
ENV PORT=7000
EXPOSE 7000

# Arrancamos
CMD ["npm", "start"]