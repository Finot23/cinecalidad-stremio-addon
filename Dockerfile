# 1. Usar Node 20 (o superior) como base, ya que tus dependencias lo exigen
FROM node:20-alpine

WORKDIR /app

# 2. Instalar herramientas necesarias para compilar better-sqlite3 (Python, make, g++)
# Alpine es muy ligero y no trae esto por defecto.
RUN apk add --no-cache python3 make g++

# 3. Copiar archivos de dependencias
COPY package*.json ./

# 4. Instalar dependencias
RUN npm install --production

# 5. Copiar el resto del código
COPY . .

# 6. Comando de inicio (asegúrate que coincida con lo que usas en package.json)
CMD ["npm", "start"]